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
		unset( $GLOBALS['corsen_test_filters']['corsen_context_can_expose_post'] );
		unset( $GLOBALS['corsen_fix_product'], $GLOBALS['corsen_fix_products'], $GLOBALS['corsen_test_posts_by_id'], $GLOBALS['corsen_test_permalink'], $GLOBALS['corsen_test_public_post_types'] );
	}

	public function test_registry_split(): void {
		$this->assertCount( 4, Corsen_Context_Tool_Registry::CORE_TOOLS );
		$this->assertCount( 9, Corsen_Context_Tool_Registry::known() );
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
		// Checked but the separate owner feature gate is off: never exposed.
		$this->settings( array( 'enabled_tools' => $all ) );
		$this->assertNotContains( 'request_expert_call', $this->exposed() );
		$server  = new Corsen_Context_MCP_Server();
		$outcome = $server->execute_tool(
			'request_expert_call',
			array( 'name' => 'X', 'email' => 'x@example.com', 'message' => 'hi' )
		);
		$this->assertFalse( $outcome['ok'] );
		$this->assertTrue( $outcome['protocol_error'] );
		// Explicitly enabled: exposed on the same surface; no email is required
		// because tool execution never stores or sends a submission.
		$this->settings(
			array(
				'enabled_tools'       => $all,
				'expert_enabled'      => true,
				'expert_handoff_url'  => home_url( '/contact/' ),
			)
		);
		$this->assertContains( 'request_expert_call', $this->exposed() );
		$this->settings(
			array(
				'enabled_tools'       => $all,
				'expert_enabled'      => true,
				'expert_handoff_url'  => 'https://foreign.example/contact/',
			)
		);
		$this->assertNotContains( 'request_expert_call', $this->exposed(), 'A foreign handoff destination must fail closed.' );
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
		$openai_shaped = 'sk-' . 'proj-' . str_repeat( 'a', 20 );
		$github_shaped = 'github_' . 'pat_' . str_repeat( 'b', 24 );
		$this->assertNull( Corsen_Context_Expert::validate( array_merge( $good, array( 'message' => 'ma clé API ' . $openai_shaped . ' pour avancer' ) ) ) );
		$this->assertNull( Corsen_Context_Expert::validate( array_merge( $good, array( 'message' => 'voici mon jeton ' . $github_shaped ) ) ) );
		$this->assertNull( Corsen_Context_Expert::validate( array_merge( $good, array( 'website' => 'javascript:alert(1)' ) ) ) );
		$this->assertIsArray( Corsen_Context_Expert::validate( array_merge( $good, array( 'website' => 'https://corp.fr' ) ) ) );
		$this->assertIsArray( Corsen_Context_Expert::validate( array( 'name' => str_repeat( 'é', 120 ), 'email' => 'marie@corp.fr', 'message' => str_repeat( '🙂', 2000 ) ) ) );
		$this->assertNull( Corsen_Context_Expert::validate( array_merge( $good, array( 'website' => array( 'https://corp.fr' ) ) ) ) );
		$this->assertNull( Corsen_Context_Expert::validate( array_merge( $good, array( 'stack' => str_repeat( 'é', 81 ) ) ) ) );
	}

	public function test_expert_mcp_call_is_human_only_and_legacy_owner_helper_is_not_on_the_tool_path(): void {
		$this->settings(
			array(
				'enabled_tools'      => $this->enable_all_core_plus( 'request_expert_call' ),
				'expert_enabled'     => true,
				'expert_handoff_url' => home_url( '/contact/#expert-form' ),
				'expert_email'       => 'owner@corsen.ai',
				'expert_notify'      => true,
			)
		);
		$good = array(
			'name'    => 'Marie',
			'email'   => 'marie@corp.fr',
			'website' => 'https://corp.fr',
			'stack'   => 'WordPress',
			'message' => 'Parlons pricing.',
		);
		// Governed surface (1.5.12): every agent call is refused, with the
		// handoff URL, BEFORE anything else runs. No insert, no mail.
		$server  = new Corsen_Context_MCP_Server();
		$outcome = $server->execute_tool( 'request_expert_call', $good );
		$this->assertFalse( $outcome['ok'] );
		$this->assertSame( 'human_only', $outcome['code'] );
		$this->assertStringContainsString( 'humans only', $outcome['error'] );
		$this->assertStringContainsString( home_url( '/contact/#expert-form' ), $outcome['error'] );
		$this->assertSame( array(), $GLOBALS['corsen_test_inserts'] );
		// The pre-1.5.12 owner-side compatibility helper remains callable only
		// from trusted PHP code; it is not connected to MCP/WebMCP execution.
		$stored = Corsen_Context_Expert::store_submission( Corsen_Context_Expert::validate( $good ) );
		$this->assertTrue( $stored['ok'] );
		$this->assertTrue( $stored['result']['queued'] );
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
				'enabled_tools'      => $this->enable_all_core_plus( 'request_expert_call' ),
				'expert_enabled'     => true,
				'expert_handoff_url' => home_url( '/contact/' ),
				'expert_email'       => 'owner@corsen.ai',
			)
		);
		$key = 'corsen_expt_' . substr( hash_hmac( 'sha256', Corsen_Context_Security::get_client_ip(), wp_salt( 'auth' ) ), 0, 32 );
		$GLOBALS['corsen_test_transients'][ $key ] = 5;
		// Throttle guards the storage path (the MCP path never reaches it:
		// human-only refusal happens first).
		$outcome = Corsen_Context_Expert::store_submission(
			Corsen_Context_Expert::validate( array( 'name' => 'A', 'email' => 'a@b.fr', 'message' => 'hello' ) )
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
				'public function get_id() { return (int) ($this->data["id"] ?? 0); } ' .
				'public function get_price() { return $this->data["price"] ?? null; } ' .
				'public function get_regular_price() { return $this->data["regular"] ?? null; } ' .
				'public function get_sale_price() { return $this->data["sale"] ?? null; } ' .
				'public function get_short_description() { return $this->data["description"] ?? ""; } ' .
				'public function get_slug() { return $this->data["slug"] ?? "product"; } ' .
				'public function get_type() { return $this->data["type"] ?? "simple"; } ' .
				'public function get_sku() { return $this->data["sku"] ?? ""; } ' .
				'public function get_price_html() { return $this->data["price_html"] ?? ""; } ' .
				'public function is_on_sale() { return ! empty($this->data["on_sale"]); } ' .
				'public function is_purchasable() { return $this->data["purchasable"] ?? true; } ' .
				'public function is_in_stock() { return ! empty( $this->data["instock"] ); } ' .
				'public function get_stock_status() { return $this->data["stock_status"] ?? "instock"; } ' .
				'public function get_image_id() { return (int) ( $this->data["image_id"] ?? 0 ); } ' .
				'public function get_gallery_image_ids() { return $this->data["gallery"] ?? array(); } ' .
				'public function managing_stock() { return ! empty($this->data["managing_stock"]); } ' .
				'public function get_stock_quantity() { return $this->data["stock_quantity"] ?? null; } ' .
				'public function get_children() { return $this->data["children"] ?? array(); } ' .
				'public function get_status() { return $this->data["status"] ?? "publish"; } ' .
				'public function variation_is_visible() { return $this->data["visible"] ?? true; } ' .
				'public function get_parent_id() { return (int) ($this->data["parent_id"] ?? 0); } ' .
				'public function get_attributes() { return $this->data["attributes"] ?? array(); } } ' .
				'function wc_get_product( $id ) { if ( isset($GLOBALS["corsen_fix_products"][(int) $id]) ) { return $GLOBALS["corsen_fix_products"][(int) $id]; } return isset( $GLOBALS["corsen_fix_product"] ) && $GLOBALS["corsen_fix_product"] instanceof WC_Product ? $GLOBALS["corsen_fix_product"] : null; }'
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
		$this->assertStringContainsString( 'Product not found or not exposed', $outcome['error'] );
	}

	/**
	 * Audit 2026-09-01 (LIVE): get_product(slug) silently served a DIFFERENT
	 * product because the query arg was ignored and the first ID won. The
	 * resolver must verify the stored post_name and never trade entities.
	 */
	public function test_get_product_slug_never_serves_a_different_product(): void {
		$this->ensure_modern_woo_runtime();
		if ( ! function_exists( 'get_page_by_path' ) ) {
			eval( 'if ( ! defined( \'OBJECT\' ) ) { define( \'OBJECT\', \'OBJECT\' ); } function get_page_by_path( $path, $output = OBJECT, $type = \'post\' ) { return $GLOBALS[\'corsen_test_page_by_path\'] ?? null; }' ); // phpcs:ignore Squiz.PHP.Eval.Discouraged -- Simulating WP core function for the unit run.
		}
		$this->settings(
			array(
				'enabled_tools' => $this->enable_all_core_plus( 'get_product' ),
				'post_types'    => array( 'post', 'page', 'product' ),
			)
		);
		$wrong                = new \WP_Post();
		$wrong->ID            = 4242;
		$wrong->post_type     = 'product';
		$wrong->post_status   = 'publish';
		$wrong->post_name     = 'corsen-context-mediawiki';
		$GLOBALS['corsen_test_page_by_path'] = $wrong;
		$GLOBALS['corsen_test_post']         = $wrong;
		$GLOBALS['corsen_fix_product']       = new \WC_Product( array( 'price' => 9, 'instock' => true ) );
		$server                              = new Corsen_Context_MCP_Server();
		$outcome                             = $server->execute_tool( 'get_product', array( 'slug' => 'corsen-context' ) );
		$this->assertFalse( $outcome['ok'], 'A slug matching no product must never return another product.' );
		$this->assertStringNotContainsString( 'mediawiki', strtolower( (string) wp_json_encode( $outcome ) ) );
		unset( $GLOBALS['corsen_test_page_by_path'], $GLOBALS['corsen_fix_product'] );
	}

	/**
	 * The slug branch must obey the owner exclusion policy exactly like the
	 * URI branch (audit 2026-09-01: it skipped it entirely).
	 */
	public function test_get_product_slug_branch_respects_owner_exclusion(): void {
		$this->ensure_modern_woo_runtime();
		$this->settings(
			array(
				'enabled_tools' => $this->enable_all_core_plus( 'get_product' ),
				'post_types'    => array( 'post', 'page', 'product' ),
			)
		);
		$right                       = new \WP_Post();
		$right->ID                   = 4242;
		$right->post_type            = 'product';
		$right->post_status          = 'publish';
		$right->post_name            = 'modern-product';
		$GLOBALS['corsen_test_page_by_path'] = $right;
		$GLOBALS['corsen_test_post']         = $right;
		$GLOBALS['corsen_fix_product']       = new \WC_Product( array( 'price' => 9, 'instock' => true ) );
		$GLOBALS['corsen_test_url_to_postid'] = 0; // owner policy cannot resolve the permalink to an exposed post.
		$server                              = new Corsen_Context_MCP_Server();
		$outcome                             = $server->execute_tool( 'get_product', array( 'slug' => 'modern-product' ) );
		$this->assertFalse( $outcome['ok'], 'Slug lookups must pass the same exposure gate as URIs.' );
		$this->assertStringContainsString( 'not exposed', $outcome['error'] );
		unset( $GLOBALS['corsen_test_page_by_path'], $GLOBALS['corsen_fix_product'], $GLOBALS['corsen_test_url_to_postid'] );
	}

	public function test_get_product_uri_honors_membership_visibility_veto(): void {
		$this->ensure_modern_woo_runtime();
		$this->settings(
			array(
				'enabled_tools' => $this->enable_all_core_plus( 'get_product' ),
				'post_types'    => array( 'post', 'page', 'product' ),
			)
		);
		$product                = new \WP_Post();
		$product->ID            = 4242;
		$product->post_type     = 'product';
		$product->post_status   = 'publish';
		$product->post_name     = 'members-only';
		$GLOBALS['corsen_test_post']          = $product;
		$GLOBALS['corsen_test_url_to_postid'] = 4242;
		$GLOBALS['corsen_test_filters']['corsen_context_can_expose_post'] = static function (): bool {
			return false;
		};

		$outcome = Corsen_Context_Products::execute( array( 'slug' => '', 'uri' => home_url( '/product/members-only/' ) ) );
		$this->assertFalse( $outcome['ok'] );
		$this->assertStringContainsString( 'not a public same-site URL', $outcome['error'] );
	}

	public function test_extension_policy_ignores_root_exclusion_and_never_allows_attachments(): void {
		$this->settings(
			array(
				'exclude_paths' => '/',
				'post_types'    => array( 'post', 'page', 'attachment' ),
			)
		);
		$GLOBALS['corsen_test_public_post_types'] = array(
			'post'       => 'Posts',
			'page'       => 'Pages',
			'attachment' => 'Media',
		);
		$this->assertTrue( Corsen_Context_Tool_Registry::public_url_ok( home_url( '/public-page/' ) ) );
		$this->assertFalse( Corsen_Context_Tool_Registry::allows_type( 'attachment' ) );
	}

	public function test_forbidden_product_policy_page_honors_visibility_veto(): void {
		$this->ensure_modern_woo_runtime();
		$this->settings( array( 'post_types' => array( 'post', 'page', 'product' ) ) );
		$product              = new \WP_Post();
		$product->ID          = 4242;
		$product->post_type   = 'product';
		$product->post_status = 'publish';
		$GLOBALS['corsen_test_posts']          = array( 4242 );
		$GLOBALS['corsen_test_post']           = $product;
		$GLOBALS['corsen_test_url_to_postid']  = 4242;
		$GLOBALS['corsen_fix_product']         = new \WC_Product( array( 'id' => 4242, 'name' => 'Private product' ) );
		$GLOBALS['corsen_test_postmeta'][4242][ Corsen_Context_Agent_Policy::META_KEY ] = Corsen_Context_Agent_Policy::FORBIDDEN;
		$GLOBALS['corsen_test_filters']['corsen_context_can_expose_post'] = static function (): bool {
			return false;
		};

		$this->assertSame( array(), Corsen_Context_Agent_Policy::forbidden_products() );
	}

	public function test_get_product_slug_requires_exposure_of_the_same_product_id(): void {
		$this->ensure_modern_woo_runtime();
		if ( ! function_exists( 'get_page_by_path' ) ) {
			eval( 'if ( ! defined( \'OBJECT\' ) ) { define( \'OBJECT\', \'OBJECT\' ); } function get_page_by_path( $path, $output = OBJECT, $type = \'post\' ) { return $GLOBALS[\'corsen_test_page_by_path\'] ?? null; }' ); // phpcs:ignore Squiz.PHP.Eval.Discouraged -- Simulating WP core function for the unit run.
		}
		$this->settings(
			array(
				'enabled_tools' => $this->enable_all_core_plus( 'get_product' ),
				'post_types'    => array( 'post', 'page', 'product' ),
			)
		);
		$product              = new \WP_Post();
		$product->ID          = 4242;
		$product->post_type   = 'product';
		$product->post_status = 'publish';
		$product->post_name   = 'expected';
		$other                = clone $product;
		$other->ID            = 999;
		$other->post_name     = 'other';
		$GLOBALS['corsen_test_page_by_path'] = $product;
		$GLOBALS['corsen_test_posts_by_id']   = array( 4242 => $product, 999 => $other );
		$GLOBALS['corsen_test_url_to_postid'] = 999;
		$GLOBALS['corsen_fix_product']        = new \WC_Product( array( 'id' => 4242 ) );

		$outcome = Corsen_Context_Products::execute( array( 'slug' => 'expected', 'uri' => '' ) );
		$this->assertFalse( $outcome['ok'] );
		$this->assertStringContainsString( 'not exposed', $outcome['error'] );
	}

	public function test_product_payload_keeps_utf8_and_excludes_private_or_hidden_variants(): void {
		$this->ensure_modern_woo_runtime();
		$parent = new \WC_Product(
			array(
				'id'          => 500,
				'type'        => 'variable',
				'description' => str_repeat( '€', 600 ),
				'children'    => array( 501, 502, 503 ),
			)
		);
		$GLOBALS['corsen_fix_products'] = array(
			501 => new \WC_Product( array( 'id' => 501, 'parent_id' => 500, 'status' => 'private', 'visible' => true, 'sku' => 'private' ) ),
			502 => new \WC_Product( array( 'id' => 502, 'parent_id' => 500, 'status' => 'publish', 'visible' => false, 'sku' => 'hidden' ) ),
			503 => new \WC_Product( array( 'id' => 503, 'parent_id' => 500, 'status' => 'publish', 'visible' => true, 'sku' => 'public', 'price' => '9.00', 'instock' => true ) ),
		);
		$method = new ReflectionMethod( Corsen_Context_Products::class, 'serialize_product' );
		$method->setAccessible( true );
		$data = $method->invoke( null, $parent );

		$this->assertLessThanOrEqual( 1500, strlen( $data['description'] ) );
		$this->assertTrue( mb_check_encoding( $data['description'], 'UTF-8' ) );
		$this->assertSame( array( 'public' ), array_column( $data['variants'], 'sku' ) );
		$this->assertFalse( $data['truncated'] );
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
		$product_schema = Corsen_Context_Products::definition()['inputSchema'];
		$this->assertCount( 2, $product_schema['oneOf'] );
		$this->assertSame( array( 'slug' ), $product_schema['oneOf'][0]['required'] );
		$this->assertSame( array( 'uri' ), $product_schema['oneOf'][1]['required'] );
		$this->assertNull( Corsen_Context_Products::validate( array() ) );
		$this->assertNull( Corsen_Context_Products::validate( array( 'slug' => 'bad slug!' ) ) );
		$this->assertNull( Corsen_Context_Products::validate( array( 'slug' => 'bad%ZZslug' ) ) );
		$this->assertNull( Corsen_Context_Products::validate( array( 'slug' => 'folder/product' ) ) );
		$this->assertNull( Corsen_Context_Products::validate( array( 'slug' => 'ok', 'extra' => 1 ) ) );
		$this->assertSame(
			array( 'slug' => 'bonnet', 'uri' => '' ),
			Corsen_Context_Products::validate( array( 'slug' => 'bonnet' ) )
		);
		$this->assertSame(
			'%d7%9e%d7%95%d7%a6%d7%a8',
			Corsen_Context_Products::validate( array( 'slug' => '%d7%9e%d7%95%d7%a6%d7%a8' ) )['slug']
		);
		$this->assertIsArray( Corsen_Context_Products::validate( array( 'uri' => 'https://example.com/' . str_repeat( 'é', 1980 ) ) ) );
	}

	public function test_structured_data_schema_matches_unicode_aware_validator(): void {
		$schema = Corsen_Context_Structured_Data::definition()['inputSchema'];
		$this->assertSame( array( 'uri' ), $schema['required'] );
		$this->assertNull( Corsen_Context_Structured_Data::validate( array() ) );
		$this->assertIsArray(
			Corsen_Context_Structured_Data::validate(
				array( 'uri' => 'https://example.com/' . str_repeat( 'é', 1980 ) )
			)
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
				'expert_enabled'     => true,
				'expert_handoff_url' => home_url( '/contact/' ),
				'expert_email'       => 'owner@corsen.ai',
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
				'enabled'             => '1',
				'enabled_tools'       => array( 'search_site', 'get_product', 'request_expert_call', 'evil' ),
				'expert_enabled'      => '1',
				'expert_handoff_url'  => home_url( '/contact/#form' ),
				'expert_email'        => 'Owner@Corsen.ai',
				'audit_enabled'       => '1',
			)
		);
		$this->assertSame( array( 'search_site', 'get_product', 'request_expert_call' ), $clean['enabled_tools'] );
		$this->assertTrue( $clean['expert_enabled'] );
		$this->assertSame( home_url( '/contact/#form' ), $clean['expert_handoff_url'] );
		$this->assertSame( 'owner@corsen.ai', $clean['expert_email'] );
		$this->assertTrue( $clean['audit_enabled'] );
		$foreign = $admin->sanitize_settings( array( 'expert_enabled' => '1', 'expert_handoff_url' => 'https://foreign.example/contact/' ) );
		$this->assertSame( '', $foreign['expert_handoff_url'] );
	}
}
