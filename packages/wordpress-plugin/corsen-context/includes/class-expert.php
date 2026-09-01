<?php
/**
 * Request_expert_call: the site's contact form as an agent-callable tool.
 *
 * The deliberate counter-example of "agents can only read": a WRITE tool
 * that is fail-closed three times over — the tool must be checked in
 * enabled_tools, the owner must set a destination email, and every call is
 * rate-limited, size-bounded and stored as a private post that is never
 * public. Nothing is echoed back to the caller.
 *
 * Powered by Corsen Context - Built by Corsen AI - github.com/CorsenAI/corsen-context
 *
 * @package Corsen_Context
 */

defined( 'ABSPATH' ) || exit;

/**
 * Expert request tool.
 */
class Corsen_Context_Expert {

	public const CPT = 'cc_expert_request';

	/** Per-IP submissions allowed per hour. */
	private const PER_IP_PER_HOUR = 5;

	/** Total kept submissions before the inbox reports full (owner prunes in Control Center). */
	private const MAX_KEPT = 500;

	/** Patterns that mean "the caller is about to leak secrets into a public-facing tool". */
	private const SECRET_PATTERNS = '/(api[-_ ]?key|secret[-_ ]?key|access[-_ ]?token|private[-_ ]?key|pass(word|phrase)|mot[- ]?de[- ]?passe|cl[ée][- ]?api|jeton|token|BEGIN[ A-Z]*PRIVATE|sk-[A-Za-z0-9_-]{12,}|gh[po]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_-]{20,}|xox[bap]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16})/i';

	/**
	 * Register the private storage post type when the feature is configured on.
	 */
	public static function init(): void {
		add_action( 'init', array( __CLASS__, 'register_post_type' ), 5 );
	}

	/**
	 * Private, invisible post type holding submissions.
	 */
	public static function register_post_type(): void {
		if ( ! self::configured() ) {
			return;
		}
		register_post_type(
			self::CPT,
			array(
				'label'               => __( 'Expert requests', 'corsen-context' ),
				'public'              => false,
				'publicly_queryable'  => false,
				'show_ui'             => false,
				'show_in_menu'        => false,
				'show_in_rest'        => false,
				'exclude_from_search' => true,
				'supports'            => array( 'title', 'editor' ),
				'capability_type'     => 'post',
			)
		);
	}

	/**
	 * Owner configuration gate: feature toggle + valid destination email.
	 */
	public static function configured(): bool {
		$settings = get_option( 'corsen_context_settings', array() );
		return ! empty( $settings['expert_enabled'] ) && (bool) sanitize_email( (string) ( $settings['expert_email'] ?? '' ) );
	}

	/**
	 * Public contract for tools/list.
	 *
	 * @return array<string,mixed>
	 */
	public static function definition(): array {
		return array(
			'name'        => 'request_expert_call',
			'description' => 'HUMANS ONLY — an AI agent must NOT call this tool. The server refuses every agent submission (error code human_only); if your user wants an expert call, hand them the page URL so they submit the form themselves. Submissions are stored privately for the site owner; nothing on the site is published or changed. Never include passwords, tokens or API keys in any field.',
			'inputSchema' => array(
				'type'                 => 'object',
				'properties'           => array(
					'name'    => array(
						'type'        => 'string',
						'minLength'   => 1,
						'maxLength'   => 120,
						'description' => 'Name of the person requesting the call.',
					),
					'email'   => array(
						'type'        => 'string',
						'minLength'   => 3,
						'maxLength'   => 190,
						'description' => 'Reply-to email address.',
					),
					'website' => array(
						'type'        => 'string',
						'maxLength'   => 400,
						'description' => 'Their website URL, if any.',
					),
					'stack'   => array(
						'type'        => 'string',
						'maxLength'   => 80,
						'description' => 'Their technology stack, short text (e.g. "WordPress + WooCommerce").',
					),
					'message' => array(
						'type'        => 'string',
						'minLength'   => 1,
						'maxLength'   => 2000,
						'description' => 'What they want to discuss. Plain text, no secrets.',
					),
				),
				'required'             => array( 'name', 'email', 'message' ),
				'additionalProperties' => false,
			),
		);
	}

