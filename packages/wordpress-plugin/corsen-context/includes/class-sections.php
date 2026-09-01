<?php
/**
 * Section-aware page reader for Corsen Context.
 *
 * WordPress-only extension tool (deliberately outside the cross-runtime
 * tools.manifest.json contract): whole-page markdown is often far larger
 * than an agent's budget, and blind truncation cuts the answer mid-sentence.
 * get_sections returns a cheap flat outline (one entry per heading, with
 * byte sizes), then serves exactly one section per call within a hard byte
 * budget, with byte-offset pagination. Fail-closed: requires the owner
 * toggle and the same exposure policy as get_page_content.
 *
 * Powered by Corsen AI - github.com/CorsenAI/corsen-context
 *
 * @package Corsen_Context
 */

defined( 'ABSPATH' ) || exit;

/**
 * get_sections tool implementation.
 */
class Corsen_Context_Sections {

	/** Hard byte budget for one section payload. */
	const SECTION_BUDGET = 8192;

	/** Outline entries per page (a page with more headings still reports honestly). */
	const MAX_OUTLINE = 80;

	/**
	 * Public contract for tools/list (WP-only extension, manifest untouched).
	 *
	 * @return array<string,mixed>
	 */
	public static function definition(): array {
		return array(
			'name'        => 'get_sections',
			'description' => 'Read a page in bounded chunks instead of one huge dump. Without "section": returns the flat outline (one entry per heading with a stable id and byte size). With "section": returns that section\'s markdown within an 8192-byte budget, plus a byte offset to continue. Same exposure rules as get_page_content. Read-only.',
			'inputSchema' => array(
				'type'                 => 'object',
				'properties'           => array(
					'uri'     => array(
						'type'        => 'string',
						'minLength'   => 1,
						'maxLength'   => 2000,
						'description' => 'Absolute page URL on this site, exactly as returned by list_content, search_site, or get_sitemap.',
					),
					'section' => array(
						'type'        => 'string',
						'minLength'   => 1,
						'maxLength'   => 130,
						'pattern'     => '^[a-z0-9]+(?:-[a-z0-9]+)*$|^top$',
						'description' => 'Section id from the outline ("top" is the content before the first heading). Omit to receive the outline itself.',
					),
					'offset'  => array(
						'type'        => 'integer',
						'minimum'     => 0,
						'description' => 'Byte offset into the section body, taken from the previous response, to page through a section larger than the budget. Only valid with "section".',
					),
				),
				'additionalProperties' => false,
			),
		);
	}

