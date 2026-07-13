import { describe, it, expect } from 'vitest';
import { createMCPHandler, createLlmsTxtHandler } from '../src/handlers.js';
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

describe('Astro createMCPHandler', () => {
  it('handles tools/list', async () => {
    const { POST } = createMCPHandler({ siteUrl: 'https://example.com' }, provider);
    const res = await POST(ctx({ jsonrpc: '2.0', method: 'tools/list', id: 1 }));
    expect(res.status).toBe(200);
    expect((await res.json()).result.tools).toHaveLength(4);
  });

  it('returns 204 for a notification', async () => {
    const { POST } = createMCPHandler({ siteUrl: 'https://example.com' }, provider);
    const res = await POST(ctx({ jsonrpc: '2.0', method: 'notifications/initialized' }));
    expect(res.status).toBe(204);
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
    const a = await POST(ctx({ jsonrpc: '2.0', method: 'ping', id: 1 }, {}, '198.51.100.7'));
    const b = await POST(ctx({ jsonrpc: '2.0', method: 'ping', id: 2 }, {}, '198.51.100.7'));
    expect(a.status).toBe(200);
    expect(b.status).toBe(429);
  });

  it('rejects an oversized body with 413', async () => {
    const { POST } = createMCPHandler({ siteUrl: 'https://example.com' }, provider);
    const big = { jsonrpc: '2.0', method: 'ping', id: 1, params: { blob: 'x'.repeat(200 * 1024) } };
    const res = await POST(ctx(big));
    expect(res.status).toBe(413);
  });

  it('OPTIONS returns 204 with CORS', async () => {
    const { OPTIONS } = createMCPHandler({ siteUrl: 'https://example.com' }, provider);
    const res = await OPTIONS({
      request: new Request('https://example.com/v1/mcp', { method: 'OPTIONS', headers: { origin: 'https://x.com' } }),
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
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
});
