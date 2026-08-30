import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { z } from 'zod';
import type {
  ContentProvider,
  JSONRPCRequest,
  JSONRPCResponse,
  MCPCapabilities,
  MCPToolDefinition,
  CacheDriver,
  RateLimitStore,
} from './types.js';
import { JSONRPC_ERRORS, SECURITY_HEADERS } from './types.js';
import { CORSEN_CONTEXT_VERSION, MCP_PROTOCOL_VERSION } from './version.js';
import type { ResolvedConfig } from './config.js';
import {
  RateLimiter,
  validateJsonRpcRequest,
  initializeParamsSchema,
  searchParamsSchema,
  getPageParamsSchema,
  listContentParamsSchema,
  getSitemapParamsSchema,
  validateOrigin,
  validateApiKey,
  buildRateLimitKey,
} from './security.js';
import { MemoryCache } from './cache.js';
import { getLogger } from './logger.js';
import {
  filterPublicPages,
  filterPublicSearchResults,
  isPublicListItem,
  isPublicPageContent,
  resolvePublicPageUrl,
} from './content-policy.js';
import type pino from 'pino';

/** Current API version */
export const API_VERSION = 'v1';

/** Maximum JSON-RPC request body size in bytes (100 KB) */
export const MAX_BODY_SIZE = 100 * 1024;

/** Maximum JSON nesting depth */
export const MAX_JSON_DEPTH = 10;

/** Request timeout in milliseconds */
export const REQUEST_TIMEOUT_MS = 8000;

export function validateBodySize(body: unknown): void {
  const serialized = JSON.stringify(body);
  if (typeof serialized === 'string' && Buffer.byteLength(serialized, 'utf8') > MAX_BODY_SIZE) {
    throw new Error('Request body too large');
  }
}

/** Keep shared cache entries isolated when an owner changes exposure policy. */
export function cachePolicyNamespace(config: ResolvedConfig): string {
  const policy = JSON.stringify({
    siteUrl: new URL(config.siteUrl).href,
    postTypes: [...config.content.postTypes].sort(),
    excludePaths: [...config.content.excludePaths].sort(),
    maxPages: config.content.maxPages,
  });
  return `policy:${createHash('sha256').update(policy).digest('hex').slice(0, 16)}:`;
}

function checkJsonDepth(obj: unknown, currentDepth: number = 0): void {
  if (currentDepth > MAX_JSON_DEPTH) {
    throw new Error('JSON nesting too deep');
  }
  if (obj && typeof obj === 'object') {
    for (const value of Object.values(obj as Record<string, unknown>)) {
      checkJsonDepth(value, currentDepth + 1);
    }
  }
}

export class MCPServer {
  private config: ResolvedConfig;
  private provider: ContentProvider;
  private rateLimiter: RateLimiter;
  private cache: CacheDriver;
  private cacheNamespace: string;
  private log: pino.Logger;

  constructor(
    config: ResolvedConfig,
    provider: ContentProvider,
    options?: {
      cache?: CacheDriver;
      rateLimitStore?: RateLimitStore;
      logger?: pino.Logger;
    },
  ) {
    this.config = config;
    this.provider = provider;
    this.rateLimiter = new RateLimiter(
      config.security.rateLimit,
      config.security.burstLimit,
      options?.rateLimitStore,
    );
    this.cache = options?.cache || new MemoryCache();
    this.cacheNamespace = cachePolicyNamespace(config);
    this.log = (options?.logger || getLogger()).child({ module: 'mcp' });
  }

  getSecurityHeaders(): Record<string, string> {
    return { ...SECURITY_HEADERS };
  }

