# Corsen Context — Ghost bridge example

This is a deployable Node reference bridge, not a native Ghost plugin. It
reads published posts through Ghost's Content API, publishes `/llms.txt`, and
exposes four read-only tools through `POST /v1/mcp` and same-origin WebMCP.

## Prerequisites

- Node.js 22.12+
- a Ghost Content API URL, which may differ from the publication's public URL
- a Content API key from Ghost Admin > Settings > Integrations

The Content API key is read-only and remains on the server.

## Run locally

```bash
npm install
cp .env.example .env
# Edit GHOST_CONTENT_KEY in .env.
npm run start:env
```

PowerShell equivalent: `Copy-Item .env.example .env`. Open
`http://localhost:3000`; the local `SITE_URL` in `.env.example` matches it.

The provider maps Ghost posts to `/posts/{slug}` for the reference frontend.
If an existing Ghost frontend uses different canonical URLs, adapt that path
before deployment.

Set `TRUST_PROXY=1` only when this service is reachable exclusively through
one proxy hop you control. The default ignores forwarded client-IP headers.

Each Ghost API fetch has a 10-second timeout. Successful post lists are cached
for a fixed 60 seconds in the Node process, and concurrent cache misses share
one in-flight load. The cache is not shared across replicas and has no active
invalidation, so a process can keep serving its prior snapshot until the TTL
expires. An expired snapshot is not served when a refresh fails; a later
request retries the provider load. The core page-body cache is disabled in
this bridge, so this 60-second provider cache is the only freshness layer.

Surface switches are independent: `CORSEN_CONTEXT_MCP_ENABLED=false` returns
`404` for MCP and WebMCP, `CORSEN_CONTEXT_LLMS_TXT_ENABLED=false` returns `404`
for both static exports, and `CORSEN_CONTEXT_LLMS_FULL_TXT_ENABLED=true`
explicitly enables `/llms-full.txt`, which is disabled by default.

## Integrate an existing site

The server can be the public frontend, or a sidecar behind the site's reverse
proxy. For the latter, map `/v1/mcp`, `/webmcp.js`, and `/llms.txt` to this
service and load `/webmcp.js` from the Ghost theme. Follow
[`docs/CMS-BRIDGE-DEPLOYMENT.md`](../../docs/CMS-BRIDGE-DEPLOYMENT.md) for the
same-origin, credentials, and verification requirements.
