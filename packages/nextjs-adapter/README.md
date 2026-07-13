# @corsenai/corsen-context-nextjs

Next.js adapter for **[Corsen Context](https://github.com/CorsenAI/corsen-context)** — drop-in route handlers for the MCP endpoint and `llms.txt`, with built-in auth, rate limiting, CORS, and security headers.

```bash
npm install @corsenai/corsen-context @corsenai/corsen-context-nextjs
```

**App Router** — `app/v1/mcp/route.ts`:

```typescript
import { createMCPHandler } from '@corsenai/corsen-context-nextjs';
import { siteProvider } from '@/lib/corsen-provider';

const { POST, OPTIONS } = createMCPHandler({ siteUrl: 'https://example.com' }, siteProvider);
export { POST, OPTIONS };
```

For production (multi-instance / Vercel), pass a Redis cache and rate-limit store:

```typescript
import { RedisCache, RedisRateLimitStore } from '@corsenai/corsen-context';

createMCPHandler(config, provider, {
  cache: new RedisCache(redis),
  rateLimitStore: new RedisRateLimitStore(redis),
});
```

- **Full docs:** https://github.com/CorsenAI/corsen-context#readme
- **License:** MIT
