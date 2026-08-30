import {
  CorsenContext,
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

const cachedInstances = new WeakMap<ContentProvider, Map<string, CorsenContext>>();

function getInstance(
  config: CorsenContextConfig,
  provider: ContentProvider,
  cache?: CacheDriver,
): CorsenContext {
  let providerInstances = cachedInstances.get(provider);
  if (!providerInstances) {
    providerInstances = new Map<string, CorsenContext>();
    cachedInstances.set(provider, providerInstances);
  }

  const configKey = stableStringify(config);
  let instance = providerInstances.get(configKey);
  if (!instance) {
    instance = new CorsenContext(config, provider, cache);
    providerInstances.set(configKey, instance);
  }

  return instance;
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

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'undefined';
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
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

  // Web `Request` exposes no socket address, so without a trusted proxy we
  // derive a stable bucket from the User-Agent. This is coarse but prevents the
  // limiter from being trivially reset per request. Deployments needing strict
  // limits should front the app with a proxy and set security.trustProxy.
  const ua = request.headers.get('user-agent') || '';
  return `anon-${simpleHash(ua)}`;
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function getApiKey(request: Request): string | undefined {
  return (
    request.headers.get('x-mcp-key') ||
    request.headers.get('authorization')?.replace('Bearer ', '') ||
    undefined
  );
}

/**
 * Creates a Next.js App Router handler for the MCP endpoint (POST /v1/mcp).
 *
 * Uses the core MCPServer class from @corsenai/corsen-context for full
 * MCP 2025-11-25 compliance including:
 * - initialize, ping, notifications/initialized
 * - tools/list, tools/call
 * - resources/list, resources/read
 * - JSON-RPC 2.0 notification handling (204 No Content when id is absent)
 * - Rate limiting, CORS, API key auth, security headers
 *
 * Usage (App Router - app/v1/mcp/route.ts):
 * ```ts
 * import { createMCPHandler } from '@corsenai/corsen-context-nextjs';
 *
 * const { POST, OPTIONS } = createMCPHandler({
 *   siteUrl: 'https://example.com',
 * }, myProvider);
 *
 * export { POST, OPTIONS };
 * ```
 */
export function createMCPHandler(
  config: CorsenContextConfig,
  provider: ContentProvider,
  options?: HandlerOptions,
): { POST: (request: Request) => Promise<Response>; OPTIONS: (request: Request) => Promise<Response> } {
  const trustProxy = config.security?.trustProxy ?? false;

  function createServer(instance: CorsenContext) {
    return instance.createMCPServer({
      rateLimitStore: options?.rateLimitStore,
      logger: options?.logger,
    });
  }

  async function POST(request: Request): Promise<Response> {
    const instance = getInstance(config, provider, options?.cache);
    const server = createServer(instance);

    // Security headers
    const headers = new Headers();
    for (const [key, value] of Object.entries(server.getSecurityHeaders())) {
      headers.set(key, value);
    }
    headers.set('Content-Type', 'application/json');

    // CORS
    const origin = request.headers.get('origin') || undefined;
    for (const [key, value] of Object.entries(server.getCorsHeaders(origin))) {
      headers.set(key, value);
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
        JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Rate limit exceeded' }, id: null }),
        { status: 429, headers },
      );
    }

    // Auth check
    if (!server.checkAuth(apiKey)) {
      return new Response(
        JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Unauthorized' }, id: null }),
        { status: 401, headers },
      );
    }

    // Enforce the body-size cap on actual bytes read (not a spoofable
    // Content-Length header), aborting the stream once the cap is exceeded.
    const raw = await readBoundedText(request);
    if (raw === null) {
      return new Response(
        JSON.stringify({ jsonrpc: '2.0', error: { code: -32600, message: 'Request body too large' }, id: null }),
        { status: 413, headers },
      );
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return new Response(
        JSON.stringify({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null }),
        { status: 400, headers },
      );
    }

    const result = await server.handleRequest(body, clientIp, apiKey, { skipRateLimit: true });

    // null result = JSON-RPC notification (no id) — return 204 No Content
    if (result === null) {
      return new Response(null, { status: 204, headers });
    }
    return new Response(JSON.stringify(result), { status: 200, headers });
  }

  async function OPTIONS(request: Request): Promise<Response> {
    const instance = getInstance(config, provider, options?.cache);
    const server = createServer(instance);

    const headers = new Headers();
    for (const [key, value] of Object.entries(server.getSecurityHeaders())) {
      headers.set(key, value);
    }
    const origin = request.headers.get('origin') || undefined;
    for (const [key, value] of Object.entries(server.getCorsHeaders(origin))) {
      headers.set(key, value);
    }

    return new Response(null, { status: 204, headers });
  }

  return { POST, OPTIONS };
}

/**
 * Creates a SSE handler for MCP streaming (GET /v1/mcp/sse).
 *
 * This is a stub for future SSE transport support.
 * Currently returns a proper SSE connection that sends the MCP endpoint URL
 * so clients can discover the POST endpoint for JSON-RPC calls.
 *
 * Usage (App Router - app/v1/mcp/sse/route.ts):
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

  return async function GET(request: Request): Promise<Response> {
    const siteUrl = config.siteUrl.replace(/\/$/, '');
    const mcpEndpoint = `${siteUrl}${config.mcp?.endpoint || '/v1/mcp'}`;

    // Gate the persistent connection behind auth + rate limiting so it can't be
    // opened unauthenticated/unthrottled (each connection holds a keep-alive).
    const instance = getInstance(config, gateProvider, options?.cache);
    const server = instance.createMCPServer({ rateLimitStore: options?.rateLimitStore, logger: options?.logger });
    const apiKey = getApiKey(request);
    const clientIp = getClientIp(request, trustProxy);

    const rl = await server.checkRateLimit(clientIp, apiKey);
    if (!rl.allowed) {
      return new Response('rate limit exceeded', { status: 429, headers: { ...SECURITY_HEADERS, 'Retry-After': rl.headers['Retry-After'] || '60' } });
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
export function createWebMCPScriptHandler(config: CorsenContextConfig, provider: ContentProvider) {
  return async function GET(): Promise<Response> {
    const instance = getInstance(config, provider);
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
export function createLlmsTxtHandler(config: CorsenContextConfig, provider: ContentProvider) {
  return async function GET(): Promise<Response> {
    const instance = getInstance(config, provider);
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
export function createLlmsFullTxtHandler(config: CorsenContextConfig, provider: ContentProvider) {
  return async function GET(): Promise<Response> {
    const instance = getInstance(config, provider);
    const text = await instance.generateLlmsFullTxt();

    const headers = new Headers(SECURITY_HEADERS);
    headers.set('Content-Type', 'text/plain; charset=utf-8');
    headers.set('Cache-Control', 'public, max-age=3600, s-maxage=3600');

    return new Response(text, { status: 200, headers });
  };
}
