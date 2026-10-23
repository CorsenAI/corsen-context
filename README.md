<div align="center">

# Corsen Context for WordPress

### Owner-controlled AI access to your public content

[![CI](https://github.com/CorsenAI/corsen-context/actions/workflows/ci.yml/badge.svg)](https://github.com/CorsenAI/corsen-context/actions/workflows/ci.yml)
[![WordPress.org](https://img.shields.io/wordpress/plugin/v/corsen-context)](https://wordpress.org/plugins/corsen-context/)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-2025--11--25-4ade80)](https://modelcontextprotocol.io)
[![WebMCP](https://img.shields.io/badge/WebMCP-draft-8b5cf6)](https://webmachinelearning.github.io/webmcp/)

A WordPress plugin that gives AI agents an explicit, owner-governed read path to
the public content a site chooses to expose: a static `/llms.txt`, a read-only
MCP endpoint, and opt-in WebMCP tools for agents running inside the page.

[Install from WordPress.org](https://wordpress.org/plugins/corsen-context/) ·
[Packaging](docs/WORDPRESS-PACKAGING.md) · [WebMCP setup](docs/WEBMCP-BROWSER-SETUP.md) ·
[Security](SECURITY.md)

</div>

## What it does

The plugin provides three surfaces with one implementation behind them:

1. **`/llms.txt`** publishes a bounded overview of the selected public content.
   An optional `/llms-full.txt` export is off by default.
2. **MCP endpoint** (JSON-RPC 2.0, protocol `2025-11-25`, JSON responses) serves
   the enabled tools to agents outside the browser.
3. **WebMCP** (opt-in) registers the same tools through `document.modelContext`
   for agents running inside the page; every call returns to the same-origin MCP
   endpoint.

Four core tools are read-only and on by default: `search_site`,
`get_page_content`, `list_content`, and `get_sitemap`. Five extension tools are
off until the owner enables them: `get_product` (WooCommerce, with a per-product
`agentPurchase` policy), `get_sections`, `get_structured_data`,
`check_agent_access`, and `request_expert_call`, a human-only handoff that
refuses every agent call before any side effect.

Every tool carries a `title` and annotations on `tools/list` (`readOnlyHint`,
`destructiveHint`, `idempotentHint`, `openWorldHint`) and the WebMCP dictionary
in the page (`readOnlyHint`, `untrustedContentHint`, plus `consequentialHint`
for the human-only tool). Annotations are advisory metadata, not a security
barrier; read-only behavior comes from the plugin itself.

## Install

From the WordPress admin: **Plugins > Add New**, search for **Corsen Context**,
install and activate. Then review **Settings > Corsen Context** (post types,
excluded paths, exposed tools) and **Settings > Corsen Context Control** before
enabling WebMCP. WebMCP needs HTTPS and a compatible browser or agent client.

To install a specific build, download the ZIP attached to a
[GitHub release](https://github.com/CorsenAI/corsen-context/releases) and upload
it through **Plugins > Add New > Upload Plugin**.

## Repository

| Path                                        | Content                                                    |
| ------------------------------------------- | ---------------------------------------------------------- |
| `packages/wordpress-plugin/corsen-context/` | the plugin (PHP, its browser bridge, unit and integration tests) |
| `tools.manifest.json`                       | the tool contract the plugin is tested against             |
| `scripts/build-wordpress-zip.mjs`           | deterministic plugin ZIP builder                           |
| `scripts/verify-wordpress-*.sh`             | disposable-site installation receipts                      |
| `examples/wordpress-aurora/`                | a portable demonstration corpus (WXR) and its instructions |
| `docs/`                                     | packaging and WebMCP browser setup                         |

## Development

Prerequisites: PHP 8.0 or newer with Composer, and Node.js 22 or newer for the
ZIP builder.

```bash
cd packages/wordpress-plugin/corsen-context
composer install
composer run lint
composer run test:unit
```

The integration suite needs an installed WordPress test library
(`WP_TESTS_DIR`), then runs with `composer run test:integration`. Build the
distributable archive from the repository root:

```bash
node scripts/build-wordpress-zip.mjs
```

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the change and release process.

## Security

Report vulnerabilities privately through
[GitHub's security advisory form](https://github.com/CorsenAI/corsen-context/security/advisories/new)
or security@corsen.ai. The security model is described in
[`SECURITY.md`](SECURITY.md).

## History

This repository previously also hosted the `@corsenai/corsen-context` npm
packages and reference integrations for other stacks. They were retired on
2026-10-23; their history remains in this repository's git log and in
[`CHANGELOG.md`](CHANGELOG.md).

## License

[MIT](LICENSE)
