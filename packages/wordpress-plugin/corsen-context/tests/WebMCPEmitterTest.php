<?php
/**
 * The WordPress WebMCP bridge is a second implementation of the same
 * contract, so it is held to the same security invariants as the core one.
 *
 * @package Corsen_Context
 */

use PHPUnit\Framework\TestCase;

final class WebMCPEmitterTest extends TestCase {

	protected function tearDown(): void {
		$GLOBALS['corsen_test_options'] = array();
		$GLOBALS['corsen_test_filters'] = array();
	}

	/** @return array<int,array<string,mixed>> */
	private function annotated_tools(): array {
		$server = new Corsen_Context_MCP_Server();
		return Corsen_Context_WebMCP::with_annotations( $server->get_tool_definitions() );
	}

	private function script(): string {
		return Corsen_Context_WebMCP::build_script(
			$this->annotated_tools(),
			'https://example.com/wp-json/corsen-context/v1/mcp'
		);
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

	public function test_unknown_tool_falls_back_to_safest_annotations(): void {
		$this->assertSame(
			array(
				'readOnlyHint'         => true,
				'untrustedContentHint' => true,
			),
			Corsen_Context_WebMCP::annotations_for( 'not_a_tool' )
		);
	}

	public function test_registers_through_document_with_navigator_alias(): void {
		$script = $this->script();
		$this->assertStringContainsString( 'document.modelContext || navigator.modelContext', $script );
		$this->assertStringContainsString( 'mc.registerTool(', $script );
	}

	public function test_refuses_to_register_inside_a_frame(): void {
		$this->assertStringContainsString( 'if (window.top !== window.self) return;', $this->script() );
	}

	public function test_never_widens_exposure_to_cross_origin_documents(): void {
		$this->assertStringNotContainsString( 'exposedTo', $this->script() );
	}

	public function test_bridge_sends_no_credentials_and_targets_the_plugin_endpoint(): void {
		$script = $this->script();
		$this->assertStringContainsString( "credentials: 'omit'", $script );
		$this->assertStringNotContainsString( "credentials: 'include'", $script );
		$this->assertStringContainsString( 'tools/call', $script );
		$this->assertStringContainsString( 'https://example.com/wp-json/corsen-context/v1/mcp', $script );
	}

	public function test_carries_annotations_to_the_agent(): void {
		$script = $this->script();
		$this->assertStringContainsString( '"untrustedContentHint":true', $script );
		$this->assertStringContainsString( 'annotations: tool.annotations', $script );
	}

	public function test_hostile_content_cannot_close_the_script_block(): void {
		$script = Corsen_Context_WebMCP::build_script(
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

		$this->assertStringNotContainsString( '</script>', $script );
		$this->assertStringContainsStringIgnoringCase( 'u003c/script', $script );
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

	public function test_renders_origin_trial_meta_and_bridge_when_enabled(): void {
		$GLOBALS['corsen_test_options']['corsen_context_settings'] = array(
			'enabled'                   => true,
			'mcp_enabled'               => true,
			'webmcp_enabled'            => true,
			'webmcp_origin_trial_token' => 'TESTTOKEN123=',
		);
		ob_start();
		( new Corsen_Context_WebMCP() )->render();
		$out = (string) ob_get_clean();
		$this->assertStringContainsString( '<meta http-equiv="origin-trial" content="TESTTOKEN123=">', $out );
		$this->assertStringContainsString( '<script>', $out );
		$this->assertStringContainsString( 'mc.registerTool(', $out );
	}

	public function test_renders_nothing_at_all_when_disabled(): void {
		ob_start();
		( new Corsen_Context_WebMCP() )->render();
		$this->assertSame( '', (string) ob_get_clean() );
	}
}
