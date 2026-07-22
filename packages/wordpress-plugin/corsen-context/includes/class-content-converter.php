<?php
/**
 * Content converter - WordPress content to clean Markdown.
 *
 * Powered by Corsen Context - Built by Corsen AI - github.com/CorsenAI/corsen-context
 *
 * @package Corsen_Context
 */

defined( 'ABSPATH' ) || exit;

class Corsen_Context_Content_Converter {

	/**
	 * Convert a WP_Post to clean Markdown.
	 *
	 * @param \WP_Post $post Post object.
	 * @return string Markdown content.
	 */
	public static function post_to_markdown( \WP_Post $post ): string {

		$mode = self::get_render_mode( $post );
		if ( 'full' === $mode ) {
			$content = apply_filters( 'the_content', $post->post_content );
		} else {
			$content = $post->post_content;
			/**
			 * Opt in to dynamic block rendering. Disabled by default because a
			 * dynamic block or render_block filter can vary by visitor identity.
			*/
			if ( function_exists( 'do_blocks' ) && apply_filters( 'corsen_context_render_blocks', false, $post ) ) {
				$content = do_blocks( $content );
			}
			$content = self::render_allowed_shortcodes( $content, $post );
		}

		return self::html_to_markdown( $content );
	}

	/**
	 * Whether rendered post content may populate a shared cache.
	 *
	 * Full WordPress rendering is deliberately never shared because third-party
	 * filters may personalize output using state other than WordPress cookies.
	 *
	 * @param \WP_Post|null $post Optional post used to resolve the render mode.
	 * @return bool True when shared caching is safe.
	 */
	public static function is_shared_cache_safe( ?\WP_Post $post = null ): bool {

		if ( 'safe' !== self::get_render_mode( $post ) || ! Corsen_Context_Security::is_shared_cache_safe() ) {
			return false;
		}
		if ( (bool) apply_filters( 'corsen_context_render_blocks', false, $post ) ) {
			return false;
		}

		$shortcodes = (array) apply_filters( 'corsen_context_allowed_shortcodes', array(), $post );
		return empty( array_filter( $shortcodes ) );
	}
	/**
	 * Convert HTML to Markdown.
	 *
	 * @param string $html HTML content.
	 * @return string Markdown content.
	 */
	public static function html_to_markdown( string $html ): string {

		// Decode before removing tags so encoded HTML cannot reappear afterwards.
		$html = html_entity_decode( $html, ENT_QUOTES | ENT_HTML5, 'UTF-8' );

		// Remove scripts, styles, iframes.
		// Use wp_strip_all_tags-safe pattern: preg_replace can return null on backtrack limit.
		$html = preg_replace( '/<script[^>]*>.*?<\/script>/si', '', $html ) ?? $html;
		$html = preg_replace( '/<style[^>]*>.*?<\/style>/si', '', $html ) ?? $html;
		$html = preg_replace( '/<iframe[^>]*>.*?<\/iframe>/si', '', $html ) ?? $html;
		$html = preg_replace( '/<noscript[^>]*>.*?<\/noscript>/si', '', $html ) ?? $html;

		// Convert headings.
		for ( $i = 6; $i >= 1; $i-- ) {
			$prefix = str_repeat( '#', $i );
			$html   = preg_replace(
				'/<h' . $i . '[^>]*>(.*?)<\/h' . $i . '>/si',
				"\n" . $prefix . ' $1' . "\n",
				$html
			) ?? $html;
		}

		// Convert paragraphs.
		$html = preg_replace( '/<p[^>]*>(.*?)<\/p>/si', "\n$1\n", $html ) ?? $html;

		// Convert bold / italic.
		$html = preg_replace( '/<(?:strong|b)[^>]*>(.*?)<\/(?:strong|b)>/si', '**$1**', $html ) ?? $html;
		$html = preg_replace( '/<(?:em|i)[^>]*>(.*?)<\/(?:em|i)>/si', '*$1*', $html ) ?? $html;

		// Convert links while neutralizing dangerous destination schemes.
		$html = preg_replace_callback(
			'/<a\b[^>]*\bhref=["\']([^"\']*)["\'][^>]*>(.*?)<\/a>/si',
			static function ( array $matches ): string {

				$url = self::sanitize_markdown_url( $matches[1], false );
				return '[' . $matches[2] . '](' . $url . ')';
			},
			$html
		) ?? $html;

		// Convert images regardless of attribute order.
		$html = preg_replace_callback(
			'/<img\b[^>]*>/si',
			static function ( array $matches ): string {

				if ( ! preg_match( '/\bsrc=["\']([^"\']*)["\']/si', $matches[0], $src ) ) {
					return '';
				}
				$alt = '';
				if ( preg_match( '/\balt=["\']([^"\']*)["\']/si', $matches[0], $alt_match ) ) {
					$alt = self::escape_markdown_inline( $alt_match[1] );
				}
				$url = self::sanitize_markdown_url( $src[1], true );
				return '![' . $alt . '](' . $url . ')';
			},
			$html
		) ?? $html;
		// Convert lists.
		$html = preg_replace( '/<li[^>]*>(.*?)<\/li>/si', '- $1', $html ) ?? $html;
		$html = preg_replace( '/<\/?(?:ul|ol)[^>]*>/si', "\n", $html ) ?? $html;

		// Convert blockquotes.
		$html = preg_replace( '/<blockquote[^>]*>(.*?)<\/blockquote>/si', '> $1', $html ) ?? $html;

		// Convert code blocks.
		$html = preg_replace( '/<pre[^>]*><code[^>]*>(.*?)<\/code><\/pre>/si', "\n```\n$1\n```\n", $html ) ?? $html;
		$html = preg_replace( '/<code[^>]*>(.*?)<\/code>/si', '`$1`', $html ) ?? $html;

		// Convert hr.
		$html = preg_replace( '/<hr[^>]*\/?>/si', "\n---\n", $html ) ?? $html;

		// Convert br.
		$html = preg_replace( '/<br[^>]*\/?>/si', "\n", $html ) ?? $html;

		// Strip remaining HTML tags.
		$html = wp_strip_all_tags( $html );

		// Keep residual angle brackets as text, never downstream raw HTML.
		$html = str_replace( array( '<', '>' ), array( '&lt;', '&gt;' ), $html );
		// Clean up whitespace.
		$html = preg_replace( '/\n{3,}/', "\n\n", $html ) ?? $html;
		$html = trim( $html );

		return $html;
	}

