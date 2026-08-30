import { describe, it, expect } from 'vitest';
import {
  createLlmsFullTxtHandler,
  createLlmsTxtHandler,
  createMCPHandler,
  createSSEHandler,
} from '../src/handlers.js';
import {
  MCP_PROTOCOL_VERSION,
  type CacheDriver,
  type ContentProvider,
  type RateLimitStore,
} from '@corsenai/corsen-context';

const provider: ContentProvider = {
  async getPages() {
    return [{ url: 'https://example.com/', title: 'Home', description: '', type: 'page' }];
  },
  async getPageContent() {
    return null;
  },
  async searchContent() {
    return [];
  },
};

function req(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://example.com/v1/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

const protocolHeaders = { 'mcp-protocol-version': MCP_PROTOCOL_VERSION };

describe('createMCPHandler POST', () => {
  it('honors injected cache and rate-limit dependencies after another handler uses the same config', async () => {
    const config = { siteUrl: 'https://example.com' };
    const sharedProvider: ContentProvider = {
      ...provider,
      async getPageContent(url: string) {
        return {
          url,
          title: 'About',
          description: '',
          markdown: '# About',
          metadata: {},
        };
      },
    };
    await createLlmsTxtHandler(config, sharedProvider)();

    const values = new Map<string, unknown>();
    let cacheReads = 0;
    let cacheWrites = 0;
    const cache: CacheDriver = {
      async get<T>(key: string) {
        cacheReads++;
        return (values.get(key) as T | undefined) ?? null;
      },
      async set<T>(key: string, value: T) {
        cacheWrites++;
        values.set(key, value);
      },
      async delete(key: string) {
        values.delete(key);
      },
      async clear() {
        values.clear();
      },
    };
    let rateStoreCalls = 0;
    const rateLimitStore: RateLimitStore = {
      async getTimestamps() {
        rateStoreCalls++;
        return [];
      },
      async addTimestamp() {
        rateStoreCalls++;
      },
      async cleanup() {},
    };
    const { POST } = createMCPHandler(config, sharedProvider, { cache, rateLimitStore });

    const res = await POST(
      req(
        {
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'get_page_content',
            arguments: { uri: 'https://example.com/about' },
          },
          id: 1,
        },
        protocolHeaders,
      ),
    );

    expect(res.status).toBe(200);
    expect(cacheReads).toBeGreaterThan(0);
    expect(cacheWrites).toBeGreaterThan(0);
    expect(rateStoreCalls).toBeGreaterThan(0);
  });

  it('handles a valid tools/list request', async () => {
    const { POST } = createMCPHandler({ siteUrl: 'https://example.com' }, provider);
    const res = await POST(req({ jsonrpc: '2.0', method: 'tools/list', id: 1 }, protocolHeaders));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result.tools).toHaveLength(4);
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('returns 202 for an accepted notification (no id)', async () => {
    const { POST } = createMCPHandler({ siteUrl: 'https://example.com' }, provider);
    const res = await POST(
      req({ jsonrpc: '2.0', method: 'notifications/initialized' }, protocolHeaders),
    );
    expect(res.status).toBe(202);
    expect(await res.text()).toBe('');
  });

  it('returns 401 when an API key is required but missing', async () => {
    const { POST } = createMCPHandler(
      { siteUrl: 'https://example.com', security: { apiKey: 'secret' } },
      provider,
    );
    const res = await POST(req({ jsonrpc: '2.0', method: 'tools/list', id: 1 }));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe(-32000);
  });

  it('accepts the API key via X-MCP-Key', async () => {
    const { POST } = createMCPHandler(
      { siteUrl: 'https://example.com', security: { apiKey: 'secret' } },
      provider,
    );
    const res = await POST(
      req(
        { jsonrpc: '2.0', method: 'tools/list', id: 1 },
        { ...protocolHeaders, 'x-mcp-key': 'secret' },
      ),
    );
    expect(res.status).toBe(200);
  });

  it('returns 429 once the shared rate limit is exceeded', async () => {
    const { POST } = createMCPHandler(
      { siteUrl: 'https://example.com', security: { rateLimit: 1, burstLimit: 100 } },
      provider,
    );
    const first = await POST(req({ jsonrpc: '2.0', method: 'ping', id: 1 }, protocolHeaders));
    const second = await POST(req({ jsonrpc: '2.0', method: 'ping', id: 2 }, protocolHeaders));
    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(second.headers.get('Retry-After')).toBeTruthy();
  });

  it('returns 400 on a malformed JSON body', async () => {
    const { POST } = createMCPHandler({ siteUrl: 'https://example.com' }, provider);
    const bad = new Request('https://example.com/v1/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ not json',
    });
    const res = await POST(bad);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe(-32700);
  });

  it('rejects an uncorrelated JSON-RPC response as an HTTP error', async () => {
    const { POST } = createMCPHandler({ siteUrl: 'https://example.com' }, provider);
    const res = await POST(req({ jsonrpc: '2.0', id: 1, result: {} }));
    const payload = await res.json();

    expect(res.status).toBe(400);
    expect(payload.error.code).toBe(-32600);
  });

  it('returns 415 for a non-JSON media type', async () => {
    const { POST } = createMCPHandler({ siteUrl: 'https://example.com' }, provider);
    const res = await POST(
      new Request('https://example.com/v1/mcp', {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'initialize', id: 1 }),
      }),
    );
    expect(res.status).toBe(415);
  });

  it.each([
    { 'content-type': 'application/json; charset=iso-8859-1' },
    { 'content-type': 'application/json', 'content-encoding': 'gzip' },
  ])('returns bounded JSON 415 for unsupported body encoding: %o', async (headers) => {
    const { POST } = createMCPHandler({ siteUrl: 'https://example.com' }, provider);
    const res = await POST(req({ jsonrpc: '2.0', method: 'initialize', id: 1 }, headers));

    expect(res.status).toBe(415);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect((await res.json()).error.code).toBe(-32000);
  });

  it('returns 406 when the client explicitly refuses JSON', async () => {
    const { POST } = createMCPHandler({ siteUrl: 'https://example.com' }, provider);
    const res = await POST(
      req({ jsonrpc: '2.0', method: 'initialize', id: 1 }, { accept: 'text/plain' }),
    );
    expect(res.status).toBe(406);
  });

  it('rejects an oversized body with 413', async () => {
    const { POST } = createMCPHandler({ siteUrl: 'https://example.com' }, provider);
    const big = { jsonrpc: '2.0', method: 'ping', id: 1, params: { blob: 'x'.repeat(200 * 1024) } };
    const res = await POST(req(big));
    expect(res.status).toBe(413);
  });

  it('accepts initialize without a protocol header', async () => {
    const { POST } = createMCPHandler({ siteUrl: 'https://example.com' }, provider);
    const res = await POST(
      req({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).result.protocolVersion).toBe(MCP_PROTOCOL_VERSION);
  });

  it('requires the negotiated protocol header after initialize', async () => {
    const { POST } = createMCPHandler({ siteUrl: 'https://example.com' }, provider);
    const missing = await POST(req({ jsonrpc: '2.0', method: 'tools/list', id: 1 }));
    const wrong = await POST(
      req(
        { jsonrpc: '2.0', method: 'tools/list', id: 2 },
        { 'mcp-protocol-version': '2025-03-26' },
      ),
    );
    expect(missing.status).toBe(400);
    expect(wrong.status).toBe(400);
  });

  it('rejects a supplied cross-origin Origin before processing the body', async () => {
    const { POST } = createMCPHandler({ siteUrl: 'https://example.com' }, provider);
    const res = await POST(
      req(
        { jsonrpc: '2.0', method: 'tools/list', id: 1 },
        { ...protocolHeaders, origin: 'https://evil.example' },
      ),
    );
    expect(res.status).toBe(403);
  });

  it('does not let rotating invalid API keys rotate rate-limit buckets', async () => {
    const { POST } = createMCPHandler(
      {
        siteUrl: 'https://example.com',
        security: { apiKey: 'valid-key', rateLimit: 2, burstLimit: 100 },
      },
      provider,
    );
    const first = await POST(
      req({ jsonrpc: '2.0', method: 'ping', id: 1 }, { ...protocolHeaders, 'x-mcp-key': 'bad-1' }),
    );
    const second = await POST(
      req({ jsonrpc: '2.0', method: 'ping', id: 2 }, { ...protocolHeaders, 'x-mcp-key': 'bad-2' }),
    );
    const third = await POST(
      req({ jsonrpc: '2.0', method: 'ping', id: 3 }, { ...protocolHeaders, 'x-mcp-key': 'bad-3' }),
    );
    expect(first.status).toBe(401);
    expect(second.status).toBe(401);
    expect(third.status).toBe(429);
  });

  it('does not let untrusted User-Agent rotation create new anonymous buckets', async () => {
    const { POST } = createMCPHandler(
      { siteUrl: 'https://example.com', security: { rateLimit: 2, burstLimit: 100 } },
      provider,
    );
    const first = await POST(
      req({ jsonrpc: '2.0', method: 'ping', id: 1 }, { ...protocolHeaders, 'user-agent': 'ua-1' }),
    );
    const second = await POST(
      req({ jsonrpc: '2.0', method: 'ping', id: 2 }, { ...protocolHeaders, 'user-agent': 'ua-2' }),
    );
    const third = await POST(
      req({ jsonrpc: '2.0', method: 'ping', id: 3 }, { ...protocolHeaders, 'user-agent': 'ua-3' }),
    );
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(429);
  });
});

