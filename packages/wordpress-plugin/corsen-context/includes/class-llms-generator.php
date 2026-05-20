<?php
/**
 * llms.txt and llms-full.txt generator for WordPress.
 *
 * Powered by Corsen Context - Built by Corsen AI - github.com/CorsenAI/corsen-context
 */

defined( 'ABSPATH' ) || exit;

class Corsen_Context_Llms_Generator {

	private const CREDIT_LINE = 'Powered by Corsen Context • Built by Corsen AI • github.com/CorsenAI/corsen-context';

	/**
	 * Generate llms.txt content.
	 *
	 * @return string
	 */
	public function generate_llms_txt(): string {
		// Try cache first.
		$cached = get_transient( 'corsen_context_llms_txt' );
		if ( false !== $cached ) {
			return $cached;
		}

		$settings = get_option( 'corsen_context_settings', array() );
		$site_name = get_bloginfo( 'name' );
		$site_desc = get_bloginfo( 'description' );
		$site_url  = home_url();
		$mcp_url   = $site_url . '/wp-json/corsen-context/v1/mcp';

		$lines = array();

		// Header.
		$lines[] = '# ' . $site_name;
		$lines[] = '';
		if ( $site_desc ) {
			$lines[] = '> ' . $site_desc;
			$lines[] = '';
		}

		// About.
		$lines[] = '## About this AI Context File';
		$lines[] = 'This file is optimized for AI agents and MCP clients (2025-11-25 spec).';
		if ( ! empty( $settings['mcp_enabled'] ) ) {
			$lines[] = 'For dynamic structured access use the MCP endpoint below.';
		}
		$lines[] = '';

		// Get posts by type.
		$post_types = $settings['post_types'] ?? array( 'post', 'page' );
		$exclude    = $this->get_exclude_paths( $settings['exclude_paths'] ?? '' );

		foreach ( $post_types as $pt ) {
			$posts = $this->get_published_posts( $pt, $exclude );
			if ( empty( $posts ) ) {
				continue;
			}

			$label = $this->get_type_label( $pt );
			$lines[] = '## ' . $label;

			foreach ( $posts as $post ) {
				$meta = Corsen_Context_Content_Converter::get_post_metadata( $post );
				$desc = $meta['description'] ? ' – ' . $meta['description'] : '';
				$date = '';
				if ( 'post' === $pt && $meta['modified'] ) {
					$date = ' • ' . substr( $meta['modified'], 0, 10 );
				}
				$lines[] = '- [' . $meta['title'] . '](' . $meta['url'] . ')' . $desc . $date;
			}
			$lines[] = '';
		}

		// Credit line.
		if ( ! empty( $settings['credit'] ) ) {
			$lines[] = '**' . self::CREDIT_LINE . '** • MCP endpoint: ' . $mcp_url;
			$lines[] = '';
		}

		$content = implode( "\n", $lines );

		// Cache.
		$ttl = intval( $settings['cache_ttl'] ?? 3600 );
		set_transient( 'corsen_context_llms_txt', $content, $ttl );

		return $content;
	}