	/**
	 * Escape untrusted inline text before inserting it into generated Markdown.
	 *
	 * @param string $text Inline text.
	 * @return string Escaped text.
	 */
	public static function escape_markdown_inline( string $text ): string {

		$text = html_entity_decode( wp_strip_all_tags( $text ), ENT_QUOTES | ENT_HTML5, 'UTF-8' );
		$text = preg_replace( '/\s+/u', ' ', trim( $text ) ) ?? trim( $text );
		return preg_replace( '/([\\\\`*_[\]{}()#+.!>|-])/u', '\\\\$1', $text ) ?? $text;
	}

	/**
	 * Sanitize a Markdown link or image destination.
	 *
	 * @param string $url      Raw destination.
	 * @param bool   $is_image Whether the destination belongs to an image.
	 * @return string Safe destination, or # when rejected.
	 */
	public static function sanitize_markdown_url( string $url, bool $is_image = false ): string {

		$url = html_entity_decode( trim( $url ), ENT_QUOTES | ENT_HTML5, 'UTF-8' );
		$url = preg_replace( '/[\x00-\x20\x7f]+/', '', $url ) ?? '';
		if ( '' === $url ) {
			return '#';
		}

		$scheme_probe = $url;
		for ( $i = 0; $i < 3; $i++ ) {
			$decoded = rawurldecode( $scheme_probe );
			if ( $decoded === $scheme_probe ) {
				break;
			}
			$scheme_probe = $decoded;
		}
		$scheme  = wp_parse_url( $scheme_probe, PHP_URL_SCHEME );
		$allowed = $is_image ? array( 'http', 'https' ) : array( 'http', 'https', 'mailto' );
		if ( is_string( $scheme ) && '' !== $scheme && ! in_array( strtolower( $scheme ), $allowed, true ) ) {
			return '#';
		}

		if ( str_starts_with( $url, '//' ) ) {
			$url = 'https:' . $url;
		}

		return str_replace( array( '\\', '(', ')' ), array( '%5C', '%28', '%29' ), $url );
	}
	/**
	 * Get post metadata for AI context.
	 *
	 * @param \WP_Post $post Post object.
	 * @return array Metadata.
	 */
	public static function get_post_metadata( \WP_Post $post ): array {
		$meta = array(
			'title'       => get_the_title( $post ),
			'description' => self::get_post_description( $post ),
			'url'         => get_permalink( $post ),
			'type'        => $post->post_type,
			'published'   => $post->post_date_gmt,
			'modified'    => $post->post_modified_gmt,
		);

		$settings = get_option( 'corsen_context_settings', array() );
		if ( ! empty( $settings['include_author'] ) ) {
			$meta['author'] = get_the_author_meta( 'display_name', $post->post_author );
		}
		// Yoast SEO integration.
		if ( function_exists( 'YoastSEO' ) || class_exists( 'WPSEO_Meta' ) ) {
			$yoast_title = get_post_meta( $post->ID, '_yoast_wpseo_title', true );
			$yoast_desc  = get_post_meta( $post->ID, '_yoast_wpseo_metadesc', true );
			if ( $yoast_title ) {
				$meta['title'] = $yoast_title;
			}
			if ( $yoast_desc ) {
				$meta['description'] = $yoast_desc;
			}
		}

		// Rank Math integration.
		if ( class_exists( 'RankMath' ) ) {
			$rm_title = get_post_meta( $post->ID, 'rank_math_title', true );
			$rm_desc  = get_post_meta( $post->ID, 'rank_math_description', true );
			if ( $rm_title ) {
				$meta['title'] = $rm_title;
			}
			if ( $rm_desc ) {
				$meta['description'] = $rm_desc;
			}
		}

		return $meta;
	}

