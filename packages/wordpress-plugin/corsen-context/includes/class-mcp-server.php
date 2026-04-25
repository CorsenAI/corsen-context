<?php
/**
 * MCP Server implementation for WordPress.
 * Full JSON-RPC 2.0 compliance with MCP spec 2025-11-25.
 *
 * Powered by Corsen Context - Built by Corsen AI - github.com/CorsenAI/corsen-context
 */

defined( 'ABSPATH' ) || exit;

class Corsen_Context_MCP_Server {

	/**
	 * Handle incoming MCP JSON-RPC request.
	 *
	 * @param \WP_REST_Request $request REST request.
	 * @return \WP_REST_Response
	 */
	public function handle_request( \WP_REST_Request $request ): \WP_REST_Response {
		// Security headers.
		Corsen_Context_Security::send_security_headers();

		// API key check.
		if ( ! Corsen_Context_Security::validate_api_key( $request ) ) {
			return new \WP_REST_Response(
				array( 'jsonrpc' => '2.0', 'error' => array( 'code' => -32000, 'message' => 'Unauthorized' ), 'id' => null ),
				401
			);
		}

		// Rate limit check.
		if ( ! Corsen_Context_Security::check_rate_limit() ) {
			$response = new \WP_REST_Response(
				array( 'jsonrpc' => '2.0', 'error' => array( 'code' => -32000, 'message' => 'Rate limit exceeded' ), 'id' => null ),
				429
			);
			$response->header( 'Retry-After', '60' );
			return $response;
		}

		$body = $request->get_json_params();

		// Validate JSON-RPC structure.
		if ( empty( $body['jsonrpc'] ) || '2.0' !== $body['jsonrpc'] || empty( $body['method'] ) ) {
			return $this->error_response( null, -32600, 'Invalid Request' );
		}

		$method          = sanitize_text_field( $body['method'] );
		$params          = is_array( $body['params'] ?? null ) ? $body['params'] : array();
		$id              = $body['id'] ?? null;
		$is_notification = ! array_key_exists( 'id', $body );

		// JSON-RPC 2.0: notifications (no id) get no response.
		if ( $is_notification ) {
			$this->dispatch( $method, $params, $id );
			return new \WP_REST_Response( null, 204 );
		}

		return $this->dispatch( $method, $params, $id );
	}

	/**
	 * Dispatch method to handler.
	 *
	 * @param string $method Method name.
	 * @param array  $params Parameters.
	 * @param mixed  $id     Request ID.
	 * @return \WP_REST_Response
	 */
	private function dispatch( string $method, array $params, $id ): \WP_REST_Response {
		switch ( $method ) {
			case 'initialize':
				return $this->handle_initialize( $id );
			case 'notifications/initialized':
				// Client acknowledgement after initialize — no meaningful response needed.
				return $this->success_response( $id, new \stdClass() );
			case 'ping':
				return $this->success_response( $id, new \stdClass() );
			case 'tools/list':
				return $this->handle_list_tools( $id );
			case 'tools/call':
				return $this->handle_call_tool( $params, $id );
			case 'resources/list':
				return $this->handle_list_resources( $id );
			case 'resources/read':
				return $this->handle_read_resource( $params, $id );
			default:
				return $this->error_response( $id, -32601, 'Method not found: ' . $method );
		}
	}

	/**
	 * Handle initialize.
	 */
	private function handle_initialize( $id ): \WP_REST_Response {
		return $this->success_response( $id, array(
			'protocolVersion' => '2025-11-25',
			'capabilities'    => array(
				'tools'     => new \stdClass(),
				'resources' => new \stdClass(),
			),
			'serverInfo'      => array(
				'name'    => 'corsen-context-wordpress',
				'version' => CORSEN_CONTEXT_VERSION,
			),
		) );
	}

	/**
	 * Handle tools/list.
	 */
	private function handle_list_tools( $id ): \WP_REST_Response {
		return $this->success_response( $id, array( 'tools' => $this->get_tool_definitions() ) );
	}

