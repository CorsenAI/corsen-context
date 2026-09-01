<?php
/**
 * Section-aware and JSON-LD extension tools: outline, budget, pagination,
 * exposure policy mirroring, sanitizer bounds, and table conversion.
 *
 * @package Corsen_Context
 */

class SectionsTest extends WP_UnitTestCase {

	private function settings( array $override = array() ): void {
		$GLOBALS['corsen_test_options']['corsen_context_settings'] = array_merge(
			array(
				'enabled'       => true,
				'mcp_enabled'   => true,
				'post_types'    => array( 'post', 'page' ),
				'enabled_tools' => array_merge( Corsen_Context_Tool_Registry::CORE_TOOLS, array( 'get_sections', 'get_structured_data' ) ),
			),
			$override
		);
	}

	private function post( string $content, array $override = array() ): void {
		$post                 = new WP_Post();
		$post->ID             = 42;
		$post->post_type      = 'page';
		$post->post_status    = 'publish';
		$post->post_name      = 'guide';
		$post->post_content   = $content;
		$post->post_excerpt   = '';
		$post->post_password  = '';
		$post->post_date_gmt     = '2026-01-01 00:00:00';
		$post->post_modified_gmt = '2026-01-02 00:00:00';
		foreach ( $override as $key => $value ) {
			$post->$key = $value;
		}
		$GLOBALS['corsen_test_post']        = $post;
		$GLOBALS['corsen_test_url_to_postid'] = 42;
	}

	protected function setUp(): void {
		parent::setUp();
		$GLOBALS['corsen_test_transients'] = array();
		$GLOBALS['corsen_test_options']    = array();
		$GLOBALS['corsen_test_postmeta']   = array();
		$GLOBALS['corsen_test_abilities']  = array();
		$this->settings();
	}

	public function test_outline_lists_headings_with_ids_and_bytes(): void {
		$this->post( "<p>Intro text.</p>\n<h2>Install</h2>\n<p>Step one.</p>\n<h3>Details</h3>\n<p>Deep.</p>\n<h2>Install</h2>\n<p>Second same heading.</p>" );
		$outcome = Corsen_Context_Sections::execute( array( 'uri' => home_url( '/guide/' ) ) );
		$this->assertTrue( $outcome['ok'] );
		$ids = array_column( $outcome['result']['sections'], 'id' );
		$this->assertContains( 'top', $ids );
		$this->assertContains( 'install', $ids );
		$this->assertContains( 'install-2', $ids );
		$this->assertContains( 'details', $ids );
		$this->assertSame( 4, $outcome['result']['sectionCount'] );
		$this->assertGreaterThan( 0, $outcome['result']['totalBytes'] );
	}

	public function test_outline_entries_carry_index_not_payload(): void {
		$this->post( "<h2>Install</h2>\n<p>" . str_repeat( 'payload padding ', 60 ) . "</p>" );
		$outcome = Corsen_Context_Sections::execute( array( 'uri' => home_url( '/guide/' ) ) );
		$this->assertTrue( $outcome['ok'] );
		// Audit 2026-09-01: the "cheap" outline embedded every section's
		// markdown and was bigger than get_page_content of the same page.
		foreach ( $outcome['result']['sections'] as $entry ) {
			$this->assertSame( array( 'id', 'level', 'heading', 'bytes' ), array_keys( $entry ) );
		}
		$outline_bytes = strlen( (string) wp_json_encode( $outcome['result']['sections'] ) );
		$this->assertGreaterThan( $outline_bytes, $outcome['result']['totalBytes'], 'Outline must stay smaller than the page it indexes.' );
	}

	public function test_duplicate_heading_ids_never_collide(): void {
		// Audit 2026-09-01: "Foo, Foo, Foo-2" produced two "foo-2" ids.
		$this->post( "<h2>Foo</h2>\n<p>a</p>\n<h2>Foo</h2>\n<p>b</p>\n<h2>Foo-2</h2>\n<p>c</p>" );
		$outcome = Corsen_Context_Sections::execute( array( 'uri' => home_url( '/guide/' ) ) );
		$this->assertTrue( $outcome['ok'] );
		$ids = array_column( $outcome['result']['sections'], 'id' );
		$this->assertSame( count( $ids ), count( array_unique( $ids ) ), 'Section ids must be unique.' );
	}

