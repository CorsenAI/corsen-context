<?php
/**
 * WooCommerce product reader for Corsen Context.
 *
 * WordPress-only extension tool (deliberately outside the cross-runtime
 * tools.manifest.json contract): reads one published product with live
 * price and stock through WooCommerce APIs — never raw SQL — so an agent
 * can answer "how much is X and is it available" without scraping the
 * store page. Fail-closed: requires the owner toggle, WooCommerce, the
 * publish status, no password, and the site's post-type policy.
 *
 * Powered by Corsen Context - Built by Corsen AI - github.com/CorsenAI/corsen-context
 *
 * @package Corsen_Context
 */

defined( 'ABSPATH' ) || exit;

/**
 * Get_product tool implementation.
 */
class Corsen_Context_Products {

	/** Hard cap for variant lists, so a huge catalog cannot bloat a response. */
	private const MAX_VARIANTS = 20;

	/** Hard cap for plain-text description length in the payload. */
	private const MAX_DESCRIPTION = 1500;

	/**
	 * Public contract for tools/list (WP-only extension, manifest untouched).
	 *
	 * @return array<string,mixed>
	 */
	public static function definition(): array {
		return array(
			'name'        => 'get_product',
			'description' => 'Read one product from this store with live commercial data: price, sale status, stock status and quantity, images, categories, and for variable products up to 20 variants with their price and availability. Pass exactly one of slug or uri, taken from list_content(type=product) or search_site output. Every product also carries agentPurchase (allowed|forbidden) with a reason: on forbidden, an AI agent must not start checkout — hand the product URL to a human. Read-only.',
			'inputSchema' => array(
				'type'                 => 'object',
				'properties'           => array(
					'slug' => array(
						'type'        => 'string',
						'minLength'   => 1,
						'maxLength'   => 200,
						'pattern'     => '^(?:[A-Za-z0-9_-]|%[0-9A-Fa-f]{2})+$',
						'description' => 'The product slug: the last path segment of its /product/ URL. Provide this or uri, never both.',
					),
					'uri'  => array(
						'type'        => 'string',
						'minLength'   => 1,
						'maxLength'   => 2000,
						'description' => 'The product page absolute URL on this site, exactly as returned by list_content or search_site. Provide this or slug, never both.',
					),
				),
				'oneOf'                => array(
					array(
						'type'     => 'object',
						'required' => array( 'slug' ),
					),
					array(
						'type'     => 'object',
						'required' => array( 'uri' ),
					),
				),
				'additionalProperties' => false,
			),
		);
	}

	/**
	 * Validate arguments: exactly one of slug or uri.
	 *
	 * @param array<mixed> $arguments Raw arguments.
	 * @return array<string,string>|null Normalized args, or null on violation.
	 */
	public static function validate( array $arguments ): ?array {
		foreach ( array_keys( $arguments ) as $key ) {
			if ( ! in_array( $key, array( 'slug', 'uri' ), true ) ) {
				return null;
			}
		}
		$slug = isset( $arguments['slug'] ) && is_string( $arguments['slug'] ) ? trim( $arguments['slug'] ) : '';
		$uri  = isset( $arguments['uri'] ) && is_string( $arguments['uri'] ) ? trim( $arguments['uri'] ) : '';
		if ( ( '' === $slug ) === ( '' === $uri ) ) {
			// Neither or both: exactly one selector is required.
			return null;
		}
		if ( '' !== $slug && ( strlen( $slug ) > 200 || ! preg_match( '/^(?:[A-Za-z0-9_\-]|%[0-9A-Fa-f]{2})+$/', $slug ) ) ) {
			return null;
		}
		$uri_length = Corsen_Context_Content_Converter::utf8_length( $uri );
		if ( '' !== $uri && ( 0 === $uri_length || $uri_length > 2000 ) ) {
			return null;
		}
		return '' !== $slug
			? array(
				'slug' => $slug,
				'uri'  => '',
			)
			: array(
				'slug' => '',
				'uri'  => $uri,
			);
	}

	/**
	 * Whether WooCommerce is active enough to serve this tool.
	 */
	public static function woocommerce_active(): bool {
		return class_exists( 'WooCommerce' ) && function_exists( 'wc_get_product' );
	}

	/**
	 * Resolve a product ID from its slug.
	 *
	 * The wc_get_product_id_by_slug() global is legacy (removed in modern
	 * WooCommerce); WC_Product_Query is the HPOS-aware lookup.
	 *
	 * @param string $slug Product slug.
	 * @return int Product ID or 0.
	 */
	private static function resolve_id_by_slug( string $slug ): int {
		// Never trust a lookup we cannot verify: WC_Product_Query silently
		// ignores an unsupported "slug" arg and returns the first product,
		// which made get_product(slug=X) serve a different product entirely
		// (audited live 2026-09-01). Resolve, then require the product's own
		// stored slug to match, case-insensitive, or report not-found.
		$candidate = 0;
		if ( function_exists( 'wc_get_product_id_by_slug' ) ) {
			$candidate = (int) wc_get_product_id_by_slug( $slug );
		}
		if ( $candidate <= 0 && function_exists( 'get_page_by_path' ) ) {
			$page      = get_page_by_path( $slug, OBJECT, 'product' );
			$candidate = $page ? (int) $page->ID : 0;
		}
		if ( $candidate <= 0 || ! function_exists( 'wc_get_product' ) ) {
			return 0;
		}
		// Verify the candidate really carries the requested slug: WP's
		// post_name is the authoritative slug, and product data objects
		// have been observed to lag it on migrated stores.
		$post_obj = get_post( $candidate );
		if ( ! $post_obj || 0 !== strcasecmp( (string) $post_obj->post_name, $slug ) ) {
			return 0;
		}
		$product = wc_get_product( $candidate );
		if ( ! $product ) {
			return 0;
		}
		return $candidate;
	}

