<?php
/**
 * Security layer for Corsen Context.
 *
 * Powered by Corsen Context - Built by Corsen AI - github.com/CorsenAI/corsen-context
 *
 * @package Corsen_Context
 */

defined( 'ABSPATH' ) || exit;

class Corsen_Context_Security {
	/** Security headers shared by plain-text and REST responses. */
	private const RESPONSE_HEADERS = array(
		'X-Content-Type-Options'  => 'nosniff',
		'X-Frame-Options'         => 'DENY',
		'X-XSS-Protection'        => '0',
		'Referrer-Policy'         => 'strict-origin-when-cross-origin',
		'Content-Security-Policy' => "default-src 'none'",
		'Cache-Control'           => 'no-store',
		'X-Powered-By'            => 'Corsen Context / Corsen AI',
	);

	/**
	 * Private IP ranges for SSRF protection.
	 */
	private const PRIVATE_RANGES = array(
		'10.0.0.0/8',
		'127.0.0.0/8',
		'172.16.0.0/12',
		'192.168.0.0/16',
		'169.254.0.0/16',
		'0.0.0.0/8',
	);

	/**
	 * Send security headers on all Corsen Context responses.
	 */
	public static function send_security_headers(): void {
		foreach ( self::RESPONSE_HEADERS as $name => $value ) {
			header( $name . ': ' . $value );
		}
	}

	/**
	 * Attach security headers through the WordPress REST response API.
	 *
	 * @param \WP_REST_Response $response REST response.
	 * @return \WP_REST_Response
	 */
	public static function add_security_headers( \WP_REST_Response $response ): \WP_REST_Response {
		foreach ( self::RESPONSE_HEADERS as $name => $value ) {
			$response->header( $name, $value );
		}
		return $response;
	}

	/**
	 * Check rate limiting.
	 *
	 * When a persistent external object cache is available (Redis/Memcached via
	 * wp-redis, W3TC, etc.), this uses the cache's atomic INCR so concurrent
	 * requests cannot each read a stale counter and slip past the limit. Without
	 * one, it falls back to a transient counter, which is best-effort under
	 * PHP-FPM concurrency (a simultaneous burst may undercount).
	 *
	 * @return bool True if request is allowed.
	 */
	public static function check_rate_limit(): bool {
		$settings    = get_option( 'corsen_context_settings', array() );
		$max_per_min = intval( $settings['rate_limit'] ?? 100 );

		$ip     = self::get_client_ip();
		$bucket = hash_hmac( 'sha256', $ip, wp_salt( 'auth' ) );
		// Atomic path: object-cache INCR (single Redis/Memcached round trip).
		if ( wp_using_ext_object_cache() ) {
			$key = 'corsen_rl_' . $bucket;
			// wp_cache_add is atomic and only seeds the counter (with a 60s TTL)
			// on the first request of the window.
			wp_cache_add( $key, 0, 'corsen_context', 60 );
			$count = wp_cache_incr( $key, 1, 'corsen_context' );
			if ( false === $count ) {
				// Key expired between add and incr — reseed for this window.
				wp_cache_set( $key, 1, 'corsen_context', 60 );
				$count = 1;
			}
			return $count <= $max_per_min;
		}

		// Fallback: transient counter (best-effort under concurrency).
		$key  = 'corsen_rl_' . $bucket;
		$data = get_transient( $key );
		if ( false === $data || ! is_array( $data ) ) {
			// First request in this window — set count=1 with 60s TTL.
			set_transient(
				$key,
				array(
					'count' => 1,
					'start' => time(),
				),
				60
			);
			return true;
		}

		// Check if window has expired (safety net if transient TTL drifts).
		if ( ( time() - intval( $data['start'] ) ) >= 60 ) {
			delete_transient( $key );
			set_transient(
				$key,
				array(
					'count' => 1,
					'start' => time(),
				),
				60
			);
			return true;
		}

		if ( intval( $data['count'] ) >= $max_per_min ) {
			return false;
		}

		// Increment count WITHOUT renewing the TTL.
		// We must re-set with remaining TTL, not a fresh 60s.
		$elapsed   = time() - intval( $data['start'] );
		$remaining = max( 1, 60 - $elapsed );
		set_transient(
			$key,
			array(
				'count' => intval( $data['count'] ) + 1,
				'start' => $data['start'],
			),
			$remaining
		);
		return true;
	}