	/**
	 * Handle tools/call.
	 */
	private function handle_call_tool( array $params, $id ): \WP_REST_Response {
		$tool_name = sanitize_text_field( $params['name'] ?? '' );
		$arguments = $params['arguments'] ?? array();

		switch ( $tool_name ) {
			case 'search_site':
				$query = sanitize_text_field( $arguments['query'] ?? '' );
				$limit = min( max( intval( $arguments['limit'] ?? 10 ), 1 ), 50 );
				if ( empty( $query ) ) {
					return $this->error_response( $id, -32602, 'Missing required parameter: query' );
				}
				$result = $this->search_site( $query, $limit );
				break;

			case 'get_page_content':
				$uri = esc_url_raw( $arguments['uri'] ?? '' );
				if ( empty( $uri ) ) {
					return $this->error_response( $id, -32602, 'Missing required parameter: uri' );
				}
				$result = $this->get_page_content( $uri );
				if ( null === $result ) {
					return $this->error_response( $id, -32002, 'Resource not found' );
				}
				break;

			case 'list_content':
				$type  = sanitize_text_field( $arguments['type'] ?? 'page' );
				$page  = max( intval( $arguments['page'] ?? 1 ), 1 );
				$limit = min( max( intval( $arguments['limit'] ?? 20 ), 1 ), 100 );
				$result = $this->list_content( $type, $page, $limit );
				break;

			case 'get_sitemap':
				$result = $this->get_sitemap();
				break;

			default:
				return $this->error_response( $id, -32601, 'Tool not found: ' . $tool_name );
		}

		return $this->success_response( $id, array(
			'content' => array(
				array(
					'type' => 'text',
					'text' => wp_json_encode( $result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ),
				),
			),
		) );
	}

	/**
	 * Handle resources/list.
	 */
	private function handle_list_resources( $id ): \WP_REST_Response {
		$post_types = $this->get_allowed_post_types();
		$max_pages  = $this->get_max_pages();
		$resources  = array();

		foreach ( $post_types as $pt ) {
			$posts = $this->get_public_posts( $pt, $max_pages );

			foreach ( $posts as $post ) {
				$path = wp_parse_url( get_permalink( $post ), PHP_URL_PATH );
				$resources[] = array(
					'uri'         => 'resource://' . ltrim( $path, '/' ),
					'name'        => get_the_title( $post ),
					'description' => Corsen_Context_Content_Converter::get_post_metadata( $post )['description'],
					'mimeType'    => 'text/markdown',
				);
			}
		}

		return $this->success_response( $id, array( 'resources' => $resources ) );
	}

	/**
	 * Handle resources/read.
	 */
	private function handle_read_resource( array $params, $id ): \WP_REST_Response {
		$uri  = sanitize_text_field( $params['uri'] ?? '' );
		$path = str_replace( 'resource://', '/', $uri );
		$post = url_to_postid( home_url( $path ) );

		if ( ! $post ) {
			return $this->error_response( $id, -32002, 'Resource not found' );
		}

		$post_obj = get_post( $post );
		if ( ! $this->is_public_post( $post_obj ) ) {
			return $this->error_response( $id, -32002, 'Resource not found' );
		}

		$markdown = Corsen_Context_Content_Converter::post_to_markdown( $post_obj );

		return $this->success_response( $id, array(
			'contents' => array(
				array(
					'uri'      => $uri,
					'mimeType' => 'text/markdown',
					'text'     => $markdown,
				),
			),
		) );
	}

	// --- Helpers ---

	/**
	 * Get allowed post types from settings. Only these are exposed via MCP.
	 */
	private function get_allowed_post_types(): array {
		$settings = get_option( 'corsen_context_settings', array() );
		return $settings['post_types'] ?? array( 'post', 'page' );
	}

	/**
	 * Get max pages setting for queries.
	 */
	private function get_max_pages(): int {
		$settings = get_option( 'corsen_context_settings', array() );
		return intval( $settings['max_pages'] ?? 500 );
	}

