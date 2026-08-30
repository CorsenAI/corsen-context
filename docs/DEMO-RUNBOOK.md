# Reproducible demo runbook

This runbook demonstrates the candidate through observable tool calls. It does
not rely on a prerecorded response or a simulated agent transcript.

Aurora Kits is a fictional, deterministic demo corpus. Its prices and policies
are test fixtures, not commercial offers.

## Preconditions

- Use a WebMCP-capable browser/client configured according to
  [WebMCP browser setup](WEBMCP-BROWSER-SETUP.md).
- Open `https://webmcp.corsen.ai/` as a top-level page and reload it after the
  bridge is enabled.
- Confirm that the page and tool client identify exactly four tools:
  `search_site`, `get_page_content`, `list_content`, and `get_sitemap`.
- Do not continue if the candidate content, tool contract, or browser API is
  missing. Record the failure rather than substituting a mock.

## Four grounded scenarios

Run the prompts in a client that shows its real tool activity. Wording may vary
slightly, but the calls and source facts must remain visible.

### 1. Product fit

> I have EUR 100 for an 11-year-old and need a kit with no soldering. Compare
> the available kits and recommend one from this site with the price and reason.

Expected evidence:

- `search_site` finds the product comparison;
- `get_page_content` reads the returned same-origin page;
- Explorer v2 is grounded as EUR 89, age 10+, 24 projects, no soldering;
- Maker and Pro facts are sourced from the same public corpus, not invented.

### 2. Support diagnosis

> My Aurora Maker arm shows AK-E17. Find the official guide on this site and
> give only its three recovery steps and the escalation condition.

Expected evidence:

- the search result title or description contains `AK-E17`;
- the client opens that exact result with `get_page_content`;
- the answer contains the three published steps in order and the published
  escalation condition.

### 3. School order policy

> A verified school in Lyon is considering Aurora Maker kits. What discount,
> delivery time, delivery cost, returns period, and parts warranty does this
> site publish?

Expected source facts are 20% for verified schools or clubs, EU delivery in
2–4 business days at no delivery charge, 30-day returns, and a two-year parts
warranty.

### 4. Access boundary

> Can you buy a Pro kit, submit a form, modify this site, or access private
> content through these tools? Explain the boundary using the site's policy.

A grounded answer must distinguish public search/read/list/sitemap access from
purchase, submission, modification, deletion, and private-content access. The
registered tools themselves must remain read-only.

## HTTP contract fallback

HTTP checks prove the server contract when a browser/client is unavailable;
they do not prove WebMCP execution. From the repository root, run:

```sh
pnpm verify:live
```

Exit code `0` is required before recording the final demo. The verifier checks
all public targets against `tools.manifest.json`. See
[live verification](LIVE-VERIFICATION.md) for the exact boundary.

For a single MCP endpoint, the minimum JSON-RPC sequence is:

Every POST below uses `Content-Type: application/json` and
`Accept: application/json, text/event-stream`.

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-11-25",
    "capabilities": {},
    "clientInfo": { "name": "manual-verifier", "version": "1.0.0" }
  }
}
```

then:

```json
{ "jsonrpc": "2.0", "method": "notifications/initialized", "params": {} }
```

The notification must return HTTP `202 Accepted` with an empty body. Then:

```json
{ "jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {} }
```

then a two-tool chain:

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": { "name": "search_site", "arguments": { "query": "AK-E17", "limit": 3 } }
}
```

Copy one same-origin URL returned by that call into:

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": { "name": "get_page_content", "arguments": { "uri": "RETURNED_URL" } }
}
```

Send `MCP-Protocol-Version: 2025-11-25` on the initialized notification and
every later request. For WordPress, copy the exact absolute MCP URL displayed
under Settings > Corsen Context or published by an enabled discovery surface;
do not construct it from the site origin. A typical pretty-permalink URL uses
`/wp-json/corsen-context/v1/mcp`, Plain permalinks can use
`?rest_route=/corsen-context/v1/mcp`, and a filtered REST prefix can differ.
The supplied Node examples use `/v1/mcp` on their own origin.

## Evidence receipt

For each final client, record:

- UTC timestamp, public URL, browser/client name, and exact version;
- source revision and deployed package/plugin versions;
- the four registered tool names;
- prompt, ordered tool calls, arguments, returned source URL, and final answer;
- console or network errors, including zero when none are observed;
- one desktop recording and one narrow viewport check;
- a separate HTTP verifier result.

Do not infer support for ChatGPT, Chrome, an extension, or another client from
success in a different client. Label each receipt independently.

## Stop conditions

Stop the recording and fix the candidate if any of these occurs:

- a tool is missing, duplicated, or has a different schema;
- search returns an empty or cross-origin result;
- the second call reads a URL that was not returned by the first call;
- a product or policy fact differs between the human page and tool output;
- an action-capable tool appears;
- the page shows a fabricated response as if an agent produced it;
- browser registration or endpoint errors are hidden from the receipt.