	/**
	 * Validate arguments: uri required; section and offset optional.
	 *
	 * @param array<mixed> $arguments Raw arguments.
	 * @return array<string,mixed>|null Normalized args, or null on violation.
	 */
	public static function validate( array $arguments ): ?array {
		foreach ( array_keys( $arguments ) as $key ) {
			if ( ! in_array( $key, array( 'uri', 'section', 'offset' ), true ) ) {
				return null;
			}
		}
		if ( ! isset( $arguments['uri'] ) || ! is_string( $arguments['uri'] ) ) {
			return null;
		}
		$uri = trim( $arguments['uri'] );
		if ( '' === $uri || strlen( $uri ) > 2000 ) {
			return null;
		}
		$normalized = array( 'uri' => $uri );
		if ( isset( $arguments['section'] ) ) {
			if ( ! is_string( $arguments['section'] ) || strlen( $arguments['section'] ) > 130 ) {
				return null;
			}
			$slug = strtolower( trim( $arguments['section'] ) );
			if ( 'top' !== $slug && ! preg_match( '/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $slug ) ) {
				return null;
			}
			$normalized['section'] = $slug;
		}
		if ( isset( $arguments['offset'] ) ) {
			if ( ! is_int( $arguments['offset'] ) || $arguments['offset'] < 0 || $arguments['offset'] > 100000000 ) {
				return null;
			}
			if ( ! isset( $normalized['section'] ) ) {
				return null;
			}
			$normalized['offset'] = $arguments['offset'];
		}
		return $normalized;
	}

	/**
	 * Execute get_sections.
	 *
	 * @param array<string,mixed> $args Normalized args from validate().
	 * @return array<string,mixed> Shape ['ok'=>bool,'result'=>mixed,'error'=>string,'code'=>string].
	 */
	public static function execute( array $args ): array {
		$post = Corsen_Context_Tool_Registry::exposable_post( (string) $args['uri'] );
		if ( null === $post ) {
			return array(
				'ok'    => false,
				'code'  => 'not_found',
				'error' => 'Resource not found, not published, or not exposed to agents. Use a URL from get_sitemap, list_content, or search_site.',
			);
		}

		$meta     = Corsen_Context_Content_Converter::get_post_metadata( $post );
		$markdown = Corsen_Context_Content_Converter::post_to_markdown( $post );
		$sections = self::outline( $markdown );

		if ( ! isset( $args['section'] ) ) {
			$listed    = array_slice( $sections, 0, self::MAX_OUTLINE );
			$result    = array(
				'url'          => $meta['url'],
				'title'        => $meta['title'],
				'lastModified' => $meta['modified'],
				'totalBytes'   => strlen( $markdown ),
				'sectionCount' => count( $sections ),
				'sections'     => $listed,
			);
			$truncated = count( $sections ) > self::MAX_OUTLINE;
			if ( $truncated ) {
				$result['outlineTruncated'] = true;
			}
			return array(
				'ok'     => true,
				'result' => $result,
			);
		}

		$wanted = $args['section'];
		foreach ( $sections as $section ) {
			if ( $section['id'] !== $wanted ) {
				continue;
			}
			$body  = $section['markdown'];
			$bytes = strlen( $body );
			$off   = isset( $args['offset'] ) ? self::snap_offset( $body, (int) $args['offset'] ) : 0;
			$chunk = substr( $body, $off, self::SECTION_BUDGET );
			$next  = $off + strlen( $chunk );

			$result = array(
				'url'        => $meta['url'],
				'title'      => $meta['title'],
				'section'    => array(
					'id'      => $section['id'],
					'level'   => $section['level'],
					'heading' => $section['heading'],
				),
				'offset'     => $off,
				'bytes'      => strlen( $chunk ),
				'totalBytes' => $bytes,
				'markdown'   => $chunk,
			);
			if ( $next < $bytes ) {
				$result['nextOffset'] = $next;
			}
			return array(
				'ok'     => true,
				'result' => $result,
			);
		}

		return array(
			'ok'    => false,
			'code'  => 'section_not_found',
			'error' => 'No section with id "' . $wanted . '" on this page. Call get_sections without "section" to list the valid ids.',
			'ids'   => array_map(
				static function ( array $section ): string {
					return $section['id'];
				},
				array_slice( $sections, 0, self::MAX_OUTLINE )
			),
		);
	}

	/**
	 * Flat outline: one entry per heading line plus a "top" entry when
	 * content precedes the first heading. Sections are flat on purpose:
	 * subtree semantics would surprise more agents than they help.
	 *
	 * @param string $markdown Page markdown from the converter.
	 * @return array<int,array<string,mixed>>
	 */
	private static function outline( string $markdown ): array {
		if ( ! preg_match_all( '/^(#{1,6}) (.*)$/m', $markdown, $matches, PREG_OFFSET_CAPTURE ) ) {
			$body = trim( $markdown );
			if ( '' === $body ) {
				return array();
			}
			return array(
				array(
					'id'       => 'top',
					'level'    => 0,
					'heading'  => '',
					'bytes'    => strlen( $body ),
					'markdown' => $body,
				),
			);
		}

		$used   = array();
		$out    = array();
		$starts = array();
		foreach ( $matches[0] as $index => $match ) {
			$starts[] = array(
				'pos'     => $match[1],
				'level'   => strlen( $matches[1][ $index ][0] ),
				'heading' => trim( wp_strip_all_tags( $matches[2][ $index ][0] ) ),
			);
		}

		if ( $starts[0]['pos'] > 0 ) {
			$intro = trim( substr( $markdown, 0, $starts[0]['pos'] ) );
			if ( '' !== $intro ) {
				$out[] = array(
					'id'       => 'top',
					'level'    => 0,
					'heading'  => '',
					'bytes'    => strlen( $intro ),
					'markdown' => $intro,
				);
			}
		}

		$count = count( $starts );
		for ( $i = 0; $i < $count; $i++ ) {
			$end  = $i + 1 < $count ? $starts[ $i + 1 ]['pos'] : strlen( $markdown );
			$body = rtrim( substr( $markdown, $starts[ $i ]['pos'], $end - $starts[ $i ]['pos'] ) );
			$slug = self::slug( $starts[ $i ]['heading'] );
			if ( isset( $used[ $slug ] ) ) {
				++$used[ $slug ];
				$slug .= '-' . $used[ $slug ];
			} else {
				$used[ $slug ] = 1;
			}
			$out[] = array(
				'id'       => $slug,
				'level'    => $starts[ $i ]['level'],
				'heading'  => $starts[ $i ]['heading'],
				'bytes'    => strlen( $body ),
				'markdown' => $body,
			);
		}

		return $out;
	}

	/**
	 * ASCII slug for a heading; unicode-only headings fall back to "section".
	 *
	 * @param string $heading Heading text.
	 * @return string
	 */
	private static function slug( string $heading ): string {
		$slug = strtolower( $heading );
		$slug = html_entity_decode( $slug, ENT_QUOTES | ENT_HTML5, 'UTF-8' );
		$slug = preg_replace( '/[^a-z0-9]+/', '-', $slug ) ?? '';
		$slug = trim( $slug, '-' );
		if ( '' === $slug ) {
			$slug = 'section';
		}
		return strlen( $slug ) > 90 ? rtrim( substr( $slug, 0, 90 ), '-' ) : $slug;
	}

	/**
	 * Snap a byte offset to a UTF-8 character boundary so a page can never
	 * split a code point in half.
	 *
	 * @param string $body Section body.
	 * @param int    $offset Requested byte offset.
	 * @return int
	 */
	private static function snap_offset( string $body, int $offset ): int {
		$bytes = strlen( $body );
		if ( $offset >= $bytes ) {
			return $bytes;
		}
		while ( $offset > 0 && 0x80 === ( ord( $body[ $offset ] ) & 0xC0 ) ) {
			--$offset;
		}
		return $offset;
	}
}
