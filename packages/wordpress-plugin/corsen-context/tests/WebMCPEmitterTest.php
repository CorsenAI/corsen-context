<?php
/**
 * The WordPress WebMCP bridge is a second implementation of the same
 * contract, so it is held to the same security invariants as the core one.
 * The bridge ships as assets/js/webmcp-bridge.js; the page carries only an
 * inline configuration (tool definitions, endpoint, protocol version).
 *
 * @package Corsen_Context
 */

use PHPUnit\Framework\TestCase;

final class WebMCPEmitterTest extends TestCase {

	protected function tearDown(): void {
		$GLOBALS['corsen_test_options'] = array();
		$GLOBALS['corsen_test_filters'] = array();
		$GLOBALS['corsen_test_scripts'] = array();
		unset( $GLOBALS['corsen_test_rest_url'] );
	}

	/** @return array<int,array<string,mixed>> */
	private function annotated_tools(): array {
		$server = new Corsen_Context_MCP_Server();
		return Corsen_Context_WebMCP::with_annotations( $server->get_tool_definitions() );
	}

	/** The inline configuration printed before the bridge. */
	private function config(): string {
		return Corsen_Context_WebMCP::build_script(
			$this->annotated_tools(),
			'https://example.com/wp-json/corsen-context/v1/mcp'
		);
	}

	/** The bridge script shipped with the plugin. */
	private function bridge(): string {
		$source = Corsen_Context_WebMCP::bridge_source();
		$this->assertNotSame( '', $source, 'assets/js/webmcp-bridge.js must ship with the plugin.' );
		return $source;
	}

	public function test_every_tool_is_read_only_and_untrusted(): void {
		$tools = $this->annotated_tools();
		$this->assertNotEmpty( $tools );

		foreach ( $tools as $tool ) {
			$this->assertSame(
				array(
					'readOnlyHint'         => true,
					'untrustedContentHint' => true,
				),
				$tool['annotations']
			);
		}
	}

	public function test_unknown_tool_fails_closed_as_writable(): void {
		// v1.5.2: a tool missing from the table must NEVER be advertised as
		// a safe read. Unknown means assume-writable and consequential.
		$this->assertSame(
			array(
				'readOnlyHint'         => false,
				'untrustedContentHint' => true,
				'consequentialHint'    => true,
			),
			Corsen_Context_WebMCP::annotations_for( 'not_a_tool' )
		);
		$this->assertSame(
			array(
				'readOnlyHint'    => false,
				'destructiveHint' => true,
				'idempotentHint'  => false,
				'openWorldHint'   => false,
			),
			Corsen_Context_WebMCP::mcp_annotations_for( 'not_a_tool' )
		);
	}

	public function test_expert_tool_is_consequential_on_webmcp_and_non_read_only_on_mcp(): void {
		// The draft's consequentialHint is what a browser agent uses to ask
		// its user before running a tool; destructiveHint/idempotentHint are
		// MCP members and must not leak into the WebMCP dictionary.
		$this->assertSame(
			array(
				'readOnlyHint'         => false,
				'untrustedContentHint' => true,
				'consequentialHint'    => true,
			),
			Corsen_Context_WebMCP::annotations_for( 'request_expert_call' )
		);
		$this->assertSame(
			array(
				'readOnlyHint'    => false,
				'destructiveHint' => false,
				'idempotentHint'  => false,
				'openWorldHint'   => false,
			),
			Corsen_Context_WebMCP::mcp_annotations_for( 'request_expert_call' )
		);
	}

	public function test_mcp_transport_uses_the_mcp_annotation_vocabulary(): void {
		$server = new Corsen_Context_MCP_Server();
		$tools  = Corsen_Context_WebMCP::with_annotations( $server->get_tool_definitions(), 'mcp' );
		$this->assertNotEmpty( $tools );
		foreach ( $tools as $tool ) {
			$this->assertSame(
				array(
					'readOnlyHint'    => true,
					'destructiveHint' => false,
					'idempotentHint'  => true,
					'openWorldHint'   => false,
				),
				$tool['annotations']
			);
			$this->assertArrayNotHasKey( 'untrustedContentHint', $tool['annotations'] );
		}
	}

