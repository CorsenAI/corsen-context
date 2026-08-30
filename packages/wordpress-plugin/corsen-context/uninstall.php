<?php
/**
 * Corsen Context uninstall script.
 * Cleans up ALL options and transients when plugin is deleted.
 *
 * Powered by Corsen Context - Built by Corsen AI - github.com/CorsenAI/corsen-context
 *
 * @package Corsen_Context
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

global $wpdb;

// Remove plugin settings.
delete_option( 'corsen_context_settings' );
delete_option( 'corsen_context_cache_version' );
delete_option( 'corsen_context_db_version' );
delete_option( 'corsen_context_rewrite_version' );
delete_option( 'corsen_context_llms_full_generation_lock' );
// Removed experimental form storage from 1.4.0.
delete_option( 'corsen_context_form_submissions' );
// Remove cached llms.txt files.
delete_transient( 'corsen_context_llms_txt' );
delete_transient( 'corsen_context_llms_full_txt' );
wp_clear_scheduled_hook( 'corsen_context_hourly_cleanup' );
wp_clear_scheduled_hook( 'corsen_context_regenerate_llms_full' );
wp_clear_scheduled_hook( 'corsen_context_regenerate_llms_full_once' );
// Remove ALL plugin transients (rate limits + cached MCP responses) to prevent
// database bloat. Stored as _transient_<name> and _transient_timeout_<name>.
$transient_patterns = array(
	'_transient_corsen_rl_%',
	'_transient_timeout_corsen_rl_%',
	'_transient_corsen_mcp_%',
	'_transient_timeout_corsen_mcp_%',
);
foreach ( $transient_patterns as $pattern ) {
	// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Uninstall must remove plugin transients by prefix.
	$wpdb->query(
		$wpdb->prepare(
			"DELETE FROM {$wpdb->options} WHERE option_name LIKE %s",
			$wpdb->esc_like( rtrim( $pattern, '%' ) ) . '%'
		)
	);
	// phpcs:enable WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
}