	/**
	 * Get excluded URL paths from settings.
	 *
	 * @return string[]
	 */
	private function get_exclude_paths(): array {
		$settings = get_option( 'corsen_context_settings', array() );
		$raw      = array_filter( array_map( 'trim', explode( "\n", $settings['exclude_paths'] ?? '' ) ) );

		return array_values( array_map( static function ( string $path ): string {
			$path = sanitize_text_field( $path );
			return '/' === substr( $path, 0, 1 ) ? $path : '/' . $path;
		}, $raw ) );
	}

	/**
	 * Check whether a URL path is excluded by settings.
	 */
	private function is_excluded_url( string $url ): bool {
		$path = wp_parse_url( $url, PHP_URL_PATH );
		if ( ! is_string( $path ) ) {
			return true;
		}

		foreach ( $this->get_exclude_paths() as $excluded ) {
			if ( '' !== $excluded && str_starts_with( $path, $excluded ) ) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Verify a post is published, public, not password-protected, and not excluded.
	 */
	private function is_public_post( $post ): bool {
		if ( ! $post instanceof \WP_Post ) {
			return false;
		}

		if ( 'publish' !== $post->post_status || ! empty( $post->post_password ) ) {
			return false;
		}

		if ( ! in_array( $post->post_type, $this->get_allowed_post_types(), true ) ) {
			return false;
		}

		$permalink = get_permalink( $post );
		if ( ! is_string( $permalink ) ) {
			return false;
		}

		return ! $this->is_excluded_url( $permalink );
	}

	/**
	 * Query public posts and apply all content ACL filters.
	 *
	 * @return \WP_Post[]
	 */
	private function get_public_posts( string $post_type, int $limit, array $extra_args = array() ): array {
		$posts = get_posts( array_merge( array(
			'post_type'      => $post_type,
			'post_status'    => 'publish',
			'has_password'   => false,
			'posts_per_page' => $limit,
			'no_found_rows'  => true,
		), $extra_args ) );

		return array_values( array_filter( $posts, array( $this, 'is_public_post' ) ) );
	}

	// --- Tool Implementations ---

	private function search_site( string $query, int $limit ): array {
		$results = array();

		$posts = get_posts( array(
			'post_type'      => $this->get_allowed_post_types(),
			'post_status'    => 'publish',
			'has_password'   => false,
			's'              => $query,
			'posts_per_page' => min( $this->get_max_pages(), max( $limit * 3, $limit ) ),
			'no_found_rows'  => true,
		) );
		$posts = array_slice( array_values( array_filter( $posts, array( $this, 'is_public_post' ) ) ), 0, $limit );

		foreach ( $posts as $post ) {
			$meta = Corsen_Context_Content_Converter::get_post_metadata( $post );
			$content = wp_strip_all_tags( $post->post_content );
			$snippet = '';

			$pos = stripos( $content, $query );
			if ( false !== $pos ) {
				$start   = max( 0, $pos - 80 );
				$snippet = substr( $content, $start, 200 );
			} else {
				$snippet = substr( $content, 0, 200 );
			}

			$results[] = array(
				'url'         => $meta['url'],
				'title'       => $meta['title'],
				'description' => $meta['description'],
				'snippet'     => trim( $snippet ) . '...',
				'score'       => 1,
			);
		}

		return $results;
	}

	private function get_page_content( string $uri ): ?array {
		$post_id = url_to_postid( $uri );
		if ( ! $post_id ) {
			return null;
		}

		$post = get_post( $post_id );
		if ( ! $this->is_public_post( $post ) ) {
			return null;
		}

		$meta     = Corsen_Context_Content_Converter::get_post_metadata( $post );
		$markdown = Corsen_Context_Content_Converter::post_to_markdown( $post );

		return array(
			'url'          => $meta['url'],
			'title'        => $meta['title'],
			'description'  => $meta['description'],
			'markdown'     => $markdown,
			'lastModified' => $meta['modified'],
			'metadata'     => $meta,
		);
	}

	private function list_content( string $type, int $page, int $limit ): array {
		// Whitelist: only allowed post types from settings
		$allowed = $this->get_allowed_post_types();
		if ( ! in_array( $type, $allowed, true ) ) {
			$type = $allowed[0] ?? 'page';
		}

		$all_items = $this->get_public_posts( $type, $this->get_max_pages(), array(
			'orderby' => 'date',
			'order'   => 'DESC',
		) );
		$total     = count( $all_items );
		$posts     = array_slice( $all_items, ( $page - 1 ) * $limit, $limit );

		$items = array();
		foreach ( $posts as $post ) {
			$meta    = Corsen_Context_Content_Converter::get_post_metadata( $post );
			$items[] = array(
				'url'          => $meta['url'],
				'title'        => $meta['title'],
				'description'  => $meta['description'],
				'type'         => $post->post_type,
				'lastModified' => $meta['modified'],
			);
		}

		return array(
			'items'   => $items,
			'total'   => $total,
			'page'    => $page,
			'limit'   => $limit,
			'hasMore' => ( $page * $limit ) < $total,
		);
	}

	private function get_sitemap(): array {
		$post_types = $this->get_allowed_post_types();
		$max_pages  = $this->get_max_pages();
		$sitemap    = array();

		foreach ( $post_types as $pt ) {
			$posts = $this->get_public_posts( $pt, $max_pages );

			foreach ( $posts as $post ) {
				$sitemap[] = array(
					'url'          => get_permalink( $post ),
					'title'        => get_the_title( $post ),
					'type'         => $pt,
					'lastModified' => $post->post_modified_gmt,
				);
			}
		}

		return $sitemap;
	}

	// --- Tool Definitions ---

	private function get_tool_definitions(): array {
		return array(
			array(
				'name'        => 'search_site',
				'description' => 'Search site content by keyword. Returns matching pages with snippets.',
				'inputSchema' => array(
					'type'       => 'object',
					'properties' => array(
						'query' => array( 'type' => 'string', 'description' => 'Search query' ),
						'limit' => array( 'type' => 'number', 'description' => 'Max results (1-50, default 10)' ),
					),
					'required'   => array( 'query' ),
				),
			),
			array(
				'name'        => 'get_page_content',
				'description' => 'Get full page content as clean markdown with metadata.',
				'inputSchema' => array(
					'type'       => 'object',
					'properties' => array(
						'uri' => array( 'type' => 'string', 'description' => 'Page URL' ),
					),
					'required'   => array( 'uri' ),
				),
			),
			array(
				'name'        => 'list_content',
				'description' => 'List content by type (page, post, product) with pagination.',
				'inputSchema' => array(
					'type'       => 'object',
					'properties' => array(
						'type'  => array( 'type' => 'string', 'description' => 'Content type (e.g., post, page, product, or any custom type)' ),
						'page'  => array( 'type' => 'number', 'description' => 'Page number (default 1)' ),
						'limit' => array( 'type' => 'number', 'description' => 'Items per page (1-100, default 20)' ),
					),
				),
			),
			array(
				'name'        => 'get_sitemap',
				'description' => 'Get structured sitemap of the entire site.',
				'inputSchema' => array(
					'type'       => 'object',
					'properties' => new \stdClass(),
				),
			),
		);
	}

	// --- Response Helpers ---

	private function success_response( $id, $result ): \WP_REST_Response {
		return new \WP_REST_Response(
			array( 'jsonrpc' => '2.0', 'result' => $result, 'id' => $id ),
			200
		);
	}

	private function error_response( $id, int $code, string $message ): \WP_REST_Response {
		$status = match ( $code ) {
			-32700  => 400,
			-32600  => 400,
			-32601  => 404,
			-32602  => 400,
			-32000  => 429,
			default => 500,
		};

		return new \WP_REST_Response(
			array( 'jsonrpc' => '2.0', 'error' => array( 'code' => $code, 'message' => $message ), 'id' => $id ),
			$status
		);
	}
}
