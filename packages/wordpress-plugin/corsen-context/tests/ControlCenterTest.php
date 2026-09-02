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
		// v1.5 extension tools render as live cards, unchecked by default,
		// and never as exposed until configured (expert) — see dedicated test.
		$this->assertStringContainsString( 'get_product', $html );
		$this->assertStringContainsString( 'request_expert_call', $html );
		$this->assertStringContainsString( 'corsen_context_settings[expert_handoff_url]', $html );
		$this->assertMatchesRegularExpression( '/value="get_product"(?![^>]*checked)/', $html );
		$this->assertMatchesRegularExpression( '/value="request_expert_call"(?![^>]*checked)/', $html );
		$this->assertStringNotContainsString( 'coming', $html );
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

	public function test_expert_purge_remains_available_when_audit_is_off(): void {
		$GLOBALS['corsen_test_can_manage']  = true;
		$GLOBALS['corsen_test_expert_count'] = 3;
		$this->settings( array( 'audit_enabled' => false ) );
		$html = $this->render();
		$this->assertStringContainsString( 'Purge expert requests (3)', $html );
		unset( $GLOBALS['corsen_test_expert_count'] );
	}

	/**
	 * Audit 2026-09-01: saving the Control Center silently turned OFF
	 * hide_user_enumeration and credit, and re-enabled post,page when every
	 * content type had been deliberately unchecked. The form must post a
	 * complete, unambiguous picture of owner intent.
	 */
	public function test_control_center_form_posts_every_owner_boolean(): void {
		$this->settings( array( 'hide_user_enumeration' => true, 'credit' => true ) );
		$html = $this->render();
		$this->assertStringContainsString( 'corsen_context_settings[hide_user_enumeration]', $html );
		$this->assertStringContainsString( 'corsen_context_settings[credit]', $html );
		$this->assertStringContainsString( 'corsen_context_settings[post_types_present]', $html );
	}

	public function test_sanitize_honours_deliberately_empty_content_types(): void {
		$admin  = Corsen_Context_Admin::instance();
		$clean  = $admin->sanitize_settings( array( 'enabled' => '1', 'post_types_present' => '1', 'post_types' => array() ) );
		$this->assertSame( array(), $clean['post_types'] );
		$clean2 = $admin->sanitize_settings( array( 'enabled' => '1', 'post_types_present' => '1' ) );
		$this->assertSame( array(), $clean2['post_types'] );
		$legacy = $admin->sanitize_settings( array( 'enabled' => '1' ) );
		$this->assertSame( array( 'post', 'page' ), $legacy['post_types'] );
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
