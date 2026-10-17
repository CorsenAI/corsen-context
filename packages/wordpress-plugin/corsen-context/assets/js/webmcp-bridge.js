/**
 * Corsen Context WebMCP bridge.
 *
 * Registers the tools the site already serves over MCP with an agent running
 * inside the page (document.modelContext). The tool definitions, the MCP
 * endpoint and the protocol version arrive in window.corsenContextWebMCP,
 * printed by the plugin right before this file. Every execute() forwards the
 * call to the site's own MCP endpoint, same-origin and without credentials,
 * so there is one implementation behind both transports.
 *
 * Spec: https://webmachinelearning.github.io/webmcp/
 *
 * Powered by Corsen Context - Built by Corsen AI - github.com/CorsenAI/corsen-context
 */
(function () {
  'use strict';

  var config = window.corsenContextWebMCP;
  if (!config || typeof config !== 'object') return;
  var tools = Array.isArray(config.tools) ? config.tools : [];
  var endpoint = config.endpoint;
  var protocolVersion = config.protocolVersion;
  var outputBudget = typeof config.outputBudget === 'number' && config.outputBudget > 0 ? config.outputBudget : 0;
  if (tools.length === 0 || typeof protocolVersion !== 'string') return;

  // Top-level documents only: the Permissions Policy 'tools' feature defaults
  // to ['self'], and a same-origin frame must not register the set twice.
  if (window.top !== window.self) return;

  // Resolve relative endpoints against the current page and fail closed if a
  // filter supplied an invalid or cross-origin destination.
  var endpointUrl;
  if (typeof endpoint !== 'string' || endpoint.length === 0) return;
  try {
    endpointUrl = new URL(endpoint, window.location.href);
  } catch (invalidUrl) {
    return void invalidUrl;
  }
  if (endpointUrl.protocol !== 'http:' && endpointUrl.protocol !== 'https:') return;
  if (endpointUrl.username || endpointUrl.password) return;
  if (endpointUrl.origin !== window.location.origin) return;
  endpoint = endpointUrl.href;

  // The draft exposes document.modelContext; navigator.modelContext is the
  // earlier name that some clients still implement. Prefer the current one.
  var mc = document.modelContext || navigator.modelContext;
  if (!mc || typeof mc.registerTool !== 'function') return;

  var nextRequestId = 1;
  var initializationPromise = null;

  // Structured failure returned to the agent in place of a rejection: the
  // draft surfaces a rejected execute() only as a bare DOMException name,
  // which would erase not_found, invalid_params and the human_only handoff
  // URL. Only cancellation still rejects.
  function failure(code, message, extra) {
    var out = { ok: false, error_code: code, message: message };
    if (extra && typeof extra === 'object') {
      for (var key in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, key) && !(key in out)) out[key] = extra[key];
      }
    }
    return out;
  }

  function rpcError(message, code) {
    var error = new Error(message);
    error.corsenCode = code;
    return error;
  }

  function isAbort(error, signal) {
    return !!((signal && signal.aborted) || (error && error.name === 'AbortError'));
  }

  // Optional owner-set budget: trim a page result's markdown to fit and say
  // so, instead of letting a client cut the output silently.
  function bound(result) {
    if (!outputBudget || !result || typeof result !== 'object' || typeof result.markdown !== 'string') return result;
    var size = JSON.stringify(result).length;
    if (size <= outputBudget) return result;
    var keep = Math.max(0, outputBudget - (size - result.markdown.length) - 200);
    var out = {};
    for (var key in result) {
      if (Object.prototype.hasOwnProperty.call(result, key)) out[key] = result[key];
    }
    out.markdown = result.markdown.slice(0, keep);
    out.truncated = true;
    out.hint = 'Output trimmed to the in-page budget. Call get_sections with this url for the outline, then one section at a time.';
    return out;
  }

  function request(body, signal, isNotification) {
    // The endpoint records which transport a call came through; the header
    // changes nothing else and the response is the same as for any client.
    var headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'X-Corsen-Transport': 'webmcp'
    };
    if (body.method !== 'initialize') {
      headers['MCP-Protocol-Version'] = protocolVersion;
    }

    // credentials: 'omit' keeps the bridge from acting with the visitor's
    // logged-in session; the endpoint only ever serves public content.
    return fetch(endpoint, {
      method: 'POST',
      credentials: 'omit',
      signal: signal || null,
      headers: headers,
      body: JSON.stringify(body)
    })
      .then(function (res) {
        if (isNotification) {
          if (res.status !== 202) {
            throw rpcError('Corsen Context: MCP notification returned ' + res.status, 'transport_error');
          }
          return null;
        }
        if (!res.ok) throw rpcError('Corsen Context: MCP endpoint returned ' + res.status, 'transport_error');
        return res.json();
      })
      .then(function (responseBody) {
        if (isNotification) return null;
        if (responseBody && responseBody.error) {
          throw rpcError(responseBody.error.message || 'MCP error', 'protocol_error');
        }
        return responseBody;
      });
  }

  // One handshake shared by every tool, with its own timeout so that one
  // cancelled execution cannot fail the others.
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
          throw rpcError('Corsen Context: unsupported negotiated MCP version', 'protocol_error');
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
            .join('\n');
          var machine = body.result.structuredContent;
          if (machine && typeof machine === 'object') {
            return failure(
              typeof machine.error_code === 'string' ? machine.error_code : 'tool_error',
              typeof machine.message === 'string' ? machine.message : (errorText || 'Corsen Context: tool execution failed'),
              machine
            );
          }
          return failure('tool_error', errorText || 'Corsen Context: tool execution failed');
        }
        var structured = body && body.result && body.result.structuredContent;
        if (structured && typeof structured === 'object') return bound(structured);
        var content = body && body.result && body.result.content;
        if (!Array.isArray(content)) return '';
        return content
          .map(function (part) { return part && typeof part.text === 'string' ? part.text : ''; })
          .join('\n');
      })
      .catch(function (error) {
        if (isAbort(error, signal)) throw error;
        return failure(
          error && error.corsenCode ? error.corsenCode : 'transport_error',
          (error && error.message) || 'Corsen Context: MCP request failed'
        );
      });
  }

  // No cross-origin exposure option is ever passed: tools stay visible to this origin only.
  tools.forEach(function (tool) {
    try {
      Promise.resolve(mc.registerTool({
        name: tool.name,
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: tool.annotations,
        execute: function (input, options) { return call(tool.name, input, options && options.signal); }
      })).catch(function (error) {
        if (window.console && typeof window.console.warn === 'function') {
          window.console.warn('Corsen Context: WebMCP registration failed for ' + tool.name, error);
        }
      });
    } catch (error) {
      if (window.console && typeof window.console.warn === 'function') {
        window.console.warn('Corsen Context: WebMCP registration failed for ' + tool.name, error);
      }
    }
  });
})();