	/**
	 * Garbage collector for expired plugin transients (rate limits + cached MCP
	 * responses). Scheduled via WP-Cron (hourly) to prevent wp_options bloat.
	 */
	public static function cleanup_rate_limits(): void {
		global $wpdb;
		$time = time();

		foreach ( array( 'corsen_rl_', 'corsen_mcp_' ) as $prefix ) {
			// 1. Delete timeouts that have expired.
			// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Scheduled cleanup must remove orphaned transients by prefix.
			$wpdb->query(
				$wpdb->prepare(
					"DELETE FROM {$wpdb->options} WHERE option_name LIKE %s AND option_value < %d",
					'_transient_timeout_' . $wpdb->esc_like( $prefix ) . '%',
					$time
				)
			);

			// 2. Delete the actual transients that no longer have a corresponding timeout.
			$wpdb->query(
				$wpdb->prepare(
					"DELETE a FROM {$wpdb->options} a
					LEFT JOIN {$wpdb->options} b ON b.option_name = CONCAT( '_transient_timeout_', SUBSTRING( a.option_name, 12 ) )
					WHERE a.option_name LIKE %s AND b.option_name IS NULL",
					'_transient_' . $wpdb->esc_like( $prefix ) . '%'
				)
			);
			// phpcs:enable WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
		}
	}

	/**
	 * Whether to trust reverse-proxy forwarding headers for the client IP.
	 *
	 * Off by default: X-Forwarded-For / X-Real-IP are attacker-controllable when
	 * the site is reachable directly, letting a client spoof a fresh IP per
	 * request and bypass the rate limiter. Enable only behind a trusted proxy,
	 * via `define( 'CORSEN_CONTEXT_TRUST_PROXY', true )` or the
	 * `corsen_context_trust_proxy` filter.
	 *
	 * @return bool
	 */
	private static function trust_proxy(): bool {
		if ( defined( 'CORSEN_CONTEXT_TRUST_PROXY' ) ) {
			return (bool) CORSEN_CONTEXT_TRUST_PROXY;
		}
		return (bool) apply_filters( 'corsen_context_trust_proxy', false );
	}

