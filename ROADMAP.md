# Corsen Context — Roadmap & Growth Strategy

## Phase 1: MVP (Week 1-2) — BUILD THIS FIRST

### 1.1 packages/core (TypeScript)
- [ ] Sitemap parser (XML → structured entries)
- [ ] HTML → Markdown converter (readability + turndown)
- [ ] llms.txt generator (enhanced spec)
- [ ] llms-full.txt generator
- [ ] MCP Server (full JSON-RPC 2.0 + SSE)
- [ ] 4 tools: search_site, get_page_content, list_content, get_sitemap
- [ ] Security layer (rate limiting, CORS, validation, SSRF protection)
- [ ] File-based cache
- [ ] Zod config validation
- [ ] Vitest tests
- [ ] Build with tsup, publish-ready

### 1.2 WordPress Plugin
- [ ] Main plugin file with proper headers
- [ ] MCP endpoint via WP REST API
- [ ] SSE endpoint
- [ ] llms.txt rewrite rule + generator
- [ ] Settings page (post types, excludes, toggles)
- [ ] Yoast SEO / Rank Math metadata integration
- [ ] Dashboard widget
- [ ] Cache invalidation on post save
- [ ] readme.txt for WordPress.org
- [ ] PHPCS compliance

### 1.3 Next.js Adapter
- [ ] `withCorsenContext()` config wrapper
- [ ] Middleware for /llms.txt routes
- [ ] API route for /api/mcp
- [ ] SSE support
- [ ] Works with App Router + Pages Router

### 1.4 CLI Tool
- [ ] `npx corsen-context init` — framework detection + scaffold
- [ ] `npx corsen-context generate` — force regen
- [ ] `npx corsen-context doctor` — validate setup

### 1.5 README + Docs
- [ ] Viral-quality README.md (badges, quick start, demo placeholder)
- [ ] CONTRIBUTING.md
- [ ] docs/ folder with guides
- [ ] LICENSE (MIT)

---

## Phase 1.5: More Adapters (Week 3-4)
- [ ] Astro adapter (build-time generator)
- [ ] Hugo/Jekyll adapter (CLI-based)
- [ ] Express middleware example
- [ ] Laravel composer package
- [ ] Django/FastAPI Python package
- [ ] Universal integration guides (markdown)
- [ ] Shopify app/snippet
- [ ] Wix/Webflow embed instructions

---

## Phase 2: Polish & Publish (Week 4-6)
- [ ] Python port of core library (pip package)
- [ ] Publish to npm (@corsenai/corsen-context)
- [ ] Submit WordPress plugin to WordPress.org
- [ ] Submit to Anthropic Connectors Directory
- [ ] Submit to MCP Registry (registry.modelcontextprotocol.io)
- [ ] Redis cache driver option
- [ ] AI-quality scoring per page (optional LLM call)
- [ ] Localization support (multi-language llms.txt)

---

## Phase 3: Growth Hacking (Month 2-3)

### Launch (Week 1)
- GitHub repo public with polished README
- Hacker News post: "Show HN: Corsen Context – Make any website AI-native in one click"
- Reddit posts: r/WordPress, r/webdev, r/MachineLearning, r/LocalLLaMA, r/nextjs
- X/Twitter thread with 60-second demo
- Dev.to / Hashnode article

### Integrations (Week 2-4)
- PR to Yoast SEO and Rank Math for native integration
- Partnership outreach to Elementor, 10Web, AI Engine plugins
- Directory: "AI-Ready Sites" (powered by Corsen Context)
- Astro, Hugo, Nuxt community posts

### Community (Ongoing)
- GitHub Discussions enabled
- Discord community
- Badge: "AI-Native with Corsen Context" for websites
- CONTRIBUTING.md with adapter template
- Bounty for community adapters (Shopify, Wix, etc.)

### Standards Push
- Contribute to MCP spec discussions (Linux Foundation / Anthropic)
- Propose "website MCP" best practices document
- Engage with llms.txt community

---

## Phase 4: Enterprise & Monetization (Month 6+)

### Corsen Context Pro (SaaS)
- Analytics dashboard: how many AI agents query your site
- Which tools/pages are most requested
- AI query quality scoring
- Custom AI instructions per page
- Priority support

### Corsen Context Enterprise
- Self-hosted option
- SSO / RBAC
- Audit logging
- Custom tools per client
- SLA

---

## Success Metrics

### MVP (Week 2)
- Core library functional + tested
- WordPress plugin installable + working
- GitHub repo public with stars

### Month 1
- 100+ GitHub stars
- 50+ WordPress installs
- Listed in Anthropic Connectors Directory

### Month 3
- 1000+ GitHub stars
- 500+ WordPress installs
- 10+ community adapters
- Featured in at least 1 major tech publication

### Month 6
- Recognized as the standard for website-to-AI context
- Corsen Context Pro launched
- Revenue from Pro tier
