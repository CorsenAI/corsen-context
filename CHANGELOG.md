# Changelog

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

Initial release — MCP 2025-11-25 server, llms.txt generation, WordPress plugin, Next.js adapter, CLI, 88 tests.
