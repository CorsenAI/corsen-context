<?php
/**
 * Owner-side agent access self-test.
 *
 * Runs same-site loopback requests through the public URL with representative
 * bot User-Agent strings. This can reveal User-Agent-based CDN/WAF rules and
 * verifies the expected llms.txt/MCP response shapes. It does not reproduce an
 * external agent's source IP, TLS fingerprint, complete headers, or behavior.
 * No token or credential is sent; only bounded status metadata is stored.
 *
 * Fail-closed: the check never runs automatically; it executes only when the
 * owner clicks the button in the Control Center, at most once per 5 minutes.
 *
 * Powered by Corsen Context - Built by Corsen AI - github.com/CorsenAI/corsen-context
 *
 * @package Corsen_Context
 */

defined( 'ABSPATH' ) || exit;

/**
 * Loopback agent-reachability probe.
 */
class Corsen_Context_Agent_Access {

	/** Option holding the last stored run. */
	public const OPTION = 'corsen_context_agent_access';

	/** Transient guarding against rapid re-runs. */
	private const LOCK = 'corsen_context_agent_access_lock';

	/** Seconds between live runs. */
	private const LOCK_TTL = 300;

	/** Per-request HTTP timeout in seconds. */
	private const TIMEOUT = 6;

	/** Response bodies are inspected then dropped, never stored. */
	private const BODY_CAP = 65536;

	/**
	 * User agents probed: the three that matter plus a plain-HTTP control.
	 *
	 * @return array<string,array<string,string>>
	 */
	public static function uas(): array {
		return array(
			'claude-bot' => array(
				'label' => 'ClaudeBot (Anthropic)',
				'ua'    => 'ClaudeBot/1.0 (+https://corsen.ai/agent-access-selftest)',
			),
			'chatgpt'    => array(
				'label' => 'ChatGPT-User (OpenAI connector)',
				'ua'    => 'ChatGPT-User/1.0 (+https://corsen.ai/agent-access-selftest)',
			),
			'gptbot'     => array(
				'label' => 'GPTBot (OpenAI crawler)',
				'ua'    => 'GPTBot/1.0 (+https://corsen.ai/agent-access-selftest)',
			),
			'plain-http' => array(
				'label' => 'Control: generic HTTP client',
				'ua'    => 'CorsenContext/agent-access-selftest',
			),
		);
	}

	/**
	 * MCP/abilities definition: agents READ the owner's latest self-test.
	 * Arguments are never accepted; the live probe itself is owner-triggered
	 * in the Control Center only, so no caller can aim this at any URL.
	 *
	 * @return array<string,mixed>
	 */
	public static function definition(): array {
		return array(
			'name'        => 'check_agent_access',
			'description' => 'Report the owner\'s latest same-site loopback test using representative ClaudeBot, ChatGPT-User and GPTBot User-Agent strings. A success means the public URL returned the expected llms.txt marker or a valid MCP tools/list result to that loopback request. It tests User-Agent-based edge rules, not full reachability from a real external agent. Read-only snapshot; no arguments; never triggers a live probe itself.',
			'inputSchema' => array(
				'type'                 => 'object',
				'properties'           => new \stdClass(),
				'additionalProperties' => false,
			),
		);
	}

	/**
	 * Only the empty argument object is valid.
	 *
	 * @param array<mixed> $arguments Raw arguments.
	 * @return array<string,mixed>|null
	 */
	public static function validate( array $arguments ): ?array {
		return array() === $arguments ? array() : null;
	}

	/**
	 * Serve the last stored run (sanitized) — pure read, no egress.
	 *
	 * @param array<string,mixed> $args Normalized arguments (always empty).
	 * @return array<string,mixed>
	 */
	public static function execute( array $args ): array {
		unset( $args );
		$run = self::last();
		if ( null === $run ) {
			return array(
				'ok'     => true,
				'result' => array(
					'ran_at'  => 0,
					'summary' => self::tally( array( 'checks' => array() ) ),
					'checks'  => array(),
					'fresh'   => false,
					'note'    => __( 'The owner has not run this self-test yet. It is triggered from the Control Center, never by tool calls.', 'corsen-context' ),
				),
			);
		}
		$run['summary'] = self::tally( $run );
		$run['fresh']   = ( time() - $run['ran_at'] ) <= 1800;
		return array(
			'ok'     => true,
			'result' => $run,
		);
	}

