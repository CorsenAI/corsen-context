<?php
/**
 * WordPress Abilities API surface for Corsen Context.
 *
 * Exposes each enabled tool as a core ability (WP 6.9+) so the official
 * MCP Adapter and any abilities-aware client discover the exact same
 * contract as the JSON-RPC endpoint and the WebMCP bridge. Registration
 * is settings-driven: master off, MCP off, or a tool unchecked means the
 * ability simply never registers. On WordPress versions without the
 * Abilities API every hook here is inert.
 *
 * Powered by Corsen Context - Built by Corsen AI - github.com/CorsenAI/corsen-context
 *
 * @package Corsen_Context
 */

defined( 'ABSPATH' ) || exit;

/**
 * Ability registration.
 */
class Corsen_Context_Abilities {

	public const CATEGORY = 'corsen-context';

	/**
	 * Hook the Abilities API lifecycle.
	 */
	public static function init(): void {
		add_action( 'wp_abilities_api_categories_init', array( __CLASS__, 'register_category' ) );
		add_action( 'wp_abilities_api_init', array( __CLASS__, 'register_abilities' ) );
	}

	/**
	 * Whether the Abilities API is present in this WordPress build.
	 */
	public static function available(): bool {
		return function_exists( 'wp_register_ability' ) && function_exists( 'wp_register_ability_category' );
	}

	/**
	 * Register the ability category. Must run before register_abilities().
	 */
	public static function register_category(): void {
		if ( ! self::available() || ! self::transport_enabled() ) {
			return;
		}
		wp_register_ability_category(
			self::CATEGORY,
			array(
				'label'       => __( 'Corsen Context', 'corsen-context' ),
				'description' => __( 'Site tools published by the owner for AI agents: read-only content access, plus an opt-in private contact submission.', 'corsen-context' ),
			)
		);
	}

	/**
	 * Register one ability per enabled tool, schemas shared with tools/list.
	 */
	public static function register_abilities(): void {
		if ( ! self::available() || ! self::transport_enabled() ) {
			return;
		}

		$server = new Corsen_Context_MCP_Server();
		foreach ( $server->get_tool_definitions() as $def ) {
			$tool = (string) $def['name'];
			wp_register_ability(
				self::CATEGORY . '/' . str_replace( '_', '-', $tool ),
				array(
					'label'               => self::human_label( $tool ),
					'description'         => (string) $def['description'],
					'category'            => self::CATEGORY,
					'input_schema'        => self::normalize_schema( $def['inputSchema'] ),
					'output_schema'       => self::output_schema( $tool ),
					'execute_callback'    => static function ( array $input = array() ) use ( $server, $tool ) {
						$outcome = $server->execute_tool( $tool, $input );
						if ( empty( $outcome['ok'] ) ) {
							return new \WP_Error(
								'corsen_context_tool_failed',
								(string) ( $outcome['error'] ?? __( 'The tool call failed.', 'corsen-context' ) )
							);
						}
						return $outcome['result'];
					},
					// Content is public by construction: only published,
					// unpassworded, owner-selected posts are ever exposed.
					'permission_callback' => '__return_true',
					'meta'                => array(
						// The expert tool writes private submissions; never claim readonly.
						'annotations' => array( 'readonly' => 'request_expert_call' !== $tool ),
						'public'      => true,
					),
				)
			);
		}
	}

	/**
	 * Master switch + MCP transport gate mirror of register_rest_routes().
	 */
	private static function transport_enabled(): bool {
		$settings = get_option( 'corsen_context_settings', array() );
		return ! empty( $settings['enabled'] ) && ! empty( $settings['mcp_enabled'] );
	}

	/**
	 * Ability names forbid underscores; render a readable label instead.
	 */
	private static function human_label( string $tool ): string {
		return ucwords( str_replace( array( '_', '-' ), ' ', $tool ) );
	}

	/**
	 * Make a tools/list schema safe for the core JSON-Schema subset: an empty
	 * stdClass "properties" is valid JSON but not a plain array for Core.
	 *
	 * @param array<string,mixed> $schema Input schema from the tool definition.
	 * @return array<string,mixed>
	 */
	private static function normalize_schema( array $schema ): array {
		if ( isset( $schema['properties'] ) && $schema['properties'] instanceof \stdClass ) {
			$schema['properties'] = array();
		}
		return $schema;
	}

	/**
	 * Output contract per tool, matching the executors in class-mcp-server.php.
	 *
	 * @param string $tool Tool name.
	 * @return array<string,mixed>
	 */
	private static function output_schema( string $tool ): array {
		switch ( $tool ) {
			case 'search_site':
				return array(
					'type'  => 'array',
					'items' => array(
						'type'       => 'object',
						'properties' => array(
							'url'         => array( 'type' => 'string' ),
							'title'       => array( 'type' => 'string' ),
							'description' => array( 'type' => 'string' ),
							'snippet'     => array( 'type' => 'string' ),
							'score'       => array( 'type' => 'number' ),
						),
						'required'   => array( 'url', 'title' ),
					),
				);
			case 'get_page_content':
				return array(
					'type'       => 'object',
					'properties' => array(
						'url'          => array( 'type' => 'string' ),
						'title'        => array( 'type' => 'string' ),
						'description'  => array( 'type' => 'string' ),
						'markdown'     => array( 'type' => 'string' ),
						'lastModified' => array( 'type' => 'string' ),
						'metadata'     => array( 'type' => 'object' ),
					),
					'required'   => array( 'url', 'title', 'markdown' ),
				);
			case 'list_content':
				return array(
					'type'       => 'object',
					'properties' => array(
						'items'   => array(
							'type'  => 'array',
							'items' => array( 'type' => 'object' ),
						),
						'total'   => array( 'type' => 'integer' ),
						'page'    => array( 'type' => 'integer' ),
						'limit'   => array( 'type' => 'integer' ),
						'hasMore' => array( 'type' => 'boolean' ),
					),
					'required'   => array( 'items', 'total', 'page', 'limit', 'hasMore' ),
				);
			case 'get_sitemap':
				return array(
					'type'  => 'array',
					'items' => array(
						'type'       => 'object',
						'properties' => array(
							'url'          => array( 'type' => 'string' ),
							'title'        => array( 'type' => 'string' ),
							'type'         => array( 'type' => 'string' ),
							'lastModified' => array( 'type' => 'string' ),
							'price'        => array( 'type' => 'number' ),
							'inStock'      => array( 'type' => 'boolean' ),
						),
						'required'   => array( 'url' ),
					),
				);
			case 'get_product':
				return array(
					'type'       => 'object',
					'properties' => array(
						'url'         => array( 'type' => 'string' ),
						'title'       => array( 'type' => 'string' ),
						'price'       => array( 'type' => 'number' ),
						'currency'    => array( 'type' => 'string' ),
						'inStock'     => array( 'type' => 'boolean' ),
						'stockStatus' => array( 'type' => 'string' ),
						'image'       => array( 'type' => 'object' ),
						'gallery'     => array( 'type' => 'array' ),
					),
					'required'   => array( 'url', 'title' ),
				);
			case 'request_expert_call':
				return array(
					'type'       => 'object',
					'properties' => array(
						'queued' => array( 'type' => 'boolean' ),
						'note'   => array( 'type' => 'string' ),
					),
					'required'   => array( 'queued' ),
				);
			default:
				return array();
		}
	}
}
