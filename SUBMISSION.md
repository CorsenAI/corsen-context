# Corsen Context — an owner-controlled read path for website agents

Corsen Context lets a site owner expose a bounded subset of public content
through four read-only tools. MCP serves configured clients outside the page;
the experimental WebMCP browser API can register the same tool contract for an
agent running inside the page. A separate `llms.txt` surface publishes a static
overview.

This file is the submission draft. Claims about a public deployment are valid
only after the repository verifier and the browser runbook both pass against
that exact deployment.

## The problem

A browser agent that only sees rendered HTML must rediscover navigation,
extract text, and infer which URL contains the answer. That is wasteful and
brittle. Replacing the human interface with agent-oriented prose is not a good
answer either: the site should remain designed for people.

Corsen Context adds a parallel, site-owned read path. The owner chooses the
public corpus; the human page remains unchanged; the agent receives explicit
tool names, bounded input schemas, canonical URLs, and clean Markdown.

## What the candidate provides

The contract is declared in [`tools.manifest.json`](tools.manifest.json):

| Tool               | Purpose                               | Server-enforced boundary               |
| ------------------ | ------------------------------------- | -------------------------------------- |
| `search_site`      | Find relevant public pages            | bounded query and result count         |
| `get_page_content` | Read one returned same-site URL       | same-site URL and length checks        |
| `list_content`     | Browse an allowed public content type | bounded pagination                     |
| `get_sitemap`      | Get a broad content overview          | bounded by the configured corpus limit |

The TypeScript core and PHP WordPress plugin implement the contract
independently. Tests compare both implementations with the manifest, including
tool names, descriptions, schemas, and WebMCP annotations.

The callable surfaces are:

- MCP JSON-RPC over an HTTP `POST` endpoint; and
- an imperative WebMCP bridge using
  `document.modelContext.registerTool`, when the browser exposes that API.

`llms.txt` is a separate publication and discovery surface. It is not a third
tool transport and its presence does not guarantee client discovery.
The owner can disable both static exports with `static.generateLlmsTxt`.
`llms-full.txt` is disabled by default behind the separate
`static.includeFullContent` switch. Supplied handlers return `404` for disabled
surfaces. Both exports are limited by a UTF-8 byte budget: 5 MiB by default,
configurable from 64 KiB through 10 MiB, with code-point-safe truncation.
`content.maxPages` defaults to 500 and cannot exceed 5000.

`mcp.enabled` is also authoritative: disabling it makes the supplied MCP and
WebMCP routes unavailable and prevents direct core dispatch before provider
access. When enabled, the supplied transport validates Origin and media types,
reads at most 100 KiB of JSON, returns bounded JSON-RPC parse/validation errors,
uses `405` for MCP `GET`, validates `OPTIONS`, and acknowledges notifications
with an empty `202` response. No SSE stream or resumable session is claimed.

## Human-and-agent demonstration

The flagship is this site itself: **webmcp.corsen.ai, a live WordPress
installation presenting Corsen Context editions through a deterministic
demonstration store**. The fictional Aurora Kits corpus lives on the
non-WordPress reference stacks (e.g. express-webmcp.corsen.ai), where its demo
prompts remain replayable.

In a WebMCP-capable client pointed at the flagship, the demonstration prompt
is:

> Compare the licensed editions on this site and recommend the one an
> individual developer should buy, with its price and what it unlocks.

The expected observable sequence is:

1. the client calls `tools/list` and sees the tool set with WebMCP
   `readOnlyHint` annotations — the core contract tools true, and the opt-in
   `request_expert_call` submission tool explicitly false;
2. `list_content` with `{"type":"product"}` returns the whole typed catalogue
   in one call: every per-stack edition at 9 EUR and the flagship at 29 EUR,
   with currency, stock state, and images — no 1+N round-trips;
3. `get_product` with the flagship slug returns live WooCommerce fields
   (price, stock, purchasability) without any checkout page;
4. no write, click, form submission, cookie, or visitor credential is used.

Two further deterministic paths cover the `WEBMCP100` grant (discovered via
`search_site`, read with `get_page_content` on `/store/`) and chunked reading
(`get_sections`: outline, then one section within the 8192-byte budget, with
the documented `"top"` id resolving). A boundary prompt asks what the
endpoint refuses, and the answers are replayable HTTP receipts: `GET` → `405`
with `Allow: POST`, `OPTIONS` → `POST, OPTIONS` without credentials, and
anonymous `/wp-json/wp/v2/users` and `/?author=1` → `404`.

