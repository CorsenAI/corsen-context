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
	 * Every tool this plugin exposes reads published content, so all of them
	 * are read-only and all of them return untrusted data: post bodies come
	 * from authors, comments and imports, and a consuming agent must treat
	 * that output as data rather than as instructions.
	 *
	 * Kept in sync with tools.manifest.json by ToolManifestParityTest.
	 */
	private const ANNOTATIONS = array(
		'search_site'      => array(
			'readOnlyHint'         => true,
			'untrustedContentHint' => true,
		),
		'get_page_content' => array(
			'readOnlyHint'         => true,
			'untrustedContentHint' => true,
		),
		'list_content'     => array(
			'readOnlyHint'         => true,
			'untrustedContentHint' => true,
		),
		'get_sitemap'      => array(
			'readOnlyHint'         => true,
			'untrustedContentHint' => true,
		),
	);

	/**
	 * Annotations for a tool. Unknown tools fall back to the safest pair.
	 *
	 * @param string $name Tool name.
	 * @return array<string,bool>
	 */
	public static function annotations_for( string $name ): array {
		return self::ANNOTATIONS[ $name ] ?? array(
			'readOnlyHint'         => true,
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

		if ( false === $tools_json || false === $endpoint_json ) {
			return '';
		}

		return <<<JS
(function () {
  var tools = {$tools_json};
  var endpoint = {$endpoint_json};

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
			home_url( '/wp-json/corsen-context/v1/mcp' )
		);

		if ( '' === $script ) {
			return;
		}

		echo "<script>\n" . $script . "\n</script>\n"; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Definitions are JSON-encoded with JSON_HEX_TAG; the surrounding script is a static literal.
	}
}
