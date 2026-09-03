# Corsen Context — Astro example

A minimal Astro site made agent-native by the Corsen Context Astro adapter:
`/llms.txt` for discovery, `POST /v1/mcp` for agents outside the browser, and
`/webmcp.js` — the bridge that registers the same tools with an agent running
inside the page (WebMCP, `document.modelContext`).

[Standalone repository](https://github.com/CorsenAI/corsen-context-astro) ·
[Live demo](https://astro-webmcp.corsen.ai)

## Run

```bash
git clone https://github.com/CorsenAI/corsen-context-astro.git
cd corsen-context-astro
npm ci
cp .env.example .env
npm run build
npm start
```

PowerShell: use `Copy-Item .env.example .env` instead of `cp`. The `start`
script loads that file with Node's `--env-file` flag. On a host that injects
runtime variables directly, run `npm run start:runtime` instead; Astro's Node
adapter does not load `.env` at runtime.

The local default is `http://localhost:4321`. For deployment, copy
`.env.example` to `.env`, set `SITE_URL` to the canonical public origin, review
the three surface switches, and build again. Replace `src/lib/provider.ts`
with a provider backed by your own public content.

The routes:

- `src/pages/llms.txt.ts` and `llms-full.txt.ts` — bounded static context files;
  the full-content route opts in explicitly for this demonstration
- `src/pages/v1/mcp.ts` — MCP endpoint (JSON-RPC 2.0, GET 405 + POST + OPTIONS)
- `src/pages/webmcp.js.ts` — the WebMCP bridge script, loaded by every page
- `src/lib/provider.ts` — demo content provider; replace with your collections

Verify a live site with `npx @corsenai/corsen-context-cli doctor --url <url>`.

WebMCP requires `/webmcp.js` and `/v1/mcp` on the page's origin. Its bridge
does not send a secret API key. Keep this read-only public endpoint
rate-limited, or omit the bridge and reserve a key-protected endpoint for
authenticated server-side MCP clients.

`CORSEN_CONTEXT_LLMS_FULL_TXT_ENABLED=false` keeps `/llms-full.txt` at `404` by
default. `CORSEN_CONTEXT_LLMS_TXT_ENABLED=false` hides both static handlers,
while `CORSEN_CONTEXT_MCP_ENABLED=false` hides MCP, WebMCP, and their page tag.
Static output defaults to a 5 MiB UTF-8 byte limit (accepted range: 64 KiB–10
MiB).
