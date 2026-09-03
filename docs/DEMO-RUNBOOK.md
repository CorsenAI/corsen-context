# Reproducible demo runbook

This runbook demonstrates the live candidate through observable WebMCP tool
calls. It does not rely on a prerecorded answer, a simulated agent transcript,
or an HTTP-only claim.

The flagship is the real Corsen Context WordPress site. Aurora Kits is a
fictional, deterministic corpus used only by the non-WordPress reference
deployments; its prices and policies are test fixtures, not commercial offers.

## Preconditions

- Use a WebMCP-capable browser/client configured according to
  [WebMCP browser setup](WEBMCP-BROWSER-SETUP.md).
- Open `https://webmcp.corsen.ai/` as a top-level page and reload it after the
  browser feature or client is enabled.
- Confirm that the flagship exposes nine tools. The shared core is
  `search_site`, `get_page_content`, `list_content`, and `get_sitemap`. The
  WordPress extensions are `get_product`, `get_sections`,
  `get_structured_data`, `check_agent_access`, and `request_expert_call`.
- Confirm that every tool except `request_expert_call` is annotated read-only;
  `request_expert_call` is explicitly annotated `readOnlyHint: false`.
- Do not continue if the live page, tool client, or expected tool set is
  missing. Record the failure instead of substituting a mock.

## Recommended judge path

Run the prompts in a client that exposes its real tool activity. The agent may
choose a slightly different valid call order, but every reported fact must be
grounded in a visible tool result and canonical source URL.

### 1. Grounded catalogue answer

> List the Corsen Context editions, read the flagship product, and find the
> demo-store promo code. Tell me the flagship price and purchase policy, and
> include the source URLs.

Expected evidence:

- `list_content({"type":"product"})` returns eleven live products;
- `get_product({"slug":"corsen-context"})` returns EUR 29 and
  `agentPurchase: forbidden` with the canonical product URL;
- `search_site({"query":"WEBMCP100"})` returns the store page; and
- `get_page_content({"uri":"https://webmcp.corsen.ai/store/"})` returns the
  published promo code from that same canonical page.

The purchase flag is an instruction in the agent-facing contract. It does not
intercept or alter the ordinary human checkout, and the recording must not
claim otherwise.

### 2. Human-only boundary

Inspect `request_expert_call` before invoking it. Its annotation is deliberately
non-read-only. A valid deterministic test call is:

```json
{
  "name": "WebMCP reviewer",
  "email": "reviewer@example.com",
  "website": "https://example.com",
  "stack": "WordPress",
  "message": "Please explain the integration boundary."
}
```

The JSON-RPC response contains `result.isError: true` plus
`result.structuredContent.ok: false` and `error_code: human_only`; the WebMCP
inspector surfaces the error message and human handoff. No supplied field value
is stored or emailed. When optional audit logging is enabled, a metadata-only
row may record the attempt without those field values. If the client chooses
not to invoke a non-read-only tool without confirmation, that is valid client
behavior; the Chrome inspector can execute the deterministic test directly.

### 3. Cross-stack portability

On the flagship, scroll to **The same four-tool core, live on ten stacks**. Open
the Express or Astro deployment from the grid. The target must display its own
public repository and the same four core tool names. Select **Run live trace**:
all four rows must finish successfully.

The repository-level receipt is:

```sh
node scripts/verify-live.mjs
```

The expected final line is `VERIFIED: 10/10 live integrations match the
manifest.` The manifest SHA-256 is
`3786c5d0d401cb9862291c9e3903ff0bd35925326b7dbc9be75f15ded2604ef4`.

## Implementation evidence

The public repository must visibly contain:

- the imperative `document.modelContext.registerTool(...)` path in `README.md`;
- `tools.manifest.json`, which defines the shared contract;
- the TypeScript implementation and independent PHP WordPress implementation;
- parity, transport, browser-bridge, package, and live verification tests; and
- installation paths for every advertised integration.

## HTTP contract fallback

HTTP checks prove the server contract when a browser/client is unavailable;
they do not prove WebMCP registration or execution. For a single MCP endpoint,
the minimum JSON-RPC sequence is `initialize`, `notifications/initialized`,
`tools/list`, `search_site`, then `get_page_content` with a same-origin URL
returned by the search.

Every POST uses `Content-Type: application/json`,
`Accept: application/json, text/event-stream`, and, after initialization,
`MCP-Protocol-Version: 2025-11-25`. The initialized notification must return an
empty HTTP `202 Accepted` response. The Node examples use `/v1/mcp`; WordPress
publishes its exact REST endpoint through enabled discovery surfaces.

## Evidence receipt

For the final client, record:

- UTC timestamp, public URL, browser/client name, and exact version;
- source revision and deployed package/plugin versions;
- the registered tool names and annotations;
- prompt, ordered calls, arguments, source URLs, and final answer;
- console or network errors, including zero when none are observed; and
- the separate `verify-live` result.

Do not infer support for ChatGPT, Chrome, an extension, or another client from
success in a different client. Label each receipt independently.

## Stop conditions

Stop the recording and fix the candidate if any of these occurs:

- a core tool is missing, duplicated, or has a different schema;
- an unexpected extension appears on the WordPress flagship;
- search returns an empty or cross-origin result;
- `get_page_content` reads a URL that was not returned by the site;
- a product or policy fact differs between the human page and tool output;
- `request_expert_call` produces a business side effect instead of `human_only`;
- a page displays a fabricated response as if an agent produced it; or
- registration, hydration, endpoint, console, or network errors are hidden.
