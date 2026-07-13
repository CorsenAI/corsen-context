<?php
/**
 * MCP Server implementation for WordPress.
 * Full JSON-RPC 2.0 compliance with MCP spec 2025-11-25.
 *
 * Powered by Corsen Context - Built by Corsen AI - github.com/CorsenAI/corsen-context
 */

defined( 'ABSPATH' ) || exit;

class Corsen_Context_MCP_Server {

	private const MAX_BODY_SIZE  = 102400;
	private const MAX_JSON_DEPTH = 10;

	/**
	 * Handle incoming MCP JSON-RPC request.
	 *
	 * @param \WP_REST_Request $request REST request.
	 * @return \WP_REST_Response
	 */
	public function handle_request( \WP_REST_Request $request ): \WP_REST_Response {
		// Security headers.
		Corsen_Context_Security::send_security_headers();

		// Rate limit BEFORE auth so unauthenticated clients cannot brute-force
		// the API key or hammer the endpoint unthrottled.
		if ( ! Corsen_Context_Security::check_rate_limit() ) {
			$response = new \WP_REST_Response(
				array( 'jsonrpc' => '2.0', 'error' => array( 'code' => -32000, 'message' => 'Rate limit exceeded' ), 'id' => null ),
				429
			);
			$response->header( 'Retry-After', '60' );
			return $response;
		}

		// API key check.
		if ( ! Corsen_Context_Security::validate_api_key( $request ) ) {
			return new \WP_REST_Response(
				array( 'jsonrpc' => '2.0', 'error' => array( 'code' => -32000, 'message' => 'Unauthorized' ), 'id' => null ),
				401
			);
		}

		$raw_body = $request->get_body();
		if ( strlen( $raw_body ) > self::MAX_BODY_SIZE ) {
			return $this->error_response( null, -32600, 'Request body too large' );
		}

		$body = $request->get_json_params();
		if ( ! is_array( $body ) ) {
			return $this->error_response( null, -32700, 'Parse error' );
		}

		if ( $this->is_json_too_deep( $body ) ) {
			return $this->error_response( null, -32600, 'JSON nesting too deep' );
		}

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
		$arguments = is_array( $params['arguments'] ?? null ) ? $params['arguments'] : array();

		if ( '' === $tool_name ) {
			return $this->error_response( $id, -32602, 'Missing tool name' );
		}

		// Honor the configured tool set (parity with the core config.mcp.tools).
		if ( ! in_array( $tool_name, $this->get_enabled_tools(), true ) ) {
			return $this->error_response( $id, -32601, 'Tool not found: ' . $tool_name );
		}

		// Cache the low-cardinality tool outputs. search_site is excluded: its
		// free-form query would let a caller mint an unbounded number of
		// transients (wp_options bloat).
		$cacheable = ! in_array( $tool_name, array( 'search_site' ), true );
		$cache_key = $cacheable ? $this->tool_cache_key( $tool_name, $arguments ) : '';
		if ( $cacheable ) {
			$cached = get_transient( $cache_key );
			if ( is_array( $cached ) && array_key_exists( 'result', $cached ) ) {
				return $this->tool_result_response( $id, $cached['result'] );
			}
		}

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
				$uri = sanitize_text_field( $arguments['uri'] ?? '' );
				if ( '' === $uri ) {
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

		if ( $cacheable ) {
			$ttl = intval( get_option( 'corsen_context_settings', array() )['cache_ttl'] ?? 3600 );
			set_transient( $cache_key, array( 'result' => $result ), $ttl );
		}

		return $this->tool_result_response( $id, $result );
	}

	/**
	 * Build the cache key for a tool call. Includes a bumpable cache version so
	 * publishing/updating a post invalidates all cached MCP responses at once.
	 */
	private function tool_cache_key( string $tool_name, array $arguments ): string {
		$version = intval( get_option( 'corsen_context_cache_version', 1 ) );
		return 'corsen_mcp_' . md5( $version . '|' . $tool_name . '|' . wp_json_encode( $arguments ) );
	}

	/** Wrap a tool result in the standard MCP content envelope. */
	private function tool_result_response( $id, $result ): \WP_REST_Response {
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
			$posts = get_posts( array(
				'post_type'      => $pt,
				'post_status'    => 'publish',
				'has_password'   => false,
				'posts_per_page' => $max_pages,
				'no_found_rows'  => true,
			) );

			foreach ( $posts as $post ) {
				if ( ! $this->is_post_exposable( $post ) ) {
					continue;
				}
				$parts = wp_parse_url( get_permalink( $post ) );
				$path  = $parts['path'] ?? '/';
				if ( ! empty( $parts['query'] ) ) {
					// Preserve query params (e.g. /?p=4) for parity with the core.
					$path .= '?' . $parts['query'];
				}
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
		$uri      = sanitize_text_field( $params['uri'] ?? '' );
		$resolved = $this->resolve_public_url( $uri );
		if ( null === $resolved ) {
			return $this->error_response( $id, -32002, 'Resource not found' );
		}

		$post = url_to_postid( $resolved );
		if ( ! $post ) {
			return $this->error_response( $id, -32002, 'Resource not found' );
		}

		$post_obj = get_post( $post );
		if ( ! $post_obj || ! $this->is_post_exposable( $post_obj ) ) {
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
	 * Get the enabled MCP tools (parity with the core config.mcp.tools).
	 * Defaults to all four; override via the corsen_context_enabled_tools filter.
	 *
	 * @return string[]
	 */
	private function get_enabled_tools(): array {
		$all      = array( 'search_site', 'get_page_content', 'list_content', 'get_sitemap' );
		$settings = get_option( 'corsen_context_settings', array() );
		$enabled  = ( isset( $settings['enabled_tools'] ) && is_array( $settings['enabled_tools'] ) )
			? array_values( array_intersect( $all, $settings['enabled_tools'] ) )
			: $all;
		/** Filter the set of exposed MCP tools. */
		$enabled = (array) apply_filters( 'corsen_context_enabled_tools', $enabled );
		return empty( $enabled ) ? $all : $enabled;
	}

	/**
	 * Resolve a resource:// URI or URL to a same-site, non-excluded permalink.
	 * Mirrors the TypeScript content-policy resolvePublicPageUrl: rejects
	 * cross-origin hosts, non-http(s) schemes, and excluded paths.
	 *
	 * @param string $uri Incoming URI (resource://path, /path, or full URL).
	 * @return string|null Absolute same-site URL, or null if not permitted.
	 */
	private function resolve_public_url( string $uri ): ?string {
		$raw = trim( $uri );
		if ( '' === $raw ) {
			return null;
		}

		// Strip a single resource:// prefix, leaving a leading-slash path.
		if ( 0 === strpos( $raw, 'resource://' ) ) {
			$raw = '/' . ltrim( substr( $raw, strlen( 'resource://' ) ), '/' );
		}

		$parsed = wp_parse_url( $raw );
		if ( false === $parsed ) {
			return null;
		}

		// Reject non-http(s) schemes (blocks javascript:, file:, etc.).
		if ( isset( $parsed['scheme'] ) && ! in_array( strtolower( $parsed['scheme'] ), array( 'http', 'https' ), true ) ) {
			return null;
		}

		// Reject cross-origin hosts.
		if ( ! empty( $parsed['host'] ) ) {
			$site_host = wp_parse_url( home_url(), PHP_URL_HOST );
			if ( strtolower( $parsed['host'] ) !== strtolower( (string) $site_host ) ) {
				return null;
			}
		}

		$path = isset( $parsed['path'] ) && '' !== $parsed['path'] ? $parsed['path'] : '/';
		if ( $this->is_path_excluded( $path ) ) {
			return null;
		}

		// Re-attach the query string so plain-permalink sites (e.g. /?p=4), whose
		// resources/list URIs carry the query, still resolve via url_to_postid.
		if ( ! empty( $parsed['query'] ) ) {
			$path .= '?' . $parsed['query'];
		}

		return home_url( $path );
	}

	/**
	 * Get configured exclude paths.
	 *
	 * @return string[]
	 */
	private function get_exclude_paths(): array {
		$settings = get_option( 'corsen_context_settings', array() );
		$raw      = $settings['exclude_paths'] ?? '';
		$lines    = is_array( $raw ) ? $raw : explode( "\n", $raw );

		$paths = array();
		foreach ( $lines as $line ) {
			$path = $this->normalize_path( (string) $line );
			if ( null !== $path && '/' !== $path ) {
				$paths[] = $path;
			}
		}

		return array_values( array_unique( $paths ) );
	}

	/**
	 * Get max pages setting for queries.
	 */
	private function get_max_pages(): int {
		$settings = get_option( 'corsen_context_settings', array() );
		return intval( $settings['max_pages'] ?? 500 );
	}

	/**
	 * Check whether a JSON value exceeds the configured nesting limit.
	 *
	 * @param mixed $value JSON-decoded value.
	 * @param int   $depth Current depth.
	 */
	private function is_json_too_deep( $value, int $depth = 0 ): bool {
		if ( $depth > self::MAX_JSON_DEPTH ) {
			return true;
		}

		if ( is_array( $value ) ) {
			foreach ( $value as $child ) {
				if ( $this->is_json_too_deep( $child, $depth + 1 ) ) {
					return true;
				}
			}
		}

		return false;
	}

	/**
	 * Normalize a path or URL to a leading-slash path.
	 */
	private function normalize_path( string $path ): ?string {
		$path = trim( $path );
		if ( '' === $path ) {
			return null;
		}

		$parsed_path = wp_parse_url( $path, PHP_URL_PATH );
		if ( is_string( $parsed_path ) && '' !== $parsed_path ) {
			$path = $parsed_path;
		}

		$path = '/' . ltrim( $path, '/' );
		return untrailingslashit( $path );
	}

	/**
	 * Check whether a path matches configured exclusions.
	 */
	private function is_path_excluded( string $path ): bool {
		$path = $this->normalize_path( $path );
		if ( null === $path ) {
			return false;
		}

		foreach ( $this->get_exclude_paths() as $exclude ) {
			if ( $path === $exclude || str_starts_with( $path, trailingslashit( $exclude ) ) ) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Check whether a post is allowed to be exposed through public endpoints.
	 */
	private function is_post_exposable( \WP_Post $post ): bool {
		if ( 'publish' !== $post->post_status ) {
			return false;
		}

		if ( ! empty( $post->post_password ) ) {
			return false;
		}

		if ( ! in_array( $post->post_type, $this->get_allowed_post_types(), true ) ) {
			return false;
		}

		$path = wp_parse_url( get_permalink( $post ), PHP_URL_PATH );
		if ( is_string( $path ) && $this->is_path_excluded( $path ) ) {
			return false;
		}

		return true;
	}

	// --- Tool Implementations ---

	private function search_site( string $query, int $limit ): array {
		$results = array();

		$posts = get_posts( array(
			'post_type'      => $this->get_allowed_post_types(),
			'post_status'    => 'publish',
			'has_password'   => false,
			's'              => $query,
			'posts_per_page' => $this->get_max_pages(),
			'no_found_rows'  => true,
		) );

		foreach ( $posts as $post ) {
			if ( count( $results ) >= $limit ) {
				break;
			}
			if ( ! $this->is_post_exposable( $post ) ) {
				continue;
			}
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
		$resolved = $this->resolve_public_url( $uri );
		if ( null === $resolved ) {
			return null;
		}

		$post_id = url_to_postid( $resolved );
		if ( ! $post_id ) {
			return null;
		}

		$post = get_post( $post_id );
		if ( ! $post || ! $this->is_post_exposable( $post ) ) {
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

		$query = new \WP_Query( array(
			'post_type'      => $type,
			'post_status'    => 'publish',
			'has_password'   => false,
			'posts_per_page' => $this->get_max_pages(),
			'no_found_rows'  => true,
		) );

		$posts  = array_values( array_filter( $query->posts, array( $this, 'is_post_exposable' ) ) );
		$total  = count( $posts );
		$offset = ( $page - 1 ) * $limit;
		$items  = array();
		foreach ( array_slice( $posts, $offset, $limit ) as $post ) {
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
			$posts = get_posts( array(
				'post_type'      => $pt,
				'post_status'    => 'publish',
				'has_password'   => false,
				'posts_per_page' => $max_pages,
				'no_found_rows'  => true,
			) );

			foreach ( $posts as $post ) {
				if ( ! $this->is_post_exposable( $post ) ) {
					continue;
				}
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
		$enabled = $this->get_enabled_tools();
		$defs    = array(
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

		// Only advertise enabled tools (parity with the core).
		return array_values(
			array_filter(
				$defs,
				static function ( $def ) use ( $enabled ) {
					return in_array( $def['name'], $enabled, true );
				}
			)
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
