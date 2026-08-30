# Corsen Context — Next.js App Router Example

Minimal working example of Corsen Context with Next.js App Router.

## Setup

```bash
cd examples/nextjs-app-router
npm install
npm run dev
```

The local default is `http://localhost:3000`. For deployment, copy
`.env.example` to `.env.local` and set `NEXT_PUBLIC_SITE_URL` to the site's
canonical public origin before building. Replace `lib/provider.ts` with a
provider backed by your own public content.

## What's included

- `app/v1/mcp/route.ts` — MCP endpoint (GET 405 + POST + OPTIONS), for agents outside the browser
- `app/webmcp.js/route.ts` — WebMCP bridge, loaded from `app/layout.tsx`; registers the tools with an agent running inside the page (`document.modelContext`)
- `app/llms.txt/route.ts` — static discovery overview
- `lib/provider.ts` — Demo content provider with static data
- `app/page.tsx` — Landing page with instructions

The example does not mount a full-content route. In the adapter defaults,
`static.includeFullContent` is `false`; a mounted `/llms-full.txt` handler would
return `404` until explicitly enabled. Setting `static.generateLlmsTxt: false`
makes both static handlers return `404`, while `mcp.enabled: false` makes MCP
and WebMCP handlers return `404`. Static output defaults to a 5 MiB UTF-8 byte
limit (accepted range: 64 KiB–10 MiB).

For a real project, keep the full configuration in a server-only module and
import it directly into these route handlers. `withCorsenContext` does not copy
configuration into `nextConfig.env` or a client bundle; do not put credentials
in `NEXT_PUBLIC_*`.

## Test

```bash
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

# List tools
curl -X POST http://localhost:3000/v1/mcp \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -H "MCP-Protocol-Version: 2025-11-25" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":2}'

# Search
curl -X POST http://localhost:3000/v1/mcp \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -H "MCP-Protocol-Version: 2025-11-25" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"search_site","arguments":{"query":"MCP"}},"id":3}'
```

The MCP handler validates Origin and media types before parsing, rate-limits
before optional authentication, reads at most 100 KiB of JSON, and returns
bounded JSON errors for malformed or oversized bodies.

## WebMCP (in-browser agents)

Open the site in a WebMCP-capable browser — Chrome with
`chrome://flags/#enable-webmcp-testing` enabled (relaunch required), or an
agent browser with built-in support. The bridge in `app/layout.tsx` registers
the same four tools; every call is forwarded to `/v1/mcp`, so the browser
never reimplements a tool. Ask the in-page agent, e.g. _"search this site for
MCP and summarise the top result"_.

WebMCP requires `/webmcp.js` and `/v1/mcp` to remain on the page's origin.
The bridge deliberately sends no credentials, so do not configure a secret
API key on this public endpoint while WebMCP is enabled. Use the built-in rate
limit and expose only public content. If the endpoint must require a key,
remove the bridge script and use it only from authenticated server-side MCP
clients.
