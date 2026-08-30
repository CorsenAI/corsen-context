import {
  CorsenContext,
  MCP_PROTOCOL_VERSION,
  MAX_BODY_SIZE,
  SECURITY_HEADERS,
  generateWebMCPScript,
  toWebMCPTools,
  type CorsenContextConfig,
  type ContentProvider,
  type CacheDriver,
  type RateLimitStore,
  type Logger,
} from '@corsenai/corsen-context';

/**
 * Optional production wiring for the Astro handlers — inject the same
 * distributed cache, rate-limit store, and logger the core supports.
 */
export interface HandlerOptions {
  cache?: CacheDriver;
  rateLimitStore?: RateLimitStore;
  logger?: Logger;
}

/**
 * The subset of Astro's APIContext the handlers use. `clientAddress` is the real
 * socket peer address the Astro server adapter resolves — better than a header
 * guess for rate limiting.
 */
export interface AstroContext {
  request: Request;
  clientAddress?: string;
}

function createInstanceFactory(
  config: CorsenContextConfig,
  provider: ContentProvider,
  cache?: CacheDriver,
): () => CorsenContext {
  let instance: CorsenContext | undefined;
  return () => {
    instance ??= new CorsenContext(config, provider, cache);
    return instance;
  };
}

function mcpNotFound(): Response {
  return new Response(null, { status: 404, headers: { ...SECURITY_HEADERS } });
}

function isJsonRpcResponse(body: unknown): boolean {
  return (
    !!body &&
    typeof body === 'object' &&
    !Array.isArray(body) &&
    !('method' in body) &&
    ('result' in body || 'error' in body)
  );
}

function getClientIp(context: AstroContext, trustProxy: boolean): string {
  if (trustProxy) {
    const cfIp = context.request.headers.get('cf-connecting-ip');
    if (cfIp) return cfIp.trim();
    const realIp = context.request.headers.get('x-real-ip');
    if (realIp) return realIp.trim();
    const xff = context.request.headers.get('x-forwarded-for');
    if (xff) {
      const first = xff.split(',')[0]?.trim();
      if (first) return first;
    }
  }
  // Astro resolves the real socket address for us.
  return context.clientAddress || 'unknown';
}

function getApiKey(request: Request): string | undefined {
  return (
    request.headers.get('x-mcp-key') ||
    request.headers.get('authorization')?.replace('Bearer ', '') ||
    undefined
  );
}

function hasUnsupportedJsonEncoding(request: Request): boolean {
  const contentType = request.headers.get('content-type') || '';
  const charset = /(?:^|;)\s*charset\s*=\s*"?([^";\s]+)/i.exec(contentType)?.[1];
  if (charset && !['utf-8', 'utf8'].includes(charset.toLowerCase())) return true;

  const contentEncoding = (request.headers.get('content-encoding') || 'identity').toLowerCase();
  return contentEncoding !== 'identity';
}

