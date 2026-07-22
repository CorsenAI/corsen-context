<?php
/** Integration coverage against the official WordPress test suite. */

/**
 * @group integration
 */
final class WordPressIntegrationTest extends WP_UnitTestCase {
	protected function setUp(): void {
		parent::setUp();
		$this->set_permalink_structure( '/%postname%/' );
		update_option(
			'corsen_context_settings',
			array(
				'enabled'           => true,
				'mcp_enabled'       => true,
				'llms_txt_enabled'  => true,
				'llms_full_enabled' => false,
				'post_types'        => array( 'post', 'page' ),
				'exclude_paths'     => '/members',
				'rate_limit'        => 100,
				'credit'            => false,
				'include_author'    => false,
				'cache_ttl'         => 3600,
				'max_pages'         => 500,
				'max_output_bytes'  => 5242880,
			)
		);
		delete_transient( 'corsen_context_llms_txt' );
		delete_transient( 'corsen_context_llms_full_txt' );
		$_COOKIE = array();
	}

	public function test_llms_txt_excludes_non_public_and_configured_paths(): void {
		$public_id = self::factory()->post->create(
			array(
				'post_title'  => 'Public Guide',
				'post_status' => 'publish',
				'post_name'   => 'public-guide',
			)
		);
		self::factory()->post->create(
			array(
				'post_title'    => 'Password Guide',
				'post_status'   => 'publish',
				'post_password' => 'secret',
			)
		);
		self::factory()->post->create(
			array(
				'post_title'  => 'Private Guide',
				'post_status' => 'private',
			)
		);
		$excluded_id = self::factory()->post->create(
			array(
				'post_title'  => 'Members Guide',
				'post_status' => 'publish',
				'post_name'   => 'members',
			)
		);

		$this->assertNotWPError( $public_id );
		$this->assertNotWPError( $excluded_id );
		$content = ( new Corsen_Context_Llms_Generator() )->generate_llms_txt();

		$this->assertStringContainsString( 'Public Guide', $content );
		$this->assertStringNotContainsString( 'Password Guide', $content );
		$this->assertStringNotContainsString( 'Private Guide', $content );
		$this->assertStringNotContainsString( 'Members Guide', $content );
	}

	public function test_llms_routes_avoid_canonical_slash_redirects(): void {
		$plugin = Corsen_Context::instance();

		$this->assertFalse(
			$plugin->prevent_llms_canonical_redirect(
				'https://example.org/llms.txt/',
				'https://example.org/llms.txt'
			)
		);
		$this->assertFalse(
			$plugin->prevent_llms_canonical_redirect(
				'https://example.org/llms-full.txt/',
				'https://example.org/llms-full.txt'
			)
		);
		$this->assertSame(
			'https://example.org/about/',
			$plugin->prevent_llms_canonical_redirect(
				'https://example.org/about/',
				'https://example.org/about'
			)
		);
	}

	public function test_upgrade_refreshes_llms_rewrite_rules_once_per_version(): void {
		delete_option( 'corsen_context_rewrite_version' );
		update_option( 'rewrite_rules', array( 'sentinel' => 'index.php' ) );

		Corsen_Context::instance()->maybe_upgrade_settings();

		$rules = get_option( 'rewrite_rules', array() );
		$this->assertSame( CORSEN_CONTEXT_VERSION, get_option( 'corsen_context_rewrite_version' ) );
		$this->assertArrayHasKey( '^llms\.txt/?$', $rules );
		$this->assertArrayHasKey( '^llms-full\.txt/?$', $rules );
	}

	public function test_exposure_filter_can_veto_a_published_post(): void {
		self::factory()->post->create(
			array(
				'post_title'  => 'Policy Hidden Guide',
				'post_status' => 'publish',
			)
		);
		$filter = static fn( bool $allowed, WP_Post $post ): bool => 'Policy Hidden Guide' === $post->post_title ? false : $allowed;
		add_filter( 'corsen_context_can_expose_post', $filter, 10, 2 );

		$content = ( new Corsen_Context_Llms_Generator() )->generate_llms_txt();

		remove_filter( 'corsen_context_can_expose_post', $filter, 10 );
		$this->assertStringNotContainsString( 'Policy Hidden Guide', $content );
	}

