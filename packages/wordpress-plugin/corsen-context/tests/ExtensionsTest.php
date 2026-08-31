<?php
/**
 * WordPress-only extension tools: registry separation, get_product,
 * request_expert_call, audit guard and the abilities layer for extensions.
 *
 * @package Corsen_Context
 */

class ExtensionsTest extends WP_UnitTestCase {

	private function settings( array $override = array() ): void {
		$GLOBALS['corsen_test_options']['corsen_context_settings'] = array_merge(
			array(
				'enabled'       => true,
				'mcp_enabled'   => true,
				'post_types'    => array( 'post', 'page' ),
				'enabled_tools' => Corsen_Context_Tool_Registry::CORE_TOOLS,
			),
			$override
		);
	}

	private function exposed(): array {
		$server = new Corsen_Context_MCP_Server();
		return array_column( $server->get_tool_definitions(), 'name' );
	}

	private function enable_all_core_plus( string $tool ): array {
		return array_merge( Corsen_Context_Tool_Registry::CORE_TOOLS, array( $tool ) );
	}

	protected function setUp(): void {
		parent::setUp();
		$GLOBALS['corsen_test_transients']  = array();
		$GLOBALS['corsen_test_abilities']   = array();
		$GLOBALS['corsen_test_mails']       = array();
		$GLOBALS['corsen_test_inserts']     = array();
		$GLOBALS['corsen_test_postmeta']    = array();
		$GLOBALS['corsen_test_found_posts'] = 0;
		$GLOBALS['corsen_test_options']     = array();
	}

	public function test_registry_split(): void {
		$this->assertCount( 4, Corsen_Context_Tool_Registry::CORE_TOOLS );
		$this->assertCount( 6, Corsen_Context_Tool_Registry::known() );
		$this->assertTrue( Corsen_Context_Tool_Registry::is_optional( 'get_product' ) );
		$this->assertFalse( Corsen_Context_Tool_Registry::is_optional( 'search_site' ) );
		$this->assertNull( Corsen_Context_Tool_Registry::extension_definition( 'search_site' ) );
		$this->assertIsArray( Corsen_Context_Tool_Registry::extension_definition( 'get_product' ) );
	}

	public function test_default_surface_is_core_only(): void {
		$this->settings();
		$this->assertSame( Corsen_Context_Tool_Registry::CORE_TOOLS, $this->exposed() );
	}

	public function test_get_product_exposed_only_when_checked_in_registry_order(): void {
		$this->settings( array( 'enabled_tools' => $this->enable_all_core_plus( 'get_product' ) ) );
		$this->assertSame(
			array( 'search_site', 'get_page_content', 'list_content', 'get_sitemap', 'get_product' ),
			$this->exposed()
		);
	}

	public function test_expert_hidden_until_configured(): void {
		$all = $this->enable_all_core_plus( 'request_expert_call' );
		// Checked but no destination: never exposed, never callable.
		$this->settings( array( 'enabled_tools' => $all ) );
		$this->assertNotContains( 'request_expert_call', $this->exposed() );
		$server  = new Corsen_Context_MCP_Server();
		$outcome = $server->execute_tool(
			'request_expert_call',
			array( 'name' => 'X', 'email' => 'x@example.com', 'message' => 'hi' )
		);
		$this->assertFalse( $outcome['ok'] );
		$this->assertTrue( $outcome['protocol_error'] );
		// Configured: exposed on the same surface.
		$this->settings(
			array(
				'enabled_tools'  => $all,
				'expert_enabled' => true,
				'expert_email'   => 'owner@corsen.ai',
			)
		);
		$this->assertContains( 'request_expert_call', $this->exposed() );
	}

