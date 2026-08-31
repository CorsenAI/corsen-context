<?php
/**
 * Control Center render smoke tests.
 *
 * @package Corsen_Context
 */

class ControlCenterTest extends WP_UnitTestCase {

	private function settings( array $override ): void {
		$GLOBALS['corsen_test_options']['corsen_context_settings'] = array_merge(
			array(
				'enabled'        => true,
				'mcp_enabled'    => true,
				'llms_txt_enabled' => true,
				'webmcp_enabled' => true,
				'enabled_tools'  => array( 'search_site', 'get_page_content' ),
				'post_types'     => array( 'post', 'page' ),
			),
			$override
		);
	}

	private function render(): string {
		ob_start();
		Corsen_Context_Control_Center::instance()->render_page();
		return (string) ob_get_clean();
	}

	public function test_render_denies_without_capability(): void {
		$GLOBALS['corsen_test_can_manage'] = false;
		$this->settings( array() );
		$this->assertSame( '', $this->render() );
	}

	public function test_render_shows_cards_toggles_and_preview(): void {
		$GLOBALS['corsen_test_can_manage'] = true;
		$this->settings( array() );
		$GLOBALS['corsen_test_transients']['corsen_context_llms_txt'] = "# Site\nline2\nline3";
		$html = $this->render();

		$this->assertStringContainsString( 'Control Center', $html );
		$this->assertStringContainsString( 'corsen_context_settings[enabled]', $html );
		$this->assertStringContainsString( 'corsen_context_settings[mcp_enabled]', $html );
		$this->assertStringContainsString( 'corsen_context_settings[webmcp_enabled]', $html );
		$this->assertStringContainsString( 'corsen_context_settings[enabled_tools][]', $html );
		// Enabled tools checked, disabled tool card unchecked.
		$this->assertMatchesRegularExpression( '/value="search_site"[^>]*checked/', $html );
		$this->assertMatchesRegularExpression( '/value="get_page_content"[^>]*checked/', $html );
		$this->assertMatchesRegularExpression( '/value="get_sitemap"(?![^>]*checked)/', $html );
		// Announced v1.5 tools render as locked "coming" cards, never as live toggles.
		$this->assertStringContainsString( 'get_product', $html );
		$this->assertStringContainsString( 'request_expert_call', $html );
		$this->assertStringNotContainsString( 'value="request_expert_call"', $html );
		// Live agent preview reflects the stored settings.
		$this->assertStringContainsString( 'search_site, get_page_content', $html );
		$this->assertStringContainsString( 'Cached: 18 bytes', $html );
		unset( $GLOBALS['corsen_test_transients']['corsen_context_llms_txt'] );
	}

	public function test_render_master_off_shows_locked_state(): void {
		$GLOBALS['corsen_test_can_manage'] = true;
		$this->settings( array( 'enabled' => false ) );
		$html = $this->render();
		$this->assertStringContainsString( 'Corsen Context is OFF', $html );
		$this->assertStringNotContainsString( 'search_site, get_page_content', $html );
	}

	public function test_sanitize_of_control_center_form_uses_shared_pipeline(): void {
		// The Control Center must reuse the exact sanitizer of the classic page.
		$reflection = new ReflectionMethod( Corsen_Context_Admin::class, 'sanitize_settings' );
		$this->assertTrue( $reflection->isPublic() );
		$admin    = Corsen_Context_Admin::instance();
		$clean    = $admin->sanitize_settings(
			array(
				'enabled'       => '1',
				'enabled_tools' => array( 'search_site', 'evil_tool', '' ),
				'post_types'    => array( 'post', 'secret_type' ),
			)
		);
		$this->assertSame( array( 'search_site' ), $clean['enabled_tools'] );
		$this->assertSame( array( 'post' ), $clean['post_types'] );
	}
}
