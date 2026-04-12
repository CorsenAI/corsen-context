# Corsen Context — Full Technical Specification

## 1. Overview

**Corsen Context** is a Universal AI Context Layer that turns any website into an MCP-compliant server with enhanced `llms.txt` support.

Two layers work together:

### Static Layer (zero-config, fast)
- `/llms.txt` — Enhanced spec per llmstxt.org + Corsen Context extensions
- `/llms-full.txt` — Optional full markdown dump of all important content

### Dynamic Layer (MCP Server)
- Endpoint: `/api/mcp` (GET + POST JSON-RPC 2.0 + SSE)
- 100% compliant with MCP Specification 2025-11-25 (modelcontextprotocol.io)
- Discovery: `robots.txt` + `llms.txt` + `/.well-known/mcp`

### Discovery Flow
1. AI agent reads `robots.txt` → finds `MCP: https://example.com/api/mcp`
2. Or reads `llms.txt` → last line contains credit + MCP endpoint URL

---

## 2. Enhanced llms.txt Specification (Corsen Context Extension)

File: `/llms.txt` — Markdown, UTF-8, recommended < 50KB

### Required format:

```markdown
# [Site Name / Company]

> Short, accurate description of the site (1-3 sentences).

## About this AI Context File
This file is optimized for AI agents and MCP clients (2025-11-25 spec).
For dynamic structured access use the MCP endpoint below.

## Main Pages
- [Home](https://example.com/) – Main landing page
- [About Us](https://example.com/about) – Company & team

## Blog & Content
- [Post Title](https://example.com/blog/slug) – Short description • 2026-04-01

## Products / Services
- [Product Name](https://example.com/products/x) – Description

## AI Instructions (optional)
Tone and language preferences for AI responses.

**Powered by Corsen Context** • Built by Corsen AI • github.com/CorsenAI/corsen-context • MCP endpoint: https://example.com/api/mcp
```

### Optional `/llms-full.txt`
Full markdown content of all pages listed in `llms.txt`, separated by `---` dividers with page URL headers.

---

## 3. MCP Server — Full Compliance (2025-11-25)

### Endpoint
- `POST /api/mcp` — JSON-RPC 2.0
- `GET /api/mcp/sse` — Server-Sent Events (SSE) for streaming

### Capabilities (returned in `mcp.discover`)

#### Resources
Every page exposed as `resource://page/*`, `resource://blog/*`, `resource://product/*`

#### Tools (minimum 4)

```typescript
// 1. Search site content
search_site(query: string, limit?: number): SearchResult[]

// 2. Get full page content as markdown + metadata
get_page_content(uri: string): {
  markdown: string;
  title: string;
  description: string;
  lastModified: string;
  metadata: Record<string, string>;
}

// 3. List content by type (paginated)
list_content(type: "post" | "page" | "product", page?: number, limit?: number): ContentList

// 4. Get structured sitemap
get_sitemap(): SitemapEntry[]
```

### Transport
- Primary: SSE (`/api/mcp/sse`)
- Fallback: HTTP POST JSON-RPC (`/api/mcp`)

### JSON-RPC Methods
- `mcp.discover` — Returns capabilities, tools, resources
- `mcp.callTool` — Executes a tool
- `mcp.readResource` — Returns a resource by URI
- `mcp.listResources` — Lists all available resources
- `mcp.listTools` — Lists all available tools

---

## 4. Monorepo Structure

