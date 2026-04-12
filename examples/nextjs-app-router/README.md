# Corsen Context — Next.js App Router Example

Minimal working example of Corsen Context with Next.js App Router.

## Setup

```bash
cd examples/nextjs-app-router
npm install
npm run dev
```

## What's included

- `app/v1/mcp/route.ts` — MCP endpoint (POST + OPTIONS)
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