	/**
	 * Whether the stored last run (sanitized) or null when never run.
	 *
	 * @return array<string,mixed>|null
	 */
	public static function last(): ?array {
		$stored = get_option( self::OPTION, null );
		if ( ! is_array( $stored ) ) {
			return null;
		}
		$stored = self::sanitize_run( $stored );
		return null === $stored ? null : $stored;
	}

	/**
	 * Run the probe now. Only called from the nonce-protected Control Center
	 * action; the lock makes double-clicks and scripted spam harmless.
	 *
	 * @return array<string,mixed> Stored run shape.
	 */
	public static function run(): array {
		if ( get_transient( self::LOCK ) ) {
			$last = self::last();
			if ( is_array( $last ) ) {
				$last['note'] = __( 'Previous run is still fresh; showing it again. Try again in a few minutes.', 'corsen-context' );
				return $last;
			}
		}
		set_transient( self::LOCK, 1, self::LOCK_TTL );

		$targets = array(
			'llms' => home_url( '/llms.txt' ),
			'mcp'  => Corsen_Context_MCP_Server::endpoint_url(),
		);
		$checks  = array();
		foreach ( self::uas() as $key => $spec ) {
			foreach ( $targets as $target => $url ) {
				$checks[] = self::probe( $target, $url, $key, $spec );
			}
		}

		$run = self::sanitize_run(
			array(
				'ran_at' => time(),
				'checks' => $checks,
			)
		);
		if ( null === $run ) {
			$run = array(
				'ran_at' => time(),
				'checks' => array(),
			);
		}
		update_option( self::OPTION, $run, false );
		return $run;
	}

	/**
	 * One same-site loopback fetch through the public URL. Only absolute
	 * URLs whose host equals this site's host are ever requested (the target
	 * list is built from home_url()/endpoint_url(), this is a belt check).
	 *
	 * @param string              $target Short target key.
	 * @param string              $url    Absolute self URL.
	 * @param string              $ua_key Probe key.
	 * @param array<string,string> $spec   Label + user agent.
	 * @return array<string,mixed>
	 */
	private static function probe( string $target, string $url, string $ua_key, array $spec ): array {
		$parts = wp_parse_url( $url );
		$home  = wp_parse_url( home_url() );
		if ( empty( $parts['host'] ) || empty( $home['host'] ) || strcasecmp( $parts['host'], $home['host'] ) !== 0 ) {
			return array(
				'target'    => $target,
				'ua'        => $ua_key,
				'code'      => 0,
				'reachable' => false,
				'edge'      => 'unknown',
				'blocked'   => false,
			);
		}

		$args = array(
			'timeout'             => self::TIMEOUT,
			'redirection'         => 0,
			'sslverify'           => true,
			'headers'             => array(
				'User-Agent' => $spec['ua'],
				'Accept'     => 'text/plain, application/json;q=0.9, */*;q=0.5',
			),
			'limit_response_size' => self::BODY_CAP,
		);

		if ( 'mcp' === $target ) {
			// Speak the protocol properly: the endpoint answers 415 to a
			// form-encoded body, which would blame the CDN for our own headers.
			$args['headers']['Content-Type']         = 'application/json';
			$args['headers']['Accept']               = 'application/json, text/event-stream';
			$args['headers']['MCP-Protocol-Version'] = '2025-11-25';
			$response                                = wp_remote_post(
				$url,
				array_merge(
					$args,
					array(
						'body' => wp_json_encode(
							array(
								'jsonrpc' => '2.0',
								'id'      => 1,
								'method'  => 'tools/list',
							)
						),
					)
				)
			);
		} else {
			$response = wp_remote_get( $url, $args );
		}

		$code          = is_wp_error( $response ) ? 0 : (int) wp_remote_retrieve_response_code( $response );
		$body          = is_wp_error( $response ) ? '' : (string) wp_remote_retrieve_body( $response );
		$server_header = is_wp_error( $response ) ? '' : strtolower( (string) wp_remote_retrieve_header( $response, 'server' ) );
		$cf_ray        = is_wp_error( $response ) ? '' : (string) wp_remote_retrieve_header( $response, 'cf-ray' );

		// A status code alone is not success: a challenge page, login page, 404,
		// or JSON-RPC error proves only that some server answered. Validate the
		// expected bounded surface before marking it reachable.
		$answered = 200 === $code && self::valid_surface_body( $target, $body );
		$blocked  = in_array( $code, array( 401, 403, 406, 429, 503 ), true );
		if ( $blocked && false === strpos( $server_header, 'cloudflare' ) && '' === $cf_ray && 0 !== $code ) {
			// Origin refused, not the edge: still "agents cannot get through",
			// but the fix hint differs.
			$blocked = false;
		}

		return array(
			'target'    => $target,
			'ua'        => $ua_key,
			'code'      => $code,
			'reachable' => $answered,
			'edge'      => ( false !== strpos( $server_header, 'cloudflare' ) || '' !== $cf_ray ) ? 'cloudflare' : 'direct',
			'blocked'   => $blocked,
		);
	}

