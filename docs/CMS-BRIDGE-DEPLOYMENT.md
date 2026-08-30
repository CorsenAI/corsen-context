# Deploying a CMS bridge on an existing site

The Ghost, Strapi, Directus, Wagtail, and MediaWiki folders are reference Node
bridge services. They are executable integrations, but they are not native
plugins or extensions for those CMSs.

Each bridge reads the corpus permitted by its configured CMS role and explicit
publication filters, publishes `/llms.txt`, and exposes four read-only tools
through `POST /v1/mcp` and same-origin WebMCP.

## Choose one deployment shape

### Reference front door

Run the example server as the public site. It renders its own HTML pages and
serves `/webmcp.js`, `/llms.txt`, and `/v1/mcp` from the same origin. This is
the simplest way to reproduce the example exactly.

### Sidecar for an existing frontend

Keep the existing CMS frontend and run the Node bridge on a private port or
service. Then:

1. set `SITE_URL` to the existing site's canonical public origin;
2. adapt each provider's generated paths to the site's real public URLs;
3. reverse-proxy `/v1/mcp`, `/webmcp.js`, and optionally `/llms.txt` to the
   bridge without changing their public origin;
4. load `<script src="/webmcp.js" defer></script>` in the existing site's
   shared page template;
5. verify that every URL returned by `search_site`, `list_content`, and
   `get_sitemap` opens on the public site.

Example Nginx routing when the bridge listens on `127.0.0.1:3000`:

```nginx
location = /v1/mcp {
    proxy_pass http://127.0.0.1:3000/v1/mcp;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header CF-Connecting-IP "";
}

location = /webmcp.js {
    proxy_pass http://127.0.0.1:3000/webmcp.js;
    proxy_set_header Host $host;
}

location = /llms.txt {
    proxy_pass http://127.0.0.1:3000/llms.txt;
    proxy_set_header Host $host;
}
```

This example assumes exactly one trusted proxy hop: Nginx is directly exposed,
the bridge listens only on loopback, and no alternate path reaches it. The
proxy overwrites forwarding headers instead of appending the request's incoming
`X-Forwarded-For`. Set `TRUST_PROXY=1` only under that topology. If a CDN or
another proxy sits in front of Nginx, keep `TRUST_PROXY=0` until the last proxy
has been configured and tested to replace every client-IP header with a value
authenticated by that upstream; do not forward arbitrary incoming values.

Use the equivalent exact-path routing on another proxy or platform. A bridge
on a different browser origin is not a working WebMCP integration. By default
the examples rate-limit the proxy connection address. Only enable trusted
forwarded-IP handling after constraining the service to a proxy you control;
otherwise forwarding headers are attacker-controlled.

## Credentials and public WebMCP

CMS API keys remain server-side and should have read-only access to published
content only. They are separate from Corsen Context's optional MCP API key.

The in-page WebMCP bridge intentionally sends no API key, cookies, or visitor
credentials to `/v1/mcp`. Therefore choose one of these modes:

- WebMCP mode: public, read-only, rate-limited `/v1/mcp`, backed only by public
  content; or
- authenticated MCP mode: key-protected `/v1/mcp` for server-side clients,
  with `/webmcp.js` omitted from public pages.

Never embed a CMS token or MCP key in `webmcp.js`, HTML, or client-side
environment variables.

## Provider cache and freshness

Every reference bridge caps each individual upstream fetch at 10 seconds. Each
also stores a successful provider dataset in process-local memory and coalesces
concurrent cold or expired reads into one in-flight load. Ghost, Strapi,
Directus, and Wagtail use a fixed 60-second TTL. MediaWiki uses
`MW_CACHE_TTL_MS`, with a 30,000-millisecond default and an accepted range of
1,000–300,000 milliseconds.

These caches are neither shared nor actively invalidated. A process can keep
serving its successful snapshot until the TTL expires, a restarted process
starts cold, and separate replicas can temporarily expose different snapshots.
Expired data is not served as a fallback when a refresh fails; that request
fails and a later request retries the load. Add a shared cache or source-driven
invalidation only after preserving the same publication and visibility
boundaries.

## Verification

After deployment, run:

```bash
npx @corsenai/corsen-context-cli doctor --url https://www.example.com
```

Then complete the MCP lifecycle on `/v1/mcp`: send JSON `initialize` with an
`Accept` header permitting JSON and event streams; confirm protocol
`2025-11-25` plus non-empty server name/version; send
`notifications/initialized` with `MCP-Protocol-Version: 2025-11-25`; and require
HTTP `202` with an empty body. Subsequent JSON calls use that same protocol
header. List exactly four tools, call `search_site` with a site-specific query,
and pass one returned URL to `get_page_content`. Also confirm `GET /v1/mcp`
returns `405` plus `Allow: POST`, same-origin `OPTIONS` succeeds, and a hostile
`Origin` is rejected. Browser verification additionally requires a
WebMCP-capable client and a page reload after the bridge is installed.
