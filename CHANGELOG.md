# Changelog

All notable changes to this project will be documented in this file.

## [1.1.0] - 2026-04-12

### WordPress.org Submission
- Plugin submitted to WordPress.org Plugin Directory on 2026-04-12
- Slug: `corsen-context` (reserved)
- Automated scan: **PASS**
- Tested up to: WordPress 6.9.4 (PHP 8.5, SQLite)
- QA: 19/19 tests passed locally (activation, llms.txt, MCP endpoint, all 4 tools, resources, notifications, security headers, draft exclusion, deactivation/reactivation cycle)
- Awaiting manual review (estimated 3-10 business days)

### Security Fixes

- **[CRITICAL] SSRF DNS Rebinding protection** (`security.ts`, `sitemap.ts`, `generate.ts`): Introduced `safeFetch()` — a DNS-pinned fetch function that resolves DNS once, validates all IPs are public, then replaces the hostname with the resolved IP in the URL. This eliminates the TOCTOU window where an attacker's DNS server could return a public IP for the check and a private IP for the actual fetch. All outbound fetches in the core and CLI now use `safeFetch()`.
- **[CRITICAL] WordPress SSRF fail-open → fail-closed** (`class-security.php`): DNS resolution failure now blocks the request (fail-closed) instead of allowing it through. Aligns with the TypeScript core behavior.
- **[CRITICAL] PHP ReDoS crash protection** (`class-content-converter.php`): All `preg_replace` calls now use null-coalescing (`?? $html`) to prevent fatal TypeError when PCRE backtrack limit is exceeded on large HTML payloads.
- **[HIGH] WordPress rate limiter TTL renewal bug** (`class-security.php`): The rate limit counter no longer renews its TTL on every request. Previously, a steady stream of requests would never reset the counter, effectively converting a per-minute limit into a per-session limit. The counter now tracks its start time and preserves the remaining TTL on increment.
- **[HIGH] XML bomb / OOM protection** (`sitemap.ts`): Sitemap responses are now limited to 5 MB to prevent out-of-memory attacks from malicious XML payloads (Billion Laughs / zip bombs).
- **[MEDIUM] WordPress uninstall database cleanup** (`uninstall.php`): Plugin uninstallation now removes all rate-limit transients (`corsen_rl_*`) from the database to prevent long-term bloat in `wp_options`.
- **[MEDIUM] WordPress rate limit garbage collector** (`class-security.php`, `corsen-context.php`): Added WP-Cron hourly job (`corsen_context_hourly_cleanup`) that purges expired rate-limit transients from `wp_options`. Uses a surgical LEFT JOIN DELETE targeting only `corsen_rl_*` entries — prevents database bloat from high-traffic or DDoS scenarios. Cron is scheduled on activation and cleared on deactivation.
- **[MEDIUM] Timing-safe API key validation** (`security.ts`): `validateApiKey` now compares SHA-256 hashes instead of raw keys, eliminating a timing leak that revealed key length. `ApiKeyManager.validate()` now uses `timingSafeEqual` for hash comparison instead of `!==`.

### Bug Fixes

- **MCP server version mismatch** (`mcp-server.ts`): The MCP `initialize` response reported `version: 1.0.0` while package.json was at `1.1.0`. Fixed to match the actual version.

- **Double rate limit counting** (`mcp-server.ts`, `handlers.ts`): The Next.js adapter was consuming 2 rate limit credits per request — once in the handler and once internally in `handleRequest`. Added `skipRateLimit` option to prevent double-counting when the adapter already performed the check.
- **CORS headers never sent by default** (`mcp-server.ts`): When `allowedOrigins` was empty (default config), no CORS headers were set at all, blocking all browser-based MCP clients. Now sends `Access-Control-Allow-Origin: *` when no whitelist is configured.
- **Query parameters lost in MCP resources** (`mcp-server.ts`): Resource URIs now preserve the full path including query string (`?param=value`). Previously, `new URL(p.url).pathname` stripped all query parameters, making dynamic pages inaccessible via `resources/read`.
- **Global rate limit block on missing IP** (`handlers.ts`): When no proxy headers were present, all clients shared the rate limit key `"unknown"`, causing a global block. Now falls back to a User-Agent-based hash for per-client differentiation.
- **`isPrivateUrl` called without await** (`doctor.ts`): The CLI doctor command compared a Promise (always truthy) instead of the resolved boolean. Fixed with proper `await`.
- **CLI templates missing `await`** (`init.ts`): The generated code templates for Next.js Pages Router, Express, and Astro were calling `server.checkRateLimit()` without `await`, causing race conditions.
- **Express template now self-contained** (`init.ts`): The generated Express route file now imports `express` and mounts `express.json()` middleware on the MCP endpoint, instead of relying on users to configure it manually.
- **`list_content` tool now accepts custom post types** (`security.ts`, `mcp-server.ts`): The Zod schema was hardcoded to `['post', 'page', 'product']`, rejecting any custom type configured in `content.postTypes`. Now accepts any string type.
- **Removed dead code** (`mcp-server.ts`): Unused `siteUrl` variable in `handleListResources` removed.

### Improvements

- **WordPress admin: `max_pages` setting** (`class-admin.php`): The MCP server used `max_pages` internally but the setting was missing from the admin UI. Now configurable (10–5000, default 500).

### Known Limitations (documented)

- **X-Forwarded-For spoofing**: The `extractClientIp` function trusts proxy headers. When not behind a trusted reverse proxy, attackers can spoof their IP to bypass rate limiting. Document your proxy chain and configure `allowedOrigins` for production deployments.
- **WordPress transient race condition**: The `get_transient` → `set_transient` pattern is not atomic under PHP-FPM concurrency. For high-traffic WordPress sites, use a Redis-backed object cache (e.g., `wp-redis` plugin) which makes transient operations atomic via Redis INCR.

## [1.0.0] - 2026-04-08

### Initial Release

- Full MCP 2025-11-25 JSON-RPC server with 4 tools
- `initialize`, `ping`, `notifications/initialized` support
- `tools/list`, `tools/call`, `resources/list`, `resources/read`
- llms.txt and llms-full.txt generation with auto-caching
- TypeScript core library with Zod validation
- Next.js adapter (App Router + Pages Router)
- CLI tool with `init`, `generate`, and `doctor` commands
- WordPress plugin with admin settings page and dashboard widget
- Redis cache and rate limit store for production deployments
- Yoast SEO and Rank Math metadata integration
- SSRF protection (DNS-aware), security headers, API key auth
- Express and Astro examples
- MIT License
