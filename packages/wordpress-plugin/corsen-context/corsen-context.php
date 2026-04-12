<?php
/**
 * Plugin Name: Corsen Context
 * Plugin URI: https://github.com/CorsenAI/corsen-context
 * Description: Make your WordPress site AI-native. Generates llms.txt and exposes a full MCP server for AI agents.
 * Version: 1.1.0
 * Author: Corsen AI
 * Author URI: https://corsen.ai
 * License: MIT
 * Text Domain: corsen-context
 * Requires at least: 6.0
 * Requires PHP: 8.0
 *
 * Powered by Corsen Context - Built by Corsen AI - github.com/CorsenAI/corsen-context
 */

defined( 'ABSPATH' ) || exit;

define( 'CORSEN_CONTEXT_VERSION', '1.1.0' );
define( 'CORSEN_CONTEXT_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'CORSEN_CONTEXT_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
define( 'CORSEN_CONTEXT_PLUGIN_FILE', __FILE__ );

// Autoload includes.
require_once CORSEN_CONTEXT_PLUGIN_DIR . 'includes/class-security.php';
require_once CORSEN_CONTEXT_PLUGIN_DIR . 'includes/class-content-converter.php';
require_once CORSEN_CONTEXT_PLUGIN_DIR . 'includes/class-llms-generator.php';
require_once CORSEN_CONTEXT_PLUGIN_DIR . 'includes/class-mcp-server.php';
require_once CORSEN_CONTEXT_PLUGIN_DIR . 'includes/class-admin.php';

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
		// Rewrite rules for /llms.txt and /llms-full.txt.
		add_action( 'init', array( $this, 'register_rewrite_rules' ) );
		add_filter( 'query_vars', array( $this, 'register_query_vars' ) );
		add_action( 'template_redirect', array( $this, 'handle_llms_txt_request' ) );

		// REST API endpoints (MCP server).
		add_action( 'rest_api_init', array( $this, 'register_rest_routes' ) );

		// Admin settings.
		if ( is_admin() ) {
			Corsen_Context_Admin::instance();
		}

		// Dashboard widget.
		add_action( 'wp_dashboard_setup', array( $this, 'register_dashboard_widget' ) );

		// Cache invalidation on post save.
		add_action( 'save_post', array( $this, 'invalidate_cache' ), 10, 2 );
		add_action( 'delete_post', array( $this, 'invalidate_cache' ), 10, 1 );

		// Optional <link rel="mcp"> in head.
		add_action( 'wp_head', array( $this, 'add_mcp_link_tag' ) );

		// Scheduled cron tasks.
		add_action( 'corsen_context_hourly_cleanup', array( 'Corsen_Context_Security', 'cleanup_rate_limits' ) );

		// Activation / deactivation.
		register_activation_hook( CORSEN_CONTEXT_PLUGIN_FILE, array( $this, 'activate' ) );
		register_deactivation_hook( CORSEN_CONTEXT_PLUGIN_FILE, array( $this, 'deactivate' ) );
	}

	/**
	 * Plugin activation.
	 */
	public function activate(): void {
		$this->register_rewrite_rules();
		flush_rewrite_rules();

		// Set default options.
		$defaults = array(
			'enabled'            => true,
			'mcp_enabled'        => true,
			'llms_txt_enabled'   => true,
			'post_types'         => array( 'post', 'page' ),
			'exclude_paths'      => '',
			'rate_limit'         => 100,
			'credit'             => true,
			'cache_ttl'          => 3600,
			'max_pages'          => 500,
		);

		if ( false === get_option( 'corsen_context_settings' ) ) {
			add_option( 'corsen_context_settings', $defaults );
		}

		if ( ! wp_next_scheduled( 'corsen_context_hourly_cleanup' ) ) {
			wp_schedule_event( time(), 'hourly', 'corsen_context_hourly_cleanup' );
		}
	}

	/**
	 * Plugin deactivation.
	 */
	public function deactivate(): void {
		flush_rewrite_rules();
		delete_transient( 'corsen_context_llms_txt' );
		delete_transient( 'corsen_context_llms_full_txt' );
		wp_clear_scheduled_hook( 'corsen_context_hourly_cleanup' );
	}

	/**
	 * Rewrite rules for llms.txt files.
	 */
	public function register_rewrite_rules(): void {
		add_rewrite_rule( '^llms\.txt$', 'index.php?corsen_context_file=llms', 'top' );
		add_rewrite_rule( '^llms-full\.txt$', 'index.php?corsen_context_file=llms-full', 'top' );
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
		if ( empty( $settings['llms_txt_enabled'] ) ) {
			return;
		}

		$generator = new Corsen_Context_Llms_Generator();

		// Security headers.
		Corsen_Context_Security::send_security_headers();

		if ( 'llms' === $file ) {
			$content = $generator->generate_llms_txt();
			header( 'Content-Type: text/plain; charset=utf-8' );
			header( 'Cache-Control: public, max-age=' . intval( $settings['cache_ttl'] ?? 3600 ) );
			echo $content; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Plain text output.
			exit;
		}

		if ( 'llms-full' === $file ) {
			$content = $generator->generate_llms_full_txt();
			header( 'Content-Type: text/plain; charset=utf-8' );
			header( 'Cache-Control: public, max-age=' . intval( $settings['cache_ttl'] ?? 3600 ) );
			echo $content; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Plain text output.
			exit;
		}
	}

	/**
	 * Register MCP REST API routes.
	 */
	public function register_rest_routes(): void {
		$settings = get_option( 'corsen_context_settings', array() );
		if ( empty( $settings['mcp_enabled'] ) ) {
			return;
		}

		$mcp = new Corsen_Context_MCP_Server();

		register_rest_route(
			'corsen-context/v1',
			'/mcp',
			array(
				'methods'             => 'POST',
				'callback'            => array( $mcp, 'handle_request' ),
				'permission_callback' => '__return_true',
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
		$settings  = get_option( 'corsen_context_settings', array() );
		$enabled   = ! empty( $settings['enabled'] );
		$mcp       = ! empty( $settings['mcp_enabled'] );
		$llms      = ! empty( $settings['llms_txt_enabled'] );
		$site_url  = home_url();

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
				esc_html( $site_url . '/wp-json/corsen-context/v1/mcp' )
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
		if ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) {
			return;
		}
		delete_transient( 'corsen_context_llms_txt' );
		delete_transient( 'corsen_context_llms_full_txt' );
	}

	/**
	 * Add <link rel="mcp"> to head.
	 */
	public function add_mcp_link_tag(): void {
		$settings = get_option( 'corsen_context_settings', array() );
		if ( empty( $settings['mcp_enabled'] ) ) {
			return;
		}
		$endpoint = home_url( '/wp-json/corsen-context/v1/mcp' );
		printf( '<link rel="mcp" href="%s" />' . "\n", esc_url( $endpoint ) );
	}
}

// Boot the plugin.
Corsen_Context::instance();
