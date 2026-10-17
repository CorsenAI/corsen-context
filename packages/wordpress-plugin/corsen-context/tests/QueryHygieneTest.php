<?php
/**
 * The list-shaped tools must not prime caches they never read: terms are
 * never used on these paths and post meta only when an SEO plugin supplies
 * titles and descriptions. Audit 2026-10-17: every list query primed both
 * for up to max_pages rows to answer 10 to 100 items.
 *
 * @package Corsen_Context
 */

use PHPUnit\Framework\TestCase;

final class QueryHygieneTest extends TestCase {

	protected function setUp(): void {
		$GLOBALS['corsen_test_query_args'] = array();
		$GLOBALS['corsen_test_options']['corsen_context_settings'] = array(
			'enabled'       => true,
			'mcp_enabled'   => true,
			'post_types'    => array( 'post', 'page' ),
			'enabled_tools' => Corsen_Context_Tool_Registry::CORE_TOOLS,
		);
	}

	protected function tearDown(): void {
		$GLOBALS['corsen_test_options']    = array();
		$GLOBALS['corsen_test_query_args'] = array();
	}

	public function test_list_tools_do_not_prime_term_or_meta_caches(): void {
		$server = new Corsen_Context_MCP_Server();
		$calls  = array(
			array( 'get_sitemap', array() ),
			array( 'list_content', array( 'type' => 'page' ) ),
			array( 'search_site', array( 'query' => 'needle' ) ),
		);
		foreach ( $calls as $call ) {
			$GLOBALS['corsen_test_query_args'] = array();
			$outcome                           = $server->execute_tool( $call[0], $call[1] );
			$this->assertTrue( $outcome['ok'], $call[0] . ' must run.' );
			$this->assertNotEmpty( $GLOBALS['corsen_test_query_args'], $call[0] . ' must query posts.' );
			foreach ( $GLOBALS['corsen_test_query_args'] as $args ) {
				$this->assertTrue( $args['no_found_rows'], $call[0] );
				$this->assertFalse( $args['update_post_term_cache'], $call[0] . ' never reads terms.' );
				$this->assertFalse( $args['update_post_meta_cache'], $call[0] . ' reads no post meta without an SEO plugin.' );
			}
		}
	}

	public function test_meta_cache_is_primed_only_with_an_seo_plugin(): void {
		$this->assertFalse( Corsen_Context_MCP_Server::wants_post_meta_cache() );
		$this->assertFalse( function_exists( 'YoastSEO' ) );
	}
}
