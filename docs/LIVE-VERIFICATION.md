# Live integration verification

Run the public verification from the repository root with Node.js 22.13 or newer:

```sh
pnpm verify:live
```

The script checks all ten configured public integrations without credentials.
It performs `GET` requests for discovery and bridge surfaces plus MCP `POST`
requests with `Content-Type: application/json` and
`Accept: application/json, text/event-stream`. The read-only MCP lifecycle is
`initialize`, `notifications/initialized`, `tools/list`, `search_site`, then
`get_page_content` on one returned URL. Calls after initialize carry the exact
`MCP-Protocol-Version` header.

For every integration it verifies:

- the home page and `/llms.txt` are reachable with the expected content type;
- the delivered WebMCP bridge contains `modelContext.registerTool` and all
  manifest tool names;
- MCP negotiates protocol version `2025-11-25`;
- `notifications/initialized` is accepted as HTTP `202` with an empty body;
- `serverInfo.name` and `serverInfo.version` are present and non-empty;
- tool names, descriptions and input schemas match `tools.manifest.json`
  exactly;
- a stack-specific `search_site` query returns at least one same-origin result;
- `get_page_content` reads the selected result, preserves its same-origin path,
  and contains the scenario's expected public marker.

The contract hash is SHA-256 over canonical JSON: object keys are sorted while
array order is preserved. This means tool order, required-field order and every
schema constraint remain part of the checked contract. In particular, when the
manifest declares `additionalProperties: false`, a live endpoint that omits it
fails verification.

Exit code `0` means every check passed. Exit code `1` means a live surface,
contract or search result failed. Exit code `2` means the verifier itself could
not start, for example because the local manifest is invalid.

The presence of a URL in the manifest is not a success claim. Treat every
public deployment as stale until this command exits `0` for the exact candidate.

The four Aurora reference stacks use the deterministic `AK-E17` guide chain;
the WordPress flagship uses the Explorer v2 product page. CMS bridges use a
source-specific public page until their own Aurora fixtures are installed.

This is deterministic HTTP evidence, not a substitute for opening a page in a
WebMCP-capable browser and executing a registered tool there.
