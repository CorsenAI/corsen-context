# @corsenai/corsen-context-astro

Astro adapter for **[Corsen Context](https://github.com/CorsenAI/corsen-context)** — drop-in API route handlers for the MCP endpoint and `llms.txt`, with built-in auth, rate limiting, CORS, and security headers. Uses Astro's `clientAddress` for accurate rate limiting.

> Requires Astro SSR (`output: 'server'` or `'hybrid'`).

```bash
npm install @corsenai/corsen-context @corsenai/corsen-context-astro
```

**MCP endpoint** — `src/pages/v1/mcp.ts`:

```typescript
import { createMCPHandler } from '@corsenai/corsen-context-astro';
import { siteProvider } from '../../lib/corsen-provider';

export const { POST, OPTIONS } = createMCPHandler(
  { siteUrl: import.meta.env.SITE ?? 'https://example.com' },
  siteProvider,
);
```

**llms.txt** — `src/pages/llms.txt.ts`:

```typescript
import { createLlmsTxtHandler } from '@corsenai/corsen-context-astro';
import { siteProvider } from '../lib/corsen-provider';

export const GET = createLlmsTxtHandler({ siteUrl: import.meta.env.SITE }, siteProvider);
```

For production (multi-instance), pass a Redis cache and rate-limit store via the third `options` argument (`{ cache, rateLimitStore, logger }`).

- **Full docs:** https://github.com/CorsenAI/corsen-context#readme
- **License:** MIT
