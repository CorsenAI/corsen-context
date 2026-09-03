# Corsen Context — Directus bridge example

This is a deployable Node reference bridge, not a Directus extension. It
reads a configured public corpus through the Directus REST API, publishes
`/llms.txt`, and exposes four read-only tools through `POST /v1/mcp` and
same-origin WebMCP.

[Standalone repository](https://github.com/CorsenAI/corsen-context-directus) ·
[Live demo](https://directus-webmcp.corsen.ai)

## Prerequisites

- Node.js 22.12+
- a Directus `posts` collection with `title`, `slug`, `excerpt`, `body`, and
  `status`
- a public role or service user restricted to read published items and only
  those fields

The query and response filter both require `status=published` by default.
Configure `DIRECTUS_STATUS_FIELD` and `DIRECTUS_PUBLISHED_VALUE` when the
project uses another publication workflow; the API role must be allowed to
read that field.

## Run locally

```bash
git clone https://github.com/CorsenAI/corsen-context-directus.git
cd corsen-context-directus
npm ci
cp .env.example .env
# Edit DIRECTUS_URL and, when required, DIRECTUS_TOKEN.
npm run start:env
```

PowerShell equivalent: `Copy-Item .env.example .env`. Open
`http://localhost:3000`; set the production canonical origin in `SITE_URL`
before deployment.

Set `TRUST_PROXY=1` only when this service is reachable exclusively through
one proxy hop you control. The default ignores forwarded client-IP headers.
The process binds to `127.0.0.1` by default; set `HOST=0.0.0.0` only on a
platform that requires a public listener.

Each Directus API fetch has a 10-second timeout. Successful post lists are
cached for a fixed 60 seconds in the Node process, and concurrent cache misses
share one in-flight load. The cache is not shared across replicas and has no
active invalidation, so a process can keep serving its prior snapshot until the
TTL expires. An expired snapshot is not served when a refresh fails; a later
request retries the provider load. The core page-body cache is disabled, so
this 60-second provider cache is the only freshness layer.

Surface switches are independent: `CORSEN_CONTEXT_MCP_ENABLED=false` returns
`404` for MCP and WebMCP, `CORSEN_CONTEXT_LLMS_TXT_ENABLED=false` returns `404`
for both static exports, and `CORSEN_CONTEXT_LLMS_FULL_TXT_ENABLED=true`
explicitly enables `/llms-full.txt`, which is disabled by default.

## Integrate an existing site

The provider maps Directus items to `/posts/{slug}`. Adapt that mapping to the
real frontend and follow the
[deployment guide](https://github.com/CorsenAI/corsen-context/blob/main/docs/CMS-BRIDGE-DEPLOYMENT.md) for
same-origin routing, credential boundaries, browser injection, and final
verification.
