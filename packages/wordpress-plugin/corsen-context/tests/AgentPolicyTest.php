<?php
/**
 * Governed-agent policy (1.5.12): single-source policy table, product
 * policy default/override, llms.txt rendering, and the human-only expert
 * intake refusal that must have zero side effects.
 *
 * @package Corsen_Context
 */

class AgentPolicyTest extends WP_UnitTestCase {

	protected function setUp(): void {
		parent::setUp();
		$GLOBALS['corsen_test_postmeta'] = array();
		$GLOBALS['corsen_test_inserts']  = array();
		$GLOBALS['corsen_test_options']  = array();
		$GLOBALS['corsen_test_transients'] = array();
		$GLOBALS['corsen_test_can_manage'] = false;
		$_POST = array();
		unset( $GLOBALS['corsen_test_queried_object_id'], $GLOBALS['corsen_test_permalink'], $GLOBALS['corsen_test_url_to_postid'] );
	}

	public function test_product_policy_defaults_to_allowed_with_reason(): void {
		$policy = Corsen_Context_Agent_Policy::product_policy( 4242 );
		$this->assertSame( 'allowed', $policy['agentPurchase'] );
		$this->assertStringContainsString( 'no agent-purchase restriction', $policy['agentPurchaseReason'] );
	}

	public function test_owner_forbidden_meta_wins_and_custom_reason_is_preserved(): void {
		$GLOBALS['corsen_test_postmeta'][7][ Corsen_Context_Agent_Policy::META_KEY ]        = 'forbidden';
		$GLOBALS['corsen_test_postmeta'][7][ Corsen_Context_Agent_Policy::META_REASON_KEY ] = 'License assignment needs a human.';
		$policy = Corsen_Context_Agent_Policy::product_policy( 7 );
		$this->assertSame( 'forbidden', $policy['agentPurchase'] );
		$this->assertSame( 'License assignment needs a human.', $policy['agentPurchaseReason'] );
	}

	public function test_policy_meta_sanitizers_are_bounded_and_fail_safe(): void {
		$this->assertSame( 'allowed', Corsen_Context_Agent_Policy::sanitize_purchase_state( 'allowed' ) );
		$this->assertSame( 'forbidden', Corsen_Context_Agent_Policy::sanitize_purchase_state( 'unexpected' ) );
		$reason = Corsen_Context_Agent_Policy::sanitize_purchase_reason( '<b>' . str_repeat( 'é', 500 ) . '</b>' );
		$this->assertLessThanOrEqual( 400, mb_strlen( $reason ) );
		$this->assertSame( 1, preg_match( '//u', $reason ) );
		$this->assertStringNotContainsString( '<b>', $reason );
	}

	public function test_product_policy_sanitizes_oversized_stored_reason_on_read(): void {
		$GLOBALS['corsen_test_postmeta'][17][ Corsen_Context_Agent_Policy::META_KEY ]        = 'forbidden';
		$GLOBALS['corsen_test_postmeta'][17][ Corsen_Context_Agent_Policy::META_REASON_KEY ] = '<script>' . str_repeat( 'é', 500 );
		$policy = Corsen_Context_Agent_Policy::product_policy( 17 );
		$this->assertSame( 'forbidden', $policy['agentPurchase'] );
		$this->assertLessThanOrEqual( 400, mb_strlen( $policy['agentPurchaseReason'] ) );
		$this->assertStringNotContainsString( '<script>', $policy['agentPurchaseReason'] );
	}

	public function test_forbidden_without_reason_gets_a_forbidden_reason(): void {
		$GLOBALS['corsen_test_postmeta'][8][ Corsen_Context_Agent_Policy::META_KEY ] = 'forbidden';
		$policy = Corsen_Context_Agent_Policy::product_policy( 8 );
		$this->assertSame( 'forbidden', $policy['agentPurchase'] );
		$this->assertStringContainsString( 'forbids AI agents', $policy['agentPurchaseReason'] );
	}

	public function test_garbage_meta_fails_closed_until_owner_review(): void {
		$GLOBALS['corsen_test_postmeta'][9][ Corsen_Context_Agent_Policy::META_KEY ] = 'yes-why-not';
		$policy = Corsen_Context_Agent_Policy::product_policy( 9 );
		$this->assertSame( 'forbidden', $policy['agentPurchase'] );
		$this->assertStringContainsString( 'invalid', $policy['agentPurchaseReason'] );
	}