	/**
	 * Generate llms-full.txt content.
	 *
	 * @return string
	 */
	public function generate_llms_full_txt(): string {
		$cached = get_transient( 'corsen_context_llms_full_txt' );
		if ( false !== $cached ) {
			return $cached;
		}

		$settings   = get_option( 'corsen_context_settings', array() );
		$site_name  = get_bloginfo( 'name' );
		$post_types = $settings['post_types'] ?? array( 'post', 'page' );
		$exclude    = $this->get_exclude_paths( $settings['exclude_paths'] ?? '' );

		$sections = array();
		$sections[] = '# ' . $site_name . ' — Full Content';
		$sections[] = '';
		$sections[] = '> This file contains the full markdown content of all pages for AI consumption.';
		$sections[] = '';

		foreach ( $post_types as $pt ) {
			$posts = $this->get_published_posts( $pt, $exclude );
			foreach ( $posts as $post ) {
				$meta     = Corsen_Context_Content_Converter::get_post_metadata( $post );
				$markdown = Corsen_Context_Content_Converter::post_to_markdown( $post );

				$sections[] = '---';
				$sections[] = '';
				$sections[] = '## ' . $meta['title'];
				$sections[] = 'URL: ' . $meta['url'];
				if ( $meta['modified'] ) {
					$sections[] = 'Last modified: ' . $meta['modified'];
				}
				$sections[] = '';
				$sections[] = $markdown;
				$sections[] = '';
			}
		}

		if ( ! empty( $settings['credit'] ) ) {
			$sections[] = '---';
			$sections[] = '';
			$sections[] = '**' . self::CREDIT_LINE . '**';
			$sections[] = '';
		}

		$content = implode( "\n", $sections );
		$ttl     = intval( $settings['cache_ttl'] ?? 3600 );
		set_transient( 'corsen_context_llms_full_txt', $content, $ttl );

		return $content;
	}

	/**
	 * Get published posts of a given type, excluding specified paths.
	 *
	 * @param string   $post_type Post type.
	 * @param string[] $exclude   Paths to exclude.
	 * @return \WP_Post[]
	 */
	private function get_published_posts( string $post_type, array $exclude ): array {
		$settings  = get_option( 'corsen_context_settings', array() );
		$max_pages = intval( $settings['max_pages'] ?? 500 );

		$args = array(
			'post_type'      => $post_type,
			'post_status'    => 'publish',
			'has_password'   => false,
			'posts_per_page' => $max_pages,
			'orderby'        => 'date',
			'order'          => 'DESC',
			'no_found_rows'  => true,
		);

		$query = new \WP_Query( $args );
		$posts = $query->posts;

		if ( ! empty( $exclude ) ) {
			$posts = array_filter( $posts, function ( $post ) use ( $exclude ) {
				$path = wp_parse_url( get_permalink( $post ), PHP_URL_PATH );
				foreach ( $exclude as $ex ) {
					$normalized_path = $this->normalize_path( is_string( $path ) ? $path : '' );
					if (
						null !== $normalized_path &&
						( $normalized_path === $ex || str_starts_with( $normalized_path, trailingslashit( $ex ) ) )
					) {
						return false;
					}
				}
				return true;
			} );
		}

		return array_values( $posts );
	}

	/**
	 * Normalize configured exclude paths.
	 *
	 * @param string|array $raw Raw paths from settings.
	 * @return string[]
	 */
	private function get_exclude_paths( $raw ): array {
		$lines = is_array( $raw ) ? $raw : explode( "\n", $raw );
		$paths = array();

		foreach ( $lines as $line ) {
			$path = $this->normalize_path( (string) $line );
			if ( null !== $path && '/' !== $path ) {
				$paths[] = $path;
			}
		}

		return array_values( array_unique( $paths ) );
	}

	/**
	 * Normalize a path or URL to a leading-slash path.
	 */
	private function normalize_path( string $path ): ?string {
		$path = trim( $path );
		if ( '' === $path ) {
			return null;
		}

		$parsed_path = wp_parse_url( $path, PHP_URL_PATH );
		if ( is_string( $parsed_path ) && '' !== $parsed_path ) {
			$path = $parsed_path;
		}

		$path = '/' . ltrim( $path, '/' );
		return untrailingslashit( $path );
	}

	/**
	 * Get human label for post type.
	 *
	 * @param string $post_type Post type slug.
	 * @return string
	 */
	private function get_type_label( string $post_type ): string {
		$labels = array(
			'page'    => 'Main Pages',
			'post'    => 'Blog & Content',
			'product' => 'Products / Services',
		);

		if ( isset( $labels[ $post_type ] ) ) {
			return $labels[ $post_type ];
		}

		$obj = get_post_type_object( $post_type );
		return $obj ? $obj->labels->name : ucfirst( $post_type );
	}
}
