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
				'description' => __( 'Owner-published agent tools: read-only public content plus an optional human-only handoff boundary that refuses agent execution before side effects.', 'corsen-context' ),
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
						// The requested action is non-read-only even though execution
						// always refuses it before side effects.
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
							'rank'        => array( 'type' => 'integer' ),
						),
						'required'   => array( 'url', 'title', 'description', 'snippet', 'rank' ),
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
						),
						'required'   => array( 'url', 'title', 'type', 'lastModified' ),
					),
				);
			case 'get_product':
				return array(
					'type'       => 'object',
					'properties' => array(
						'url'                 => array( 'type' => 'string' ),
						'slug'                => array( 'type' => 'string' ),
						'title'               => array( 'type' => 'string' ),
						'type'                => array( 'type' => 'string' ),
						'sku'                 => array( 'type' => 'string' ),
						'description'         => array( 'type' => 'string' ),
						'price'               => array( 'type' => array( 'number', 'null' ) ),
						'regularPrice'        => array( 'type' => array( 'number', 'null' ) ),
						'salePrice'           => array( 'type' => array( 'number', 'null' ) ),
						'currency'            => array( 'type' => 'string' ),
						'priceHtml'           => array( 'type' => 'string' ),
						'onSale'              => array( 'type' => 'boolean' ),
						'purchasable'         => array( 'type' => 'boolean' ),
						'inStock'             => array( 'type' => 'boolean' ),
						'stockStatus'         => array( 'type' => 'string' ),
						'agentPurchase'       => array(
							'type' => 'string',
							'enum' => array( 'allowed', 'forbidden' ),
						),
						'agentPurchaseReason' => array( 'type' => 'string' ),
						'image'               => array( 'type' => array( 'object', 'null' ) ),
						'gallery'             => array(
							'type'  => 'array',
							'items' => array( 'type' => 'object' ),
						),
						'categories'          => array(
							'type'  => 'array',
							'items' => array( 'type' => 'string' ),
						),
						'tags'                => array(
							'type'  => 'array',
							'items' => array( 'type' => 'string' ),
						),
						'lastModified'        => array( 'type' => 'string' ),
						'stockQuantity'       => array( 'type' => array( 'integer', 'null' ) ),
						'variants'            => array(
							'type'  => 'array',
							'items' => array( 'type' => 'object' ),
						),
						'truncated'           => array( 'type' => 'boolean' ),
					),
					'required'   => array( 'url', 'slug', 'title', 'type', 'sku', 'description', 'price', 'regularPrice', 'salePrice', 'currency', 'priceHtml', 'onSale', 'purchasable', 'inStock', 'stockStatus', 'agentPurchase', 'agentPurchaseReason', 'image', 'gallery', 'categories', 'tags', 'lastModified' ),
				);
			case 'get_sections':
				return array(
					'type'       => 'object',
					'properties' => array(
						'url'              => array( 'type' => 'string' ),
						'title'            => array( 'type' => 'string' ),
						'totalBytes'       => array( 'type' => 'integer' ),
						'lastModified'     => array( 'type' => 'string' ),
						'sectionCount'     => array( 'type' => 'integer' ),
						'sections'         => array(
							'type'  => 'array',
							'items' => array( 'type' => 'object' ),
						),
						'outlineTruncated' => array( 'type' => 'boolean' ),
						'section'          => array( 'type' => 'object' ),
						'offset'           => array( 'type' => 'integer' ),
						'bytes'            => array( 'type' => 'integer' ),
						'markdown'         => array( 'type' => 'string' ),
						'nextOffset'       => array( 'type' => 'integer' ),
					),
					'required'   => array( 'url', 'title', 'totalBytes' ),
				);
			case 'get_structured_data':
				return array(
					'type'       => 'object',
					'properties' => array(
						'url'             => array( 'type' => 'string' ),
						'title'           => array( 'type' => 'string' ),
						'lastModified'    => array( 'type' => 'string' ),
						'blockCount'      => array( 'type' => 'integer' ),
						'types'           => array( 'type' => 'object' ),
						'blocks'          => array(
							'type'  => 'array',
							'items' => array( 'type' => 'object' ),
						),
						'from'            => array(
							'type'  => 'array',
							'items' => array( 'type' => 'string' ),
						),
						'untrusted'       => array( 'type' => 'string' ),
						'blocksTruncated' => array( 'type' => 'boolean' ),
					),
					'required'   => array( 'url', 'title', 'lastModified', 'blockCount', 'types', 'blocks', 'from', 'untrusted' ),
				);
			case 'check_agent_access':
				return array(
					'type'       => 'object',
					'properties' => array(
						'ran_at'  => array( 'type' => 'integer' ),
						'summary' => array(
							'type'       => 'object',
							'properties' => array(
								'total'     => array( 'type' => 'integer' ),
								'reachable' => array( 'type' => 'integer' ),
								'blocked'   => array( 'type' => 'integer' ),
							),
						),
						'checks'  => array(
							'type'  => 'array',
							'items' => array(
								'type'       => 'object',
								'properties' => array(
									'target'    => array( 'type' => 'string' ),
									'ua'        => array( 'type' => 'string' ),
									'code'      => array( 'type' => 'integer' ),
									'reachable' => array( 'type' => 'boolean' ),
									'edge'      => array( 'type' => 'string' ),
									'blocked'   => array( 'type' => 'boolean' ),
								),
							),
						),
						'note'    => array( 'type' => 'string' ),
						'fresh'   => array( 'type' => 'boolean' ),
					),
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
