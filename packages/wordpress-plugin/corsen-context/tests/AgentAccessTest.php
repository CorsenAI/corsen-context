<?php
/**
 * Agent access self-test: read-only tool surface, loopback guards, sanitizer
 * bounds and the Control Center tally. The live probe itself is admin-only.
 *
 * @package Corsen_Context
 */

class AgentAccessTest extends WP_UnitTestCase {

	protected function setUp(): void {
		parent::setUp();
		$GLOBALS['corsen_test_http_calls']    = array();
		$GLOBALS['corsen_test_http_response'] = null;
		$GLOBALS['corsen_test_transients']    = array();
		unset( $GLOBALS['corsen_test_options'][ Corsen_Context_Agent_Access::OPTION ] );
	}

	public function test_validate_accepts_only_the_empty_argument_set(): void {
		$this->assertSame( array(), Corsen_Context_Agent_Access::validate( array() ) );
		$this->assertNull( Corsen_Context_Agent_Access::validate( array( 'url' => 'https://evil.example' ) ) );
	}

	public function test_run_probes_self_urls_with_protocol_headers_on_mcp(): void {
		$GLOBALS['corsen_test_http_response'] = array(
			'response' => array( 'code' => 200 ),
			'headers'  => array( 'server' => 'cloudflare', 'cf-ray' => 'deadbeef' ),
			'body'     => 'ok',
		);
		Corsen_Context_Agent_Access::run();
		$mcp_seen = 0;
		foreach ( $GLOBALS['corsen_test_http_calls'] as $call ) {
			if ( 'POST' !== $call[0] ) {
				continue;
			}
			++$mcp_seen;
			$headers = $call[2]['headers'];
			$this->assertSame( 'application/json', $headers['Content-Type'], 'the MCP probe must declare its media type' );
			$this->assertStringContainsString( 'application/json', $headers['Accept'] );
			$this->assertArrayHasKey( 'MCP-Protocol-Version', $headers );
		}
		$this->assertSame( 4, $mcp_seen );
	}

	public function test_execute_never_probes_and_says_so_when_unrun(): void {
		$out = Corsen_Context_Agent_Access::execute( array() );
		$this->assertTrue( $out['ok'] );
		$this->assertSame( 0, $out['result']['ran_at'] );
		$this->assertFalse( $out['result']['fresh'] );
		$this->assertSame( array(), $GLOBALS['corsen_test_http_calls'], 'a tool call must never trigger egress' );
	}

	public function test_execute_reports_a_stored_run_with_tally_and_freshness(): void {
		$run = array(
			'ran_at' => time() - 60,
			'checks' => array(
				array( 'target' => 'llms', 'ua' => 'claude-bot', 'code' => 200, 'reachable' => true, 'edge' => 'cloudflare', 'blocked' => false ),
				array( 'target' => 'mcp', 'ua' => 'gptbot', 'code' => 403, 'reachable' => false, 'edge' => 'cloudflare', 'blocked' => true ),
			),
		);
		$GLOBALS['corsen_test_options'][ Corsen_Context_Agent_Access::OPTION ] = $run;
		$out    = Corsen_Context_Agent_Access::execute( array() );
		$result = $out['result'];
		$this->assertTrue( $result['fresh'] );
		$this->assertSame( 2, $result['summary']['total'] );
		$this->assertSame( 1, $result['summary']['reachable'] );
		$this->assertSame( 1, $result['summary']['blocked'] );
	}

	public function test_run_probes_only_self_urls_with_the_four_user_agents(): void {
		$GLOBALS['corsen_test_http_response'] = array(
			'response' => array( 'code' => 200 ),
			'headers'  => array( 'server' => 'cloudflare', 'cf-ray' => 'deadbeef' ),
			'body'     => 'ok',
		);
		$run  = Corsen_Context_Agent_Access::run();
		$this->assertCount( 8, $run['checks'] );
		$uas  = array();
		foreach ( $GLOBALS['corsen_test_http_calls'] as $call ) {
			$this->assertStringStartsWith( 'https://example.com', $call[1], 'loopback target must stay on this host' );
			$uas[] = $call[2]['headers']['User-Agent'];
		}
		$this->assertCount( 4, array_unique( $uas ) );
		$reached = array_filter( $run['checks'], static fn( $c ) => $c['reachable'] );
		$this->assertCount( 8, $reached );
	}

