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
import type { ResolvedConfig } from './config.js';
import {
  RateLimiter,
  validateJsonRpcRequest,
  searchParamsSchema,
  getPageParamsSchema,
  listContentParamsSchema,
  validateOrigin,
  validateApiKey,
  buildRateLimitKey,
} from './security.js';
import { MemoryCache } from './cache.js';
import { getLogger } from './logger.js';
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
  if (serialized.length > MAX_BODY_SIZE) {
    throw new Error('Request body too large');
  }
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
    this.log = (options?.logger || getLogger()).child({ module: 'mcp' });
  }

  getSecurityHeaders(): Record<string, string> {
    return { ...SECURITY_HEADERS };
  }

  getCorsHeaders(origin?: string): Record<string, string> {
    const headers: Record<string, string> = {};

    // When no origins are configured, allow all origins (open API).
    // When origins are configured, validate against the whitelist.
    if (this.config.security.allowedOrigins.length === 0) {
      headers['Access-Control-Allow-Origin'] = '*';
      headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
      headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-MCP-Key';
      headers['Access-Control-Max-Age'] = '86400';
    } else if (origin && validateOrigin(origin, this.config.security.allowedOrigins)) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
      headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-MCP-Key';
      headers['Access-Control-Max-Age'] = '86400';
    }
    return headers;
  }

  async checkRateLimit(
    clientIp: string,
    apiKey?: string,
  ): Promise<{ allowed: boolean; headers: Record<string, string> }> {
    const key = buildRateLimitKey(clientIp, apiKey);
    const result = await this.rateLimiter.check(key);
    const headers: Record<string, string> = {
      'X-RateLimit-Limit': String(this.config.security.rateLimit),
      'X-RateLimit-Remaining': String(result.remaining),
      'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
    };
    if (!result.allowed) {
      this.log.warn({ key: key.replace(/:.+/, ':***'), ip: clientIp }, 'rate_limit_exceeded');
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

  async handleRequest(body: unknown, clientIp?: string, apiKey?: string, options?: { skipRateLimit?: boolean }): Promise<JSONRPCResponse | null> {
    const start = Date.now();
    let requestId: string | number | null = null;
    let method = 'unknown';

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

      // JSON-RPC 2.0: notification = no response
      const isNotification = !('id' in (body as Record<string, unknown>));
      if (isNotification) {
        await this.dispatch(request);
        this.log.debug({ method, type: 'notification', durationMs: Date.now() - start }, 'request_handled');
        return null;
      }

      const result = await this.dispatch(request);
      const duration = Date.now() - start;
      this.log.info({ method, id: requestId, durationMs: duration, status: 'ok' }, 'request_handled');
      return result;
    } catch (err) {
      const duration = Date.now() - start;
      if (err instanceof z.ZodError) {
        this.log.warn({ method, durationMs: duration, error: 'invalid_request' }, 'request_failed');
        return this.errorResponse(requestId, JSONRPC_ERRORS.INVALID_REQUEST.code, 'Invalid JSON-RPC request');
      }
      if (err instanceof Error && (err.message === 'Request body too large' || err.message === 'JSON nesting too deep')) {
        this.log.warn({ method, durationMs: duration, error: err.message }, 'dos_rejected');
        return this.errorResponse(requestId, JSONRPC_ERRORS.INVALID_REQUEST.code, err.message);
      }
      this.log.error({ method, durationMs: duration, error: err instanceof Error ? err.message : 'unknown' }, 'request_error');
      return this.errorResponse(requestId, JSONRPC_ERRORS.INTERNAL_ERROR.code, 'Internal error');
    }
  }

  private async dispatch(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    const { method, params, id } = request;

    switch (method) {
      case 'initialize':
        return this.handleInitialize(id);
      case 'notifications/initialized':
        return this.successResponse(id ?? null, {});
      case 'ping':
        return this.successResponse(id ?? null, {});
      case 'tools/list':
        return this.handleListTools(id);
      case 'tools/call':
        return this.handleCallTool(params, id);
      case 'resources/list':
        return this.handleListResources(id);
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

  private handleInitialize(id?: string | number | null): JSONRPCResponse {
    this.log.info('mcp_initialized');
    return this.successResponse(id ?? null, {
      protocolVersion: '2025-11-25',
      capabilities: {
        tools: {},
        resources: {},
      },
      serverInfo: {
        name: 'corsen-context',
        version: '1.1.0',
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
      return this.errorResponse(id ?? null, JSONRPC_ERRORS.INVALID_PARAMS.code, 'Missing tool name');
    }

    const toolName = params.name;
    const toolArgs = (params.arguments || {}) as Record<string, unknown>;

    if (!this.config.mcp.tools.includes(toolName)) {
      return this.errorResponse(
        id ?? null,
        JSONRPC_ERRORS.METHOD_NOT_FOUND.code,
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
          break;
        }
        case 'list_content': {
          const parsed = listContentParamsSchema.parse(toolArgs);
          result = await this.listContent(parsed.type, parsed.page, parsed.limit);
          break;
        }
        case 'get_sitemap': {
          result = await this.getSitemap();
          break;
        }
        default:
          return this.errorResponse(id ?? null, JSONRPC_ERRORS.METHOD_NOT_FOUND.code, `Unknown tool: ${toolName}`);
      }

      this.log.debug({ tool: toolName, durationMs: Date.now() - toolStart }, 'tool_called');

      return this.successResponse(id ?? null, {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return this.errorResponse(id ?? null, JSONRPC_ERRORS.INVALID_PARAMS.code, 'Invalid tool parameters');
      }
      this.log.error({ tool: toolName, error: err instanceof Error ? err.message : 'unknown' }, 'tool_error');
      return this.errorResponse(id ?? null, JSONRPC_ERRORS.INTERNAL_ERROR.code, 'Tool execution failed');
    }
  }

  private async handleListResources(id?: string | number | null): Promise<JSONRPCResponse> {
    const pages = await this.provider.getPages();
    const resources = pages.map((p) => {
      // Preserve full path + query params (e.g., /search?id=4)
      const parsed = new URL(p.url);
      const pathWithQuery = parsed.pathname + parsed.search;
      return {
        uri: `resource://${pathWithQuery.replace(/^\//, '')}`,
        name: p.title,
        description: p.description,
        mimeType: 'text/markdown',
      };
    });

    return this.successResponse(id ?? null, { resources });
  }

  private async handleReadResource(
    params: Record<string, unknown> | undefined,
    id?: string | number | null,
  ): Promise<JSONRPCResponse> {
    if (!params || typeof params.uri !== 'string') {
      return this.errorResponse(id ?? null, JSONRPC_ERRORS.INVALID_PARAMS.code, 'Missing resource URI');
    }

    const uri = params.uri as string;
    const pathWithQuery = uri.replace('resource://', '');
    const siteUrl = this.config.siteUrl.replace(/\/$/, '');
    const pageUrl = `${siteUrl}/${pathWithQuery}`;

    const content = await this.provider.getPageContent(pageUrl);
    if (!content) {
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
    return this.cache.get<T>(key);
  }

  private async cacheSet<T>(key: string, value: T): Promise<void> {
    if (!this.cacheEnabled) return;
    await this.cache.set(key, value, this.config.cache.ttl);
  }

  async searchSite(query: string, limit: number = 10) {
    const cacheKey = `search:${query}:${limit}`;
    const cached = await this.cacheGet<unknown>(cacheKey);
    if (cached) return cached;

    const results = await this.provider.searchContent(query, limit);
    await this.cacheSet(cacheKey, results);
    return results;
  }

  async getPageContent(uri: string) {
    const cacheKey = `page:${uri}`;
    const cached = await this.cacheGet<unknown>(cacheKey);
    if (cached) return cached;

    const content = await this.provider.getPageContent(uri);
    if (content) {
      await this.cacheSet(cacheKey, content);
    }
    return content;
  }

  async listContent(type: string, page: number = 1, limit: number = 20) {
    const cacheKey = `list:${type}:${page}:${limit}`;
    const cached = await this.cacheGet<unknown>(cacheKey);
    if (cached) return cached;

    const allPages = await this.provider.getPages();
    const filtered = allPages.filter((p) => p.type === type);
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

    await this.cacheSet(cacheKey, result);
    return result;
  }

  async getSitemap() {
    const cacheKey = 'sitemap';
    const cached = await this.cacheGet<unknown>(cacheKey);
    if (cached) return cached;

    const pages = await this.provider.getPages();
    const sitemap = pages.map((p) => ({
      url: p.url,
      title: p.title,
      type: p.type,
      lastModified: p.lastModified,
    }));

    await this.cacheSet(cacheKey, sitemap);
    return sitemap;
  }

  // --- Tool Definitions ---

  getToolDefinitions(): MCPToolDefinition[] {
    const tools: MCPToolDefinition[] = [];

    if (this.config.mcp.tools.includes('search_site')) {
      tools.push({
        name: 'search_site',
        description: 'Search site content by keyword. Returns matching pages with snippets.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            limit: { type: 'number', description: 'Max results (1-50, default 10)' },
          },
          required: ['query'],
        },
      });
    }

    if (this.config.mcp.tools.includes('get_page_content')) {
      tools.push({
        name: 'get_page_content',
        description: 'Get full page content as clean markdown with metadata (title, description, dates).',
        inputSchema: {
          type: 'object',
          properties: {
            uri: { type: 'string', description: 'Page URL or resource URI' },
          },
          required: ['uri'],
        },
      });
    }

    if (this.config.mcp.tools.includes('list_content')) {
      tools.push({
        name: 'list_content',
        description: 'List content by type (page, post, product) with pagination.',
        inputSchema: {
          type: 'object',
          properties: {
            type: { type: 'string', description: 'Content type (e.g., post, page, product, or any custom type)' },
            page: { type: 'number', description: 'Page number (default 1)' },
            limit: { type: 'number', description: 'Items per page (1-100, default 20)' },
          },
        },
      });
    }

    if (this.config.mcp.tools.includes('get_sitemap')) {
      tools.push({
        name: 'get_sitemap',
        description: 'Get structured sitemap of the entire site with URLs, titles, types, and dates.',
        inputSchema: {
          type: 'object',
          properties: {},
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

  private errorResponse(id: string | number | null, code: number, message: string): JSONRPCResponse {
    return { jsonrpc: '2.0', error: { code, message }, id };
  }
}
