<?php
/** PHPUnit bootstrap for lightweight unit tests. */

define( 'ABSPATH', __DIR__ . '/' );

if ( ! class_exists( 'WP_UnitTestCase' ) ) {
	abstract class WP_UnitTestCase extends PHPUnit\Framework\TestCase {}
}

if ( ! class_exists( 'WP_REST_Response' ) ) {
	class WP_REST_Response {
		private $data;
		private int $status;
		private array $headers = array();

		public function __construct( $data = null, int $status = 200 ) {
			$this->data   = $data;
			$this->status = $status;
		}

		public function header( string $name, string $value ): void {
			$this->headers[ $name ] = $value;
		}

		public function get_data() {
			return $this->data;
		}

		public function get_status(): int {
			return $this->status;
		}

		public function get_headers(): array {
			return $this->headers;
		}
	}
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

function rest_url( string $path = '' ): string {
	if ( isset( $GLOBALS['corsen_test_rest_url'] ) && is_callable( $GLOBALS['corsen_test_rest_url'] ) ) {
		return $GLOBALS['corsen_test_rest_url']( $path );
	}
	return 'https://example.com/wp-json/' . ltrim( $path, '/' );
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

function checked( $checked, $current = true, bool $display = true ): string {
	$result = $checked == $current ? ' checked="checked"' : ''; // phpcs:ignore Universal.Operators.StrictComparisons.LooseEqual -- Mirrors WordPress checked().
	if ( $display ) {
		echo $result; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Static test-only attribute.
	}
	return $result;
}

function add_action( ...$args ): bool { return true; }

function add_filter( ...$args ): bool { return true; }

function register_setting( ...$args ): void {}

function add_settings_section( ...$args ): void {}

function add_settings_field( ...$args ): void {}

function sanitize_text_field( $s ): string { return trim( (string) $s ); }

function sanitize_textarea_field( $s ): string { return trim( (string) $s ); }

function esc_url( $url ): string { return (string) $url; }

function admin_url( string $path = '' ): string { return 'https://example.com/wp-admin/' . $path; }

function get_post_types( $args = array(), $output = 'names' ) {
	if ( 'objects' === $output ) {
		$out = array();
		foreach ( array( 'post' => 'Posts', 'page' => 'Pages', 'product' => 'Products' ) as $name => $label ) {
			$pt                 = new stdClass();
			$pt->name           = $name;
			$pt->labels         = new stdClass();
			$pt->labels->name   = $label;
			$out[ $name ]       = $pt;
		}
		return $out;
	}
	return array( 'post' => 'post', 'page' => 'page', 'product' => 'product' );
}

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
require_once dirname( __DIR__ ) . '/includes/class-control-center.php';
require_once dirname( __DIR__ ) . '/includes/class-abilities.php';

/* ---- Admin-surface stubs (Control Center render tests) ---- */

if ( ! function_exists( '__' ) ) {
	function __( string $text, string $domain = 'default' ): string { return $text; }
}
if ( ! function_exists( 'esc_html__' ) ) {
	function esc_html__( string $text, string $domain = 'default' ): string { return htmlspecialchars( $text, ENT_QUOTES ); }
}
if ( ! function_exists( 'esc_html_e' ) ) {
	function esc_html_e( string $text, string $domain = 'default' ): void { echo htmlspecialchars( $text, ENT_QUOTES ); }
}
if ( ! function_exists( 'esc_attr__' ) ) {
	function esc_attr__( string $text, string $domain = 'default' ): string { return htmlspecialchars( $text, ENT_QUOTES ); }
}
if ( ! function_exists( 'esc_textarea' ) ) {
	function esc_textarea( $text ): string { return htmlspecialchars( (string) $text, ENT_QUOTES ); }
}
if ( ! function_exists( 'get_transient' ) ) {
	function get_transient( string $key ) { return $GLOBALS['corsen_test_transients'][ $key ] ?? false; }
}
if ( ! function_exists( 'current_user_can' ) ) {
	function current_user_can( string $cap ): bool { return ! empty( $GLOBALS['corsen_test_can_manage'] ); }
}
if ( ! function_exists( 'add_submenu_page' ) ) {
	function add_submenu_page( ...$args ): string { return 'corsen-context-control'; }
}
if ( ! function_exists( 'settings_fields' ) ) {
	function settings_fields( string $group ): void { echo '<input type="hidden" name="option" value="' . esc_attr( $group ) . '" />'; }
}
if ( ! function_exists( 'submit_button' ) ) {
	function submit_button( ?string $text = null ): void { echo '<p class="submit"><input type="submit" value="' . esc_attr( (string) $text ) . '" /></p>'; }
}
if ( ! function_exists( 'number_format_i18n' ) ) {
	function number_format_i18n( $number, int $decimals = 0 ): string { return number_format( (float) $number, $decimals ); }
}

/* ---- Abilities API + misc stubs ---- */

if ( ! class_exists( 'WP_Error' ) ) {
	class WP_Error {
		public string $code;
		public string $message;
		public function __construct( string $code = '', string $message = '' ) {
			$this->code    = $code;
			$this->message = $message;
		}
		public function get_error_code(): string { return $this->code; }
		public function get_error_message(): string { return $this->message; }
	}
}
$GLOBALS['corsen_test_abilities']         = array();
$GLOBALS['corsen_test_ability_categories'] = array();
if ( ! function_exists( 'wp_register_ability' ) ) {
	function wp_register_ability( string $name, array $args ) {
		$GLOBALS['corsen_test_abilities'][ $name ] = $args;
		return (object) array( 'name' => $name );
	}
}
if ( ! function_exists( 'wp_register_ability_category' ) ) {
	function wp_register_ability_category( string $name, array $args ): void {
		$GLOBALS['corsen_test_ability_categories'][ $name ] = $args;
	}
}
if ( ! function_exists( '__return_true' ) ) {
	function __return_true(): bool { return true; }
}
if ( ! function_exists( 'set_transient' ) ) {
	function set_transient( $k, $v, $e = 0 ): bool { return true; }
}
if ( ! function_exists( 'wp_next_scheduled' ) ) {
	function wp_next_scheduled( $h ): bool { return true; }
}
if ( ! function_exists( 'get_posts' ) ) {
	function get_posts( array $args = array() ): array { return $GLOBALS['corsen_test_posts'] ?? array(); }
}
if ( ! function_exists( 'get_permalink' ) ) {
	function get_permalink( $post = null ): string { return 'https://example.com/?p=1'; }
}
if ( ! function_exists( 'get_the_title' ) ) {
	function get_the_title( $post = 0 ): string { return 'Test post'; }
}
if ( ! function_exists( 'url_to_postid' ) ) {
	function url_to_postid( $url ): int { return $GLOBALS['corsen_test_url_to_postid'] ?? 0; }
}
if ( ! function_exists( 'get_post' ) ) {
	function get_post( $id = null ) { return $GLOBALS['corsen_test_post'] ?? null; }
}
