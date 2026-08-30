<?php
/**
 * Admin settings page for Corsen Context.
 *
 * Powered by Corsen Context - Built by Corsen AI - github.com/CorsenAI/corsen-context
 *
 * @package Corsen_Context
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
		register_setting(
			'corsen_context',
			'corsen_context_settings',
			array(
				'type'              => 'array',
				'sanitize_callback' => array( $this, 'sanitize_settings' ),
			)
		);

		add_settings_section(
			'corsen_context_general',
			'General Settings',
			null,
			'corsen-context'
		);

		add_settings_field(
			'enabled',
			'Enable Corsen Context',
			array( $this, 'render_checkbox' ),
			'corsen-context',
			'corsen_context_general',
			array(
				'field' => 'enabled',
				'label' => 'Enable the AI context layer',
			)
		);
		add_settings_field(
			'mcp_enabled',
			'Enable MCP Server',
			array( $this, 'render_checkbox' ),
			'corsen-context',
			'corsen_context_general',
			array(
				'field' => 'mcp_enabled',
				'label' => 'Expose MCP endpoint for AI agents',
			)
		);
		add_settings_field(
			'llms_txt_enabled',
			'Enable llms.txt',
			array( $this, 'render_checkbox' ),
			'corsen-context',
			'corsen_context_general',
			array(
				'field' => 'llms_txt_enabled',
				'label' => 'Generate and serve /llms.txt',
			)
		);
		add_settings_field(
			'llms_full_enabled',
			'Enable llms-full.txt',
			array( $this, 'render_checkbox' ),
			'corsen-context',
			'corsen_context_general',
			array(
				'field' => 'llms_full_enabled',
				'label' => 'Generate the bounded full-content export (disabled by default)',
			)
		);
		add_settings_field(
			'webmcp_enabled',
			'Enable WebMCP',
			array( $this, 'render_checkbox' ),
			'corsen-context',
			'corsen_context_general',
			array(
				'field' => 'webmcp_enabled',
				'label' => 'Register the MCP tools with AI agents running inside the page (document.modelContext)',
			)
		);
		add_settings_field(
			'webmcp_origin_trial_token',
			'Chrome Origin Trial Token',
			array( $this, 'render_text' ),
			'corsen-context',
			'corsen_context_general',
			array(
				'field'       => 'webmcp_origin_trial_token',
				'description' => 'Optional. Chrome only exposes WebMCP during the origin trial when the page serves this token; agents with built-in WebMCP support need none. Register your origin at developer.chrome.com/origintrials.',
			)
		);
		add_settings_field(
			'agent_forms_enabled',
			'Agent-callable forms',
			array( $this, 'render_checkbox' ),
			'corsen-context',
			'corsen_context_general',
			array(
				'field' => 'agent_forms_enabled',
				'label' => 'Forms built with the [corsen_agent_form] shortcode become declarative WebMCP tools (the agent fills and submits them). Off: the same forms stay human-only.',
			)
		);
		add_settings_section(
			'corsen_context_content',
			'Content Settings',
			null,
			'corsen-context'
		);

		add_settings_field( 'post_types', 'Post Types', array( $this, 'render_post_types' ), 'corsen-context', 'corsen_context_content' );
		add_settings_field(
			'exclude_paths',
			'Exclude Paths',
			array( $this, 'render_textarea' ),
			'corsen-context',
			'corsen_context_content',
			array(
				'field'       => 'exclude_paths',
				'description' => 'One path per line (e.g., /admin, /cart)',
			)
		);
		add_settings_field(
			'max_pages',
			'Max Total Items',
			array( $this, 'render_number' ),
			'corsen-context',
			'corsen_context_content',
			array(
				'field'       => 'max_pages',
				'min'         => 10,
				'max'         => 5000,
				'description' => 'Absolute cap shared across all selected post types.',
			)
		);
		add_settings_field(
			'max_output_bytes',
			'llms-full.txt Max Bytes',
			array( $this, 'render_number' ),
			'corsen-context',
			'corsen_context_content',
			array(
				'field'       => 'max_output_bytes',
				'min'         => 65536,
				'max'         => 10485760,
				'description' => 'Hard output limit between 64 KB and 10 MB.',
			)
		);
		add_settings_section(
			'corsen_context_tools',
			'Agent Tools',
			array( $this, 'render_tools_intro' ),
			'corsen-context'
		);
		add_settings_field(
			'enabled_tools',
			'Exposed Tools',
			array( $this, 'render_enabled_tools' ),
			'corsen-context',
			'corsen_context_tools'
		);

		add_settings_section(
			'corsen_context_security',
			'Security Settings',
			null,
			'corsen-context'
		);

		add_settings_field(
			'rate_limit',
			'Rate Limit (req/min)',
			array( $this, 'render_number' ),
			'corsen-context',
			'corsen_context_security',
			array(
				'field' => 'rate_limit',
				'min'   => 10,
				'max'   => 1000,
			)
		);
		add_settings_field(
			'credit',
			'Show Credit',
			array( $this, 'render_checkbox' ),
			'corsen-context',
			'corsen_context_security',
			array(
				'field' => 'credit',
				'label' => 'Include "Powered by Corsen Context" credit line',
			)
		);
		add_settings_field(
			'include_author',
			'Include Author Names',
			array( $this, 'render_checkbox' ),
			'corsen-context',
			'corsen_context_security',
			array(
				'field' => 'include_author',
				'label' => 'Expose post author display names in MCP metadata',
			)
		);
		add_settings_field(
			'cache_ttl',
			'Cache TTL (seconds)',
			array( $this, 'render_number' ),
			'corsen-context',
			'corsen_context_security',
			array(
				'field' => 'cache_ttl',
				'min'   => 60,
				'max'   => 86400,
			)
		);
	}

	public function sanitize_settings( $input ): array {
		$input     = is_array( $input ) ? $input : array();
		$sanitized = array();

		$sanitized['enabled']           = ! empty( $input['enabled'] );
		$sanitized['mcp_enabled']       = ! empty( $input['mcp_enabled'] );
		$sanitized['llms_txt_enabled']  = ! empty( $input['llms_txt_enabled'] );
		$sanitized['llms_full_enabled'] = ! empty( $input['llms_full_enabled'] );
		$sanitized['credit']            = ! empty( $input['credit'] );
		$sanitized['include_author']    = ! empty( $input['include_author'] );
		$sanitized['webmcp_enabled']    = ! empty( $input['webmcp_enabled'] );
		$sanitized['agent_forms_enabled'] = ! empty( $input['agent_forms_enabled'] );
		$all_tools                      = array( 'search_site', 'get_page_content', 'list_content', 'get_sitemap' );
		$requested_tools                = array_map( 'sanitize_text_field', (array) ( $input['enabled_tools'] ?? $all_tools ) );
		$sanitized['enabled_tools']     = array_values( array_intersect( $all_tools, $requested_tools ) );
		if ( empty( $sanitized['enabled_tools'] ) ) {
			$sanitized['enabled_tools'] = $all_tools;
		}
		$sanitized['webmcp_origin_trial_token'] = substr( (string) preg_replace( '/[^A-Za-z0-9+\/=]/', '', (string) ( $input['webmcp_origin_trial_token'] ?? '' ) ), 0, 4096 );
		// Constrain persisted post types to publicly-registered types so a
		// crafted POST can't expose a private/internal type via MCP.
		$public_types            = array_keys( get_post_types( array( 'public' => true ) ) );
		$requested_types         = array_map( 'sanitize_text_field', (array) ( $input['post_types'] ?? array( 'post', 'page' ) ) );
		$sanitized['post_types'] = array_values( array_intersect( $requested_types, $public_types ) );
		if ( empty( $sanitized['post_types'] ) ) {
			$sanitized['post_types'] = array( 'post', 'page' );
		}
		$sanitized['exclude_paths']    = sanitize_textarea_field( $input['exclude_paths'] ?? '' );
		$sanitized['rate_limit']       = min( max( intval( $input['rate_limit'] ?? 100 ), 10 ), 1000 );
		$sanitized['cache_ttl']        = min( max( intval( $input['cache_ttl'] ?? 3600 ), 60 ), 86400 );
		$sanitized['max_pages']        = min( max( intval( $input['max_pages'] ?? 500 ), 10 ), 5000 );
		$sanitized['max_output_bytes'] = min( max( intval( $input['max_output_bytes'] ?? 5242880 ), 65536 ), 10485760 );
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

	/**
	 * At-a-glance panel: what agents can currently see and do on this site.
	 *
	 * @param array<string,mixed> $settings Plugin settings.
	 */
	public function render_access_panel( array $settings ): void {
		$on        = ! empty( $settings['enabled'] );
		$mcp       = $on && ! empty( $settings['mcp_enabled'] );
		$webmcp    = $mcp && ! empty( $settings['webmcp_enabled'] );
		$llms      = $on && ! empty( $settings['llms_txt_enabled'] );
		$all_tools = array( 'search_site', 'get_page_content', 'list_content', 'get_sitemap' );
		$tools     = $settings['enabled_tools'] ?? $all_tools;
		$types     = $settings['post_types'] ?? array( 'post', 'page' );
		$excluded  = array_filter(
			array_map(
				'trim',
				explode( "\n", (string) ( $settings['exclude_paths'] ?? '' ) )
			)
		);

		echo '<div style="background:#fff;border:1px solid #dcdcde;border-left:4px solid #00844a;padding:12px 16px;margin:16px 0;">';
		echo '<h2 style="margin-top:0;font-size:15px;">Agent Access &mdash; what agents can see and do</h2>';

		if ( ! $on ) {
			echo '<p><strong>Corsen Context is off.</strong> No agent can reach any tool or content on this site.</p></div>';
			return;
		}

		$rows = array(
			array( 'MCP endpoint (agents outside the browser)', $mcp ),
			array( 'WebMCP (agents inside the page)', $webmcp ),
			array( 'llms.txt discovery', $llms ),
			array( 'Agent-callable forms (declarative WebMCP)', $on && ! empty( $settings['agent_forms_enabled'] ) ),
		);
		echo '<table class="widefat striped" style="margin-bottom:10px;"><tbody>';
		foreach ( $rows as $row ) {
			printf(
				'<tr><td style="width:240px;">%s</td><td style="color:%s;font-weight:600;">%s</td></tr>',
				esc_html( $row[0] ),
				esc_attr( $row[1] ? '#00844a' : '#8a8a8a' ),
				esc_html( $row[1] ? 'On' : 'Off' )
			);
		}
		echo '</tbody></table>';

		if ( ! empty( $settings['agent_forms_enabled'] ) ) {
			echo '<p style="margin:6px 0;"><strong>Agents can:</strong> read your published content, and fill only the forms you explicitly marked agent-callable with <code>[corsen_agent_form]</code>. Everything else stays human-only.</p>';
		} else {
			echo '<p style="margin:6px 0;"><strong>Agents can:</strong> read only. They look up and read your published content. They cannot create, edit, delete, or click anything &mdash; every tool is marked read-only and untrusted-content.</p>';
		}

		printf(
			'<p style="margin:6px 0;"><strong>Tools exposed:</strong> %s</p>',
			esc_html( implode( ', ', array_intersect( $all_tools, (array) $tools ) ) )
		);
		printf(
			'<p style="margin:6px 0;"><strong>Content types agents can see:</strong> %s</p>',
			esc_html( implode( ', ', (array) $types ) )
		);
		if ( ! empty( $excluded ) ) {
			printf(
				'<p style="margin:6px 0;"><strong>Paths hidden from agents:</strong> %s</p>',
				esc_html( implode( ', ', $excluded ) )
			);
		}

		echo '<p class="description" style="margin:6px 0 0;">Change any of these below, then Save.</p>';
		if ( ! empty( $settings['agent_forms_enabled'] ) ) {
			Corsen_Context_Agent_Forms::render_submissions();
		}
		echo '</div>';
	}

	/** Intro copy for the Agent Tools section. */
	public function render_tools_intro(): void {
		echo '<p>Choose exactly which tools AI agents may call. Every tool is <strong>read-only</strong> &mdash; agents can look up and read your published content, but can never create, edit, delete, or click anything on your site.</p>';
	}

	/** Per-tool checkboxes bound to the enabled_tools setting. */
	public function render_enabled_tools(): void {
		$settings = get_option( 'corsen_context_settings', array() );
		$all      = array(
			'search_site'      => 'Search content by keyword',
			'get_page_content' => 'Read one page as clean markdown',
			'list_content'     => 'List content by type, with pagination',
			'get_sitemap'      => 'Return the structured sitemap',
		);
		$enabled  = $settings['enabled_tools'] ?? array_keys( $all );
		foreach ( $all as $tool => $desc ) {
			$checked = in_array( $tool, $enabled, true );
			printf(
				'<label style="display:block;margin:4px 0;"><input type="checkbox" name="corsen_context_settings[enabled_tools][]" value="%s" %s /> <code>%s</code> &mdash; %s</label>',
				esc_attr( $tool ),
				checked( $checked, true, false ),
				esc_html( $tool ),
				esc_html( $desc )
			);
		}
		echo '<p class="description">Applies to every surface at once: MCP, WebMCP, and the sitemap. Unchecking all re-enables all four (a site with zero tools is never useful).</p>';
	}

	public function render_text( array $args ): void {
		$settings = get_option( 'corsen_context_settings', array() );
		$value    = $settings[ $args['field'] ] ?? '';
		printf(
			'<input type="text" name="corsen_context_settings[%s]" value="%s" class="large-text" />',
			esc_attr( $args['field'] ),
			esc_attr( $value )
		);
		if ( ! empty( $args['description'] ) ) {
			printf( '<p class="description">%s</p>', esc_html( $args['description'] ) );
		}
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
		if ( ! empty( $args['description'] ) ) {
				printf( '<p class="description">%s</p>', esc_html( $args['description'] ) );
		}
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

		$site_url          = home_url();
		$settings          = get_option( 'corsen_context_settings', array() );
		$llms_full_enabled = ! empty( $settings['enabled'] ) && ! empty( $settings['llms_txt_enabled'] ) && ! empty( $settings['llms_full_enabled'] );
		?>
		<div class="wrap">
			<h1>Corsen Context Settings</h1>
			<p>Publish selected public WordPress content through MCP and llms.txt.</p>

			<div style="background:#f0f7ff;border-left:4px solid #2271b1;padding:12px 16px;margin:16px 0;">
				<strong>Quick Links:</strong>
				<a href="<?php echo esc_url( $site_url . '/llms.txt' ); ?>" target="_blank">View llms.txt</a> |
				<?php if ( $llms_full_enabled ) : ?>
					<a href="<?php echo esc_url( $site_url . '/llms-full.txt' ); ?>" target="_blank">View llms-full.txt</a> |
				<?php else : ?>
					<span>llms-full.txt disabled</span> |
				<?php endif; ?>
				<strong>MCP:</strong> <code><?php echo esc_html( $site_url . '/wp-json/corsen-context/v1/mcp' ); ?></code>
			</div>

			<?php $this->render_access_panel( $settings ); ?>

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
