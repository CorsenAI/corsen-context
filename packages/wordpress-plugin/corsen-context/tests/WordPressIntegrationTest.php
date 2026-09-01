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
					'capabilities'    => (object) array(),
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
				'params'  => (object) array(),
			),
			array( 'MCP-Protocol-Version' => '2025-11-25' )
		);
		$this->assertSame( 202, $notification->get_status() );
		$this->assertNull( $notification->get_data() );
	}

	public function test_mcp_initialize_rejects_non_object_and_incomplete_client_metadata(): void {
		$invalid_params = array(
			'params list'          => array(),
			'capabilities list'    => array(
				'protocolVersion' => '2025-11-25',
				'capabilities'    => array(),
				'clientInfo'      => array( 'name' => 'phpunit', 'version' => '1' ),
			),
			'client info list'     => array(
				'protocolVersion' => '2025-11-25',
				'capabilities'    => (object) array(),
				'clientInfo'      => array(),
			),
			'client name missing' => array(
				'protocolVersion' => '2025-11-25',
				'capabilities'    => (object) array(),
				'clientInfo'      => (object) array( 'version' => '1' ),
			),
			'client version empty' => array(
				'protocolVersion' => '2025-11-25',
				'capabilities'    => (object) array(),
				'clientInfo'      => array( 'name' => 'phpunit', 'version' => '' ),
			),
		);

		foreach ( $invalid_params as $label => $params ) {
			$response = $this->mcp_request(
				array(
					'jsonrpc' => '2.0',
					'id'      => 1,
					'method'  => 'initialize',
					'params'  => $params,
				)
			);
			$this->assertSame( 200, $response->get_status(), $label );
			$this->assertSame( -32602, $response->get_data()['error']['code'], $label );
		}
	}

	public function test_mcp_distinguishes_invalid_json_from_valid_non_object_json(): void {
		// WordPress 6.8+ validates JSON before our pre-dispatch handler fires.
		// Truly broken JSON ({) is caught by WP's native parser; valid-but-non-object
		// JSON (42, null, "text", []) passes through to our handler.
		$invalid_json = $this->mcp_raw_request( '{' );
		$this->assertSame( 400, $invalid_json->get_status() );

		foreach ( array( '42', 'null', '"text"', '[]' ) as $primitive ) {
			$response = $this->mcp_raw_request( $primitive );
			$this->assertSame( 400, $response->get_status(), $primitive );
			$this->assertSame( -32600, $response->get_data()['error']['code'], $primitive );
		}

		$null_id = $this->mcp_raw_request( '{"jsonrpc":"2.0","method":"ping","id":null}' );
		$this->assertSame( 200, $null_id->get_status() );
		$this->assertSame( -32600, $null_id->get_data()['error']['code'] );

		foreach ( array( 'null', '[]' ) as $params ) {
			$response = $this->mcp_raw_request( '{"jsonrpc":"2.0","method":"ping","id":1,"params":' . $params . '}' );
			$this->assertSame( 200, $response->get_status(), $params );
			$this->assertSame( -32600, $response->get_data()['error']['code'], $params );
		}

		$unexpected_response = $this->mcp_raw_request( '{"jsonrpc":"2.0","id":1,"result":{}}' );
		$this->assertSame( 400, $unexpected_response->get_status() );
		$this->assertSame( -32600, $unexpected_response->get_data()['error']['code'] );
	}

	public function test_mcp_options_enforces_origin_before_wordpress_generic_handler(): void {
		$allowed = new WP_REST_Request( 'OPTIONS', '/corsen-context/v1/mcp' );
		$allowed->set_header( 'Origin', home_url() );
		$allowed_response = rest_do_request( $allowed );
		$this->assertSame( 204, $allowed_response->get_status() );
		$this->assertSame( home_url(), $allowed_response->get_headers()['Access-Control-Allow-Origin'] );

		$rejected = new WP_REST_Request( 'OPTIONS', '/corsen-context/v1/mcp' );
		$rejected->set_header( 'Origin', 'https://cross-origin.invalid' );
		$rejected_response = rest_do_request( $rejected );
		$this->assertSame( 403, $rejected_response->get_status() );
		$this->assertSame( 'Invalid Origin', $rejected_response->get_data()['error']['message'] );
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

	public function test_search_results_do_not_expose_shortcode_markup(): void {
		self::factory()->post->create(
			array(
				'post_title'   => 'Quote Guide',
				'post_status'  => 'publish',
				'post_content' => 'Needle [corsen_agent_form id="quote"] Public details.',
			)
		);

		$response = $this->mcp_request(
			array(
				'jsonrpc' => '2.0',
				'id'      => 4,
				'method'  => 'tools/call',
				'params'  => array(
					'name'      => 'search_site',
					'arguments' => array( 'query' => 'Needle' ),
				),
			),
			array( 'MCP-Protocol-Version' => '2025-11-25' )
		);

		$this->assertSame( 200, $response->get_status() );
		$text = $response->get_data()['result']['content'][0]['text'];
		$this->assertStringContainsString( 'Public details', $text );
		$this->assertStringNotContainsString( 'corsen_agent_form', $text );
	}

	public function test_search_result_metadata_and_snippet_remain_valid_utf8(): void {
		self::factory()->post->create(
			array(
				'post_title'   => 'Unicode Needle',
				'post_status'  => 'publish',
				'post_content' => str_repeat( '€', 100 ),
			)
		);

		$response = $this->mcp_request(
			array(
				'jsonrpc' => '2.0',
				'id'      => 41,
				'method'  => 'tools/call',
				'params'  => array(
					'name'      => 'search_site',
					'arguments' => array( 'query' => 'Unicode Needle' ),
				),
			),
			array( 'MCP-Protocol-Version' => '2025-11-25' )
		);

		$this->assertSame( 200, $response->get_status() );
		$text = $response->get_data()['result']['content'][0]['text'];
		$this->assertIsString( $text );
		$this->assertSame( 1, preg_match( '//u', $text ) );
		$results = json_decode( $text, true, 512, JSON_THROW_ON_ERROR );
		$this->assertNotEmpty( $results );
		$this->assertIsString( $results[0]['description'] );
		$this->assertIsString( $results[0]['snippet'] );
		$this->assertSame( 1, preg_match( '//u', $results[0]['description'] ) );
		$this->assertSame( 1, preg_match( '//u', $results[0]['snippet'] ) );
	}

	public function test_mcp_tool_arguments_must_be_a_json_object(): void {
		$invalid = $this->mcp_request(
			array(
				'jsonrpc' => '2.0',
				'id'      => 5,
				'method'  => 'tools/call',
				'params'  => array(
					'name'      => 'get_sitemap',
					'arguments' => array(),
				),
			),
			array( 'MCP-Protocol-Version' => '2025-11-25' )
		);
		$this->assertSame( 200, $invalid->get_status() );
		$this->assertSame( -32602, $invalid->get_data()['error']['code'] );

		$valid = $this->mcp_request(
			array(
				'jsonrpc' => '2.0',
				'id'      => 6,
				'method'  => 'tools/call',
				'params'  => array(
					'name'      => 'get_sitemap',
					'arguments' => new stdClass(),
				),
			),
			array( 'MCP-Protocol-Version' => '2025-11-25' )
		);
		$this->assertSame( 200, $valid->get_status() );
	}

	public function test_resource_params_match_the_strict_core_contract(): void {
		$headers = array( 'MCP-Protocol-Version' => '2025-11-25' );
		foreach (
			array(
				'missing'  => array(),
				'null'     => array( 'uri' => null ),
				'list'     => array( 'uri' => array() ),
				'empty'    => array( 'uri' => '' ),
				'too long' => array( 'uri' => str_repeat( '😀', 2001 ) ),
			) as $label => $params
		) {
			$response = $this->mcp_request(
				array(
					'jsonrpc' => '2.0',
					'id'      => 50,
					'method'  => 'resources/read',
					'params'  => $params,
				),
				$headers
			);
			$this->assertSame( 200, $response->get_status(), $label );
			$this->assertSame( -32602, $response->get_data()['error']['code'], $label );
			$this->assertSame( 'Missing resource URI', $response->get_data()['error']['message'], $label );
		}

		$without_cursor = $this->mcp_request(
			array(
				'jsonrpc' => '2.0',
				'id'      => 51,
				'method'  => 'resources/list',
			),
			$headers
		);
		$this->assertSame( 200, $without_cursor->get_status() );
		$this->assertArrayHasKey( 'resources', $without_cursor->get_data()['result'] );

		foreach ( array( null, '' ) as $cursor ) {
			$response = $this->mcp_request(
				array(
					'jsonrpc' => '2.0',
					'id'      => 52,
					'method'  => 'resources/list',
					'params'  => array( 'cursor' => $cursor ),
				),
				$headers
			);
			$this->assertSame( 200, $response->get_status() );
			$this->assertSame( -32602, $response->get_data()['error']['code'] );
		}
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

	public function test_get_on_mcp_route_returns_405_advertising_post_only(): void {
		$request  = new WP_REST_Request( 'GET', '/corsen-context/v1/mcp' );
		$response = rest_do_request( $request );
		$this->assertSame( 405, $response->get_status() );
		// rest_do_request() only runs dispatch(); the Allow header is rebuilt
		// by core's rest_send_allow_header() inside the rest_post_dispatch
		// chain that serve_request() runs after dispatch (verified in the
		// WP 6.8/6.9/7.0 sources: the filter is absent from dispatch()).
		// Replay that chain so the test proves our priority-20 filter wins
		// over the core-computed `POST, GET, OPTIONS`, not just the callback.
		$response = apply_filters( 'rest_post_dispatch', $response, rest_get_server(), $request );
		// WP_REST_Response has no get_header(): read get_headers() case-insensitively.
		$allow = null;
		foreach ( $response->get_headers() as $name => $value ) {
			if ( 'allow' === strtolower( (string) $name ) ) {
				$allow = $value;
			}
		}
		$this->assertSame( 'POST', $allow );
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

	public function test_discovery_and_admin_surfaces_use_the_filtered_rest_url(): void {
		$filter = static fn( string $url, string $path ): string => home_url( '/?corsen_rest=' . rawurlencode( $path ) );
		add_filter( 'rest_url', $filter, 10, 4 );
		$settings                    = get_option( 'corsen_context_settings' );
		$settings['webmcp_enabled']  = true;
		$settings['credit']          = false;
		update_option( 'corsen_context_settings', $settings );
		delete_transient( 'corsen_context_llms_txt' );
		// WordPress 6.8+ passes a leading-slash path to the rest_url filter.
		$expected = home_url( '/?corsen_rest=%2Fcorsen-context%2Fv1%2Fmcp' );

		try {
			$this->assertSame( $expected, Corsen_Context_MCP_Server::endpoint_url() );

			ob_start();
			Corsen_Context::instance()->add_mcp_link_tag();
			$link = (string) ob_get_clean();
			$this->assertStringContainsString( esc_url( $expected ), $link );

			$robots = Corsen_Context::instance()->add_robots_discovery( "User-agent: *\n", true );
			$this->assertStringContainsString( 'MCP: ' . $expected, $robots );

			$llms = ( new Corsen_Context_Llms_Generator() )->generate_llms_txt();
			$this->assertStringContainsString( 'MCP endpoint: ' . $expected, $llms );

			ob_start();
			( new Corsen_Context_WebMCP() )->render();
			$bridge = (string) ob_get_clean();
			$this->assertStringContainsString( $expected, $bridge );

			wp_set_current_user( self::factory()->user->create( array( 'role' => 'administrator' ) ) );
			ob_start();
			Corsen_Context_Admin::instance()->render_settings_page();
			$admin = (string) ob_get_clean();
			$this->assertStringContainsString( esc_html( $expected ), $admin );
		} finally {
			remove_filter( 'rest_url', $filter, 10 );
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
		return $this->mcp_raw_request( wp_json_encode( $body ), $headers );
	}

	private function mcp_raw_request( string $body, array $headers = array() ): WP_REST_Response {
		$request = new WP_REST_Request( 'POST', '/corsen-context/v1/mcp' );
		$request->set_header( 'Content-Type', 'application/json' );
		$request->set_header( 'Accept', 'application/json, text/event-stream' );
		foreach ( $headers as $name => $value ) {
			$request->set_header( $name, $value );
		}
		$request->set_body( $body );
		return rest_do_request( $request );
	}
}