	/**
	 * Structured media descriptor: URL plus the metadata an agent needs to
	 * decide whether to look at the image at all (alt text, dimensions).
	 *
	 * @param int $attachment_id Attachment post ID.
	 * @return array<string,mixed>|null
	 */
	public static function media( int $attachment_id ): ?array {
		if ( $attachment_id <= 0 ) {
			return null;
		}
		$src = wp_get_attachment_image_src( $attachment_id, 'large' );
		if ( ! is_array( $src ) || empty( $src[0] ) ) {
			return null;
		}
		$alt = trim( (string) get_post_meta( $attachment_id, '_wp_attachment_image_alt', true ) );
		return array(
			'url'    => (string) $src[0],
			'width'  => isset( $src[1] ) ? (int) $src[1] : null,
			'height' => isset( $src[2] ) ? (int) $src[2] : null,
			'alt'    => '' === $alt ? null : $alt,
		);
	}

	/**
	 * Execute get_product.
	 *
	 * @param array<string,string> $args Normalized args from validate().
	 * @return array<string,mixed> Shape ['ok'=>bool,'result'=>mixed,'error'=>string].
	 */
	public static function execute( array $args ): array {
		if ( ! Corsen_Context_Tool_Registry::allows_type( 'product' ) ) {
			return self::fail( 'The site owner does not expose product content to agents. Enable the product post type in Content settings.' );
		}
		if ( ! self::woocommerce_active() ) {
			return self::fail( 'WooCommerce is not active on this site, so products cannot be read.' );
		}

		$product_id = 0;
		if ( '' !== $args['slug'] ) {
			$product_id = self::resolve_id_by_slug( $args['slug'] );
			// The slug branch must obey the same owner policy as the URI
			// branch: a guessed slug may not read a product whose URL the
			// owner excluded (audited 2026-09-01: it bypassed exclusions).
			$permalink = $product_id > 0 ? (string) get_permalink( $product_id ) : '';
			$exposable = '' !== $permalink ? Corsen_Context_Tool_Registry::exposable_post( $permalink ) : null;
			if ( null === $exposable || (int) $exposable->ID !== $product_id ) {
				return self::fail( 'Product not found or not exposed to agents. Use a slug returned by list_content(type=product).' );
			}
		} elseif ( '' !== $args['uri'] ) {
			$exposable = Corsen_Context_Tool_Registry::exposable_post( $args['uri'] );
			if ( null === $exposable ) {
				return self::fail( 'URL rejected: not a public same-site URL, or the path is excluded by the site owner.' );
			}
			$product_id = (int) $exposable->ID;
		}
		if ( $product_id <= 0 ) {
			return self::fail( 'Product not found. Use a slug or URL returned by list_content(type=product) or search_site.' );
		}

		$product = wc_get_product( $product_id );
		if ( ! $product instanceof WC_Product || 'publish' !== $product->get_status() ) {
			return self::fail( 'Product not found or not published.' );
		}
		if ( post_password_required( $product_id ) ) {
			return self::fail( 'Product not found or not published.' );
		}

		return array(
			'ok'     => true,
			'result' => self::serialize_product( $product ),
		);
	}

	/**
	 * Fail shape shared by all "no result" branches.
	 *
	 * @param string $message Human/agent-readable reason.
	 * @return array<string,mixed>
	 */
	private static function fail( string $message ): array {
		return array(
			'ok'    => false,
			'error' => $message,
		);
	}

