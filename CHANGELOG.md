# Changelog

## WordPress plugin [1.5.15] - 2026-09-03

- "Hide user enumeration" now blocks anonymous author archives on
  `pre_handle_404`, before the `wp` action, and drops the queried user from
  the main query. The previous `template_redirect` hook returned 404 but SEO
  plugins and `wp_get_document_title()` still printed the author's nicename
  and archive URL in the 404 page title and Open Graph tags. Covered by the
  integration test.
- Repository hygiene: the shared demo navigation resolves `data-repository`
  through an allowlist of known repositories and `data-home` through a fixed
  two-value switch, so no attribute text reaches an `href` sink; the
  observatory bundler and the inline-script smoke tolerate whitespace in
  closing tags; an unused import and an unused constant were removed. This
  closes the nine CodeQL alerts opened by the 2026-09-03 navigation rewrite.
- A private research file (`probe_sites.json`) that had been committed by
  mistake was removed from the repository.

## npm packages [2.0.1] - Candidate - 2026-09-02

- The CLI now discovers custom MCP endpoints from `llms.txt` or `robots.txt`,
  accepts only same-origin HTTPS targets, and falls back safely to `/v1/mcp`.
- All four public packages carry the same candidate version, and every npm
  example is pinned to the published 2.x API and passes the local-tarball
  installation/build/transport receipt.

## WordPress plugin [1.5.14] - Candidate - 2026-09-02

- Hardened product lookup and every optional reader against the same owner
  visibility policy used by the four core tools.
- Bounded and secured structured-data loopbacks, corrected Abilities output
  schemas, Unicode-safe validators/chunks, and ignored fenced-code headings in
  section outlines.
- Added an explicit same-origin human handoff URL, complete uninstall cleanup
  including trashed private requests, per-product WooCommerce policy controls,
  and strict response validation for the owner-triggered agent-surface check.
- Unit receipt: 188 tests / 868 assertions; WordPress coding standards clean.

## npm packages [2.0.0] - Candidate - 2026-08-30

### Breaking runtime requirement

- Raised the four npm packages to Node.js 22.12 or newer; the repository toolchain
  uses Node.js 22.13 or newer and pnpm 11.24 or newer.

### Contract validation

- Added explicit schema bounds and `additionalProperties: false` to the shared
  four-tool manifest.
- Made the TypeScript runtime reject wrong scalar types, fractional integers,
  unknown properties, and out-of-range values without coercion. Valid
  `arguments` objects with invalid tool input now return `isError: true`;
  malformed call envelopes remain JSON-RPC `-32602`.
- Added execution-level tests for invalid calls, same-origin endpoint
  resolution, and Promise-based WebMCP registration failures.
- Made `mcp.enabled` an authoritative pre-provider gate for the core, supplied
  MCP routes, WebMCP routes, and legacy discovery route.
- Made `static.generateLlmsTxt` gate both `CorsenContext` static generation
  methods and supplied handlers, kept full content disabled by default behind
  `static.includeFullContent`, and bounded `static.maxOutputBytes` to 64
  KiB–10 MiB (5 MiB default). Static output now truncates only at complete
  UTF-8 code points. `content.maxPages` is schema-bounded to 5000.
- Normalized same-site static URLs and escaped generated Markdown metadata and
  destinations. Provider-supplied page bodies remain unchanged and explicitly
  untrusted.

### Transport and verification

- Added strict initialize metadata, media negotiation, Origin/CORS handling,
  notification acknowledgement, and required server metadata across the
  supplied TypeScript handlers.
- Standardized bounded JSON parsing across the supplied Node handlers:
  malformed JSON returns `-32700`, bodies over 100 KiB return `413`, and Origin,
  media negotiation, rate limiting, and authentication run before parsing.
- Added a 10-second upstream fetch timeout to every CMS reference bridge.
  All five references cache successful provider results in process-local memory
  and coalesce concurrent misses. Ghost, Strapi, Directus, and Wagtail use a
  fixed 60-second TTL; MediaWiki retains its bounded, configurable 30-second
  default.
- Stopped `withCorsenContext` from serializing the Corsen configuration through
  `nextConfig.env`; route handlers now import server-only configuration
  directly.
- Added a candidate-package receipt that packs this checkout, installs it into
  all nine npm examples without changing their lockfiles, builds them, and
  exercises their MCP and WebMCP surfaces.

## WordPress plugin [1.5.13] - 2026-09-01

### Honest enforcement + review hardening (second independent review)

- `auth_callback` for the two policy meta keys checked
  `current_user_can('edit_post_meta', ...)`, which re-enters the callback for
  registered protected meta; it now checks `edit_post` (Core's own documented
  pattern).