	public function test_expert_validate_rules(): void {
		$good = array(
			'name'    => 'Marie',
			'email'   => 'marie@corp.fr',
			'message' => 'Parlons de notre projet.',
		);
		$clean = Corsen_Context_Expert::validate( $good );
		$this->assertIsArray( $clean );
		$this->assertSame( 'marie@corp.fr', $clean['email'] );
		$this->assertNull( Corsen_Context_Expert::validate( array_merge( $good, array( 'unknown' => 'x' ) ) ) );
		$this->assertNull( Corsen_Context_Expert::validate( array( 'name' => 'X', 'message' => 'hi' ) ) );
		$this->assertNull( Corsen_Context_Expert::validate( array_merge( $good, array( 'email' => 'not-an-email' ) ) ) );
		$this->assertNull( Corsen_Context_Expert::validate( array_merge( $good, array( 'message' => 'mon api_key: sk-abcdefghijkl1234' ) ) ) );
		$this->assertNull( Corsen_Context_Expert::validate( array_merge( $good, array( 'website' => 'javascript:alert(1)' ) ) ) );
		$this->assertIsArray( Corsen_Context_Expert::validate( array_merge( $good, array( 'website' => 'https://corp.fr' ) ) ) );
	}

	public function test_expert_execute_stores_private_submission_and_notifies(): void {
		$this->settings(
			array(
				'enabled_tools'  => $this->enable_all_core_plus( 'request_expert_call' ),
				'expert_enabled' => true,
				'expert_email'   => 'owner@corsen.ai',
				'expert_notify'  => true,
			)
		);
		$server  = new Corsen_Context_MCP_Server();
		$outcome = $server->execute_tool(
			'request_expert_call',
			array(
				'name'    => 'Marie',
				'email'   => 'marie@corp.fr',
				'website' => 'https://corp.fr',
				'stack'   => 'WordPress',
				'message' => 'Parlons pricing.',
			)
		);
		$this->assertTrue( $outcome['ok'] );
		$this->assertTrue( $outcome['result']['queued'] );
		$this->assertCount( 1, $GLOBALS['corsen_test_inserts'] );
		$this->assertSame( 'cc_expert_request', $GLOBALS['corsen_test_inserts'][0]['post_type'] );
		$this->assertSame( 'private', $GLOBALS['corsen_test_inserts'][0]['post_status'] );
		$this->assertSame( 'marie@corp.fr', $GLOBALS['corsen_test_postmeta'][99]['_cc_expert_email'] );
		$this->assertCount( 1, $GLOBALS['corsen_test_mails'] );
		$this->assertSame( 'owner@corsen.ai', $GLOBALS['corsen_test_mails'][0]['to'] );
	}

	public function test_expert_throttle_rejects_sixth_request(): void {
		$this->settings(
			array(
				'enabled_tools'  => $this->enable_all_core_plus( 'request_expert_call' ),
				'expert_enabled' => true,
				'expert_email'   => 'owner@corsen.ai',
			)
		);
		$key = 'corsen_expt_' . substr( hash_hmac( 'sha256', Corsen_Context_Security::get_client_ip(), wp_salt( 'auth' ) ), 0, 32 );
		$GLOBALS['corsen_test_transients'][ $key ] = 5;
		$server  = new Corsen_Context_MCP_Server();
		$outcome = $server->execute_tool(
			'request_expert_call',
			array( 'name' => 'A', 'email' => 'a@b.fr', 'message' => 'hello' )
		);
		$this->assertFalse( $outcome['ok'] );
		$this->assertStringContainsString( 'Too many requests', $outcome['error'] );
		$this->assertSame( array(), $GLOBALS['corsen_test_inserts'] );
	}

