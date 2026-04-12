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

// Remove cached llms.txt files.
delete_transient( 'corsen_context_llms_txt' );
delete_transient( 'corsen_context_llms_full_txt' );

// Remove ALL rate-limit transients (corsen_rl_*) to prevent database bloat.
// These are stored as _transient_corsen_rl_* and _transient_timeout_corsen_rl_* in wp_options.
$wpdb->query( "DELETE FROM {$wpdb->options} WHERE option_name LIKE '_transient_corsen_rl_%'" );
$wpdb->query( "DELETE FROM {$wpdb->options} WHERE option_name LIKE '_transient_timeout_corsen_rl_%'" );
