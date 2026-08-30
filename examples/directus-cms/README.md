# Corsen Context — Directus example

Make a [Directus](https://directus.io) project agent-native without a Directus
extension: Corsen Context wraps the Directus REST API, and the same four
read-only tools appear on three surfaces — `/llms.txt`, `POST /v1/mcp`, and
`/webmcp.js` for an agent running inside the page (WebMCP).

## Run

```bash
npm install
DIRECTUS_URL=http://127.0.0.1:8055 \
DIRECTUS_TOKEN=your-static-token \
SITE_URL=https://your-site.example \
npm start
```

Create the static token in Directus Admin → Users → your service user →
Token. It lives only in this wrapper's environment; the browser never sees
Directus or the token.
