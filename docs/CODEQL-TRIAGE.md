# CodeQL alert triage (main, 2026-09-01)

Scanned at `c0aeb37`. Resolved by code, not dismissed: 3× `js/xss-through-dom`
(`cc-nav.js` rebuilt with DOM APIs — `textContent`/`setAttribute` only, href
allow-list), 1× `js/polynomial-redos` (core linear trailing-slash trim),
1× `js/file-system-race` (CLI exclusive `wx` create). GitHub closed these
automatically on the re-scan.

Dismissed with rationale:

- **7× `js/user-controlled-bypass` (error)** — every instance is the same
  `mcpPostPreflight` guard in `examples/*/server.js`: a branch on
  `Content-Type` that *rejects* non-JSON with HTTP 415. It is a validation
  enforcement branch, not an authentication decision; real auth is
  `server.checkAuth(apiKey)` on the accepted path. False positive.
- **7× `js/missing-rate-limiting` (warning)** — login/token endpoints of the
  local-only example servers (Directus, Express, Ghost, MediaWiki, Strapi,
  Wagtail, static-html functions). The examples run on localhost for
  evaluation; they are not deployed services and are documented as demos.
  The production surface is the WordPress plugin, which rate-limits at the
  server (MCP throttle + `check_agent_access` fail-closed). Won't fix in
  example scope.
- **1× `js/bad-tag-filter`** — `scripts/build-observatory-bundle.mjs` is a
  build-time script over first-party source files; the "HTML filtering
  regex" is a tag normalizer for bundling, never a security boundary over
  untrusted input. False positive.
- **12× `js/unused-local-variable` (note)** — informational, in example and
  fixture code; no runtime effect.

The repository keeps zero open alerts that represent an exploitable path in
shipped code. Re-triage this file whenever the CodeQL tab grows new rows.
