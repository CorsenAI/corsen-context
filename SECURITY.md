# Corsen Context security model

Corsen Context exposes public website content through read-only interfaces for
its core contract. It does not make private content public safely by inference:
the site operator and content provider remain part of the security boundary.

This document separates behavior implemented by the repository from controls
that a deployment must supply. Report suspected vulnerabilities privately
through [GitHub's security advisory form](https://github.com/CorsenAI/corsen-context/security/advisories/new).
Do not include credentials, private content, or exploit data in a public issue.

## Scope and trust boundary

The core contract of callable tools is `search_site`, `get_page_content`,
`list_content`, and `get_sitemap`, all read-only. The WordPress flagship can
additionally expose owner-toggled extension tools (for example `get_product`,
`get_sections`, `check_agent_access`, and `request_expert_call`); these are off
by default, and `request_expert_call` is explicitly annotated
`readOnlyHint: false` because it files a private owner-side submission. Since
1.5.12 it is also **human-only by policy**: the tool stays advertised so an
agent can read the rule, but the server refuses every agent call with error
code `human_only` and a handoff URL — the expert intake is a governed demo of
policy an agent must obey, not an agent action. Products additionally carry
`agentPurchase` (`allowed`|`forbidden`, owner-set): on `forbidden`, an agent
must not start checkout and the server-side checkout path is closed to
unattended agents. Extension tools are intended to return only the public
corpus selected by the site owner. They do not create, update, delete, or
purchase site data on an agent's own authority.

Tool results can contain text written by site authors, imported from another
system, or supplied through comments. Consumers must treat that text as
untrusted data. The WebMCP `readOnlyHint` and `untrustedContentHint` annotations
are advisory metadata; they do not enforce authorization or neutralize prompt
injection.

For non-WordPress integrations, the `ContentProvider` implementation must
enforce:

- published/public state in the source system;
- tenant, locale, membership, and embargo rules;
- a field allowlist that excludes internal notes and secrets;
- canonical same-site URLs; and
- the configured path and content-type limits.

The core cannot recover permission information that the provider omits.

## Implemented request controls

### Tool and JSON-RPC validation

The TypeScript and WordPress runtimes validate the JSON-RPC envelope and tool
arguments before execution. The npm 2.0.0 and WordPress 1.4.1 candidates reject
unknown tool properties, wrong scalar types, fractional integers, and values
outside the manifest's bounds. Input-schema and business failures return an MCP
tool result with `isError: true`; JSON-RPC `-32602` is reserved for a malformed
call envelope such as a non-object `arguments` member.

Request-body and JSON-depth bounds are enforced by the supplied HTTP handlers.
Custom adapters must preserve those checks rather than calling provider methods
directly with unvalidated input.

The supplied TypeScript and Node handlers validate a present `Origin` before
body parsing, require an `application/json` content type, reject an incompatible
`Accept` header, and cap the actual request body at 100 KiB. Malformed JSON is
reported as JSON-RPC `-32700` without an HTML error page or stack trace;
oversized requests return `413`, and valid JSON that is not a request object is
rejected as JSON-RPC `-32600`. Rate limiting and optional authentication happen
before JSON parsing in the supplied Node references.

`mcp.enabled: false` prevents the supplied MCP `GET`, `POST`, and `OPTIONS`
handlers and WebMCP script handlers from serving their surfaces. The core also
rejects direct MCP dispatch before provider access. This switch is independent
from the static export controls.

### Rate limiting

The TypeScript default is a sliding one-minute window with a one-second burst
limit. Its default in-memory store is suitable for development or a single
long-lived process. A multi-instance or serverless deployment must provide a
shared `RateLimitStore`, such as Redis, or enforce an equivalent limit at the
edge.

The WordPress plugin uses its configured per-minute limit and WordPress object
cache/transients. Rate limiting runs before optional API-key validation.

Forwarded client-IP headers are ignored by default. Set `trustProxy` or
`CORSEN_CONTEXT_TRUST_PROXY` only when the application is reachable exclusively
through a proxy that overwrites those headers.

### Optional API-key authentication

Server-side MCP clients can authenticate with `X-MCP-Key` or
`Authorization: Bearer`. Keep keys in server-side environment/configuration and
rotate them through the hosting platform. Never place a key in HTML,
`webmcp.js`, a public environment variable, a repository, or a screenshot.

The supplied in-page WebMCP bridge deliberately sends no cookies, visitor
credentials, or API key. Therefore choose one endpoint mode:

- **public WebMCP mode:** public, read-only, rate-limited MCP endpoint backed
  only by public content; or
- **authenticated MCP mode:** key-protected endpoint for configured server-side
  clients, with the public WebMCP bridge omitted.

Enabling an API key while publishing the supplied bridge causes browser tool
execution to receive `401`; embedding the key in the bridge is not a fix.

For Next.js, keep the full configuration in a server-only module and import it
directly into route handlers. `withCorsenContext` does not serialize its
configuration into `nextConfig.env` or a client bundle. Do not reintroduce that
path, and never put a credential in `NEXT_PUBLIC_*`.

### Origin and host handling

The generated WebMCP bridge resolves its MCP endpoint against the current page
and refuses invalid, credential-bearing, non-HTTP(S), or cross-origin targets.
It refuses to register inside a frame and does not set `exposedTo`.

The TypeScript handlers validate every supplied `Origin`. The canonical site
origin is allowed automatically; additional origins must be listed explicitly
in `allowedOrigins`. A valid browser origin is reflected with `Vary: Origin`;
the endpoint never emits wildcard CORS. Non-browser clients may omit `Origin`.
WordPress applies the same site-origin rule plus an explicit filter allowlist.

The core exports `validateHost`, but expected-host enforcement is deployment
specific and opt-in. Configure the reverse proxy or adapter to reject unexpected
`Host` values where host-header attacks are in scope.

### Outbound URL fetching

The TypeScript sitemap/provider helpers use `safeFetch` for untrusted outbound
URLs. It:

1. accepts only HTTP(S);
2. rejects literal local/private addresses;
3. resolves the hostname and rejects the request if resolution fails or any
   result is private;
4. disables redirects; and
5. preserves the real hostname for TLS/SNI.

When the optional `undici` package is available, the connection is pinned to a
vetted address. Without it, DNS is checked before the platform `fetch` call but
a narrow rebinding window remains. Deployments that fetch untrusted URLs should
install `undici` or enforce equivalent egress controls.

Blocked address ranges include loopback, RFC 1918, IPv4 link-local,
carrier-grade NAT, benchmark networks, IPv6 loopback, IPv6 unique-local,
IPv6 link-local, and recognized IPv4-mapped/embedded forms. This application
check should complement, not replace, network egress policy.

The five supplied CMS reference bridges apply a 10-second timeout to each
upstream CMS fetch. Each bridge keeps successful provider results in a
process-local memory cache and coalesces concurrent cold or expired loads into
one in-flight load. Ghost, Strapi, Directus, and Wagtail use a fixed 60-second
TTL. MediaWiki defaults to 30 seconds; `MW_CACHE_TTL_MS` accepts 1,000–300,000
milliseconds. An expired entry is not used as an error fallback, and a failed
load is retried by a later request. A source update can therefore remain absent
until the local TTL expires, while a restart starts cold and multiple replicas
can hold different snapshots. There is no cross-process cache or invalidation
channel; deployments that need tighter revocation must add and verify one for
their source system. The five bridges disable the core page-body cache, leaving
the stated provider TTL as their only freshness layer.

The WordPress plugin does not use this TypeScript fetch path. Its content tools
resolve selected WordPress posts and reject cross-site or excluded content URLs.

### Response and error handling

Supplied MCP handlers attach defensive response headers including
`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, a restrictive
content security policy, and `Cache-Control: no-store` for MCP responses. Static
discovery responses can use explicit public caching instead.

Public JSON-RPC errors are bounded messages. Stack traces and internal paths
must remain in server-side logs. The default TypeScript logger configures
redaction paths for top-level fields named `apiKey`, `authorization`,
`password`, `secret`, and `token`; callers must avoid placing secrets in nested,
differently named, or free-text fields.

## WordPress-specific boundary

The plugin candidate:

- queries only selected, publicly registered post types and published posts;
- rejects draft, pending, private, trashed, and password-protected posts;
- applies configured path exclusions and the
  `corsen_context_can_expose_post` veto filter;
- uses capability checks and WordPress settings nonces for administration;
- keeps `/llms-full.txt` disabled by default and bounds item count, output size,
  and generation work; and
- uses a safe stored-content rendering mode by default.

Stored content can still contain output from membership plugins, page builders,
shortcodes, or dynamic blocks whose visibility rules WordPress does not expose
as post status. Review selected post types and test representative protected
content before enabling public surfaces. Full rendering is an explicit filter
choice and can execute site-specific rendering logic; audit it on the target
site.

## Static export boundary

`static.generateLlmsTxt` is the master switch for both TypeScript static
exports. When it is `false`, the `CorsenContext` generation methods refuse
generation and the supplied `/llms.txt` and `/llms-full.txt` handlers return
`404`.
`static.includeFullContent` defaults to `false` and independently keeps
`/llms-full.txt` at `404` until explicitly enabled. `static.maxOutputBytes`
defaults to 5 MiB and is schema-bounded from 64 KiB through 10 MiB. Generation
returns no more than that UTF-8 byte limit, never splits a code point, and
includes a truncation notice when content is cut. Full-content iteration
returns as soon as the next block would exceed the budget. `content.maxPages` is
separately bounded from 1 through 5000 and defaults to 500.

Static output can be cached publicly by the supplied handlers. A site owner who
changes exposure settings must purge any external CDN or reverse-proxy copy as
part of revocation; the repository cannot invalidate caches it does not
control.

The static-HTML reference also applies these switches at build time. Before
writing, it deletes prior `llms.txt`, `llms-full.txt`, `webmcp.js`, and browser
status assets; disabled MCP builds omit the bridge/status scripts from every
generated page. A purely static host has no runtime gate, so revocation requires
a rebuild with the disabled values followed by redeployment and CDN purge.

The core normalizes same-site URLs and escapes generated headings, list labels,
descriptions, dates, and Markdown destinations. It deliberately does not
rewrite or neutralize the `markdown` page bodies supplied by a provider. Those
bodies remain untrusted, site-authored data and consuming clients must treat
them accordingly.

## WebMCP-specific boundary

WebMCP is an experimental browser API. A Chrome origin-trial token enables an
eligible origin; it is not authentication, authorization, or a secret. Tokens
are origin-specific and expire.

Browser and agent behavior can change while the draft evolves. Verify the exact
browser/client version and follow
[`docs/WEBMCP-BROWSER-SETUP.md`](docs/WEBMCP-BROWSER-SETUP.md). Do not assume
that successful tool registration proves the MCP endpoint, content policy, or
agent answer is correct; execute a real bounded call chain.

## Deployment responsibilities

Before public deployment:

1. serve the site over HTTPS and configure current TLS at the edge;
2. set the canonical site origin and reject unexpected hosts;
3. choose public WebMCP mode or authenticated MCP mode;
4. use least-privilege, read-only CMS credentials;
5. configure a distributed limiter for multi-instance deployments;
6. keep secrets server-side and exclude them from logs and artifacts;
7. test publication filters against draft, member-only, embargoed, and
   cross-tenant fixtures;
8. run dependency and container/host vulnerability scanning in the deployment
   pipeline; and
9. verify backup, rollback, monitoring, and abuse-response procedures.

No repository test can prove a particular hosting platform, CMS role, reverse
proxy, or origin-trial enrollment is configured correctly.

## npm publication boundary

A push to `main` can prepare or update a Changesets version pull request, but it
cannot publish an npm package. Publication requires a manual workflow run from
`main`, an exact commit SHA, exact version, explicit confirmation text, a
publish-ready Changesets state, and the `npm-publish` GitHub environment. The
publish job rejects long-lived npm credentials and requests only an OIDC ID
token for npm trusted publishing. Each npm package must separately trust this
repository workflow in npm settings before the job can succeed; repository
configuration alone does not prove that external setup is complete.

## Verification

Run the repository checks from a fresh checkout:

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm verify:examples:candidate
```

Run the WordPress suite separately:

```bash
cd packages/wordpress-plugin/corsen-context
composer install
composer run lint
composer run test:unit
```

For a public deployment, run `pnpm verify:live` and then execute the documented
browser call chain. Treat a skipped test, mock, stale deployment, `401`, `429`,
or HTTP-only bridge inspection as an incomplete result rather than a pass.
