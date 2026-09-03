# Corsen Context — Wagtail bridge example

This is a deployable Node reference bridge, not a Wagtail package. It reads a
configured public page type through Wagtail API v2, publishes `/llms.txt`, and
exposes four read-only tools through `POST /v1/mcp` and same-origin WebMCP.

[Standalone repository](https://github.com/CorsenAI/corsen-context-wagtail) ·
[Live demo](https://wagtail-webmcp.corsen.ai)

## Prerequisites

- Node.js 22.12+
- Wagtail API v2 and Django REST framework enabled
- a public page type exposed by the API with a readable body field

The reference query is intentionally explicit. Configure the exposed model as
`WAGTAIL_PAGE_TYPE=app.ModelName` and one text or StreamField API field as
`WAGTAIL_BODY_FIELD=field_name`. Change the public URL mapping in
`fetchPosts()` if the frontend does not use `/posts/{slug}`. Wagtail only
returns live pages through its public API.

## Run locally

```bash
git clone https://github.com/CorsenAI/corsen-context-wagtail.git
cd corsen-context-wagtail
npm ci
cp .env.example .env
# Edit WAGTAIL_URL, WAGTAIL_PAGE_TYPE, and WAGTAIL_BODY_FIELD.
npm run start:env
```

PowerShell equivalent: `Copy-Item .env.example .env`. Open
`http://localhost:3000`; set the production canonical origin in `SITE_URL`
before deployment.

Set `TRUST_PROXY=1` only when this service is reachable exclusively through
one proxy hop you control. The default ignores forwarded client-IP headers.
The process binds to `127.0.0.1` by default; set `HOST=0.0.0.0` only on a
platform that requires a public listener.

Each Wagtail API fetch has a 10-second timeout. Successful page lists are cached
for a fixed 60 seconds in the Node process, and concurrent cache misses share
one in-flight load. The cache is not shared across replicas and has no active
invalidation, so a process can keep serving its prior snapshot until the TTL
expires. An expired snapshot is not served when a refresh fails; a later
request retries the provider load. The core page-body cache is disabled, so
this 60-second provider cache is the only freshness layer.

Surface switches are independent: `CORSEN_CONTEXT_MCP_ENABLED=false` returns
`404` for MCP and WebMCP, `CORSEN_CONTEXT_LLMS_TXT_ENABLED=false` returns `404`
for both static exports, and `CORSEN_CONTEXT_LLMS_FULL_TXT_ENABLED=true`
explicitly enables `/llms-full.txt`, which is disabled by default.

## Integrate an existing site

Enable and mount the Wagtail API using the official Wagtail documentation,
then follow the
[deployment guide](https://github.com/CorsenAI/corsen-context/blob/main/docs/CMS-BRIDGE-DEPLOYMENT.md) for
same-origin routing, browser injection, canonical URL mapping, and final
verification.
