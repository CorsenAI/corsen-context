# Corsen Context security model

Corsen Context for WordPress exposes public website content through read-only
interfaces for its core contract. It does not make private content public
safely by inference: the site operator remains part of the security boundary.

This document separates behavior implemented by the plugin from controls that a
deployment must supply. Report suspected vulnerabilities privately through
[GitHub's security advisory form](https://github.com/CorsenAI/corsen-context/security/advisories/new).
If the advisory form is unavailable, email security@corsen.ai with the subject
"Vulnerability report: corsen-context". We acknowledge reports within three
business days and coordinate the disclosure date with the reporter.
Do not include credentials, private content, or exploit data in a public issue.

## Scope and trust boundary

The core contract of callable tools is `search_site`, `get_page_content`,
`list_content`, and `get_sitemap`, all read-only. The plugin can additionally
expose owner-toggled extension tools (`get_product`, `get_sections`,
`get_structured_data`, `check_agent_access`, and `request_expert_call`); these
are off by default, and `request_expert_call` is explicitly annotated
`readOnlyHint: false` because the requested real-world action would have side
effects. Since 1.5.12 it is **human-only**: the tool stays advertised so an
agent can read the rule, but every schema-valid invocation returns error code
`human_only` and a handoff URL before throttling, storage, or email. Malformed
arguments are rejected by normal schema validation before the tool executes.
Products additionally carry `agentPurchase` (`allowed`|`forbidden`, owner-set).
This is a binding instruction in the agent contract (tool description,
per-product payload, `llms.txt`, generated form notice), not an attribution or
payment control. Corsen Context exposes no purchase tool and does not intercept
ordinary WooCommerce checkout. Extension tools return only the public corpus
selected by the site owner. They do not create, update, delete, or purchase site
data on an agent's own authority.

Tool results can contain text written by site authors, imported from another
system, or supplied through comments. Consumers must treat that text as
untrusted data. The WebMCP `readOnlyHint`, `untrustedContentHint` and
`consequentialHint` annotations, and their MCP counterparts (`readOnlyHint`,
`destructiveHint`, `idempotentHint`, `openWorldHint`) on `tools/list`, are
advisory metadata; they do not enforce authorization or neutralize prompt
injection.

## Implemented request controls

### Tool and JSON-RPC validation

The plugin validates the JSON-RPC envelope and tool arguments before execution:
unknown tool properties, wrong scalar types, fractional integers, and values
outside the manifest's bounds are rejected. Input-schema and business failures
return an MCP tool result with `isError: true`; JSON-RPC `-32602` is reserved
for a malformed call envelope such as a non-object `arguments` member. Request
bodies are capped at 100 KiB (`413` beyond) and JSON nesting at depth 10.

The global switch and the MCP switch stop the endpoint from serving, including
its `OPTIONS` preflight.

### Rate limiting

The plugin applies its configured per-minute limit through the WordPress object
cache and transients. Rate limiting runs before optional API-key validation.

Forwarded client-IP headers are ignored by default. Define
`CORSEN_CONTEXT_TRUST_PROXY` or use the `corsen_context_trust_proxy` filter only
when the site is reachable exclusively through a proxy that overwrites those
headers.

### Optional API-key authentication

Server-side MCP clients can authenticate with `X-MCP-Key` or
`Authorization: Bearer` when the `CORSEN_CONTEXT_API_KEY` constant is defined.
Keep the key in server-side configuration. Never place it in HTML, the WebMCP
bridge, a repository, or a screenshot.

The in-page WebMCP bridge deliberately sends no cookies, visitor credentials,
or API key. Therefore choose one endpoint mode:

- **public WebMCP mode:** public, read-only, rate-limited MCP endpoint backed
  only by public content; or
- **authenticated MCP mode:** key-protected endpoint for configured server-side
  clients, with WebMCP disabled.

### Origin handling

The WebMCP bridge resolves its MCP endpoint against the current page and
refuses invalid, credential-bearing, non-HTTP(S), or cross-origin targets. It
refuses to register inside a frame and does not set `exposedTo`.

The endpoint validates every supplied `Origin`. The site's own origin is
allowed; additional origins must be added through the
`corsen_context_allowed_origins` filter. A valid browser origin is reflected
with `Vary: Origin`; the endpoint never emits wildcard CORS. Non-browser clients
may omit `Origin`.

### Outbound requests

`get_structured_data` reads a selected public page through WordPress's safe
HTTP transport (`wp_safe_remote_get`) with redirects disabled and a bounded
response. The owner-triggered agent-access check performs a same-site loopback
with redirects disabled. No tool fetches an agent-supplied URL outside the site.

### Response and error handling

MCP responses carry `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: strict-origin-when-cross-origin`,
`Content-Security-Policy: default-src 'none'`, and `Cache-Control: no-store`.
Public JSON-RPC errors are bounded messages; stack traces and internal paths
stay in server-side logs.

## WordPress-specific boundary

The plugin:

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

`/llms.txt` and `/llms-full.txt` can be cached by external CDNs or reverse
proxies. A site owner who changes exposure settings must purge those copies as
part of revocation; the plugin cannot invalidate caches it does not control.

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

Before enabling the public surfaces:

1. serve the site over HTTPS;
2. choose public WebMCP mode or authenticated MCP mode;
3. review the exposed post types, excluded paths, and enabled tools;
4. test publication filters against draft, member-only, and embargoed content;
5. keep secrets server-side and out of logs; and
6. keep WordPress, PHP, and other plugins up to date.

No repository test can prove a particular host, cache layer, membership plugin,
or origin-trial enrollment is configured correctly.

## Verification

```bash
cd packages/wordpress-plugin/corsen-context
composer install
composer run lint
composer run test:unit
```

The integration suite runs with `composer run test:integration` once
`WP_TESTS_DIR` points to an installed WordPress test library. The continuous
integration workflow also runs it against several WordPress versions, builds the
distributable archive twice to check it is reproducible, and runs the
WordPress.org Plugin Check on exactly the files that ship.

Code scanning findings are never left silently open: each is fixed in shipped
code or dismissed with a written rationale.
