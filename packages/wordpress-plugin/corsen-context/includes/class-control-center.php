<?php
/**
 * Control Center page for Corsen Context.
 *
 * Card-based admin surface: one card per exposed component, live status
 * badges, per-tool toggles, and a read-only preview of what agents see.
 * Uses the same option keys and sanitize callback as the classic settings
 * page (options.php pipeline), so behavior is identical by construction.
 *
 * Powered by Corsen Context - Built by Corsen AI - github.com/CorsenAI/corsen-context
 *
 * @package Corsen_Context
 */

defined( 'ABSPATH' ) || exit;

/**
 * Control Center.
 */
class Corsen_Context_Control_Center {

	private static ?self $instance = null;

	public static function instance(): self {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	private function __construct() {
		add_action( 'admin_menu', array( $this, 'add_menu' ), 11 );
	}

	public function add_menu(): void {
		add_submenu_page(
			'options-general.php',
			__( 'Corsen Context Control Center', 'corsen-context' ),
			__( 'Corsen Context Control', 'corsen-context' ),
			'manage_options',
			'corsen-context-control',
			array( $this, 'render_page' )
		);
	}

	/**
	 * Static descriptions for every tool card, current and announced.
	 *
	 * @return array<string,array<string,string>>
	 */
	private function tool_catalog(): array {
		return array(
			'search_site'         => array(
				'title' => __( 'Search site', 'corsen-context' ),
				'desc'  => __( 'Agents look up your published pages and posts by keyword.', 'corsen-context' ),
				'state' => 'live',
			),
			'get_page_content'    => array(
				'title' => __( 'Read a page', 'corsen-context' ),
				'desc'  => __( 'Agents read one URL as clean markdown, straight from WordPress.', 'corsen-context' ),
				'state' => 'live',
			),
			'get_sitemap'         => array(
				'title' => __( 'Sitemap', 'corsen-context' ),
				'desc'  => __( 'Agents list every URL this site exposes, with type per entry.', 'corsen-context' ),
				'state' => 'live',
			),
			'list_content'        => array(
				'title' => __( 'List content', 'corsen-context' ),
				'desc'  => __( 'Agents list newest items per content type, with pagination.', 'corsen-context' ),
				'state' => 'live',
			),
			'get_product'         => array(
				'title' => __( 'Get product (WooCommerce)', 'corsen-context' ),
				'desc'  => __( 'Agents read price, stock and images of one product. Read-only.', 'corsen-context' ),
				'state' => 'soon',
			),
			'request_expert_call' => array(
				'title' => __( 'Request expert call (write tool)', 'corsen-context' ),
				'desc'  => __( 'Agents submit the expert-request form as a structured tool call. Off by default, owner-controlled.', 'corsen-context' ),
				'state' => 'soon',
			),
		);
	}

	public function render_page(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		$settings   = get_option( 'corsen_context_settings', array() );
		$all_tools  = array_keys( $this->tool_catalog() );
		$live_tools = array( 'search_site', 'get_page_content', 'list_content', 'get_sitemap' );
		$enabled    = isset( $settings['enabled_tools'] ) && is_array( $settings['enabled_tools'] )
			? array_values( array_intersect( $live_tools, $settings['enabled_tools'] ) )
			: $live_tools;
		$on         = ! empty( $settings['enabled'] );
		$endpoint   = Corsen_Context_MCP_Server::endpoint_url();
		$llms_cache = get_transient( 'corsen_context_llms_txt' );
		$llms_size  = is_string( $llms_cache ) ? strlen( $llms_cache ) : 0;
		$types      = $settings['post_types'] ?? array( 'post', 'page' );
		?>
		<div class="wrap ccx-wrap">
			<h1><?php esc_html_e( 'Corsen Context — Control Center', 'corsen-context' ); ?></h1>
			<p class="ccx-sub"><?php esc_html_e( 'Every surface agents can reach, one card each. Turn exactly what you want on or off, then save.', 'corsen-context' ); ?></p>

			<style>
				.ccx-wrap{max-width:1080px}
				.ccx-sub{color:#50575e;font-size:14px}
				.ccx-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px;margin:18px 0}
				.ccx-card{background:#fff;border:1px solid #dcdcde;border-radius:10px;padding:16px 18px;position:relative;display:flex;flex-direction:column;gap:8px}
				.ccx-card--wide{grid-column:1/-1}
				.ccx-card--off{opacity:.75}
				.ccx-badge{display:inline-block;font-size:11px;font-weight:700;border-radius:999px;padding:2px 10px;text-transform:uppercase;letter-spacing:.03em}
				.ccx-badge--on{background:#e6f6ed;color:#11733b}
				.ccx-badge--off{background:#f0f0f1;color:#666}
				.ccx-badge--soon{background:#fef7e6;color:#946200}
				.ccx-title{font-size:15px;font-weight:700;margin:0}
				.ccx-desc{color:#50575e;font-size:13px;margin:0}
				.ccx-meta{font-size:12px;color:#787c82;word-break:break-all}
				.ccx-locked{background:#f6f7f7}
				.ccx-switch{display:flex;align-items:center;gap:8px;font-weight:600}
				.ccx-preview{background:#10151b;color:#d5dfe8;border-radius:10px;padding:14px 16px;font-family:Consolas,Monaco,monospace;font-size:12px;line-height:1.5;white-space:pre-wrap;word-break:break-word;max-height:280px;overflow:auto}
				.ccx-sec{font-size:11px;color:#8a8f94}
			</style>

			<form method="post" action="options.php">
				<?php settings_fields( 'corsen_context' ); ?>

				<div class="ccx-grid">
					<div class="ccx-card ccx-card--wide <?php echo $on ? '' : 'ccx-card--off'; ?>">
						<label class="ccx-switch">
							<input type="checkbox" name="corsen_context_settings[enabled]" value="1" <?php checked( $on ); ?> />
							<strong><?php esc_html_e( 'Master switch — publish the agent layer', 'corsen-context' ); ?></strong>
						</label>
						<p class="ccx-desc"><?php esc_html_e( 'When off, every surface below stops serving immediately: no MCP endpoint, no llms.txt, no in-page tools.', 'corsen-context' ); ?></p>
					</div>

					<div class="ccx-card <?php echo $on && ! empty( $settings['mcp_enabled'] ) ? '' : 'ccx-card--off'; ?>">
						<div><span class="ccx-badge <?php echo ( $on && ! empty( $settings['mcp_enabled'] ) ) ? 'ccx-badge--on' : 'ccx-badge--off'; ?>"><?php esc_html_e( 'MCP endpoint', 'corsen-context' ); ?></span></div>
						<label class="ccx-switch"><input type="checkbox" name="corsen_context_settings[mcp_enabled]" value="1" <?php checked( ! empty( $settings['mcp_enabled'] ) ); ?> /><?php esc_html_e( 'Serve JSON-RPC for agents outside the browser', 'corsen-context' ); ?></label>
						<p class="ccx-meta"><code><?php echo esc_html( $endpoint ); ?></code></p>
						<p class="ccx-desc"><?php esc_html_e( 'Claude, Cursor or any MCP client talks to this URL. Read-only tools, rate limited, no credentials.', 'corsen-context' ); ?></p>
						<a href="<?php echo esc_url( $endpoint ); ?>" target="_blank" rel="noopener"><?php esc_html_e( 'Open endpoint info ↗', 'corsen-context' ); ?></a>
					</div>

					<div class="ccx-card <?php echo $on && ! empty( $settings['llms_txt_enabled'] ) ? '' : 'ccx-card--off'; ?>">
						<div><span class="ccx-badge <?php echo ( $on && ! empty( $settings['llms_txt_enabled'] ) ) ? 'ccx-badge--on' : 'ccx-badge--off'; ?>">llms.txt</span></div>
						<label class="ccx-switch"><input type="checkbox" name="corsen_context_settings[llms_txt_enabled]" value="1" <?php checked( ! empty( $settings['llms_txt_enabled'] ) ); ?> /><?php esc_html_e( 'Serve /llms.txt discovery file', 'corsen-context' ); ?></label>
						<p class="ccx-meta"><?php echo esc_html( $llms_size > 0 ? sprintf( /* translators: %s: size in bytes */ __( 'Cached: %s bytes', 'corsen-context' ), number_format_i18n( $llms_size ) ) : __( 'Not built yet (first request will build it)', 'corsen-context' ) ); ?></p>
						<a href="<?php echo esc_url( home_url( '/llms.txt' ) ); ?>" target="_blank" rel="noopener"><?php esc_html_e( 'View llms.txt ↗', 'corsen-context' ); ?></a>
					</div>

					<div class="ccx-card <?php echo $on && ! empty( $settings['webmcp_enabled'] ) ? '' : 'ccx-card--off'; ?>">
						<div><span class="ccx-badge <?php echo ( $on && ! empty( $settings['webmcp_enabled'] ) ) ? 'ccx-badge--on' : 'ccx-badge--off'; ?>">WebMCP</span></div>
						<label class="ccx-switch"><input type="checkbox" name="corsen_context_settings[webmcp_enabled]" value="1" <?php checked( ! empty( $settings['webmcp_enabled'] ) ); ?> /><?php esc_html_e( 'Register tools inside the page (document.modelContext)', 'corsen-context' ); ?></label>
						<p class="ccx-desc"><?php esc_html_e( 'Browser-resident agents discover the same tools with zero configuration, on the open page.', 'corsen-context' ); ?></p>
						<label class="ccx-sec"><?php esc_html_e( 'Chrome origin trial token (optional)', 'corsen-context' ); ?>
							<input type="text" name="corsen_context_settings[webmcp_origin_trial_token]" class="large-text" value="<?php echo esc_attr( $settings['webmcp_origin_trial_token'] ?? '' ); ?>" />
						</label>
					</div>

					<div class="ccx-card <?php echo $on && ! empty( $settings['llms_full_enabled'] ) ? '' : 'ccx-card--off'; ?>">
						<div><span class="ccx-badge <?php echo ( $on && ! empty( $settings['llms_full_enabled'] ) ) ? 'ccx-badge--on' : 'ccx-badge--off'; ?>">llms-full.txt</span></div>
						<label class="ccx-switch"><input type="checkbox" name="corsen_context_settings[llms_full_enabled]" value="1" <?php checked( ! empty( $settings['llms_full_enabled'] ) ); ?> /><?php esc_html_e( 'Bounded full-content export', 'corsen-context' ); ?></label>
						<label class="ccx-sec"><?php esc_html_e( 'Max bytes', 'corsen-context' ); ?>
							<input type="number" name="corsen_context_settings[max_output_bytes]" min="65536" max="10485760" class="small-text" value="<?php echo esc_attr( $settings['max_output_bytes'] ?? 5242880 ); ?>" />
						</label>
					</div>
				</div>

				<h2><?php esc_html_e( 'Tools agents can call', 'corsen-context' ); ?></h2>
				<p class="ccx-desc"><?php esc_html_e( 'Same set for MCP, WebMCP and the abilities layer. Uncheck all to expose no callable tools.', 'corsen-context' ); ?></p>
				<input type="hidden" name="corsen_context_settings[enabled_tools][]" value="" />
				<div class="ccx-grid">
					<?php
					foreach ( $this->tool_catalog() as $tool => $meta ) :
						$is_live  = 'live' === $meta['state'];
						$is_on    = $is_live && in_array( $tool, $enabled, true );
						$card_cls = 'ccx-card' . ( $is_live ? '' : ' ccx-locked' ) . ( $is_on ? '' : ' ccx-card--off' );
						?>
						<div class="<?php echo esc_attr( $card_cls ); ?>">
							<div>
								<span class="ccx-badge <?php echo $is_live ? ( $is_on ? 'ccx-badge--on' : 'ccx-badge--off' ) : 'ccx-badge--soon'; ?>">
									<?php echo $is_live ? esc_html__( 'exposed', 'corsen-context' ) : esc_html__( 'coming', 'corsen-context' ); ?>
								</span>
							</div>
							<p class="ccx-title"><code><?php echo esc_html( $tool ); ?></code> — <?php echo esc_html( $meta['title'] ); ?></p>
							<p class="ccx-desc"><?php echo esc_html( $meta['desc'] ); ?></p>
							<?php if ( $is_live ) : ?>
								<label class="ccx-switch"><input type="checkbox" name="corsen_context_settings[enabled_tools][]" value="<?php echo esc_attr( $tool ); ?>" <?php checked( $is_on ); ?> /><?php esc_html_e( 'Expose this tool', 'corsen-context' ); ?></label>
							<?php else : ?>
								<p class="ccx-sec"><?php esc_html_e( 'Arrives in v1.5.0. Will default to OFF, owner-controlled.', 'corsen-context' ); ?></p>
							<?php endif; ?>
						</div>
					<?php endforeach; ?>
				</div>

				<h2><?php esc_html_e( 'Content & security', 'corsen-context' ); ?></h2>
				<div class="ccx-grid">
					<div class="ccx-card ccx-card--wide">
						<p class="ccx-title"><?php esc_html_e( 'Content types agents may read', 'corsen-context' ); ?></p>
						<?php
						$post_types = get_post_types( array( 'public' => true ), 'objects' );
						foreach ( $post_types as $pt ) {
							if ( 'attachment' === $pt->name ) {
								continue;
							}
							$checked_pt = in_array( $pt->name, (array) $types, true );
							printf(
								'<label style="margin-right:15px;"><input type="checkbox" name="corsen_context_settings[post_types][]" value="%s" %s /> %s</label>',
								esc_attr( $pt->name ),
								checked( $checked_pt, true, false ),
								esc_html( $pt->labels->name )
							);
						}
						?>
						<div style="display:flex;gap:24px;flex-wrap:wrap;margin-top:10px;">
							<label class="ccx-sec"><?php esc_html_e( 'Max items', 'corsen-context' ); ?>
								<input type="number" name="corsen_context_settings[max_pages]" min="10" max="5000" class="small-text" value="<?php echo esc_attr( $settings['max_pages'] ?? 500 ); ?>" />
							</label>
							<label class="ccx-sec"><?php esc_html_e( 'Rate limit (req/min)', 'corsen-context' ); ?>
								<input type="number" name="corsen_context_settings[rate_limit]" min="10" max="1000" class="small-text" value="<?php echo esc_attr( $settings['rate_limit'] ?? 100 ); ?>" />
							</label>
							<label class="ccx-sec"><?php esc_html_e( 'Cache TTL (s)', 'corsen-context' ); ?>
								<input type="number" name="corsen_context_settings[cache_ttl]" min="60" max="86400" class="small-text" value="<?php echo esc_attr( $settings['cache_ttl'] ?? 3600 ); ?>" />
							</label>
							<label class="ccx-sec"><input type="checkbox" name="corsen_context_settings[include_author]" value="1" <?php checked( ! empty( $settings['include_author'] ) ); ?> /> <?php esc_html_e( 'Expose author names', 'corsen-context' ); ?></label>
						</div>
						<label class="ccx-sec" style="display:block;margin-top:10px;"><?php esc_html_e( 'Hidden paths (one per line)', 'corsen-context' ); ?>
							<textarea name="corsen_context_settings[exclude_paths]" rows="3" class="large-text"><?php echo esc_textarea( $settings['exclude_paths'] ?? '' ); ?></textarea>
						</label>
					</div>
				</div>

				<?php submit_button( __( 'Save Control Center', 'corsen-context' ) ); ?>
			</form>

			<h2><?php esc_html_e( 'What agents see right now', 'corsen-context' ); ?></h2>
			<div class="ccx-preview"><?php echo esc_html( $this->agent_preview( $on, $enabled ) ); ?></div>
		</div>
		<?php
	}

	/**
	 * Plain-text snapshot of the live agent contract.
	 *
	 * @param bool                $on      Master switch state.
	 * @param array<int,string>   $enabled Enabled tool names.
	 */
	private function agent_preview( bool $on, array $enabled ): string {
		if ( ! $on ) {
			return __( 'Corsen Context is OFF. Agents currently see nothing: no endpoint, no llms.txt, no in-page tools.', 'corsen-context' );
		}
		$lines   = array();
		$lines[] = 'MCP endpoint : ' . Corsen_Context_MCP_Server::endpoint_url();
		$lines[] = 'Tools        : ' . ( empty( $enabled ) ? __( '(none)', 'corsen-context' ) : implode( ', ', $enabled ) );
		$lines[] = 'llms.txt     : ' . home_url( '/llms.txt' );
		$cache   = get_transient( 'corsen_context_llms_txt' );
		if ( is_string( $cache ) && '' !== $cache ) {
			$head    = implode( "\n", array_slice( explode( "\n", $cache ), 0, 12 ) );
			$lines[] = '';
			$lines[] = '--- llms.txt (cached head) ---';
			$lines[] = $head;
		}
		return implode( "\n", $lines );
	}
}