	public function test_tools_carry_a_title_on_both_transports(): void {
		foreach ( array( 'webmcp', 'mcp' ) as $transport ) {
			$tools   = Corsen_Context_WebMCP::with_annotations( ( new Corsen_Context_MCP_Server() )->get_tool_definitions(), $transport );
			$by_name = array_column( $tools, null, 'name' );
			$this->assertSame( 'Search site', $by_name['search_site']['title'] );
			$this->assertSame( 'Read a page', $by_name['get_page_content']['title'] );
		}
		$this->assertStringContainsString( 'title: tool.title,', $this->bridge() );
	}

	public function test_registers_through_document_with_navigator_alias(): void {
		$bridge = $this->bridge();
		$this->assertStringContainsString( 'document.modelContext || navigator.modelContext', $bridge );
		$this->assertStringContainsString( 'mc.registerTool(', $bridge );
		$this->assertStringContainsString( 'window.corsenContextWebMCP', $bridge );
	}

	public function test_refuses_to_register_inside_a_frame(): void {
		$this->assertStringContainsString( 'if (window.top !== window.self) return;', $this->bridge() );
	}

	public function test_never_widens_exposure_to_cross_origin_documents(): void {
		$this->assertStringNotContainsString( 'exposedTo', $this->bridge() );
		$this->assertStringNotContainsString( 'exposedTo', $this->config() );
	}

	public function test_invalid_or_cross_origin_endpoint_is_rejected_before_registration_or_fetch(): void {
		$bridge = $this->bridge();
		$guard  = 'if (endpointUrl.origin !== window.location.origin) return;';

		$this->assertStringContainsString( 'new URL(endpoint, window.location.href)', $bridge );
		$this->assertStringContainsString( "endpointUrl.protocol !== 'http:'", $bridge );
		$this->assertStringContainsString( 'if (endpointUrl.username || endpointUrl.password) return;', $bridge );
		$this->assertStringContainsString( $guard, $bridge );
		$this->assertLessThan( strpos( $bridge, 'var mc =' ), strpos( $bridge, $guard ) );
		$this->assertLessThan( strpos( $bridge, 'return fetch(endpoint' ), strpos( $bridge, $guard ) );
		$this->assertLessThan( strpos( $bridge, 'mc.registerTool(' ), strpos( $bridge, $guard ) );
	}

	public function test_bridge_sends_no_credentials_and_targets_the_plugin_endpoint(): void {
		$bridge = $this->bridge();
		$this->assertStringContainsString( "credentials: 'omit'", $bridge );
		$this->assertStringNotContainsString( "credentials: 'include'", $bridge );
		$this->assertStringContainsString( 'tools/call', $bridge );
		$this->assertStringContainsString( '"endpoint":"https://example.com/wp-json/corsen-context/v1/mcp"', $this->config() );
	}

	public function test_bridge_completes_the_mcp_lifecycle_before_tool_calls(): void {
		$bridge = $this->bridge();
		$this->assertStringContainsString( "'Accept': 'application/json, text/event-stream'", $bridge );
		$this->assertStringContainsString( "body.method !== 'initialize'", $bridge );
		$this->assertStringContainsString( "headers['MCP-Protocol-Version'] = protocolVersion", $bridge );
		$this->assertStringContainsString( "method: 'initialize'", $bridge );
		$this->assertStringContainsString( "method: 'notifications/initialized'", $bridge );
		$this->assertStringContainsString( 'res.status !== 202', $bridge );
		$this->assertStringContainsString( 'AbortSignal.timeout(8000)', $bridge );
		$this->assertStringContainsString( 'return waitForInitialization(signal)', $bridge );
		$this->assertStringContainsString( 'tool execution aborted', $bridge );
		$this->assertStringContainsString( '"protocolVersion":"' . Corsen_Context_MCP_Server::protocol_version() . '"', $this->config() );
		$this->assertLessThan( strpos( $bridge, "method: 'tools/call'" ), strpos( $bridge, "method: 'initialize'" ) );
		$this->assertLessThan( strpos( $bridge, "method: 'tools/call'" ), strpos( $bridge, "method: 'notifications/initialized'" ) );
	}

