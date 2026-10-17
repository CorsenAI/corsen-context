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
			__( 'Corsen Context', 'corsen-context' ),
			__( 'Corsen Context', 'corsen-context' ),
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
			__( 'General Settings', 'corsen-context' ),
			null,
			'corsen-context'
		);

		add_settings_field(
			'enabled',
			__( 'Enable Corsen Context', 'corsen-context' ),
			array( $this, 'render_checkbox' ),
			'corsen-context',
			'corsen_context_general',
			array(
				'field' => 'enabled',
				'label' => __( 'Enable the public context layer', 'corsen-context' ),
			)
		);
		add_settings_field(
			'mcp_enabled',
			__( 'Enable MCP Server', 'corsen-context' ),
			array( $this, 'render_checkbox' ),
			'corsen-context',
			'corsen_context_general',
			array(
				'field' => 'mcp_enabled',
				'label' => __( 'Expose MCP endpoint for AI agents', 'corsen-context' ),
			)
		);
		add_settings_field(
			'llms_txt_enabled',
			__( 'Enable llms.txt', 'corsen-context' ),
			array( $this, 'render_checkbox' ),
			'corsen-context',
			'corsen_context_general',
			array(
				'field' => 'llms_txt_enabled',
				'label' => __( 'Generate and serve /llms.txt', 'corsen-context' ),
			)
		);
		add_settings_field(
			'llms_full_enabled',
			__( 'Enable llms-full.txt', 'corsen-context' ),
			array( $this, 'render_checkbox' ),
			'corsen-context',
			'corsen_context_general',
			array(
				'field' => 'llms_full_enabled',
				'label' => __( 'Generate the bounded full-content export (disabled by default)', 'corsen-context' ),
			)
		);
		$webmcp_description = __( 'Browsers expose WebMCP on HTTPS pages only (secure context). Chrome ships it as an origin trial from Chrome 149 to 156 and behind chrome://flags/#enable-webmcp-testing for local tests.', 'corsen-context' );
		if ( ! Corsen_Context_WebMCP::site_is_secure_context() ) {
			$webmcp_description .= ' ' . __( 'This site\'s address starts with http://, so no browser will expose the API on it until it is served over HTTPS.', 'corsen-context' );
		}
		add_settings_field(
			'webmcp_enabled',
			__( 'Enable WebMCP', 'corsen-context' ),
			array( $this, 'render_checkbox' ),
			'corsen-context',
			'corsen_context_general',
			array(
				'field'       => 'webmcp_enabled',
				'label'       => __( 'Register the MCP tools with AI agents running inside the page (document.modelContext)', 'corsen-context' ),
				'description' => $webmcp_description,
			)
		);
		add_settings_field(
			'webmcp_origin_trial_token',
			__( 'Chrome Origin Trial Token', 'corsen-context' ),
			array( $this, 'render_text' ),
			'corsen-context',
			'corsen_context_general',
			array(
				'field'       => 'webmcp_origin_trial_token',
				'description' => __( 'Optional. Chrome only exposes WebMCP during the origin trial when the page serves this token; agents with built-in WebMCP support need none. Register your origin at developer.chrome.com/origintrials.', 'corsen-context' ),
			)
		);
		add_settings_section(
			'corsen_context_content',
			__( 'Content Settings', 'corsen-context' ),
			null,
			'corsen-context'
		);

		add_settings_field( 'post_types', __( 'Post Types', 'corsen-context' ), array( $this, 'render_post_types' ), 'corsen-context', 'corsen_context_content' );
		add_settings_field(
			'exclude_paths',
			__( 'Exclude Paths', 'corsen-context' ),
			array( $this, 'render_textarea' ),
			'corsen-context',
			'corsen_context_content',
			array(
				'field'       => 'exclude_paths',
				'description' => __( 'One path per line (e.g., /admin, /cart)', 'corsen-context' ),
			)
		);
		add_settings_field(
			'max_pages',
			__( 'Max Total Items', 'corsen-context' ),
			array( $this, 'render_number' ),
			'corsen-context',
			'corsen_context_content',
			array(
				'field'       => 'max_pages',
				'min'         => 10,
				'max'         => 5000,
				'description' => __( 'Absolute cap shared across all selected post types.', 'corsen-context' ),
			)
		);
		add_settings_field(
			'max_output_bytes',
			__( 'llms-full.txt Max Bytes', 'corsen-context' ),
			array( $this, 'render_number' ),
			'corsen-context',
			'corsen_context_content',
			array(
				'field'       => 'max_output_bytes',
				'min'         => 65536,
				'max'         => 10485760,
				'description' => __( 'Hard output limit between 64 KB and 10 MB.', 'corsen-context' ),
			)
		);
		add_settings_section(
			'corsen_context_tools',
			__( 'Agent Tools', 'corsen-context' ),
			array( $this, 'render_tools_intro' ),
			'corsen-context'
		);
		add_settings_field(
			'enabled_tools',
			__( 'Exposed Tools', 'corsen-context' ),
			array( $this, 'render_enabled_tools' ),
			'corsen-context',
			'corsen_context_tools'
		);

		add_settings_section(
			'corsen_context_experts',
			__( 'Expert Requests & Audit', 'corsen-context' ),
			array( $this, 'render_experts_intro' ),
			'corsen-context'
		);
		add_settings_field(
			'expert_enabled',
			__( 'Human-only Expert Handoff', 'corsen-context' ),
			array( $this, 'render_checkbox' ),
			'corsen-context',
			'corsen_context_experts',
			array(
				'field' => 'expert_enabled',
				'label' => __( 'Expose request_expert_call as a hard-refusal boundary with a human handoff URL (also requires the tool checkbox above)', 'corsen-context' ),
			)
		);
		add_settings_field(
			'expert_handoff_url',
			__( 'Human Handoff Page', 'corsen-context' ),
			array( $this, 'render_text' ),
			'corsen-context',
			'corsen_context_experts',
			array(
				'field'       => 'expert_handoff_url',
				'description' => __( 'Required to expose request_expert_call. Enter a full URL on this site where a human can complete the visible form.', 'corsen-context' ),
			)
		);
		add_settings_field(
			'audit_enabled',
			__( 'Audit Log', 'corsen-context' ),
			array( $this, 'render_checkbox' ),
			'corsen-context',
			'corsen_context_experts',
			array(
				'field' => 'audit_enabled',
				'label' => __( 'Record tool calls in a local table with a hard 500-row cap; WP-Cron prunes entries older than 30 days, and no raw arguments or IPs are stored', 'corsen-context' ),
			)
		);

		add_settings_section(
			'corsen_context_security',
			__( 'Security Settings', 'corsen-context' ),
			null,
			'corsen-context'
		);

		add_settings_field(
			'rate_limit',
			__( 'Rate Limit (req/min)', 'corsen-context' ),
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
			'hide_user_enumeration',
			__( 'Hide User Enumeration', 'corsen-context' ),
			array( $this, 'render_checkbox' ),
			'corsen-context',
			'corsen_context_security',
			array(
				'field' => 'hide_user_enumeration',
				'label' => __( 'Block anonymous reads of /wp/v2/users (author logins). Logged-in requests keep working.', 'corsen-context' ),
			)
		);
		add_settings_field(
			'credit',
			__( 'Show Credit', 'corsen-context' ),
			array( $this, 'render_checkbox' ),
			'corsen-context',
			'corsen_context_security',
			array(
				'field' => 'credit',
				'label' => __( 'Add a "Powered by Corsen Context" line to llms.txt and llms-full.txt (off by default)', 'corsen-context' ),
			)
		);
		add_settings_field(
			'include_author',
			__( 'Include Author Names', 'corsen-context' ),
			array( $this, 'render_checkbox' ),
			'corsen-context',
			'corsen_context_security',
			array(
				'field' => 'include_author',
				'label' => __( 'Expose post author display names in MCP metadata', 'corsen-context' ),
			)
		);
		add_settings_field(
			'cache_ttl',
			__( 'Cache TTL (seconds)', 'corsen-context' ),
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

		// Agent-purchase policy side-channel: fields live in the same form,
		// so options.php already verified the settings nonce before we run.
		$cc_policy_raw = isset( $_POST['cc_agent_policy'] ) ? wp_unslash( $_POST['cc_agent_policy'] ) : null; // phpcs:ignore WordPress.Security.NonceVerification.Missing, WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- nonce verified by options.php; sanitized per-field inside.
		if ( is_array( $cc_policy_raw ) && current_user_can( 'manage_options' ) ) {
			Corsen_Context_Agent_Policy::handle_owner_form_submission( $cc_policy_raw );
		}

		$sanitized['enabled']                   = ! empty( $input['enabled'] );
		$sanitized['mcp_enabled']               = ! empty( $input['mcp_enabled'] );
		$sanitized['llms_txt_enabled']          = ! empty( $input['llms_txt_enabled'] );
		$sanitized['llms_full_enabled']         = ! empty( $input['llms_full_enabled'] );
		$sanitized['credit']                    = ! empty( $input['credit'] );
		$sanitized['credit_opt_in_migrated']    = true;
		$sanitized['include_author']            = ! empty( $input['include_author'] );
		$sanitized['webmcp_enabled']            = ! empty( $input['webmcp_enabled'] );
		$all_tools                              = Corsen_Context_Tool_Registry::known();
		$requested_tools                        = array_map( 'sanitize_text_field', (array) ( $input['enabled_tools'] ?? Corsen_Context_Tool_Registry::CORE_TOOLS ) );
		$sanitized['enabled_tools']             = array_values( array_intersect( $all_tools, $requested_tools ) );
		$sanitized['audit_enabled']             = ! empty( $input['audit_enabled'] );
		$sanitized['hide_user_enumeration']     = ! empty( $input['hide_user_enumeration'] );
		$sanitized['expert_enabled']            = ! empty( $input['expert_enabled'] );
		$sanitized['expert_handoff_url']        = Corsen_Context_Agent_Policy::sanitize_handoff_url( $input['expert_handoff_url'] ?? '' );
		$sanitized['expert_notify']             = ! empty( $input['expert_notify'] );
		$sanitized['expert_email']              = sanitize_email( (string) ( $input['expert_email'] ?? '' ) );
		$sanitized['webmcp_origin_trial_token'] = substr( (string) preg_replace( '/[^A-Za-z0-9+\/=]/', '', (string) ( $input['webmcp_origin_trial_token'] ?? '' ) ), 0, 4096 );
		// The editing form sets this marker when it actually rendered the
		// content-type checkboxes. With the marker, an empty selection is a
		// deliberate "expose nothing" choice; silently restoring post,page
		// contradicted the whole owner-control promise (audit 2026-09-01).
		$intentional_types             = array_key_exists( 'post_types_present', $input );
		$public_types                  = array_keys( get_post_types( array( 'public' => true ) ) );
		$requested_types               = array_map( 'sanitize_text_field', (array) ( $input['post_types'] ?? ( $intentional_types ? array() : array( 'post', 'page' ) ) ) );
		$sanitized['post_types']       = array_values( array_intersect( $requested_types, $public_types ) );
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
		if ( ! empty( $args['description'] ) ) {
			printf( '<p class="description">%s</p>', esc_html( $args['description'] ) );
		}
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
		$all_tools = Corsen_Context_Tool_Registry::known();
		$tools     = ( isset( $settings['enabled_tools'] ) && is_array( $settings['enabled_tools'] ) )
			? $settings['enabled_tools']
			: Corsen_Context_Tool_Registry::CORE_TOOLS;
		$types     = $settings['post_types'] ?? array( 'post', 'page' );
		$excluded  = array_filter(
			array_map(
				'trim',
				explode( "\n", (string) ( $settings['exclude_paths'] ?? '' ) )
			)
		);

		echo '<div style="background:#fff;border:1px solid #dcdcde;border-left:4px solid #00844a;padding:12px 16px;margin:16px 0;">';
		printf( '<h2 style="margin-top:0;font-size:15px;">%s</h2>', esc_html__( 'Agent Access — what agents can see and do', 'corsen-context' ) );

		if ( ! $on ) {
			printf(
				'<p><strong>%s</strong> %s</p></div>',
				esc_html__( 'Corsen Context is off.', 'corsen-context' ),
				esc_html__( 'No agent can reach content through Corsen Context tools.', 'corsen-context' )
			);
			return;
		}

		$rows = array(
			array( __( 'MCP endpoint (agents outside the browser)', 'corsen-context' ), $mcp ),
			array( __( 'WebMCP (agents inside the page)', 'corsen-context' ), $webmcp ),
			array( __( 'llms.txt discovery', 'corsen-context' ), $llms ),
		);
		echo '<table class="widefat striped" style="margin-bottom:10px;"><tbody>';
		foreach ( $rows as $row ) {
			printf(
				'<tr><td style="width:240px;">%s</td><td style="color:%s;font-weight:600;">%s</td></tr>',
				esc_html( $row[0] ),
				esc_attr( $row[1] ? '#00844a' : '#8a8a8a' ),
				$row[1] ? esc_html__( 'On', 'corsen-context' ) : esc_html__( 'Off', 'corsen-context' )
			);
		}
		echo '</tbody></table>';

		$exposed_tools = array_values(
			array_filter(
				array_intersect( $all_tools, (array) $tools ),
				static function ( $tool ): bool {
					return ! Corsen_Context_Tool_Registry::is_optional( (string) $tool )
						|| null !== Corsen_Context_Tool_Registry::extension_definition( (string) $tool );
				}
			)
		);
		if ( in_array( 'request_expert_call', $exposed_tools, true ) ) {
			printf(
				'<p style="margin:6px 0;"><strong>%s</strong> %s <code>human_only</code> %s</p>',
				esc_html__( 'Through these tools, agents can:', 'corsen-context' ),
				esc_html__( 'read selected public content and discover that expert intake is human-only. A schema-valid expert call is refused with', 'corsen-context' ),
				esc_html__( 'and a handoff URL before any side effect.', 'corsen-context' )
			);
		} else {
			printf(
				'<p style="margin:6px 0;"><strong>%s</strong> %s</p>',
				esc_html__( 'Through these tools, agents can:', 'corsen-context' ),
				esc_html__( 'read only. They look up and read your selected published content. These tools cannot create, edit, delete, purchase, submit, or click — every exposed tool is marked read-only and untrusted-content.', 'corsen-context' )
			);
		}
		printf(
			'<p style="margin:6px 0;"><strong>%s</strong> %s</p>',
			esc_html__( 'Tools exposed:', 'corsen-context' ),
			esc_html( empty( $exposed_tools ) ? __( 'None', 'corsen-context' ) : implode( ', ', $exposed_tools ) )
		);
		printf(
			'<p style="margin:6px 0;"><strong>%s</strong> %s</p>',
			esc_html__( 'Content types agents can see:', 'corsen-context' ),
			esc_html( implode( ', ', (array) $types ) )
		);
		if ( ! empty( $excluded ) ) {
			printf(
				'<p style="margin:6px 0;"><strong>%s</strong> %s</p>',
				esc_html__( 'Paths hidden from Corsen Context tools:', 'corsen-context' ),
				esc_html( implode( ', ', $excluded ) )
			);
		}

		printf( '<p class="description" style="margin:6px 0 0;">%s</p>', esc_html__( 'Change any of these below, then Save.', 'corsen-context' ) );
		echo '</div>';
	}

	/** Intro copy for the Agent Tools section. */
	public function render_tools_intro(): void {
		printf(
			'<p>%s <strong>%s</strong>. <code>request_expert_call</code> %s <code>human_only</code> %s</p>',
			esc_html__( 'Choose exactly which Corsen Context tools agents may call. The content tools are', 'corsen-context' ),
			esc_html__( 'read-only', 'corsen-context' ),
			esc_html__( 'represents a non-read-only action but always refuses agent execution with', 'corsen-context' ),
			esc_html__( 'and a page URL, before storage, email or throttling.', 'corsen-context' )
		);
	}

	/** Intro copy for the Expert Requests & Audit section. */
	public function render_experts_intro(): void {
		printf( '<p>%s</p>', esc_html__( 'Owner-controlled extras: an optional human-only handoff boundary and a bounded local audit log of tool calls. Both are off until you switch them on.', 'corsen-context' ) );
	}

	/** Per-tool checkboxes bound to the enabled_tools setting. */
	public function render_enabled_tools(): void {
		$settings = get_option( 'corsen_context_settings', array() );
		$all      = array(
			'search_site'         => __( 'Search content by keyword', 'corsen-context' ),
			'get_page_content'    => __( 'Read one page as clean markdown', 'corsen-context' ),
			'list_content'        => __( 'List content by type, with pagination', 'corsen-context' ),
			'get_sitemap'         => __( 'Return the structured sitemap', 'corsen-context' ),
			'get_product'         => __( 'Read one product with live price and stock (requires WooCommerce)', 'corsen-context' ),
			'get_sections'        => __( 'Read a page as a bounded outline plus one section at a time (token-safe on large pages)', 'corsen-context' ),
			'get_structured_data' => __( 'Read a page\'s JSON-LD typed data (products, recipes, FAQs) exactly as the site publishes it', 'corsen-context' ),
			'check_agent_access'  => __( 'Read the owner\'s latest same-site surface check using representative bot User-Agent strings (not a full external-agent test)', 'corsen-context' ),
			'request_expert_call' => __( 'Human-only expert handoff (non-read-only semantics; every schema-valid call is refused before side effects)', 'corsen-context' ),
		);
		$enabled  = $settings['enabled_tools'] ?? Corsen_Context_Tool_Registry::CORE_TOOLS;
		// Preserve an explicit empty selection when every checkbox is cleared.
		echo '<input type="hidden" name="corsen_context_settings[enabled_tools][]" value="" />';
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
		printf( '<p class="description">%s</p>', esc_html__( 'MCP and WebMCP expose the same selected set. Uncheck all to expose no callable tools.', 'corsen-context' ) );
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
		// Marker: this form renders the full checkbox set, so an empty
		// selection is the owner's deliberate "expose nothing" choice.
		echo '<input type="hidden" name="corsen_context_settings[post_types_present]" value="1" />';

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
			<h1><?php esc_html_e( 'Corsen Context Settings', 'corsen-context' ); ?></h1>
			<p><?php esc_html_e( 'Publish selected public WordPress content through MCP and llms.txt.', 'corsen-context' ); ?></p>

			<div style="background:#f0f7ff;border-left:4px solid #2271b1;padding:12px 16px;margin:16px 0;">
				<strong><?php esc_html_e( 'Quick Links:', 'corsen-context' ); ?></strong>
				<a href="<?php echo esc_url( $site_url . '/llms.txt' ); ?>" target="_blank"><?php esc_html_e( 'View llms.txt', 'corsen-context' ); ?></a> |
				<?php if ( $llms_full_enabled ) : ?>
					<a href="<?php echo esc_url( $site_url . '/llms-full.txt' ); ?>" target="_blank"><?php esc_html_e( 'View llms-full.txt', 'corsen-context' ); ?></a> |
				<?php else : ?>
					<span><?php esc_html_e( 'llms-full.txt disabled', 'corsen-context' ); ?></span> |
				<?php endif; ?>
				<strong><?php esc_html_e( 'MCP:', 'corsen-context' ); ?></strong> <code><?php echo esc_html( Corsen_Context_MCP_Server::endpoint_url() ); ?></code>
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
				<?php
				printf(
					/* translators: %s: plugin version */
					esc_html__( 'Powered by Corsen Context v%s', 'corsen-context' ),
					esc_html( CORSEN_CONTEXT_VERSION )
				);
				?>
				&bull;
				<?php esc_html_e( 'Built by', 'corsen-context' ); ?> <a href="https://corsen.ai" target="_blank">Corsen AI</a> &bull;
				<a href="https://github.com/CorsenAI/corsen-context" target="_blank">GitHub</a>
			</p>
		</div>
		<?php
	}
}
