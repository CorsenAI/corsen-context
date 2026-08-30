# @corsenai/corsen-context-astro

Astro adapter for **[Corsen Context](https://github.com/CorsenAI/corsen-context)** — drop-in API route handlers for the MCP endpoint and `llms.txt`, with built-in auth, rate limiting, CORS, and security headers. Uses Astro's `clientAddress` for accurate rate limiting.

> Requires Astro SSR (`output: 'server'` or `'hybrid'`).

```bash
npm install @corsenai/corsen-context @corsenai/corsen-context-astro
```

Set the canonical public origin with Astro's `site` option; Astro exposes it as
`import.meta.env.SITE`:

```typescript
// astro.config.mjs
export default defineConfig({ site: 'https://www.example.com' });
```

The placeholder fallback below keeps local scaffolds valid, but replace it
before deployment.

**MCP endpoint** — `src/pages/v1/mcp.ts`:

```typescript
import { createMCPHandler } from '@corsenai/corsen-context-astro';
import { siteProvider } from '../../lib/corsen-provider';

export const { GET, POST, OPTIONS } = createMCPHandler(
  { siteUrl: import.meta.env.SITE ?? 'https://example.com' },
  siteProvider,
);
```

**llms.txt** — `src/pages/llms.txt.ts`:

```typescript
import { createLlmsTxtHandler } from '@corsenai/corsen-context-astro';
import { siteProvider } from '../lib/corsen-provider';

export const GET = createLlmsTxtHandler(
  { siteUrl: import.meta.env.SITE ?? 'https://example.com' },
  siteProvider,
);
```

`createLlmsFullTxtHandler` is available for a separate
`src/pages/llms-full.txt.ts` route, but it returns `404` unless
`static.includeFullContent: true` is set explicitly. Full content is disabled
by default.

**WebMCP bridge** — `src/pages/webmcp.js.ts`:

```typescript
import { createWebMCPScriptHandler } from '@corsenai/corsen-context-astro';
import { siteProvider } from '../lib/corsen-provider';

export const GET = createWebMCPScriptHandler(
  { siteUrl: import.meta.env.SITE ?? 'https://example.com' },
  siteProvider,
);
```

Load it from the shared page layout:

```astro
<script src="/webmcp.js" defer></script>
```

Both `/webmcp.js` and `/v1/mcp` must share the page's public origin. The
browser bridge intentionally sends no API key or visitor credentials. When
WebMCP is enabled, expose only public content through a read-only, rate-limited
endpoint. Reserve a key-protected endpoint for authenticated server-side MCP
clients and omit the browser bridge in that mode.

`mcp.enabled: false` makes the adapter's MCP `GET`/`POST`/`OPTIONS` and WebMCP
script handlers return `404`. `static.generateLlmsTxt: false` makes both static
handlers return `404`; `static.includeFullContent: false` independently keeps
the full-content handler at `404`. Static output defaults to a 5 MiB UTF-8 byte
limit and accepts 64 KiB through 10 MiB. `content.maxPages` defaults to 500 and
accepts 1 through 5000.

The MCP handler validates Origin before parsing, requires JSON request and
response media compatibility, rate-limits before optional authentication, and
reads at most 100 KiB from the actual body. Malformed JSON and oversized bodies
produce bounded JSON errors. `GET` returns `405`, a valid `OPTIONS` returns
`204`, and accepted notifications return an empty `202`; SSE and resumable
sessions are not implemented.

For production (multi-instance), pass a Redis cache and rate-limit store via the third `options` argument (`{ cache, rateLimitStore, logger }`).

- **Full docs:** https://github.com/CorsenAI/corsen-context#readme
- **License:** MIT
