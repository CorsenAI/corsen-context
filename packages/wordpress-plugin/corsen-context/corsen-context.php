<?php
/**
 * Plugin Name: Corsen Context
 * Plugin URI: https://github.com/CorsenAI/corsen-context
 * Description: Publish selected public content through llms.txt and a read-only MCP-style JSON-RPC endpoint.
 * Version: 1.4.1
 * Author: Corsen AI
 * Author URI: https://corsen.ai
 * License: MIT
 * Text Domain: corsen-context
 * Requires at least: 6.0
 * Requires PHP: 8.0
 *
 * Powered by Corsen Context - Built by Corsen AI - github.com/CorsenAI/corsen-context
 *
 * @package Corsen_Context
 */

defined( 'ABSPATH' ) || exit;

define( 'CORSEN_CONTEXT_VERSION', '1.4.1' );
define( 'CORSEN_CONTEXT_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'CORSEN_CONTEXT_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
define( 'CORSEN_CONTEXT_PLUGIN_FILE', __FILE__ );

// Autoload includes.
require_once CORSEN_CONTEXT_PLUGIN_DIR . 'includes/class-security.php';
require_once CORSEN_CONTEXT_PLUGIN_DIR . 'includes/class-content-converter.php';
require_once CORSEN_CONTEXT_PLUGIN_DIR . 'includes/class-llms-generator.php';
require_once CORSEN_CONTEXT_PLUGIN_DIR . 'includes/class-mcp-server.php';
require_once CORSEN_CONTEXT_PLUGIN_DIR . 'includes/class-webmcp.php';
require_once CORSEN_CONTEXT_PLUGIN_DIR . 'includes/class-admin.php';
require_once CORSEN_CONTEXT_PLUGIN_DIR . 'includes/class-control-center.php';
require_once CORSEN_CONTEXT_PLUGIN_DIR . 'includes/class-abilities.php';

/**
 * Main plugin class.
 */
final class Corsen_Context {

	/**
	 * Singleton instance.
	 *
	 * @var Corsen_Context|null
	 */
	private static ?Corsen_Context $instance = null;

	/**
	 * Get singleton.
	 */
	public static function instance(): self {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	/**
	 * Constructor.
	 */
	private function __construct() {
		$this->init_hooks();
	}

	/**
	 * Register hooks.
	 */
	private function init_hooks(): void {

		add_action( 'init', array( $this, 'maybe_upgrade_settings' ), 5 );

		// Load translations for the declared text domain.
		add_action( 'init', array( $this, 'load_textdomain' ) );

		// Rewrite rules for /llms.txt and /llms-full.txt.
		add_action( 'init', array( $this, 'register_rewrite_rules' ) );
		add_filter( 'query_vars', array( $this, 'register_query_vars' ) );
		add_filter( 'redirect_canonical', array( $this, 'prevent_llms_canonical_redirect' ), 10, 2 );
		add_action( 'template_redirect', array( $this, 'handle_llms_txt_request' ) );

		// REST API endpoints (MCP server).
		add_action( 'rest_api_init', array( $this, 'register_rest_routes' ) );

		// WordPress Abilities API surface (inert before WP 6.9).
		Corsen_Context_Abilities::init();

		// Admin settings.
		if ( is_admin() ) {
			Corsen_Context_Admin::instance();
			Corsen_Context_Control_Center::instance();
		}

		// Dashboard widget.
		add_action( 'wp_dashboard_setup', array( $this, 'register_dashboard_widget' ) );

		// Cache invalidation on post save, delete, and status transition
		// (trash / unpublish do not always fire save_post).
		add_action( 'save_post', array( $this, 'invalidate_cache' ), 10, 2 );
		add_action( 'delete_post', array( $this, 'invalidate_cache' ), 10, 1 );
		add_action( 'transition_post_status', array( $this, 'invalidate_cache_on_transition' ), 10, 3 );

		// Optional <link rel="mcp"> in head.
		add_action( 'wp_head', array( $this, 'add_mcp_link_tag' ) );

		// Optional WebMCP bridge for agents running inside the page.
		add_action( 'wp_head', array( new Corsen_Context_WebMCP(), 'render' ), 20 );

		// Legacy safety shim: the experimental write form was removed. Keep old
		// shortcodes from becoming visible text, but never render or store input.
		add_shortcode( 'corsen_agent_form', '__return_empty_string' );
		add_filter( 'robots_txt', array( $this, 'add_robots_discovery' ), 10, 2 );
		// Scheduled cron tasks.
		add_action( 'corsen_context_hourly_cleanup', array( 'Corsen_Context_Security', 'cleanup_rate_limits' ) );
		add_action( 'corsen_context_regenerate_llms_full', array( $this, 'pre_generate_llms_full' ) );
		add_action( 'corsen_context_regenerate_llms_full_once', array( $this, 'pre_generate_llms_full' ) );
		// Activation / deactivation.
		register_activation_hook( CORSEN_CONTEXT_PLUGIN_FILE, array( $this, 'activate' ) );
		register_deactivation_hook( CORSEN_CONTEXT_PLUGIN_FILE, array( $this, 'deactivate' ) );
	}

	/**
	 * Load the plugin text domain for translations.
	 */
	public function load_textdomain(): void {
		load_plugin_textdomain(
			'corsen-context',
			false,
			dirname( plugin_basename( CORSEN_CONTEXT_PLUGIN_FILE ) ) . '/languages'
		);
	}

	/**
	 * Plugin activation.
	 */
	public function activate(): void {

		$this->register_rewrite_rules();
		flush_rewrite_rules();
		update_option( 'corsen_context_rewrite_version', CORSEN_CONTEXT_VERSION );

		$this->maybe_upgrade_settings();
		if ( ! wp_next_scheduled( 'corsen_context_hourly_cleanup' ) ) {
			wp_schedule_event( time(), 'hourly', 'corsen_context_hourly_cleanup' );
		}
		if ( ! wp_next_scheduled( 'corsen_context_regenerate_llms_full' ) ) {
			wp_schedule_event( time() + 300, 'hourly', 'corsen_context_regenerate_llms_full' );
		}
	}

	/** Merge security-safe defaults added by plugin upgrades. */
	public function maybe_upgrade_settings(): void {

		$defaults = array(
			'enabled'           => true,
			'mcp_enabled'       => true,
			'llms_txt_enabled'  => true,
			'llms_full_enabled' => false,
			'post_types'        => array( 'post', 'page' ),
			'exclude_paths'     => '',
			'rate_limit'        => 100,
			'credit'            => true,
			'include_author'    => false,
			'cache_ttl'         => 3600,
			'max_pages'         => 500,
			'max_output_bytes'  => 5242880,
		);
		$current  = get_option( 'corsen_context_settings', false );
		$settings = is_array( $current ) ? array_merge( $defaults, $current ) : $defaults;

		if ( $settings !== $current ) {
			update_option( 'corsen_context_settings', $settings );
		}
		$rewrite_version = (string) get_option( 'corsen_context_rewrite_version', '' );
		if ( CORSEN_CONTEXT_VERSION !== $rewrite_version ) {
			$this->register_rewrite_rules();
			flush_rewrite_rules( false );
			update_option( 'corsen_context_rewrite_version', CORSEN_CONTEXT_VERSION );
		}
		update_option( 'corsen_context_db_version', CORSEN_CONTEXT_VERSION );
		if ( ! wp_next_scheduled( 'corsen_context_hourly_cleanup' ) ) {
			wp_schedule_event( time(), 'hourly', 'corsen_context_hourly_cleanup' );
		}
		if ( ! wp_next_scheduled( 'corsen_context_regenerate_llms_full' ) ) {
			wp_schedule_event( time() + 300, 'hourly', 'corsen_context_regenerate_llms_full' );
		}
	}
	/**
	 * Plugin deactivation.
	 */
	public function deactivate(): void {
		flush_rewrite_rules();
		delete_transient( 'corsen_context_llms_txt' );
		delete_transient( 'corsen_context_llms_full_txt' );
		delete_option( 'corsen_context_llms_full_generation_lock' );
		wp_clear_scheduled_hook( 'corsen_context_hourly_cleanup' );
		wp_clear_scheduled_hook( 'corsen_context_regenerate_llms_full' );
		wp_clear_scheduled_hook( 'corsen_context_regenerate_llms_full_once' );
	}

	/**
	 * Rewrite rules for llms.txt files.
	 */
	public function register_rewrite_rules(): void {
		add_rewrite_rule( '^llms\.txt/?$', 'index.php?corsen_context_file=llms', 'top' );
		add_rewrite_rule( '^llms-full\.txt/?$', 'index.php?corsen_context_file=llms-full', 'top' );
	}

	/**
	 * Keep the conventional extension-like endpoints free of trailing-slash redirects.
	 *
	 * WordPress can treat these paths like ordinary permalinks and redirect
	 * `/llms.txt` to `/llms.txt/` before the plugin serves the response. Both
	 * variants remain routable, but the conventional no-slash URL is canonical.
	 *
	 * @param string|false $redirect_url Proposed canonical redirect.
	 * @param string       $requested_url Requested URL.
	 * @return string|false
	 */
	public function prevent_llms_canonical_redirect( $redirect_url, string $requested_url ) {
		$request_path = trim( (string) wp_parse_url( $requested_url, PHP_URL_PATH ), '/' );
		$home_path    = trim( (string) wp_parse_url( home_url( '/' ), PHP_URL_PATH ), '/' );

		if ( '' !== $home_path ) {
			if ( $request_path === $home_path ) {
				$request_path = '';
			} elseif ( 0 === strpos( $request_path, $home_path . '/' ) ) {
				$request_path = substr( $request_path, strlen( $home_path ) + 1 );
			}
		}

		if ( in_array( rtrim( $request_path, '/' ), array( 'llms.txt', 'llms-full.txt' ), true ) ) {
			return false;
		}

		return $redirect_url;
	}

	/**
	 * Query vars.
	 *
	 * @param array $vars Existing query vars.
	 * @return array
	 */
	public function register_query_vars( array $vars ): array {
		$vars[] = 'corsen_context_file';
		return $vars;
	}

	/**
	 * Handle llms.txt requests.
	 */
	public function handle_llms_txt_request(): void {
		$file = get_query_var( 'corsen_context_file' );
		if ( empty( $file ) ) {
			return;
		}

		$settings = get_option( 'corsen_context_settings', array() );
		if ( empty( $settings['enabled'] ) || empty( $settings['llms_txt_enabled'] ) ) {
			$this->send_not_found();
		}
		$generator = new Corsen_Context_Llms_Generator();

		// Security headers.
		Corsen_Context_Security::send_security_headers();

		if ( 'llms' === $file ) {
			$content = $generator->generate_llms_txt();
			header( 'Content-Type: text/plain; charset=utf-8' );
			$this->send_cache_header( $generator, $settings );
			echo $content; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Plain text output.
			exit;
		}

		if ( 'llms-full' === $file ) {
			if ( empty( $settings['llms_full_enabled'] ) ) {
				$this->send_not_found();
			}
			$content = $generator->generate_llms_full_txt();
			if ( null === $content ) {
				status_header( 503 );
				header( 'Retry-After: 30' );
				header( 'Content-Type: text/plain; charset=utf-8' );
				echo 'llms-full.txt is being regenerated. Please retry shortly.'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Constant plain text.
				exit;
			}
			header( 'Content-Type: text/plain; charset=utf-8' );
			$this->send_cache_header( $generator, $settings );
			echo $content; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Plain text output.
			exit;
		}
	}

	/**
	 * Register MCP REST API routes.
	 */
	public function register_rest_routes(): void {

		$settings = get_option( 'corsen_context_settings', array() );
		if ( empty( $settings['enabled'] ) || empty( $settings['mcp_enabled'] ) ) {
			return;
		}

		$mcp = new Corsen_Context_MCP_Server();
		// WordPress handles OPTIONS outside normal route callbacks. Intercept this
		// endpoint before Core's generic OPTIONS handler so Origin policy is still
		// enforced for browser preflight requests.
		add_filter( 'rest_pre_dispatch', array( $mcp, 'handle_pre_dispatch_request' ), 5, 3 );

		register_rest_route(
			'corsen-context/v1',
			'/mcp',
			array(
				array(
					'methods'             => 'POST',
					'callback'            => array( $mcp, 'handle_request' ),
					'permission_callback' => '__return_true',
				),
				array(
					'methods'             => 'GET',
					'callback'            => array( $mcp, 'handle_get_request' ),
					'permission_callback' => '__return_true',
				),
				array(
					'methods'             => 'OPTIONS',
					'callback'            => array( $mcp, 'handle_options_request' ),
					'permission_callback' => '__return_true',
				),
			)
		);
	}

	/**
	 * Dashboard widget.
	 */
	public function register_dashboard_widget(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		wp_add_dashboard_widget(
			'corsen_context_status',
			'AI Context Status (Corsen Context)',
			array( $this, 'render_dashboard_widget' )
		);
	}

	/**
	 * Dashboard widget content.
	 */
	public function render_dashboard_widget(): void {
		$settings = get_option( 'corsen_context_settings', array() );
		$enabled  = ! empty( $settings['enabled'] );
		$mcp      = $enabled && ! empty( $settings['mcp_enabled'] );
		$llms     = $enabled && ! empty( $settings['llms_txt_enabled'] );
		$site_url = home_url();

		$post_types = $settings['post_types'] ?? array( 'post', 'page' );
		$count      = 0;
		foreach ( $post_types as $pt ) {
			$count += wp_count_posts( $pt )->publish ?? 0;
		}

		echo '<div class="corsen-context-widget">';
		printf( '<p><strong>Status:</strong> %s</p>', $enabled ? 'Active' : 'Inactive' );
		printf( '<p><strong>MCP Server:</strong> %s</p>', $mcp ? 'Enabled' : 'Disabled' );
		printf( '<p><strong>llms.txt:</strong> %s</p>', $llms ? 'Enabled' : 'Disabled' );
		printf( '<p><strong>Pages indexed:</strong> %d</p>', intval( $count ) );

		if ( $llms ) {
			printf( '<p><a href="%s/llms.txt" target="_blank">View llms.txt</a></p>', esc_url( $site_url ) );
		}

		if ( $mcp ) {
			printf(
				'<p><strong>MCP endpoint:</strong> <code>%s</code></p>',
				esc_html( Corsen_Context_MCP_Server::endpoint_url() )
			);
		}

		echo '<p style="color:#666;font-size:11px;">Powered by Corsen Context &bull; Corsen AI</p>';
		echo '</div>';
	}

	/**
	 * Cache invalidation.
	 *
	 * @param int      $post_id Post ID.
	 * @param \WP_Post $post    Post object.
	 */
	public function invalidate_cache( int $post_id, $post = null ): void {
		unset( $post_id, $post );
		if ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) {
			return;
		}
		delete_transient( 'corsen_context_llms_txt' );
		delete_transient( 'corsen_context_llms_full_txt' );
		// Bump the MCP cache version so cached tool responses are superseded.
		update_option( 'corsen_context_cache_version', intval( get_option( 'corsen_context_cache_version', 1 ) ) + 1 );

		$settings = get_option( 'corsen_context_settings', array() );
		if ( ! empty( $settings['enabled'] ) && ! empty( $settings['llms_full_enabled'] ) && ! wp_next_scheduled( 'corsen_context_regenerate_llms_full_once' ) ) {
			wp_schedule_single_event( time() + 30, 'corsen_context_regenerate_llms_full_once' );
		}
	}

	/**
	 * Invalidate caches when a post changes status (publish, trash, draft, etc.).
	 *
	 * @param string   $new_status New status.
	 * @param string   $old_status Old status.
	 * @param \WP_Post $post       Post object.
	 */
	public function invalidate_cache_on_transition( string $new_status, string $old_status, $post = null ): void {
		if ( $new_status === $old_status ) {
			return;
		}
		$this->invalidate_cache( $post instanceof \WP_Post ? $post->ID : 0, $post );
	}

	/**
	 * Add <link rel="mcp"> to head.
	 */
	public function add_mcp_link_tag(): void {

		$settings = get_option( 'corsen_context_settings', array() );
		if ( empty( $settings['enabled'] ) || empty( $settings['mcp_enabled'] ) ) {
			return;
		}
		$endpoint = Corsen_Context_MCP_Server::endpoint_url();
		printf( '<link rel="mcp" href="%s" />' . "\n", esc_url( $endpoint ) );
	}

	/** Add the MCP endpoint to WordPress-generated robots.txt output. */
	public function add_robots_discovery( string $output, bool $is_public ): string {

		unset( $is_public );
		$settings = get_option( 'corsen_context_settings', array() );
		if ( empty( $settings['enabled'] ) || empty( $settings['mcp_enabled'] ) ) {
			return $output;
		}

		return rtrim( $output ) . "\nMCP: " . Corsen_Context_MCP_Server::endpoint_url() . "\n";
	}

	/** Pre-generate the bounded llms-full.txt cache from a cookie-free cron request. */
	public function pre_generate_llms_full(): void {

		$settings = get_option( 'corsen_context_settings', array() );
		if ( empty( $settings['enabled'] ) || empty( $settings['llms_txt_enabled'] ) || empty( $settings['llms_full_enabled'] ) ) {
			return;
		}

		$generator = new Corsen_Context_Llms_Generator();
		$generator->generate_llms_full_txt();
	}

	/** Terminate a disabled public endpoint as a real 404. */
	private function send_not_found(): void {

		status_header( 404 );
		nocache_headers();
		exit;
	}

	/** Send a public cache header only for an anonymous, non-personalized result. */
	private function send_cache_header( Corsen_Context_Llms_Generator $generator, array $settings ): void {

		if ( $generator->was_shared_cache_safe() ) {
			$ttl = min( max( intval( $settings['cache_ttl'] ?? 3600 ), 60 ), 86400 );
			header( 'Cache-Control: public, max-age=' . $ttl );
			return;
		}

		header( 'Cache-Control: private, no-store' );
	}
}
// Boot the plugin.
Corsen_Context::instance();
