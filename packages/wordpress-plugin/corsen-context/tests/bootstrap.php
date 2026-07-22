<?php
/** PHPUnit bootstrap for lightweight unit tests and the WordPress test suite. */

$wp_tests_dir = getenv( 'WP_TESTS_DIR' );
if ( $wp_tests_dir && file_exists( $wp_tests_dir . '/includes/functions.php' ) ) {
	require_once $wp_tests_dir . '/includes/functions.php';
	tests_add_filter(
		'muplugins_loaded',
		static function (): void {
			require dirname( __DIR__ ) . '/corsen-context.php';
		}
	);
	require $wp_tests_dir . '/includes/bootstrap.php';
	return;
}

define( 'ABSPATH', __DIR__ . '/' );

if ( ! class_exists( 'WP_UnitTestCase' ) ) {
	abstract class WP_UnitTestCase extends PHPUnit\Framework\TestCase {}
}

$GLOBALS['corsen_test_filter_log'] = array();
$GLOBALS['corsen_test_filters']    = array();

function apply_filters( string $hook, $value, ...$args ) {
	$GLOBALS['corsen_test_filter_log'][] = $hook;
	if ( isset( $GLOBALS['corsen_test_filters'][ $hook ] ) && is_callable( $GLOBALS['corsen_test_filters'][ $hook ] ) ) {
		return $GLOBALS['corsen_test_filters'][ $hook ]( $value, ...$args );
	}
	return $value;
}

function wp_parse_url( string $url, int $component = -1 ) {
	return -1 === $component ? parse_url( $url ) : parse_url( $url, $component );
}

function untrailingslashit( string $value ): string {
	return rtrim( $value, '/\\' );
}

function trailingslashit( string $value ): string {
	return untrailingslashit( $value ) . '/';
}

function wp_strip_all_tags( string $text ): string {
	return strip_tags( $text );
}

function home_url( string $path = '' ): string {
	return 'https://example.com' . $path;
}

function wp_salt( string $scheme = 'auth' ): string {
	return 'unit-test-salt-' . $scheme;
}

function is_user_logged_in(): bool {
	return false;
}

function sanitize_key( string $key ): string {
	return preg_replace( '/[^a-z0-9_\-]/', '', strtolower( $key ) ) ?? '';
}

function strip_shortcodes( string $content ): string {
	return preg_replace( '/\[[^\]]+\]/', '', $content ) ?? $content;
}

function do_shortcode( string $content ): string {
	return $content;
}

class WP_Post {
	public int $ID                   = 1;
	public string $post_content      = '';
	public string $post_excerpt      = '';
	public string $post_type         = 'post';
	public string $post_status       = 'publish';
	public string $post_password     = '';
	public string $post_date_gmt     = '';
	public string $post_modified_gmt = '';
	public int $post_author          = 1;
}

require_once dirname( __DIR__ ) . '/includes/class-security.php';
require_once dirname( __DIR__ ) . '/includes/class-content-converter.php';