	/**
	 * Resolve the rendering mode for a post.
	 *
	 * Safe mode reads stored public content without running the_content. Full
	 * mode preserves page-builder compatibility and is explicitly opt-in.
	 *
	 * @param \WP_Post|null $post Post being rendered.
	 * @return string safe|full.
	 */
	private static function get_render_mode( ?\WP_Post $post ): string {

		$mode = (string) apply_filters( 'corsen_context_render_mode', 'safe', $post );
		return 'full' === $mode ? 'full' : 'safe';
	}

	/**
	 * Execute only explicitly allowed shortcodes in safe rendering mode.
	 *
	 * @param string   $content Stored post content.
	 * @param \WP_Post $post    Post being rendered.
	 * @return string Rendered content.
	 */
	private static function render_allowed_shortcodes( string $content, \WP_Post $post ): string {

		if ( ! function_exists( 'do_shortcode' ) || ! function_exists( 'strip_shortcodes' ) ) {
			return $content;
		}

		/** Filter shortcode tags allowed during safe rendering. */
		$allowed = array_values( array_filter( array_map( 'sanitize_key', (array) apply_filters( 'corsen_context_allowed_shortcodes', array(), $post ) ) ) );
		if ( empty( $allowed ) ) {
			return strip_shortcodes( $content );
		}

		global $shortcode_tags;
		$original_tags  = is_array( $shortcode_tags ) ? $shortcode_tags : array();
		$shortcode_tags = array_intersect_key( $original_tags, array_flip( $allowed ) ); // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited -- Restrict execution to the explicit allowlist.
		try {
			return do_shortcode( $content );
		} finally {
			$shortcode_tags = $original_tags; // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited -- Restore the WordPress shortcode registry.
		}
	}
	/**
	 * Get post description (excerpt or auto-generated).
	 *
	 * @param \WP_Post $post Post object.
	 * @return string
	 */
	private static function get_post_description( \WP_Post $post ): string {
		if ( $post->post_excerpt ) {
			return wp_strip_all_tags( $post->post_excerpt );
		}

		$content = wp_strip_all_tags( $post->post_content );
		if ( strlen( $content ) > 160 ) {
			return substr( $content, 0, 157 ) . '...';
		}

		return $content;
	}
}