	public function test_execute_forwards_the_abort_signal_to_fetch(): void {
		$bridge = $this->bridge();
		$this->assertStringContainsString( 'options && options.signal', $bridge );
		$this->assertStringContainsString( 'signal: signal || null', $bridge );
	}

	public function test_execute_returns_tool_errors_as_structured_results(): void {
		// The WebMCP draft exposes a rejected execute() to the agent only as
		// a DOMException name, so not_found, invalid_params and the human_only
		// handoff URL must travel inside the returned result instead.
		$bridge = $this->bridge();

		$this->assertStringContainsString( 'body.result.isError', $bridge );
		$this->assertStringContainsString( 'Array.isArray(body.result.content)', $bridge );
		$this->assertStringContainsString( 'function failure(code, message, extra)', $bridge );
		$this->assertStringContainsString( 'error_code: code', $bridge );
		$this->assertStringContainsString( "typeof machine.error_code === 'string' ? machine.error_code : 'tool_error'", $bridge );
		$this->assertStringContainsString( "error && error.corsenCode ? error.corsenCode : 'transport_error'", $bridge );
		$this->assertStringNotContainsString( 'throw new Error(errorText', $bridge );
		// Cancellation is the one failure that still rejects.
		$this->assertStringContainsString( 'if (isAbort(error, signal)) throw error;', $bridge );
		$this->assertLessThan( strpos( $bridge, 'var content = body && body.result' ), strpos( $bridge, 'body.result.isError' ) );
	}

	public function test_registration_promise_rejections_are_handled(): void {
		$bridge = $this->bridge();
		$this->assertStringContainsString( 'Promise.resolve(mc.registerTool({', $bridge );
		$this->assertStringContainsString( ')).catch(function (error) {', $bridge );
		$this->assertStringContainsString( 'WebMCP registration failed for', $bridge );
	}

	public function test_carries_annotations_to_the_agent(): void {
		$this->assertStringContainsString( '"untrustedContentHint":true', $this->config() );
		$this->assertStringContainsString( 'annotations: tool.annotations', $this->bridge() );
	}

	public function test_hostile_content_cannot_close_the_script_block(): void {
		$config = Corsen_Context_WebMCP::build_script(
			Corsen_Context_WebMCP::with_annotations(
				array(
					array(
						'name'        => 'evil',
						'description' => '</script><img src=x onerror=alert(1)>',
						'inputSchema' => array(
							'type'       => 'object',
							'properties' => new \stdClass(),
						),
					),
				)
			),
			'/wp-json/corsen-context/v1/mcp'
		);

		$this->assertStringStartsWith( 'window.corsenContextWebMCP = {', $config );
		$this->assertStringNotContainsString( '</script>', $config );
		$this->assertStringContainsStringIgnoringCase( 'u003c/script', $config );
	}

	public function test_bridge_is_off_until_the_owner_opts_in(): void {
		$this->assertFalse( Corsen_Context_WebMCP::is_enabled() );

		$GLOBALS['corsen_test_options']['corsen_context_settings'] = array(
			'enabled'     => true,
			'mcp_enabled' => true,
		);
		$this->assertFalse(
			Corsen_Context_WebMCP::is_enabled(),
			'Installing the plugin must not expose tools to an in-page agent by itself.'
		);

		$GLOBALS['corsen_test_options']['corsen_context_settings']['webmcp_enabled'] = true;
		$this->assertTrue( Corsen_Context_WebMCP::is_enabled() );
	}

	public function test_global_switch_still_wins_over_the_webmcp_option(): void {
		$GLOBALS['corsen_test_options']['corsen_context_settings'] = array(
			'enabled'        => false,
			'mcp_enabled'    => true,
			'webmcp_enabled' => true,
		);
		$this->assertFalse( Corsen_Context_WebMCP::is_enabled() );

		$GLOBALS['corsen_test_options']['corsen_context_settings'] = array(
			'enabled'        => true,
			'mcp_enabled'    => false,
			'webmcp_enabled' => true,
		);
		$this->assertFalse( Corsen_Context_WebMCP::is_enabled() );
	}

