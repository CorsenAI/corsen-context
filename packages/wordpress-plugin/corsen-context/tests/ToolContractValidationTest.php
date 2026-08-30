<?php
/** Contract validation coverage for WordPress MCP tool calls. */

use PHPUnit\Framework\TestCase;

final class ToolContractValidationTest extends TestCase {

	private Corsen_Context_MCP_Server $server;
	private ReflectionMethod $validator;
	private ReflectionMethod $caller;

	protected function setUp(): void {
		$this->server    = new Corsen_Context_MCP_Server();
		$this->validator = new ReflectionMethod( Corsen_Context_MCP_Server::class, 'validate_tool_arguments' );
		$this->validator->setAccessible( true );
		$this->caller = new ReflectionMethod( Corsen_Context_MCP_Server::class, 'handle_call_tool' );
		$this->caller->setAccessible( true );
	}

	protected function tearDown(): void {
		$GLOBALS['corsen_test_options'] = array();
		$GLOBALS['corsen_test_filters'] = array();
	}

	private function validate( string $tool, $arguments ): ?array {
		return $this->validator->invoke( $this->server, $tool, $arguments );
	}

	private function call( string $tool, $arguments ): WP_REST_Response {
		return $this->caller->invoke(
			$this->server,
			array(
				'name'      => $tool,
				'arguments' => $arguments,
			),
			1
		);
	}

	public function test_valid_arguments_are_preserved_and_defaults_are_explicit(): void {
		$this->assertSame(
			array(
				'query' => str_repeat( 'é', 500 ),
				'limit' => 10,
			),
			$this->validate( 'search_site', array( 'query' => str_repeat( 'é', 500 ) ) )
		);
		$this->assertSame(
			array(
				'query' => 'guide',
				'limit' => 1,
			),
			$this->validate(
				'search_site',
				array(
					'query' => 'guide',
					'limit' => 1.0,
				)
			)
		);
		$this->assertSame(
			str_repeat( '😀', 500 ),
			$this->validate( 'search_site', array( 'query' => str_repeat( '😀', 500 ) ) )['query']
		);
		$this->assertSame(
			array( 'uri' => str_repeat( 'u', 2000 ) ),
			$this->validate( 'get_page_content', array( 'uri' => str_repeat( 'u', 2000 ) ) )
		);
		$this->assertSame(
			array( 'uri' => str_repeat( '😀', 2000 ) ),
			$this->validate( 'get_page_content', array( 'uri' => str_repeat( '😀', 2000 ) ) )
		);
		$this->assertSame(
			array(
				'type'  => 'page',
				'page'  => 1,
				'limit' => 20,
			),
			$this->validate( 'list_content', array() )
		);
		$this->assertSame(
			array(
				'type'  => 'post',
				'page'  => 2,
				'limit' => 100,
			),
			$this->validate(
				'list_content',
				array(
					'type'  => 'post',
					'page'  => 2.0,
					'limit' => 100.0,
				)
			)
		);
		$this->assertSame(
			array(
				'type'  => str_repeat( '😀', 50 ),
				'page'  => 1,
				'limit' => 20,
			),
			$this->validate( 'list_content', array( 'type' => str_repeat( '😀', 50 ) ) )
		);
		$this->assertSame( array(), $this->validate( 'get_sitemap', array() ) );
	}

	/**
	 * @dataProvider non_object_argument_provider
	 * @param mixed $arguments Invalid outer arguments value.
	 */
	public function test_non_object_arguments_return_json_rpc_invalid_params( $arguments ): void {
		$response = $this->call( 'get_sitemap', $arguments );

		$this->assertSame( 200, $response->get_status() );
		$this->assertSame( -32602, $response->get_data()['error']['code'] );
		$this->assertSame( 'Tool arguments must be an object', $response->get_data()['error']['message'] );
	}

	/** @return array<string,array{0:mixed}> */
	public function non_object_argument_provider(): array {
		return array(
			'arguments string'  => array( 'not-an-object' ),
			'arguments null'    => array( null ),
			'arguments boolean' => array( false ),
			'arguments integer' => array( 1 ),
		);
	}

