# Corsen Context — Express Example

Minimal Express server with full MCP + WebMCP + llms.txt support.

## Setup

```bash
cd examples/express-basic
npm install
npm start
```

Requires `@corsenai/corsen-context` ≥ 1.3.0 (the WebMCP bridge exports).

## Endpoints

- `GET /` — Landing page (loads the WebMCP bridge)
- `GET /llms.txt` — AI context file
- `GET /llms-full.txt` — Full content dump
- `POST /v1/mcp` — MCP JSON-RPC endpoint
- `GET /webmcp.js` — WebMCP bridge: registers the same tools with an in-page
  agent (`document.modelContext`); every call is forwarded to `/v1/mcp`

## Test

```bash
# Get llms.txt
curl http://localhost:3000/llms.txt

# Get the WebMCP bridge script
curl http://localhost:3000/webmcp.js

# Initialize MCP
curl -X POST http://localhost:3000/v1/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","id":1}'

# Search
curl -X POST http://localhost:3000/v1/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"search_site","arguments":{"query":"hello"}},"id":2}'

# Ping
curl -X POST http://localhost:3000/v1/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"ping","id":3}'
```
