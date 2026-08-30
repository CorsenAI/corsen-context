import { describe, it, expect } from 'vitest';
import {
  createLlmsFullTxtHandler,
  createLlmsTxtHandler,
  createMCPHandler,
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

function ctx(body: unknown, headers: Record<string, string> = {}, clientAddress = '203.0.113.5') {
  return {
    request: new Request('https://example.com/v1/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
    clientAddress,
  };
}

const protocolHeaders = { 'mcp-protocol-version': MCP_PROTOCOL_VERSION };

describe('Astro createMCPHandler', () => {
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
      ctx(
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

  it('handles tools/list', async () => {
    const { POST } = createMCPHandler({ siteUrl: 'https://example.com' }, provider);
    const res = await POST(ctx({ jsonrpc: '2.0', method: 'tools/list', id: 1 }, protocolHeaders));
    expect(res.status).toBe(200);
    expect((await res.json()).result.tools).toHaveLength(4);
  });

  it('returns 202 for an accepted notification', async () => {
    const { POST } = createMCPHandler({ siteUrl: 'https://example.com' }, provider);
    const res = await POST(
      ctx({ jsonrpc: '2.0', method: 'notifications/initialized' }, protocolHeaders),
    );
    expect(res.status).toBe(202);
    expect(await res.text()).toBe('');
  });

  it('returns 401 without the required API key', async () => {
    const { POST } = createMCPHandler(
      { siteUrl: 'https://example.com', security: { apiKey: 'secret' } },
      provider,
    );
    const res = await POST(ctx({ jsonrpc: '2.0', method: 'tools/list', id: 1 }));
    expect(res.status).toBe(401);
  });

  it('rate-limits by the real client address across requests', async () => {
    const { POST } = createMCPHandler(
      { siteUrl: 'https://example.com', security: { rateLimit: 1, burstLimit: 100 } },
      provider,
    );
    const a = await POST(
      ctx({ jsonrpc: '2.0', method: 'ping', id: 1 }, protocolHeaders, '198.51.100.7'),
    );
    const b = await POST(
      ctx({ jsonrpc: '2.0', method: 'ping', id: 2 }, protocolHeaders, '198.51.100.7'),
    );
    expect(a.status).toBe(200);
    expect(b.status).toBe(429);
  });

  it('rejects an oversized body with 413', async () => {
    const { POST } = createMCPHandler({ siteUrl: 'https://example.com' }, provider);
    const big = { jsonrpc: '2.0', method: 'ping', id: 1, params: { blob: 'x'.repeat(200 * 1024) } };
    const res = await POST(ctx(big));
    expect(res.status).toBe(413);
  });

  it('rejects an uncorrelated JSON-RPC response as an HTTP error', async () => {
    const { POST } = createMCPHandler({ siteUrl: 'https://example.com' }, provider);
    const res = await POST(ctx({ jsonrpc: '2.0', id: 1, result: {} }));
    const payload = await res.json();

    expect(res.status).toBe(400);
    expect(payload.error.code).toBe(-32600);
  });

  it('returns 415 for a non-JSON media type', async () => {
    const { POST } = createMCPHandler({ siteUrl: 'https://example.com' }, provider);
    const res = await POST({
      request: new Request('https://example.com/v1/mcp', {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'initialize', id: 1 }),
      }),
      clientAddress: '203.0.113.5',
    });
    expect(res.status).toBe(415);
  });

  it.each([
    { 'content-type': 'application/json; charset=iso-8859-1' },
    { 'content-type': 'application/json', 'content-encoding': 'gzip' },
  ])('returns bounded JSON 415 for unsupported body encoding: %o', async (headers) => {
    const { POST } = createMCPHandler({ siteUrl: 'https://example.com' }, provider);
    const res = await POST(ctx({ jsonrpc: '2.0', method: 'initialize', id: 1 }, headers));

    expect(res.status).toBe(415);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect((await res.json()).error.code).toBe(-32000);
  });

  it('returns 406 when the client explicitly refuses JSON', async () => {
    const { POST } = createMCPHandler({ siteUrl: 'https://example.com' }, provider);
    const res = await POST(
      ctx({ jsonrpc: '2.0', method: 'initialize', id: 1 }, { accept: 'text/plain' }),
    );
    expect(res.status).toBe(406);
  });

  it('accepts initialize without a protocol header', async () => {
    const { POST } = createMCPHandler({ siteUrl: 'https://example.com' }, provider);
    const res = await POST(
      ctx({
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
    const missing = await POST(ctx({ jsonrpc: '2.0', method: 'tools/list', id: 1 }));
    const wrong = await POST(
      ctx(
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
      ctx(
        { jsonrpc: '2.0', method: 'tools/list', id: 1 },
        { ...protocolHeaders, origin: 'https://evil.example' },
      ),
    );
    expect(res.status).toBe(403);
  });

  it('OPTIONS returns 204 and reflects the canonical same origin', async () => {
    const { OPTIONS } = createMCPHandler({ siteUrl: 'https://example.com' }, provider);
    const res = await OPTIONS({
      request: new Request('https://example.com/v1/mcp', {
        method: 'OPTIONS',
        headers: { origin: 'https://example.com' },
      }),
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com');
  });

  it('OPTIONS returns 403 for an untrusted supplied Origin', async () => {
    const { OPTIONS } = createMCPHandler({ siteUrl: 'https://example.com' }, provider);
    const res = await OPTIONS({
      request: new Request('https://example.com/v1/mcp', {
        method: 'OPTIONS',
        headers: { origin: 'https://evil.example' },
      }),
    });
    expect(res.status).toBe(403);
  });

  it('GET returns 405 with Allow: POST when SSE is not implemented here', async () => {
    const { GET } = createMCPHandler({ siteUrl: 'https://example.com' }, provider);
    const res = await GET({ request: new Request('https://example.com/v1/mcp') });
    expect(res.status).toBe(405);
    expect(res.headers.get('Allow')).toBe('POST');
  });

  it('GET returns 403 for an untrusted supplied Origin', async () => {
    const { GET } = createMCPHandler({ siteUrl: 'https://example.com' }, provider);
    const res = await GET({
      request: new Request('https://example.com/v1/mcp', {
        headers: { origin: 'https://evil.example' },
      }),
    });
    expect(res.status).toBe(403);
  });
});

describe('Astro mcp.enabled owner revocation', () => {
  const disabledConfig = { siteUrl: 'https://example.com', mcp: { enabled: false } };

  it('hides POST before media type, Origin, auth, or JSON-RPC processing', async () => {
    const { POST } = createMCPHandler(disabledConfig, provider);
    const res = await POST({
      request: new Request('https://example.com/v1/mcp', {
        method: 'POST',
        headers: { 'content-type': 'text/plain', origin: 'https://evil.example' },
        body: 'not json',
      }),
      clientAddress: '203.0.113.5',
    });

    expect(res.status).toBe(404);
    expect(await res.text()).toBe('');
    expect(res.headers.get('Content-Type')).toBeNull();
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('hides same-endpoint GET without advertising the MCP method', async () => {
    const { GET } = createMCPHandler(disabledConfig, provider);
    const res = await GET({
      request: new Request('https://example.com/v1/mcp', {
        headers: { origin: 'https://evil.example' },
      }),
    });

    expect(res.status).toBe(404);
    expect(res.headers.get('Allow')).toBeNull();
    expect(await res.text()).toBe('');
  });

  it('hides OPTIONS without exposing CORS contract metadata', async () => {
    const { OPTIONS } = createMCPHandler(disabledConfig, provider);
    const res = await OPTIONS({
      request: new Request('https://example.com/v1/mcp', {
        method: 'OPTIONS',
        headers: { origin: 'https://example.com' },
      }),
    });

    expect(res.status).toBe(404);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(await res.text()).toBe('');
  });
});

describe('Astro createLlmsTxtHandler', () => {
  it('serves llms.txt', async () => {
    const GET = createLlmsTxtHandler({ siteUrl: 'https://example.com' }, provider);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/plain');
    expect(await res.text()).toContain('# example.com');
  });

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