	public function test_llms_lines_render_the_live_policy(): void {
		$block = implode( "\n", Corsen_Context_Agent_Policy::llms_lines( array( 'get_product', 'request_expert_call' ) ) );
		$this->assertStringContainsString( '## Agent conduct policy', $block );
		$this->assertStringContainsString( 'human_only', $block );
		$this->assertStringContainsString( 'agentPurchase', $block );
		$this->assertStringContainsString( (string) home_url( '/' ), $block );
	}

	public function test_llms_policy_does_not_advertise_disabled_extension_tools(): void {
		$block = implode( "\n", Corsen_Context_Agent_Policy::llms_lines() );
		$this->assertStringNotContainsString( 'request_expert_call', $block );
		$this->assertStringNotContainsString( 'get_product', $block );
		$this->assertStringContainsString( 'read-only', $block );
	}

	public function test_expert_definition_says_humans_only(): void {
		$def = Corsen_Context_Expert::definition();
		$this->assertStringContainsString( 'HUMANS ONLY', $def['description'] );
		$this->assertStringNotContainsString( "on the user's behalf", $def['description'] );
	}

	public function test_expert_execute_refuses_every_agent_call_with_zero_side_effects(): void {
		$args = array(
			'name'    => 'Zealous Agent',
			'email'   => 'agent@example.test',
			'website' => '',
			'stack'   => '',
			'message' => 'I would like to buy the audit for my user.',
		);
		$out = Corsen_Context_Expert::execute( $args );
		$this->assertFalse( $out['ok'] );
		$this->assertSame( 'human_only', $out['code'] ?? false );
		$this->assertStringContainsString( 'humans only', $out['error'] );
		$this->assertNotEmpty( $out['handoffUrl'] ?? '' );
		// No storage, no mail, no throttle consumed: refusal happens first.
		$this->assertCount( 0, $GLOBALS['corsen_test_inserts'] );
		$this->assertCount( 0, $GLOBALS['corsen_test_mails'] ?? array() );
	}

	public function test_policy_array_shape(): void {
		$policy = Corsen_Context_Agent_Policy::policy_array();
		$this->assertTrue( $policy['readOnlyByDefault'] );
		$this->assertContains( 'request_expert_call', $policy['humanOnlyTools'] );
		$this->assertStringStartsWith( 'http', $policy['humanHandoffUrl'] );
		$this->assertStringNotContainsString( 'coupon', strtolower( $policy['enforcement'] ) );
	}

	public function test_human_only_notice_is_generated_from_the_policy(): void {
		$notice = Corsen_Context_Agent_Policy::render_human_only_notice();
		$this->assertStringContainsString( 'Human-only form.', $notice );
		$this->assertStringContainsString( 'human_only', $notice );
		$this->assertStringContainsString( (string) home_url( '/' ), $notice );
		$this->assertStringContainsString( 'must not submit this browser form', $notice );
	}

	public function test_human_handoff_uses_the_page_rendering_the_shortcode(): void {
		$GLOBALS['corsen_test_queried_object_id'] = 77;
		$GLOBALS['corsen_test_url_to_postid']     = 77;
		$GLOBALS['corsen_test_permalink']         = static function (): string {
			return home_url( '/contact/' );
		};
		$this->assertSame( home_url( '/contact/' ), Corsen_Context_Agent_Policy::human_handoff_url() );
		$this->assertStringContainsString( home_url( '/contact/' ), Corsen_Context_Agent_Policy::render_human_only_notice() );
	}

	public function test_configured_handoff_wins_outside_a_rendered_page(): void {
		$GLOBALS['corsen_test_queried_object_id'] = 0;
		$GLOBALS['corsen_test_options']['corsen_context_settings'] = array(
			'expert_handoff_url' => home_url( '/contact/#expert-form' ),
		);
		$this->assertSame( home_url( '/contact/#expert-form' ), Corsen_Context_Agent_Policy::human_handoff_url() );
		$this->assertSame( '', Corsen_Context_Agent_Policy::sanitize_handoff_url( 'https://foreign.example/contact/' ) );
	}

