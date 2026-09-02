<?php

use PHPUnit\Framework\TestCase;

final class SecurityTest extends TestCase {
	protected function tearDown(): void {
		$_COOKIE                        = array();
		$GLOBALS['corsen_test_filters'] = array();
		unset( $GLOBALS['corsen_test_permalink'] );
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
		$this->assertFalse( Corsen_Context_Security::validate_origin( 'https://user@example.com' ) );
	}

	public function test_shared_cache_is_disabled_when_cookies_are_present(): void {
		$this->assertTrue( Corsen_Context_Security::is_shared_cache_safe() );
		$_COOKIE['membership'] = 'member';
		$this->assertFalse( Corsen_Context_Security::is_shared_cache_safe() );
	}

	public function test_extension_urls_require_exact_origin_and_normalized_exclusions(): void {
		$GLOBALS['corsen_test_options']['corsen_context_settings'] = array(
			'exclude_paths' => "/Members/\n",
		);
		$this->assertTrue( Corsen_Context_Tool_Registry::public_url_ok( 'https://example.com/public/' ) );
		$this->assertFalse( Corsen_Context_Tool_Registry::public_url_ok( 'ftp://example.com/public/' ) );
		$this->assertFalse( Corsen_Context_Tool_Registry::public_url_ok( 'https://user@example.com/public/' ) );
		$this->assertFalse( Corsen_Context_Tool_Registry::public_url_ok( 'https://example.com:444/public/' ) );
		$this->assertFalse( Corsen_Context_Tool_Registry::public_url_ok( 'https://example.com/members/area/' ) );
		$this->assertFalse( Corsen_Context_Tool_Registry::public_url_ok( 'https://example.com/%256dembers/area/' ) );
	}

	public function test_extension_lookup_rechecks_the_canonical_permalink(): void {
		$post              = new WP_Post();
		$post->ID          = 42;
		$post->post_type   = 'page';
		$post->post_status = 'publish';
		$post->post_password = '';
		$GLOBALS['corsen_test_post']          = $post;
		$GLOBALS['corsen_test_url_to_postid'] = 42;
		$GLOBALS['corsen_test_options']['corsen_context_settings'] = array(
			'post_types'    => array( 'page' ),
			'exclude_paths' => '/members',
		);
		$GLOBALS['corsen_test_permalink'] = static function (): string {
			return 'https://example.com/members/secret/';
		};

		$this->assertNull( Corsen_Context_Tool_Registry::exposable_post( 'https://example.com/?p=42' ) );
	}
}
