<?php
/**
 * Tool registry: the boundary between the cross-runtime contract and
 * WordPress-only extension tools.
 *
 * The shared tools.manifest.json contract (PHP + TypeScript core
 * parity-tested) owns CORE_TOOLS.
 * OPTIONAL_TOOLS live here only: they are additive, WordPress-runtime tools,
 * never enabled by default, and never advertised unless the owner enables
 * them explicitly. Keeping this split explicit is what lets the shared
 * contract keep its version while the WordPress runtime grows.
 *
 * Powered by Corsen Context - Built by Corsen AI - github.com/CorsenAI/corsen-context
 *
 * @package Corsen_Context
 */

defined( 'ABSPATH' ) || exit;

/**
 * Registry and owner-policy helpers.
 */
class Corsen_Context_Tool_Registry {

	/** The four contract tools; also the default enabled set. Order is contractual. */
	public const CORE_TOOLS = array( 'search_site', 'get_page_content', 'list_content', 'get_sitemap' );

	/** WordPress-runtime extensions, fail-closed (must be explicitly enabled). */
	public const OPTIONAL_TOOLS = array( 'get_product', 'get_sections', 'get_structured_data', 'check_agent_access', 'request_expert_call' );

	/**
	 * WooCommerce transactional pages (cart, checkout, account, terms) are
	 * never public machine content: per-visitor state and owner flows. One
	 * canonical rule used by the MCP surfaces AND the llms.txt generator.
	 *
	 * @param int $post_id Post ID.
	 * @return bool
	 */
	public static function is_woo_system_page( int $post_id ): bool {
		if ( $post_id <= 0 ) {
			return false;
		}
		foreach ( array(
			'woocommerce_cart_page_id',
			'woocommerce_checkout_page_id',
			'woocommerce_myaccount_page_id',
			'woocommerce_terms_page_id',
		) as $woo_opt ) {
			if ( (int) get_option( $woo_opt, 0 ) === $post_id ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Every tool name the plugin knows about (also the sanitize whitelist).
	 *
	 * @return string[]
	 */
	public static function known(): array {
		return array_merge( self::CORE_TOOLS, self::OPTIONAL_TOOLS );
	}

	/**
	 * Whether a name is an optional extension rather than a contract tool.
	 *
	 * @param string $name Tool name.
	 */
	public static function is_optional( string $name ): bool {
		return in_array( $name, self::OPTIONAL_TOOLS, true );
	}

	/**
	 * Definition for one optional tool, mirroring the manifest shape.
	 *
	 * @param string $name Tool name.
	 * @return array<string,mixed>|null
	 */
	public static function extension_definition( string $name ): ?array {
		switch ( $name ) {
			case 'get_product':
				return Corsen_Context_Products::definition();
			case 'get_sections':
				return Corsen_Context_Sections::definition();
			case 'get_structured_data':
				return Corsen_Context_Structured_Data::definition();
			case 'check_agent_access':
				return Corsen_Context_Agent_Access::definition();
			case 'request_expert_call':
				return Corsen_Context_Expert::configured() ? Corsen_Context_Expert::definition() : null;
			default:
				return null;
		}
	}

	/**
	 * Validate arguments for an optional tool.
	 *
	 * @param string              $name       Tool name.
	 * @param array<mixed>        $arguments  Raw arguments.
	 * @return array<string,mixed>|null
	 */
	public static function validate( string $name, array $arguments ): ?array {
		switch ( $name ) {
			case 'get_product':
				return Corsen_Context_Products::validate( $arguments );
			case 'get_sections':
				return Corsen_Context_Sections::validate( $arguments );
			case 'get_structured_data':
				return Corsen_Context_Structured_Data::validate( $arguments );
			case 'check_agent_access':
				return Corsen_Context_Agent_Access::validate( $arguments );
			case 'request_expert_call':
				return Corsen_Context_Expert::validate( $arguments );
			default:
				return null;
		}
	}

	/**
	 * Execute an optional tool.
	 *
	 * @param string              $name Tool name.
	 * @param array<string,mixed> $args Normalized arguments.
	 * @return array<string,mixed> Shape ['ok'=>bool,'result'=>mixed,'error'=>string].
	 */
	public static function execute( string $name, array $args ): array {
		switch ( $name ) {
			case 'get_product':
				return Corsen_Context_Products::execute( $args );
			case 'get_sections':
				return Corsen_Context_Sections::execute( $args );
			case 'get_structured_data':
				return Corsen_Context_Structured_Data::execute( $args );
			case 'check_agent_access':
				return Corsen_Context_Agent_Access::execute( $args );
			case 'request_expert_call':
				return Corsen_Context_Expert::execute( $args );
			default:
				return array(
					'ok'    => false,
					'error' => 'Unknown extension tool.',
				);
		}
	}

	/**
	 * Resolve a URI to a post the public exposure policy allows reading.
	 * Mirrors the MCP server's own gate: published, password-free, allowed
	 * post type, not a WooCommerce transactional page, not an excluded path.
	 * Shared by the WordPress-only extension tools so one policy rules all
	 * machine surfaces.
	 *
	 * @param string $uri Absolute URL on this site.
	 * @return \WP_Post|null
	 */
	public static function exposable_post( string $uri ): ?\WP_Post {
		if ( ! self::public_url_ok( $uri ) || ! function_exists( 'url_to_postid' ) ) {
			return null;
		}
		$post_id = url_to_postid( $uri );
		if ( ! $post_id ) {
			return null;
		}
		$post = get_post( $post_id );
		if ( ! $post instanceof \WP_Post || 'publish' !== $post->post_status ) {
			return null;
		}
		if ( ! empty( $post->post_password ) || self::is_woo_system_page( (int) $post->ID ) ) {
			return null;
		}
		if ( ! self::allows_type( (string) $post->post_type ) ) {
			return null;
		}
		$canonical = (string) get_permalink( $post );
		if (
			'' === $canonical ||
			! self::public_url_ok( $canonical ) ||
			(int) url_to_postid( $canonical ) !== (int) $post->ID
		) {
			return null;
		}

		/** Allow membership and visibility plugins to veto every extension tool. */
		return (bool) apply_filters( 'corsen_context_can_expose_post', true, $post ) ? $post : null;
	}

	/**
	 * Owner content policy: may agents read this content type at all?
	 * Mirrors get_allowed_post_types() so tools agree with list/search/sitemap.
	 *
	 * @param string $post_type Post type slug.
	 */
	public static function allows_type( string $post_type ): bool {
		$settings = get_option( 'corsen_context_settings', array() );
		$selected = array_map( 'sanitize_key', (array) ( $settings['post_types'] ?? array( 'post', 'page' ) ) );
		// Attachments are deliberately absent from the core/list/sitemap corpus.
		// Extension readers must not create a second, more permissive corpus.
		$public = array_values( array_diff( array_keys( get_post_types( array( 'public' => true ) ) ), array( 'attachment' ) ) );
		return in_array( $post_type, array_values( array_intersect( $selected, $public ) ), true );
	}

	/**
	 * Same public-URL policy as the MCP server: same site, http(s), no exclude.
	 *
	 * @param string $uri Absolute URL to check.
	 * @return bool True when the URL may be served to agents.
	 */
	public static function public_url_ok( string $uri ): bool {
		$parts = wp_parse_url( trim( $uri ) );
		$site  = wp_parse_url( home_url() );
		if (
			! is_array( $parts ) ||
			! is_array( $site ) ||
			empty( $parts['scheme'] ) ||
			empty( $parts['host'] ) ||
			empty( $site['scheme'] ) ||
			empty( $site['host'] ) ||
			isset( $parts['user'] ) ||
			isset( $parts['pass'] ) ||
			isset( $parts['fragment'] )
		) {
			return false;
		}
		$scheme      = strtolower( (string) $parts['scheme'] );
		$site_scheme = strtolower( (string) $site['scheme'] );
		if (
			! in_array( $scheme, array( 'http', 'https' ), true ) ||
			$scheme !== $site_scheme ||
			0 !== strcasecmp( (string) $parts['host'], (string) $site['host'] )
		) {
			return false;
		}
		$default_port = 'https' === $scheme ? 443 : 80;
		$port         = isset( $parts['port'] ) ? (int) $parts['port'] : $default_port;
		$site_port    = isset( $site['port'] ) ? (int) $site['port'] : $default_port;
		if ( $port !== $site_port ) {
			return false;
		}

		$path = Corsen_Context_Security::normalize_path( isset( $parts['path'] ) ? (string) $parts['path'] : '/' );
		if ( null === $path ) {
			return false;
		}

		$settings     = get_option( 'corsen_context_settings', array() );
		$exclude_rows = preg_split( '/[\r\n]+/', (string) ( $settings['exclude_paths'] ?? '' ) );
		foreach ( $exclude_rows as $row ) {
			$raw = trim( $row );
			if ( '' === $raw || 0 === strpos( $raw, '#' ) ) {
				continue;
			}
			$needle = Corsen_Context_Security::normalize_path( $raw );
			// A normalized root entry is ignored, matching the core content policy:
			// an accidental "/" must not silently disable every public URL.
			if ( null !== $needle && '/' !== $needle && ( $path === $needle || str_starts_with( $path, trailingslashit( $needle ) ) ) ) {
				return false;
			}
		}
		return true;
	}
}
