import {
  CorsenContext,
  SECURITY_HEADERS,
  type CorsenContextConfig,
  type ContentProvider,
} from '@corsenai/corsen-context';

let cachedInstance: CorsenContext | null = null;

function getInstance(config: CorsenContextConfig, provider: ContentProvider): CorsenContext {
  if (!cachedInstance) {
    cachedInstance = new CorsenContext(config, provider);
  }
  return cachedInstance;
}

function getClientIp(request: Request): string {
  // Cloudflare (most reliable when behind CF).
  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp) return cfIp.trim();

  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();

  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }

  // Fallback: generate a pseudo-unique key from User-Agent to avoid
  // all clients sharing a single "unknown" rate-limit bucket.
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
): { POST: (request: Request) => Promise<Response>; OPTIONS: (request: Request) => Promise<Response> } {
  async function POST(request: Request): Promise<Response> {
    const instance = getInstance(config, provider);
    const server = instance.createMCPServer();

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
    const clientIp = getClientIp(request);
    const apiKey = getApiKey(request);

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

    // Rate limit
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

    // Parse and handle request
    try {
      const body = await request.json();
      const result = await server.handleRequest(body, clientIp, apiKey, { skipRateLimit: true });

      // null result = JSON-RPC notification (no id) — return 204 No Content
      if (result === null) {
        return new Response(null, { status: 204, headers });
      }

      return new Response(JSON.stringify(result), { status: 200, headers });
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
  }

  async function OPTIONS(request: Request): Promise<Response> {
    const instance = getInstance(config, provider);
    const server = instance.createMCPServer();

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
export function createSSEHandler(config: CorsenContextConfig) {
  return async function GET(request: Request): Promise<Response> {
    const siteUrl = config.siteUrl.replace(/\/$/, '');
    const mcpEndpoint = `${siteUrl}${config.mcp?.endpoint || '/v1/mcp'}`;

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
