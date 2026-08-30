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

	// --- Sanitisation: unknown tools never survive; an explicit empty set is valid.

	public function test_sanitize_keeps_only_known_tools(): void {
		$out = $this->admin()->sanitize_settings(
			array( 'enabled_tools' => array( 'search_site', 'not_a_tool', 'get_sitemap' ) )
		);
		$this->assertSame( array( 'search_site', 'get_sitemap' ), $out['enabled_tools'] );
	}

	public function test_sanitize_preserves_an_explicit_empty_tool_set(): void {
		$out = $this->admin()->sanitize_settings( array( 'enabled_tools' => array() ) );
		$this->assertSame( array(), $out['enabled_tools'] );
	}

	public function test_sanitize_defaults_to_all_tools_when_absent(): void {
		$out = $this->admin()->sanitize_settings( array() );
		$this->assertContains( 'search_site', $out['enabled_tools'] );
		$this->assertCount( 4, $out['enabled_tools'] );
	}

	public function test_tools_ui_posts_an_explicit_empty_selection(): void {
		ob_start();
		$this->admin()->render_enabled_tools();
		$html = (string) ob_get_clean();

		$this->assertStringContainsString(
			'name="corsen_context_settings[enabled_tools][]" value=""',
			$html
		);
		$this->assertStringContainsString( 'Uncheck all to expose no callable tools.', $html );
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
