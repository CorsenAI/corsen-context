import { describe, it, expect } from 'vitest';
import { createWebMCPScriptHandler } from '../src/handlers.js';
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

describe('createWebMCPScriptHandler', () => {
  const GET = createWebMCPScriptHandler({ siteUrl: 'https://example.com' }, provider);

  it('serves the bridge as cacheable JavaScript', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/javascript; charset=utf-8');
    expect(res.headers.get('Cache-Control')).toContain('max-age=3600');
  });

  it('registers the MCP tools and bridges back to the endpoint', async () => {
    const body = await (await GET()).text();
    expect(body).toContain('document.modelContext || navigator.modelContext');
    expect(body).toContain('"search_site"');
    expect(body).toContain("'tools/call'");
    expect(body).toContain('"/v1/mcp"');
  });

  it('holds the same invariants as every other bridge', async () => {
    const body = await (await GET()).text();
    expect(body).toContain('if (window.top !== window.self) return;');
    expect(body).not.toContain('exposedTo');
    expect(body).toContain("credentials: 'omit'");
    expect(body).toContain('"untrustedContentHint":true');
  });

  it('honours a custom MCP endpoint from the config', async () => {
    const custom = createWebMCPScriptHandler(
      { siteUrl: 'https://example.com', mcp: { endpoint: '/api/mcp' } },
      provider,
    );
    expect(await (await custom()).text()).toContain('"/api/mcp"');
  });
});
