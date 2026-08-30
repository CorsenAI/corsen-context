# Corsen Context — MediaWiki example

Make a [MediaWiki](https://www.mediawiki.org) site — the software behind
Wikipedia — agent-native without a single MediaWiki extension: Corsen Context
wraps the public Action API, and the same four read-only tools appear on three
surfaces — `/llms.txt`, `POST /v1/mcp`, and `/webmcp.js` for an agent running
inside the page (WebMCP).

The Action API is public for reads: no key, no extension, no config change on
the wiki.

## Run

```bash
npm install
MW_API_URL=http://127.0.0.1:8080/api.php \
SITE_URL=https://your-site.example \
npm start
```