	/**
	 * Get the client IP used for rate limiting.
	 *
	 * Uses REMOTE_ADDR (the actual socket peer) unless a trusted proxy is
	 * configured, in which case the leftmost valid forwarding-header IP is used.
	 *
	 * @return string
	 */
	public static function get_client_ip(): string {

		$remote = isset( $_SERVER['REMOTE_ADDR'] )
			? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) )
			: '';

		if ( self::trust_proxy() ) {
			foreach ( array( 'HTTP_CF_CONNECTING_IP', 'HTTP_X_REAL_IP', 'HTTP_X_FORWARDED_FOR' ) as $header ) {
				if ( empty( $_SERVER[ $header ] ) ) {
					continue;
				}
				$value = sanitize_text_field( wp_unslash( $_SERVER[ $header ] ) );
				$ip    = trim( explode( ',', $value )[0] );
				if ( filter_var( $ip, FILTER_VALIDATE_IP ) ) {
					return $ip;
				}
			}
		}

		return '' !== $remote ? $remote : 'unknown';
	}

	/**
	 * Whether a response can safely be stored in a shared cache.
	 *
	 * WordPress filters, shortcodes, dynamic blocks and membership plugins may
	 * vary output by the current user or by request cookies. Never let such a
	 * request populate a cache that can later be served to another visitor.
	 *
	 * @return bool True when the current request is anonymous and cookie-free.
	 */
	public static function is_shared_cache_safe(): bool {

		if ( function_exists( 'is_user_logged_in' ) && is_user_logged_in() ) {
			return false;
		}
		if ( function_exists( 'has_filter' ) && false !== has_filter( 'corsen_context_can_expose_post' ) ) {
			return false;
		}

		return empty( $_COOKIE );
	}

	/**
	 * Validate an MCP Origin header against the site's own origin.
	 *
	 * Non-browser clients commonly omit Origin and are accepted. Browser
	 * requests that do provide it must be same-origin unless explicitly added
	 * through the corsen_context_allowed_origins filter.
	 *
	 * @param string $origin Incoming Origin header.
	 * @return bool True when the origin is allowed.
	 */
	public static function validate_origin( string $origin ): bool {

		$origin = trim( $origin );
		if ( '' === $origin ) {
			return true;
		}

		$site_origin = self::url_origin( home_url() );
		$allowed     = array( $site_origin );
		/** Filter browser origins allowed to call the MCP endpoint. */
		$allowed = (array) apply_filters( 'corsen_context_allowed_origins', $allowed );
		$allowed = array_filter( array_map( array( self::class, 'url_origin' ), $allowed ) );

		return in_array( self::url_origin( $origin ), $allowed, true );
	}

	/**
	 * Normalize a path for conservative exclusion comparisons.
	 *
	 * @param string $path Path or URL.
	 * @return string|null Lowercase leading-slash path, or null when ambiguous.
	 */
	public static function normalize_path( string $path ): ?string {

		$path = trim( $path );
		if ( '' === $path || str_contains( $path, "\0" ) ) {
				return null;
		}

		$parsed_path = wp_parse_url( $path, PHP_URL_PATH );
		if ( is_string( $parsed_path ) && '' !== $parsed_path ) {
			$path = $parsed_path;
		}

		for ( $i = 0; $i < 3; $i++ ) {
			$decoded = rawurldecode( $path );
			if ( $decoded === $path ) {
				break;
			}
			$path = $decoded;
		}
		if ( preg_match( '/[\x00-\x1F\x7F?#]/', $path ) ) {
			return null;
		}

		$path = str_replace( '\\', '/', $path );
		$path = preg_replace( '#/+#', '/', $path ) ?? $path;
		$path = '/' . ltrim( $path, '/' );

		foreach ( explode( '/', $path ) as $segment ) {
			if ( '.' === $segment || '..' === $segment ) {
				return null;
			}
		}

		$path = untrailingslashit( $path );
		$path = '' === $path ? '/' : $path;

		return function_exists( 'mb_strtolower' )
			? mb_strtolower( $path, 'UTF-8' )
			: strtolower( $path );
	}

	/**
	 * Extract a canonical scheme/host/port origin.
	 *
	 * @param string $url URL or Origin value.
	 * @return string Empty when invalid.
	 */
	private static function url_origin( string $url ): string {

		$parts = wp_parse_url( trim( $url ) );
		if (
			! is_array( $parts ) ||
			empty( $parts['scheme'] ) ||
			empty( $parts['host'] ) ||
			isset( $parts['user'] ) ||
			isset( $parts['pass'] )
		) {
			return '';
		}

		$scheme = strtolower( (string) $parts['scheme'] );
		if ( ! in_array( $scheme, array( 'http', 'https' ), true ) ) {
			return '';
		}

		$origin = $scheme . '://' . strtolower( (string) $parts['host'] );
		$port   = isset( $parts['port'] ) ? intval( $parts['port'] ) : null;
		if ( null !== $port && ! ( 'http' === $scheme && 80 === $port ) && ! ( 'https' === $scheme && 443 === $port ) ) {
			$origin .= ':' . intval( $parts['port'] );
		}

		return $origin;
	}
	/**
	 * Check if URL is private/internal (SSRF protection).
	 *
	 * @param string $url URL to check.
	 * @return bool True if URL is private.
	 */
	public static function is_private_url( string $url ): bool {
		$parsed = wp_parse_url( $url );
		if ( ! $parsed || empty( $parsed['host'] ) ) {
			return true;
		}

		$host = strtolower( $parsed['host'] );

		if ( 'localhost' === $host || '::1' === $host ) {
			return true;
		}

		$ip = gethostbyname( $host );
		if ( $ip === $host ) {
			return true; // Could not resolve — fail closed (block by default).
		}

		foreach ( self::PRIVATE_RANGES as $range ) {
			if ( self::ip_in_range( $ip, $range ) ) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Check if IP is in CIDR range.
	 *
	 * @param string $ip    IP address.
	 * @param string $range CIDR range.
	 * @return bool
	 */
	private static function ip_in_range( string $ip, string $range ): bool {
		list( $subnet, $bits ) = explode( '/', $range );
		$ip_long               = ip2long( $ip );
		$subnet_long           = ip2long( $subnet );
		$mask                  = -1 << ( 32 - intval( $bits ) );

		return ( $ip_long & $mask ) === ( $subnet_long & $mask );
	}

	/**
	 * Validate API key if configured.
	 *
	 * @param \WP_REST_Request $request REST request.
	 * @return bool
	 */
	public static function validate_api_key( $request ): bool {
		$settings = get_option( 'corsen_context_settings', array() );
		$api_key  = defined( 'CORSEN_CONTEXT_API_KEY' ) ? CORSEN_CONTEXT_API_KEY : null;

		if ( empty( $api_key ) ) {
			return true; // No key configured = public.
		}

		$provided = $request->get_header( 'X-MCP-Key' );
		if ( empty( $provided ) ) {
			$auth = $request->get_header( 'Authorization' );
			if ( $auth && str_starts_with( $auth, 'Bearer ' ) ) {
				$provided = substr( $auth, 7 );
			}
		}

		if ( empty( $provided ) ) {
			return false;
		}

		return hash_equals( $api_key, $provided );
	}

	/**
	 * Owner opt-in: anonymous agents must not enumerate author logins through
	 * the core REST users collection. Logged-in requests keep working.
	 *
	 * @param array<string,mixed> $endpoints Registered REST routes.
	 * @return array<string,mixed>
	 */
	public static function maybe_hide_user_enumeration( array $endpoints ): array {
		$settings = get_option( 'corsen_context_settings', array() );
		if ( ! empty( $settings['hide_user_enumeration'] ) && ! is_user_logged_in() ) {
			unset( $endpoints['/wp/v2/users'], $endpoints['/wp/v2/users/(?P<id>[\d]+)'] );
		}
		return $endpoints;
	}
}
