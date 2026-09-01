<?php
/**
 * Agent conduct policy — the single source of truth for what an AI agent
 * may and may not do on this site.
 *
 * Every governed surface renders FROM this class: the WebMCP bridge, MCP
 * tools/list descriptions, product payloads (agentPurchase), llms.txt, and
 * the [corsen_agent_policy] shortcode page. Nothing is hand-written twice,
 * so the channels cannot diverge. Enforcement stays server-side (this class
 * explains the law, the guards apply it).
 *
 * @package Corsen_Context
 */

defined( 'ABSPATH' ) || exit;

/**
 * Owner-set agent purchase policy + the human-only tool rule.
 */
class Corsen_Context_Agent_Policy {

	/** Product meta carrying the owner's agent-purchase decision. */
	public const META_KEY = '_cc_agent_purchase';

	/** Product meta carrying the human-readable reason. */
	public const META_REASON_KEY = '_cc_agent_purchase_reason';

	public const ALLOWED   = 'allowed';
	public const FORBIDDEN = 'forbidden';

	/**
	 * Hooks: head banner for parsers + the machine-rendered policy page.
	 */
	public static function init(): void {
		add_action( 'wp_head', array( __CLASS__, 'render_head_banner' ), 1 );
		add_shortcode( 'corsen_agent_policy', array( __CLASS__, 'render_shortcode' ) );
		add_shortcode( 'corsen_human_only_notice', array( __CLASS__, 'render_human_only_notice' ) );
		add_action( 'init', array( __CLASS__, 'register_meta' ), 9 );
	}

	/**
	 * Owner-set policy meta, REST-exposed so Control Centers and admin UIs
	 * can set the policy durably (auth enforced per-meta).
	 */
	public static function register_meta(): void {
		register_post_meta(
			'product',
			self::META_KEY,
			array(
				'type'              => 'string',
				'single'            => true,
				'show_in_rest'      => true,
				'sanitize_callback' => 'sanitize_key',
				'auth_callback'     => static function ( $allowed, $meta_key, $post_id ) {
					// NB: do NOT call current_user_can('edit_post_meta') here: for a registered
					// protected meta that re-enters this callback. Core-recommended check.
					return (bool) current_user_can( 'edit_post', $post_id );
				},
			)
		);
		register_post_meta(
			'product',
			self::META_REASON_KEY,
			array(
				'type'              => 'string',
				'single'            => true,
				'show_in_rest'      => true,
				'sanitize_callback' => 'sanitize_text_field',
				'auth_callback'     => static function ( $allowed, $meta_key, $post_id ) {
					// NB: do NOT call current_user_can('edit_post_meta') here: for a registered
					// protected meta that re-enters this callback. Core-recommended check.
					return (bool) current_user_can( 'edit_post', $post_id );
				},
			)
		);
	}

	/**
	 * Persist owner choices from the Control Center form (settings nonce was
	 * verified by options.php before the sanitize callback ran).
	 *
	 * @param array<string,array> $rows Raw per-product rows keyed by post ID.
	 */
	public static function handle_owner_form_submission( array $rows ): void {
		foreach ( $rows as $product_id => $row ) {
			$id = absint( $product_id );
			if ( $id <= 0 || 'product' !== get_post_type( $id ) || ! is_array( $row ) ) {
				continue;
			}
			$state  = sanitize_text_field( (string) ( $row['state'] ?? '' ) );
			$reason = self::truncate( sanitize_textarea_field( (string) ( $row['reason'] ?? '' ) ), 400 );
			if ( self::FORBIDDEN === $state ) {
				update_post_meta( $id, self::META_KEY, self::FORBIDDEN );
				if ( '' !== $reason ) {
					update_post_meta( $id, self::META_REASON_KEY, $reason );
				} else {
					delete_post_meta( $id, self::META_REASON_KEY );
				}
			} elseif ( self::ALLOWED === $state ) {
				delete_post_meta( $id, self::META_KEY );
				delete_post_meta( $id, self::META_REASON_KEY );
			}
		}
	}

