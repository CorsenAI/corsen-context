import { describe, it, expect, beforeEach } from 'vitest';
import { MCPServer } from '../src/mcp-server.js';
import { resolveConfig } from '../src/config.js';
import type { ContentProvider, ContentListItem, PageContent, SearchResult } from '../src/types.js';

const mockPages: ContentListItem[] = [
  {
    url: 'https://example.com/',
    title: 'Home',
    description: 'Welcome to Example',
    type: 'page',
    lastModified: '2026-01-01',
  },
  {
    url: 'https://example.com/about',
    title: 'About Us',
    description: 'About our company',
    type: 'page',
  },
  {
    url: 'https://example.com/blog/hello-world',
    title: 'Hello World',
    description: 'First blog post',
    type: 'post',
    lastModified: '2026-03-15',
  },
];

const mockProvider: ContentProvider = {
  async getPages() {
    return mockPages;
  },
  async getPageContent(url: string): Promise<PageContent | null> {
    const page = mockPages.find((p) => p.url === url);
    if (!page) return null;
    return {
      url: page.url,
      title: page.title,
      description: page.description,
      markdown: `# ${page.title}\n\n${page.description}`,
      lastModified: page.lastModified,
      metadata: {},
    };
  },
  async searchContent(query: string, limit: number): Promise<SearchResult[]> {
    return mockPages
      .filter(
        (p) =>
          p.title.toLowerCase().includes(query.toLowerCase()) ||
          p.description.toLowerCase().includes(query.toLowerCase()),
      )
      .slice(0, limit)
      .map((p) => ({
        url: p.url,
        title: p.title,
        description: p.description,
        snippet: p.description,
        score: 1,
      }));
  },
};

