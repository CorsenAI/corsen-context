# Changelog

## [1.1.1] - 2026-04-25

### Security
- Fixed HTTPS sitemap discovery by preserving hostname, TLS SNI, and certificate validation while pinning DNS resolution against SSRF.
- Closed MCP CORS by default unless origins are explicitly allowlisted.
- Prevented Next.js config secrets from being injected into public runtime environment variables.
- Isolated Next.js handler instances so configs and providers cannot leak across handlers.
- Updated fast-xml-parser to the patched 5.7.x line.
- Hardened WordPress MCP and llms.txt output to expose only published, public, non-password-protected content.

### Maintenance
- Added ESLint 9 flat config and package-level npm publish metadata files.
- Cleaned public docs and package dry-run output to avoid local-only artifacts.

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