/** Bounded body read: aborts once MAX_BODY_SIZE bytes are consumed. */
async function readBoundedText(request: Request): Promise<string | null> {
  const body = request.body;
  if (!body || typeof body.getReader !== 'function') {
    const text = await request.text();
    return new TextEncoder().encode(text).length > MAX_BODY_SIZE ? null : text;
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > MAX_BODY_SIZE) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

/**
 * Creates an Astro API route handler for the MCP endpoint (GET/POST/OPTIONS
 * on /v1/mcp). GET returns 405 with Allow: POST because this stateless JSON
 * transport does not implement an SSE stream.
 *
 * Usage (src/pages/v1/mcp.ts):
 * ```ts
 * import { createMCPHandler } from '@corsenai/corsen-context-astro';
 * import { siteProvider } from '../../lib/corsen-provider';
 *
 * export const { GET, POST, OPTIONS } = createMCPHandler(
 *   { siteUrl: import.meta.env.SITE ?? 'https://example.com' },
 *   siteProvider,
 * );
 * ```
 */
export function createMCPHandler(
  config: CorsenContextConfig,
  provider: ContentProvider,
  options?: HandlerOptions,
): {
  GET: (context: AstroContext) => Promise<Response>;
  POST: (context: AstroContext) => Promise<Response>;
  OPTIONS: (context: AstroContext) => Promise<Response>;
} {
  const trustProxy = config.security?.trustProxy ?? false;
  const getInstance = createInstanceFactory(config, provider, options?.cache);

  function createServer(instance: CorsenContext) {
    return instance.createMCPServer({
      rateLimitStore: options?.rateLimitStore,
      logger: options?.logger,
    });
  }

  async function POST(context: AstroContext): Promise<Response> {
    const { request } = context;
    const instance = getInstance();
    if (!instance.getConfig().mcp.enabled) {
      return mcpNotFound();
    }
    const server = createServer(instance);

    const headers = new Headers();
    for (const [key, value] of Object.entries(server.getSecurityHeaders())) {
      headers.set(key, value);
    }
    headers.set('Content-Type', 'application/json');

    const origin = request.headers.get('origin') || undefined;
    if (!server.validateRequestOrigin(origin)) {
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Invalid Origin' },
          id: null,
        }),
        { status: 403, headers },
      );
    }
    for (const [key, value] of Object.entries(server.getCorsHeaders(origin))) {
      headers.set(key, value);
    }

    const contentType = (request.headers.get('content-type') || '')
      .split(';', 1)[0]
      ?.trim()
      .toLowerCase();
    if (contentType !== 'application/json') {
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Content-Type must be application/json' },
          id: null,
        }),
        { status: 415, headers },
      );
    }
    if (hasUnsupportedJsonEncoding(request)) {
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Unsupported JSON encoding' },
          id: null,
        }),
        { status: 415, headers },
      );
    }

    const accept = (request.headers.get('accept') || '').toLowerCase();
    if (accept && !accept.includes('application/json') && !accept.includes('*/*')) {
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Client must accept application/json' },
          id: null,
        }),
        { status: 406, headers },
      );
    }

    const clientIp = getClientIp(context, trustProxy);
    const apiKey = getApiKey(request);

    // Rate limit before auth so unauthenticated clients cannot brute-force the
    // API key or hammer the endpoint unthrottled.
    const rateLimit = await server.checkRateLimit(clientIp, apiKey);
    for (const [key, value] of Object.entries(rateLimit.headers)) {
      headers.set(key, value);
    }
    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Rate limit exceeded' },
          id: null,
        }),
        { status: 429, headers },
      );
    }

    if (!server.checkAuth(apiKey)) {
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Unauthorized' },
          id: null,
        }),
        { status: 401, headers },
      );
    }

    const raw = await readBoundedText(request);
    if (raw === null) {
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32600, message: 'Request body too large' },
          id: null,
        }),
        { status: 413, headers },
      );
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32700, message: 'Parse error' },
          id: null,
        }),
        { status: 400, headers },
      );
    }

    if (isJsonRpcResponse(body)) {
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32600, message: 'JSON-RPC responses are not accepted' },
          id: null,
        }),
        { status: 400, headers },
      );
    }

    const method =
      body && typeof body === 'object' && !Array.isArray(body)
        ? (body as Record<string, unknown>).method
        : undefined;
    if (typeof method === 'string' && method !== 'initialize') {
      const requestedVersion = request.headers.get('mcp-protocol-version') || '2025-03-26';
      if (requestedVersion !== MCP_PROTOCOL_VERSION) {
        return new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Unsupported MCP-Protocol-Version' },
            id: null,
          }),
          { status: 400, headers },
        );
      }
    }

    const result = await server.handleRequest(body, clientIp, apiKey, { skipRateLimit: true });
    if (result === null) {
      return new Response(null, { status: 202, headers });
    }
    return new Response(JSON.stringify(result), { status: 200, headers });
  }

  async function OPTIONS(context: AstroContext): Promise<Response> {
    const instance = getInstance();
    if (!instance.getConfig().mcp.enabled) {
      return mcpNotFound();
    }
    const server = createServer(instance);
    const headers = new Headers();
    for (const [key, value] of Object.entries(server.getSecurityHeaders())) {
      headers.set(key, value);
    }
    const origin = context.request.headers.get('origin') || undefined;
    if (!server.validateRequestOrigin(origin)) {
      return new Response(null, { status: 403, headers });
    }
    for (const [key, value] of Object.entries(server.getCorsHeaders(origin))) {
      headers.set(key, value);
    }
    return new Response(null, { status: 204, headers });
  }

  async function GET(context: AstroContext): Promise<Response> {
    const instance = getInstance();
    if (!instance.getConfig().mcp.enabled) {
      return mcpNotFound();
    }
    const server = createServer(instance);
    const headers = new Headers(server.getSecurityHeaders());
    headers.set('Allow', 'POST');
    const origin = context.request.headers.get('origin') || undefined;
    if (!server.validateRequestOrigin(origin)) {
      return new Response(null, { status: 403, headers });
    }
    return new Response(null, { status: 405, headers });
  }

  return { GET, POST, OPTIONS };
}