describe('MCP Server', () => {
  let server: MCPServer;

  beforeEach(() => {
    const config = resolveConfig({ siteUrl: 'https://example.com' });
    server = new MCPServer(config, mockProvider);
  });

  it('handles initialize', async () => {
    const res = await server.handleRequest({
      jsonrpc: '2.0',
      method: 'initialize',
      id: 1,
    });
    expect(res).not.toBeNull();
    expect(res!.error).toBeUndefined();
    expect((res!.result as any).protocolVersion).toBe('2025-11-25');
    expect((res!.result as any).serverInfo.name).toBe('corsen-context');
  });

  it('handles ping', async () => {
    const res = await server.handleRequest({
      jsonrpc: '2.0',
      method: 'ping',
      id: 'ping-1',
    });
    expect(res).not.toBeNull();
    expect(res!.error).toBeUndefined();
  });

  it('returns null for notifications (no id)', async () => {
    const res = await server.handleRequest({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });
    expect(res).toBeNull();
  });

  it('handles tools/list', async () => {
    const res = await server.handleRequest({
      jsonrpc: '2.0',
      method: 'tools/list',
      id: 2,
    });
    expect(res!.error).toBeUndefined();
    const tools = (res!.result as any).tools;
    expect(tools).toHaveLength(4);
    expect(tools.map((t: any) => t.name)).toContain('search_site');
    expect(tools.map((t: any) => t.name)).toContain('get_page_content');
    expect(tools.map((t: any) => t.name)).toContain('list_content');
    expect(tools.map((t: any) => t.name)).toContain('get_sitemap');
  });

  it('handles tools/call search_site', async () => {
    const res = await server.handleRequest({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name: 'search_site', arguments: { query: 'hello' } },
      id: 3,
    });
    expect(res!.error).toBeUndefined();
    const content = (res!.result as any).content[0];
    const results = JSON.parse(content.text);
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Hello World');
  });

  it('handles tools/call get_page_content', async () => {
    const res = await server.handleRequest({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'get_page_content',
        arguments: { uri: 'https://example.com/about' },
      },
      id: 4,
    });
    expect(res!.error).toBeUndefined();
    const content = (res!.result as any).content[0];
    const page = JSON.parse(content.text);
    expect(page.title).toBe('About Us');
    expect(page.markdown).toContain('# About Us');
  });

  it('handles tools/call list_content', async () => {
    const res = await server.handleRequest({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name: 'list_content', arguments: { type: 'page' } },
      id: 5,
    });
    expect(res!.error).toBeUndefined();
    const content = (res!.result as any).content[0];
    const list = JSON.parse(content.text);
    expect(list.items).toHaveLength(2);
    expect(list.total).toBe(2);
  });

  it('handles tools/call get_sitemap', async () => {
    const res = await server.handleRequest({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name: 'get_sitemap', arguments: {} },
      id: 6,
    });
    expect(res!.error).toBeUndefined();
    const content = (res!.result as any).content[0];
    const sitemap = JSON.parse(content.text);
    expect(sitemap).toHaveLength(3);
  });

  it('handles resources/list', async () => {
    const res = await server.handleRequest({
      jsonrpc: '2.0',
      method: 'resources/list',
      id: 7,
    });
    expect(res!.error).toBeUndefined();
    const resources = (res!.result as any).resources;
    expect(resources).toHaveLength(3);
  });

  it('returns error for unknown method', async () => {
    const res = await server.handleRequest({
      jsonrpc: '2.0',
      method: 'unknown/method',
      id: 8,
    });
    expect(res!.error).toBeDefined();
    expect(res!.error!.code).toBe(-32601);
  });

  it('returns error for invalid request', async () => {
    const res = await server.handleRequest({ invalid: true });
    expect(res!.error).toBeDefined();
    expect(res!.error!.code).toBe(-32600);
  });

  it('returns security headers', () => {
    const headers = server.getSecurityHeaders();
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['X-Frame-Options']).toBe('DENY');
    expect(headers['X-Powered-By']).toBe('Corsen Context / Corsen AI');
    expect(headers['Cache-Control']).toBe('no-store');
  });

  it('rejects unauthenticated requests when apiKey is configured', async () => {
    const securedServer = new MCPServer(
      resolveConfig({ siteUrl: 'https://example.com', security: { apiKey: 'secret' } }),
      mockProvider,
    );

    const res = await securedServer.handleRequest({
      jsonrpc: '2.0',
      method: 'tools/list',
      id: 9,
    });

    expect(res!.error).toBeDefined();
    expect(res!.error!.message).toBe('Unauthorized');
  });

  it('accepts authenticated requests when apiKey is configured', async () => {
    const securedServer = new MCPServer(
      resolveConfig({ siteUrl: 'https://example.com', security: { apiKey: 'secret' } }),
      mockProvider,
    );

    const res = await securedServer.handleRequest(
      {
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 10,
      },
      undefined,
      'secret',
    );

    expect(res!.error).toBeUndefined();
  });

  it('filters excluded paths, disallowed types, and cross-origin pages', async () => {
    const provider: ContentProvider = {
      async getPages() {
        return [
          { url: 'https://example.com/public', title: 'Public', description: 'ok', type: 'page' },
          { url: 'https://example.com/private/roadmap', title: 'Private', description: 'no', type: 'page' },
          { url: 'https://example.com/blog/post', title: 'Post', description: 'no', type: 'post' },
          { url: 'https://other.example.com/leak', title: 'Other', description: 'no', type: 'page' },
        ];
      },
      async getPageContent(url: string): Promise<PageContent | null> {
        return {
          url,
          title: 'Loaded',
          description: '',
          markdown: `# ${url}`,
          metadata: {},
        };
      },
      async searchContent(_query: string, _limit: number): Promise<SearchResult[]> {
        return [
          { url: 'https://example.com/public', title: 'Public', description: 'ok', snippet: 'ok', score: 1 },
          { url: 'https://example.com/private/roadmap', title: 'Private', description: 'no', snippet: 'no', score: 1 },
          { url: 'https://other.example.com/leak', title: 'Other', description: 'no', snippet: 'no', score: 1 },
        ];
      },
    };
    const filteredServer = new MCPServer(
      resolveConfig({
        siteUrl: 'https://example.com',
        content: { postTypes: ['page'], excludePaths: ['/private'], maxPages: 10 },
      }),
      provider,
    );

    const resources = await filteredServer.handleRequest({
      jsonrpc: '2.0',
      method: 'resources/list',
      id: 11,
    });
    expect((resources!.result as any).resources.map((r: any) => r.name)).toEqual(['Public']);

    const sitemap = await filteredServer.handleRequest({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name: 'get_sitemap', arguments: {} },
      id: 12,
    });
    expect(JSON.parse((sitemap!.result as any).content[0].text).map((p: any) => p.url)).toEqual([
      'https://example.com/public',
    ]);

    const search = await filteredServer.handleRequest({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name: 'search_site', arguments: { query: 'anything', limit: 10 } },
      id: 13,
    });
    expect(JSON.parse((search!.result as any).content[0].text).map((p: any) => p.url)).toEqual([
      'https://example.com/public',
    ]);

    const excluded = await filteredServer.handleRequest({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name: 'get_page_content', arguments: { uri: 'resource://private/roadmap' } },
      id: 14,
    });
    expect(excluded!.error?.code).toBe(-32002);

    await expect(filteredServer.getPageContent('https://other.example.com/leak')).resolves.toBeNull();
  });
});