WordPress owner controls select exposed tools, post types, and paths without
giving the public browser a private session. The settings persistence and
revocation paths are covered by plugin tests; the short public recording uses
only anonymous calls and does not expose the administration interface.

An HTTP request that finds the bridge script is not sufficient evidence. The
final demo receipt must record the exact browser/client version, page URL,
registered tools, calls, result, and date.

**Purchase-policy demo (product governance, provable on the transport).** The
planned final recording can show the agent reading the
catalogue through `list_content` / `get_product`: the flagship `corsen-context`
returns `agentPurchase: forbidden` while `corsen-context-express` and
`corsen-context-wordpress` return `allowed`. That flag is a binding contract
instruction for agents — the plugin exposes no purchase tool at all and never
intercepts the ordinary human checkout. The store's separate coupon rules can
also reject the flagged product, but that HTTP 400 is store policy, not proof
that `agentPurchase` is server enforcement. Private operator receipts recorded
two 0.00 EUR test orders for allowed editions; they are not anonymous public
evidence and the submission does not ask judges to trust or reproduce them.

## Integration forms

The repository covers ten deployment targets, with deliberately different
levels of native integration:

| Stack              | What a site owner receives                                      |
| ------------------ | --------------------------------------------------------------- |
| WordPress          | public WordPress.org plugin (1.5.x line) plus standalone source |
| Next.js App Router | published npm 2.0.1 adapter plus reference app                  |
| Astro              | published npm 2.0.1 adapter plus SSR reference app              |
| Express            | framework-agnostic core plus reference server                   |
| Static HTML        | generated static assets plus one same-origin Node endpoint      |
| Ghost              | reference Node bridge over the Content API                      |
| Strapi             | reference Node bridge over an explicitly configured collection  |
| Directus           | reference Node bridge with a published-content filter           |
| Wagtail            | reference Node bridge adapted to a configured page model        |
| MediaWiki          | reference Node bridge over the Action API                       |

The five CMS bridges are deployable reference services, not native CMS plugins
or extensions. A site owner must configure a least-privilege CMS role, map the
provider to the site's real publication model, and expose the bridge from the
same browser origin. The repository documents both a reference-front-door and
a reverse-proxied sidecar deployment. Every reference caps an upstream fetch at
10 seconds, caches successful provider results in the Node process, and
coalesces concurrent cache misses. Ghost, Strapi, Directus, and Wagtail use a
fixed 60-second TTL. MediaWiki defaults to 30 seconds and accepts a bounded
`MW_CACHE_TTL_MS` value from 1,000 to 300,000 milliseconds. Replicas do not
share this cache or an invalidation channel, so upstream changes can remain
absent until each process's TTL expires. The bridges disable the core page-body
cache, so the provider TTL is the only freshness layer.

The static-HTML build removes stale context/WebMCP artifacts and page script
tags when its build-time switches are disabled. On a purely static host, that
owner revocation becomes public only after a rebuild, redeployment, and cache
purge; changing an unused runtime variable is not evidence of revocation.

## Public URLs and proof status

The project maintains one public URL per integration shape:

| Stack       | URL                                  |
| ----------- | ------------------------------------ |
| WordPress   | <https://webmcp.corsen.ai>           |
| Express     | <https://express-webmcp.corsen.ai>   |
| Next.js     | <https://nextjs-webmcp.corsen.ai>    |
| Astro       | <https://astro-webmcp.corsen.ai>     |
| Static HTML | <https://html-webmcp.corsen.ai>      |
| Ghost       | <https://ghost-webmcp.corsen.ai>     |
| Strapi      | <https://strapi-webmcp.corsen.ai>    |
| Directus    | <https://directus-webmcp.corsen.ai>  |
| Wagtail     | <https://wagtail-webmcp.corsen.ai>   |
| MediaWiki   | <https://mediawiki-webmcp.corsen.ai> |

These URLs demonstrate deployment shapes. They must not be described as
matching the current candidate until this command exits `0`:

```bash
pnpm verify:live
```

The verifier checks reachability, discovery output, exact manifest parity, MCP
initialization, one bounded same-origin search, and `get_page_content` on the
selected result with a scenario marker. Browser execution remains a separate
manual gate because an HTTP verifier cannot prove that a browser agent
registered and executed a tool.

The public distribution receipts are npm 2.0.1 and the WordPress 1.5.x plugin
line: 1.5.14 on WordPress.org, and 1.5.16 as the GitHub release that adds the
author-archive title fix and the explicit allowed-purchase wording. Record the exact installed version in every
submission receipt; do not infer candidate behavior from a different package
or commit.