	/**
	 * Tools whose submission channel is reserved for humans.
	 *
	 * @return string[]
	 */
	public static function human_only_tools(): array {
		return array( 'request_expert_call' );
	}

	/**
	 * Where a human must complete a human-only action themselves.
	 */
	public static function human_handoff_url(): string {
		return home_url( '/' );
	}

	/**
	 * Agent purchase policy for one product (default: allowed).
	 *
	 * @param int $product_id Product post ID.
	 * @return array{agentPurchase:string,agentPurchaseReason:string}
	 */
	public static function product_policy( int $product_id ): array {
		$state  = (string) get_post_meta( $product_id, self::META_KEY, true );
		$reason = (string) get_post_meta( $product_id, self::META_REASON_KEY, true );
		if ( ! in_array( $state, array( self::ALLOWED, self::FORBIDDEN ), true ) ) {
			$state  = self::ALLOWED;
			$reason = 'The owner has set no agent-purchase restriction on this product.';
		} elseif ( '' === $reason ) {
			$reason = self::FORBIDDEN === $state
				? 'The owner forbids AI agents to purchase this product; a human must complete the checkout.'
				: 'The owner explicitly allows AI agents to purchase this product.';
		}
		return array(
			'agentPurchase'       => $state,
			'agentPurchaseReason' => $reason,
		);
	}

	/**
	 * Products the owner flagged forbidden, for the rendered policy page.
	 *
	 * @return array<int,array{title:string,url:string,reason:string}>
	 */
	public static function forbidden_products(): array {
		if ( ! function_exists( 'wc_get_product' ) ) {
			return array();
		}
		$ids     = get_posts(
			array(
				'post_type'      => 'product',
				'post_status'    => 'publish',
				'posts_per_page' => 50,
				'fields'         => 'ids',
				'meta_key'       => self::META_KEY, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
				'meta_value'     => self::FORBIDDEN, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_value
			)
		);
		$entries = array();
		foreach ( $ids as $id ) {
			$product = wc_get_product( (int) $id );
			if ( ! $product ) {
				continue;
			}
			$policy    = self::product_policy( (int) $id );
			$entries[] = array(
				'title'  => (string) $product->get_name(),
				'url'    => (string) get_permalink( (int) $id ),
				'reason' => $policy['agentPurchaseReason'],
			);
		}
		return $entries;
	}

	/**
	 * The policy as plain data (JSON payloads, tests).
	 *
	 * @return array<string,mixed>
	 */
	public static function policy_array(): array {
		return array(
			'readOnlyByDefault' => true,
			'humanOnlyTools'    => self::human_only_tools(),
			'humanHandoffUrl'   => self::human_handoff_url(),
			'purchasePolicy'    => 'Every product carries agentPurchase = allowed|forbidden with a reason; on forbidden, hand the product URL to a human and never start checkout.',
			'enforcement'       => 'The expert intake is refused server-side with code human_only. agentPurchase is a binding contract instruction for agents: this plugin exposes no purchase tool at all, and the store closes its own restricted lanes (demo coupon excludes flagged products). It does not intercept the ordinary human checkout.',
		);
	}

	/**
	 * Markdown block injected into generated llms.txt (never hand-written).
	 *
	 * @return string[]
	 */
	public static function llms_lines(): array {
		$lines   = array();
		$lines[] = '## Agent conduct policy (machine and human readable)';
		$lines[] = 'The tool annotations you already received are binding for well-behaved agents. Enforcement, precisely: expert intake is refused server-side (hard refusal, code human_only); purchase policy is a contract instruction enforced through the store\'s own lanes (no purchase tool exists here, and restricted coupons exclude flagged products). The human checkout is never intercepted.';
		$lines[] = '- Core content tools are read-only (readOnlyHint: true). Use them freely.';
		$lines[] = '- request_expert_call is HUMANS ONLY: the server refuses every agent submission with code human_only. Do not call it; give your user the page URL instead: ' . self::human_handoff_url();
		$lines[] = '- Purchases: each product reports agentPurchase = allowed|forbidden plus a reason. On forbidden, do not start checkout; hand the product URL to a human.';
		$lines[] = '- Never submit forms, place orders, or spend money beyond the explicit policy of each product.';
		$lines[] = '';
		return $lines;
	}

