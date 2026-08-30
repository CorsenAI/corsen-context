# Corsen Context — Strapi example

Make a [Strapi](https://strapi.io) headless CMS agent-native without a Strapi
plugin: Corsen Context wraps the Strapi REST API, and the same four read-only
tools appear on three surfaces — `/llms.txt`, `POST /v1/mcp`, and `/webmcp.js`
for an agent running inside the page (WebMCP).

## Run

```bash
npm install
STRAPI_URL=http://127.0.0.1:1337 \
STRAPI_TOKEN=your-full-access-api-token \
SITE_URL=https://your-site.example \
npm start
```

Create the token in Strapi Admin → Settings → API Tokens (a read-only token
is enough if you only serve published content; the demo seeds content so it
uses a full-access one). The token lives only in this wrapper's environment —
it is never sent to the browser: the WebMCP bridge calls back into *this*
server's MCP endpoint, not into Strapi directly.

## What the provider does

`server.js` lists posts via `GET /api/posts` and maps them to the Corsen
Context `ContentProvider` shape. Swap the fetch calls for your own collection
names and you keep every surface for free.
