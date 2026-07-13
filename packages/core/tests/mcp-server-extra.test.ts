import { describe, it, expect } from 'vitest';
import { MCPServer } from '../src/mcp-server.js';
import { resolveConfig } from '../src/config.js';
import type { ContentProvider, ContentListItem, PageContent, SearchResult } from '../src/types.js';

function makeProvider(pages: ContentListItem[]): ContentProvider {
  return {
    async getPages() {
      return pages;
    },
    async getPageContent(url: string): Promise<PageContent | null> {
      const p = pages.find((x) => x.url === url || `https://example.com${x.url}` === url);
      if (!p) return { url, title: 'Loaded', description: '', markdown: `# ${url}`, metadata: {} };
      return { url: p.url, title: p.title, description: p.description, markdown: `# ${p.title}`, metadata: {} };
    },
    async searchContent(): Promise<SearchResult[]> {
      return [];
    },
  };
}

describe('resources/list', () => {
  it('does not crash when the provider returns relative URLs', async () => {
    const server = new MCPServer(
      resolveConfig({ siteUrl: 'https://example.com' }),
      makeProvider([{ url: '/about', title: 'About', description: '', type: 'page' }]),
    );
    const res = await server.handleRequest({ jsonrpc: '2.0', method: 'resources/list', id: 1 });
    expect(res!.error).toBeUndefined();
    const resources = (res!.result as any).resources;
    expect(resources).toHaveLength(1);
    expect(resources[0].uri).toBe('resource://about');
  });

  it('paginates with a cursor beyond the page size', async () => {
    const many: ContentListItem[] = Array.from({ length: 150 }, (_, i) => ({
      url: `https://example.com/p/${i}`,
      title: `P${i}`,
      description: '',
      type: 'page',
    }));
    const server = new MCPServer(resolveConfig({ siteUrl: 'https://example.com' }), makeProvider(many));

    const first = await server.handleRequest({ jsonrpc: '2.0', method: 'resources/list', id: 1 });
    const firstResult = first!.result as any;
    expect(firstResult.resources).toHaveLength(100);
    expect(firstResult.nextCursor).toBeTruthy();

    const second = await server.handleRequest({
      jsonrpc: '2.0',
      method: 'resources/list',
      params: { cursor: firstResult.nextCursor },
      id: 2,
    });
    const secondResult = second!.result as any;
    expect(secondResult.resources).toHaveLength(50);
    expect(secondResult.nextCursor).toBeUndefined();
  });
});

describe('resources/read enforcement', () => {
  const server = new MCPServer(
    resolveConfig({
      siteUrl: 'https://example.com',
      content: { postTypes: ['page'], excludePaths: ['/private'], maxPages: 50 },
    }),
    makeProvider([
      { url: 'https://example.com/about', title: 'About', description: '', type: 'page' },
      { url: 'https://example.com/private/x', title: 'Private', description: '', type: 'page' },
    ]),
  );

  it('reads an allowed resource', async () => {
    const res = await server.handleRequest({
      jsonrpc: '2.0',
      method: 'resources/read',
      params: { uri: 'resource://about' },
      id: 1,
    });
    expect(res!.error).toBeUndefined();
    expect((res!.result as any).contents[0].text).toContain('#');
  });

  it('rejects an excluded resource', async () => {
    const res = await server.handleRequest({
      jsonrpc: '2.0',
      method: 'resources/read',
      params: { uri: 'resource://private/x' },
      id: 2,
    });
    expect(res!.error!.code).toBe(-32002);
  });

  it('rejects a cross-origin resource', async () => {
    const res = await server.handleRequest({
      jsonrpc: '2.0',
      method: 'resources/read',
      params: { uri: 'https://evil.com/x' },
      id: 3,
    });
    expect(res!.error!.code).toBe(-32002);
  });
});

describe('list_content counting', () => {
  it('computes total on the full type-filtered set, independent of maxPages', async () => {
    const pages: ContentListItem[] = Array.from({ length: 5 }, (_, i) => ({
      url: `https://example.com/page/${i}`,
      title: `Page ${i}`,
      description: '',
      type: 'page',
    }));
    const server = new MCPServer(
      resolveConfig({ siteUrl: 'https://example.com', content: { postTypes: ['page'], maxPages: 2 } }),
      makeProvider(pages),
    );
    const list = await server.listContent('page', 1, 2);
    expect((list as any).total).toBe(5);
    expect((list as any).items).toHaveLength(2);
    expect((list as any).hasMore).toBe(true);
  });
});

describe('auth + CORS + version', () => {
  it('returns JSON-RPC code -32000 for unauthorized requests', async () => {
    const server = new MCPServer(
      resolveConfig({ siteUrl: 'https://example.com', security: { apiKey: 'secret' } }),
      makeProvider([]),
    );
    const res = await server.handleRequest({ jsonrpc: '2.0', method: 'tools/list', id: 1 });
    expect(res!.error!.code).toBe(-32000);
  });

  it('adds Vary: Origin when reflecting an allowed origin', () => {
    const server = new MCPServer(
      resolveConfig({ siteUrl: 'https://example.com', security: { allowedOrigins: ['https://app.example.com'] } }),
      makeProvider([]),
    );
    const headers = server.getCorsHeaders('https://app.example.com');
    expect(headers['Access-Control-Allow-Origin']).toBe('https://app.example.com');
    expect(headers['Vary']).toBe('Origin');
  });

  it('negotiates protocol version and can hide the server version', async () => {
    const server = new MCPServer(
      resolveConfig({ siteUrl: 'https://example.com', security: { exposeVersion: false } }),
      makeProvider([]),
    );
    const res = await server.handleRequest({
      jsonrpc: '2.0',
      method: 'initialize',
      params: { protocolVersion: '2025-11-25' },
      id: 1,
    });
    const result = res!.result as any;
    expect(result.protocolVersion).toBe('2025-11-25');
    expect(result.serverInfo.version).toBeUndefined();
  });
});
