# Corsen Context — MediaWiki bridge example

This is a deployable Node reference bridge, not a MediaWiki extension. It
reads public main-namespace pages through the Action API, publishes
`/llms.txt`, and exposes four read-only tools through `POST /v1/mcp` and
same-origin WebMCP.

[Standalone repository](https://github.com/CorsenAI/corsen-context-mediawiki) ·
[Live demo](https://mediawiki-webmcp.corsen.ai)

## Prerequisites

- Node.js 22.12+
- a public MediaWiki Action API URL
- the TextExtracts API module, used by `prop=extracts` for plain page text

No MediaWiki credential is required for public reads. The reference bridge
uses bounded API continuation and a short cache; adapt its namespace policy
for the wiki's intended public corpus.

Set `MW_USER_AGENT` to a descriptive product string with a monitored operator
contact. `MW_MAX_PAGES` accepts 1–200, `MW_BATCH_SIZE` accepts 1–50, and
`MW_CACHE_TTL_MS` accepts 1000–300000 milliseconds. These bounds prevent an
unbounded walk of a large wiki.

## Run locally

```bash
git clone https://github.com/CorsenAI/corsen-context-mediawiki.git
cd corsen-context-mediawiki
npm ci
cp .env.example .env
# Edit MW_API_URL and MW_USER_AGENT; review the corpus and cache bounds.
npm run start:env
```

PowerShell equivalent: `Copy-Item .env.example .env`. Open
`http://localhost:3000`; set the production canonical origin in `SITE_URL`
before deployment.

Set `TRUST_PROXY=1` only when this service is reachable exclusively through
one proxy hop you control. The default ignores forwarded client-IP headers.
The process binds to `127.0.0.1` by default; set `HOST=0.0.0.0` only on a
platform that requires a public listener.

Each MediaWiki API fetch has a 10-second timeout. Successful page lists are
cached in the Node process for 30 seconds by default; `MW_CACHE_TTL_MS` accepts
1,000–300,000 milliseconds. Concurrent misses share one in-flight load. The
cache is not shared across replicas and has no active invalidation, so an
upstream change can remain absent until that process's configured TTL expires.
An expired snapshot is not served when a refresh fails; a later request retries
the provider load. The core page-body cache is disabled, so the configured
provider TTL is the only freshness layer.

Surface switches are independent: `CORSEN_CONTEXT_MCP_ENABLED=false` returns
`404` for MCP and WebMCP, `CORSEN_CONTEXT_LLMS_TXT_ENABLED=false` returns `404`
for both static exports, and `CORSEN_CONTEXT_LLMS_FULL_TXT_ENABLED=true`
explicitly enables `/llms-full.txt`, which is disabled by default.

## Integrate an existing site

The provider maps titles to `/wiki/{title}`. Confirm that mapping against the
wiki's article-path configuration, then follow the
[deployment guide](https://github.com/CorsenAI/corsen-context/blob/main/docs/CMS-BRIDGE-DEPLOYMENT.md) for
same-origin routing, browser injection, and the final two-tool test.
