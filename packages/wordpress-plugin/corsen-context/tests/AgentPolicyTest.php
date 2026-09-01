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

	public function test_forbidden_without_reason_gets_a_forbidden_reason(): void {
		$GLOBALS['corsen_test_postmeta'][8][ Corsen_Context_Agent_Policy::META_KEY ] = 'forbidden';
		$policy = Corsen_Context_Agent_Policy::product_policy( 8 );
		$this->assertSame( 'forbidden', $policy['agentPurchase'] );
		$this->assertStringContainsString( 'forbids AI agents', $policy['agentPurchaseReason'] );
	}

	public function test_garbage_meta_falls_back_to_allowed_fail_closed_on_labels(): void {
		$GLOBALS['corsen_test_postmeta'][9][ Corsen_Context_Agent_Policy::META_KEY ] = 'yes-why-not';
		$policy = Corsen_Context_Agent_Policy::product_policy( 9 );
		$this->assertSame( 'allowed', $policy['agentPurchase'] );
	}

	public function test_llms_lines_render_the_live_policy(): void {
		$block = implode( "\n", Corsen_Context_Agent_Policy::llms_lines() );
		$this->assertStringContainsString( '## Agent conduct policy', $block );
		$this->assertStringContainsString( 'human_only', $block );
		$this->assertStringContainsString( 'agentPurchase', $block );
		$this->assertStringContainsString( (string) home_url( '/' ), $block );
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
	}
}