	public function test_mcp_initialize_and_notification_transport_contract(): void {
		$initialize = $this->mcp_request(
			array(
				'jsonrpc' => '2.0',
				'id'      => 1,
				'method'  => 'initialize',
				'params'  => array(
					'protocolVersion' => '2025-11-25',
					'capabilities'    => array(),
					'clientInfo'      => array(
						'name'    => 'phpunit',
						'version' => '1',
					),
				),
			)
		);
		$this->assertSame( 200, $initialize->get_status() );
		$this->assertSame( 'nosniff', $initialize->get_headers()['X-Content-Type-Options'] );
		$this->assertSame( '2025-11-25', $initialize->get_data()['result']['protocolVersion'] );

		$notification = $this->mcp_request(
			array(
				'jsonrpc' => '2.0',
				'method'  => 'notifications/initialized',
				'params'  => array(),
			),
			array( 'MCP-Protocol-Version' => '2025-11-25' )
		);
		$this->assertSame( 202, $notification->get_status() );
		$this->assertNull( $notification->get_data() );
	}

	public function test_mcp_tools_filter_can_disable_every_tool(): void {
		$filter = static fn(): array => array();
		add_filter( 'corsen_context_enabled_tools', $filter );
		$response = $this->mcp_request(
			array(
				'jsonrpc' => '2.0',
				'id'      => 3,
				'method'  => 'tools/list',
			),
			array( 'MCP-Protocol-Version' => '2025-11-25' )
		);
		remove_filter( 'corsen_context_enabled_tools', $filter );

		$this->assertSame( 200, $response->get_status() );
		$this->assertSame( array(), $response->get_data()['result']['tools'] );
	}

	public function test_mcp_rejects_cross_origin_and_wrong_content_type(): void {
		$cross_origin = $this->mcp_request(
			array(
				'jsonrpc' => '2.0',
				'id'      => 1,
				'method'  => 'ping',
			),
			array(
				'Origin'               => 'https://attacker.example',
				'MCP-Protocol-Version' => '2025-11-25',
			)
		);
		$this->assertSame( 403, $cross_origin->get_status() );

		$wrong_type = $this->mcp_request(
			array(
				'jsonrpc' => '2.0',
				'id'      => 2,
				'method'  => 'ping',
			),
			array(
				'Content-Type'         => 'text/plain',
				'MCP-Protocol-Version' => '2025-11-25',
			)
		);
		$this->assertSame( 415, $wrong_type->get_status() );
	}

	public function test_global_switch_suppresses_discovery_and_route_registration(): void {
		$settings            = get_option( 'corsen_context_settings' );
		$settings['enabled'] = false;
		update_option( 'corsen_context_settings', $settings );

		ob_start();
		Corsen_Context::instance()->add_mcp_link_tag();
		$link_output = ob_get_clean();
		$this->assertSame( '', $link_output );
		$this->assertSame( "User-agent: *\n", Corsen_Context::instance()->add_robots_discovery( "User-agent: *\n", true ) );

		$original_server          = $GLOBALS['wp_rest_server'] ?? null;
		$GLOBALS['wp_rest_server'] = new WP_REST_Server();
		try {
			Corsen_Context::instance()->register_rest_routes();
			$this->assertArrayNotHasKey( '/corsen-context/v1/mcp', $GLOBALS['wp_rest_server']->get_routes() );
		} finally {
			$GLOBALS['wp_rest_server'] = $original_server;
		}
	}

	public function test_full_export_is_bounded_and_disabled_by_default_on_upgrade(): void {
		delete_option( 'corsen_context_settings' );
		Corsen_Context::instance()->maybe_upgrade_settings();
		$settings = get_option( 'corsen_context_settings' );
		$this->assertFalse( $settings['llms_full_enabled'] );

		$settings['llms_full_enabled'] = true;
		$settings['max_output_bytes']  = 65536;
		update_option( 'corsen_context_settings', $settings );
		self::factory()->post->create(
			array(
				'post_title'   => 'Oversized Guide',
				'post_status'  => 'publish',
				'post_content' => str_repeat( 'A', 70000 ),
			)
		);

		$content = ( new Corsen_Context_Llms_Generator() )->generate_llms_full_txt();
		$this->assertIsString( $content );
		$this->assertLessThanOrEqual( 65536, strlen( $content ) );
		$this->assertStringContainsString( 'Output truncated', $content );
	}

	private function mcp_request( array $body, array $headers = array() ): WP_REST_Response {
		$request = new WP_REST_Request( 'POST', '/corsen-context/v1/mcp' );
		$request->set_header( 'Content-Type', 'application/json' );
		$request->set_header( 'Accept', 'application/json, text/event-stream' );
		foreach ( $headers as $name => $value ) {
			$request->set_header( $name, $value );
		}
		$request->set_body( wp_json_encode( $body ) );
		return rest_do_request( $request );
	}
}
