<?php

use PHPUnit\Framework\TestCase;

final class ContentConverterTest extends TestCase {
	protected function setUp(): void {
		$GLOBALS['corsen_test_filter_log'] = array();
		$GLOBALS['corsen_test_filters']    = array();
	}

	public function test_neutralizes_dangerous_markdown_destinations(): void {
		$html = '<p><a href="javascript:alert(1)">bad</a> <a href="https://example.com/a">good</a> [raw](javascript:alert(1))</p>';
		$out  = Corsen_Context_Content_Converter::html_to_markdown( $html );
		$this->assertStringContainsString( '[bad](#)', $out );
		$this->assertStringContainsString( '[good](https://example.com/a)', $out );
		$this->assertStringContainsString( '[raw](#)', $out );
		$this->assertStringNotContainsString( 'javascript:', $out );
		$this->assertSame( '#', Corsen_Context_Content_Converter::sanitize_markdown_url( 'javascript%3Aalert(1)' ) );
	}

	public function test_link_label_cannot_inject_a_second_markdown_destination(): void {
		$out = Corsen_Context_Content_Converter::html_to_markdown(
			'<a href="https://safe.example">x](javascript:alert(1))</a>'
		);

		$this->assertStringContainsString( 'https://safe.example', $out );
		$this->assertStringNotContainsString( '](javascript:', $out );
	}

	public function test_decodes_entities_before_removing_html(): void {
		$out = Corsen_Context_Content_Converter::html_to_markdown( '&lt;script&gt;alert(1)&lt;/script&gt;<p>Safe</p>' );
		$this->assertSame( 'Safe', $out );
	}

	public function test_escapes_untrusted_markdown_metadata(): void {
		$this->assertSame( 'Title \\[link\\]\\(x\\)', Corsen_Context_Content_Converter::escape_markdown_inline( 'Title [link](x)' ) );
	}

	public function test_adjacent_list_items_remain_separate_markdown_items(): void {
		$html = '<ol><li><strong>Power down.</strong> Disconnect USB-C.</li><li><strong>Zero the arm.</strong> Run Zero.</li><li><strong>Test once.</strong> Do not repeat.</li></ol>';
		$out  = Corsen_Context_Content_Converter::html_to_markdown( $html );

		$this->assertSame(
			"- **Power down.** Disconnect USB-C.\n- **Zero the arm.** Run Zero.\n- **Test once.** Do not repeat.",
			$out
		);
	}

	public function test_safe_mode_does_not_execute_the_content_filter_or_shortcodes(): void {
		$post               = new WP_Post();
		$post->post_content = '<p>Public</p>[private]secret[/private]';
		$out                = Corsen_Context_Content_Converter::post_to_markdown( $post );

		$this->assertSame( "Public\nsecret", $out );
		$this->assertNotContains( 'the_content', $GLOBALS['corsen_test_filter_log'] );
	}

	public function test_full_rendering_is_opt_in_and_never_shared_cacheable(): void {
		$GLOBALS['corsen_test_filters']['corsen_context_render_mode'] = static fn() => 'full';
		$post = new WP_Post();
		$this->assertFalse( Corsen_Context_Content_Converter::is_shared_cache_safe( $post ) );
	}

	public function test_dynamic_blocks_and_shortcodes_disable_shared_caching(): void {
		$post = new WP_Post();
		$GLOBALS['corsen_test_filters']['corsen_context_render_blocks'] = static fn() => true;
		$this->assertFalse( Corsen_Context_Content_Converter::is_shared_cache_safe( $post ) );

		$GLOBALS['corsen_test_filters']['corsen_context_render_blocks']     = static fn() => false;
		$GLOBALS['corsen_test_filters']['corsen_context_allowed_shortcodes'] = static fn() => array( 'gallery' );
		$this->assertFalse( Corsen_Context_Content_Converter::is_shared_cache_safe( $post ) );
	}

	public function test_generated_descriptions_never_expose_shortcode_markup(): void {
		$method = new ReflectionMethod( Corsen_Context_Content_Converter::class, 'get_post_description' );
		$method->setAccessible( true );

		$post               = new WP_Post();
		$post->post_content = '[corsen_agent_form id="quote"]Public details';
		$this->assertSame( 'Public details', $method->invoke( null, $post ) );

		$post->post_excerpt = '[corsen_agent_form id="quote"]Short summary';
		$this->assertSame( 'Short summary', $method->invoke( null, $post ) );
	}

	public function test_utf8_helpers_and_generated_description_preserve_code_points(): void {
		$this->assertSame( 5, Corsen_Context_Content_Converter::utf8_length( 'Aé€😀Z' ) );
		$this->assertSame( 'é€😀', Corsen_Context_Content_Converter::utf8_substr( 'Aé€😀Z', 1, 3 ) );
		$this->assertSame( 2, Corsen_Context_Content_Converter::utf8_stripos( 'Aé€😀Z', '€' ) );

		$method = new ReflectionMethod( Corsen_Context_Content_Converter::class, 'get_post_description' );
		$method->setAccessible( true );
		$post               = new WP_Post();
		$post->post_content = str_repeat( '€', 161 );
		$description        = $method->invoke( null, $post );

		$this->assertSame( str_repeat( '€', 157 ) . '...', $description );
		$this->assertSame( 1, preg_match( '//u', $description ) );
		$this->assertSame( 160, Corsen_Context_Content_Converter::utf8_length( $description ) );
	}
}
