<?php

use PHPUnit\Framework\TestCase;

final class SecurityTest extends TestCase {
	protected function tearDown(): void {
		$_COOKIE                        = array();
		$GLOBALS['corsen_test_filters'] = array();
	}

	public function test_normalizes_case_encoding_and_duplicate_slashes(): void {
		$this->assertSame( '/members/area', Corsen_Context_Security::normalize_path( '/Members//Area/' ) );
		$this->assertSame( '/members', Corsen_Context_Security::normalize_path( '/%6dembers' ) );
		$this->assertSame( '/members', Corsen_Context_Security::normalize_path( '/%256dembers' ) );
	}

	public function test_rejects_ambiguous_dot_segments(): void {
		$this->assertNull( Corsen_Context_Security::normalize_path( '/private/%2e%2e/public' ) );
		$this->assertNull( Corsen_Context_Security::normalize_path( "/private\0/public" ) );
		$this->assertNull( Corsen_Context_Security::normalize_path( '/private%3Fpublic' ) );
	}

	public function test_validates_browser_origins(): void {
		$this->assertTrue( Corsen_Context_Security::validate_origin( '' ) );
		$this->assertTrue( Corsen_Context_Security::validate_origin( 'https://example.com' ) );
		$this->assertTrue( Corsen_Context_Security::validate_origin( 'https://example.com:443' ) );
		$this->assertFalse( Corsen_Context_Security::validate_origin( 'https://attacker.example' ) );
		$this->assertFalse( Corsen_Context_Security::validate_origin( 'null' ) );
	}

	public function test_shared_cache_is_disabled_when_cookies_are_present(): void {
		$this->assertTrue( Corsen_Context_Security::is_shared_cache_safe() );
		$_COOKIE['membership'] = 'member';
		$this->assertFalse( Corsen_Context_Security::is_shared_cache_safe() );
	}
}
