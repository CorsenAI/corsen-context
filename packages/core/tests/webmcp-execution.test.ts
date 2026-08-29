import { describe, it, expect } from 'vitest';
import { runInNewContext } from 'node:vm';
import { MCPServer } from '../src/mcp-server.js';
import { resolveConfig } from '../src/config.js';
import { generateWebMCPScript, toWebMCPTools } from '../src/webmcp.js';
import type { ContentProvider } from '../src/types.js';

/**
 * The other WebMCP tests assert what the generated script says; these assert
 * what it does. The script is executed for real, in an isolated VM context,
 * against a stubbed document.modelContext and fetch — so a regression in the
 * bridge logic, not just its wording, fails here.
 */

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

interface RegisteredTool {
  name: string;
  description: string;
  inputSchema: unknown;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input?: object) => Promise<string>;
}

interface FetchCall {
  url: string;
  init: { credentials?: string; body?: string };
}

function buildScript(): string {
  const server = new MCPServer(resolveConfig({ siteUrl: 'https://example.com' }), emptyProvider);
  return generateWebMCPScript(toWebMCPTools(server.getToolDefinitions()));
}

interface Harness {
  registered: RegisteredTool[];
  fetchCalls: FetchCall[];
}

function runScript(
  script: string,
  options: {
    inFrame?: boolean;
    onNavigator?: boolean;
    noModelContext?: boolean;
    fetchResponse?: unknown;
    fetchOk?: boolean;
    fetchStatus?: number;
  } = {}
): Harness {
  const registered: RegisteredTool[] = [];
  const fetchCalls: FetchCall[] = [];

  const modelContext = {
    registerTool(tool: RegisteredTool) {
      registered.push(tool);
      return Promise.resolve();
    },
  };

  const sameWindow = {};
  const response = options.fetchResponse ?? {
    jsonrpc: '2.0',
    id: 1,
    result: {
      content: [
        { type: 'text', text: 'first chunk' },
        { type: 'text', text: 'second chunk' },
      ],
    },
  };

  const sandbox = {
    window: { top: options.inFrame ? {} : sameWindow, self: sameWindow },
    document: options.noModelContext || options.onNavigator ? {} : { modelContext },
    navigator: options.onNavigator && !options.noModelContext ? { modelContext } : {},
    fetch: (url: string, init: FetchCall['init']) => {
      fetchCalls.push({ url, init });
      return Promise.resolve({
        ok: options.fetchOk ?? true,
        status: options.fetchStatus ?? 200,
        json: () => Promise.resolve(response),
      });
    },
  };

  runInNewContext(script, sandbox);
  return { registered, fetchCalls };
}

describe('the generated bridge, executed', () => {
  const script = buildScript();

  it('registers all four tools with their annotations', () => {
    const { registered } = runScript(script);
    expect(registered.map((t) => t.name)).toEqual([
      'search_site',
      'get_page_content',
      'list_content',
      'get_sitemap',
    ]);
    for (const tool of registered) {
      expect(tool.annotations).toEqual({ readOnlyHint: true, untrustedContentHint: true });
      expect(typeof tool.execute).toBe('function');
    }
  });

  it('also registers when only the deprecated navigator alias exists', () => {
    const { registered } = runScript(script, { onNavigator: true });
    expect(registered).toHaveLength(4);
  });

  it('registers nothing inside a frame', () => {
    const { registered } = runScript(script, { inFrame: true });
    expect(registered).toHaveLength(0);
  });

  it('registers nothing when no modelContext exists at all', () => {
    const { registered, fetchCalls } = runScript(script, { noModelContext: true });
    expect(registered).toHaveLength(0);
    expect(fetchCalls).toHaveLength(0);
  });

  it('execute() posts a correct JSON-RPC call and returns the joined text', async () => {
    const { registered, fetchCalls } = runScript(script);
    const search = registered.find((t) => t.name === 'search_site');

    const result = await search?.execute({ query: 'hello' });

    expect(result).toBe('first chunk\nsecond chunk');
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe('/v1/mcp');
    expect(fetchCalls[0].init.credentials).toBe('omit');
    const body = JSON.parse(String(fetchCalls[0].init.body));
    expect(body.method).toBe('tools/call');
    expect(body.params).toEqual({ name: 'search_site', arguments: { query: 'hello' } });
  });

  it('execute() surfaces an HTTP failure as an error', async () => {
    const { registered } = runScript(script, { fetchOk: false, fetchStatus: 503 });
    await expect(registered[0].execute({ query: 'x' })).rejects.toThrow('503');
  });

  it('execute() surfaces a JSON-RPC error as an error', async () => {
    const { registered } = runScript(script, {
      fetchResponse: { jsonrpc: '2.0', id: 1, error: { code: -32602, message: 'bad args' } },
    });
    await expect(registered[0].execute({})).rejects.toThrow('bad args');
  });

  it('returns an empty string when the endpoint answers with no content array', async () => {
    const { registered } = runScript(script, {
      fetchResponse: { jsonrpc: '2.0', id: 1, result: {} },
    });
    await expect(registered[0].execute({})).resolves.toBe('');
  });
});
