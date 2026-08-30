# Corsen Context — static HTML example

A plain folder of HTML files — no framework, no CMS — made agent-native.
This is the most common kind of site on the web, and it needs exactly two
things from Corsen Context:

1. **A build step** (`scripts/build.mjs`) that writes static agent assets into
   `public/`: `llms.txt`, `llms-full.txt`, and `webmcp.js` (the WebMCP bridge
   every page loads with `<script src="/webmcp.js" defer>`).
2. **One function** (`function/server.js`) answering `POST /v1/mcp`. On a
   serverless host (Netlify, Vercel, Cloudflare), that handler is a function;
   here it's a tiny Express server. Everything else is static.

If the site is already live and you only want `llms.txt`, the CLI does it
without a build script:

```bash
npx @corsenai/corsen-context-cli generate --url https://yoursite.com --full
```

## Run

```bash
npm install
SITE_URL=https://yoursite.com npm run build   # writes public/
SITE_URL=https://yoursite.com npm start       # the MCP function (port 3010)
# serve public/ with any static file server
```