	/**
	 * Multibyte-safe truncate that degrades gracefully when mbstring is absent.
	 *
	 * @param string $text Input text.
	 * @param int    $limit Maximum characters.
	 * @return string
	 */
	private static function truncate( string $text, int $limit ): string {
		if ( function_exists( 'mb_substr' ) ) {
			return mb_substr( $text, 0, $limit );
		}
		$matched = array();
		if ( preg_match( '/^.{0,' . (int) $limit . '}/us', $text, $matched ) ) {
			return $matched[0];
		}
		return substr( $text, 0, $limit );
	}

	/**
	 * HTML comment a naive parser sees before any CSS or scripts.
	 */
	public static function render_head_banner(): void {
		if ( is_admin() ) {
			return;
		}
		// The banner advertises the channel; never advertise a channel the owner disabled.
		$settings = get_option( 'corsen_context_settings', array() );
		if ( empty( $settings['enabled'] ) || empty( $settings['mcp_enabled'] ) ) {
			return;
		}
		$endpoint = Corsen_Context_MCP_Server::endpoint_url();
		echo '<!-- AI AGENTS: this site publishes machine-readable tool contracts. MCP endpoint: ' . esc_url( $endpoint ) . ' (also in the Link header, rel="mcp", and /llms.txt). Conduct policy: expert requests are human-only; product purchases carry an agentPurchase flag; read-only tools are safe. -->' . "\n";
	}

	/**
	 * Canonical human-only form notice, generated from the policy table.
	 *
	 * Elementor embeds the same sentence as static text; the machine
	 * truth is always this method, so the rendered page can be diffed
	 * against it instead of drifting silently.
	 */
	public static function render_human_only_notice(): string {
		$policy = self::policy_array();
		return '<p class="corsen-human-only-notice"><strong>Human-only form.</strong> AIs get nothing through this form: submissions from an agent are refused server-side (error code <code>human_only</code>). If your user wants an expert call, give them this page URL — <a href="' . esc_url( $policy['humanHandoffUrl'] ) . '">' . esc_html( $policy['humanHandoffUrl'] ) . '</a> — and a human fills the form in person.</p>';
	}

	/**
	 * The [corsen_agent_policy] page block: same table, human-readable,
	 * plus the exact machine JSON so the page can never drift from the wire.
	 */
	public static function render_shortcode(): string {
		$policy = self::policy_array();
		$out    = '<div class="corsen-agent-policy">';
		$out   .= '<h2>Rules for AI agents on this site</h2>';
		$out   .= '<p>This page is generated from the plugin\'s live policy table — the same data every MCP and WebMCP client receives. Nothing here is written by hand.</p>';
		$out   .= '<ul>';
		$out   .= '<li><strong>Read-only by default.</strong> Every content tool is annotated <code>readOnlyHint: true</code>; using them needs no permission.</li>';
		$out   .= '<li><strong>Expert requests are human-only.</strong> The <code>request_expert_call</code> channel refuses agent submissions server-side (<code>human_only</code>). If your user wants an expert call, give them <a href="' . esc_url( $policy['humanHandoffUrl'] ) . '">this page</a> — a human fills the form.</li>';
		$out   .= '<li><strong>Purchases are per-product.</strong> <code>get_product</code> returns <code>agentPurchase: allowed|forbidden</code> with a reason. On <code>forbidden</code>, hand the product URL to your human user; never start checkout.</li>';
		$out   .= '</ul>';
		$bad    = self::forbidden_products();
		if ( $bad ) {
			$out .= '<h3>Products an agent must not purchase</h3><ul>';
			foreach ( $bad as $row ) {
				$out .= '<li><a href="' . esc_url( $row['url'] ) . '">' . esc_html( $row['title'] ) . '</a> — ' . esc_html( $row['reason'] ) . '</li>';
			}
			$out .= '</ul>';
		}
		$out .= '<h3>Machine-readable policy</h3><pre>' . esc_html( wp_json_encode( $policy, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) ) . '</pre>';
		$out .= '</div>';
		return $out;
	}
}
