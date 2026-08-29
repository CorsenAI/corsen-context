# Corsen Context — Next.js App Router Example

Minimal working example of Corsen Context with Next.js App Router.

## Setup

```bash
cd examples/nextjs-app-router
npm install
npm run dev
```

## What's included

- `app/v1/mcp/route.ts` — MCP endpoint (POST + OPTIONS), for agents outside the browser
- `app/webmcp.js/route.ts` — WebMCP bridge, loaded from `app/layout.tsx`; registers the tools with an agent running inside the page (`document.modelContext`)
- `app/llms.txt/route.ts` — static discovery overview
- `lib/provider.ts` — Demo content provider with static data
- `app/page.tsx` — Landing page with instructions

## Test

```bash
# Initialize MCP
curl -X POST http://localhost:3000/v1/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","id":1}'

# List tools
curl -X POST http://localhost:3000/v1/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":2}'

# Search
curl -X POST http://localhost:3000/v1/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"search_site","arguments":{"query":"MCP"}},"id":3}'
```

## WebMCP (in-browser agents)

Open the site in a WebMCP-capable browser — Chrome with
`chrome://flags/#enable-webmcp-testing` enabled (relaunch required), or an
agent browser with built-in support. The bridge in `app/layout.tsx` registers
the same four tools; every call is forwarded to `/v1/mcp`, so the browser
never reimplements a tool. Ask the in-page agent, e.g. *"search this site for
MCP and summarise the top result"*.
