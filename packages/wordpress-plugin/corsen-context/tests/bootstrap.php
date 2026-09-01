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
	public string $post_name         = 'test-post';
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
require_once dirname( __DIR__ ) . '/includes/class-tool-registry.php';
require_once dirname( __DIR__ ) . '/includes/class-products.php';
require_once dirname( __DIR__ ) . '/includes/class-sections.php';
require_once dirname( __DIR__ ) . '/includes/class-structured-data.php';
require_once dirname( __DIR__ ) . '/includes/class-agent-access.php';
require_once dirname( __DIR__ ) . '/includes/class-expert.php';
require_once dirname( __DIR__ ) . '/includes/class-audit.php';
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
if ( ! function_exists( 'wp_remote_get' ) ) {
	function wp_remote_get( $url, $args = array() ) {
		$GLOBALS['corsen_test_http_calls'][] = array( 'GET', $url, $args );
		return $GLOBALS['corsen_test_http_response'] ?? array( 'response' => array( 'code' => 200 ), 'headers' => array(), 'body' => '' );
	}
}
if ( ! function_exists( 'wp_remote_post' ) ) {
	function wp_remote_post( $url, $args = array() ) {
		$GLOBALS['corsen_test_http_calls'][] = array( 'POST', $url, $args );
		return $GLOBALS['corsen_test_http_response'] ?? array( 'response' => array( 'code' => 200 ), 'headers' => array(), 'body' => '' );
	}
}
if ( ! function_exists( 'wp_remote_retrieve_response_code' ) ) {
	function wp_remote_retrieve_response_code( $response ) {
		$code = is_array( $response ) ? ( $response['response']['code'] ?? 0 ) : 0;
		return (int) $code;
	}
}
if ( ! function_exists( 'wp_remote_retrieve_body' ) ) {
	function wp_remote_retrieve_body( $response ) {
		return is_array( $response ) ? (string) ( $response['body'] ?? '' ) : '';
	}
}
if ( ! function_exists( 'wp_remote_retrieve_header' ) ) {
	function wp_remote_retrieve_header( $response, $header ) {
		return is_array( $response ) ? (string) ( $response['headers'][ $header ] ?? '' ) : '';
	}
}
if ( ! function_exists( 'is_wp_error' ) ) {
	function is_wp_error( $thing ): bool {
		return $thing instanceof \WP_Error;
	}
}
if ( ! function_exists( '__return_true' ) ) {
	function __return_true(): bool { return true; }
}
if ( ! function_exists( 'set_transient' ) ) {
	function set_transient( $k, $v, $e = 0 ): bool { return true; }
}
if ( ! function_exists( 'wp_count_posts' ) ) {
	function wp_count_posts( $type ) {
		$o           = new \stdClass();
		$o->publish = 0;
		$o->private  = (int) ( $GLOBALS['corsen_test_expert_count'] ?? 0 );
		return $o;
	}
}
if ( ! function_exists( 'esc_js' ) ) {
	function esc_js( $text ): string { return htmlspecialchars( (string) $text, ENT_QUOTES ); }
}
if ( ! function_exists( 'wp_get_attachment_image_src' ) ) {
	function wp_get_attachment_image_src( $id, $size = 'thumbnail' ) {
		return $GLOBALS['corsen_test_media_src'] ?? array( 'https://example.com/img.jpg', 800, 600 );
	}
}
if ( ! function_exists( 'get_post_meta' ) ) {
	function get_post_meta( $post_id, $key = '', $single = false ) {
		if ( '' === $key ) {
			return array();
		}
		return $GLOBALS['corsen_test_postmeta'][ (int) $post_id ][ $key ] ?? '';
	}
}
if ( ! function_exists( 'get_woocommerce_currency' ) ) {
	function get_woocommerce_currency(): string { return $GLOBALS['corsen_test_currency'] ?? 'EUR'; }
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

// --- Extension-tool stubs (products, expert, audit, control center v2). ---
$GLOBALS['corsen_test_mails']    = array();
$GLOBALS['corsen_test_postmeta'] = array();
$GLOBALS['corsen_test_inserts']  = array();
if ( ! function_exists( 'register_post_type' ) ) {
	function register_post_type( $t, $a = array() ) { return (object) array( 'name' => $t ); }
}
if ( ! function_exists( 'wp_insert_post' ) ) {
	function wp_insert_post( array $args, $arr = false ) {
		$GLOBALS['corsen_test_inserts'][] = $args;
		return $GLOBALS['corsen_test_insert_id'] ?? 99;
	}
}
if ( ! function_exists( 'update_post_meta' ) ) {
	function update_post_meta( $id, $key, $value ) {
		$GLOBALS['corsen_test_postmeta'][ $id ][ $key ] = $value;
		return true;
	}
}
if ( ! function_exists( 'wp_mail' ) ) {
	function wp_mail( $to, $subject, $message, $headers = '', $attachments = array() ): bool {
		$GLOBALS['corsen_test_mails'][] = compact( 'to', 'subject', 'message' );
		return true;
	}
}
if ( ! function_exists( 'get_bloginfo' ) ) {
	function get_bloginfo( $k = '' ): string { return 'Test Site'; }
}
if ( ! function_exists( 'is_email' ) ) {
	function is_email( $email ) {
		return filter_var( (string) $email, FILTER_VALIDATE_EMAIL ) ?: false;
	}
}
if ( ! function_exists( 'sanitize_email' ) ) {
	function sanitize_email( $email ): string {
		$email = strtolower( trim( (string) $email ) );
		return filter_var( $email, FILTER_VALIDATE_EMAIL ) ? $email : '';
	}
}
if ( ! defined( 'MINUTE_IN_SECONDS' ) ) {
	define( 'MINUTE_IN_SECONDS', 60 );
	define( 'HOUR_IN_SECONDS', 3600 );
	define( 'DAY_IN_SECONDS', 86400 );
	define( 'WEEK_IN_SECONDS', 604800 );
}
if ( ! function_exists( 'esc_url_raw' ) ) {
	function esc_url_raw( $url ): string { return (string) $url; }
}
if ( ! function_exists( 'wp_unslash' ) ) {
	function wp_unslash( $v ) { return is_string( $v ) ? stripslashes( $v ) : $v; }
}
if ( ! function_exists( 'post_password_required' ) ) {
	function post_password_required( $post = null ): bool { return false; }
}
if ( ! function_exists( 'get_the_terms' ) ) {
	function get_the_terms( $post, $tax ) { return $GLOBALS['corsen_test_terms'] ?? false; }
}
if ( ! function_exists( 'wp_get_attachment_image_url' ) ) {
	function wp_get_attachment_image_url( $id, $size = 'thumbnail' ): string { return 'https://example.com/img.jpg'; }
}
if ( ! function_exists( 'get_post_modified_time' ) ) {
	function get_post_modified_time( $g = 'U', $gmt = false, $post = null ) { return '1750000000'; }
}
if ( ! function_exists( 'wp_nonce_url' ) ) {
	function wp_nonce_url( $url, $action = -1, $name = '_wpnonce' ) {
		return $url . '&' . $name . '=testnonce';
	}
}
if ( ! class_exists( 'WP_Query' ) ) {
	class WP_Query {
		/** @var int */
		public $found_posts = 0;
		/** @var array<int,mixed> */
		public $posts = array();
		public function __construct( $args = array() ) {
			unset( $args );
			$this->found_posts = (int) ( $GLOBALS['corsen_test_found_posts'] ?? 0 );
			$this->posts       = $GLOBALS['corsen_test_posts'] ?? array();
		}
	}
}