/** Creates an Astro GET handler that serves /llms.txt. */
export function createLlmsTxtHandler(
  config: CorsenContextConfig,
  provider: ContentProvider,
  options?: HandlerOptions,
) {
  const getInstance = createInstanceFactory(config, provider, options?.cache);
  return async function GET(): Promise<Response> {
    const instance = getInstance();
    if (!instance.getConfig().static.generateLlmsTxt) {
      return mcpNotFound();
    }
    const text = await instance.generateLlmsTxt();
    const headers = new Headers(SECURITY_HEADERS);
    headers.set('Content-Type', 'text/plain; charset=utf-8');
    headers.set('Cache-Control', 'public, max-age=3600, s-maxage=3600');
    return new Response(text, { status: 200, headers });
  };
}

/** Creates an Astro GET handler that serves /llms-full.txt. */
export function createLlmsFullTxtHandler(
  config: CorsenContextConfig,
  provider: ContentProvider,
  options?: HandlerOptions,
) {
  const getInstance = createInstanceFactory(config, provider, options?.cache);
  return async function GET(): Promise<Response> {
    const instance = getInstance();
    if (
      !instance.getConfig().static.generateLlmsTxt ||
      !instance.getConfig().static.includeFullContent
    ) {
      return mcpNotFound();
    }
    const text = await instance.generateLlmsFullTxt();
    const headers = new Headers(SECURITY_HEADERS);
    headers.set('Content-Type', 'text/plain; charset=utf-8');
    headers.set('Cache-Control', 'public, max-age=3600, s-maxage=3600');
    return new Response(text, { status: 200, headers });
  };
}

/**
 * Creates an Astro GET handler that serves the WebMCP bridge script.
 *
 * Mount it on a route (e.g. `src/pages/webmcp.js.ts`) and load it with
 * `<script src="/webmcp.js" defer></script>`: the page then registers the
 * same tools the MCP endpoint serves with an agent running inside the page,
 * through document.modelContext. Every execute() calls back into the MCP
 * endpoint, so the browser never reimplements a tool.
 */
export function createWebMCPScriptHandler(
  config: CorsenContextConfig,
  provider: ContentProvider,
  options?: HandlerOptions,
) {
  const getInstance = createInstanceFactory(config, provider, options?.cache);
  return async function GET(): Promise<Response> {
    const instance = getInstance();
    if (!instance.getConfig().mcp.enabled) {
      return mcpNotFound();
    }
    const server = instance.createMCPServer();
    const script = generateWebMCPScript(toWebMCPTools(server.getToolDefinitions()), {
      mcpEndpoint: config.mcp?.endpoint,
    });
    const headers = new Headers(SECURITY_HEADERS);
    headers.set('Content-Type', 'application/javascript; charset=utf-8');
    headers.set('Cache-Control', 'public, max-age=3600, s-maxage=3600');
    return new Response(script, { status: 200, headers });
  };
}
