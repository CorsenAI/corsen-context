# Corsen Context — Express Example

Minimal Express server with full MCP + llms.txt support.

## Setup

```bash
cd examples/express
npm install
npm start
```

## Endpoints

- `GET /` — Landing page
- `GET /llms.txt` — AI context file
- `GET /llms-full.txt` — Full content dump
- `POST /v1/mcp` — MCP JSON-RPC endpoint

## Test

```bash
# Get llms.txt
curl http://localhost:3000/llms.txt

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
