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
	 * WebMCP annotations, in the Community Group draft's ToolAnnotations
	 * vocabulary (readOnlyHint, untrustedContentHint, consequentialHint,
	 * debugging).
	 *
	 * Read tools return untrusted data: post bodies come from authors,
	 * comments and imports, and a consuming agent must treat that output as
	 * data rather than as instructions. The human-only handoff tool
	 * (request_expert_call) is non-read-only and consequential: the requested
	 * real-world action would have side effects, so a browser agent should
	 * confirm with its user first, even though execution always refuses it.
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
			'untrustedContentHint' => true,
			'consequentialHint'    => true,
		),
	);

	/**
	 * A tool missing from the table is assumed to be a consequential write:
	 * a future tool must never be advertised as a safe read by omission.
	 */
	private const UNKNOWN_ANNOTATIONS = array(
		'readOnlyHint'         => false,
		'untrustedContentHint' => true,
		'consequentialHint'    => true,
	);

	/**
	 * MCP ToolAnnotations (protocol 2025-11-25: readOnlyHint, destructiveHint,
	 * idempotentHint, openWorldHint). Every tool only reads this site, so
	 * openWorldHint is false. The human-only tool is a non-read-only,
	 * non-idempotent request that performs no destructive update because it
	 * never executes.
	 */
	private const MCP_ANNOTATIONS_READ = array(
		'readOnlyHint'    => true,
		'destructiveHint' => false,
		'idempotentHint'  => true,
		'openWorldHint'   => false,
	);

	private const MCP_ANNOTATIONS_REQUEST = array(
		'readOnlyHint'    => false,
		'destructiveHint' => false,
		'idempotentHint'  => false,
		'openWorldHint'   => false,
	);

	private const MCP_ANNOTATIONS_UNKNOWN = array(
		'readOnlyHint'    => false,
		'destructiveHint' => true,
		'idempotentHint'  => false,
		'openWorldHint'   => false,
	);

	/**
	 * WebMCP annotations for a tool. Unknown tools fall back to the safe
	 * assumption that they can write and have consequences.
	 *
	 * @param string $name Tool name.
	 * @return array<string,bool>
	 */
	public static function annotations_for( string $name ): array {
		return self::ANNOTATIONS[ $name ] ?? self::UNKNOWN_ANNOTATIONS;
	}

	/**
	 * MCP annotations for a tool, derived from the same table.
	 *
	 * @param string $name Tool name.
	 * @return array<string,bool>
	 */
	public static function mcp_annotations_for( string $name ): array {
		if ( ! isset( self::ANNOTATIONS[ $name ] ) ) {
			return self::MCP_ANNOTATIONS_UNKNOWN;
		}
		return self::ANNOTATIONS[ $name ]['readOnlyHint'] ? self::MCP_ANNOTATIONS_READ : self::MCP_ANNOTATIONS_REQUEST;
	}

	/**
	 * Attach a human title and the transport's annotation vocabulary to MCP
	 * tool definitions.
	 *
	 * @param array<int,array<string,mixed>> $tools     Tool definitions.
	 * @param string                         $transport 'webmcp' (default) or 'mcp'.
	 * @return array<int,array<string,mixed>>
	 */
	public static function with_annotations( array $tools, string $transport = 'webmcp' ): array {
		return array_map(
			static function ( array $tool ) use ( $transport ): array {
				$name                = (string) $tool['name'];
				$tool['title']       = Corsen_Context_Tool_Registry::title( $name );
				$tool['annotations'] = 'mcp' === $transport
					? self::mcp_annotations_for( $name )
					: self::annotations_for( $name );
				return $tool;
			},
			$tools
		);
	}

	/**
	 * Whether the site's front end is served over HTTPS. WebMCP is exposed in
	 * secure contexts only, so an http:// site never sees the API.
	 */
	public static function site_is_secure_context(): bool {
		return 0 === stripos( (string) home_url( '/' ), 'https://' );
	}

	/** Script handle used with wp_enqueue_script(). */
	public const HANDLE = 'corsen-context-webmcp';

	/**
	 * Build the inline configuration the bridge script reads from
	 * window.corsenContextWebMCP: the annotated tool definitions, the MCP
	 * endpoint and the protocol version the endpoint enforces.
	 *
	 * The bridge itself ships as assets/js/webmcp-bridge.js and is enqueued
	 * through WordPress, so browsers cache it and the page carries only this
	 * configuration. Its deliberate constraints, all asserted in tests:
	 * - exposedTo is never set, so tools stay same-origin.
	 * - Registration is refused inside a frame: the Permissions Policy `tools`
	 *   feature already defaults to ['self'], and this stops a same-origin
	 *   frame registering the set a second time.
	 * - No credentials are sent, so the bridge cannot act with the visitor's
	 *   logged-in session.
	 * - Every forwarded call carries the MCP-Protocol-Version header, which
	 *   the endpoint requires on every request after initialize.
	 * - execute() receives { signal } as its second argument (an AbortSignal
	 *   in the draft and in Chrome's imperative API); the shared handshake has
	 *   an independent timeout so one cancellation cannot fail every
	 *   concurrent execution.
	 * - A tool error is returned as a structured result, not thrown: the
	 *   draft surfaces a rejected execute() to the agent only as a bare
	 *   DOMException name. Only cancellation still rejects.
	 * - Definitions are encoded with JSON_HEX_TAG, so a hostile post title
	 *   cannot close the script block and become markup.
	 *
	 * @param array<int,array<string,mixed>> $tools    Annotated tool definitions.
	 * @param string                         $endpoint MCP endpoint URL.
	 * @return string JavaScript statement, or an empty string when encoding fails.
	 */
	public static function build_script( array $tools, string $endpoint ): string {

		$config = wp_json_encode(
			array(
				'tools'           => array_values( $tools ),
				'endpoint'        => $endpoint,
				'protocolVersion' => Corsen_Context_MCP_Server::protocol_version(),
			),
			JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_SLASHES
		);

		if ( false === $config ) {
			return '';
		}

		return 'window.corsenContextWebMCP = ' . $config . ';';
	}

	/**
	 * Source of the bridge script shipped with the plugin (tests, inspection).
	 */
	public static function bridge_source(): string {
		$path = dirname( __DIR__ ) . '/assets/js/webmcp-bridge.js';
		if ( ! is_readable( $path ) ) {
			return '';
		}
		$source = file_get_contents( $path ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Local plugin asset, not a remote resource.
		return is_string( $source ) ? $source : '';
	}

	/**
	 * Public URL of the bridge script.
	 */
	public static function bridge_url(): string {
		return defined( 'CORSEN_CONTEXT_PLUGIN_URL' ) ? CORSEN_CONTEXT_PLUGIN_URL . 'assets/js/webmcp-bridge.js' : '';
	}

	/**
	 * Register and enqueue the bridge for front-end pages (wp_enqueue_scripts).
	 * Nothing is enqueued while the owner has not opted in or no tool is exposed.
	 */
	public function enqueue(): void {

		if ( ! self::is_enabled() ) {
			return;
		}

		$server = new Corsen_Context_MCP_Server();
		$tools  = $server->get_tool_definitions();
		if ( empty( $tools ) ) {
			return;
		}

		$config = self::build_script(
			self::with_annotations( $tools ),
			Corsen_Context_MCP_Server::endpoint_url()
		);
		if ( '' === $config || '' === self::bridge_url() ) {
			return;
		}

		wp_register_script(
			self::HANDLE,
			self::bridge_url(),
			array(),
			defined( 'CORSEN_CONTEXT_VERSION' ) ? CORSEN_CONTEXT_VERSION : null,
			true
		);
		wp_add_inline_script( self::HANDLE, $config, 'before' );
		wp_enqueue_script( self::HANDLE );
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
	 * Chrome exposes WebMCP during the origin trial (Chrome 149 to 156) only
	 * when the page serves a per-origin token; agents with built-in WebMCP
	 * support need none. Sanitised to token charset on read as well as on save.
	 */
	public static function origin_trial_token(): string {
		$settings = get_option( 'corsen_context_settings', array() );
		$token    = (string) ( $settings['webmcp_origin_trial_token'] ?? '' );
		return substr( (string) preg_replace( '/[^A-Za-z0-9+\/=]/', '', $token ), 0, 4096 );
	}

	/**
	 * Print the origin-trial meta tag in wp_head. The bridge script itself is
	 * enqueued by enqueue() on wp_enqueue_scripts.
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
	}
}
