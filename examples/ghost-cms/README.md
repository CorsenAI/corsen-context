# Corsen Context — Ghost CMS example

Make an existing [Ghost](https://ghost.org) publication agent-native without
touching Ghost itself: Corsen Context wraps the Ghost Content API, and the same
four read-only tools appear on three surfaces — `/llms.txt`, `POST /v1/mcp`,
and `/webmcp.js` for an agent running inside the page (WebMCP).

This is the pattern for any CMS with an HTTP API: implement one
`ContentProvider`, and every Corsen Context surface lights up.

## Run

```bash
npm install
GHOST_API_URL=http://127.0.0.1:2368 \
GHOST_CONTENT_KEY=your-content-api-key \
SITE_URL=https://your-site.example \
npm start
```

Create the content API key in Ghost Admin → Settings → Integrations →
Add custom integration. Ghost itself never needs to be public: this wrapper
can be the whole front door.

## What the provider does

`src` is a single `server.js`: it lists published posts via the Ghost Content
API, serves them as pages, and answers `search_site` / `get_page_content` /
`list_content` / `get_sitemap` from that data. Replace the fetch calls with
your CMS's API (or SDK) and keep the rest.
