import { describe, it, expect } from 'vitest';
import { runInNewContext } from 'node:vm';
import { MCPServer } from '../src/mcp-server.js';
import { resolveConfig } from '../src/config.js';
import { MCP_PROTOCOL_VERSION } from '../src/version.js';
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
  execute: (input?: object, options?: { signal?: unknown }) => Promise<string>;
}

interface FetchCall {
  url: string;
  init: { credentials?: string; signal?: unknown; headers?: Record<string, string>; body?: string };
}

function buildScript(mcpEndpoint?: string): string {
  const server = new MCPServer(resolveConfig({ siteUrl: 'https://example.com' }), emptyProvider);
  return generateWebMCPScript(
    toWebMCPTools(server.getToolDefinitions()),
    mcpEndpoint === undefined ? {} : { mcpEndpoint },
  );
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
    notificationStatus?: number;
    pageUrl?: string;
    rejectRegistration?: boolean;
  } = {},
): Harness {
  const registered: RegisteredTool[] = [];
  const fetchCalls: FetchCall[] = [];

  const modelContext = {
    registerTool(tool: RegisteredTool) {
      registered.push(tool);
      return options.rejectRegistration
        ? Promise.reject(new Error('registration rejected'))
        : Promise.resolve();
    },
  };

  const sameWindow = {};
  const pageUrl = new URL(options.pageUrl ?? 'https://example.com/current-page');
  const toolResponse = options.fetchResponse ?? {
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
    window: {
      top: options.inFrame ? {} : sameWindow,
      self: sameWindow,
      location: pageUrl,
    },
    document: options.noModelContext || options.onNavigator ? {} : { modelContext },
    navigator: options.onNavigator && !options.noModelContext ? { modelContext } : {},
    URL,
    Promise,
    AbortController,
    AbortSignal,
    fetch: (url: string, init: FetchCall['init']) => {
      fetchCalls.push({ url, init });
      const request = JSON.parse(String(init.body));
      const isNotification = request.method === 'notifications/initialized';
      const status = isNotification
        ? (options.notificationStatus ?? 202)
        : (options.fetchStatus ?? 200);
      const response =
        request.method === 'initialize'
          ? {
              jsonrpc: '2.0',
              id: request.id,
              result: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, serverInfo: {} },
            }
          : toolResponse;
      return Promise.resolve({
        ok: options.fetchOk ?? (status >= 200 && status < 300),
        status,
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

  it('execute() completes the MCP lifecycle before the tool call and returns joined text', async () => {
    const { registered, fetchCalls } = runScript(script);
    const search = registered.find((t) => t.name === 'search_site');

    const result = await search?.execute({ query: 'hello' });

    expect(result).toBe('first chunk\nsecond chunk');
    expect(fetchCalls).toHaveLength(3);
    expect(fetchCalls.every((call) => call.url === 'https://example.com/v1/mcp')).toBe(true);
    expect(fetchCalls.every((call) => call.init.credentials === 'omit')).toBe(true);
    expect(fetchCalls.map((call) => JSON.parse(String(call.init.body)).method)).toEqual([
      'initialize',
      'notifications/initialized',
      'tools/call',
    ]);
    expect(fetchCalls[0].init.headers).toMatchObject({
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    });
    expect(fetchCalls[0].init.headers).not.toHaveProperty('MCP-Protocol-Version');
    expect(fetchCalls[1].init.headers).toMatchObject({
      'MCP-Protocol-Version': MCP_PROTOCOL_VERSION,
    });
    expect(fetchCalls[2].init.headers).toMatchObject({
      'MCP-Protocol-Version': MCP_PROTOCOL_VERSION,
    });
    const body = JSON.parse(String(fetchCalls[2].init.body));
    expect(body.method).toBe('tools/call');
    expect(body.params).toEqual({ name: 'search_site', arguments: { query: 'hello' } });
  });

  it('execute() forwards the abort signal Chrome passes as the second argument', async () => {
    const { registered, fetchCalls } = runScript(script);
    const search = registered.find((t) => t.name === 'search_site');
    const signal = { aborted: false };

    await search?.execute({ query: 'x' }, { signal });

    expect(fetchCalls).toHaveLength(3);
    expect(fetchCalls[0].init.signal).not.toBe(signal);
    expect(fetchCalls[1].init.signal).not.toBe(signal);
    expect(fetchCalls[2].init.signal).toBe(signal);
  });

  it('execute() without an options argument sends no signal', async () => {
    const { registered, fetchCalls } = runScript(script);

    await registered[0].execute({});

    expect(fetchCalls[0].init.signal).toBeInstanceOf(AbortSignal);
    expect(fetchCalls[1].init.signal).toBe(fetchCalls[0].init.signal);
    expect(fetchCalls[2].init.signal ?? null).toBeNull();
  });

  it('does not let one aborted caller cancel the shared initialization', async () => {
    const { registered, fetchCalls } = runScript(script);
    const controller = new AbortController();
    controller.abort();

    const cancelled = registered[0].execute({ query: 'cancelled' }, { signal: controller.signal });
    const survivor = registered[1].execute({ uri: 'https://example.com/' });

    await expect(cancelled).rejects.toThrow('tool execution aborted');
    await expect(survivor).resolves.toBe('first chunk\nsecond chunk');
    expect(fetchCalls.map((call) => JSON.parse(String(call.init.body)).method)).toEqual([
      'initialize',
      'notifications/initialized',
      'tools/call',
    ]);
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

  it('execute() surfaces a CallToolResult execution error as an error', async () => {
    const { registered } = runScript(script, {
      fetchResponse: {
        jsonrpc: '2.0',
        id: 3,
        result: {
          content: [{ type: 'text', text: 'query is out of range' }],
          isError: true,
        },
      },
    });
    await expect(registered[0].execute({})).rejects.toThrow('query is out of range');
  });

  it('returns an empty string when the endpoint answers with no content array', async () => {
    const { registered } = runScript(script, {
      fetchResponse: { jsonrpc: '2.0', id: 1, result: {} },
    });
    await expect(registered[0].execute({})).resolves.toBe('');
  });

  it('resolves an absolute same-origin endpoint and executes through it', async () => {
    const absolute = buildScript('https://example.com/custom/mcp');
    const { registered, fetchCalls } = runScript(absolute);

    expect(registered).toHaveLength(4);
    await registered[0].execute({ query: 'x' });
    expect(fetchCalls.every((call) => call.url === 'https://example.com/custom/mcp')).toBe(true);
  });

  it('reuses one successful lifecycle for later tool calls', async () => {
    const { registered, fetchCalls } = runScript(script);

    await registered[0].execute({ query: 'one' });
    await registered[1].execute({ uri: 'https://example.com/' });

    expect(fetchCalls.map((call) => JSON.parse(String(call.init.body)).method)).toEqual([
      'initialize',
      'notifications/initialized',
      'tools/call',
      'tools/call',
    ]);
  });

  it('rejects a notification response that is not HTTP 202', async () => {
    const { registered } = runScript(script, { notificationStatus: 204 });
    await expect(registered[0].execute({ query: 'x' })).rejects.toThrow(
      'MCP notification returned 204',
    );
  });

  it('registers nothing for a cross-origin endpoint', () => {
    const crossOrigin = buildScript('https://other.example/mcp');
    const { registered, fetchCalls } = runScript(crossOrigin);

    expect(registered).toHaveLength(0);
    expect(fetchCalls).toHaveLength(0);
  });

  it('registers nothing for an invalid endpoint URL', () => {
    const invalid = buildScript('http://[invalid');
    const { registered, fetchCalls } = runScript(invalid);

    expect(registered).toHaveLength(0);
    expect(fetchCalls).toHaveLength(0);
  });

  it('registers nothing for an endpoint URL containing credentials', () => {
    const credentialed = buildScript('https://user:password@example.com/v1/mcp');
    const { registered, fetchCalls } = runScript(credentialed);

    expect(registered).toHaveLength(0);
    expect(fetchCalls).toHaveLength(0);
  });

  it('registers nothing for a non-HTTP endpoint even when its origin matches', () => {
    const nonHttp = buildScript('blob:https://example.com/bridge-id');
    const { registered, fetchCalls } = runScript(nonHttp);

    expect(registered).toHaveLength(0);
    expect(fetchCalls).toHaveLength(0);
  });

  it('handles rejected registerTool promises without an unhandled rejection', async () => {
    const { registered, fetchCalls } = runScript(script, { rejectRegistration: true });

    // Let the rejection handlers installed by the generated script run.
    await Promise.resolve();
    await Promise.resolve();

    expect(registered).toHaveLength(4);
    expect(fetchCalls).toHaveLength(0);
  });
});