	/**
	 * Strict field validation, secrets rejected before anything is stored.
	 *
	 * @param array<mixed> $arguments Raw arguments.
	 * @return array<string,string>|null Normalized, or null on any violation.
	 */
	public static function validate( array $arguments ): ?array {
		foreach ( array_keys( $arguments ) as $key ) {
			if ( ! in_array( $key, array( 'name', 'email', 'website', 'stack', 'message' ), true ) ) {
				return null;
			}
		}
		$get   = static function ( string $key, int $max ) use ( $arguments ): ?string {
			if ( ! isset( $arguments[ $key ] ) || ! is_string( $arguments[ $key ] ) ) {
				return null;
			}
			$value = trim( $arguments[ $key ] );
			return strlen( $value ) > $max ? null : $value;
		};
		$name  = $get( 'name', 120 );
		$email = $get( 'email', 190 );
		$msg   = $get( 'message', 2000 );
		if ( null === $name || '' === $name || null === $msg || '' === $msg ) {
			return null;
		}
		$site  = $get( 'website', 400 ) ?? '';
		$stack = $get( 'stack', 80 ) ?? '';
		if ( null === $site || null === $stack ) {
			return null;
		}
		if ( null === $email || ! is_email( $email ) ) {
			return null;
		}
		$email = sanitize_email( $email );
		if ( '' === $email ) {
			return null;
		}
		if ( '' !== $site ) {
			$parts = wp_parse_url( $site );
			if ( ! is_array( $parts ) || ! isset( $parts['scheme'] ) || ! in_array( $parts['scheme'], array( 'http', 'https' ), true ) ) {
				return null;
			}
			$site = esc_url_raw( $site );
		}
		foreach ( array( $name, $email, $site, $stack, $msg ) as $value ) {
			if ( preg_match( self::SECRET_PATTERNS, $value ) ) {
				return null;
			}
		}
		return array(
			'name'    => sanitize_text_field( $name ),
			'email'   => $email,
			'website' => $site,
			'stack'   => sanitize_text_field( $stack ),
			'message' => sanitize_textarea_field( $msg ),
		);
	}

	/**
	 * MCP/WebMCP intake: refused by policy since 1.5.12 (human-only).
	 *
	 * @param array<string,string> $args Normalized args (validated, unused).
	 * @return array<string,mixed> Shape ['ok'=>false,'error'=>...,'code'=>'human_only'].
	 */
	public static function execute( array $args ): array {
		// HUMANS ONLY since 1.5.12 (governed-agent demo + honest governance):
		// the expert intake is an offer to people. The tool stays advertised
		// so agents can READ the rule; every agent call is refused here with
		// an instructive receipt, before any throttle or storage side effect.
		return self::fail(
			'This channel is for humans only. An AI agent must not submit expert requests: give your user this page instead and let them fill the form — ' . Corsen_Context_Agent_Policy::human_handoff_url(),
			'human_only',
			array(
				'policy'     => 'request_expert_call=human-only',
				'handoffUrl' => Corsen_Context_Agent_Policy::human_handoff_url(),
			)
		);
	}