```
corsen-context/
├── packages/
│   ├── core/                  # @corsenai/corsen-context (TypeScript)
│   │   ├── src/
│   │   │   ├── index.ts       # Main exports
│   │   │   ├── sitemap.ts     # Sitemap parser + generator
│   │   │   ├── converter.ts   # HTML → clean Markdown (readability + turndown)
│   │   │   ├── llms-txt.ts    # llms.txt generator
│   │   │   ├── mcp-server.ts  # Full MCP JSON-RPC server
│   │   │   ├── cache.ts       # File-based + optional Redis cache
│   │   │   ├── security.ts    # Rate limiting, CORS, validation
│   │   │   ├── config.ts      # Zod config schema
│   │   │   └── types.ts       # All TypeScript types
│   │   ├── tests/
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── wordpress-plugin/      # Corsen Context for WordPress
│   │   ├── corsen-context/
│   │   │   ├── corsen-context.php      # Main plugin file
│   │   │   ├── includes/
│   │   │   │   ├── class-mcp-server.php
│   │   │   │   ├── class-llms-generator.php
│   │   │   │   ├── class-content-converter.php
│   │   │   │   ├── class-security.php
│   │   │   │   └── class-admin.php
│   │   │   ├── admin/
│   │   │   │   ├── settings-page.php
│   │   │   │   └── assets/
│   │   │   ├── readme.txt             # WordPress.org readme
│   │   │   └── uninstall.php
│   │   └── README.md
│   │
│   ├── nextjs-adapter/        # @corsenai/corsen-context-nextjs
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── middleware.ts
│   │   │   └── with-corsen-context.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── astro-adapter/         # @corsenai/corsen-context-astro
│   │   └── (Phase 1.5)
│   │
│   ├── cli/                   # npx corsen-context
│   │   ├── src/
│   │   │   ├── index.ts       # CLI entry point
│   │   │   ├── init.ts        # Framework detection + scaffold
│   │   │   ├── generate.ts    # Force regeneration
│   │   │   └── doctor.ts      # Check if site is AI-ready
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── universal-guide/       # Integration guides for all frameworks
│       ├── express.md
│       ├── laravel.md
│       ├── django.md
│       ├── shopify.md
│       ├── wix-webflow.md
│       └── static-sites.md
│
├── docs/
│   ├── getting-started.md
│   ├── configuration.md
│   ├── mcp-spec.md
│   ├── wordpress-guide.md
│   └── contributing.md
│
├── examples/
│   ├── express-basic/
│   └── nextjs-basic/
│
├── .github/
│   ├── ISSUE_TEMPLATE/
│   └── workflows/
│       └── ci.yml
│
├── LICENSE                    # MIT
├── README.md                  # Viral-quality README
├── CONTRIBUTING.md
├── SECURITY.md
├── package.json               # Root workspace
├── pnpm-workspace.yaml
├── turbo.json
├── .eslintrc.js
├── .prettierrc
└── .gitignore
```

---

## 5. packages/core — The Heart

### Key classes

```typescript
// Main entry point
export class CorsenContext {
  constructor(config: CorsenContextConfig)
  
  // Static layer
  generateLlmsTxt(): Promise<string>
  generateLlmsFullTxt(): Promise<string>
  
  // Dynamic layer
  createMCPServer(): MCPServer
  
  // Utilities
  discoverSitemap(url: string): Promise<SitemapEntry[]>
  convertToMarkdown(html: string): string
}

// MCP Server (full JSON-RPC 2.0)
export class MCPServer {
  handleRequest(req: JSONRPCRequest): Promise<JSONRPCResponse>
  handleSSE(req: Request, res: Response): void
  
  // Tool implementations
  searchSite(query: string, limit?: number): Promise<SearchResult[]>
  getPageContent(uri: string): Promise<PageContent>
  listContent(type: string, page?: number): Promise<ContentList>
  getSitemap(): Promise<SitemapEntry[]>
}

// Config (validated with Zod)
export interface CorsenContextConfig {
  siteUrl: string;
  siteName?: string;
  description?: string;
  content?: {
    postTypes?: string[];       // ['post', 'page', 'product']
    excludePaths?: string[];    // ['/admin', '/cart']
    maxPages?: number;          // default 500
  };
  mcp?: {
    enabled?: boolean;          // default true
    endpoint?: string;          // default '/api/mcp'
    tools?: string[];           // which tools to enable
  };
  static?: {
    generateLlmsTxt?: boolean;  // default true
    includeFullContent?: boolean; // default true
  };
  security?: {
    rateLimit?: number;         // req/min, default 100
    allowedOrigins?: string[];
    apiKey?: string;            // optional
  };
  cache?: {
    enabled?: boolean;          // default true
    ttl?: number;               // seconds, default 3600
    driver?: 'file' | 'redis';
  };
  credit?: boolean;             // default true, MUST be true in open source
}
```

### Dependencies
- `zod` — Schema validation
- `cheerio` — HTML parsing
- `@mozilla/readability` — Content extraction
- `turndown` — HTML → Markdown
- `fast-xml-parser` — Sitemap XML parsing

---

## 6. WordPress Plugin

### Plugin Header
```php
/**
 * Plugin Name: Corsen Context
 * Plugin URI: https://github.com/CorsenAI/corsen-context
 * Description: Make your WordPress site AI-native. Generates llms.txt and exposes a full MCP server for AI agents.
 * Version: 1.0.0
 * Author: Corsen AI
 * Author URI: https://corsen.ai
 * License: MIT
 * Text Domain: corsen-context
 */
```