	public function test_get_product_execute_fail_closed_chain(): void {
		$enabled = array( 'enabled_tools' => $this->enable_all_core_plus( 'get_product' ) );
		$server  = new Corsen_Context_MCP_Server();
		// 1) Owner did not select the product post type.
		$this->settings( $enabled );
		$outcome = $server->execute_tool( 'get_product', array( 'slug' => 'widget' ) );
		$this->assertFalse( $outcome['ok'] );
		$this->assertStringContainsString( 'does not expose product content', $outcome['error'] );
		// 2) Selected, but WooCommerce is absent.
		$this->settings(
			array_merge(
				$enabled,
				array( 'post_types' => array( 'post', 'page', 'product' ) )
			)
		);
		$outcome = $server->execute_tool( 'get_product', array( 'slug' => 'widget' ) );
		$this->assertFalse( $outcome['ok'] );
		$this->assertStringContainsString( 'WooCommerce is not active', $outcome['error'] );
		// 3) Selector rules: both selectors at once is an invalid call.
		$both = $server->execute_tool(
			'get_product',
			array( 'slug' => 'a', 'uri' => 'https://example.org/x' )
		);
		$this->assertFalse( $both['ok'] );
		$this->assertStringContainsString( 'Invalid tool parameters', $both['error'] );
	}

	public function test_get_product_validate(): void {
		$this->assertNull( Corsen_Context_Products::validate( array() ) );
		$this->assertNull( Corsen_Context_Products::validate( array( 'slug' => 'bad slug!' ) ) );
		$this->assertNull( Corsen_Context_Products::validate( array( 'slug' => 'ok', 'extra' => 1 ) ) );
		$this->assertSame(
			array( 'slug' => 'bonnet', 'uri' => '' ),
			Corsen_Context_Products::validate( array( 'slug' => 'bonnet' ) )
		);
	}

	public function test_audit_wrapper_survives_off_and_missing_table(): void {
		// Audit off (default): the execute_tool wrapper must be transparent.
		$this->settings();
		$server  = new Corsen_Context_MCP_Server();
		$outcome = $server->execute_tool( 'get_sitemap', array() );
		$this->assertTrue( $outcome['ok'] );
		// Audit on but no table (no wpdb in the unit bootstrap): still transparent.
		$this->settings( array( 'audit_enabled' => true ) );
		$outcome = $server->execute_tool( 'get_sitemap', array() );
		$this->assertTrue( $outcome['ok'] );
		$this->assertFalse( Corsen_Context_Audit::available() );
	}

	public function test_abilities_extension_registration_and_meta(): void {
		$this->settings(
			array(
				'enabled_tools'  => array_merge(
					Corsen_Context_Tool_Registry::CORE_TOOLS,
					array( 'get_product', 'request_expert_call' )
				),
				'expert_enabled' => true,
				'expert_email'   => 'owner@corsen.ai',
			)
		);
		Corsen_Context_Abilities::register_abilities();
		$abilities = $GLOBALS['corsen_test_abilities'];
		$this->assertArrayHasKey( 'corsen-context/get-product', $abilities );
		$this->assertArrayHasKey( 'corsen-context/request-expert-call', $abilities );
		$this->assertTrue( $abilities['corsen-context/get-product']['meta']['annotations']['readonly'] );
		$this->assertFalse( $abilities['corsen-context/request-expert-call']['meta']['annotations']['readonly'] );
		// The execute callback routes through the shared executor: products
		// are not selected here, so it must surface a WP_Error, not a result.
		$result = call_user_func( $abilities['corsen-context/get-product']['execute_callback'], array( 'slug' => 'bonnet' ) );
		$this->assertInstanceOf( 'WP_Error', $result );
	}

	public function test_sanitize_extension_keys(): void {
		$admin = Corsen_Context_Admin::instance();
		$clean = $admin->sanitize_settings(
			array(
				'enabled'        => '1',
				'enabled_tools'  => array( 'search_site', 'get_product', 'request_expert_call', 'evil' ),
				'expert_enabled' => '1',
				'expert_email'   => 'Owner@Corsen.ai',
				'audit_enabled'  => '1',
			)
		);
		$this->assertSame( array( 'search_site', 'get_product', 'request_expert_call' ), $clean['enabled_tools'] );
		$this->assertTrue( $clean['expert_enabled'] );
		$this->assertSame( 'owner@corsen.ai', $clean['expert_email'] );
		$this->assertTrue( $clean['audit_enabled'] );
	}
}
