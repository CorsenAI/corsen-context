import { describe, it, expect } from 'vitest';
import { createMCPHandler, createSSEHandler } from '../src/handlers.js';
import type { ContentProvider } from '@corsenai/corsen-context';

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

describe('createMCPHandler POST', () => {
  it('handles a valid tools/list request', async () => {
    const { POST } = createMCPHandler({ siteUrl: 'https://example.com' }, provider);
    const res = await POST(req({ jsonrpc: '2.0', method: 'tools/list', id: 1 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result.tools).toHaveLength(4);
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('returns 204 for a notification (no id)', async () => {
    const { POST } = createMCPHandler({ siteUrl: 'https://example.com' }, provider);
    const res = await POST(req({ jsonrpc: '2.0', method: 'notifications/initialized' }));
    expect(res.status).toBe(204);
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
    const res = await POST(req({ jsonrpc: '2.0', method: 'tools/list', id: 1 }, { 'x-mcp-key': 'secret' }));
    expect(res.status).toBe(200);
  });

  it('returns 429 once the shared rate limit is exceeded', async () => {
    const { POST } = createMCPHandler(
      { siteUrl: 'https://example.com', security: { rateLimit: 1, burstLimit: 100 } },
      provider,
    );
    const first = await POST(req({ jsonrpc: '2.0', method: 'ping', id: 1 }));
    const second = await POST(req({ jsonrpc: '2.0', method: 'ping', id: 2 }));
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

  it('rejects an oversized body with 413', async () => {
    const { POST } = createMCPHandler({ siteUrl: 'https://example.com' }, provider);
    const big = { jsonrpc: '2.0', method: 'ping', id: 1, params: { blob: 'x'.repeat(200 * 1024) } };
    const res = await POST(req(big));
    expect(res.status).toBe(413);
  });
});

describe('createMCPHandler OPTIONS', () => {
  it('returns 204 with CORS headers', async () => {
    const { OPTIONS } = createMCPHandler({ siteUrl: 'https://example.com' }, provider);
    const res = await OPTIONS(
      new Request('https://example.com/v1/mcp', { method: 'OPTIONS', headers: { origin: 'https://x.com' } }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});

describe('createSSEHandler', () => {
  it('rejects unauthenticated when an API key is required', async () => {
    const GET = createSSEHandler({ siteUrl: 'https://example.com', security: { apiKey: 'secret' } }, provider);
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
});
