<?php
/** PHPUnit bootstrap for the official WordPress integration test suite. */

$wp_tests_dir = getenv( 'WP_TESTS_DIR' );
if ( ! is_string( $wp_tests_dir ) || ! file_exists( $wp_tests_dir . '/includes/functions.php' ) ) {
	throw new RuntimeException( 'WP_TESTS_DIR must point to the installed WordPress test suite.' );
}

require_once $wp_tests_dir . '/includes/functions.php';

tests_add_filter(
	'muplugins_loaded',
	static function (): void {
		require dirname( __DIR__ ) . '/corsen-context.php';
	}
);

require $wp_tests_dir . '/includes/bootstrap.php';
