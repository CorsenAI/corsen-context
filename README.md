<div align="center">

# Corsen Context

### Owner-controlled public content for MCP and WebMCP

[![CI](https://github.com/CorsenAI/corsen-context/actions/workflows/ci.yml/badge.svg)](https://github.com/CorsenAI/corsen-context/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-2025--11--25-4ade80)](https://modelcontextprotocol.io)
[![WebMCP](https://img.shields.io/badge/WebMCP-draft-8b5cf6)](https://webmachinelearning.github.io/webmcp/)

Four read-only tools let compatible agents search, browse, and read the public
content a site owner chooses to expose. MCP serves clients outside the page;
WebMCP registers the same contract for agents running inside it; `llms.txt`
separately publishes a bounded static overview.

[Quick start](#quick-start) · [Architecture](#architecture) ·
[Integrations](docs/INTEGRATIONS.md) · [Demo runbook](docs/DEMO-RUNBOOK.md) ·
[Verification](#verification) ·
[Security](#security-boundary)

</div>

## Why

Web pages are designed for people. An agent that has only the rendered DOM
must rediscover navigation, extract text, and infer which URL contains the
answer. Corsen Context gives the site an explicit, owner-governed read path:

1. `search_site` finds relevant public pages.
2. `get_page_content` reads one returned URL as clean Markdown.
3. `list_content` browses an allowed public content type.
4. `get_sitemap` returns a bounded overview up to the owner's configured
   content limit.

The tools reduce reliance on DOM extraction. Their results are still
site-authored, untrusted content that a consuming agent must evaluate.

## Architecture

```text
Owner-selected public content
          │
          ├── GET /llms.txt
          │      bounded static publication/discovery surface
          │
          └── four-tool server contract
                 ├── POST /v1/mcp
                 │      MCP JSON-RPC interface
                 └── document.modelContext
                        WebMCP registration; calls return to same-origin MCP
```

Within a TypeScript integration, WebMCP forwards execution to that
integration's MCP endpoint. WordPress implements the same manifest-defined
contract independently in PHP. Automated parity tests compare tool names,
descriptions, input schemas, and WebMCP annotations against
[`tools.manifest.json`](tools.manifest.json).

The project can also emit discovery hints in `robots.txt`, `llms.txt`, an HTML
`<link rel="mcp">` element, or a `/.well-known/mcp` document. These are
project conventions rather than universally consumed discovery standards;
some clients still require direct endpoint configuration.

## Tool contract

| Tool               | Purpose                                                     | Important bounds                            |
| ------------------ | ----------------------------------------------------------- | ------------------------------------------- |
| `search_site`      | Search public content and return matching URLs and snippets | query 1–500 Unicode code points; limit 1–50 |
| `get_page_content` | Read one same-site public URL as Markdown                   | URI 1–2000 Unicode code points              |
| `list_content`     | Browse one allowed public content type                      | page 1–5000; limit 1–100                    |
| `get_sitemap`      | Return a bounded structured overview                        | no input properties                         |

Unknown properties, wrong scalar types, fractions where integers are required,
and out-of-range values produce an MCP tool result with `isError: true` and an
actionable message. A malformed `tools/call` envelope, including a non-object
`arguments` member, remains JSON-RPC error `-32602`. Tool definitions shown by
MCP do not carry WebMCP-only annotations.

WebMCP registrations include `readOnlyHint` and `untrustedContentHint`. These
are advisory metadata for the client, not a security barrier. Read-only
behavior comes from the server implementation and content provider.

The generated browser bridge registers each manifest-backed tool through the
WebMCP API. This is the actual registration path, shortened only to keep the
example focused:

```js
document.modelContext.registerTool({
  name: tool.name,
  description: tool.description,
  inputSchema: tool.inputSchema,
  annotations: tool.annotations,
  execute: (input, options) => call(tool.name, input, options?.signal),
});
```

The complete implementation, including same-origin transport, abort forwarding,
response validation, and registration failure isolation, is in
[`packages/core/src/webmcp.ts`](packages/core/src/webmcp.ts).

## Integration shapes

The repository contains ten reference and deployment targets, but they are not
all the same kind of product. A public target is current only when
`pnpm verify:live` succeeds against the deployed URL:

| Stack              | Integration delivered to the site owner                            |
| ------------------ | ------------------------------------------------------------------ |
| WordPress          | Native PHP plugin                                                  |
| Next.js App Router | npm 2.0.0 candidate plus complete example                          |
| Astro              | npm 2.0.0 candidate plus complete SSR example                      |
| Express            | Framework-agnostic core plus reference server                      |
| Static HTML        | Build-time assets plus one same-origin Node endpoint               |
| Ghost              | Deployable read-only Node bridge over the Content API              |
| Strapi             | Deployable read-only Node bridge over a documented collection      |
| Directus           | Deployable read-only Node bridge with an explicit published filter |
| Wagtail            | Deployable read-only Node bridge adapted to a named page model     |
| MediaWiki          | Deployable read-only Node bridge over the Action API               |

The five CMS bridges are reference services, not native CMS plugins or
extensions. They can act as a frontend or run as a same-origin sidecar. See
[`docs/CMS-BRIDGE-DEPLOYMENT.md`](docs/CMS-BRIDGE-DEPLOYMENT.md) before using
one on an existing site.

## Quick start

### Next.js App Router

The repository currently tracks npm candidate `2.0.0`; the public npm registry
still serves `1.3.0` until the candidate is published. The command below
therefore installs the public stable release, not proof of this checkout. Use
`pnpm verify:examples:candidate` from a clone to test the exact local candidate.

Publishing the candidate is a separate manual operation. A push to `main` may
prepare a Changesets version pull request but cannot publish to npm. The publish
workflow requires an exact confirmed `main` commit/version, runs through the
`npm-publish` GitHub environment, rejects long-lived npm credentials, and uses
npm trusted publishing through OIDC. Trusted-publisher setup for every package
must still be verified on npm before publication.

```bash
npm install @corsenai/corsen-context @corsenai/corsen-context-nextjs
```

Implement a `ContentProvider` for the public pages the site intends to expose,
then mount the MCP route:

```typescript
// app/v1/mcp/route.ts
import { createMCPHandler } from '@corsenai/corsen-context-nextjs';
import { corsenConfig } from '@/lib/corsen-context.server';
import { siteProvider } from '@/lib/corsen-provider';

export const { GET, POST, OPTIONS } = createMCPHandler(corsenConfig, siteProvider);
```

Mount the WebMCP bridge:

```typescript
// app/webmcp.js/route.ts
import { createWebMCPScriptHandler } from '@corsenai/corsen-context-nextjs';
import { corsenConfig } from '@/lib/corsen-context.server';
import { siteProvider } from '@/lib/corsen-provider';

export const GET = createWebMCPScriptHandler(corsenConfig, siteProvider);
```

Load it once from the root layout:

```tsx
<script src="/webmcp.js" defer />
```

The complete local reference is in
[`examples/nextjs-app-router`](examples/nextjs-app-router).

For Next.js, import the Corsen Context configuration directly into route
handlers from a server-only module. `withCorsenContext` adds enabled static
rewrites but does not serialize the configuration into `nextConfig.env` or the
client bundle. Never put an MCP API key in a `NEXT_PUBLIC_*` variable.

### Astro, Express, and static HTML

- [`packages/astro-adapter`](packages/astro-adapter) provides MCP,
  `llms.txt`, and WebMCP script handlers for an Astro SSR project.
- [`examples/express-basic`](examples/express-basic) shows the
  framework-agnostic core in one same-origin Express server.
- [`examples/static-html`](examples/static-html) builds HTML, `llms.txt`, and
  `webmcp.js`, then serves them beside the MCP endpoint.

Each example documents its canonical site URL, content-provider replacement,
and browser/API-key boundary.

The static-HTML build removes stale static context/WebMCP assets and page
script tags when the corresponding build variables are disabled. On a purely
static host, changing an environment variable at runtime has no effect:
rebuild, redeploy, and purge any CDN copy to complete revocation.

### WordPress

The plugin source is
[`packages/wordpress-plugin/corsen-context`](packages/wordpress-plugin/corsen-context).
It publishes owner-selected public post types, path exclusions, `llms.txt`, an
MCP endpoint, and opt-in WebMCP. Check the version shown on WordPress.org
before installation: a public stable version older than `1.4.1` does not
contain this candidate's strict WebMCP contract.

For a source install, package only the `corsen-context` plugin directory,
upload the ZIP through **Plugins > Add New > Upload Plugin**, activate it, and
review **Settings > Corsen Context** before enabling WebMCP. The deterministic
candidate builder and clean-install receipt are documented in
[`docs/WORDPRESS-PACKAGING.md`](docs/WORDPRESS-PACKAGING.md). A portable
8-page/6-post demonstration corpus and its rollback instructions are in
[`examples/wordpress-aurora`](examples/wordpress-aurora).

## Content provider

Non-WordPress integrations implement a small interface backed by the site's
own public CMS, database, or build data:

```typescript
import type { ContentProvider } from '@corsenai/corsen-context';

const siteProvider: ContentProvider = {
  async getPages() {
    return [
      {
        url: 'https://www.example.com/docs/start',
        title: 'Getting started',
        description: 'Installation guide',
        type: 'page',
      },
    ];
  },

  async getPageContent(url) {
    // Resolve only an allowed public URL and return clean Markdown.
    return { url, title: 'Getting started', markdown: '# Getting started', metadata: {} };
  },

  async searchContent(query, limit) {
    // Return at most `limit` matching public entries.
    return [];
  },
};
```

The provider is part of the security boundary. It must enforce publication
status, tenant/visibility rules, canonical URLs, and field allowlists for the
specific source system.

## Safe configuration baseline

```javascript
export default {
  siteUrl: 'https://www.example.com',
  mcp: {
    enabled: true,
    endpoint: '/v1/mcp',
    tools: ['search_site', 'get_page_content', 'list_content', 'get_sitemap'],
  },
  static: {
    generateLlmsTxt: true,
    includeFullContent: false,
    maxOutputBytes: 5_242_880,
  },
  content: {
    postTypes: ['post', 'page'],
    excludePaths: ['/account', '/cart', '/checkout'],
    maxPages: 500,
  },
  security: {
    rateLimit: 100,
    burstLimit: 10,
    allowedOrigins: [],
    trustProxy: false,
  },
  cache: { enabled: true, ttl: 3600, driver: 'memory' },
  credit: true,
};
```

`llms-full.txt` is an explicit bounded opt-in, not a default requirement.
`static.generateLlmsTxt: false` disables both `CorsenContext` static generation
methods; the supplied HTTP handlers return `404` for `/llms.txt` and
`/llms-full.txt`.
`static.includeFullContent` defaults to `false`, so `/llms-full.txt` also
returns `404` until the owner enables it explicitly. `maxOutputBytes` defaults
to 5 MiB and accepts 64 KiB through 10 MiB. Both returned exports are capped at
that UTF-8 byte limit without splitting a code point; full-content iteration
returns as soon as the next block would exceed the budget. A truncation notice is
appended when the complete output would exceed the limit.

Generated static metadata and Markdown destinations are normalized and escaped.
Full-content page bodies are passed through from the provider and are explicitly
untrusted site-authored data; the generator does not claim to neutralize them.

`content.maxPages` defaults to 500 and accepts 1 through 5000. It bounds the
corpus exposed by `list_content`, `get_sitemap`, `resources/list`, and the
static exports; it is separate from the per-call `limit` fields in the tool
contract.

`mcp.enabled: false` is authoritative for the supplied integrations: MCP
`GET`, `POST`, and `OPTIONS` routes and the WebMCP script route return `404`,
and the core rejects direct MCP dispatch before invoking the provider. Static
exports remain independently controlled by the `static` settings.

### HTTP transport contract

The supplied Next.js, Astro, Express, static-HTML, and CMS handlers expose a
stateless JSON transport. They validate `Origin` before parsing, require an
`application/json` request content type, require a compatible JSON `Accept`
header when one is sent, rate-limit before optional authentication, and parse
at most 100 KiB from the actual request body. Malformed JSON returns a bounded
JSON-RPC parse error; an oversized body returns `413`; valid non-request JSON
is rejected as an invalid request. `GET` returns `405` with `Allow: POST`, a
valid `OPTIONS` preflight returns `204`, and accepted notifications return
`202` with an empty body. The transport does not implement SSE, resumability,
or session identifiers.

### WebMCP versus API-key mode

The in-page bridge is same-origin and intentionally sends no cookies, visitor
credentials, or API key. Choose one mode for an endpoint:

- WebMCP: public, read-only, rate-limited MCP endpoint backed only by public
  content; or
- authenticated MCP: set `CORSEN_CONTEXT_API_KEY` for server-side clients and
  omit the public WebMCP bridge.

Never embed an API key in `webmcp.js`, HTML, or a public environment variable.

For distributed deployments, supply Redis-compatible cache and rate-limit
stores. Forwarded client-IP headers must only be trusted behind a proxy you
control.

Every supplied CMS reference bridge caps each upstream fetch at 10 seconds.
All five keep successful provider results in a process-local memory cache and
coalesce concurrent cache misses. Ghost, Strapi, Directus, and Wagtail use a
fixed 60-second TTL; MediaWiki defaults to 30 seconds and accepts
`MW_CACHE_TTL_MS` values from 1,000 to 300,000 milliseconds. Upstream changes
can remain absent until that process's TTL expires; replicas do not share this
cache or an invalidation channel. These bridges disable the core page-body
cache, so the provider TTL is their only freshness layer.

## Browser availability

WebMCP is an evolving Community Group draft and browser/client support varies.
The source contains an imperative `document.modelContext.registerTool` bridge;
that alone does not make the API available in every browser. Follow
[`docs/WEBMCP-BROWSER-SETUP.md`](docs/WEBMCP-BROWSER-SETUP.md) for the current
development flag, compatible-client, and public origin-trial paths.

## Verification

Repository checks:

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm verify:examples:candidate
```

WordPress checks:

```bash
pnpm build:wordpress
pnpm verify:wordpress
pnpm verify:wordpress:aurora

cd packages/wordpress-plugin/corsen-context
composer install
composer run lint
composer run test:unit
```

Public deployments can be checked against the repository manifest:

```bash
pnpm verify:live
```

The live verifier fetches public discovery/bridge surfaces, initializes MCP,
compares exact tool names/descriptions/input schemas, and executes a bounded
site-specific `search_site` to `get_page_content` chain. The WordPress receipts
create isolated disposable sites, install the exact candidate ZIP, and verify
both uninstall and endpoint removal; the Aurora mode also imports the public
WXR corpus. A hosted demo does not by itself prove that a third party can
install an integration, so clean-room installation receipts remain separate
from live-deployment and browser evidence.

## Security boundary

- strict input schemas and runtime validation in TypeScript and PHP;
- same-origin WebMCP endpoint resolution, frame refusal, and no credentials;
- rate limiting before optional authentication;
- bounded request bodies, JSON depth, result counts, and export sizes;
- same-site URL checks and path/content exposure policies;
- generated metadata/destination escaping, with page bodies still treated as
  untrusted site-authored content;
- structured logs with secrets redacted and client identifiers hashed.

The core cannot infer private status hidden behind every CMS or membership
plugin. Configure the provider and WordPress exposure filters for the site's
actual visibility model. See [SECURITY.md](SECURITY.md).

## Packages and examples

- `@corsenai/corsen-context` — framework-agnostic TypeScript core
- `@corsenai/corsen-context-nextjs` — Next.js adapter
- `@corsenai/corsen-context-astro` — Astro adapter
- `@corsenai/corsen-context-cli` — initialization, generation, and diagnosis
- `packages/wordpress-plugin/corsen-context` — native WordPress plugin
- `examples/` — ten reference and deployment targets

The CLI `init` command scaffolds MCP routes and a provider template for its
supported frameworks. Add the documented WebMCP script route and page
injection separately; `doctor` diagnoses public surfaces but does not install
them.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). New integrations must include strict
contract parity, same-origin WebMCP routing, install instructions, and a clean
build/test receipt.

## License

[MIT](LICENSE), for personal and commercial use.

When enabled, the optional credit appears in generated `llms.txt` exports. It
is not injected into MCP tool results.

<div align="center">

Built by [Corsen AI](https://corsen.ai) ·
[GitHub](https://github.com/CorsenAI/corsen-context) ·
[Report an issue](https://github.com/CorsenAI/corsen-context/issues)

</div>
