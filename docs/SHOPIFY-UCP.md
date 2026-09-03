# Shopify native WebMCP, Storefront MCP, and UCP

Shopify owns these commerce surfaces. They are not Corsen Context adapters and
they do not expose Corsen Context's four-tool public-content contract.

## WebMCP in a shopper's tab

Shopify currently provides in-page WebMCP tools on every Liquid storefront
without an app or configuration step. Hydrogen support is available through a
developer preview. A compatible Chromium-based agent can discover tools for
catalog search, product lookup, cart updates, checkout navigation, order
navigation, and policy search through `document.modelContext`.

These tools act on the shopper's visible tab and cart session. Test them on the
actual storefront and theme that will be used; browser support remains limited.

Official reference:
<https://shopify.dev/docs/api/web-mcp>

## Server-side Storefront MCP

An external agent can connect to a store's standard Storefront MCP endpoint:

```text
POST https://{store-domain}/api/mcp
```

Shopify documents store-policy tools on this standard endpoint. Its legacy
`get_cart` and `update_cart` tools were deprecated in favour of UCP Cart MCP,
with maintenance promised only through August 31, 2026. Clients must inspect
the live `tools/list` result instead of assuming those legacy cart tools remain.

Official reference:
<https://shopify.dev/docs/apps/build/storefront-mcp/servers/storefront>

Deprecation notice:
<https://shopify.dev/changelog/storefront-mcp-cart-tools-are-being-deprecated-in-favour-of-ucp-cart-mcp>

## UCP catalog MCP

Shopify's UCP catalog capability uses a separate endpoint:

```text
POST https://{store-domain}/api/ucp/mcp
```

It exposes `search_catalog`, `lookup_catalog`, and `get_product`. Tool calls
require `meta.ucp-agent.profile`, pointing to the calling agent's hosted UCP
profile. Some stores can restrict access, so a successful result must be
verified against the intended store rather than inferred from discovery alone.

## Corsen verification kit

The standalone
[`corsen-context-shopify-native`](https://github.com/CorsenAI/corsen-context-shopify-native)
repository provides a small command-line verifier and a browser checklist for
store owners. It installs no app, requests no Admin API scopes, and stores no
shop credentials.

A future Corsen Shopify app would require a separate security and distribution
review. It must not be represented by an OAuth URL or a documentation-only
claim.
