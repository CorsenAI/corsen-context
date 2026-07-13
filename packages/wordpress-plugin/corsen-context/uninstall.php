<?php
/**
 * Corsen Context uninstall script.
 * Cleans up ALL options and transients when plugin is deleted.
 *
 * Powered by Corsen Context - Built by Corsen AI - github.com/CorsenAI/corsen-context
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

global $wpdb;

// Remove plugin settings.
delete_option( 'corsen_context_settings' );
delete_option( 'corsen_context_cache_version' );

// Remove cached llms.txt files.
delete_transient( 'corsen_context_llms_txt' );
delete_transient( 'corsen_context_llms_full_txt' );

// Remove ALL plugin transients (rate limits + cached MCP responses) to prevent
// database bloat. Stored as _transient_<name> and _transient_timeout_<name>.
$wpdb->query( "DELETE FROM {$wpdb->options} WHERE option_name LIKE '_transient_corsen_rl_%'" );
$wpdb->query( "DELETE FROM {$wpdb->options} WHERE option_name LIKE '_transient_timeout_corsen_rl_%'" );
$wpdb->query( "DELETE FROM {$wpdb->options} WHERE option_name LIKE '_transient_corsen_mcp_%'" );
$wpdb->query( "DELETE FROM {$wpdb->options} WHERE option_name LIKE '_transient_timeout_corsen_mcp_%'" );