	public function test_run_flags_edge_blocks_for_every_ua(): void {
		$GLOBALS['corsen_test_http_response'] = array(
			'response' => array( 'code' => 403 ),
			'headers'  => array( 'server' => 'cloudflare', 'cf-ray' => 'cafe01' ),
			'body'     => 'Your request was blocked.',
		);
		$run   = Corsen_Context_Agent_Access::run();
		$tally = Corsen_Context_Agent_Access::tally( $run );
		$this->assertSame( 8, $tally['total'] );
		$this->assertSame( 8, $tally['blocked'] );
		$this->assertSame( 0, $tally['reachable'] );
		foreach ( $run['checks'] as $check ) {
			$this->assertSame( 'cloudflare', $check['edge'] );
		}
	}

	public function test_sanitize_run_rejects_garbage_and_clamps_numbers(): void {
		$this->assertNull( Corsen_Context_Agent_Access::sanitize_run( 'nope' ) );
		$this->assertNull( Corsen_Context_Agent_Access::sanitize_run( array( 'ran_at' => 0, 'checks' => array() ) ) );
		$this->assertNull( Corsen_Context_Agent_Access::sanitize_run( array( 'ran_at' => 5, 'checks' => 'x' ) ) );

		$run = Corsen_Context_Agent_Access::sanitize_run(
			array(
				'ran_at' => 10,
				'checks' => array_merge(
					array(
						array( 'target' => 'llms', 'ua' => 'claude-bot', 'code' => 999, 'reachable' => true, 'edge' => 'weird', 'blocked' => true ),
						array( 'target' => 'other', 'ua' => 'claude-bot', 'code' => 200 ),
					),
					array_fill( 0, 20, array( 'target' => 'mcp', 'ua' => 'gptbot', 'code' => 200, 'reachable' => true, 'edge' => 'direct', 'blocked' => false ) )
				),
				'note'   => '<script>x</script>' . str_repeat( 'y', 300 ),
			)
		);
		$this->assertIsArray( $run );
		$this->assertCount( 15, $run['checks'] ); // cap of 16 taken before dropping the invalid-target row: 1 claude + 14 gptbot.
		$this->assertSame( 599, $run['checks'][0]['code'] );
		$this->assertSame( 'unknown', $run['checks'][0]['edge'] );
		foreach ( $run['checks'] as $check ) {
			$this->assertContains( $check['target'], array( 'llms', 'mcp' ), 'invalid-target rows are dropped' );
			$this->assertContains( $check['ua'], array( 'claude-bot', 'gptbot' ) );
		}
	}

	public function test_note_is_tag_stripped_and_capped(): void {
		$run = Corsen_Context_Agent_Access::sanitize_run(
			array(
				'ran_at' => time(),
				'checks' => array(),
				'note'   => '<b>bold</b>' . str_repeat( 'a', 400 ),
			)
		);
		$this->assertArrayHasKey( 'note', $run );
		$this->assertLessThanOrEqual( 200, strlen( $run['note'] ) );
		$this->assertStringNotContainsString( '<b>', $run['note'] );
	}

	public function test_control_center_catalog_covers_every_known_tool(): void {
		$ref     = new \ReflectionMethod( 'Corsen_Context_Control_Center', 'tool_catalog' );
		$ref->setAccessible( true );
		$catalog = $ref->invoke( Corsen_Context_Control_Center::instance() );
		foreach ( Corsen_Context_Tool_Registry::known() as $tool ) {
			$this->assertArrayHasKey( $tool, $catalog, 'Control Center must carry a card for ' . $tool . ' (saving without a card once silently stripped it)' );
		}
	}

	public function test_mcp_server_routes_the_tool_end_to_end(): void {
		$GLOBALS['corsen_test_options']['corsen_context_settings'] = array(
			'enabled'       => true,
			'mcp_enabled'   => true,
			'enabled_tools' => array( 'check_agent_access' ),
		);
		$server = new Corsen_Context_MCP_Server();
		$ref    = new \ReflectionMethod( $server, 'execute_tool' );
		$ref->setAccessible( true );
		$r = $ref->invoke( $server, 'check_agent_access', array() );
		$this->assertNotEmpty( $r['ok'], 'execute_tool must route to the registry' );
		$this->assertSame( 0, $r['result']['ran_at'] );
		$bad = $ref->invoke( $server, 'check_agent_access', array( 'url' => 'https://evil.example' ) );
		$this->assertEmpty( $bad['ok'] );
		$this->assertSame( 'invalid_params', $bad['code'] );
	}

	public function test_registry_exposes_definition_outside_the_manifest(): void {
		$def = Corsen_Context_Tool_Registry::extension_definition( 'check_agent_access' );
		$this->assertIsArray( $def );
		$this->assertSame( 'check_agent_access', $def['name'] );
		$this->assertContains( 'check_agent_access', Corsen_Context_Tool_Registry::OPTIONAL_TOOLS );
		$this->assertNotContains( 'check_agent_access', Corsen_Context_Tool_Registry::CORE_TOOLS );
	}
}
