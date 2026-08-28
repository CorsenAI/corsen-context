<?php
/**
 * The tool manifest is the single agent-facing contract. The WordPress
 * runtime implements it independently of the TypeScript core, so this test
 * is what keeps the two in sync: if the plugin drifts from the manifest,
 * CI fails here.
 *
 * @package Corsen_Context
 */

use PHPUnit\Framework\TestCase;

final class ToolManifestParityTest extends TestCase {

	/** @var array<string,mixed> */
	private static array $manifest = array();

	public static function setUpBeforeClass(): void {
		$path = dirname( __DIR__, 4 ) . '/tools.manifest.json';
		self::assertFileExists( $path, 'tools.manifest.json must ship at the repository root.' );
		self::$manifest = json_decode( (string) file_get_contents( $path ), true, 512, JSON_THROW_ON_ERROR );
	}

	protected function tearDown(): void {
		$GLOBALS['corsen_test_options'] = array();
		$GLOBALS['corsen_test_filters'] = array();
	}

	/**
	 * Normalise a definition so stdClass and empty maps compare equal
	 * across the JSON boundary.
	 *
	 * @param mixed $value Value to normalise.
	 * @return mixed
	 */
	private function normalize( $value ) {
		return json_decode( (string) json_encode( $value ), true, 512, JSON_THROW_ON_ERROR );
	}

	/** @return array<int,array<string,mixed>> */
	private function implemented_tools(): array {
		$server = new Corsen_Context_MCP_Server();
		$method = new ReflectionMethod( $server, 'get_tool_definitions' );
		$method->setAccessible( true );
		return $this->normalize( $method->invoke( $server ) );
	}

	public function test_manifest_declares_supported_version(): void {
		$this->assertSame( 1, self::$manifest['version'] );
	}

	public function test_plugin_implements_exactly_the_manifest_tools_in_order(): void {
		$expected = array_column( self::$manifest['tools'], 'name' );
		$actual   = array_column( $this->implemented_tools(), 'name' );
		$this->assertSame( $expected, $actual );
	}

	public function test_plugin_matches_manifest_descriptions_and_schemas(): void {
		$implemented = array();
		foreach ( $this->implemented_tools() as $tool ) {
			$implemented[ $tool['name'] ] = $tool;
		}

		foreach ( self::$manifest['tools'] as $expected ) {
			$name = $expected['name'];
			$this->assertArrayHasKey( $name, $implemented, "Manifest tool '{$name}' is not implemented." );

			$this->assertSame(
				$expected['description'],
				$implemented[ $name ]['description'],
				"Description for '{$name}' drifted from the manifest."
			);

			$this->assertSame(
				$this->normalize( $expected['inputSchema'] ),
				$implemented[ $name ]['inputSchema'],
				"Input schema for '{$name}' drifted from the manifest."
			);
		}
	}

	public function test_disabling_a_tool_never_invents_one_outside_the_manifest(): void {
		$GLOBALS['corsen_test_options']['corsen_context_settings'] = array(
			'enabled_tools' => array( 'search_site' ),
		);

		$names    = array_column( $this->implemented_tools(), 'name' );
		$manifest = array_column( self::$manifest['tools'], 'name' );

		$this->assertSame( array( 'search_site' ), $names );
		$this->assertEmpty( array_diff( $names, $manifest ) );
	}
}
