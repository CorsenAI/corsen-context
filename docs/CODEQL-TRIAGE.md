# CodeQL alert triage (main, 2026-09-03)

The 2026-09-03 navigation rewrite (`fix: restore browser navigation across
demos`) opened nine new alerts, 49–57. All nine are resolved by code in the
follow-up commit, not dismissed:

- **5× `js/xss-through-dom`** — `cc-nav.js` (shared source plus its three file
  copies) passed `data-repository` and `data-home` attribute text through a
  scheme check into `setAttribute('href', …)`. The navigation now resolves
  `data-repository` through an allowlist of the known Corsen repositories and
  `data-home` through a fixed two-value switch, so every `href` written to the
  DOM is a constant from the script itself. The accent colour is validated as a
  hex literal for the same reason.
- **2× `js/bad-tag-filter`** — the observatory bundler and the inline-script
  smoke used `<\/script>` closing-tag patterns over first-party markup. They now
  tolerate whitespace before `>`; both remain whitespace/extraction helpers, not
  HTML sanitizers, and are documented as such in the code.
- **2× `js/unused-local-variable`** — an unused `FILES` constant in the bundler
  (now the single source for both loops) and an unused `SITE_URL` import in the
  static-HTML content module.

Before that rewrite the GitHub view contained 46 historical alerts: 13 fixed
and 33 dismissed, with zero open alerts. Resolved by code, not dismissed: 3× `js/xss-through-dom`
(`cc-nav.js` rebuilt with DOM APIs — `textContent`/`setAttribute` only, href
allow-list), 1× `js/polynomial-redos` (core linear trailing-slash trim),
1× `js/file-system-race` (CLI exclusive `wx` create). GitHub closed these
automatically on the re-scan.

Dismissed with rationale:

- **7× `js/user-controlled-bypass` (error)** — every instance is the same
  `mcpPostPreflight` guard in `examples/*/server.js`: a branch on
  `Content-Type` that _rejects_ non-JSON with HTTP 415. It is a validation
  enforcement branch, not an authentication decision; real auth is
  `server.checkAuth(apiKey)` on the accepted path. False positive.
- **7× `js/missing-rate-limiting` (warning)** — example authentication or token
  routes. These examples also back public demonstrations, so the earlier
  "local-only" rationale was inaccurate. The dismissals are historical and do
  not establish that these routes are suitable for production authentication;
  each deployment README requires a real identity provider and edge rate limit.
- **1× `js/bad-tag-filter`** — `scripts/build-observatory-bundle.mjs` is a
  build-time script over first-party source files; the "HTML filtering
  regex" is a tag normalizer for bundling, never a security boundary over
  untrusted input. False positive.
- **12× `js/unused-local-variable` (note)** — informational, in example and
  fixture code; no runtime effect.
- **3× later `js/xss-through-dom` (warning)** — alerts 46–48 were dismissed as
  `won't fix` for `setAttribute('href', homeHref)` in the DOM-based navigation,
  after `homeHref` is reduced to a same-origin root URL. These are dismissals,
  not code-fixed alerts, and are counted in the 33 above.
- **3× password-hash alerts** — historical dismissals also counted in the 33;
  consult the GitHub alert record for the per-alert rationale.

Zero open alerts is a scanner status, not proof that the examples or deployments
have no security defects. Re-triage this file whenever the CodeQL tab grows new
rows.
