<?php
/**
 * Agent-callable forms: the owner opts in per site, the same form is
 * human-only otherwise, and submissions are bounded and attributed.
 *
 * @package Corsen_Context
 */

use PHPUnit\Framework\TestCase;

final class AgentFormsTest extends TestCase {

	protected function tearDown(): void {
		$GLOBALS['corsen_test_options'] = array();
		$GLOBALS['corsen_test_filters'] = array();
	}

	private function enable(): void {
		$GLOBALS['corsen_test_options']['corsen_context_settings'] = array(
			'enabled'             => true,
			'agent_forms_enabled' => true,
		);
	}

	public function test_forms_are_off_until_the_owner_opts_in(): void {
		$this->assertFalse( Corsen_Context_Agent_Forms::is_enabled() );

		$GLOBALS['corsen_test_options']['corsen_context_settings'] = array( 'enabled' => true );
		$this->assertFalse(
			Corsen_Context_Agent_Forms::is_enabled(),
			'The global switch alone must not expose forms to agents.'
		);

		$this->enable();
		$this->assertTrue( Corsen_Context_Agent_Forms::is_enabled() );
	}

	public function test_filter_can_veto_agent_forms(): void {
		$this->enable();
		$GLOBALS['corsen_test_filters']['corsen_context_agent_forms_enabled'] = static function () {
			return false;
		};
		$this->assertFalse( Corsen_Context_Agent_Forms::is_enabled() );
	}

	public function test_same_form_is_human_only_when_disabled(): void {
		$html = ( new Corsen_Context_Agent_Forms() )->render(
			array(
				'tool'        => 'quote_request',
				'description' => 'Request a quote.',
			)
		);
		$this->assertStringContainsString( '<form', $html );
		$this->assertStringNotContainsString( 'toolname', $html );
		$this->assertStringNotContainsString( 'toolparamdescription', $html );
	}

	public function test_enabled_form_carries_the_declarative_attributes(): void {
		$this->enable();
		$html = ( new Corsen_Context_Agent_Forms() )->render(
			array(
				'tool'        => 'quote_request',
				'description' => 'Request a quote for an Aurora Kit.',
				'fields'      => 'name,email,message',
			)
		);
		$this->assertStringContainsString( 'toolname="quote_request"', $html );
		$this->assertStringContainsString( 'tooldescription="Request a quote for an Aurora Kit."', $html );
		$this->assertSame( 3, substr_count( $html, 'toolparamdescription=' ) );
		// The agent marker script copies SubmitEvent.agentInvoked into the form.
		$this->assertStringContainsString( 'agentInvoked', $html );
		$this->assertStringContainsString( 'corsen_via_agent', $html );
	}

	public function test_unknown_fields_are_dropped_from_the_spec(): void {
		$spec = Corsen_Context_Agent_Forms::parse_atts( array( 'fields' => 'name,hacker,email' ) );
		$this->assertSame( array( 'name', 'email' ), $spec['fields'] );
	}

	public function test_tool_name_is_sanitized(): void {
		$spec = Corsen_Context_Agent_Forms::parse_atts( array( 'tool' => 'Bad Name!<script>' ) );
		$this->assertSame( 'badnamescript', $spec['tool'] );
	}

	public function test_submissions_are_bounded_to_the_latest_fifty(): void {
		$entries = array();
		for ( $i = 0; $i < 60; $i++ ) {
			$entries = Corsen_Context_Agent_Forms::append_submission(
				$entries,
				array(
					'form'      => 'quote_request',
					'at'        => '2026-08-30 10:00:00',
					'via_agent' => false,
					'data'      => array( 'name' => "n$i" ),
				)
			);
		}
		$this->assertCount( Corsen_Context_Agent_Forms::MAX_SUBMISSIONS, $entries );
		$this->assertSame( 'n59', $entries[49]['data']['name'] );
	}

	public function test_submissions_render_distinguishes_agents(): void {
		$GLOBALS['corsen_test_options'][ Corsen_Context_Agent_Forms::OPTION_KEY ] = array(
			array(
				'form'      => 'quote_request',
				'at'        => '2026-08-30 10:00:00',
				'via_agent' => true,
				'data'      => array( 'name' => 'Bot' ),
			),
			array(
				'form'      => 'quote_request',
				'at'        => '2026-08-30 10:01:00',
				'via_agent' => false,
				'data'      => array( 'name' => 'Alice' ),
			),
		);
		ob_start();
		Corsen_Context_Agent_Forms::render_submissions();
		$html = (string) ob_get_clean();
		$this->assertStringContainsString( 'agent', $html );
		$this->assertStringContainsString( 'human', $html );
		$this->assertStringContainsString( 'quote_request', $html );
	}
}