- The agent head banner was injected unconditionally; it now renders only when
  the master switch and the MCP channel are both on — no advertising a channel
  the owner disabled.
- Owner reason truncation no longer depends on `mbstring`: a PCRE `//u`
  fallback keeps UTF-8 intact on hosts without it (found by review; the flag
  is not in WP's required list).
- `llms.txt` now opens with **START HERE for AI agents** and its policy block
  distinguishes, in the file itself, what the server hard-refuses (expert
  intake, `human_only`) from `agentPurchase`, which is a binding contract
  instruction backed mechanically by the store's coupon rules. SECURITY.md
  states the same boundary; the earlier "server-side checkout path is closed
  to unattended agents" sentence overstated the mechanism and is corrected.
- Zero-drift made literal: the human-only form notice is generated from the
  policy table (`[corsen_human_only_notice]`); the Elementor form carries the
  shortcode instead of hand-written prose. Shared `cc-nav.js` rebuilt on the
  DOM API — no `innerHTML` sink fed by page attributes anymore (3 CodeQL
  `js/xss-through-dom` alerts resolved at the source, all copies).
- Tests: 165 unit tests green (banner gating, truncation, notice, owner form),
  phpcs clean.

## WordPress plugin [1.5.12] - 2026-09-01

### Governed-agent policy (single source, server-enforced)

- One policy table (`class-agent-policy.php`) renders into **every** channel:
  MCP `tools/list` descriptions, the WebMCP bridge, `llms.txt`, an HTML head
  banner visible to naive parsers, and the `[corsen_agent_policy]` page
  shortcode. No machine-facing copy could drift from the wire; human-facing
  form prose was still hand-written at this point — corrected in 1.5.13.
- `request_expert_call` is now **human-only by policy**: still advertised (so
  agents can read the rule), refused server-side for every agent call with
  error code `human_only` + handoff URL, before any throttle or storage.
- `get_product` output carries `agentPurchase` (`allowed`|`forbidden`) and
  `agentPurchaseReason` from owner-set product meta (`_cc_agent_purchase`);
  the tool description makes the rule explicit: forbidden = hand the URL to
  a human, never start checkout.
- OPTIONS preflight matching tolerates `rest_route` and atypical permalink
  prefixes (P1 from the 2026-09-01 independent review).
- Tests: `AgentPolicyTest` (8) + expert tests re-aimed at the new law;
  161 unit tests green, phpcs clean.

## WordPress plugin [1.5.11] - 2026-09-01

### The transport now backs every claim (independent review 2026-09-01)

- `tools/list` now emits the WebMCP annotation table on the MCP transport
  (`readOnlyHint`, `untrustedContentHint`, and for `request_expert_call`
  `readOnlyHint: false`). Until now the annotations existed only in the
  in-page bridge, so SECURITY.md described a promise the wire did not keep.
- `get_sections`: the id `"top"` documented by the inputSchema is now always
  listed in the outline (zero bytes when the page opens on its heading) and
  always resolves, instead of every client call dying with
  `section_not_found`.
- The owner switch "Hide user enumeration" now also closes the classic doors:
  `/?author=N` and `/author/{login}` archives answer 404 to anonymous visitors
  before core's canonical redirect can leak the login in a `Location` header.
  The 1.5.4 fix had only blocked the REST users collection.
- The MCP route's `OPTIONS` preflight is answered by the plugin (`Allow: POST,
OPTIONS`, no credentials, `Vary: Origin`) instead of core advertising every
  verb with `Access-Control-Allow-Credentials` for any echoed origin — the
  same class of transport lie the 1.5.9 `Allow` fix closed for `GET`.
- Tests: 153 unit (adds the always-resolving `top` regression) and 2 new
  integration cases (annotation emission, author-door blocking).

## WordPress plugin [1.5.10] - 2026-09-01

- `get_product(slug)` integrity: the resolver now verifies the candidate's stored
  `post_name` (slugs are exact or nothing) and the slug branch obeys the same
  owner exposure policy as the URL branch. Previously a stale query silently
  returned a DIFFERENT product and bypassed exclusions (external live audit).
- `get_sections` outline is an index: entries expose only `id`, `level`,
  `heading`, `bytes`. Embedding each section's markdown had made the "cheap"
  outline (95 KB) bigger than `get_page_content` of the same page (85 KB).
  Section ids are collision-free even against literal `-N` suffixes, and
  byte-budget chunks never split a UTF-8 codepoint.
- Control Center save integrity: the form posts `hide_user_enumeration` and
  `credit` explicitly (every CC save silently switched them off), and a
  deliberately empty content-type selection persists as "expose nothing"
  instead of reverting to `post,page`.

## WordPress plugin [1.5.9] - 2026-09-01

- MCP route `Allow` header: the 405 GET answer now advertises `POST` only.
  WordPress Core was overwriting it with the route's registered methods
  (`POST, GET, OPTIONS`), contradicting the MCP transport spec, the plugin's
  own documentation, and the nine other reference stacks. New integration
  test covers the header end to end.

## WordPress plugin [1.5.8] - 2026-09-01

- Agent-access MCP probe sends proper JSON-RPC headers (endpoint answers 200, not 415); new test asserts the probe's own headers (the 1.5.5 announced fix had silently failed to apply - caught by live re-verification, never by the suite).

## WordPress plugin [1.5.7] - 2026-09-01

- `check_agent_access` call routing added to the MCP server switch (was advertised but not callable); server-level routing regression test added (tools/list presence alone no longer trusted as proof of callability).

## WordPress plugin [1.5.6] - 2026-09-01

- Fix owner-footgun: Control Center catalog now covers every known tool (`get_sections`/`get_structured_data` cards were missing, so a CC form-save silently dropped them); regression test enforces catalog completeness.

## WordPress plugin [1.5.5] - 2026-09-01

- Version bump only in practice: the probe-header fix announced here silently failed to apply and is genuinely shipped in 1.5.8 with a test.

## WordPress plugin [1.5.4] - 2026-09-01

- `check_agent_access` (opt-in, fail-closed): read-only report of the owner's latest agent-access self-test — ClaudeBot/ChatGPT-User/GPTBot/control UAs against own llms.txt + MCP endpoint, HTTP code and answering edge per probe.
- Control Center "Agent access" card: nonce-protected button runs the loopback probe (max one run per 5 min, status codes only, no credentials, self-URL guard), renders the verdict table and Cloudflare fix guidance.

## WordPress plugin [1.5.3] - 2026-09-01

- Extension tools `get_sections` (bounded outline + per-section reads with
  byte pagination) and `get_structured_data` (sanitized JSON-LD blocks), both
  owner-toggled, fail-closed, and outside the shared contract hash.
- Converter: HTML tables become GitHub-flavored pipe tables.

## WordPress plugin [1.5.2] - 2026-09-01

- structuredContent on success (bridge returns objects), protocol-version
  fallback 2025-03-26 per spec, annotation default fails closed (writable),
  rank replaces fake score, Woo transactional pages auto-excluded,
  opt-in user-enumeration block, HTTP Link rel=mcp, expert inbox purge.

## WordPress plugin [1.5.1] - 2026-09-01

- list_content(type=product): compact price/currency/inStock/image/slug when
  get_product is exposed (1 call instead of 1+N; measured 182x token saving).
- get_product image+gallery as {url,width,height,alt} objects.
- structuredContent error codes on MCP tool errors + retry_after/Retry-After
  on expert rate limiting.

## WordPress plugin [1.5.0] - Candidate - 2026-09-01

### WordPress plugin

- Added the Control Center page: one card per surface and tool with honest
  exposed / needs-config / off badges, a what-agents-see preview computed from
  the actually exposed tool list, and a nonce-protected audit purge action.
- Added the WordPress Abilities API surface: enabled tools register as
  abilities on WordPress 6.9+, sharing the exact MCP input schemas and the
  single server-side executor; inert on older versions.
- Added two opt-in WordPress-only extension tools outside the cross-runtime
  manifest: `get_product` (live WooCommerce price/stock/images/variants) and
  `request_expert_call` (private owner-side submissions, rate limited,
  credential-shaped input rejected before storage). Both default to OFF and
  `request_expert_call` stays hidden until a destination email is configured.
- Added a bounded local audit log (custom table, 500 rows / 30 days):
  argument fingerprints and hashed IPs only, hourly pruning, admin-only view.
- Hardened settings sanitization to fall back to the four core tools when the
  tool selection is absent from a request.
- The default `tools/list` remains exactly the four manifest tools; parity
  tests are unchanged and still enforce the shared contract.
- Test suite: 116 PHP unit tests / 499 assertions, phpcs clean.

## WordPress plugin [1.4.1] - Candidate - 2026-08-30

### Contract and plugin changes

- Set the repository candidate version and stable tag to 1.4.1. This does not
  imply that WordPress.org already serves 1.4.1; verify the listing before
  installation.
- Removed the unreleased declarative form renderer, submission endpoint, and
  stored-submission module so the distributed contract remains four read-only
  public-content tools.
- Kept the legacy `[corsen_agent_form]` shortcode as an empty compatibility shim
  and removed legacy stored submissions during uninstall.
- Preserved an explicitly empty Agent Tools selection instead of restoring all
  tools on save.
- Rejected invalid, credential-bearing, non-HTTP(S), and cross-origin WebMCP
  endpoints before registration or fetch.
- Mirrored the strict initialize, tool-input, media-negotiation, Origin, and
  notification contract in PHP. Tool input failures return `isError: true`;
  malformed call envelopes remain JSON-RPC `-32602`.

## Repository verification and documentation - 2026-08-30

- Added deterministic live verification against `tools.manifest.json`. A live
  deployment is considered current only when the verifier exits successfully;
  browser execution remains a separate gate.
- Added explicit installation classes for native adapters and CMS reference
  bridges, same-origin sidecar guidance, and the public WebMCP versus
  authenticated MCP deployment boundary.
- Replaced universal-discovery, universal-browser, and automatic CMS
  compatibility claims with prerequisites and reproducible checks.
- Made static-HTML revocation reproducible at build time: disabled builds
  remove stale static context/WebMCP assets and omit bridge/status scripts from
  generated pages. Purely static hosting requires rebuild and redeployment.
- Split npm release preparation from publication: pushes may prepare a
  Changesets version pull request, while publishing requires a confirmed manual
  run for an exact `main` commit/version through the `npm-publish` environment
  and npm trusted publishing (OIDC). Long-lived npm credentials are rejected.

## WordPress plugin [1.4.0] - Not released - 2026-08-30

- Prototyped declarative WebMCP forms and bounded submission storage during the
  challenge.
- Withdrew the prototype before release; it is not part of the 1.4.1 candidate
  or the submitted four-tool read-only scope.

## WordPress plugin [1.3.1] - 2026-08-30

### WordPress plugin

- Forwarded an agent-provided abort signal to the in-flight MCP request when
  the browser supplies one to the WebMCP `execute` callback.

## [1.3.0] - 2026-08-30

### WebMCP

- Added imperative `document.modelContext.registerTool` generation for the
  same read-only contract served over MCP.
- Added `readOnlyHint` and `untrustedContentHint` annotations, sourced from the
  shared manifest and checked by parity tests.
- Kept browser execution same-origin, refused frame registration, omitted
  cookies and credentials, and forwarded calls to the configured MCP endpoint.
- Added WebMCP script handlers for Next.js and Astro plus an opt-in WordPress
  emitter and origin-trial meta-token field.
- Added a CLI homepage diagnostic. It detects the bridge surface but does not
  prove that a browser agent registered or executed a tool.

### Examples

- Added Next.js, Astro, Express, and static-HTML reference integrations.
- Added Ghost, Strapi, Directus, Wagtail, and MediaWiki reference Node bridges.
  These are deployable bridge services, not native plugins or extensions for
  those CMSs.

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
- `safeFetch` now keeps the real hostname for TLS/SNI and, when optional
  `undici` is available, pins the vetted IP at the socket level. Without
  `undici`, it resolves and verifies every IP before the platform fetch but
  retains a narrow rebinding window.
- `isPrivateIp` now covers the full IPv6 link-local range (`fe80::/10`) and IPv4-mapped/embedded forms, including the canonical hex form (`::ffff:a9fe:a9fe`).
- Content-policy path exclusions are now case-insensitive and percent-decoded, closing `/ADMIN` and `/%61dmin` bypasses.
- Next.js adapter enforces the body-size cap on actual bytes streamed (not the spoofable `Content-Length`), returning 413; rate limiting now runs before auth.
- WordPress: rate limiting runs before auth; uses the object cache's atomic INCR when available; `resources/read`/`get_page_content` validate the URI resolves to a same-site, non-excluded, http(s) URL; settings restrict post types to publicly-registered types.
- Sitemap fetch enforces the 5 MB cap while streaming (chunked responses can no longer bypass it).
- Rate-limit logs a hashed IP instead of the raw address.
- The legacy Next.js endpoint-discovery SSE helper is gated behind auth + rate limiting and explicitly deprecated; new scaffolds use the stateless JSON MCP endpoint only.
- `security.exposeVersion` was accepted during the 1.3 development cycle; MCP requires `serverInfo.version`, so the compatibility input no longer suppresses that required field.

### Fixed

- `resources/list` no longer crashes when a provider returns relative URLs.
- `list_content` filters by type before enforcing the owner-configured `maxPages` exposure cap; totals and pagination cannot disclose items beyond that cap.
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

Initial release — JSON-RPC endpoint targeting MCP 2025-11-25, llms.txt
generation, WordPress plugin, Next.js adapter, and CLI.