	public function test_filter_can_veto_the_bridge(): void {
		$GLOBALS['corsen_test_options']['corsen_context_settings'] = array(
			'enabled'        => true,
			'mcp_enabled'    => true,
			'webmcp_enabled' => true,
		);
		$GLOBALS['corsen_test_filters']['corsen_context_webmcp_enabled'] = static function () {
			return false;
		};

		$this->assertFalse( Corsen_Context_WebMCP::is_enabled() );
	}

	public function test_origin_trial_token_is_sanitized_on_read(): void {
		$GLOBALS['corsen_test_options']['corsen_context_settings'] = array(
			'webmcp_origin_trial_token' => 'Ab1+/="><script>alert(1)</script>',
		);
		$this->assertSame( 'Ab1+/=scriptalert1/script', Corsen_Context_WebMCP::origin_trial_token() );
	}

	public function test_renders_origin_trial_meta_and_enqueues_the_bridge_when_enabled(): void {
		$GLOBALS['corsen_test_options']['corsen_context_settings'] = array(
			'enabled'                   => true,
			'mcp_enabled'               => true,
			'webmcp_enabled'            => true,
			'webmcp_origin_trial_token' => 'TESTTOKEN123=',
		);
		$emitter = new Corsen_Context_WebMCP();
		ob_start();
		$emitter->render();
		$out = (string) ob_get_clean();
		$this->assertStringContainsString( '<meta http-equiv="origin-trial" content="TESTTOKEN123=">', $out );
		$this->assertStringNotContainsString( '<script', $out, 'The bridge is enqueued, never printed by hand.' );

		$emitter->enqueue();
		$script = $GLOBALS['corsen_test_scripts'][ Corsen_Context_WebMCP::HANDLE ] ?? null;
		$this->assertIsArray( $script );
		$this->assertTrue( $script['enqueued'] );
		$this->assertStringEndsWith( 'assets/js/webmcp-bridge.js', $script['src'] );
		$this->assertTrue( $script['args'], 'The bridge loads in the footer.' );
		$this->assertSame( 'before', $script['inline'][0][0] );
		$this->assertStringContainsString( '"search_site"', $script['inline'][0][1] );
		$this->assertStringContainsString( '"endpoint":"https://example.com/wp-json/corsen-context/v1/mcp"', $script['inline'][0][1] );
	}

	public function test_enqueue_uses_the_canonical_wordpress_rest_url(): void {
		$GLOBALS['corsen_test_options']['corsen_context_settings'] = array(
			'enabled'        => true,
			'mcp_enabled'    => true,
			'webmcp_enabled' => true,
		);
		$GLOBALS['corsen_test_rest_url'] = static fn( string $path ): string => 'https://example.com/?rest_route=/' . ltrim( $path, '/' );

		( new Corsen_Context_WebMCP() )->enqueue();
		$inline = $GLOBALS['corsen_test_scripts'][ Corsen_Context_WebMCP::HANDLE ]['inline'][0][1];

		$this->assertSame(
			'https://example.com/?rest_route=/corsen-context/v1/mcp',
			Corsen_Context_MCP_Server::endpoint_url()
		);
		$this->assertStringContainsString( 'https://example.com/?rest_route=/corsen-context/v1/mcp', $inline );
		$this->assertStringNotContainsString( '/wp-json/corsen-context/v1/mcp', $inline );
	}

	public function test_renders_and_enqueues_nothing_at_all_when_disabled(): void {
		$emitter = new Corsen_Context_WebMCP();
		ob_start();
		$emitter->render();
		$this->assertSame( '', (string) ob_get_clean() );
		$emitter->enqueue();
		$this->assertSame( array(), $GLOBALS['corsen_test_scripts'] );
	}

	public function test_bridge_script_is_plain_es5_without_template_literals(): void {
		// The file is served to every visitor's browser; keep it dependency-free
		// and parseable by older engines (no template literals, no modules).
		$bridge = $this->bridge();
		$this->assertStringNotContainsString( '`', $bridge );
		$this->assertStringNotContainsString( 'import ', $bridge );
		$this->assertStringStartsWith( '/**', $bridge );
	}
}
