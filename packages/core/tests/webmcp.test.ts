import { describe, it, expect } from 'vitest';
import { MCPServer } from '../src/mcp-server.js';
import { resolveConfig } from '../src/config.js';
import { MCP_PROTOCOL_VERSION } from '../src/version.js';
import {
  generateWebMCPScript,
  toWebMCPTools,
  webMCPAnnotationsFor,
  WEBMCP_TOOL_ANNOTATIONS,
} from '../src/webmcp.js';
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

const server = new MCPServer(resolveConfig({ siteUrl: 'https://example.com' }), emptyProvider);
const tools = toWebMCPTools(server.getToolDefinitions());

describe('WebMCP annotations', () => {
  it('marks every exposed tool read-only and untrusted', () => {
    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) {
      expect(tool.annotations).toEqual({ readOnlyHint: true, untrustedContentHint: true });
    }
  });

  it('falls back to the safest annotations for an unknown tool', () => {
    expect(webMCPAnnotationsFor('not_a_tool')).toEqual({
      readOnlyHint: true,
      untrustedContentHint: true,
    });
  });

  it('does not let callers mutate the shared annotation table', () => {
    expect(Object.isFrozen(WEBMCP_TOOL_ANNOTATIONS)).toBe(true);
  });

  it('keeps the MCP definitions unchanged', () => {
    const definitions = server.getToolDefinitions();
    expect(definitions.every((d) => !('annotations' in d))).toBe(true);
  });
});

describe('generateWebMCPScript', () => {
  const script = generateWebMCPScript(tools);

  it('registers through document.modelContext and keeps the navigator alias', () => {
    expect(script).toContain('document.modelContext || navigator.modelContext');
    expect(script).toContain('mc.registerTool(');
  });

  it('refuses to register inside a frame', () => {
    expect(script).toContain('if (window.top !== window.self) return;');
  });

  it('never widens exposure to cross-origin documents', () => {
    expect(script).not.toContain('exposedTo');
  });

  it('bridges execution back to the MCP endpoint instead of reimplementing tools', () => {
    expect(script).toContain("'tools/call'");
    expect(script).toContain('"/v1/mcp"');
    expect(script).not.toContain('credentials: \'include\'');
  });

  it('sends the MCP-Protocol-Version header the endpoint requires', () => {
    expect(script).toContain("'MCP-Protocol-Version': protocolVersion");
    expect(script).toContain(`"${MCP_PROTOCOL_VERSION}"`);
  });

  it("forwards Chrome's abort signal to the fetch call", () => {
    expect(script).toContain('options && options.signal');
    expect(script).toContain('signal: signal || null');
  });

  it('honours a custom endpoint', () => {
    expect(generateWebMCPScript(tools, { mcpEndpoint: '/wp-json/corsen-context/v1/mcp' })).toContain(
      '"/wp-json/corsen-context/v1/mcp"'
    );
  });

  it('carries the annotations to the agent', () => {
    expect(script).toContain('"untrustedContentHint":true');
    expect(script).toContain('annotations: tool.annotations');
  });

  it('escapes markup so a description cannot close the script block', () => {
    const hostile = toWebMCPTools([
      {
        name: 'evil',
        description: '</script><img src=x onerror=alert(1)>',
        inputSchema: { type: 'object', properties: {} },
      },
    ]);
    const output = generateWebMCPScript(hostile);
    expect(output).not.toContain('</script>');
    expect(output).toContain('\\u003c/script');
  });
});
