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
	'_transient_corsen_expt_%',
	'_transient_timeout_corsen_expt_%',
	'_transient_corsen_expert_count',
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

// Remove the bounded audit log table and its install marker.
// phpcs:disable WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.DirectDatabaseQuery.SchemaChange -- Own prefix-derived table, dropped on explicit plugin deletion.
$wpdb->query( 'DROP TABLE IF EXISTS ' . $wpdb->prefix . 'corsen_context_audit' );
// phpcs:enable WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.DirectDatabaseQuery.SchemaChange
delete_option( 'corsen_context_audit_db_version' );

// Remove every stored expert-request submission and its meta.
$expert_ids = get_posts(
	array(
		'post_type'     => 'cc_expert_request',
		'post_status'   => 'any',
		'numberposts'   => -1,
		'fields'        => 'ids',
		'no_found_rows' => true,
	)
);
foreach ( $expert_ids as $expert_id ) {
	wp_delete_post( (int) $expert_id, true );
}