An ordinary push cannot publish the npm packages. It may prepare a Changesets
version pull request; publication is a separately confirmed manual workflow
from an exact `main` commit and version, through the `npm-publish` GitHub
environment and npm trusted publishing (OIDC), with long-lived npm credentials
rejected. The npm-side trusted-publisher configuration remains an external
prerequisite and must be verified before publication is reported as successful.

## Security and owner control

- Every shared core tool reads; none creates, edits, deletes, purchases, or
  submits data. The optional WordPress `request_expert_call` tool is explicitly
  non-read-only but refuses agent execution before any business side effect.
- Tool arguments are strictly validated. Unknown properties, wrong scalar
  types, fractional integers, and out-of-range values are rejected.
- WebMCP execution resolves the MCP endpoint against the current page and
  refuses invalid, credential-bearing, non-HTTP(S), or cross-origin targets.
- The bridge refuses frame registration and sends no cookies, visitor
  credentials, or API key.
- The Next.js wrapper does not serialize Corsen configuration into
  `nextConfig.env`; handlers import server-only configuration directly.
- Static metadata and destinations are normalized and escaped, while page
  bodies remain unchanged, untrusted site-authored content.
- `readOnlyHint` and `untrustedContentHint` are client signals, not enforcement.
  Read-only behavior comes from the server and content provider.
- WordPress owners select public post types, exclude paths, and can expose any
  subset of the four callable tools. The global switch remains authoritative.
- Non-WordPress providers must enforce the source system's published status,
  tenant rules, field allowlist, and canonical public URLs.

The public WebMCP endpoint and optional MCP API-key mode are mutually exclusive
deployment choices for the supplied bridge: the browser script intentionally
has no key to send. Secrets must remain server-side.

## Browser availability

WebMCP is an experimental Community Group draft, not a final W3C Standard.
Serving the bridge is necessary but not sufficient: the browser must expose
`document.modelContext`, and an agent/client must consume registered tools.
Chrome documents a development flag and an origin-trial path; trial tokens are
origin-specific and expire.

The exact setup and evidence checklist are in
[`docs/WEBMCP-BROWSER-SETUP.md`](docs/WEBMCP-BROWSER-SETUP.md).

## Why the approach is useful

The project does not ask a site owner to replace the website, hide the human
interface, or maintain a second set of agent-only claims. The callable contract
sits beside the existing page and points back to canonical public URLs.

The same bounded contract can be applied through a native plugin, a framework
adapter, or an explicit bridge over a public CMS API. Those integration shapes
are not presented as equivalent: each documents its own prerequisites and
security boundary.

## Prior work and challenge work

Corsen Context existed before the challenge as an open-source MCP and
`llms.txt` project with TypeScript packages and a WordPress plugin.

- **Prior-work baseline:** commit `73ecaee` and its ancestors.
- **Challenge work:** commit `8cedb8c` and every subsequent candidate change.

At the baseline, the repository had no WebMCP bridge. Challenge work added the
manifest-backed WebMCP registration path, Next.js and Astro bridge handlers,
WordPress controls, browser diagnostics, parity tests, examples, CMS bridges,
deployment guidance, and public verification tooling.

The shared cross-runtime scope remains the four read-only core tools above.
The WordPress flagship additionally demonstrates five opt-in extensions: four
read tools and one explicitly non-read-only expert-intake tool that refuses
agent submissions server-side with `human_only`. A separate declarative form
prototype was removed and is not part of the submission claim.

The commit boundary can be inspected directly:

```bash
git status --short
git diff --stat 73ecaee..HEAD
git log --oneline 73ecaee..HEAD
```

Run that receipt only from the final submitted commit with an empty working
tree; commit-range commands do not include uncommitted files.

## Reproducible evidence

Repository checks:

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm verify:examples:candidate
```

WordPress checks:

```bash
pnpm build:wordpress
pnpm verify:wordpress
pnpm verify:wordpress:aurora

cd packages/wordpress-plugin/corsen-context
composer install
composer run lint
composer run test:unit
```

Live HTTP checks:

```bash
pnpm verify:live
```

The final submission should report the results from a fresh checkout and the
browser receipt. A skipped suite, mock-only result, outdated deployment, or
HTTP-only bridge check is not reported as an end-to-end success.

## Known limits

- The supplied tool set is read-only. Site-specific write actions are out of
  scope.
- Browser and agent support for experimental WebMCP varies.
- Annotations do not neutralize prompt injection in site-authored content.
- A provider cannot infer permissions that its CMS API does not expose; the
  operator must configure publication and field rules.
- A hosted demo proves one deployment, not third-party installability. Each
  integration still needs its documented clean-install and rollback test.

## License

The repository is available under the [MIT License](LICENSE).