	/**
	 * @dataProvider invalid_argument_provider
	 * @param mixed $arguments Invalid input inside a valid arguments object.
	 */
	public function test_input_schema_violations_return_actionable_tool_errors( string $tool, $arguments ): void {
		$response = $this->call( $tool, $arguments );
		$data     = $response->get_data();

		$this->assertSame( 200, $response->get_status() );
		$this->assertArrayNotHasKey( 'error', $data );
		$this->assertTrue( $data['result']['isError'] );
		$this->assertSame( 'text', $data['result']['content'][0]['type'] );
		$this->assertStringContainsString( 'Invalid tool parameters', $data['result']['content'][0]['text'] );
		$this->assertStringContainsString( 'inputSchema', $data['result']['content'][0]['text'] );
	}

	/** @return array<string,array{0:string,1:mixed}> */
	public function invalid_argument_provider(): array {
		return array(
			'query missing'             => array( 'search_site', array() ),
			'query empty'               => array( 'search_site', array( 'query' => '' ) ),
			'query too long'            => array( 'search_site', array( 'query' => str_repeat( 'é', 501 ) ) ),
			'query too many code points'  => array( 'search_site', array( 'query' => str_repeat( '😀', 501 ) ) ),
			'query wrong type'          => array( 'search_site', array( 'query' => 123 ) ),
			'search unknown property'   => array( 'search_site', array( 'query' => 'guide', 'extra' => true ) ),
			'search limit string'       => array( 'search_site', array( 'query' => 'guide', 'limit' => '10' ) ),
			'search limit boolean'      => array( 'search_site', array( 'query' => 'guide', 'limit' => true ) ),
			'search limit fraction'     => array( 'search_site', array( 'query' => 'guide', 'limit' => 1.5 ) ),
			'search limit below min'    => array( 'search_site', array( 'query' => 'guide', 'limit' => 0 ) ),
			'search limit above max'    => array( 'search_site', array( 'query' => 'guide', 'limit' => 51 ) ),
			'uri empty'                 => array( 'get_page_content', array( 'uri' => '' ) ),
			'uri too long'              => array( 'get_page_content', array( 'uri' => str_repeat( 'u', 2001 ) ) ),
			'uri too many code points'  => array( 'get_page_content', array( 'uri' => str_repeat( '😀', 2001 ) ) ),
			'uri wrong type'            => array( 'get_page_content', array( 'uri' => false ) ),
			'uri unknown property'      => array( 'get_page_content', array( 'uri' => '/guide', 'extra' => 1 ) ),
			'list type empty'           => array( 'list_content', array( 'type' => '' ) ),
			'list type null'            => array( 'list_content', array( 'type' => null ) ),
			'list type too long'        => array( 'list_content', array( 'type' => str_repeat( 't', 51 ) ) ),
			'list type too many code points' => array( 'list_content', array( 'type' => str_repeat( '😀', 51 ) ) ),
			'list type wrong type'      => array( 'list_content', array( 'type' => array( 'page' ) ) ),
			'list page string'          => array( 'list_content', array( 'page' => '1' ) ),
			'list page boolean'         => array( 'list_content', array( 'page' => true ) ),
			'list page fraction'        => array( 'list_content', array( 'page' => 1.25 ) ),
			'list page below min'       => array( 'list_content', array( 'page' => 0 ) ),
			'list page above max'       => array( 'list_content', array( 'page' => 5001 ) ),
			'list page integer max'     => array( 'list_content', array( 'page' => PHP_INT_MAX ) ),
			'list limit string'         => array( 'list_content', array( 'limit' => '20' ) ),
			'list limit boolean'        => array( 'list_content', array( 'limit' => false ) ),
			'list limit fraction'       => array( 'list_content', array( 'limit' => 20.5 ) ),
			'list limit below min'      => array( 'list_content', array( 'limit' => 0 ) ),
			'list limit above max'      => array( 'list_content', array( 'limit' => 101 ) ),
			'list unknown property'     => array( 'list_content', array( 'extra' => true ) ),
			'sitemap unknown property'  => array( 'get_sitemap', array( 'extra' => true ) ),
		);
	}

	public function test_successful_tool_results_explicitly_mark_is_error_false(): void {
		$method = new ReflectionMethod( Corsen_Context_MCP_Server::class, 'tool_result_response' );
		$method->setAccessible( true );
		$response = $method->invoke( $this->server, 7, array( 'ok' => true ) );

		$this->assertSame( 200, $response->get_status() );
		$this->assertFalse( $response->get_data()['result']['isError'] );
	}

