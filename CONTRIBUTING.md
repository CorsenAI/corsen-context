# Contributing to Corsen Context

Corsen Context is open source under the MIT License. Bug reports, security
reports, documentation fixes, tests, and bounded integration improvements are
welcome.

## Before opening a change

- Use a public issue for non-sensitive bugs and feature proposals.
- Use [GitHub's private security advisory form](https://github.com/CorsenAI/corsen-context/security/advisories/new)
  for vulnerabilities.
- Never commit API keys, CMS credentials, origin enrollment data, private
  content, production exports, or browser profiles.
- Keep the distributed tool set read-only unless a separately reviewed scope
  explicitly defines authorization, confirmation, audit, and rollback for a
  write action.

## Repository setup

Prerequisites:

- Node.js 22.13 or newer;
- pnpm 11.24 or newer; and
- PHP 8.0 plus Composer for the WordPress suite.

```bash
git clone https://github.com/CorsenAI/corsen-context.git
cd corsen-context
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm lint
pnpm typecheck
```

WordPress checks run separately:

```bash
cd packages/wordpress-plugin/corsen-context
composer install
composer run lint
composer run test:unit
```

The WordPress integration suite also needs `WP_TESTS_DIR` to point to an
installed WordPress test library, then runs with `composer run
test:integration`. Do not report that suite as passing when it was skipped
because the runtime was unavailable.

## Repository map

| Component                  | Path                                        | Runtime        |
| -------------------------- | ------------------------------------------- | -------------- |
| Core library               | `packages/core/`                            | TypeScript     |
| Next.js adapter            | `packages/nextjs-adapter/`                  | TypeScript     |
| Astro adapter              | `packages/astro-adapter/`                   | TypeScript     |
| CLI                        | `packages/cli/`                             | TypeScript     |
| WordPress plugin           | `packages/wordpress-plugin/corsen-context/` | PHP            |
| Integration references     | `examples/`                                 | stack-specific |
| Shared tool contract       | `tools.manifest.json`                       | JSON           |
| Public deployment verifier | `scripts/verify-live.mjs`                   | Node.js        |

The CMS example folders are reference Node bridge services, not native plugins
for their named CMSs.

## Development workflow

1. Create a focused branch from `main`.
2. Make the smallest coherent change.
3. Add or update tests in every affected runtime.
4. Run the relevant package checks and the repository gates.
5. Add a changeset for a publishable npm package change with
   `pnpm changeset`.
6. Update documentation and examples when behavior or prerequisites change.
7. Submit a pull request with the exact commands run and their results.

Use [Conventional Commits](https://www.conventionalcommits.org/) for commit
messages:

- `feat:` new behavior;
- `fix:` defect correction;
- `docs:` documentation only;
- `test:` test coverage;
- `refactor:` behavior-preserving code change; and
- `chore:` tooling, release, or dependency work.

## Contract changes

`tools.manifest.json` is the language-neutral contract for tool names,
descriptions, input schemas, and WebMCP annotations. A contract change must:

1. update the manifest;
2. update the TypeScript implementation and validation;
3. update the independent WordPress implementation and validation;
4. preserve `additionalProperties: false` and explicit bounds unless a reviewed
   compatibility reason requires otherwise;
5. update parity and invalid-input tests; and
6. update the live verifier and public documentation if observable behavior
   changes.

MCP tool definitions must not include WebMCP-only annotations. The WebMCP
registration layer attaches those annotations when building the browser tool.

## Adding a framework adapter

A new adapter needs more than a route that compiles. It must provide or
document:

- `POST /v1/mcp` with request-size, validation, rate-limit, authentication, and
  error behavior equivalent to the existing handlers;
- `GET /v1/mcp` as `405` with `Allow: POST`, validated `OPTIONS`, strict
  `Content-Type`/`Accept` negotiation, bounded JSON parsing, and `202` empty
  notification acknowledgements;
- `GET /llms.txt` as a separate bounded publication surface;
- a same-origin WebMCP script route that calls
  `document.modelContext.registerTool` and forwards to the MCP route;
- a `ContentProvider` that enforces publication status, canonical URLs, tenant
  rules, and field allowlists for its source;
- strict manifest parity and negative tests;
- a clean-install example with explicit environment variables; and
- removal and rollback instructions.

The owner switches are part of the observable contract. `mcp.enabled: false`
must make the MCP and WebMCP routes unavailable before provider access.
`static.generateLlmsTxt: false` must make both static routes unavailable, while
`static.includeFullContent: false` must keep `/llms-full.txt` unavailable. Use
the core bounds rather than widening them: `content.maxPages` is 1–5000 and
`static.maxOutputBytes` is 64 KiB–10 MiB with a 5 MiB default. Static output
must be truncated only on a valid UTF-8 boundary.

Next.js route handlers must import their full configuration from a server-only
module. `withCorsenContext` may add static rewrites, but it must not serialize
configuration through `nextConfig.env` or any `NEXT_PUBLIC_*` value.

A static-site build must remove stale generated surfaces before conditionally
recreating them and must omit browser bridge/status scripts when MCP is
disabled. Document that purely static revocation requires rebuilding,
redeploying, and purging external caches.

Static metadata and destinations must remain normalized and Markdown-escaped.
Do not describe that as sanitizing provider-supplied page bodies: those bodies
remain untrusted site-authored content.

The supplied WebMCP bridge sends no API key or visitor credentials. An example
must document the deployment choice between a public read-only WebMCP endpoint
and a key-protected server-side MCP endpoint. Never place a key in browser code.

Use the Next.js and Astro adapters as handler references, and the Express
example as a framework-agnostic reference. Do not describe an HTTP bridge as a
native CMS plugin or claim support for an untested schema.

CMS reference bridges must bound upstream work and document the actual cache
behavior they implement. The current five references apply a 10-second timeout
to each upstream fetch, cache successful provider results in process-local
memory, and coalesce concurrent cache misses. Ghost, Strapi, Directus, and
Wagtail use a fixed 60-second TTL; MediaWiki uses `MW_CACHE_TTL_MS` with a
30-second default and a 1–300-second range. Preserve or explicitly document
changes to those freshness, error, visibility, and invalidation semantics.

## npm release workflow

Changesets prepares package versions, but a push to `main` never publishes to
npm. Pushes can create or update the version pull request. Actual publication
is a manual `workflow_dispatch` from `main` and requires the exact 40-character
commit SHA, exact shared version, `PUBLISH NPM` confirmation, a publish-ready
Changesets state, and the `npm-publish` GitHub environment.

The publish job uses npm trusted publishing through GitHub OIDC and refuses
`NPM_TOKEN` or `NODE_AUTH_TOKEN`. Maintainers must configure each package's
trusted publisher on npm and any required reviewers on the GitHub environment;
do not treat the checked-in workflow as proof that those external controls are
already configured.

## WordPress changes

The WordPress plugin is standalone PHP and does not load the TypeScript packages
at runtime. Changes must:

- follow WordPress Coding Standards;
- retain capability checks and settings nonces for administration;
- sanitize inputs and escape output at the correct boundary;
- use prepared SQL for any database query;
- expose only selected public post types and published, non-password-protected
  content;
- preserve the global switch, path exclusions, exposure veto filter, and
  per-tool selection; and
- test PHP 8.0-compatible syntax.

Page builders, shortcodes, membership plugins, and dynamic blocks can add
visibility behavior outside ordinary post status. Add a representative
integration test before claiming compatibility with one of them.

## Style and documentation

- Use TypeScript for core packages and PHP for the WordPress plugin.
- Keep code, comments, public logs, and documentation in English.
- Run Prettier for supported text and TypeScript files.
- State experimental browser APIs as experimental and link to their current
  official setup documentation.
- Distinguish a repository candidate, a published package, and a deployed
  version.
- Do not present a mock, skipped suite, `401`, `429`, HTTP-only bridge check, or
  stale deployment as an end-to-end pass.
- Avoid universal compatibility, automatic discovery, performance, security,
  or production-readiness claims without reproducible evidence.

## License

By contributing, you agree that your contribution is licensed under the
[MIT License](LICENSE).