### Features
- One-click install, zero-config defaults
- Settings page: post types, exclude URLs, enable/disable MCP, enable/disable llms.txt
- Auto-generates `/llms.txt` + `/llms-full.txt` on post save (cached, regenerated on cron)
- MCP endpoint at `/wp-json/corsen-context/v1/mcp`
- SSE endpoint at `/wp-json/corsen-context/v1/mcp/sse`
- Integration: Yoast SEO, Rank Math, Elementor, ACF (reads their metadata)
- Dashboard widget: "AI Context Status" (last generated, # pages, # AI queries anonymous count)
- Rewrite rules for `/llms.txt` and `/llms-full.txt`

### WordPress hooks used
- `rest_api_init` — Register MCP + SSE endpoints
- `init` — Rewrite rules for llms.txt
- `save_post` — Invalidate cache
- `admin_menu` — Settings page
- `wp_dashboard_setup` — Dashboard widget
- `wp_head` — Optional `<link rel="mcp">` meta tag

---

## 7. Next.js Adapter

```typescript
// next.config.mjs
import { withCorsenContext } from '@corsenai/corsen-context-nextjs';

export default withCorsenContext({
  siteUrl: 'https://example.com',
  // ... CorsenContextConfig
})(nextConfig);
```

This automatically:
- Adds `/llms.txt` and `/llms-full.txt` routes
- Adds `/api/mcp` POST endpoint
- Adds `/api/mcp/sse` GET endpoint
- Works with App Router + Pages Router

---

## 8. CLI Tool

```bash
# Auto-detect framework + scaffold config + files
npx corsen-context init

# Force regeneration of llms.txt
npx corsen-context generate

# Check if site is AI-ready (validates llms.txt + MCP endpoint)
npx corsen-context doctor
```

### `init` command
1. Detect framework (Next.js, Astro, Express, Laravel, Django, WordPress, static)
2. Create `corsen-context.config.js` with sensible defaults
3. Create integration code (middleware, route, plugin config)
4. Print instructions for next steps

---

## 9. Configuration File

All adapters use the same config format: `corsen-context.config.js` (or `.ts`, `.json`)

```javascript
export default {
  siteUrl: 'https://example.com',
  siteName: 'My Site',
  description: 'Short description for AI agents.',
  
  static: {
    generateLlmsTxt: true,
    includeFullContent: true,
  },
  
  mcp: {
    enabled: true,
    endpoint: '/api/mcp',
    tools: ['search_site', 'get_page_content', 'list_content', 'get_sitemap'],
  },
  
  content: {
    postTypes: ['post', 'page', 'product'],
    excludePaths: ['/admin', '/cart', '/checkout'],
    maxPages: 500,
  },
  
  security: {
    rateLimit: 100,
    allowedOrigins: [],
  },
  
  cache: {
    enabled: true,
    ttl: 3600,
    driver: 'file',
  },
  
  credit: true,
};
```

---

## 10. Universal Integration (ALL Frameworks)

### Core principle
One core engine → Many thin adapters → Zero or minimal code for developers.

### For any unlisted framework (5-15 lines of code)

```typescript
import { CorsenContext } from '@corsenai/corsen-context';

const cc = new CorsenContext({
  siteUrl: 'https://mysite.com',
  // fetch function to get your pages
});

// Serve llms.txt
app.get('/llms.txt', async (req, res) => {
  res.type('text/plain').send(await cc.generateLlmsTxt());
});

// Serve MCP endpoint
app.post('/api/mcp', async (req, res) => {
  const server = cc.createMCPServer();
  res.json(await server.handleRequest(req.body));
});
```

### Supported frameworks (Phase 1 MVP)
| Framework | Integration | Time |
|-----------|------------|------|
| WordPress | Full plugin (one-click) | 30 sec |
| Next.js | Middleware + config wrapper | 2 min |
| Express/Node | Middleware | 5 min |

### Phase 1.5
| Framework | Integration | Time |
|-----------|------------|------|
| Astro | Build-time generator | 1 min |
| Hugo/Jekyll | CLI generator | 1 min |
| Laravel | Composer package | 5 min |
| Django/FastAPI | Python package | 5 min |
| Shopify | Liquid snippet / App | 3 min |
| Wix/Webflow | Embed code | 2 min |
| SvelteKit/Nuxt | Adapter | 5 min |

---

## 11. Credit Line (Mandatory)

In every `llms.txt` generated:
```
**Powered by Corsen Context** • Built by Corsen AI • github.com/CorsenAI/corsen-context • MCP endpoint: {url}
```

In every MCP response header:
```
X-Powered-By: Corsen Context / Corsen AI
```

In `robots.txt` addition:
```
# AI Context powered by Corsen Context
MCP: https://example.com/api/mcp
```