	public function test_invalid_utf8_tool_result_fails_closed_with_text_content(): void {
		$method = new ReflectionMethod( Corsen_Context_MCP_Server::class, 'tool_result_response' );
		$method->setAccessible( true );
		$response = $method->invoke( $this->server, 8, array( 'invalid' => "\xC3\x28" ) );
		$data     = $response->get_data()['result'];

		$this->assertTrue( $data['isError'] );
		$this->assertIsString( $data['content'][0]['text'] );
		$this->assertStringContainsString( 'UTF-8 JSON', $data['content'][0]['text'] );
	}

	public function test_page_that_is_absent_or_not_exposed_returns_actionable_tool_error(): void {
		$response = $this->call(
			'get_page_content',
			array( 'uri' => 'https://attacker.example/private-page' )
		);
		$data = $response->get_data();

		$this->assertSame( 200, $response->get_status() );
		$this->assertArrayNotHasKey( 'error', $data );
		$this->assertTrue( $data['result']['isError'] );
		$this->assertStringContainsString( 'Resource not found or not exposed', $data['result']['content'][0]['text'] );
		$this->assertStringContainsString( 'search_site, list_content, or get_sitemap', $data['result']['content'][0]['text'] );
	}

	public function test_unknown_tool_remains_a_json_rpc_protocol_error(): void {
		$response = $this->call( 'not_a_tool', array() );

		$this->assertSame( 200, $response->get_status() );
		$this->assertSame( -32602, $response->get_data()['error']['code'] );
		$this->assertSame( 'Tool not found: not_a_tool', $response->get_data()['error']['message'] );
	}

	public function test_unknown_content_type_returns_an_empty_page_without_fallback(): void {
		$method = new ReflectionMethod( Corsen_Context_MCP_Server::class, 'list_content' );
		$method->setAccessible( true );

		$this->assertSame(
			array(
				'items'   => array(),
				'total'   => 0,
				'page'    => 3,
				'limit'   => 7,
				'hasMore' => false,
			),
			$method->invoke( $this->server, 'not_a_real_type', 3, 7 )
		);
	}

	public function test_mcp_definitions_do_not_carry_webmcp_annotations(): void {
		foreach ( $this->server->get_tool_definitions() as $definition ) {
			$this->assertArrayNotHasKey( 'annotations', $definition );
		}
	}

	public function test_json_tool_arguments_reject_lists_but_accept_objects(): void {
		$method = new ReflectionMethod( Corsen_Context_MCP_Server::class, 'has_object_tool_arguments' );
		$method->setAccessible( true );

		$this->assertTrue( $method->invoke( $this->server, json_decode( '{"params":{"arguments":{}}}' ), 'tools/call' ) );
		$this->assertFalse( $method->invoke( $this->server, json_decode( '{"params":{"arguments":[]}}' ), 'tools/call' ) );
		$this->assertFalse( $method->invoke( $this->server, json_decode( '{"params":{"arguments":null}}' ), 'tools/call' ) );
		$this->assertTrue( $method->invoke( $this->server, json_decode( '{"params":{}}' ), 'tools/call' ) );
		$this->assertTrue( $method->invoke( $this->server, json_decode( '{"params":{"arguments":[]}}' ), 'ping' ) );
	}

	public function test_initialize_requires_object_shapes_and_complete_client_info(): void {
		$method = new ReflectionMethod( Corsen_Context_MCP_Server::class, 'has_valid_initialize_params' );
		$method->setAccessible( true );

		$this->assertTrue(
			$method->invoke(
				$this->server,
				json_decode( '{"params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}' ),
				'initialize'
			)
		);
		$this->assertFalse( $method->invoke( $this->server, json_decode( '{"params":[]}' ), 'initialize' ) );
		$this->assertFalse(
			$method->invoke(
				$this->server,
				json_decode( '{"params":{"protocolVersion":"2025-11-25","capabilities":[],"clientInfo":{"name":"test","version":"1"}}}' ),
				'initialize'
			)
		);
		$this->assertFalse(
			$method->invoke(
				$this->server,
				json_decode( '{"params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{}}}' ),
				'initialize'
			)
		);
		$this->assertTrue( $method->invoke( $this->server, json_decode( '{}' ), 'ping' ) );
	}
}
