<?php
/** PHPUnit bootstrap for lightweight unit tests. */

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

function get_option( string $name, $default = false ) {
	return $GLOBALS['corsen_test_options'][ $name ] ?? $default;
}

$GLOBALS['corsen_test_options'] = array();

function esc_attr( $text ): string {
	return htmlspecialchars( (string) $text, ENT_QUOTES );
}

function esc_html( $text ): string {
	return htmlspecialchars( (string) $text, ENT_QUOTES );
}

function add_action( ...$args ): bool { return true; }

function add_filter( ...$args ): bool { return true; }

function register_setting( ...$args ): void {}

function add_settings_section( ...$args ): void {}

function add_settings_field( ...$args ): void {}

function sanitize_text_field( $s ): string { return trim( (string) $s ); }

function sanitize_textarea_field( $s ): string { return trim( (string) $s ); }

function get_post_types( $args = array() ): array { return array( 'post' => 'post', 'page' => 'page', 'product' => 'product' ); }

function delete_transient( $k ): bool { return true; }

function update_option( $k, $v ): bool { return true; }

function wp_json_encode( $data, int $options = 0, int $depth = 512 ) {
	return json_encode( $data, $options, $depth );
}

require_once dirname( __DIR__ ) . '/includes/class-security.php';
require_once dirname( __DIR__ ) . '/includes/class-content-converter.php';
require_once dirname( __DIR__ ) . '/includes/class-mcp-server.php';
require_once dirname( __DIR__ ) . '/includes/class-webmcp.php';
require_once dirname( __DIR__ ) . '/includes/class-admin.php';
