<?php
/**
 * Security layer for Corsen Context.
 *
 * Powered by Corsen Context - Built by Corsen AI - github.com/CorsenAI/corsen-context
 */

defined( 'ABSPATH' ) || exit;

class Corsen_Context_Security {

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
		header( 'X-Content-Type-Options: nosniff' );
		header( 'X-Frame-Options: DENY' );
		header( 'X-XSS-Protection: 0' );
		header( 'Referrer-Policy: strict-origin-when-cross-origin' );
		header( "Content-Security-Policy: default-src 'none'" );
		header( 'Cache-Control: no-store' );
		header( 'X-Powered-By: Corsen Context / Corsen AI' );
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
		$bucket = md5( $ip );

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
			set_transient( $key, array( 'count' => 1, 'start' => time() ), 60 );
			return true;
		}

		// Check if window has expired (safety net if transient TTL drifts).
		if ( ( time() - intval( $data['start'] ) ) >= 60 ) {
			delete_transient( $key );
			set_transient( $key, array( 'count' => 1, 'start' => time() ), 60 );
			return true;
		}

		if ( intval( $data['count'] ) >= $max_per_min ) {
			return false;
		}

		// Increment count WITHOUT renewing the TTL.
		// We must re-set with remaining TTL, not a fresh 60s.
		$elapsed   = time() - intval( $data['start'] );
		$remaining = max( 1, 60 - $elapsed );
		set_transient( $key, array( 'count' => intval( $data['count'] ) + 1, 'start' => $data['start'] ), $remaining );
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
		$ip_long     = ip2long( $ip );
		$subnet_long = ip2long( $subnet );
		$mask        = -1 << ( 32 - intval( $bits ) );

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
}
