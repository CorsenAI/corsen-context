# Corsen Context — Security Requirements

All security measures below are **MANDATORY** in every component (core, WordPress plugin, adapters).
Based on MCP Official Best Practices 2026 + OWASP Top 10.

---

## 1. Transport Security

- **HTTPS only** — All MCP endpoints SHOULD be served over HTTPS. TLS termination and any HTTP→HTTPS redirect are handled at your deployment/proxy layer (Vercel, nginx, Cloudflare, WordPress host), not by the library.
- **TLS 1.2+** minimum
- Outbound fetches (sitemap/content discovery) validate the certificate against the real hostname and never follow redirects.

## 2. Rate Limiting

- Default: **100 requests/minute per IP**
- Configurable via `security.rateLimit` in config
- Burst protection: **10 requests/second** max burst
- Return `429 Too Many Requests` with `Retry-After` header
- Implementation: sliding window counter (in-memory or Redis)

## 3. Input Validation

- **ALL inputs** validated with Zod schemas before processing
- JSON-RPC request body: validate `jsonrpc`, `method`, `params`, `id`
- Tool parameters: validate types, ranges, string lengths
- URI parameters: validate against allowed patterns
- **Never trust client input** — sanitize everything

## 4. CORS (Cross-Origin Resource Sharing)

- Corsen Context serves a **public read-only content API** with no cookies or ambient credentials, so the default is `Access-Control-Allow-Origin: *` when no origins are configured. This is safe here because there is nothing credentialed to leak cross-origin.
- To restrict access, set `security.allowedOrigins` — the server then reflects only whitelisted origins and adds `Vary: Origin`.
- Combine with `security.apiKey` when the content should not be world-readable.

## 5. SSRF Protection (Server-Side Request Forgery)

Block ALL requests to private/internal IP ranges:
- `10.0.0.0/8`
- `172.16.0.0/12`
- `192.168.0.0/16`
- `127.0.0.0/8` (localhost)
- `169.254.0.0/16` (link-local)
- `100.64.0.0/10` (carrier-grade NAT)
- `::1` (IPv6 localhost)
- `fc00::/7` (IPv6 unique-local)
- `fe80::/10` (IPv6 link-local)
- IPv4-mapped / embedded IPv6 forms (`::ffff:a.b.c.d`, incl. the canonical hex form)

Enforcement (`safeFetch`): resolve DNS, verify **every** resolved IP is public (fail-closed on resolution failure), then fetch the original URL so TLS validates against the real hostname. When the optional `undici` package is present, the connection is additionally pinned to the vetted IP at the socket level, which fully defeats DNS rebinding. Redirects are never followed.

This applies to:
- Sitemap fetching
- Content fetching
- Any URL the server follows

## 6. Content Access Control (ACL)

- **NEVER expose** private/draft/password-protected/trashed content
- Respect CMS permissions:
  - WordPress: only `publish` status, only public post types
  - Other CMS: equivalent published/public status
- Filter out pages in `excludePaths` config
- Never expose admin pages, login pages, or internal routes

## 7. Authentication (Optional)

- Optional API key via `X-MCP-Key` header
- Optional Bearer token via `Authorization` header
- Keys stored as environment variables, NEVER in config files
- Keys compared using timing-safe comparison (`crypto.timingSafeEqual`)

## 8. Host & Origin Validation

- A `validateHost(hostHeader, expectedHost)` helper is exported for deployments that want to reject mismatched `Host` headers (browser-side DNS rebinding protection). It is opt-in, not enforced by the core pipeline, because the correct expected host depends on your deployment.
- `Origin` is validated against `security.allowedOrigins` when configured (see §4).

## 9. Security Headers

All responses MUST include:
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 0
Referrer-Policy: strict-origin-when-cross-origin
Content-Security-Policy: default-src 'none'
Cache-Control: no-store (for MCP responses)
```

## 10. No Redirects

- MCP endpoints MUST NOT follow redirects automatically
- If content source returns a redirect, validate the target URL before following
- Block redirects to private IP ranges (SSRF via redirect)

## 11. Logging

- Log: timestamp, method, response status, response time, and a **hashed** client IP (raw IPs are never logged)
- **NEVER log**: request body content, API keys, user data, page content
- Sensitive fields (`apiKey`, `authorization`, `password`, `secret`, `token`) are automatically redacted by the Pino logger
- Configurable: set `LOG_LEVEL=silent` to disable

## 12. Error Handling

- Never expose stack traces, file paths, or internal errors to clients
- Return generic JSON-RPC error messages:
  - `-32700` Parse error
  - `-32600` Invalid Request
  - `-32601` Method not found
  - `-32602` Invalid params
  - `-32603` Internal error
- Log detailed errors server-side only

## 13. WordPress-Specific Security

- Use WordPress nonces for admin AJAX
- Sanitize with `sanitize_text_field()`, `esc_html()`, `esc_url()`
- Use `$wpdb->prepare()` for any database queries
- Check `current_user_can()` for admin actions
- Use `wp_verify_nonce()` for form submissions
- REST API: proper `permission_callback` on all routes

## 14. Dependency Security

- Lock all dependency versions (`package-lock.json` / `composer.lock`)
- Run `npm audit` / `composer audit` in CI
- No dependencies with known CVEs
- Minimal dependency tree — prefer built-in Node/PHP APIs

## 15. Supply Chain

- All packages published from CI only (GitHub Actions)
- Signed commits recommended
- `package.json` `files` field to control what gets published
- `.npmignore` to exclude tests, docs, configs from published package