	/**
	 * Store + notify. Never leaks stored data back to the caller.
	 *
	 * Kept for the human HTML form path and future owner-approved delegation;
	 * no MCP/WebMCP call reaches it (see execute()).
	 *
	 * @param array<string,string> $args Normalized args.
	 * @return array<string,mixed> Shape ['ok'=>bool,'result'=>mixed,'error'=>string].
	 */
	public static function store_submission( array $args ): array {
		if ( ! self::configured() ) {
			return self::fail( 'The site owner has not configured a destination for expert requests.', 'not_configured' );
		}
		$retry_after = self::throttle_retry_after();
		if ( $retry_after > 0 ) {
			return self::fail( 'Too many requests from this address recently. Retry in about ' . $retry_after . ' seconds, or use the contact form on the page.', 'rate_limited', array( 'retry_after' => $retry_after ) );
		}
		if ( self::kept_count() >= self::MAX_KEPT ) {
			return self::fail( 'The site\'s expert-request inbox is currently full. Use the visible contact form or try again later.', 'inbox_full' );
		}

		$post_id = wp_insert_post(
			array(
				'post_type'    => self::CPT,
				'post_status'  => 'private',
				'post_title'   => $args['name'],
				'post_content' => $args['message'],
			),
			true
		);
		if ( ! is_numeric( $post_id ) || $post_id <= 0 ) {
			return self::fail( 'The request could not be stored. Use the contact form on the page instead.' );
		}
		update_post_meta( $post_id, '_cc_expert_email', $args['email'] );
		update_post_meta( $post_id, '_cc_expert_website', $args['website'] );
		update_post_meta( $post_id, '_cc_expert_stack', $args['stack'] );
		update_post_meta( $post_id, '_cc_expert_status', 'new' );

		$settings = get_option( 'corsen_context_settings', array() );
		$dest     = sanitize_email( (string) ( $settings['expert_email'] ?? '' ) );
		if ( ! empty( $settings['expert_notify'] ) && '' !== $dest ) {
			$body = 'New expert request on ' . home_url() . "\n\nFrom: {$args['name']} <{$args['email']}>\nWebsite: {$args['website']}\nStack: {$args['stack']}\n\nMessage:\n{$args['message']}\n";
			wp_mail(
				$dest,
				/* translators: %s: site name */
				sprintf( __( '[%s] New expert request', 'corsen-context' ), wp_strip_all_tags( get_bloginfo( 'name' ) ) ),
				$body
			);
		}

		return array(
			'ok'     => true,
			'result' => array(
				'queued' => true,
				'note'   => 'The site owner received the request. Nothing was published on the site.',
			),
		);
	}

	/**
	 * Fixed-window throttle: PER_IP_PER_HOUR submissions per hour per salted IP.
	 */
	private static function throttle_retry_after(): int {
		$ip    = Corsen_Context_Security::get_client_ip();
		$key   = 'corsen_expt_' . substr( hash_hmac( 'sha256', $ip, wp_salt( 'auth' ) ), 0, 32 );
		$count = (int) get_transient( $key );
		if ( $count >= self::PER_IP_PER_HOUR ) {
			$start = (int) get_transient( $key . '_start' );
			if ( $start <= 0 ) {
				$start = time();
				set_transient( $key . '_start', $start, HOUR_IN_SECONDS );
			}
			return max( 60, ( $start + HOUR_IN_SECONDS ) - time() );
		}
		if ( 0 === $count ) {
			set_transient( $key . '_start', time(), HOUR_IN_SECONDS );
		}
		set_transient( $key, $count + 1, HOUR_IN_SECONDS );
		return 0;
	}

	/**
	 * How many submissions are currently kept (bounded, cached 10 min).
	 */
	private static function kept_count(): int {
		$cached = get_transient( 'corsen_expert_count' );
		if ( is_numeric( $cached ) ) {
			return (int) $cached;
		}
		$query = new WP_Query(
			array(
				'post_type'      => self::CPT,
				'post_status'    => 'private',
				'posts_per_page' => 1,
				'fields'         => 'ids',
				'no_found_rows'  => false,
			)
		);
		$total = (int) $query->found_posts;
		set_transient( 'corsen_expert_count', $total, 600 );
		return $total;
	}

	/**
	 * Fail shape.
	 *
	 * @param string $message Agent-readable reason (never user data).
	 * @param string $code    Machine-readable error code.
	 * @param array  $extra   Extra machine fields such as retry_after.
	 * @return array<string,mixed>
	 */
	private static function fail( string $message, string $code = 'request_failed', array $extra = array() ): array {
		return array_merge(
			array(
				'ok'    => false,
				'error' => $message,
				'code'  => $code,
			),
			$extra
		);
	}
}
