# @corsenai/corsen-context-nextjs

Next.js adapter for **[Corsen Context](https://github.com/CorsenAI/corsen-context)** — drop-in route handlers for the MCP endpoint and `llms.txt`, with built-in auth, rate limiting, CORS, and security headers.

```bash
npm install @corsenai/corsen-context @corsenai/corsen-context-nextjs
```

**App Router** — `app/v1/mcp/route.ts`:

```typescript
import { createMCPHandler } from '@corsenai/corsen-context-nextjs';
import { corsenConfig } from '@/lib/corsen-context.server';
import { siteProvider } from '@/lib/corsen-provider';

const { GET, POST, OPTIONS } = createMCPHandler(corsenConfig, siteProvider);
export { GET, POST, OPTIONS };
```

Keep the full Corsen Context configuration in a server-only module and import
it directly into each route handler. `withCorsenContext` only adds enabled
static rewrite rules; it does not copy the configuration into
`nextConfig.env`, serialize it into the client bundle, or make it available as
`NEXT_PUBLIC_*`. Never use a public Next.js environment variable for an API
key or other server credential.

**Static exports** — mount `createLlmsTxtHandler` and, only when explicitly
required, `createLlmsFullTxtHandler` on their own routes. Full content is
disabled by default:

```typescript
import { createLlmsTxtHandler } from '@corsenai/corsen-context-nextjs';
import { corsenConfig } from '@/lib/corsen-context.server';
import { siteProvider } from '@/lib/corsen-provider';

export const GET = createLlmsTxtHandler(corsenConfig, siteProvider);
// In app/llms-full.txt/route.ts, set includeFullContent: true deliberately.
```

**WebMCP bridge** — `app/webmcp.js/route.ts`:

```typescript
import { createWebMCPScriptHandler } from '@corsenai/corsen-context-nextjs';
import { corsenConfig } from '@/lib/corsen-context.server';
import { siteProvider } from '@/lib/corsen-provider';

export const GET = createWebMCPScriptHandler(corsenConfig, siteProvider);
```

Load the same-origin bridge from the root layout:

```tsx
<script src="/webmcp.js" defer />
```

This requires both `/webmcp.js` and `/v1/mcp` on the page's public origin.
The browser bridge intentionally sends no API key or visitor credentials. If
WebMCP is enabled, keep the four-tool endpoint public, read-only, rate-limited,
and backed only by public content. A key-protected endpoint is for
authenticated server-side MCP clients and cannot be called by this bridge.

`mcp.enabled: false` makes the adapter's MCP `GET`/`POST`/`OPTIONS`, legacy SSE,
and WebMCP script handlers return `404`. `static.generateLlmsTxt: false` makes
both static handlers return `404`; `static.includeFullContent: false` keeps the
full-content handler at `404`. Static output defaults to a 5 MiB UTF-8 byte
limit and the core accepts 64 KiB through 10 MiB. `content.maxPages` accepts 1
through 5000 and defaults to 500.

The MCP handler validates Origin before parsing, requires JSON request and
response media compatibility, rate-limits before optional authentication, and
reads at most 100 KiB from the actual body. Malformed JSON and oversized bodies
produce bounded JSON errors. `GET` returns `405`, a valid `OPTIONS` returns
`204`, and accepted notifications return an empty `202`; SSE and resumable
sessions are not implemented on the MCP endpoint.

For production (multi-instance / Vercel), install the Upstash SDK and inject
the same client into both stores:

```bash
npm install @upstash/redis
```

Create `lib/corsen-upstash.server.ts`:

<!-- upstash-recipe:start -->

```typescript
import { Redis } from '@upstash/redis';
import {
  RedisCache,
  RedisRateLimitStore,
  type ContentProvider,
  type CorsenContextConfig,
} from '@corsenai/corsen-context';
import { createMCPHandler } from '@corsenai/corsen-context-nextjs';

export function createUpstashMCPHandler(config: CorsenContextConfig, provider: ContentProvider) {
  // Server-only: reads UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.
  const redis = Redis.fromEnv();
  return createMCPHandler(config, provider, {
    cache: new RedisCache(redis),
    rateLimitStore: new RedisRateLimitStore(redis),
  });
}
```

<!-- upstash-recipe:end -->

Then call `createUpstashMCPHandler(corsenConfig, siteProvider)` from
`app/v1/mcp/route.ts` and export the returned `GET`, `POST`, and `OPTIONS`.
Keep both variables server-only; do not expose either as `NEXT_PUBLIC_*`.
Raw ioredis clients use a different command shape and must first be passed
through `adaptIORedisClient` from the core package.

- **Full docs:** https://github.com/CorsenAI/corsen-context#readme
- **License:** MIT
