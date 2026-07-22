# Changelog

## [1.2.1] - 2026-07-21

### WordPress plugin

- Enforced the global disable switch across public endpoints and discovery output.
- Made content rendering safe by default and disabled shared caching for full-rendered content.
- Added origin/protocol checks, signed cursors, bounded pagination, Markdown hardening, normalized exclusions, and an exposure veto filter.
- Made `llms-full.txt` opt-in with global item, byte, locking, and scheduled-generation limits.
- Omitted author display names by default.
- Added PHP unit and WordPress integration tests; coding standards now block CI.
- Corrected unsupported compliance, discovery, caching, and page-builder claims in the WordPress listing.
- Prevented WordPress canonical redirects from changing `/llms.txt` to `/llms.txt/` and refreshes rewrite rules once per plugin version.

## [1.2.0] - 2026-07-13

### Security
- Rate limiter keys on the socket IP by default; `X-Forwarded-For`/`X-Real-IP`/`CF-Connecting-IP` are only trusted when `security.trustProxy` is enabled (WordPress: `CORSEN_CONTEXT_TRUST_PROXY`). Closes a spoofable rate-limit bypass on all adapters.
- `safeFetch` now keeps the real hostname for TLS/SNI and pins the vetted IP at the socket level via `undici` when available — fixing broken HTTPS fetches while still defeating DNS rebinding; without `undici` it resolves and verifies every IP is public (fail-closed).
- `isPrivateIp` now covers the full IPv6 link-local range (`fe80::/10`) and IPv4-mapped/embedded forms, including the canonical hex form (`::ffff:a9fe:a9fe`).
- Content-policy path exclusions are now case-insensitive and percent-decoded, closing `/ADMIN` and `/%61dmin` bypasses.
- Next.js adapter enforces the body-size cap on actual bytes streamed (not the spoofable `Content-Length`), returning 413; rate limiting now runs before auth.
- WordPress: rate limiting runs before auth; uses the object cache's atomic INCR when available; `resources/read`/`get_page_content` validate the URI resolves to a same-site, non-excluded, http(s) URL; settings restrict post types to publicly-registered types.
- Sitemap fetch enforces the 5 MB cap while streaming (chunked responses can no longer bypass it).
- Rate-limit logs a hashed IP instead of the raw address.
- SSE handler (Next.js) is gated behind auth + rate limiting.
- Optional `security.exposeVersion: false` to omit the exact server version from `serverInfo`.

### Fixed
- `resources/list` no longer crashes when a provider returns relative URLs.
- `list_content` computes `total`/`hasMore` on the full type-filtered set, independent of `maxPages`.
- Rate-limit state is now shared across the per-request server instances every adapter creates, so the default in-memory limiter actually accumulates.
- `RedisCache` sets TTLs via `EXPIRE`, so entries expire on ioredis (not just @upstash/redis).
- HTML→Markdown preserves in-article `<header>` (page H1), skips empty `<main>` wrappers, and neutralizes `javascript:`/`vbscript:`/`file:`/`data:` link targets.
- Sitemap parsing de-duplicates URLs and drops non-numeric priorities.
- `serverInfo` and the CLI report a single-sourced version; `initialize` negotiates the client's protocol version.

### Added
- Batteries-included providers: `createInMemoryProvider`, `createSitemapProvider`.
- Discovery generators: `generateRobotsTxt`, `generateWellKnownMcp`, `mcpLinkTag`.
- `resources/list` cursor pagination; `invalidatePage`/`clearCache` for cache invalidation.
- Next.js handlers accept a `{ cache, rateLimitStore, logger }` options bag for production (Redis) wiring.
- WordPress: MCP response caching (transients, invalidated on content change) and a `corsen_context_enabled_tools` filter.
- Repo: GitHub Actions CI (Node + PHP), CodeQL, Changesets-based release with npm provenance, PHPCS config, and expanded test coverage.

## [1.1.0] - 2026-04-12

### Security
- SSRF DNS rebinding protection with IP pinning
- WordPress SSRF fail-closed on DNS failure
- PHP ReDoS null-safe preg_replace
- Timing-safe API key validation (SHA-256)
- XML bomb protection: 5MB sitemap limit
- XXE defense: disabled entity processing
- Rate limiter TTL renewal fix
- Cache-Control: no-store on MCP endpoints
- Rate-limit transient cleanup on uninstall

### Fixed
- Double rate limit counting in Next.js adapter
- CORS headers missing when no allowedOrigins set
- Query parameters stripped from resource URIs
- Global rate limit block when client IP unknown
- Missing await in CLI doctor and templates
- Express template missing express.json()
- list_content rejecting custom post types
- WordPress $params validation and posts_per_page

### Added
- WordPress admin max_pages setting (10-5000)
- WP-Cron hourly garbage collector for transients
- Dashboard widget admin-only visibility

## [1.0.0] - 2026-04-08

Initial release — MCP 2025-11-25 server, llms.txt generation, WordPress plugin, Next.js adapter, and CLI.
