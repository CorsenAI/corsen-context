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
 * Optional production wiring for the Next.js handlers — inject the same
 * distributed cache, rate-limit store, and logger the core supports (e.g. Redis
 * on Vercel/multi-instance).
 */
export interface HandlerOptions {
  cache?: CacheDriver;
  rateLimitStore?: RateLimitStore;
  logger?: Logger;
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

function getClientIp(request: Request, trustProxy: boolean): string {
  // Forwarding headers are only trustworthy behind a reverse proxy that sets
  // them. When untrusted, they are attacker-controllable and would let a client
  // land in a fresh rate-limit bucket per request — so we ignore them.
  if (trustProxy) {
    const cfIp = request.headers.get('cf-connecting-ip');
    if (cfIp) return cfIp.trim();

    const realIp = request.headers.get('x-real-ip');
    if (realIp) return realIp.trim();

    const xff = request.headers.get('x-forwarded-for');
    if (xff) {
      const first = xff.split(',')[0]?.trim();
      if (first) return first;
    }
  }

  // Web `Request` exposes no socket address. A global fallback bucket is
  // deliberately fail-closed: attacker-controlled headers cannot rotate it.
  // Production deployments should use a trusted edge proxy and enable
  // security.trustProxy so legitimate clients receive per-IP buckets.
  return 'unknown';
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

/**
 * Creates a Next.js App Router handler for the MCP endpoint (GET/POST/OPTIONS
 * on /v1/mcp).
 *
 * Implements the stateless JSON response subset of MCP Streamable HTTP
 * 2025-11-25, including:
 * - initialize, ping, notifications/initialized
 * - tools/list, tools/call
 * - resources/list, resources/read
 * - JSON-RPC 2.0 notification handling (202 Accepted when id is absent)
 * - Rate limiting, CORS, API key auth, security headers
 *
 * SSE, resumability, and session identifiers are not implemented. GET on the
 * MCP endpoint therefore returns 405 with Allow: POST, as the transport
 * specification permits when the server does not offer an SSE stream.
 *
 * Usage (App Router - app/v1/mcp/route.ts):
 * ```ts
 * import { createMCPHandler } from '@corsenai/corsen-context-nextjs';
 *
 * const { GET, POST, OPTIONS } = createMCPHandler({
 *   siteUrl: 'https://example.com',
 * }, myProvider);
 *
 * export { GET, POST, OPTIONS };
 * ```
 */
export function createMCPHandler(
  config: CorsenContextConfig,
  provider: ContentProvider,
  options?: HandlerOptions,
): {
  GET: (request: Request) => Promise<Response>;
  POST: (request: Request) => Promise<Response>;
  OPTIONS: (request: Request) => Promise<Response>;
} {
  const trustProxy = config.security?.trustProxy ?? false;
  const getInstance = createInstanceFactory(config, provider, options?.cache);

  function createServer(instance: CorsenContext) {
    return instance.createMCPServer({
      rateLimitStore: options?.rateLimitStore,
      logger: options?.logger,
    });
  }

  async function POST(request: Request): Promise<Response> {
    const instance = getInstance();
    if (!instance.getConfig().mcp.enabled) {
      return mcpNotFound();
    }
    const server = createServer(instance);

    // Security headers
    const headers = new Headers();
    for (const [key, value] of Object.entries(server.getSecurityHeaders())) {
      headers.set(key, value);
    }
    headers.set('Content-Type', 'application/json');

    // CORS
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

    // Extract client identity
    const clientIp = getClientIp(request, trustProxy);
    const apiKey = getApiKey(request);

    // Rate limit FIRST (before auth) so unauthenticated clients cannot
    // brute-force the API key or hammer the endpoint unthrottled — matches core.
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

    // Auth check
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

    // Enforce the body-size cap on actual bytes read (not a spoofable
    // Content-Length header), aborting the stream once the cap is exceeded.
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

    // null result = accepted JSON-RPC notification (no id).
    if (result === null) {
      return new Response(null, { status: 202, headers });
    }
    return new Response(JSON.stringify(result), { status: 200, headers });
  }

  async function OPTIONS(request: Request): Promise<Response> {
    const instance = getInstance();
    if (!instance.getConfig().mcp.enabled) {
      return mcpNotFound();
    }
    const server = createServer(instance);

    const headers = new Headers();
    for (const [key, value] of Object.entries(server.getSecurityHeaders())) {
      headers.set(key, value);
    }
    const origin = request.headers.get('origin') || undefined;
    if (!server.validateRequestOrigin(origin)) {
      return new Response(null, { status: 403, headers });
    }
    for (const [key, value] of Object.entries(server.getCorsHeaders(origin))) {
      headers.set(key, value);
    }

    return new Response(null, { status: 204, headers });
  }

  async function GET(request: Request): Promise<Response> {
    const instance = getInstance();
    if (!instance.getConfig().mcp.enabled) {
      return mcpNotFound();
    }
    const server = createServer(instance);
    const headers = new Headers(server.getSecurityHeaders());
    headers.set('Allow', 'POST');
    const origin = request.headers.get('origin') || undefined;
    if (!server.validateRequestOrigin(origin)) {
      return new Response(null, { status: 403, headers });
    }
    return new Response(null, { status: 405, headers });
  }

  return { GET, POST, OPTIONS };
}

/**
 * Creates the legacy endpoint-discovery event stream used by pre-Streamable
 * HTTP integrations. It is not an MCP transport: it lives on a separate URL,
 * emits no JSON-RPC messages, and must not be mounted as GET on the MCP
 * endpoint. New integrations should use createMCPHandler, whose same-endpoint
 * GET returns 405 until Streamable HTTP SSE is implemented.
 *
 * @deprecated Kept only for existing 1.x integrations. New scaffolds do not
 * create this route.
 *
 * Legacy usage (App Router - app/v1/mcp/sse/route.ts):
 * ```ts
 * import { createSSEHandler } from '@corsenai/corsen-context-nextjs';
 * export const GET = createSSEHandler({ siteUrl: 'https://example.com' });
 * ```
 */
export function createSSEHandler(
  config: CorsenContextConfig,
  provider?: ContentProvider,
  options?: HandlerOptions,
) {
  const trustProxy = config.security?.trustProxy ?? false;
  // A no-op provider is enough to build a server for auth + rate-limit gating
  // when the caller only wants the discovery stream.
  const gateProvider: ContentProvider = provider ?? {
    async getPages() {
      return [];
    },
    async getPageContent() {
      return null;
    },
    async searchContent() {
      return [];
    },
  };
  const getInstance = createInstanceFactory(config, gateProvider, options?.cache);

  return async function GET(request: Request): Promise<Response> {
    // Gate the persistent connection behind auth + rate limiting so it can't be
    // opened unauthenticated/unthrottled (each connection holds a keep-alive).
    const instance = getInstance();
    if (!instance.getConfig().mcp.enabled) {
      return mcpNotFound();
    }
    const siteUrl = config.siteUrl.replace(/\/$/, '');
    const mcpEndpoint = `${siteUrl}${instance.getConfig().mcp.endpoint}`;
    const server = instance.createMCPServer({
      rateLimitStore: options?.rateLimitStore,
      logger: options?.logger,
    });
    const origin = request.headers.get('origin') || undefined;
    if (!server.validateRequestOrigin(origin)) {
      return new Response('invalid origin', { status: 403, headers: { ...SECURITY_HEADERS } });
    }
    const apiKey = getApiKey(request);
    const clientIp = getClientIp(request, trustProxy);

    const rl = await server.checkRateLimit(clientIp, apiKey);
    if (!rl.allowed) {
      return new Response('rate limit exceeded', {
        status: 429,
        headers: { ...SECURITY_HEADERS, 'Retry-After': rl.headers['Retry-After'] || '60' },
      });
    }
    if (!server.checkAuth(apiKey)) {
      return new Response('unauthorized', { status: 401, headers: { ...SECURITY_HEADERS } });
    }

    const headers = new Headers({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      ...SECURITY_HEADERS,
    });
    // Override Cache-Control from SECURITY_HEADERS for SSE
    headers.set('Cache-Control', 'no-cache');

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        // Send the MCP endpoint URL as the initial event
        controller.enqueue(encoder.encode(`event: endpoint\ndata: ${mcpEndpoint}\n\n`));

        // Keep-alive ping every 30s
        const interval = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(': ping\n\n'));
          } catch {
            clearInterval(interval);
          }
        }, 30_000);

        // Clean up on client disconnect
        request.signal.addEventListener('abort', () => {
          clearInterval(interval);
          controller.close();
        });
      },
    });

    return new Response(stream, { status: 200, headers });
  };
}

/**
 * Creates a handler that serves the WebMCP bridge script.
 *
 * Mount it on a route (e.g. `app/webmcp.js/route.ts`) and load it with
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
/**
 * Creates a handler that serves /llms.txt
 */
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

/**
 * Creates a handler that serves /llms-full.txt
 */
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
