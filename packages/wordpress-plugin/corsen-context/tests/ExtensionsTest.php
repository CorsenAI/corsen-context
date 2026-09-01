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
		$this->assertNull( Corsen_Context_Expert::validate( array_merge( $good, array( 'message' => 'Mon mot de passe wordpress est: S3cr3tPass!' ) ) ) );
		$this->assertNull( Corsen_Context_Expert::validate( array_merge( $good, array( 'message' => 'ma clé API sk-proj-abcdef1234567890 pour avancer' ) ) ) );
		$this->assertNull( Corsen_Context_Expert::validate( array_merge( $good, array( 'message' => 'voici mon jeton github_pat_11ABCDEFGH0123456789abcdefghij' ) ) ) );
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
		$this->assertSame( 'rate_limited', $outcome['code'] );
		$this->assertGreaterThanOrEqual( 60, (int) $outcome['retry_after'] );
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
		$this->assertSame( 'invalid_params', $both['code'] );
	}

	/**
	 * Modern WooCommerce (HPOS era) has no wc_get_product_id_by_slug() global:
	 * slug lookup must go through WC_Product_Query. Regression guard for the
	 * live bug where the active-gate required that removed function.
	 */
	/**
	 * Simulate a modern (HPOS-era) WooCommerce runtime once per process.
	 */
	private function ensure_modern_woo_runtime(): void {
		if ( ! class_exists( 'WooCommerce' ) ) {
			eval( 'class WooCommerce {}' ); // phpcs:ignore Squiz.PHP.Eval.Discouraged -- Global stub for a runtime we are simulating.
		}
		if ( ! class_exists( 'WC_Product_Query' ) ) {
			eval(
				'class WC_Product_Query_Fixture_Stub { public function __construct( $args ) {} public function get_products() { return array( 4242 ); } } ' .
				'class_alias( WC_Product_Query_Fixture_Stub::class, "WC_Product_Query" );'
			); // phpcs:ignore Squiz.PHP.Eval.Discouraged -- Global stub for a runtime we are simulating.
		}
		if ( ! function_exists( 'wc_get_product' ) ) {
			eval(
				'class WC_Product { public $data; public function __construct( $data = array() ) { $this->data = $data; } ' .
				'public function get_price() { return $this->data["price"] ?? null; } ' .
				'public function is_in_stock() { return ! empty( $this->data["instock"] ); } ' .
				'public function get_image_id() { return (int) ( $this->data["image_id"] ?? 0 ); } } ' .
				'function wc_get_product( $id ) { return isset( $GLOBALS["corsen_fix_product"] ) && $GLOBALS["corsen_fix_product"] instanceof WC_Product ? $GLOBALS["corsen_fix_product"] : null; }'
			); // phpcs:ignore Squiz.PHP.Eval.Discouraged -- Global stubs: modern Woo runtime we are simulating.
		}
	}

	public function test_get_product_slug_lookup_modern_woocommerce_path(): void {
		$this->ensure_modern_woo_runtime();
		$this->assertTrue( Corsen_Context_Products::woocommerce_active(), 'Gate must trust class + wc_get_product only.' );
		$this->settings(
			array(
				'enabled_tools' => $this->enable_all_core_plus( 'get_product' ),
				'post_types'    => array( 'post', 'page', 'product' ),
			)
		);
		$server  = new Corsen_Context_MCP_Server();
		$outcome = $server->execute_tool( 'get_product', array( 'slug' => 'modern-product' ) );
		$this->assertFalse( $outcome['ok'] );
		$this->assertStringNotContainsString( 'not active', $outcome['error'] );
		$this->assertStringContainsString( 'Product not found or not published', $outcome['error'] );
	}

	/**
	 * v1.5.2: every known tool must declare annotations explicitly, and an
	 * unknown tool must never be advertised as a read.
	 */
	public function test_annotations_are_explicit_and_fail_closed(): void {
		foreach ( Corsen_Context_Tool_Registry::known() as $name ) {
			$a = Corsen_Context_WebMCP::annotations_for( $name );
			$this->assertSame(
				'request_expert_call' !== $name,
				$a['readOnlyHint'],
				$name . ' must declare the correct readOnlyHint explicitly.'
			);
		}
		$fall = Corsen_Context_WebMCP::annotations_for( 'some_future_write_tool' );
		$this->assertFalse( $fall['readOnlyHint'] );
		$this->assertTrue( $fall['untrustedContentHint'] );
	}

	/**
	 * v1.5.2: WooCommerce transactional pages (cart/checkout/account) are
	 * excluded from machine surfaces even when pages are allowed.
	 */
	public function test_woo_system_pages_never_exposed(): void {
		$post            = new \WP_Post();
		$post->ID        = 101;
		$post->post_type = 'page';
		$post->post_name = 'cart';
		$GLOBALS['corsen_test_posts'] = array( $post );
		$this->settings( array( 'post_types' => array( 'post', 'page' ) ) );
		$server = new Corsen_Context_MCP_Server();
		// Control: without the Woo pointer, the page is exposed.
		$base   = $server->execute_tool( 'list_content', array( 'type' => 'page' ) );
		$this->assertCount( 1, $base['result']['items'] );
		// WooCommerce declares page 101 as its cart page.
		$GLOBALS['corsen_test_options']['woocommerce_cart_page_id'] = 101;
		$server2  = new Corsen_Context_MCP_Server();
		$outcome  = $server2->execute_tool( 'list_content', array( 'type' => 'page' ) );
		$this->assertCount( 0, $outcome['result']['items'] );
		unset( $GLOBALS['corsen_test_options']['woocommerce_cart_page_id'], $GLOBALS['corsen_test_posts'] );
	}

	/**
	 * v1.5.2: successful tool calls carry typed structuredContent; list-shaped
	 * results are wrapped under items (MCP requires an object root).
	 */
	public function test_success_results_carry_structured_content(): void {
		$this->settings();
		$server = new Corsen_Context_MCP_Server();
		$method = new \ReflectionMethod( $server, 'handle_call_tool' );
		$method->setAccessible( true );
		$response = $method->invoke( $server, array( 'name' => 'get_sitemap', 'arguments' => array() ), 'req-1' );
		$data     = $response->get_data();
		$this->assertIsArray( $data['result']['structuredContent'] );
		$this->assertArrayHasKey( 'items', $data['result']['structuredContent'] );
		$this->assertSame( $data['result']['structuredContent']['items'], json_decode( $data['result']['content'][0]['text'], true ) );
		$this->assertFalse( $data['result']['isError'] );
	}

	/**
	 * v1.5.1: images are {url,width,height,alt} descriptors, not bare URLs.
	 */
	public function test_media_descriptor_shape(): void {
		$GLOBALS['corsen_test_postmeta'][7]['_wp_attachment_image_alt'] = 'Capture atelier';
		$m = Corsen_Context_Products::media( 7 );
		$this->assertSame( 'https://example.com/img.jpg', $m['url'] );
		$this->assertSame( 800, $m['width'] );
		$this->assertSame( 600, $m['height'] );
		$this->assertSame( 'Capture atelier', $m['alt'] );
		unset( $GLOBALS['corsen_test_postmeta'][7] );
		$this->assertNull( Corsen_Context_Products::media( 7 )['alt'] );
		$this->assertNull( Corsen_Context_Products::media( 0 ) );
	}

	/**
	 * v1.5.1: list_content(type=product) carries compact commercial fields
	 * only while the owner exposes get_product (1 call replaces 1+N).
	 */
	public function test_list_content_product_enrichment(): void {
		$this->ensure_modern_woo_runtime();
		$post                    = new \WP_Post();
		$post->ID                = 123;
		$post->post_type         = 'product';
		$post->post_name         = 'gants-latin';
		$GLOBALS['corsen_test_posts'] = array( $post );
		$this->settings(
			array(
				'enabled_tools' => $this->enable_all_core_plus( 'get_product' ),
				'post_types'    => array( 'post', 'page', 'product' ),
			)
		);
		$GLOBALS['corsen_fix_product'] = new \WC_Product( array( 'price' => '19.90', 'instock' => true, 'image_id' => 7 ) );
		$server  = new Corsen_Context_MCP_Server();
		$outcome = $server->execute_tool( 'list_content', array( 'type' => 'product' ) );
		$this->assertTrue( $outcome['ok'] );
		$item = $outcome['result']['items'][0];
		$this->assertSame( 'gants-latin', $item['slug'] );
		$this->assertSame( 19.9, $item['price'] );
		$this->assertSame( 'EUR', $item['currency'] );
		$this->assertTrue( $item['inStock'] );
		$this->assertIsArray( $item['image'] );
		$this->assertSame( 'https://example.com/img.jpg', $item['image']['url'] );
		// Owner hides get_product again: fields disappear (fail-closed parity).
		$this->settings( array( 'post_types' => array( 'post', 'page', 'product' ) ) );
		$server2 = new Corsen_Context_MCP_Server();
		$out2    = $server2->execute_tool( 'list_content', array( 'type' => 'product' ) );
		$this->assertArrayNotHasKey( 'price', $out2['result']['items'][0] );
		unset( $GLOBALS['corsen_test_posts'], $GLOBALS['corsen_fix_product'] );
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
