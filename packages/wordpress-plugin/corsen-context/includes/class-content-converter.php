<?php
/**
 * Content converter - WordPress content to clean Markdown.
 *
 * Powered by Corsen Context - Built by Corsen AI - github.com/CorsenAI/corsen-context
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
		$content = apply_filters( 'the_content', $post->post_content );
		return self::html_to_markdown( $content );
	}

	/**
	 * Convert HTML to Markdown.
	 *
	 * @param string $html HTML content.
	 * @return string Markdown content.
	 */
	public static function html_to_markdown( string $html ): string {
		// Remove scripts, styles, iframes.
		// Use wp_strip_all_tags-safe pattern: preg_replace can return null on backtrack limit.
		$html = preg_replace( '/<script[^>]*>.*?<\/script>/si', '', $html ) ?? $html;
		$html = preg_replace( '/<style[^>]*>.*?<\/style>/si', '', $html ) ?? $html;
		$html = preg_replace( '/<iframe[^>]*>.*?<\/iframe>/si', '', $html ) ?? $html;
		$html = preg_replace( '/<noscript[^>]*>.*?<\/noscript>/si', '', $html ) ?? $html;

		// Convert headings.
		for ( $i = 6; $i >= 1; $i-- ) {
			$prefix = str_repeat( '#', $i );
			$html = preg_replace(
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

		// Convert links.
		$html = preg_replace( '/<a[^>]+href=["\']([^"\']+)["\'][^>]*>(.*?)<\/a>/si', '[$2]($1)', $html ) ?? $html;

		// Convert images.
		$html = preg_replace( '/<img[^>]+src=["\']([^"\']+)["\'][^>]*alt=["\']([^"\']*)["\'][^>]*\/?>/si', '![$2]($1)', $html ) ?? $html;
		$html = preg_replace( '/<img[^>]+src=["\']([^"\']+)["\'][^>]*\/?>/si', '![]($1)', $html ) ?? $html;

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

		// Decode HTML entities.
		$html = html_entity_decode( $html, ENT_QUOTES, 'UTF-8' );

		// Clean up whitespace.
		$html = preg_replace( '/\n{3,}/', "\n\n", $html ) ?? $html;
		$html = trim( $html );

		return $html;
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
			'author'      => get_the_author_meta( 'display_name', $post->post_author ),
		);

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