	public function test_head_banner_only_when_master_and_mcp_enabled(): void {
		$GLOBALS['corsen_test_options']['corsen_context_settings'] = array( 'enabled' => true, 'mcp_enabled' => false );
		ob_start();
		Corsen_Context_Agent_Policy::render_head_banner();
		$off = (string) ob_get_clean();
		$this->assertSame( '', $off, 'banner must not advertise a channel the owner disabled' );

		$GLOBALS['corsen_test_options']['corsen_context_settings'] = array( 'enabled' => false, 'mcp_enabled' => true );
		ob_start();
		Corsen_Context_Agent_Policy::render_head_banner();
		$off2 = (string) ob_get_clean();
		$this->assertSame( '', $off2, 'banner must not advertise when the master switch is off' );

		$GLOBALS['corsen_test_options']['corsen_context_settings'] = array(
			'enabled'             => true,
			'mcp_enabled'         => true,
			'enabled_tools'       => array( 'search_site', 'request_expert_call' ),
			'expert_enabled'      => true,
			'expert_handoff_url'  => home_url( '/contact/' ),
		);
		ob_start();
		Corsen_Context_Agent_Policy::render_head_banner();
		$on = (string) ob_get_clean();
		unset( $GLOBALS['corsen_test_options']['corsen_context_settings'] );
		$this->assertStringContainsString( 'AI AGENTS', $on );
		$this->assertStringContainsString( 'human-only', $on );
	}

	public function test_owner_form_writes_state_and_truncates_multibyte_reason(): void {
		$GLOBALS['corsen_test_post_types'][431] = 'product';
		$long                                   = str_repeat( 'accréditation éè ☂ — ', 100 );
		Corsen_Context_Agent_Policy::handle_owner_form_submission(
			array( 431 => array( 'state' => 'forbidden', 'reason' => $long ) )
		);
		$meta   = $GLOBALS['corsen_test_postmeta'][431];
		$stored = (string) $meta[ Corsen_Context_Agent_Policy::META_REASON_KEY ];
		$this->assertSame( 'forbidden', $meta[ Corsen_Context_Agent_Policy::META_KEY ] );
		$this->assertLessThanOrEqual( 400, function_exists( 'mb_strlen' ) ? mb_strlen( $stored ) : strlen( $stored ) );
		$this->assertSame( 1, preg_match( '//u', $stored ), 'truncation must not split a multibyte character' );
		$this->assertStringStartsWith( 'accréditation', $stored );
	}

	public function test_owner_form_allowed_state_clears_policy_meta(): void {
		$GLOBALS['corsen_test_post_types'][432] = 'product';
		$GLOBALS['corsen_test_postmeta'][432]   = array(
			Corsen_Context_Agent_Policy::META_KEY        => 'forbidden',
			Corsen_Context_Agent_Policy::META_REASON_KEY => 'was forbidden',
		);
		$GLOBALS['corsen_test_deleted_meta']    = array();
		Corsen_Context_Agent_Policy::handle_owner_form_submission(
			array( 432 => array( 'state' => 'allowed', 'reason' => 'ignored' ) )
		);
		$deleted = array_map(
			static function ( array $row ): array {
				return array( (int) $row[0], (string) $row[1] );
			},
			$GLOBALS['corsen_test_deleted_meta']
		);
		$this->assertContains( array( 432, Corsen_Context_Agent_Policy::META_KEY ), $deleted );
		$this->assertContains( array( 432, Corsen_Context_Agent_Policy::META_REASON_KEY ), $deleted );
	}

	public function test_product_editor_policy_save_is_nonce_and_capability_protected(): void {
		$post              = new \WP_Post();
		$post->ID          = 500;
		$post->post_type   = 'product';
		$post->post_status = 'publish';
		$_POST = array(
			'corsen_context_product_policy_nonce'       => 'testnonce',
			'corsen_context_agent_purchase_state'       => 'forbidden',
			'corsen_context_agent_purchase_reason'      => 'License assignment requires a human.',
		);
		Corsen_Context_Agent_Policy::save_product_metabox( 500, $post );
		$this->assertArrayNotHasKey( 500, $GLOBALS['corsen_test_postmeta'], 'unauthorized saves must not change policy' );

		$GLOBALS['corsen_test_can_manage'] = true;
		Corsen_Context_Agent_Policy::save_product_metabox( 500, $post );
		$this->assertSame( 'forbidden', $GLOBALS['corsen_test_postmeta'][500][ Corsen_Context_Agent_Policy::META_KEY ] );
		$this->assertSame( 'License assignment requires a human.', $GLOBALS['corsen_test_postmeta'][500][ Corsen_Context_Agent_Policy::META_REASON_KEY ] );

		$_POST['corsen_context_product_policy_nonce'] = 'wrong';
		$_POST['corsen_context_agent_purchase_state'] = 'allowed';
		Corsen_Context_Agent_Policy::save_product_metabox( 500, $post );
		$this->assertSame( 'forbidden', $GLOBALS['corsen_test_postmeta'][500][ Corsen_Context_Agent_Policy::META_KEY ], 'invalid nonce must preserve prior policy' );
	}
}
