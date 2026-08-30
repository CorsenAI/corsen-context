import { describe, it, expect } from 'vitest';
import { MCPServer } from '../src/mcp-server.js';
import { resolveConfig } from '../src/config.js';
import { MemoryCache } from '../src/cache.js';
import { CorsenContext } from '../src/index.js';
import type { ContentProvider, ContentListItem, PageContent, SearchResult } from '../src/types.js';

function makeProvider(pages: ContentListItem[]): ContentProvider {
  return {
    async getPages() {
      return pages;
    },
    async getPageContent(url: string): Promise<PageContent | null> {
      const p = pages.find((x) => x.url === url || `https://example.com${x.url}` === url);
      if (!p) return { url, title: 'Loaded', description: '', markdown: `# ${url}`, metadata: {} };
      return {
        url: p.url,
        title: p.title,
        description: p.description,
        markdown: `# ${p.title}`,
        metadata: {},
      };
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
    const server = new MCPServer(
      resolveConfig({ siteUrl: 'https://example.com' }),
      makeProvider(many),
    );

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

  it('rejects malformed, non-canonical, and non-string cursors', async () => {
    const server = new MCPServer(
      resolveConfig({ siteUrl: 'https://example.com' }),
      makeProvider([]),
    );

    for (const cursor of ['!!!', '', 'MDA=', 10]) {
      const response = await server.handleRequest({
        jsonrpc: '2.0',
        method: 'resources/list',
        params: { cursor },
        id: 1,
      });
      expect(response?.error?.code, String(cursor)).toBe(-32602);
    }
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

  it('rejects absent, non-string, empty, and oversized resource URIs', async () => {
    const invalidUris: unknown[] = [undefined, null, [], '', '   ', '😀'.repeat(2001)];
    for (const uri of invalidUris) {
      const res = await server.handleRequest({
        jsonrpc: '2.0',
        method: 'resources/read',
        params: uri === undefined ? {} : { uri },
        id: 4,
      });
      expect(res?.error?.code, JSON.stringify(uri)?.slice(0, 50)).toBe(-32602);
    }
  });

  it('counts the resource URI limit in Unicode code points', async () => {
    const uri = `resource://${'😀'.repeat(1989)}`;
    expect(Array.from(uri)).toHaveLength(2000);
    const res = await server.handleRequest({
      jsonrpc: '2.0',
      method: 'resources/read',
      params: { uri },
      id: 5,
    });
    expect(res?.error?.code).not.toBe(-32602);
  });
});

describe('shared cache policy isolation', () => {
  it('does not replay entries created before an owner excludes a path', async () => {
    const pages: ContentListItem[] = [
      {
        url: 'https://example.com/public',
        title: 'Public',
        description: 'Public page',
        type: 'page',
      },
      {
        url: 'https://example.com/private/secret',
        title: 'Secret',
        description: 'Private page',
        type: 'page',
      },
    ];
    const provider: ContentProvider = {
      ...makeProvider(pages),
      async searchContent(): Promise<SearchResult[]> {
        return pages.map((page) => ({
          url: page.url,
          title: page.title,
          description: page.description,
          snippet: page.description,
          score: 1,
        }));
      },
    };
    const cache = new MemoryCache({ autoCleanup: false });
    const original = new MCPServer(resolveConfig({ siteUrl: 'https://example.com' }), provider, {
      cache,
    });

    expect(await original.searchSite('page', 10)).toHaveLength(2);
    expect((await original.listContent('page', 1, 10)).items).toHaveLength(2);
    expect(await original.getSitemap()).toHaveLength(2);

    const revoked = new MCPServer(
      resolveConfig({
        siteUrl: 'https://example.com',
        content: { excludePaths: ['/private'] },
      }),
      provider,
      { cache },
    );

    expect(await revoked.searchSite('page', 10)).toEqual([
      expect.objectContaining({ url: 'https://example.com/public' }),
    ]);
    expect((await revoked.listContent('page', 1, 10)).items).toEqual([
      expect.objectContaining({ url: 'https://example.com/public' }),
    ]);
    expect(await revoked.getSitemap()).toEqual([
      expect.objectContaining({ url: 'https://example.com/public' }),
    ]);
  });
});

describe('page invalidation freshness', () => {
  it('does not retain a page body when the owner disables the cache', async () => {
    let published = true;
    const pageProvider: ContentProvider = {
      ...makeProvider([]),
      async getPageContent(url: string) {
        return published
          ? {
              url,
              title: 'Article',
              description: '',
              markdown: '# Article',
              metadata: {},
            }
          : null;
      },
    };
    const server = new MCPServer(
      resolveConfig({ siteUrl: 'https://example.com', cache: { enabled: false } }),
      pageProvider,
    );

    expect(await server.getPageContent('https://example.com/article')).not.toBeNull();
    published = false;
    expect(await server.getPageContent('https://example.com/article')).toBeNull();
  });

  for (const owner of ['MCPServer', 'CorsenContext'] as const) {
    it(`removes an unpublished page from every surface via ${owner}.invalidatePage`, async () => {
      const page: ContentListItem = {
        url: 'https://example.com/article',
        title: 'Article',
        description: 'Published article',
        type: 'page',
      };
      let published = true;
      const provider: ContentProvider = {
        async getPages() {
          return published ? [page] : [];
        },
        async getPageContent(url: string) {
          return published
            ? {
                url,
                title: page.title,
                description: page.description,
                markdown: '# Article',
                metadata: {},
              }
            : null;
        },
        async searchContent() {
          return published
            ? [
                {
                  url: page.url,
                  title: page.title,
                  description: page.description,
                  snippet: page.description,
                  score: 1,
                },
              ]
            : [];
        },
      };
      const cache = new MemoryCache({ autoCleanup: false });
      const context = new CorsenContext({ siteUrl: 'https://example.com' }, provider, cache);
      const server = context.createMCPServer();

      expect(await server.searchSite('article')).toHaveLength(1);
      expect((await server.listContent('page')).items).toHaveLength(1);
      expect(await server.getSitemap()).toHaveLength(1);
      expect(await server.getPageContent(page.url)).not.toBeNull();

      published = false;
      if (owner === 'MCPServer') await server.invalidatePage(page.url);
      else await context.invalidatePage(page.url);

      expect(await server.searchSite('article')).toEqual([]);
      expect((await server.listContent('page')).items).toEqual([]);
      expect(await server.getSitemap()).toEqual([]);
      expect(await server.getPageContent(page.url)).toBeNull();
    });
  }
});

describe('list_content counting', () => {
  it('filters by type before enforcing the owner-configured maxPages cap', async () => {
    const pages: ContentListItem[] = [
      { url: 'https://example.com/post/0', title: 'Post 0', description: '', type: 'post' },
      { url: 'https://example.com/post/1', title: 'Post 1', description: '', type: 'post' },
      ...Array.from({ length: 5 }, (_, i) => ({
        url: `https://example.com/page/${i}`,
        title: `Page ${i}`,
        description: '',
        type: 'page',
      })),
    ];
    const server = new MCPServer(
      resolveConfig({
        siteUrl: 'https://example.com',
        content: { postTypes: ['page'], maxPages: 2 },
      }),
      makeProvider(pages),
    );
    const list = await server.listContent('page', 1, 2);
    expect((list as any).total).toBe(2);
    expect((list as any).items).toHaveLength(2);
    expect((list as any).items.map((item: ContentListItem) => item.title)).toEqual([
      'Page 0',
      'Page 1',
    ]);
    expect((list as any).hasMore).toBe(false);
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
      resolveConfig({
        siteUrl: 'https://example.com',
        security: { allowedOrigins: ['https://app.example.com'] },
      }),
      makeProvider([]),
    );
    const headers = server.getCorsHeaders('https://app.example.com');
    expect(headers['Access-Control-Allow-Origin']).toBe('https://app.example.com');
    expect(headers['Vary']).toBe('Origin');
  });

  it('negotiates protocol version and always returns the required implementation version', async () => {
    const server = new MCPServer(
      resolveConfig({ siteUrl: 'https://example.com', security: { exposeVersion: false } }),
      makeProvider([]),
    );
    const res = await server.handleRequest({
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      },
      id: 1,
    });
    const result = res!.result as any;
    expect(result.protocolVersion).toBe('2025-11-25');
    expect(result.serverInfo.version).toBeTypeOf('string');
    expect(result.serverInfo.version.length).toBeGreaterThan(0);
  });
});