	/**
	 * Confirm that a 200 response is the requested agent surface, not an
	 * intermediary challenge or arbitrary HTML page.
	 */
	private static function valid_surface_body( string $target, string $body ): bool {
		if ( 'llms' === $target ) {
			return str_contains( $body, '> START HERE for AI agents:' )
				&& str_contains( $body, '## Agent conduct policy' );
		}
		if ( 'mcp' !== $target ) {
			return false;
		}
		$decoded = json_decode( $body, true );
		return is_array( $decoded )
			&& '2.0' === ( $decoded['jsonrpc'] ?? null )
			&& isset( $decoded['result']['tools'] )
			&& is_array( $decoded['result']['tools'] );
	}

	/**
	 * Validate and clamp a stored run before it is rendered anywhere.
	 *
	 * @param array<mixed>|null $run Raw stored value.
	 * @return array<string,mixed>|null Sanitized, or null when untrusted garbage.
	 */
	public static function sanitize_run( $run ): ?array {
		if ( ! is_array( $run ) || ! isset( $run['ran_at'], $run['checks'] ) ) {
			return null;
		}
		$ran_at = (int) $run['ran_at'];
		if ( $ran_at <= 0 ) {
			return null;
		}
		if ( ! is_array( $run['checks'] ) ) {
			return null;
		}
		$known_uas = array_keys( self::uas() );
		$checks    = array();
		foreach ( array_slice( $run['checks'], 0, 16 ) as $check ) {
			if ( ! is_array( $check ) ) {
				continue;
			}
			$target = in_array( (string) ( $check['target'] ?? '' ), array( 'llms', 'mcp' ), true ) ? (string) $check['target'] : '';
			$ua_key = in_array( (string) ( $check['ua'] ?? '' ), $known_uas, true ) ? (string) $check['ua'] : '';
			if ( '' === $target || '' === $ua_key ) {
				continue;
			}
			$checks[] = array(
				'target'    => $target,
				'ua'        => $ua_key,
				'code'      => max( 0, min( 599, (int) ( $check['code'] ?? 0 ) ) ),
				'reachable' => ! empty( $check['reachable'] ),
				'edge'      => in_array( (string) ( $check['edge'] ?? '' ), array( 'cloudflare', 'direct' ), true ) ? (string) $check['edge'] : 'unknown',
				'blocked'   => ! empty( $check['blocked'] ),
			);
		}
		$out = array(
			'ran_at' => $ran_at,
			'checks' => $checks,
		);
		if ( isset( $run['note'] ) && is_string( $run['note'] ) && '' !== trim( $run['note'] ) ) {
			$out['note'] = substr( wp_strip_all_tags( $run['note'] ), 0, 200 );
		}
		return $out;
	}

	/**
	 * Machine-readable summary used by the Control Center badge.
	 *
	 * @param array<string,mixed> $run Sanitized run.
	 * @return array<string,int>
	 */
	public static function tally( array $run ): array {
		$tally = array(
			'total'     => 0,
			'reachable' => 0,
			'blocked'   => 0,
		);
		foreach ( $run['checks'] as $check ) {
			++$tally['total'];
			if ( $check['blocked'] ) {
				++$tally['blocked'];
			} elseif ( $check['reachable'] ) {
				++$tally['reachable'];
			}
		}
		return $tally;
	}
}
