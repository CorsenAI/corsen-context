<?php

use PHPUnit\Framework\TestCase;

final class ContentConverterTest extends TestCase {
	protected function setUp(): void {
		$GLOBALS['corsen_test_filter_log'] = array();
		$GLOBALS['corsen_test_filters']    = array();
	}

	public function test_neutralizes_dangerous_markdown_destinations(): void {
		$html = '<p><a href="javascript:alert(1)">bad</a> <a href="https://example.com/a">good</a></p>';
		$out  = Corsen_Context_Content_Converter::html_to_markdown( $html );
		$this->assertStringContainsString( '[bad](#)', $out );
		$this->assertStringContainsString( '[good](https://example.com/a)', $out );
		$this->assertStringNotContainsString( 'javascript:', $out );
		$this->assertSame( '#', Corsen_Context_Content_Converter::sanitize_markdown_url( 'javascript%3Aalert(1)' ) );
	}

	public function test_decodes_entities_before_removing_html(): void {
		$out = Corsen_Context_Content_Converter::html_to_markdown( '&lt;script&gt;alert(1)&lt;/script&gt;<p>Safe</p>' );
		$this->assertSame( 'Safe', $out );
	}

	public function test_escapes_untrusted_markdown_metadata(): void {
		$this->assertSame( 'Title \\[link\\]\\(x\\)', Corsen_Context_Content_Converter::escape_markdown_inline( 'Title [link](x)' ) );
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
}
