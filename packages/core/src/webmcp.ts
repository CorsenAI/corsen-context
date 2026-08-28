import type { MCPToolDefinition } from './types.js';

/**
 * WebMCP exposes the same tools to an agent running inside the page, through
 * `document.modelContext`. The browser never reimplements a tool: it receives
 * the definitions from the server and every `execute()` calls back into the
 * existing MCP endpoint, so there is one implementation per runtime and one
 * contract for every transport.
 *
 * Spec: https://webmachinelearning.github.io/webmcp/
 */

/** Tool annotations defined by the WebMCP `ToolAnnotations` dictionary. */
export interface WebMCPToolAnnotations {
  /** Tool only reads state. Lets an agent decide when a call is safe. */
  readOnlyHint: boolean;
  /** Tool output is untrusted data, from the perspective of this site. */
  untrustedContentHint: boolean;
}

export interface WebMCPTool extends MCPToolDefinition {
  annotations: WebMCPToolAnnotations;
}

export interface WebMCPScriptConfig {
  /** MCP endpoint the browser bridge calls. Defaults to `/v1/mcp`. */
  mcpEndpoint?: string;
  /** Optional API key header name, when the endpoint requires one. */
  apiKeyHeader?: string;
}

/**
 * Every tool Corsen Context exposes reads published site content, so all of
 * them are read-only and all of them return untrusted data: page bodies come
 * from authors, comments and imports, and an agent must treat that output as
 * data rather than as instructions.
 */
export const WEBMCP_TOOL_ANNOTATIONS: Readonly<Record<string, WebMCPToolAnnotations>> = Object.freeze(
  {
    search_site: { readOnlyHint: true, untrustedContentHint: true },
    get_page_content: { readOnlyHint: true, untrustedContentHint: true },
    list_content: { readOnlyHint: true, untrustedContentHint: true },
    get_sitemap: { readOnlyHint: true, untrustedContentHint: true },
  }
);

/** Annotations for a tool. Unknown tools fall back to the safest pair. */
export function webMCPAnnotationsFor(name: string): WebMCPToolAnnotations {
  return WEBMCP_TOOL_ANNOTATIONS[name] ?? { readOnlyHint: true, untrustedContentHint: true };
}

/** Attach WebMCP annotations to MCP tool definitions. */
export function toWebMCPTools(tools: MCPToolDefinition[]): WebMCPTool[] {
  return tools.map((tool) => ({ ...tool, annotations: webMCPAnnotationsFor(tool.name) }));
}

/**
 * Serialise a value for embedding inside an inline `<script>`. Escaping `<`
 * prevents a `</script>` sequence in any description from closing the block
 * early, which would turn tool metadata into markup.
 */
function embedJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/**
 * Build the inline script that registers the tools with the in-page agent.
 *
 * Deliberate constraints:
 * - `exposedTo` is never set, so tools stay same-origin by default.
 * - Registration is refused inside a frame: the Permissions Policy `tools`
 *   feature already defaults to `['self']`, and this keeps a same-origin
 *   frame from registering the set a second time.
 * - The bridge only forwards calls to this site's own MCP endpoint; the page
 *   cannot introduce a tool the server does not already serve.
 */
export function generateWebMCPScript(
  tools: WebMCPTool[],
  config: WebMCPScriptConfig = {}
): string {
  const endpoint = config.mcpEndpoint || '/v1/mcp';

  return `(function () {
  var tools = ${embedJson(tools)};
  var endpoint = ${embedJson(endpoint)};

  if (window.top !== window.self) return;

  // Chrome 150 moved the getter to document and kept navigator as a
  // deprecated alias; support both while the origin trial runs.
  var mc = document.modelContext || navigator.modelContext;
  if (!mc || typeof mc.registerTool !== 'function') return;

  function call(name, args) {
    return fetch(endpoint, {
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: { name: name, arguments: args || {} }
      })
    })
      .then(function (res) {
        if (!res.ok) throw new Error('Corsen Context: MCP endpoint returned ' + res.status);
        return res.json();
      })
      .then(function (body) {
        if (body && body.error) throw new Error(body.error.message || 'MCP error');
        var content = body && body.result && body.result.content;
        if (!Array.isArray(content)) return '';
        return content
          .map(function (part) { return part && typeof part.text === 'string' ? part.text : ''; })
          .join('\\n');
      });
  }

  tools.forEach(function (tool) {
    mc.registerTool({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: tool.annotations,
      execute: function (input) { return call(tool.name, input); }
    });
  });
})();`;
}
