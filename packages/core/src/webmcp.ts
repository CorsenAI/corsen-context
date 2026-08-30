import type { MCPToolDefinition } from './types.js';
import { MCP_PROTOCOL_VERSION } from './version.js';

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
  /**
   * MCP endpoint the browser bridge calls. Defaults to `/v1/mcp`.
   *
   * The bridge is deliberately keyless: any credential embedded in a public
   * page's script is disclosed to every visitor, so a key-protected endpoint
   * should not enable the WebMCP bridge at all.
   */
  mcpEndpoint?: string;
}

/**
 * Every tool Corsen Context exposes reads published site content, so all of
 * them are read-only and all of them return untrusted data: page bodies come
 * from authors, comments and imports, and an agent must treat that output as
 * data rather than as instructions.
 */
export const WEBMCP_TOOL_ANNOTATIONS: Readonly<Record<string, WebMCPToolAnnotations>> =
  Object.freeze({
    search_site: { readOnlyHint: true, untrustedContentHint: true },
    get_page_content: { readOnlyHint: true, untrustedContentHint: true },
    list_content: { readOnlyHint: true, untrustedContentHint: true },
    get_sitemap: { readOnlyHint: true, untrustedContentHint: true },
  });

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
 * - Every forwarded call carries the MCP-Protocol-Version header, which the
 *   endpoint requires on every request after initialize.
 * - Chrome 153+ passes an AbortSignal as execute's second argument. Each
 *   caller can stop waiting for the shared handshake, and its own tool fetch
 *   receives that signal. The handshake itself uses an independent timeout so
 *   cancelling one concurrent execution cannot fail every other caller.
 */
export function generateWebMCPScript(tools: WebMCPTool[], config: WebMCPScriptConfig = {}): string {
  const endpoint = config.mcpEndpoint || '/v1/mcp';

  return `(function () {
  var tools = ${embedJson(tools)};
  var endpoint = ${embedJson(endpoint)};
  var protocolVersion = ${embedJson(MCP_PROTOCOL_VERSION)};

  if (window.top !== window.self) return;

  // Resolve before registering anything. A public bridge must never forward a
  // tool call to another origin, even when its endpoint was misconfigured.
  var endpointUrl;
  try {
    endpointUrl = new URL(endpoint, window.location.href);
  } catch (_) {
    return;
  }
  if (endpointUrl.protocol !== 'http:' && endpointUrl.protocol !== 'https:') return;
  if (endpointUrl.username || endpointUrl.password) return;
  if (endpointUrl.origin !== window.location.origin) return;

  // Chrome 150 moved the getter to document and kept navigator as a
  // deprecated alias; support both while the origin trial runs.
  var mc = document.modelContext || navigator.modelContext;
  if (!mc || typeof mc.registerTool !== 'function') return;

  var nextRequestId = 1;
  var initializationPromise = null;

  function request(body, signal, isNotification) {
    return fetch(endpointUrl.href, {
      method: 'POST',
      credentials: 'omit',
      signal: signal || null,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        // initialize negotiates the version; every subsequent request carries
        // the selected version as required by Streamable HTTP.
        ...(body.method === 'initialize' ? {} : { 'MCP-Protocol-Version': protocolVersion })
      },
      body: JSON.stringify(body)
    })
      .then(function (res) {
        if (isNotification) {
          if (res.status !== 202) {
            throw new Error('Corsen Context: MCP notification returned ' + res.status);
          }
          return null;
        }
        if (!res.ok) throw new Error('Corsen Context: MCP endpoint returned ' + res.status);
        return res.json();
      })
      .then(function (body) {
        if (isNotification) return null;
        if (body && body.error) throw new Error(body.error.message || 'MCP error');
        return body;
      });
  }

  function ensureInitialized() {
    if (!initializationPromise) {
      var initializationSignal =
        typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
          ? AbortSignal.timeout(8000)
          : null;
      initializationPromise = request({
        jsonrpc: '2.0',
        id: nextRequestId++,
        method: 'initialize',
        params: {
          protocolVersion: protocolVersion,
          capabilities: {},
          clientInfo: { name: 'corsen-context-webmcp', version: '1.0.0' }
        }
      }, initializationSignal, false)
        .then(function (body) {
          var negotiated = body && body.result && body.result.protocolVersion;
          if (negotiated !== protocolVersion) {
            throw new Error('Corsen Context: unsupported negotiated MCP version');
          }
          return request({
            jsonrpc: '2.0',
            method: 'notifications/initialized',
            params: {}
          }, initializationSignal, true);
        })
        .catch(function (error) {
          initializationPromise = null;
          throw error;
        });
    }
    return initializationPromise;
  }

  function waitForInitialization(signal) {
    var ready = ensureInitialized();
    if (!signal) return ready;
    if (signal.aborted) {
      return Promise.reject(new Error('Corsen Context: tool execution aborted'));
    }
    if (typeof signal.addEventListener !== 'function') return ready;

    return new Promise(function (resolve, reject) {
      function cleanup() {
        if (typeof signal.removeEventListener === 'function') {
          signal.removeEventListener('abort', onAbort);
        }
      }
      function onAbort() {
        cleanup();
        reject(new Error('Corsen Context: tool execution aborted'));
      }
      signal.addEventListener('abort', onAbort, { once: true });
      ready.then(function (value) {
        cleanup();
        resolve(value);
      }, function (error) {
        cleanup();
        reject(error);
      });
    });
  }

  function call(name, args, signal) {
    return waitForInitialization(signal)
      .then(function () {
        return request({
          jsonrpc: '2.0',
          id: nextRequestId++,
          method: 'tools/call',
          params: { name: name, arguments: args || {} }
        }, signal, false);
      })
      .then(function (body) {
        if (body && body.result && body.result.isError) {
          var errorContent = Array.isArray(body.result.content) ? body.result.content : [];
          var errorText = errorContent
            .map(function (part) { return part && typeof part.text === 'string' ? part.text : ''; })
            .filter(Boolean)
            .join('\\n');
          throw new Error(errorText || 'Corsen Context: tool execution failed');
        }
        var content = body && body.result && body.result.content;
        if (!Array.isArray(content)) return '';
        return content
          .map(function (part) { return part && typeof part.text === 'string' ? part.text : ''; })
          .join('\\n');
      });
  }

  tools.forEach(function (tool) {
    try {
      Promise.resolve(mc.registerTool({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: tool.annotations,
        execute: function (input, options) { return call(tool.name, input, options && options.signal); }
      })).catch(function () {
        // Isolate a rejected registration so it cannot become an unhandled
        // rejection or prevent the remaining tools from being attempted.
      });
    } catch (_) {
      // A synchronous host failure is isolated for the same reason.
    }
  });
})();`;
}
