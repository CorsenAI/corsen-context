# Corsen Context — Astro example

A minimal Astro site made agent-native by the Corsen Context Astro adapter:
`/llms.txt` for discovery, `POST /v1/mcp` for agents outside the browser, and
`/webmcp.js` — the bridge that registers the same tools with an agent running
inside the page (WebMCP, `document.modelContext`).

## Run

```bash
npm install
SITE_URL=http://localhost:4321 npm run build
SITE_URL=http://localhost:4321 npm start   # http://localhost:4321
```

The routes:

- `src/pages/llms.txt.ts` and `llms-full.txt.ts` — static AI context files
- `src/pages/v1/mcp.ts` — MCP endpoint (JSON-RPC 2.0, POST + OPTIONS)
- `src/pages/webmcp.js.ts` — the WebMCP bridge script, loaded by every page
- `src/lib/provider.ts` — demo content provider; replace with your collections

Verify a live site with `npx @corsenai/corsen-context-cli doctor --url <url>`.
