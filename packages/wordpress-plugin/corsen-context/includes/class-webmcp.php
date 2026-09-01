<?php
/**
 * WebMCP emitter for WordPress.
 *
 * Registers the tools the plugin already serves over MCP with an agent
 * running inside the page, through document.modelContext. Installing the
 * plugin is the whole integration: the site owner writes no JavaScript.
 *
 * The browser never reimplements a tool. It receives the definitions from
 * the server and every execute() calls back into the plugin's own MCP
 * endpoint, so there is one implementation behind both transports.
 *
 * Spec: https://webmachinelearning.github.io/webmcp/
 *
 * Powered by Corsen Context - Built by Corsen AI - github.com/CorsenAI/corsen-context
 *
 * @package Corsen_Context
 */

defined( 'ABSPATH' ) || exit;

class Corsen_Context_WebMCP {

	/**
	 * Read tools return untrusted data: post bodies come from authors,
	 * comments and imports, and a consuming agent must treat that output as
	 * data rather than as instructions. The one write tool
	 * (request_expert_call) is marked non-readonly explicitly so clients
	 * never mistake it for a safe read.
	 *
	 * The four core tools are kept in sync with tools.manifest.json by
	 * ToolManifestParityTest; the extension entries below are WP-runtime only
	 * and intentionally outside that shared manifest.
	 */
	private const ANNOTATIONS = array(
		'search_site'         => array(
			'readOnlyHint'         => true,
			'untrustedContentHint' => true,
		),
		'get_page_content'    => array(
			'readOnlyHint'         => true,
			'untrustedContentHint' => true,
		),
		'list_content'        => array(
			'readOnlyHint'         => true,
			'untrustedContentHint' => true,
		),
		'get_sitemap'         => array(
			'readOnlyHint'         => true,
			'untrustedContentHint' => true,
		),
		'get_product'         => array(
			'readOnlyHint'         => true,
			'untrustedContentHint' => true,
		),
		'check_agent_access'  => array(
			'readOnlyHint'         => true,
			'untrustedContentHint' => false,
		),
		'get_sections'        => array(
			'readOnlyHint'         => true,
			'untrustedContentHint' => true,
		),
		'get_structured_data' => array(
			'readOnlyHint'         => true,
			'untrustedContentHint' => true,
		),
		'request_expert_call' => array(
			'readOnlyHint'         => false,
			'destructiveHint'      => false,
			'idempotentHint'       => false,
			'untrustedContentHint' => true,
		),
	);

	/**
	 * Annotations for a tool. Unknown tools fall back to the safe assumption
	 * that they can write: a future tool missing from the table must never be
	 * advertised as a read.
	 *
	 * @param string $name Tool name.
	 * @return array<string,bool>
	 */
	public static function annotations_for( string $name ): array {
		return self::ANNOTATIONS[ $name ] ?? array(
			'readOnlyHint'         => false,
			'untrustedContentHint' => true,
		);
	}

	/**
	 * Attach WebMCP annotations to MCP tool definitions.
	 *
	 * @param array<int,array<string,mixed>> $tools Tool definitions.
	 * @return array<int,array<string,mixed>>
	 */
	public static function with_annotations( array $tools ): array {
		return array_map(
			static function ( array $tool ): array {
				$tool['annotations'] = self::annotations_for( (string) $tool['name'] );
				return $tool;
			},
			$tools
		);
	}

