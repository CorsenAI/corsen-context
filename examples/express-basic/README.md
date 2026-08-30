# Corsen Context — Express Example

Minimal Express server with a bounded MCP 2025-11-25 JSON transport,
WebMCP, and llms.txt support.

## Setup

```bash
cd examples/express-basic
npm install
npm start
```

The public npm release requires `@corsenai/corsen-context` 1.3.0 or newer for
the WebMCP exports. This checkout targets the unpublished 2.0.0 candidate and
the repository verifier installs its local package archive without changing
this example's stable dependency or lockfile.
The local default is `http://localhost:3000`. For deployment, set `SITE_URL`
to the site's canonical public origin before starting the service. Replace the
sample `provider` in `server.js` with your own public CMS/database adapter.

## Endpoints

- `GET /` — Landing page (loads the WebMCP bridge)
- `GET /llms.txt` — AI context file
- `GET /llms-full.txt` — bounded full-content export; `404` by default
- `GET /v1/mcp` — `405 Method Not Allowed` (this example does not implement SSE)
- `POST /v1/mcp` — MCP JSON-RPC endpoint
- `OPTIONS /v1/mcp` — validated CORS preflight
- `GET /webmcp.js` — WebMCP bridge: registers the same tools with an in-page
  agent (`document.modelContext`); every call is forwarded to `/v1/mcp`

## Owner switches

- `CORSEN_CONTEXT_MCP_ENABLED=false` makes `/v1/mcp` and `/webmcp.js` return
  `404`.
- `CORSEN_CONTEXT_LLMS_TXT_ENABLED=false` makes both static export routes
  return `404`.
- `CORSEN_CONTEXT_LLMS_FULL_TXT_ENABLED=true` explicitly enables
  `/llms-full.txt`; it is disabled by default.

The core defaults static output to a 5 MiB UTF-8 byte limit, bounded from 64
KiB through 10 MiB, and never splits a code point while truncating.

## Test

```bash
# Get llms.txt
curl http://localhost:3000/llms.txt

# Get the WebMCP bridge script
curl http://localhost:3000/webmcp.js

# Initialize MCP
curl -X POST http://localhost:3000/v1/mcp \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"curl","version":"1"}},"id":1}'

# Acknowledge initialization (must return HTTP 202 with an empty body)
curl -i -X POST http://localhost:3000/v1/mcp \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -H "MCP-Protocol-Version: 2025-11-25" \
  -d '{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}'

# Search
curl -X POST http://localhost:3000/v1/mcp \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -H "MCP-Protocol-Version: 2025-11-25" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"search_site","arguments":{"query":"hello"}},"id":2}'

# Ping
curl -X POST http://localhost:3000/v1/mcp \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -H "MCP-Protocol-Version: 2025-11-25" \
  -d '{"jsonrpc":"2.0","method":"ping","id":3}'
```

The MCP route validates Origin and request/response media types before parsing,
rate-limits before optional authentication, and accepts at most 100 KiB of
JSON. It returns bounded JSON errors for malformed or oversized bodies and does
not use Express's default HTML error page for those parser failures.

## Browser security mode

The page, `/webmcp.js`, and `/v1/mcp` share one origin. The WebMCP bridge
intentionally sends no API key or visitor credentials. Keep this endpoint
public, read-only, rate-limited, and backed only by public content. If you set
`CORSEN_CONTEXT_API_KEY`, remove the bridge script and use the endpoint only
from authenticated server-side MCP clients.
