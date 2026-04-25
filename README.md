<div align="center">

# Corsen Context

### Make any website AI-native in 30 seconds

**The Universal AI Context Layer — MCP Server + Enhanced llms.txt + Smart Sitemap**

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-2025--11--25-4ade80)](https://modelcontextprotocol.io)
[![Tests](https://img.shields.io/badge/tests-90%20passed-4ade80)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6)](https://www.typescriptlang.org/)

AI agents can't read your website. HTML is noise. Corsen Context fixes that.

Give ChatGPT, Cursor, Grok, and MCP-compatible AI agents clean, structured access to your content — no scraping, no parsing, no guessing.

[Quick Start](#-quick-start) · [How It Works](#-how-it-works) · [WordPress](#-wordpress-30-seconds) · [Next.js](#-nextjs-2-minutes) · [CLI](#-cli) · [Docs](#-documentation)

</div>

---

## The Problem

AI agents visit your website and see this:

```html
<div class="wp-block-group has-global-padding"><div class="wp-block-group__inner-container">
<nav class="navbar mega-menu--v2"><ul id="menu-main" class="nav navbar-nav">...
```

They need this:

```markdown
# Your Company
> We build developer tools for API management.

## Products
- [API Gateway](https://yoursite.com/products/gateway) - High-performance API gateway
- [Dashboard](https://yoursite.com/products/dashboard) - Real-time monitoring
```

**Corsen Context bridges that gap — automatically.**

---

## How It Works

Corsen Context creates two layers that AI agents can discover and use:

```
AI Agent (ChatGPT, Cursor, Grok, MCP clients)
    │
    ├─── GET /llms.txt              ← Static: instant overview of your site
    ├─── GET /llms-full.txt         ← Static: full markdown of all pages
    │
    └─── POST /v1/mcp               ← Dynamic: search, get pages, list content
         (JSON-RPC 2.0, MCP 2025-11-25)
```

### Discovery Flow

AI agents find your site through standard channels:

1. **robots.txt** — `MCP: https://yoursite.com/v1/mcp`
2. **llms.txt** — Credit line at the bottom includes the MCP endpoint URL
3. **HTML head** — `<link rel="mcp" href="/v1/mcp" />`
4. **/.well-known/mcp** — Standard MCP discovery endpoint

### MCP Tools Available

| Tool | What it does |
|------|-------------|
| `search_site` | Search content by keyword — returns matching pages with context snippets |
| `get_page_content` | Get any page as clean markdown with title, description, dates, metadata |
| `list_content` | Browse content by type (page, post, product) with pagination |
| `get_sitemap` | Full structured sitemap with URLs, titles, types, last modified dates |

Full **MCP 2025-11-25** compliance: `initialize`, `ping`, `notifications/initialized`, `tools/list`, `tools/call`, `resources/list`, `resources/read`.

---

## Quick Start

### WordPress (30 seconds)

1. Install the **Corsen Context** plugin from [WordPress.org](https://wordpress.org/plugins/corsen-context/)
2. Activate it
3. That's it

Your site now has:
- `/llms.txt` — structured overview of all published content
- `/llms-full.txt` — full markdown dump
- `/wp-json/corsen-context/v1/mcp` — full MCP server (4 tools, JSON-RPC 2.0)
- Dashboard widget showing AI context status
- Yoast SEO + Rank Math metadata integration

Zero config. Works out of the box with sensible defaults.

### Next.js (2 minutes)

```bash
npm install @corsenai/corsen-context @corsenai/corsen-context-nextjs
```

**App Router** — create `app/v1/mcp/route.ts`:

```typescript
import { createMCPHandler } from '@corsenai/corsen-context-nextjs';
import { siteProvider } from '@/lib/corsen-provider';

const { POST, OPTIONS } = createMCPHandler(
  { siteUrl: 'https://yoursite.com' },
  siteProvider,
);

export { POST, OPTIONS };
```

**Pages Router** — create `pages/v1/mcp.ts`:

```typescript
import { CorsenContext } from '@corsenai/corsen-context';

const cc = new CorsenContext({ siteUrl: 'https://yoursite.com' }, myProvider);

export default async function handler(req, res) {
  const server = cc.createMCPServer();
  const result = await server.handleRequest(req.body);
  if (result === null) return res.status(204).end(); // notification
  res.json(result);
}
```

### Any Framework (5 minutes)

```typescript
import express from 'express';
import { CorsenContext } from '@corsenai/corsen-context';

const app = express();
app.use(express.json()); // Required for MCP endpoint

const cc = new CorsenContext({
  siteUrl: 'https://yoursite.com',
}, myContentProvider);

// Serve /llms.txt
app.get('/llms.txt', async (req, res) => {
  res.type('text/plain').send(await cc.generateLlmsTxt());
});

// MCP endpoint (versioned)
app.post('/v1/mcp', async (req, res) => {
  const server = cc.createMCPServer();
  const result = await server.handleRequest(req.body);
  if (result === null) return res.status(204).end();
  res.json(result);
});
```

Works with Express, Fastify, Hono, Koa, Astro, SvelteKit, Nuxt, or any HTTP server.

---

## CLI

Auto-detect your framework, scaffold config and route files in one command:

```bash
npx @corsenai/corsen-context-cli init
```

This creates:
- `corsen-context.config.mjs` with sensible defaults
- Framework-specific route files (Next.js App/Pages Router, Express, Astro)
- Content provider template

Other commands:

```bash
# Generate llms.txt from a live site
npx @corsenai/corsen-context-cli generate --url https://yoursite.com

# Check if your site is AI-ready
npx @corsenai/corsen-context-cli doctor --url https://yoursite.com
```

The `doctor` command checks: HTTPS, llms.txt, sitemap.xml, robots.txt MCP reference, and MCP endpoint availability.

---

## Content Provider

For non-WordPress sites, you implement a `ContentProvider` — a simple interface that tells Corsen Context how to access your pages:

```typescript
import type { ContentProvider } from '@corsenai/corsen-context';

const myProvider: ContentProvider = {
  async getPages() {
    return [
      { url: 'https://yoursite.com/', title: 'Home', description: 'Welcome', type: 'page' },
      { url: 'https://yoursite.com/blog/post-1', title: 'First Post', description: '...', type: 'post' },
    ];
  },

  async getPageContent(url) {
    // Fetch and return page as markdown
    return { url, title: '...', description: '...', markdown: '# ...', metadata: {} };
  },

  async searchContent(query, limit) {
    // Return matching results
    return [{ url: '...', title: '...', description: '...', snippet: '...', score: 1 }];
  },
};
```

The WordPress plugin does this automatically from your WP database.

---

## Configuration

All adapters share the same config schema (validated with Zod):

```javascript
// corsen-context.config.mjs
export default {
  siteUrl: 'https://yoursite.com',
  siteName: 'My Site',
  description: 'Short description for AI agents.',

  mcp: {
    enabled: true,
    endpoint: '/v1/mcp',
    tools: ['search_site', 'get_page_content', 'list_content', 'get_sitemap'],
  },

  static: { generateLlmsTxt: true, includeFullContent: true },

  content: {
    postTypes: ['post', 'page', 'product'],
    excludePaths: ['/admin', '/cart', '/checkout'],
    maxPages: 500,
  },

  security: {
    rateLimit: 100,          // requests per minute per IP
    allowedOrigins: [],      // CORS whitelist (empty = no CORS headers)
    // apiKey via CORSEN_CONTEXT_API_KEY env var
  },

  cache: { enabled: true, ttl: 3600, driver: 'memory' }, // or 'redis' for production

  credit: true,              // "Powered by Corsen Context" in generated files
};
```

---

## Production Deployment

For single-instance or dev setups, Corsen Context works out of the box with in-memory cache and rate limiting. For production (Vercel, multi-instance, Kubernetes), plug in Redis:

### Environment Variables

Copy `.env.example` to `.env`:

```bash
CORSEN_CONTEXT_API_KEY=your-secret-key    # Protect your MCP endpoint
REDIS_URL=redis://localhost:6379          # Or your Upstash/ElastiCache URL
LOG_LEVEL=info                            # fatal|error|warn|info|debug|trace
```

### Redis Setup (Upstash or any Redis)

```typescript
import { CorsenContext, RedisCache, RedisRateLimitStore } from '@corsenai/corsen-context';
import { Redis } from '@upstash/redis'; // or ioredis, etc.

const redis = new Redis({
  url: process.env.REDIS_URL,
  token: process.env.REDIS_TOKEN, // Upstash only
});

// Pluggable cache + rate limiter
const cache = new RedisCache(redis, { prefix: 'corsen:cache:' });
const rateLimitStore = new RedisRateLimitStore(redis, { prefix: 'corsen:rl:' });

const cc = new CorsenContext(
  { siteUrl: 'https://yoursite.com', cache: { driver: 'redis' } },
  myProvider,
  cache,
);

const server = cc.createMCPServer({ rateLimitStore });
```

### Structured Logging

Logs are JSON by default (Pino). Pipe through `pino-pretty` in dev:

```bash
node server.js | npx pino-pretty
```

In production, logs include method, duration, status, and security events:

```json
{"level":"info","module":"mcp","method":"tools/call","durationMs":12,"status":"ok","msg":"request_handled"}
{"level":"warn","module":"mcp","ip":"1.2.3.4","msg":"rate_limit_exceeded"}
```

Sensitive fields (`apiKey`, `authorization`, `password`, `token`) are automatically redacted.

### Custom Logger

```typescript
import { createLogger } from '@corsenai/corsen-context';

const logger = createLogger({ level: 'debug', name: 'my-app' });
const server = cc.createMCPServer({ rateLimitStore, logger });
```

---

## Security

Built-in, not bolt-on:

- **SSRF protection (DNS-aware)** — Resolves DNS before fetching to prevent DNS rebinding attacks (OWASP 2026). Blocks all private/internal IPs (IPv4 + IPv6 + carrier-grade NAT)
- **Rate limiting** — Sliding window, 100 req/min default, burst protection (10/sec). Pluggable store: in-memory (dev) or **Redis** (production, distributed)
- **API key auth** — Timing-safe comparison + optional **ApiKeyManager** with SHA-256 hashed keys, scopes, daily quotas, expiry, and revocation
- **Input validation** — Every parameter validated with Zod. Body size limit (100 KB), JSON depth limit (10), request timeout (8s)
- **Security headers** — `X-Content-Type-Options`, `X-Frame-Options`, `CSP`, `no-store` on all MCP responses
- **Structured logging** — Pino-based, JSON output. Security events (rate limit hits, auth failures, DoS rejections) logged with context
- **Content ACL** — Only published, public content is exposed. Never drafts, trash, or private pages
- **No redirects** — MCP endpoints never follow redirects (`redirect: 'error'`)
- **Client IP extraction** — CF-Connecting-IP > X-Real-IP > X-Forwarded-For > socket IP

See [SECURITY.md](SECURITY.md) for the full security specification.

---

## Supported Frameworks

| Framework | Integration | Setup Time |
|-----------|------------|------------|
| **WordPress** | Full plugin, zero config | 30 sec |
| **Next.js** (App Router) | Adapter + route handlers | 2 min |
| **Next.js** (Pages Router) | API routes | 2 min |
| **Express / Fastify / Hono** | Middleware | 5 min |
| **Astro** | API endpoints | 3 min |
| **Any Node.js server** | Core library | 5 min |
| **Static sites** | CLI generator | 1 min |

Coming soon: Astro adapter, SvelteKit, Nuxt, Laravel, Django, Shopify.

---

## Project Structure

```
corsen-context/
├── packages/
│   ├── core/                 # @corsenai/corsen-context — TypeScript library
│   │   ├── src/
│   │   │   ├── mcp-server.ts     # Full MCP JSON-RPC 2.0 server
│   │   │   ├── llms-txt.ts       # llms.txt + llms-full.txt generators
│   │   │   ├── sitemap.ts        # Sitemap XML parser + discovery
│   │   │   ├── converter.ts      # HTML → clean Markdown
│   │   │   ├── security.ts       # SSRF (DNS-aware), rate limiting, CORS, API keys
│   │   │   ├── cache.ts          # In-memory cache driver
│   │   │   ├── redis-cache.ts    # Redis cache driver (production)
│   │   │   ├── redis-rate-limit.ts # Redis rate limit store (production)
│   │   │   ├── logger.ts         # Pino structured logging
│   │   │   ├── config.ts         # Zod config schema
│   │   │   └── types.ts          # All TypeScript types
│   │   └── tests/                # 90 tests (vitest)
│   │
│   ├── nextjs-adapter/       # @corsenai/corsen-context-nextjs
│   │   └── src/
│   │       ├── handlers.ts       # MCP + SSE + llms.txt handlers
│   │       └── with-corsen-context.ts  # next.config wrapper
│   │
│   ├── cli/                  # @corsenai/corsen-context-cli
│   │   └── src/
│   │       ├── init.ts           # Framework detection + scaffolding
│   │       ├── generate.ts       # llms.txt generation from live site
│   │       └── doctor.ts         # AI readiness checker
│   │
│   └── wordpress-plugin/     # Corsen Context for WordPress
│       └── corsen-context/
│           ├── corsen-context.php
│           └── includes/         # MCP server, llms generator, admin, security
│
├── LICENSE                   # MIT
├── CONTRIBUTING.md
├── SECURITY.md
└── README.md
```

---

## Roadmap

- More framework adapters (Astro, SvelteKit, Nuxt)
- MCP Registry listing
- Community adapter program

---

## Contributing

We welcome contributions — especially new framework adapters! See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## License

[MIT](LICENSE) — free for personal and commercial use.

Every generated `llms.txt` and MCP response includes:

> **Powered by Corsen Context** · Built by Corsen AI · [github.com/CorsenAI/corsen-context](https://github.com/CorsenAI/corsen-context)

---

<div align="center">

**Built by [Corsen AI](https://corsen.ai)** · European AI, sovereign by design

[GitHub](https://github.com/CorsenAI/corsen-context) · [Website](https://corsen.ai) · [Report Issue](https://github.com/CorsenAI/corsen-context/issues)

</div>