	/**
	 * Build the inline script that registers the tools with the in-page agent.
	 *
	 * Deliberate constraints, all asserted in tests:
	 * - exposedTo is never set, so tools stay same-origin.
	 * - Registration is refused inside a frame: the Permissions Policy `tools`
	 *   feature already defaults to ['self'], and this stops a same-origin
	 *   frame registering the set a second time.
	 * - No credentials are sent, so the bridge cannot act with the visitor's
	 *   logged-in session.
	 * - Every forwarded call carries the MCP-Protocol-Version header, which
	 *   the endpoint requires on every request after initialize.
	 * - Chrome 153+ passes an AbortSignal as execute's second argument. Each
	 *   caller can stop waiting for the shared handshake, and its tool fetch
	 *   receives that signal. The handshake has an independent timeout so one
	 *   cancellation cannot fail every concurrent execution.
	 * - Definitions are encoded with JSON_HEX_TAG, so a hostile post title
	 *   cannot close the script block and become markup.
	 *
	 * @param array<int,array<string,mixed>> $tools    Annotated tool definitions.
	 * @param string                         $endpoint MCP endpoint URL.
	 * @return string
	 */
	public static function build_script( array $tools, string $endpoint ): string {

		$tools_json    = wp_json_encode( array_values( $tools ), JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_SLASHES );
		$endpoint_json = wp_json_encode( $endpoint, JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_SLASHES );
		$protocol_json = wp_json_encode( Corsen_Context_MCP_Server::protocol_version(), JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_SLASHES );

		if ( false === $tools_json || false === $endpoint_json || false === $protocol_json ) {
			return '';
		}

		return <<<JS
(function () {
  var tools = {$tools_json};
  var endpoint = {$endpoint_json};
  var protocolVersion = {$protocol_json};

  if (window.top !== window.self) return;

  // Resolve relative endpoints against the current page and fail closed if a
  // filter supplied an invalid or cross-origin destination.
  var endpointUrl;
  if (typeof endpoint !== 'string' || endpoint.length === 0) return;
  try {
    endpointUrl = new URL(endpoint, window.location.href);
  } catch (error) {
    return;
  }
  if (endpointUrl.protocol !== 'http:' && endpointUrl.protocol !== 'https:') return;
  if (endpointUrl.username || endpointUrl.password) return;
  if (endpointUrl.origin !== window.location.origin) return;
  endpoint = endpointUrl.href;

  // Chrome 150 moved the getter to document and kept navigator as a
  // deprecated alias; support both while the origin trial runs.
  var mc = document.modelContext || navigator.modelContext;
  if (!mc || typeof mc.registerTool !== 'function') return;

  var nextRequestId = 1;
  var initializationPromise = null;

  function request(body, signal, isNotification) {
    var headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream'
    };
    if (body.method !== 'initialize') {
      headers['MCP-Protocol-Version'] = protocolVersion;
    }

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
            throw new Error('Corsen Context: MCP notification returned ' + res.status);
          }
          return null;
        }
        if (!res.ok) throw new Error('Corsen Context: MCP endpoint returned ' + res.status);
        return res.json();
      })
      .then(function (responseBody) {
        if (isNotification) return null;
        if (responseBody && responseBody.error) {
          throw new Error(responseBody.error.message || 'MCP error');
        }
        return responseBody;
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
        var structured = body && body.result && body.result.structuredContent;
        if (structured && typeof structured === 'object') return structured;
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
JS;
	}

	/**
	 * Whether the emitter should run for this request.
	 */
	public static function is_enabled(): bool {

		$settings = get_option( 'corsen_context_settings', array() );

		if ( empty( $settings['enabled'] ) || empty( $settings['mcp_enabled'] ) ) {
			return false;
		}

		// Opt-in: installing the plugin must not change what a page exposes
		// to an in-page agent until the site owner asks for it.
		$enabled = ! empty( $settings['webmcp_enabled'] );

		/** Filter whether the WebMCP bridge is emitted. */
		return (bool) apply_filters( 'corsen_context_webmcp_enabled', $enabled );
	}

	/**
	 * Chrome exposes WebMCP during the origin trial only when the page
	 * serves a per-origin token; agents with built-in WebMCP support
	 * need none. Sanitised to token charset on read as well as on save.
	 */
	public static function origin_trial_token(): string {
		$settings = get_option( 'corsen_context_settings', array() );
		$token    = (string) ( $settings['webmcp_origin_trial_token'] ?? '' );
		return substr( (string) preg_replace( '/[^A-Za-z0-9+\/=]/', '', $token ), 0, 4096 );
	}

	/**
	 * Print the bridge in wp_head.
	 */
	public function render(): void {

		if ( ! self::is_enabled() ) {
			return;
		}

		$token = self::origin_trial_token();
		if ( '' !== $token ) {
			printf(
				'<meta http-equiv="origin-trial" content="%s">' . "\n",
				esc_attr( $token )
			);
		}

		$server = new Corsen_Context_MCP_Server();
		$tools  = $server->get_tool_definitions();

		if ( empty( $tools ) ) {
			return;
		}

		$script = self::build_script(
			self::with_annotations( $tools ),
			Corsen_Context_MCP_Server::endpoint_url()
		);

		if ( '' === $script ) {
			return;
		}

		echo "<script>\n" . $script . "\n</script>\n"; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Definitions are JSON-encoded with JSON_HEX_TAG; the surrounding script is a static literal.
	}
}