	public function test_top_id_is_always_listed_and_resolves(): void {
		// Audit 2026-09-01: the schema documents "top" but the converter
		// emits the H1 first, so the entry never existed and every client
		// call died with section_not_found. A documented id must resolve.
		$this->post( "\n\n<h2>Only</h2>\n<p>x</p>" );
		$uri     = home_url( '/guide/' );
		$outline = Corsen_Context_Sections::execute( array( 'uri' => $uri ) );
		$this->assertTrue( $outline['ok'] );
		$this->assertContains( 'top', array_column( $outline['result']['sections'], 'id' ) );
		$top = Corsen_Context_Sections::execute( array( 'uri' => $uri, 'section' => 'top' ) );
		$this->assertTrue( $top['ok'], 'Documented id "top" must resolve even on zero-byte intros.' );
		$this->assertSame( 0, $top['result']['totalBytes'] );
	}

	public function test_chunk_boundaries_never_split_utf8(): void {
		// Audit 2026-09-01: byte-budget substr could end a chunk inside a
		// multi-byte codepoint. 3200 euro signs = 9600 bytes, 3 per char.
		$big = str_repeat( '€', 3200 );
		$this->post( "<h2>Big</h2>\n<p>" . $big . "</p>" );
		$uri     = home_url( '/guide/' );
		$outcome = Corsen_Context_Sections::execute( array( 'uri' => $uri, 'section' => 'big' ) );
		$this->assertTrue( $outcome['ok'] );
		$md = $outcome['result']['markdown'];
		$this->assertTrue( mb_check_encoding( $md, 'UTF-8' ), 'First chunk must end on a character boundary.' );
		$next   = $outcome['result']['nextOffset'];
		$second = Corsen_Context_Sections::execute( array( 'uri' => $uri, 'section' => 'big', 'offset' => $next ) );
		$md2    = $second['result']['markdown'];
		$this->assertTrue( mb_check_encoding( $md2, 'UTF-8' ) );
		$this->assertSame( $outcome['result']['totalBytes'], strlen( $md ) + strlen( $md2 ), 'Pagination must be lossless.' );
	}

	public function test_section_read_returns_bounded_slice_with_pagination(): void {
		$big  = str_repeat( 'lorem ipsum dolor ', 600 ); // ~10800 bytes.
		$this->post( "<h2>Long</h2>\n<p>{$big}</p>" );
		$uri     = home_url( '/guide/' );
		$outcome = Corsen_Context_Sections::execute( array( 'uri' => $uri, 'section' => 'long' ) );
		$this->assertTrue( $outcome['ok'] );
		$this->assertLessThanOrEqual( Corsen_Context_Sections::SECTION_BUDGET, $outcome['result']['bytes'] );
		$this->assertArrayHasKey( 'nextOffset', $outcome['result'] );
		$second = Corsen_Context_Sections::execute( array( 'uri' => $uri, 'section' => 'long', 'offset' => $outcome['result']['nextOffset'] ) );
		$this->assertTrue( $second['ok'] );
		$this->assertStringContainsString( 'lorem ipsum', $second['result']['markdown'] );
		$this->assertArrayNotHasKey( 'nextOffset', $second['result'] );
	}

	public function test_section_not_found_lists_valid_ids(): void {
		$this->post( "<h2>Real</h2>\n<p>Body.</p>" );
		$outcome = Corsen_Context_Sections::execute( array( 'uri' => home_url( '/guide/' ), 'section' => 'ghost' ) );
		$this->assertFalse( $outcome['ok'] );
		$this->assertSame( 'section_not_found', $outcome['code'] );
		$this->assertContains( 'real', $outcome['ids'] );
	}

	public function test_sections_honor_exposure_policy(): void {
		$this->post( "<h2>Secret</h2>\n<p>Nope.</p>" );
		$GLOBALS['corsen_test_options']['corsen_context_settings']['exclude_paths'] = '/guide/';
		$outcome = Corsen_Context_Sections::execute( array( 'uri' => home_url( '/guide/' ) ) );
		$this->assertFalse( $outcome['ok'] );
		$this->assertSame( 'not_found', $outcome['code'] );
		unset( $GLOBALS['corsen_test_options']['corsen_context_settings']['exclude_paths'] );
		$GLOBALS['corsen_test_post']->post_password = 'hunter2';
		$outcome = Corsen_Context_Sections::execute( array( 'uri' => home_url( '/guide/' ) ) );
		$this->assertFalse( $outcome['ok'] );
	}

	public function test_sections_reject_woo_transactional_pages(): void {
		$this->post( "<h2>Cart</h2>\n<p>Rows.</p>" );
		$GLOBALS['corsen_test_options']['woocommerce_cart_page_id'] = 42;
		$outcome = Corsen_Context_Sections::execute( array( 'uri' => home_url( '/guide/' ) ) );
		$this->assertFalse( $outcome['ok'] );
		$this->assertSame( 'not_found', $outcome['code'] );
	}

