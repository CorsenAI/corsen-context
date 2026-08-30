<?php
/**
 * The per-tool control the site owner sets in the admin must actually govern
 * what agents receive, on every surface. These tests pin that guarantee.
 *
 * @package Corsen_Context
 */

use PHPUnit\Framework\TestCase;

final class AgentToolsControlTest extends TestCase {

	protected function tearDown(): void {
		$GLOBALS['corsen_test_options'] = array();
		$GLOBALS['corsen_test_filters'] = array();
	}

	private function admin(): Corsen_Context_Admin {
		return Corsen_Context_Admin::instance();
	}

	// --- Sanitisation: the setting can never hold an unknown or empty tool set.

	public function test_sanitize_keeps_only_known_tools(): void {
		$out = $this->admin()->sanitize_settings(
			array( 'enabled_tools' => array( 'search_site', 'not_a_tool', 'get_sitemap' ) )
		);
		$this->assertSame( array( 'search_site', 'get_sitemap' ), $out['enabled_tools'] );
	}

	public function test_sanitize_falls_back_to_all_tools_when_none_selected(): void {
		$out = $this->admin()->sanitize_settings( array( 'enabled_tools' => array() ) );
		$this->assertSame(
			array( 'search_site', 'get_page_content', 'list_content', 'get_sitemap' ),
			$out['enabled_tools']
		);
	}

	public function test_sanitize_defaults_to_all_tools_when_absent(): void {
		$out = $this->admin()->sanitize_settings( array() );
		$this->assertContains( 'search_site', $out['enabled_tools'] );
		$this->assertCount( 4, $out['enabled_tools'] );
	}

	// --- End to end: disabling a tool removes it from the WebMCP bridge too.

	public function test_disabled_tool_disappears_from_the_webmcp_bridge(): void {
		$GLOBALS['corsen_test_options']['corsen_context_settings'] = array(
			'enabled'       => true,
			'mcp_enabled'   => true,
			'webmcp_enabled' => true,
			'enabled_tools' => array( 'search_site' ),
		);

		$server = new Corsen_Context_MCP_Server();
		$script = Corsen_Context_WebMCP::build_script(
			Corsen_Context_WebMCP::with_annotations( $server->get_tool_definitions() ),
			'https://example.com/wp-json/corsen-context/v1/mcp'
		);

		$this->assertStringContainsString( '"search_site"', $script );
		$this->assertStringNotContainsString( '"get_sitemap"', $script );
		$this->assertStringNotContainsString( '"list_content"', $script );
	}
}
