import {
  CorsenContext,
  MAX_BODY_SIZE,
  SECURITY_HEADERS,
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
 * Creates an Astro API route handler for the MCP endpoint (POST /v1/mcp).
 *
 * Usage (src/pages/v1/mcp.ts):
 * ```ts
 * import { createMCPHandler } from '@corsenai/corsen-context-astro';
 * import { siteProvider } from '../../lib/corsen-provider';
 *
 * export const { POST, OPTIONS } = createMCPHandler(
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
  POST: (context: AstroContext) => Promise<Response>;
  OPTIONS: (context: AstroContext) => Promise<Response>;
} {
  const trustProxy = config.security?.trustProxy ?? false;

  function createServer(instance: CorsenContext) {
    return instance.createMCPServer({
      rateLimitStore: options?.rateLimitStore,
      logger: options?.logger,
    });
  }

  async function POST(context: AstroContext): Promise<Response> {
    const { request } = context;
    const instance = getInstance(config, provider, options?.cache);
    const server = createServer(instance);

    const headers = new Headers();
    for (const [key, value] of Object.entries(server.getSecurityHeaders())) {
      headers.set(key, value);
    }
    headers.set('Content-Type', 'application/json');

    const origin = request.headers.get('origin') || undefined;
    for (const [key, value] of Object.entries(server.getCorsHeaders(origin))) {
      headers.set(key, value);
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
        JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Rate limit exceeded' }, id: null }),
        { status: 429, headers },
      );
    }

    if (!server.checkAuth(apiKey)) {
      return new Response(
        JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Unauthorized' }, id: null }),
        { status: 401, headers },
      );
    }

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
    if (result === null) {
      return new Response(null, { status: 204, headers });
    }
    return new Response(JSON.stringify(result), { status: 200, headers });
  }

  async function OPTIONS(context: AstroContext): Promise<Response> {
    const instance = getInstance(config, provider, options?.cache);
    const server = createServer(instance);
    const headers = new Headers();
    for (const [key, value] of Object.entries(server.getSecurityHeaders())) {
      headers.set(key, value);
    }
    const origin = context.request.headers.get('origin') || undefined;
    for (const [key, value] of Object.entries(server.getCorsHeaders(origin))) {
      headers.set(key, value);
    }
    return new Response(null, { status: 204, headers });
  }

  return { POST, OPTIONS };
}

/** Creates an Astro GET handler that serves /llms.txt. */
export function createLlmsTxtHandler(
  config: CorsenContextConfig,
  provider: ContentProvider,
  options?: HandlerOptions,
) {
  return async function GET(): Promise<Response> {
    const text = await getInstance(config, provider, options?.cache).generateLlmsTxt();
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
  return async function GET(): Promise<Response> {
    const text = await getInstance(config, provider, options?.cache).generateLlmsFullTxt();
    const headers = new Headers(SECURITY_HEADERS);
    headers.set('Content-Type', 'text/plain; charset=utf-8');
    headers.set('Cache-Control', 'public, max-age=3600, s-maxage=3600');
    return new Response(text, { status: 200, headers });
  };
}
