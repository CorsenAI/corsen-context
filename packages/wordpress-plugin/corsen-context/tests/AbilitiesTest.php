<?php
/**
 * Abilities API surface tests: registration gating, name/schema parity with
 * tools/list, and execute callbacks routed through the single shared executor.
 *
 * @package Corsen_Context
 */

class AbilitiesTest extends WP_UnitTestCase {

	protected function setUp(): void {
		parent::setUp();
		$GLOBALS['corsen_test_abilities']          = array();
		$GLOBALS['corsen_test_ability_categories'] = array();
		$GLOBALS['corsen_test_options']['corsen_context_settings'] = array(
			'enabled'       => true,
			'mcp_enabled'   => true,
			'enabled_tools' => array( 'search_site', 'get_page_content', 'list_content', 'get_sitemap' ),
			'post_types'    => array( 'post', 'page' ),
		);
	}

	protected function tearDown(): void {
		$GLOBALS['corsen_test_options'] = array();
		unset( $GLOBALS['corsen_test_posts'] );
	}

	public function test_available_with_stubs_present(): void {
		$this->assertTrue( Corsen_Context_Abilities::available() );
	}

	public function test_registers_all_four_enabled_tools_with_namespaced_dashed_names(): void {
		Corsen_Context_Abilities::register_abilities();
		$names = array_keys( $GLOBALS['corsen_test_abilities'] );
		sort( $names );
		$this->assertSame(
			array(
				'corsen-context/get-page-content',
				'corsen-context/get-sitemap',
				'corsen-context/list-content',
				'corsen-context/search-site',
			),
			$names
		);
	}

	public function test_category_registers_with_transport_and_never_after_off(): void {
		Corsen_Context_Abilities::register_category();
		$this->assertArrayHasKey( 'corsen-context', $GLOBALS['corsen_test_ability_categories'] );
		$GLOBALS['corsen_test_options']['corsen_context_settings']['mcp_enabled'] = false;
		Corsen_Context_Abilities::register_category();
		$this->assertSame( 1, count( $GLOBALS['corsen_test_ability_categories'] ), 'no duplicate/incremental category when transport off' );
	}

	public function test_input_schemas_match_tools_list_definitions(): void {
		Corsen_Context_Abilities::register_abilities();
		$server = new Corsen_Context_MCP_Server();
		foreach ( $server->get_tool_definitions() as $def ) {
			$ability = 'corsen-context/' . str_replace( '_', '-', $def['name'] );
			$this->assertArrayHasKey( $ability, $GLOBALS['corsen_test_abilities'] );
			$expected = $def['inputSchema'];
			if ( isset( $expected['properties'] ) && $expected['properties'] instanceof stdClass ) {
				$expected['properties'] = array();
			}
			$this->assertSame( $expected, $GLOBALS['corsen_test_abilities'][ $ability ]['input_schema'], 'schema parity for ' . $def['name'] );
			$this->assertSame( $def['description'], $GLOBALS['corsen_test_abilities'][ $ability ]['description'] );
			$this->assertSame( 'corsen-context', $GLOBALS['corsen_test_abilities'][ $ability ]['category'] );
			$this->assertSame( array( 'readonly' => true ), $GLOBALS['corsen_test_abilities'][ $ability ]['meta']['annotations'] );
		}
	}

	public function test_disabled_master_or_mcp_registers_nothing(): void {
		$GLOBALS['corsen_test_options']['corsen_context_settings']['enabled'] = false;
		Corsen_Context_Abilities::register_abilities();
		Corsen_Context_Abilities::register_category();
		$this->assertSame( array(), $GLOBALS['corsen_test_abilities'] );
		$this->assertSame( array(), $GLOBALS['corsen_test_ability_categories'] );

		$GLOBALS['corsen_test_options']['corsen_context_settings']['enabled'] = true;
		$GLOBALS['corsen_test_options']['corsen_context_settings']['mcp_enabled'] = false;
		Corsen_Context_Abilities::register_abilities();
		$this->assertSame( array(), $GLOBALS['corsen_test_abilities'] );
	}

	public function test_only_enabled_tools_register(): void {
		$GLOBALS['corsen_test_options']['corsen_context_settings']['enabled_tools'] = array( 'search_site' );
		Corsen_Context_Abilities::register_abilities();
		$this->assertSame( array( 'corsen-context/search-site' ), array_keys( $GLOBALS['corsen_test_abilities'] ) );
	}

	public function test_execute_callback_routes_to_shared_executor(): void {
		Corsen_Context_Abilities::register_abilities();
		$cb = $GLOBALS['corsen_test_abilities']['corsen-context/get-sitemap']['execute_callback'];

		// Sitemap with no posts returns the same payload as execute_tool().
		$server    = new Corsen_Context_MCP_Server();
		$expected  = $server->execute_tool( 'get_sitemap', array() );
		$fromCb    = $cb( array() );
		$this->assertTrue( $expected['ok'] );
		$this->assertSame( $expected['result'], $fromCb );

		// A disabled tool surfaces as WP_Error through the ability, never a fat.
		$GLOBALS['corsen_test_options']['corsen_context_settings']['enabled_tools'] = array();
		$again = $GLOBALS['corsen_test_abilities']['corsen-context/get-sitemap']['execute_callback'];
		$err   = $again( array() );
		$this->assertInstanceOf( 'WP_Error', $err );
		$this->assertSame( 'corsen_context_tool_failed', $err->get_error_code() );
	}

	public function test_execute_callback_maps_invalid_arguments_to_wp_error(): void {
		Corsen_Context_Abilities::register_abilities();
		$cb  = $GLOBALS['corsen_test_abilities']['corsen-context/search-site']['execute_callback'];
		$err = $cb( array( 'query' => '', 'bogus' => 1 ) );
		$this->assertInstanceOf( 'WP_Error', $err );
	}

	public function test_output_schemas_declared_for_every_registered_ability(): void {
		Corsen_Context_Abilities::register_abilities();
		foreach ( $GLOBALS['corsen_test_abilities'] as $name => $args ) {
			$this->assertNotEmpty( $args['output_schema'], 'output schema declared for ' . $name );
			$this->assertArrayHasKey( 'permission_callback', $args );
			$this->assertSame( '__return_true', $args['permission_callback'] );
		}
	}
}