describe('createMCPHandler OPTIONS', () => {
  it('returns 204 and reflects the canonical same origin', async () => {
    const { OPTIONS } = createMCPHandler({ siteUrl: 'https://example.com' }, provider);
    const res = await OPTIONS(
      new Request('https://example.com/v1/mcp', {
        method: 'OPTIONS',
        headers: { origin: 'https://example.com' },
      }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com');
    expect(res.headers.get('Vary')).toBe('Origin');
  });

  it('returns 403 for an untrusted supplied Origin', async () => {
    const { OPTIONS } = createMCPHandler({ siteUrl: 'https://example.com' }, provider);
    const res = await OPTIONS(
      new Request('https://example.com/v1/mcp', {
        method: 'OPTIONS',
        headers: { origin: 'https://evil.example' },
      }),
    );
    expect(res.status).toBe(403);
  });
});

describe('createMCPHandler GET', () => {
  it('returns 405 with Allow: POST when SSE is not implemented on this endpoint', async () => {
    const { GET } = createMCPHandler({ siteUrl: 'https://example.com' }, provider);
    const res = await GET(new Request('https://example.com/v1/mcp'));
    expect(res.status).toBe(405);
    expect(res.headers.get('Allow')).toBe('POST');
  });

  it('returns 403 for an untrusted supplied Origin', async () => {
    const { GET } = createMCPHandler({ siteUrl: 'https://example.com' }, provider);
    const res = await GET(
      new Request('https://example.com/v1/mcp', { headers: { origin: 'https://evil.example' } }),
    );
    expect(res.status).toBe(403);
  });
});

describe('mcp.enabled owner revocation', () => {
  const disabledConfig = { siteUrl: 'https://example.com', mcp: { enabled: false } };

  it('hides POST before media type, Origin, auth, or JSON-RPC processing', async () => {
    const { POST } = createMCPHandler(disabledConfig, provider);
    const res = await POST(
      new Request('https://example.com/v1/mcp', {
        method: 'POST',
        headers: { 'content-type': 'text/plain', origin: 'https://evil.example' },
        body: 'not json',
      }),
    );

    expect(res.status).toBe(404);
    expect(await res.text()).toBe('');
    expect(res.headers.get('Content-Type')).toBeNull();
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('hides same-endpoint GET without advertising the MCP method', async () => {
    const { GET } = createMCPHandler(disabledConfig, provider);
    const res = await GET(
      new Request('https://example.com/v1/mcp', { headers: { origin: 'https://evil.example' } }),
    );

    expect(res.status).toBe(404);
    expect(res.headers.get('Allow')).toBeNull();
    expect(await res.text()).toBe('');
  });

  it('hides OPTIONS without exposing CORS contract metadata', async () => {
    const { OPTIONS } = createMCPHandler(disabledConfig, provider);
    const res = await OPTIONS(
      new Request('https://example.com/v1/mcp', {
        method: 'OPTIONS',
        headers: { origin: 'https://example.com' },
      }),
    );

    expect(res.status).toBe(404);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(await res.text()).toBe('');
  });
});

describe('static publication owner revocation', () => {
  it('hides llms.txt when static generation is disabled', async () => {
    const GET = createLlmsTxtHandler(
      { siteUrl: 'https://example.com', static: { generateLlmsTxt: false } },
      provider,
    );
    const res = await GET();

    expect(res.status).toBe(404);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.text()).toBe('');
  });

  it('hides llms-full.txt by default and serves it only after explicit opt-in', async () => {
    const hidden = await createLlmsFullTxtHandler({ siteUrl: 'https://example.com' }, provider)();
    const enabled = await createLlmsFullTxtHandler(
      { siteUrl: 'https://example.com', static: { includeFullContent: true } },
      provider,
    )();

    expect(hidden.status).toBe(404);
    expect(hidden.headers.get('Cache-Control')).toBe('no-store');
    expect(await hidden.text()).toBe('');
    expect(enabled.status).toBe(200);
    expect(await enabled.text()).toContain('Full Content');
  });
});

describe('createSSEHandler', () => {
  it('rejects unauthenticated when an API key is required', async () => {
    const GET = createSSEHandler(
      { siteUrl: 'https://example.com', security: { apiKey: 'secret' } },
      provider,
    );
    const res = await GET(new Request('https://example.com/v1/mcp/sse'));
    expect(res.status).toBe(401);
  });

  it('streams the endpoint event when allowed', async () => {
    const GET = createSSEHandler({ siteUrl: 'https://example.com' }, provider);
    const res = await GET(new Request('https://example.com/v1/mcp/sse'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');
    await res.body?.cancel();
  });

  it('hides the legacy discovery stream when MCP is disabled', async () => {
    const GET = createSSEHandler(
      {
        siteUrl: 'https://example.com',
        mcp: { enabled: false },
        security: { apiKey: 'secret' },
      },
      provider,
    );
    const res = await GET(
      new Request('https://example.com/v1/mcp/sse', {
        headers: { origin: 'https://evil.example' },
      }),
    );

    expect(res.status).toBe(404);
    expect(res.headers.get('Content-Type')).toBeNull();
    expect(await res.text()).toBe('');
  });
});
