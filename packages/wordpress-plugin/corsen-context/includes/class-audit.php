<?php
/**
 * Bounded tool-call audit trail for Corsen Context.
 *
 * One row per tool call attempt: when, which tool, an argument FINGERPRINT
 * (never the arguments themselves), a salted hash of the client IP, outcome
 * and duration. Hard-capped at MAX_ROWS rows and MAX_AGE_DAYS days, so the
 * log cannot become a liability. Created on activation and verified lazily;
 * never queried on public front-end responses.
 *
 * Powered by Corsen Context - Built by Corsen AI - github.com/CorsenAI/corsen-context
 *
 * @package Corsen_Context
 */

defined( 'ABSPATH' ) || exit;

/**
 * Audit log.
 */
class Corsen_Context_Audit {

	/** Hard row cap; oldest rows are pruned on write. */
	private const MAX_ROWS = 500;

	/** Hard age cap in days. */
	private const MAX_AGE_DAYS = 30;

	/** Rows shown in the Control Center. */
	public const RECENT_ROWS = 20;

	/**
	 * Table name for the current install.
	 */
	public static function table_name(): string {
		global $wpdb;
		return $wpdb->prefix . 'corsen_context_audit';
	}

	/**
	 * Create (or upgrade) the table. Safe to call repeatedly.
	 */
	public static function install(): void {
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';
		global $wpdb;
		$table   = self::table_name();
		$charset = $wpdb->get_charset_collate();
		$schema  = "CREATE TABLE {$table} (
			id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
			occurred_at DATETIME NOT NULL,
			tool VARCHAR(64) NOT NULL,
			args_fp CHAR(64) NOT NULL,
			ip_hash CHAR(24) NOT NULL,
			status VARCHAR(16) NOT NULL,
			duration_ms INT UNSIGNED NOT NULL DEFAULT 0,
			PRIMARY KEY  (id),
			KEY occurred_at (occurred_at)
		) {$charset};";
		dbDelta( $schema );
	}

	/**
	 * Install lazily on admin load when the plugin version changed, so
	 * existing installs get the table without a reactivation.
	 */
	public static function maybe_install(): void {
		if ( (string) get_option( 'corsen_context_audit_db_version', '' ) === (string) CORSEN_CONTEXT_VERSION ) {
			return;
		}
		self::install();
		update_option( 'corsen_context_audit_db_version', CORSEN_CONTEXT_VERSION, false );
	}

	/**
	 * Whether the feature is on (default: off until the owner enables it).
	 */
	public static function enabled(): bool {
		$settings = get_option( 'corsen_context_settings', array() );
		return ! empty( $settings['audit_enabled'] );
	}

	/**
	 * Record one tool call. Never throws, never blocks the response.
	 *
	 * @param string              $tool      Tool name.
	 * @param array<mixed>        $args      Raw arguments (fingerprinted, not stored).
	 * @param array<string,mixed> $outcome   execute_tool() shape.
	 * @param int                 $duration_ms Whole-call duration.
	 */
	public static function record( string $tool, array $args, array $outcome, int $duration_ms ): void {
		if ( ! self::enabled() ) {
			return;
		}
		global $wpdb;
		if ( ! self::table_exists() ) {
			return;
		}
		// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- Bounded audit writes, own table.
		$wpdb->query(
			$wpdb->prepare(
				'INSERT INTO ' . self::table_name() . ' (occurred_at, tool, args_fp, ip_hash, status, duration_ms) VALUES (%s, %s, %s, %s, %s, %d)', // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared -- Table name is prefix-derived; all values are prepared.
				gmdate( 'Y-m-d H:i:s' ),
				substr( $tool, 0, 64 ),
				self::fingerprint( $args ),
				self::ip_hash(),
				empty( $outcome['ok'] ) ? 'error' : 'ok',
				max( 0, min( $duration_ms, 4294967294 ) )
			)
		);
		$wpdb->query( 'DELETE FROM ' . self::table_name() . ' WHERE id <= (SELECT MIN(id) FROM (SELECT id FROM ' . self::table_name() . ' ORDER BY id DESC LIMIT 1 OFFSET ' . ( self::MAX_ROWS - 1 ) . ') keep)' ); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.DirectDatabaseQuery.DirectQuery -- Cap subquery; all identifiers prefix-derived, numeric constant inlined.
		// phpcs:enable
	}

	/**
	 * Recent rows for the Control Center (admin view only).
	 *
	 * @return array<int,object{occurred_at:string,tool:string,args_fp:string,ip_hash:string,status:string,duration_ms:int}>
	 */
	public static function recent(): array {
		global $wpdb;
		if ( ! self::table_exists() ) {
			return array();
		}
		// phpcs:disable WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- Admin-only bounded read.
		$rows = $wpdb->get_results(
			$wpdb->prepare( 'SELECT occurred_at, tool, args_fp, ip_hash, status, duration_ms FROM ' . self::table_name() . ' ORDER BY id DESC LIMIT %d', self::RECENT_ROWS )
		);
		// phpcs:enable
		return is_array( $rows ) ? $rows : array();
	}

	/**
	 * Hourly pruning: age cap even when traffic is too low for write-pruning.
	 */
	public static function prune(): void {
		global $wpdb;
		if ( ! self::table_exists() ) {
			return;
		}
		$cut = gmdate( 'Y-m-d H:i:s', time() - self::MAX_AGE_DAYS * DAY_IN_SECONDS );
		// phpcs:disable WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- Maintenance on own table.
		$wpdb->query( $wpdb->prepare( 'DELETE FROM ' . self::table_name() . ' WHERE occurred_at < %s', $cut ) );
		// phpcs:enable
	}

	/**
	 * Empty the log (owner privacy action from the Control Center).
	 */
	public static function purge(): void {
		global $wpdb;
		if ( ! self::table_exists() ) {
			return;
		}
		// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.DirectDatabaseQuery.DirectQuery -- Owner-requested clear of prefix-derived own table.
		$wpdb->query( 'TRUNCATE TABLE ' . self::table_name() );
	}

	/**
	 * Whether the log is readable right now (table present, DB handle alive).
	 */
	public static function available(): bool {
		global $wpdb;
		return is_object( $wpdb ) && self::table_exists();
	}

	/**
	 * Whether the table is present this request (cached statically).
	 */
	private static function table_exists(): bool {
		static $exists = null;
		global $wpdb;
		if ( ! is_object( $wpdb ) ) {
			return false;
		}
		if ( null === $exists ) {
			// phpcs:disable WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- Existence probe on prefix-derived table name.
			$exists = ( self::table_name() === $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', self::table_name() ) ) );
			// phpcs:enable
		}
		return $exists;
	}

	/**
	 * Argument fingerprint: names + value lengths only, so the log cannot
	 * leak searched keywords, URLs, emails or messages, yet repeated abuse
	 * patterns remain visible.
	 *
	 * @param array<mixed> $args Raw arguments.
	 */
	private static function fingerprint( array $args ): string {
		ksort( $args );
		$parts = array();
		foreach ( $args as $key => $value ) {
			$type    = is_bool( $value ) ? 'b' : ( is_int( $value ) || is_float( $value ) ? 'n' : ( is_array( $value ) ? 'a' : 's' ) );
			$parts[] = $type . ':' . $key . ':' . ( is_scalar( $value ) ? strlen( (string) $value ) : 0 );
		}
		return hash( 'sha256', implode( '|', $parts ) );
	}

	/**
	 * Salted, truncated IP hash: links bursts to one client without storing IPs.
	 */
	private static function ip_hash(): string {
		return substr( hash_hmac( 'sha256', Corsen_Context_Security::get_client_ip(), wp_salt( 'auth' ) ), 0, 24 );
	}
}