	/**
	 * Commercial payload: price, stock, media, taxonomy, variants.
	 *
	 * @param \WC_Product $product Product object.
	 * @return array<string,mixed>
	 */
	private static function serialize_product( WC_Product $product ): array {
		$id      = (int) $product->get_id();
		$price   = $product->get_price();
		$regular = $product->get_regular_price();
		$sale    = $product->get_sale_price();
		$short   = wp_strip_all_tags( (string) $product->get_short_description(), true );
		$policy  = Corsen_Context_Agent_Policy::product_policy( $id );
		$data    = array(
			'url'                 => (string) get_permalink( $id ),
			'slug'                => (string) $product->get_slug(),
			'title'               => wp_strip_all_tags( (string) get_the_title( $id ), true ),
			'type'                => (string) $product->get_type(),
			'sku'                 => (string) $product->get_sku(),
			'description'         => '' !== $short ? self::clip_utf8_bytes( $short, self::MAX_DESCRIPTION ) : '',
			'price'               => is_numeric( $price ) ? (float) $price : null,
			'regularPrice'        => is_numeric( $regular ) ? (float) $regular : null,
			'salePrice'           => is_numeric( $sale ) ? (float) $sale : null,
			'currency'            => (string) get_woocommerce_currency(),
			'priceHtml'           => wp_strip_all_tags( (string) $product->get_price_html(), true ),
			'onSale'              => (bool) $product->is_on_sale(),
			'purchasable'         => (bool) $product->is_purchasable(),
			'inStock'             => (bool) $product->is_in_stock(),
			'stockStatus'         => (string) $product->get_stock_status(),
			'agentPurchase'       => $policy['agentPurchase'],
			'agentPurchaseReason' => $policy['agentPurchaseReason'],
			'image'               => null,
			'gallery'             => array(),
			'categories'          => self::term_names( $id, 'product_cat' ),
			'tags'                => self::term_names( $id, 'product_tag' ),
			'lastModified'        => (string) get_post_modified_time( 'c', true, $id ),
		);

		$featured = self::media( (int) $product->get_image_id() );
		if ( null !== $featured ) {
			$data['image'] = $featured;
		}
		foreach ( array_slice( (array) $product->get_gallery_image_ids(), 0, 5 ) as $att ) {
			$gal = self::media( (int) $att );
			if ( null !== $gal ) {
				$data['gallery'][] = $gal;
			}
		}

		if ( $product->managing_stock() ) {
			$qty                   = $product->get_stock_quantity();
			$data['stockQuantity'] = is_numeric( $qty ) ? (int) $qty : null;
		}

		if ( 'variable' === $product->get_type() && is_callable( array( $product, 'get_children' ) ) ) {
			$variants  = array();
			$truncated = false;
			foreach ( (array) $product->get_children() as $child_id ) {
				$child = wc_get_product( (int) $child_id );
				if (
					! $child instanceof WC_Product ||
					! is_callable( array( $child, 'get_status' ) ) ||
					'publish' !== $child->get_status() ||
					( is_callable( array( $child, 'variation_is_visible' ) ) && ! $child->variation_is_visible() ) ||
					( is_callable( array( $child, 'get_parent_id' ) ) && (int) $child->get_parent_id() !== $id )
				) {
					continue;
				}
				if ( count( $variants ) >= self::MAX_VARIANTS ) {
					$truncated = true;
					break;
				}
				$cprice     = $child->get_price();
				$variants[] = array(
					'url'         => (string) get_permalink( (int) $child->get_id() ),
					'sku'         => (string) $child->get_sku(),
					'attributes'  => self::flatten_attributes( (array) $child->get_attributes() ),
					'price'       => is_numeric( $cprice ) ? (float) $cprice : null,
					'inStock'     => (bool) $child->is_in_stock(),
					'stockStatus' => (string) $child->get_stock_status(),
				);
			}
			$data['variants']  = $variants;
			$data['truncated'] = $truncated;
		}

		return $data;
	}

	/**
	 * Clip a string to a byte budget without leaving invalid UTF-8.
	 *
	 * @param string $value Source text.
	 * @param int    $limit Maximum bytes.
	 */
	private static function clip_utf8_bytes( string $value, int $limit ): string {
		if ( strlen( $value ) <= $limit ) {
			return $value;
		}
		$clipped = substr( $value, 0, $limit );
		while ( '' !== $clipped && 1 !== preg_match( '//u', $clipped ) ) {
			$clipped = substr( $clipped, 0, -1 );
		}
		return $clipped;
	}

	/**
	 * Term names for a product, defensively (taxonomy may be absent).
	 *
	 * @param int    $product_id Product post id.
	 * @param string $taxonomy   Taxonomy slug.
	 * @return string[]
	 */
	private static function term_names( int $product_id, string $taxonomy ): array {
		$terms = get_the_terms( $product_id, $taxonomy );
		if ( ! is_array( $terms ) ) {
			return array();
		}
		$names = array();
		foreach ( $terms as $term ) {
			$name    = wp_strip_all_tags( (string) $term->name );
			$names[] = $name;
		}
		return array_values(
			array_filter(
				$names,
				static function ( string $n ): bool {
					return '' !== $n;
				}
			)
		);
	}

	/**
	 * Flatten WooCommerce attribute objects to name => value(s) strings.
	 *
	 * @param array<mixed> $attributes Attribute objects.
	 * @return array<string,string>
	 */
	private static function flatten_attributes( array $attributes ): array {
		$out = array();
		foreach ( $attributes as $key => $attr ) {
			if ( is_object( $attr ) && is_callable( array( $attr, 'get_name' ) ) ) {
				$name  = (string) $attr->get_name();
				$value = implode( ', ', array_map( 'strval', (array) $attr->get_options() ) );
			} else {
				$name  = (string) $key;
				$value = is_scalar( $attr ) ? (string) $attr : '';
			}
			$name = wp_strip_all_tags( $name );
			if ( '' !== $name ) {
				$out[ $name ] = wp_strip_all_tags( $value );
			}
		}
		return $out;
	}
}
