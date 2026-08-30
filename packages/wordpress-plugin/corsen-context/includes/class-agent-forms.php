<?php
/**
 * Agent-callable forms (declarative WebMCP) for WordPress.
 *
 * The site owner builds a real form with the [corsen_agent_form] shortcode and
 * decides — with one settings toggle — whether in-page agents may use it. With
 * the toggle on, the form carries the WebMCP declarative attributes (toolname /
 * tooldescription / toolparamdescription) and Chrome registers it as a tool:
 * the agent fills and submits the form like a person would. With the toggle
 * off, the exact same form is human-only.
 *
 * Submissions are stored bounded and marked human or agent: the declarative
 * submit event carries `agentInvoked`, and a one-line script copies that into
 * a hidden field so the owner can see who did what.
 *
 * Spec: https://webmachinelearning.github.io/webmcp/ (declarative explainer)
 *
 * Powered by Corsen Context - Built by Corsen AI - github.com/CorsenAI/corsen-context
 *
 * @package Corsen_Context
 */

defined( 'ABSPATH' ) || exit;

class Corsen_Context_Agent_Forms {

	const OPTION_KEY      = 'corsen_context_form_submissions';
	const MAX_SUBMISSIONS = 50;

	/**
	 * Fields the shortcode can render, with their agent-facing descriptions.
	 * Whitelisting keeps the generated tool schema predictable and the stored
	 * data sanitised.
	 *
	 * @var array<string,array<string,string>>
	 */
	const FIELD_DEFINITIONS = array(
		'name'    => array(
			'type'     => 'text',
			'label'    => 'Name',
			'param'    => "Customer's full name",
			'sanitize' => 'sanitize_text_field',
		),
		'email'   => array(
			'type'     => 'email',
			'label'    => 'Email',
			'param'    => "Customer's email address",
			'sanitize' => 'sanitize_email',
		),
		'phone'   => array(
			'type'     => 'tel',
			'label'    => 'Phone',
			'param'    => "Customer's phone number",
			'sanitize' => 'sanitize_text_field',
		),
		'subject' => array(
			'type'     => 'text',
			'label'    => 'Subject',
			'param'    => 'What the request is about',
			'sanitize' => 'sanitize_text_field',
		),
		'message' => array(
			'type'     => 'textarea',
			'label'    => 'Message',
			'param'    => 'Free-text details of the request',
			'sanitize' => 'sanitize_textarea_field',
		),
	);

	/**
	 * Whether agent-callable forms are active. Declarative tools are registered
	 * by the browser (they do not need the imperative bridge), so this gates on
	 * the global switch and its own opt-in only.
	 */
	public static function is_enabled(): bool {
		$settings = get_option( 'corsen_context_settings', array() );
		$enabled  = ! empty( $settings['enabled'] ) && ! empty( $settings['agent_forms_enabled'] );

		/** Filter whether declarative agent forms carry WebMCP attributes. */
		return (bool) apply_filters( 'corsen_context_agent_forms_enabled', $enabled );
	}

	/**
	 * Parse shortcode attributes into a sanitized form spec.
	 *
	 * @param array<string,string>|string $atts Shortcode attributes.
	 * @return array<string,mixed>
	 */
	public static function parse_atts( $atts ): array {
		$atts       = is_array( $atts ) ? $atts : array();
		$tool       = sanitize_key( (string) ( $atts['tool'] ?? 'contact_request' ) );
		$field_list = array_filter(
			array_map( 'sanitize_key', explode( ',', (string) ( $atts['fields'] ?? 'name,email,message' ) ) )
		);
		$fields     = array_values( array_intersect( $field_list, array_keys( self::FIELD_DEFINITIONS ) ) );
		if ( empty( $fields ) ) {
			$fields = array( 'name', 'email', 'message' );
		}

		return array(
			'tool'        => '' !== $tool ? $tool : 'contact_request',
			'description' => sanitize_text_field( (string) ( $atts['description'] ?? 'Send a request to the site owner.' ) ),
			'fields'      => $fields,
			'submit'      => sanitize_text_field( (string) ( $atts['submit'] ?? 'Send' ) ),
			'form_id'     => sanitize_key( (string) ( $atts['form_id'] ?? $tool ) ),
		);
	}

