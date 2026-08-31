# Shopify — Universal Commerce Protocol (UCP)

Shopify storefronts expose commerce to AI agents **natively** over the Universal
Commerce Protocol (UCP). No Corsen Context code is required: the platform
generates the discovery surface, the MCP endpoint, and the in-page WebMCP bridge
for every store.

## Discovery

- `GET https://{shop}.myshopify.com/.well-known/ucp` — UCP merchant profile:
  protocol version, services, capabilities, and payment handlers.

## MCP endpoint

- `POST https://{shop}.myshopify.com/api/ucp/mcp`
- Header: `MCP-Protocol-Version: 2025-11-25`
- `tools/list` returns 13 commerce tools:

| Domain   | Tools                                                                                             |
| -------- | ------------------------------------------------------------------------------------------------- |
| Checkout | `get_checkout`, `create_checkout`, `update_checkout`, `complete_checkout`, `cancel_checkout`      |
| Cart     | `get_cart`, `create_cart`, `update_cart`, `cancel_cart`                                           |
| Order    | `get_order`                                                                                        |
| Catalog  | `search_catalog`, `lookup_catalog`, `get_product`                                                  |

## Agent profile

`tools/call` requires `meta.ucp-agent.profile` — a URL to a JSON agent profile
that the agent hosts — so the store can negotiate capabilities. A valid fixture
for testing:

```text
https://shopify.dev/ucp/agent-profiles/2026-08-25/valid-with-capabilities.json
```

Without it, calls fail with `profile_malformed`.

## WebMCP in the page

The storefront injects `document.modelContext.registerTool(...)`, so
WebMCP-capable browsers discover the same commerce tools client-side.

## Install flow (custom distribution)

The reference app is distributed as a custom app from the Shopify Dev Dashboard.
Any store installs it via the OAuth authorize link:

```text
https://{shop}.myshopify.com/admin/oauth/authorize?client_id={CLIENT_ID}&scope=read_products,write_products&redirect_uri={REDIRECT_URI}&state={nonce}
```

After approval the redirect URI receives an authorization `code`, exchanged for
an access token at `POST https://{shop}/admin/oauth/access_token`.

## Reference

- [UCP specification](https://ucp.dev)
- [Shopify agent profiles and UCP negotiation](https://shopify.dev/docs/agents/profiles)
