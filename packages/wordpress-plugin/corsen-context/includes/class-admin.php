<?php
/**
 * Admin settings page for Corsen Context.
 *
 * Powered by Corsen Context - Built by Corsen AI - github.com/CorsenAI/corsen-context
 */

defined( 'ABSPATH' ) || exit;

class Corsen_Context_Admin {

	private static ?self $instance = null;

	public static function instance(): self {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	private function __construct() {
		add_action( 'admin_menu', array( $this, 'add_menu' ) );
		add_action( 'admin_init', array( $this, 'register_settings' ) );
	}

	public function add_menu(): void {
		add_options_page(
			'Corsen Context',
			'Corsen Context',
			'manage_options',
			'corsen-context',
			array( $this, 'render_settings_page' )
		);
	}

	public function register_settings(): void {
		register_setting( 'corsen_context', 'corsen_context_settings', array(
			'type'              => 'array',
			'sanitize_callback' => array( $this, 'sanitize_settings' ),
		) );

		add_settings_section(
			'corsen_context_general',
			'General Settings',
			null,
			'corsen-context'
		);

		add_settings_field( 'enabled', 'Enable Corsen Context', array( $this, 'render_checkbox' ), 'corsen-context', 'corsen_context_general', array( 'field' => 'enabled', 'label' => 'Enable the AI context layer' ) );
		add_settings_field( 'mcp_enabled', 'Enable MCP Server', array( $this, 'render_checkbox' ), 'corsen-context', 'corsen_context_general', array( 'field' => 'mcp_enabled', 'label' => 'Expose MCP endpoint for AI agents' ) );
		add_settings_field( 'llms_txt_enabled', 'Enable llms.txt', array( $this, 'render_checkbox' ), 'corsen-context', 'corsen_context_general', array( 'field' => 'llms_txt_enabled', 'label' => 'Generate and serve /llms.txt' ) );

		add_settings_section(
			'corsen_context_content',
			'Content Settings',
			null,
			'corsen-context'
		);

		add_settings_field( 'post_types', 'Post Types', array( $this, 'render_post_types' ), 'corsen-context', 'corsen_context_content' );
		add_settings_field( 'exclude_paths', 'Exclude Paths', array( $this, 'render_textarea' ), 'corsen-context', 'corsen_context_content', array( 'field' => 'exclude_paths', 'description' => 'One path per line (e.g., /admin, /cart)' ) );
		add_settings_field( 'max_pages', 'Max Pages', array( $this, 'render_number' ), 'corsen-context', 'corsen_context_content', array( 'field' => 'max_pages', 'min' => 10, 'max' => 5000 ) );

		add_settings_section(
			'corsen_context_security',
			'Security Settings',
			null,
			'corsen-context'
		);

		add_settings_field( 'rate_limit', 'Rate Limit (req/min)', array( $this, 'render_number' ), 'corsen-context', 'corsen_context_security', array( 'field' => 'rate_limit', 'min' => 10, 'max' => 1000 ) );
		add_settings_field( 'credit', 'Show Credit', array( $this, 'render_checkbox' ), 'corsen-context', 'corsen_context_security', array( 'field' => 'credit', 'label' => 'Include "Powered by Corsen Context" credit line' ) );
		add_settings_field( 'cache_ttl', 'Cache TTL (seconds)', array( $this, 'render_number' ), 'corsen-context', 'corsen_context_security', array( 'field' => 'cache_ttl', 'min' => 60, 'max' => 86400 ) );
	}

	public function sanitize_settings( $input ): array {
		$sanitized = array();

		$sanitized['enabled']          = ! empty( $input['enabled'] );
		$sanitized['mcp_enabled']      = ! empty( $input['mcp_enabled'] );
		$sanitized['llms_txt_enabled'] = ! empty( $input['llms_txt_enabled'] );
		$sanitized['credit']           = ! empty( $input['credit'] );

		// Constrain persisted post types to publicly-registered types so a
		// crafted POST can't expose a private/internal type via MCP.
		$public_types            = array_keys( get_post_types( array( 'public' => true ) ) );
		$requested_types         = array_map( 'sanitize_text_field', (array) ( $input['post_types'] ?? array( 'post', 'page' ) ) );
		$sanitized['post_types'] = array_values( array_intersect( $requested_types, $public_types ) );
		if ( empty( $sanitized['post_types'] ) ) {
			$sanitized['post_types'] = array( 'post', 'page' );
		}
		$sanitized['exclude_paths'] = sanitize_textarea_field( $input['exclude_paths'] ?? '' );
		$sanitized['rate_limit'] = min( max( intval( $input['rate_limit'] ?? 100 ), 10 ), 1000 );
		$sanitized['cache_ttl']  = min( max( intval( $input['cache_ttl'] ?? 3600 ), 60 ), 86400 );
		$sanitized['max_pages']  = min( max( intval( $input['max_pages'] ?? 500 ), 10 ), 5000 );

		// Invalidate caches on settings change so newly excluded paths / removed
		// post types stop being served from cached MCP responses.
		delete_transient( 'corsen_context_llms_txt' );
		delete_transient( 'corsen_context_llms_full_txt' );
		update_option(
			'corsen_context_cache_version',
			intval( get_option( 'corsen_context_cache_version', 1 ) ) + 1
		);

		return $sanitized;
	}

	public function render_checkbox( array $args ): void {
		$settings = get_option( 'corsen_context_settings', array() );
		$checked  = ! empty( $settings[ $args['field'] ] );
		printf(
			'<label><input type="checkbox" name="corsen_context_settings[%s]" value="1" %s /> %s</label>',
			esc_attr( $args['field'] ),
			checked( $checked, true, false ),
			esc_html( $args['label'] ?? '' )
		);
	}

	public function render_number( array $args ): void {
		$settings = get_option( 'corsen_context_settings', array() );
		$value    = $settings[ $args['field'] ] ?? '';
		printf(
			'<input type="number" name="corsen_context_settings[%s]" value="%s" min="%d" max="%d" class="small-text" />',
			esc_attr( $args['field'] ),
			esc_attr( $value ),
			intval( $args['min'] ?? 0 ),
			intval( $args['max'] ?? 99999 )
		);
	}

	public function render_textarea( array $args ): void {
		$settings = get_option( 'corsen_context_settings', array() );
		$value    = $settings[ $args['field'] ] ?? '';
		printf(
			'<textarea name="corsen_context_settings[%s]" rows="4" cols="50" class="large-text">%s</textarea>',
			esc_attr( $args['field'] ),
			esc_textarea( $value )
		);
		if ( ! empty( $args['description'] ) ) {
			printf( '<p class="description">%s</p>', esc_html( $args['description'] ) );
		}
	}

	public function render_post_types(): void {
		$settings   = get_option( 'corsen_context_settings', array() );
		$selected   = $settings['post_types'] ?? array( 'post', 'page' );
		$post_types = get_post_types( array( 'public' => true ), 'objects' );

		foreach ( $post_types as $pt ) {
			if ( 'attachment' === $pt->name ) {
				continue;
			}
			$checked = in_array( $pt->name, $selected, true );
			printf(
				'<label style="margin-right:15px;"><input type="checkbox" name="corsen_context_settings[post_types][]" value="%s" %s /> %s</label>',
				esc_attr( $pt->name ),
				checked( $checked, true, false ),
				esc_html( $pt->labels->name )
			);
		}
	}

	public function render_settings_page(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		$site_url = home_url();
		?>
		<div class="wrap">
			<h1>Corsen Context Settings</h1>
			<p>Make your WordPress site AI-native with MCP + llms.txt.</p>

			<div style="background:#f0f7ff;border-left:4px solid #2271b1;padding:12px 16px;margin:16px 0;">
				<strong>Quick Links:</strong>
				<a href="<?php echo esc_url( $site_url . '/llms.txt' ); ?>" target="_blank">View llms.txt</a> |
				<a href="<?php echo esc_url( $site_url . '/llms-full.txt' ); ?>" target="_blank">View llms-full.txt</a> |
				<strong>MCP:</strong> <code><?php echo esc_html( $site_url . '/wp-json/corsen-context/v1/mcp' ); ?></code>
			</div>

			<form method="post" action="options.php">
				<?php
				settings_fields( 'corsen_context' );
				do_settings_sections( 'corsen-context' );
				submit_button();
				?>
			</form>

			<p style="color:#666;font-size:12px;">
				Powered by Corsen Context v<?php echo esc_html( CORSEN_CONTEXT_VERSION ); ?> &bull;
				Built by <a href="https://corsen.ai" target="_blank">Corsen AI</a> &bull;
				<a href="https://github.com/CorsenAI/corsen-context" target="_blank">GitHub</a>
			</p>
		</div>
		<?php
	}
}