	/**
	 * Render the shortcode form. The same markup serves both modes; the WebMCP
	 * declarative attributes are only added when the owner opted in — the
	 * contrast between the two is the owner's choice, not ours.
	 *
	 * @param array<string,string>|string $atts Shortcode attributes.
	 */
	public function render( $atts ): string {
		$spec      = self::parse_atts( $atts );
		$form_id   = $spec['form_id'];
		$element   = 'corsen-agent-form-' . $form_id;
		$agent_on  = self::is_enabled();
		// phpcs:disable WordPress.Security.NonceVerification.Recommended -- read-only display flags, no state change.
		$submitted = isset( $_GET['corsen_submitted'] ) && sanitize_key( (string) $_GET['corsen_submitted'] ) === $form_id;

		ob_start();

		if ( $submitted ) {
			$via = isset( $_GET['corsen_via'] ) && 'agent' === $_GET['corsen_via'] ? 'agent' : 'human';
			// phpcs:enable WordPress.Security.NonceVerification.Recommended
			printf(
				'<p class="corsen-agent-form-notice" style="padding:10px 14px;border-left:4px solid #00844a;background:#f0f7f0;">Request received — thank you.%s</p>',
				'agent' === $via ? ' <em>(submitted by an AI agent)</em>' : ''
			);
		}

		printf(
			'<form id="%s" method="post" action="%s"%s%s>',
			esc_attr( $element ),
			esc_url( admin_url( 'admin-post.php' ) ),
			$agent_on ? ' toolname="' . esc_attr( $spec['tool'] ) . '"' : '',
			$agent_on ? ' tooldescription="' . esc_attr( $spec['description'] ) . '"' : ''
		);

		wp_nonce_field( 'corsen_agent_form_' . $form_id, '_corsen_nonce' );
		printf( '<input type="hidden" name="action" value="corsen_agent_form" />' );
		printf( '<input type="hidden" name="form_id" value="%s" />', esc_attr( $form_id ) );
		printf( '<input type="hidden" name="corsen_via_agent" value="" />' );

		foreach ( $spec['fields'] as $field ) {
			$def     = self::FIELD_DEFINITIONS[ $field ];
			$param   = $agent_on ? ' toolparamdescription="' . esc_attr( $def['param'] ) . '"' : '';
			$fieldid = $element . '-' . $field;
			printf(
				'<p class="corsen-agent-form-field"><label for="%s">%s</label><br />',
				esc_attr( $fieldid ),
				esc_html( $def['label'] )
			);
			if ( 'textarea' === $def['type'] ) {
				printf(
					'<textarea id="%s" name="%s" rows="4" required%s></textarea></p>',
					esc_attr( $fieldid ),
					esc_attr( $field ),
					$param // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped above.
				);
			} else {
				printf(
					'<input type="%s" id="%s" name="%s" required%s /></p>',
					esc_attr( $def['type'] ),
					esc_attr( $fieldid ),
					esc_attr( $field ),
					$param // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped above.
				);
			}
		}

		printf(
			'<p><button type="submit">%s</button></p></form>',
			esc_html( $spec['submit'] )
		);

		if ( $agent_on ) {
			// Declarative submits carry SubmitEvent.agentInvoked: copy it into
			// the hidden field so the owner can tell agent and human apart.
			printf(
				'<script>(function(){var f=document.getElementById(%s);if(f){f.addEventListener("submit",function(e){if(e&&e.agentInvoked){f.querySelector("input[name=\'corsen_via_agent\']").value="1";}});}})();</script>',
				wp_json_encode( $element )
			);
		}

		return (string) ob_get_clean();
	}

	/**
	 * Append a submission, bounded to the most recent MAX_SUBMISSIONS.
	 *
	 * @param array<int,array<string,mixed>> $existing Current entries.
	 * @param array<string,mixed>            $entry    New entry.
	 * @return array<int,array<string,mixed>>
	 */
	public static function append_submission( array $existing, array $entry ): array {
		$existing[] = $entry;
		return array_slice( $existing, - self::MAX_SUBMISSIONS );
	}

	/**
	 * Admin-post.php handler. Both logged-in and anonymous visitors (and the
	 * agents actuating their forms) land here; the nonce is the boundary.
	 */
	public function handle_submit(): void {
		$form_id = isset( $_POST['form_id'] ) ? sanitize_key( wp_unslash( (string) $_POST['form_id'] ) ) : '';
		check_admin_referer( 'corsen_agent_form_' . $form_id, '_corsen_nonce' );

		$data = array();
		foreach ( self::FIELD_DEFINITIONS as $field => $def ) {
			if ( isset( $_POST[ $field ] ) ) {
				$sanitizer = $def['sanitize'];
				// Each field's whitelisted sanitizer is applied after unslashing.
				$data[ $field ] = $sanitizer( wp_unslash( (string) $_POST[ $field ] ) ); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized
			}
		}

		// Only ever compared to '1' — never stored unsanitized.
		$via_agent = isset( $_POST['corsen_via_agent'] ) && '1' === (string) wp_unslash( (string) $_POST['corsen_via_agent'] ); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized

		$existing = get_option( self::OPTION_KEY, array() );
		$entry    = array(
			'form'      => $form_id,
			'at'        => current_time( 'mysql' ),
			'via_agent' => $via_agent,
			'data'      => $data,
		);
		update_option( self::OPTION_KEY, self::append_submission( is_array( $existing ) ? $existing : array(), $entry ) );

		$back = wp_get_referer();
		$back = $back ? $back : home_url( '/' );
		wp_safe_redirect(
			add_query_arg(
				array(
					'corsen_submitted' => $form_id,
					'corsen_via'       => $via_agent ? 'agent' : 'human',
				),
				$back
			)
		);
		exit;
	}

	/**
	 * Submissions table for the settings page. Informational only: the agent
	 * marker comes from SubmitEvent.agentInvoked, a best-effort signal.
	 */
	public static function render_submissions(): void {
		$entries = get_option( self::OPTION_KEY, array() );
		if ( ! is_array( $entries ) || empty( $entries ) ) {
			return;
		}

		echo '<h3 style="margin:14px 0 6px;">Form submissions</h3>';
		echo '<table class="widefat striped" style="max-width:640px;"><thead><tr><th>When</th><th>Form</th><th>Via</th><th>Data</th></tr></thead><tbody>';
		foreach ( array_reverse( $entries ) as $entry ) {
			$data = array();
			foreach ( (array) ( $entry['data'] ?? array() ) as $key => $value ) {
				$data[] = esc_html( $key ) . ': ' . esc_html( (string) $value );
			}
			printf(
				'<tr><td>%s</td><td><code>%s</code></td><td>%s</td><td>%s</td></tr>',
				esc_html( (string) ( $entry['at'] ?? '' ) ),
				esc_html( (string) ( $entry['form'] ?? '' ) ),
				! empty( $entry['via_agent'] ) ? esc_html( '🤖 agent' ) : esc_html( 'human' ),
				implode( '<br />', $data ) // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- every item is escaped individually above.
			);
		}
		echo '</tbody></table>';
	}
}