	public function test_sections_argument_validation(): void {
		$this->assertNull( Corsen_Context_Sections::validate( array() ) );
		$this->assertNull( Corsen_Context_Sections::validate( array( 'uri' => 'x', 'bogus' => 1 ) ) );
		$this->assertNull( Corsen_Context_Sections::validate( array( 'uri' => 'https://x.test', 'offset' => 10 ) ) );
		$this->assertNull( Corsen_Context_Sections::validate( array( 'uri' => 'https://x.test', 'section' => 'Bad Slug!' ) ) );
		$ok = Corsen_Context_Sections::validate( array( 'uri' => 'https://x.test/', 'section' => 'Top' ) );
		$this->assertSame( 'top', $ok['section'] );
	}

	public function test_structured_data_expands_graph_and_sanitizes(): void {
		$long  = str_repeat( 'description padding ', 60 );
		$ld    = '<script type="application/ld+json">'
			. json_encode(
				array(
					'@context' => 'https://schema.org',
					'@graph'   => array(
						array(
							'@type'       => 'Product',
							'name'        => 'Widget',
							'description' => $long,
							'offers'      => array(
								'@type'    => 'Offer',
								'price'    => '19.90',
								'currency' => 'EUR',
							),
						),
						array(
							'@type' => 'Organization',
							'name'  => 'Corsen',
						),
						array( 'name' => 'no type, dropped' ),
					),
				)
			)
			. '</script>'
			. '<p>Body</p>';
		$this->post( $ld );
		$outcome = Corsen_Context_Structured_Data::execute( array( 'uri' => home_url( '/guide/' ) ) );
		$this->assertTrue( $outcome['ok'] );
		$this->assertSame( 2, $outcome['result']['blockCount'] );
		$this->assertArrayHasKey( 'Product', $outcome['result']['types'] );
		$product = $outcome['result']['blocks'][0];
		$this->assertLessThanOrEqual( 303, strlen( $product['description'] ) );
		$this->assertSame( '19.90', $product['offers']['price'] );
	}

	public function test_structured_data_reports_empty_as_fact(): void {
		$this->post( '<p>No schema here.</p>' );
		$outcome = Corsen_Context_Structured_Data::execute( array( 'uri' => home_url( '/guide/' ) ) );
		$this->assertTrue( $outcome['ok'] );
		$this->assertSame( 0, $outcome['result']['blockCount'] );
		$this->assertSame( array(), $outcome['result']['blocks'] );
	}

	public function test_structured_data_skips_invalid_json(): void {
		$this->post( '<script type="application/ld+json">{bad json</script><script type="application/ld+json">{"@type":"FAQPage","name":"ok"}</script>' );
		$outcome = Corsen_Context_Structured_Data::execute( array( 'uri' => home_url( '/guide/' ) ) );
		$this->assertTrue( $outcome['ok'] );
		$this->assertSame( 1, $outcome['result']['blockCount'] );
	}

	public function test_new_tools_are_annotated_read_only(): void {
		$sections = Corsen_Context_WebMCP::annotations_for( 'get_sections' );
		$this->assertTrue( $sections['readOnlyHint'] );
		$this->assertTrue( $sections['untrustedContentHint'] );
		$structured = Corsen_Context_WebMCP::annotations_for( 'get_structured_data' );
		$this->assertTrue( $structured['readOnlyHint'] );
	}

	public function test_tables_become_github_markdown_rows(): void {
		$html = '<table><tr><th>Model</th><th>RAM</th></tr><tr><td>RTX 4000</td><td>20 GB | 24 GB</td></tr></table>';
		$md   = Corsen_Context_Content_Converter::html_to_markdown( $html );
		$this->assertStringContainsString( '| Model | RAM |', $md );
		$this->assertStringContainsString( '| --- | --- |', $md );
		$this->assertStringContainsString( '20 GB \| 24 GB', $md );
		$this->assertStringNotContainsString( '<td>', $md );
	}

	public function test_extensions_only_advertised_when_enabled(): void {
		$this->settings( array( 'enabled_tools' => Corsen_Context_Tool_Registry::CORE_TOOLS ) );
		$server = new Corsen_Context_MCP_Server();
		$names  = array_column( $server->get_tool_definitions(), 'name' );
		$this->assertNotContains( 'get_sections', $names );
		$this->assertNotContains( 'get_structured_data', $names );
		$outcome = $server->execute_tool( 'get_sections', array( 'uri' => home_url( '/guide/' ) ) );
		$this->assertFalse( $outcome['ok'] );
	}
}