  getCorsHeaders(origin?: string): Record<string, string> {
    const headers: Record<string, string> = {};

    if (origin && this.validateRequestOrigin(origin)) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
      headers['Access-Control-Allow-Headers'] =
        'Accept, Content-Type, Authorization, X-MCP-Key, MCP-Protocol-Version';
      headers['Access-Control-Max-Age'] = '86400';
      // The response body depends on the request Origin — signal shared caches
      // so they don't serve one origin's CORS headers to another.
      headers['Vary'] = 'Origin';
    }
    return headers;
  }

  /**
   * Validate a browser Origin for the Streamable HTTP endpoint.
   *
   * Non-browser clients commonly omit Origin and remain accepted. When an
   * Origin is present, MCP requires validation to prevent DNS rebinding. The
   * canonical site origin is always allowed; operators can add explicit
   * browser origins through security.allowedOrigins.
   */
  validateRequestOrigin(origin?: string): boolean {
    if (!origin) return true;
    const allowed = [new URL(this.config.siteUrl).origin, ...this.config.security.allowedOrigins];
    return validateOrigin(origin, allowed);
  }

  async checkRateLimit(
    clientIp: string,
    apiKey?: string,
  ): Promise<{ allowed: boolean; headers: Record<string, string> }> {
    // A caller-supplied key only earns a separate bucket after it validates
    // against the configured key. Public endpoints and invalid-key attempts
    // always share the IP bucket, so rotating arbitrary header values cannot
    // bypass throttling.
    const validConfiguredKey =
      this.config.security.apiKey && validateApiKey(apiKey, this.config.security.apiKey)
        ? apiKey
        : undefined;
    const key = buildRateLimitKey(clientIp, validConfiguredKey);
    const result = await this.rateLimiter.check(key);
    const headers: Record<string, string> = {
      'X-RateLimit-Limit': String(this.config.security.rateLimit),
      'X-RateLimit-Remaining': String(result.remaining),
      'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
    };
    if (!result.allowed) {
      // Log a hashed IP for correlation without storing raw client addresses.
      const ipHash = createHash('sha256').update(clientIp).digest('hex').slice(0, 12);
      this.log.warn({ key: key.replace(/:.+/, ':***'), ipHash }, 'rate_limit_exceeded');
      if (result.retryAfter) {
        headers['Retry-After'] = String(result.retryAfter);
      }
    }
    return { allowed: result.allowed, headers };
  }

  checkAuth(apiKeyHeader?: string): boolean {
    const valid = validateApiKey(apiKeyHeader, this.config.security.apiKey);
    if (!valid && this.config.security.apiKey) {
      this.log.warn({ provided: !!apiKeyHeader }, 'auth_failed');
    }
    return valid;
  }

  async handleRequest(
    body: unknown,
    clientIp?: string,
    apiKey?: string,
    options?: { skipRateLimit?: boolean },
  ): Promise<JSONRPCResponse | null> {
    const start = Date.now();
    let requestId: string | number | null = null;
    let method = 'unknown';

    // Owner revocation is the outermost gate. Keep it ahead of validation,
    // authentication, rate limiting and dispatch so a disabled MCP surface
    // cannot touch the provider or consume a rate-limit bucket, even when the
    // server is used directly instead of through an HTTP adapter.
    if (!this.config.mcp.enabled) {
      if (body && typeof body === 'object' && !Array.isArray(body)) {
        const candidateId = (body as Record<string, unknown>).id;
        if (typeof candidateId === 'string' || typeof candidateId === 'number') {
          requestId = candidateId;
        }
      }
      return this.errorResponse(requestId, -32003, 'MCP is disabled by the site owner');
    }

    try {
      // DoS protection
      validateBodySize(body);
      checkJsonDepth(body);

      const request = validateJsonRpcRequest(body);
      requestId = request.id ?? null;
      method = request.method;

      // Rate limit — BEFORE notification check to prevent abuse via id-less requests
      // Skip if already checked by the adapter (e.g., Next.js handler)
      if (clientIp && !options?.skipRateLimit) {
        const limit = await this.checkRateLimit(clientIp, apiKey);
        if (!limit.allowed) {
          return this.errorResponse(requestId, -32000, 'Rate limit exceeded');
        }
      }

      if (!this.checkAuth(apiKey)) {
        return this.errorResponse(requestId, JSONRPC_ERRORS.UNAUTHORIZED.code, 'Unauthorized');
      }

      // JSON-RPC 2.0: notification = no response
      const isNotification = !('id' in (body as Record<string, unknown>));
      if (isNotification) {
        await this.dispatch(request);
        this.log.debug(
          { method, type: 'notification', durationMs: Date.now() - start },
          'request_handled',
        );
        return null;
      }

      const result = await this.dispatch(request);
      const duration = Date.now() - start;
      this.log.info(
        { method, id: requestId, durationMs: duration, status: 'ok' },
        'request_handled',
      );
      return result;
    } catch (err) {
      const duration = Date.now() - start;
      if (err instanceof z.ZodError) {
        this.log.warn({ method, durationMs: duration, error: 'invalid_request' }, 'request_failed');
        return this.errorResponse(
          requestId,
          JSONRPC_ERRORS.INVALID_REQUEST.code,
          'Invalid JSON-RPC request',
        );
      }
      if (
        err instanceof Error &&
        (err.message === 'Request body too large' || err.message === 'JSON nesting too deep')
      ) {
        this.log.warn({ method, durationMs: duration, error: err.message }, 'dos_rejected');
        return this.errorResponse(requestId, JSONRPC_ERRORS.INVALID_REQUEST.code, err.message);
      }
      this.log.error(
        { method, durationMs: duration, error: err instanceof Error ? err.message : 'unknown' },
        'request_error',
      );
      return this.errorResponse(requestId, JSONRPC_ERRORS.INTERNAL_ERROR.code, 'Internal error');
    }
  }

  private async dispatch(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    const { method, params, id } = request;

    switch (method) {
      case 'initialize':
        return this.handleInitialize(params, id);
      case 'notifications/initialized':
        return this.successResponse(id ?? null, {});
      case 'ping':
        return this.successResponse(id ?? null, {});
      case 'tools/list':
        return this.handleListTools(id);
      case 'tools/call':
        return this.handleCallTool(params, id);
      case 'resources/list':
        return this.handleListResources(params, id);
      case 'resources/read':
        return this.handleReadResource(params, id);
      default:
        return this.errorResponse(
          id ?? null,
          JSONRPC_ERRORS.METHOD_NOT_FOUND.code,
          `Method not found: ${method}`,
        );
    }
  }

  private handleInitialize(
    params: Record<string, unknown> | undefined,
    id?: string | number | null,
  ): JSONRPCResponse {
    const parsed = initializeParamsSchema.safeParse(params);
    if (!parsed.success) {
      return this.errorResponse(
        id ?? null,
        JSONRPC_ERRORS.INVALID_PARAMS.code,
        'Invalid initialize parameters',
      );
    }

    this.log.info('mcp_initialized');
    // Version negotiation: echo the client's requested protocol version when we
    // support it, otherwise fall back to ours (MCP lets the client decide
    // whether to proceed after seeing the server's version).
    const requested = parsed.data.protocolVersion;
    const protocolVersion = requested === MCP_PROTOCOL_VERSION ? requested : MCP_PROTOCOL_VERSION;

    return this.successResponse(id ?? null, {
      protocolVersion,
      capabilities: {
        tools: {},
        resources: {},
      },
      serverInfo: {
        name: 'corsen-context',
        version: CORSEN_CONTEXT_VERSION,
      },
    });
  }

  private handleListTools(id?: string | number | null): JSONRPCResponse {
    return this.successResponse(id ?? null, {
      tools: this.getToolDefinitions(),
    });
  }

  private async handleCallTool(
    params: Record<string, unknown> | undefined,
    id?: string | number | null,
  ): Promise<JSONRPCResponse> {
    if (!params || typeof params.name !== 'string') {
      return this.errorResponse(
        id ?? null,
        JSONRPC_ERRORS.INVALID_PARAMS.code,
        'Missing tool name',
      );
    }

    const toolName = params.name;
    // Missing arguments are equivalent to an empty object for tools whose
    // entire input is optional. Every supplied value still goes through its
    // strict schema, so null, false, arrays and unknown properties are rejected.
    const toolArgs: unknown = params.arguments === undefined ? {} : params.arguments;

    // `arguments` itself is defined as an object by CallToolRequest. Violating
    // that outer request shape is a protocol error; values inside a valid
    // object are the tool's input and use CallToolResult.isError below.
    if (toolArgs === null || typeof toolArgs !== 'object' || Array.isArray(toolArgs)) {
      return this.errorResponse(
        id ?? null,
        JSONRPC_ERRORS.INVALID_PARAMS.code,
        'Tool arguments must be an object',
      );
    }

    if (!this.config.mcp.tools.includes(toolName)) {
      return this.errorResponse(
        id ?? null,
        JSONRPC_ERRORS.INVALID_PARAMS.code,
        `Tool not found: ${toolName}`,
      );
    }

    try {
      const toolStart = Date.now();
      let result: unknown;

      switch (toolName) {
        case 'search_site': {
          const parsed = searchParamsSchema.parse(toolArgs);
          result = await this.searchSite(parsed.query, parsed.limit);
          break;
        }
        case 'get_page_content': {
          const parsed = getPageParamsSchema.parse(toolArgs);
          result = await this.getPageContent(parsed.uri);
          if (!result) {
            return this.toolErrorResponse(
              id ?? null,
              'Resource not found or not exposed. Use a URL returned by search_site, list_content, or get_sitemap.',
            );
          }
          break;
        }
        case 'list_content': {
          const parsed = listContentParamsSchema.parse(toolArgs);
          result = await this.listContent(parsed.type, parsed.page, parsed.limit);
          break;
        }
        case 'get_sitemap': {
          getSitemapParamsSchema.parse(toolArgs);
          result = await this.getSitemap();
          break;
        }
        default:
          return this.errorResponse(
            id ?? null,
            JSONRPC_ERRORS.INVALID_PARAMS.code,
            `Unknown tool: ${toolName}`,
          );
      }

      this.log.debug({ tool: toolName, durationMs: Date.now() - toolStart }, 'tool_called');

      return this.successResponse(id ?? null, {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        isError: false,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        const issue = err.issues[0];
        const field = issue && issue.path.length > 0 ? ` for "${issue.path.join('.')}"` : '';
        const detail = issue?.message || 'input does not match the published schema';
        return this.toolErrorResponse(id ?? null, `Invalid tool parameters${field}: ${detail}`);
      }
      this.log.error(
        { tool: toolName, error: err instanceof Error ? err.message : 'unknown' },
        'tool_error',
      );
      return this.errorResponse(
        id ?? null,
        JSONRPC_ERRORS.INTERNAL_ERROR.code,
        'Tool execution failed',
      );
    }
  }

  /** Page size for resources/list cursor pagination. */
  private static readonly RESOURCES_PAGE_SIZE = 100;

  private async handleListResources(
    params: Record<string, unknown> | undefined,
    id?: string | number | null,
  ): Promise<JSONRPCResponse> {
    const pages = filterPublicPages(await this.provider.getPages(), this.config);

    const all = pages.flatMap((p) => {
      let parsed: URL;
      try {
        // Base against siteUrl so providers may return relative URLs (e.g. "/about")
        // without throwing — the content policy already accepts them.
        parsed = new URL(p.url, this.config.siteUrl);
      } catch {
        return []; // Skip an unparseable item rather than failing the whole call.
      }
      // Preserve full path + query params (e.g., /search?id=4)
      const pathWithQuery = parsed.pathname + parsed.search;
      return [
        {
          uri: `resource://${pathWithQuery.replace(/^\//, '')}`,
          name: p.title,
          description: p.description,
          mimeType: 'text/markdown',
        },
      ];
    });

    // Cursor pagination (MCP): cursor is an opaque base64 offset.
    const pageSize = MCPServer.RESOURCES_PAGE_SIZE;
    const offset = this.decodeCursor(params?.cursor);
    if (offset === null) {
      return this.errorResponse(id ?? null, JSONRPC_ERRORS.INVALID_PARAMS.code, 'Invalid cursor');
    }
    const slice = all.slice(offset, offset + pageSize);
    const nextOffset = offset + pageSize;
    const result: { resources: typeof slice; nextCursor?: string } = { resources: slice };
    if (nextOffset < all.length) {
      result.nextCursor = Buffer.from(String(nextOffset)).toString('base64');
    }

    return this.successResponse(id ?? null, result);
  }

  private decodeCursor(cursor: unknown): number | null {
    if (cursor === undefined) return 0;
    if (typeof cursor !== 'string' || cursor.length === 0) return null;

    const value = Buffer.from(cursor, 'base64').toString('utf8');
    if (!/^(0|[1-9]\d*)$/.test(value)) return null;
    if (Buffer.from(value).toString('base64') !== cursor) return null;

    const decoded = Number(value);
    return Number.isSafeInteger(decoded) && decoded >= 0 ? decoded : null;
  }

  private async handleReadResource(
    params: Record<string, unknown> | undefined,
    id?: string | number | null,
  ): Promise<JSONRPCResponse> {
    if (
      !params ||
      typeof params.uri !== 'string' ||
      params.uri.trim().length === 0 ||
      Array.from(params.uri).length > 2000
    ) {
      return this.errorResponse(
        id ?? null,
        JSONRPC_ERRORS.INVALID_PARAMS.code,
        'Invalid resource URI',
      );
    }

    const uri = params.uri as string;
    const pageUrl = resolvePublicPageUrl(uri, this.config);
    if (!pageUrl) {
      return this.errorResponse(id ?? null, -32002, 'Resource not found');
    }

    const content = await this.provider.getPageContent(pageUrl);
    if (!content || !isPublicPageContent(content, this.config)) {
      return this.errorResponse(id ?? null, -32002, 'Resource not found');
    }

    return this.successResponse(id ?? null, {
      contents: [
        {
          uri,
          mimeType: 'text/markdown',
          text: content.markdown,
        },
      ],
    });
  }

  // --- Tool Implementations ---

  private get cacheEnabled(): boolean {
    return this.config.cache.enabled;
  }

  private async cacheGet<T>(key: string): Promise<T | null> {
    if (!this.cacheEnabled) return null;
    return this.cache.get<T>(`${this.cacheNamespace}${key}`);
  }

  private async cacheSet<T>(key: string, value: T): Promise<void> {
    if (!this.cacheEnabled) return;
    await this.cache.set(`${this.cacheNamespace}${key}`, value, this.config.cache.ttl);
  }

  /**
   * Drop the cached body for a single page URL. Call this from your CMS's
   * publish/update/delete hooks. Aggregate surfaces are intentionally read
   * through so an unpublished URL is not retained behind an unenumerable key.
   */
  async invalidatePage(url: string): Promise<void> {
    const pageUrl = resolvePublicPageUrl(url, this.config);
    if (pageUrl) await this.cache.delete(`${this.cacheNamespace}page:${pageUrl}`);
  }

  /**
   * Clear all cached page bodies. Cache drivers that cannot prove a complete
   * purge reject instead of reporting success.
   */
  async clearCache(): Promise<void> {
    await this.cache.clear();
  }

  async searchSite(query: string, limit: number = 10) {
    return filterPublicSearchResults(
      await this.provider.searchContent(query, limit),
      this.config,
      limit,
    );
  }

  async getPageContent(uri: string) {
    const pageUrl = resolvePublicPageUrl(uri, this.config);
    if (!pageUrl) return null;

    const cacheKey = `page:${pageUrl}`;
    const cached = await this.cacheGet<unknown>(cacheKey);
    if (cached !== null) return cached;

    const content = await this.provider.getPageContent(pageUrl);
    if (content && isPublicPageContent(content, this.config)) {
      await this.cacheSet(cacheKey, content);
      return content;
    }
    return null;
  }

  async listContent(type: string, page: number = 1, limit: number = 20) {
    // Filter by type before applying the owner's exposure cap. This avoids
    // unrelated content types consuming the allowance while ensuring the
    // list_content surface cannot paginate beyond content.maxPages.
    const publicPages = (await this.provider.getPages()).filter((p) =>
      isPublicListItem(p, this.config),
    );
    const filtered = publicPages
      .filter((p) => p.type === type)
      .slice(0, this.config.content.maxPages);
    const total = filtered.length;
    const start = (page - 1) * limit;
    const items = filtered.slice(start, start + limit);

    const result = {
      items,
      total,
      page,
      limit,
      hasMore: start + limit < total,
    };

    return result;
  }

  async getSitemap() {
    const pages = filterPublicPages(await this.provider.getPages(), this.config);
    return pages.map((p) => ({
      url: p.url,
      title: p.title,
      type: p.type,
      lastModified: p.lastModified,
    }));
  }

  // --- Tool Definitions ---

  getToolDefinitions(): MCPToolDefinition[] {
    const tools: MCPToolDefinition[] = [];

    if (this.config.mcp.tools.includes('search_site')) {
      tools.push({
        name: 'search_site',
        description:
          "Search this site's public content by keyword and get matching pages with titles, URLs and text snippets. Use this first when the user asks about something on this site and you do not know which page covers it. Read-only: returns content, never changes anything.",
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              minLength: 1,
              maxLength: 500,
              description:
                "Keywords to search for, in the site's own language. Use the user's words.",
            },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 50,
              default: 10,
              description: 'Maximum number of results to return (1-50, default 10).',
            },
          },
          required: ['query'],
          additionalProperties: false,
        },
      });
    }

    if (this.config.mcp.tools.includes('get_page_content')) {
      tools.push({
        name: 'get_page_content',
        description:
          'Read one page of this site in full, as clean markdown with its title, description and dates. Use this after search_site or get_sitemap to read a specific page. Read-only.',
        inputSchema: {
          type: 'object',
          properties: {
            uri: {
              type: 'string',
              minLength: 1,
              maxLength: 2000,
              description:
                "The page's absolute URL on this site, exactly as returned by search_site, list_content or get_sitemap.",
            },
          },
          required: ['uri'],
          additionalProperties: false,
        },
      });
    }

    if (this.config.mcp.tools.includes('list_content')) {
      tools.push({
        name: 'list_content',
        description:
          "Browse this site's public content by type (e.g. page, post, product) with pagination. Use to enumerate what the site publishes when a keyword search is too narrow. Read-only.",
        inputSchema: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              minLength: 1,
              maxLength: 50,
              default: 'page',
              description:
                'The content type to list: post, page, product, or any custom type the site exposes.',
            },
            page: {
              type: 'integer',
              minimum: 1,
              maximum: 5000,
              default: 1,
              description: 'Result page number (1-5000, default 1).',
            },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 100,
              default: 20,
              description: 'Items per page (1-100, default 20).',
            },
          },
          additionalProperties: false,
        },
      });
    }

    if (this.config.mcp.tools.includes('get_sitemap')) {
      tools.push({
        name: 'get_sitemap',
        description:
          "Get a bounded structured sitemap of this site's public content, with each exposed URL's title, type and last-modified date, up to the owner's configured content limit. Use for a broad overview of what the site exposes to agents. Read-only.",
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
      });
    }

    return tools;
  }

  getCapabilities(): MCPCapabilities {
    return {
      tools: this.getToolDefinitions(),
      resources: [],
    };
  }

  // --- Response Helpers ---

  private successResponse(id: string | number | null, result: unknown): JSONRPCResponse {
    return { jsonrpc: '2.0', result, id };
  }

  private toolErrorResponse(id: string | number | null, message: string): JSONRPCResponse {
    return this.successResponse(id, {
      content: [{ type: 'text', text: message }],
      isError: true,
    });
  }

  private errorResponse(
    id: string | number | null,
    code: number,
    message: string,
  ): JSONRPCResponse {
    return { jsonrpc: '2.0', error: { code, message }, id };
  }
}
