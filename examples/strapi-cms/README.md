# Corsen Context — Strapi bridge example

This is a deployable Node reference bridge, not a Strapi plugin. It reads a
configured public corpus through Strapi's REST API, publishes `/llms.txt`, and
exposes four read-only tools through `POST /v1/mcp` and same-origin WebMCP.

[Standalone repository](https://github.com/CorsenAI/corsen-context-strapi) ·
[Live demo](https://strapi-webmcp.corsen.ai)

## Prerequisites

- Node.js 22.12+
- a Strapi `posts` collection with `title`, `slug`, `excerpt`, and `body`
- published entries when Draft & Publish is enabled
- either public `find` access or an API token limited to read-only `find` and
  `findOne` access on that collection

The example does not create or seed the collection. It never needs a
full-access or write-capable token.

## Run locally

```bash
git clone https://github.com/CorsenAI/corsen-context-strapi.git
cd corsen-context-strapi
npm ci
cp .env.example .env
# Edit STRAPI_URL and, when required, STRAPI_TOKEN.
npm run start:env
```

PowerShell equivalent: `Copy-Item .env.example .env`. Open
`http://localhost:3000`; production uses the real canonical origin in
`SITE_URL`.

The provider targets `/api/posts` and maps entries to `/posts/{slug}`. Adapt
the collection, field, and public URL mapping when your schema differs.
It requests published status on Strapi v5 and falls back to Strapi v4's live
publication filter when the v5 query is rejected.

Set `TRUST_PROXY=1` only when this service is reachable exclusively through
one proxy hop you control. The default ignores forwarded client-IP headers.
The process binds to `127.0.0.1` by default; set `HOST=0.0.0.0` only on a
platform that requires a public listener.

Each Strapi API attempt has a 10-second timeout, including the v4 fallback.
Successful post lists are cached for a fixed 60 seconds in the Node process,
and concurrent cache misses share one in-flight load. The cache is not shared
across replicas and has no active invalidation, so a process can keep serving
its prior snapshot until the TTL expires. An expired snapshot is not served
when a refresh fails; a later request retries the provider load. The core
page-body cache is disabled, so this 60-second provider cache is the only
freshness layer.

Surface switches are independent: `CORSEN_CONTEXT_MCP_ENABLED=false` returns
`404` for MCP and WebMCP, `CORSEN_CONTEXT_LLMS_TXT_ENABLED=false` returns `404`
for both static exports, and `CORSEN_CONTEXT_LLMS_FULL_TXT_ENABLED=true`
explicitly enables `/llms-full.txt`, which is disabled by default.

## Integrate an existing site

Use the server as a frontend or route its agent endpoints through the existing
site. Follow the [deployment guide](https://github.com/CorsenAI/corsen-context/blob/main/docs/CMS-BRIDGE-DEPLOYMENT.md)
for same-origin routing, server-only credentials, browser injection, and the
two-tool verification sequence.
