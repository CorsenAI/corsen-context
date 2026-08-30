import { describe, expect, it } from 'vitest';
import { MCPServer } from '../src/mcp-server.js';
import { resolveConfig } from '../src/config.js';
import type { ContentProvider } from '../src/types.js';

const emptyProvider: ContentProvider = {
  async getPages() {
    return [];
  },
  async getPageContent() {
    return null;
  },
  async searchContent() {
    return [];
  },
};

function createServer(): MCPServer {
  return new MCPServer(resolveConfig({ siteUrl: 'https://example.com' }), emptyProvider);
}

async function callTool(name: string, args: unknown) {
  return createServer().handleRequest({
    jsonrpc: '2.0',
    method: 'tools/call',
    params: { name, arguments: args },
    id: 1,
  });
}

describe('generated tool input schemas', () => {
  const definitions = createServer().getToolDefinitions();
  const schemas = Object.fromEntries(definitions.map((tool) => [tool.name, tool.inputSchema]));

  it('publishes the exact bounded, closed schemas', () => {
    expect(schemas.search_site).toEqual({
      type: 'object',
      properties: {
        query: {
          type: 'string',
          minLength: 1,
          maxLength: 500,
          description: "Keywords to search for, in the site's own language. Use the user's words.",
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 50,
          default: 10,
          description: 'Maximum number of results to return (1-50, default 10).',
        },
      },
      required: ['query'],
      additionalProperties: false,
    });

    expect(schemas.get_page_content).toEqual({
      type: 'object',
      properties: {
        uri: {
          type: 'string',
          minLength: 1,
          maxLength: 2000,
          description:
            "The page's absolute URL on this site, exactly as returned by search_site, list_content or get_sitemap.",
        },
      },
      required: ['uri'],
      additionalProperties: false,
    });

    expect(schemas.list_content).toEqual({
      type: 'object',
      properties: {
        type: {
          type: 'string',
          minLength: 1,
          maxLength: 50,
          default: 'page',
          description:
            'The content type to list: post, page, product, or any custom type the site exposes.',
        },
        page: {
          type: 'integer',
          minimum: 1,
          maximum: 5000,
          default: 1,
          description: 'Result page number (1-5000, default 1).',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          default: 20,
          description: 'Items per page (1-100, default 20).',
        },
      },
      additionalProperties: false,
    });

    expect(schemas.get_sitemap).toEqual({
      type: 'object',
      properties: {},
      additionalProperties: false,
    });
  });

  it('keeps WebMCP annotations out of MCP tools/list definitions', () => {
    expect(definitions.every((definition) => !('annotations' in definition))).toBe(true);
  });
});

describe('strict tool argument validation', () => {
  const toolNames = ['search_site', 'get_page_content', 'list_content', 'get_sitemap'];

  for (const invalidArgs of [false, null, [], 'not-an-object', 1]) {
    it(`rejects non-object arguments (${JSON.stringify(invalidArgs)}) for every tool`, async () => {
      for (const toolName of toolNames) {
        const response = await callTool(toolName, invalidArgs);
        expect(response?.error?.code, toolName).toBe(-32602);
      }
    });
  }

  it('rejects unknown properties for every tool', async () => {
    const cases = [
      ['search_site', { query: 'hello', unknown: true }],
      ['get_page_content', { uri: 'https://example.com/', unknown: true }],
      ['list_content', { unknown: true }],
      ['get_sitemap', { unknown: true }],
    ] as const;

    for (const [toolName, args] of cases) {
      const response = await callTool(toolName, args);
      expect(response?.error, toolName).toBeUndefined();
      expect((response?.result as any)?.isError, toolName).toBe(true);
      expect((response?.result as any)?.content?.[0]?.text, toolName).toContain(
        'Invalid tool parameters',
      );
    }
  });

  it('accepts omitted optional arguments but enforces required fields', async () => {
    const list = await callTool('list_content', {});
    const sitemap = await callTool('get_sitemap', {});
    const search = await callTool('search_site', {});
    const page = await callTool('get_page_content', {});

    expect(list?.error).toBeUndefined();
    expect(sitemap?.error).toBeUndefined();
    expect((list?.result as any)?.isError).toBe(false);
    expect((sitemap?.result as any)?.isError).toBe(false);
    expect((search?.result as any)?.isError).toBe(true);
    expect((page?.result as any)?.isError).toBe(true);
  });

  it('enforces string lengths, integer types and numeric bounds', async () => {
    const invalidCases = [
      ['search_site', { query: 'x'.repeat(501) }],
      ['search_site', { query: 'x', limit: 1.5 }],
      ['search_site', { query: 'x', limit: 51 }],
      ['get_page_content', { uri: 'x'.repeat(2001) }],
      ['list_content', { type: 'x'.repeat(51) }],
      ['list_content', { page: 0 }],
      ['list_content', { page: 1.5 }],
      ['list_content', { page: 5001 }],
      ['list_content', { limit: 101 }],
    ] as const;

    for (const [toolName, args] of invalidCases) {
      const response = await callTool(toolName, args);
      expect(response?.error, toolName).toBeUndefined();
      expect((response?.result as any)?.isError, toolName).toBe(true);
    }
  });

  it('measures public string bounds in Unicode code points', async () => {
    const acceptedCases = [
      ['search_site', { query: '😀'.repeat(500) }],
      ['get_page_content', { uri: '😀'.repeat(2000) }],
      ['list_content', { type: '😀'.repeat(50) }],
    ] as const;
    const rejectedCases = [
      ['search_site', { query: '😀'.repeat(501) }],
      ['get_page_content', { uri: '😀'.repeat(2001) }],
      ['list_content', { type: '😀'.repeat(51) }],
    ] as const;

    for (const [toolName, args] of acceptedCases) {
      const response = await callTool(toolName, args);
      expect(response?.error?.code, toolName).not.toBe(-32602);
    }
    for (const [toolName, args] of rejectedCases) {
      const response = await callTool(toolName, args);
      expect(response?.error, toolName).toBeUndefined();
      expect((response?.result as any)?.isError, toolName).toBe(true);
    }
  });
});
