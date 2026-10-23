# Contributing to Corsen Context for WordPress

## Before opening a change

- Use a public issue for non-sensitive bugs and feature proposals.
- Use [GitHub's private security advisory form](https://github.com/CorsenAI/corsen-context/security/advisories/new)
  for vulnerabilities.
- Never commit API keys, origin-trial enrollment data, private content,
  production exports, or browser profiles.
- Keep the distributed tool set read-only unless a separately reviewed scope
  explicitly defines authorization, confirmation, audit, and rollback for a
  write action.

## Setup

Prerequisites: PHP 8.0 or newer with Composer; Node.js 22 or newer for the ZIP
builder.

```bash
git clone https://github.com/CorsenAI/corsen-context.git
cd corsen-context/packages/wordpress-plugin/corsen-context
composer install
composer run lint
composer run test:unit
```

The integration suite also needs `WP_TESTS_DIR` to point to an installed
WordPress test library, then runs with `composer run test:integration`. Do not
report that suite as passing when it was skipped because the runtime was
unavailable.

## Plugin changes

The plugin is standalone PHP. Changes must:

- follow WordPress Coding Standards (`composer run lint`);
- retain capability checks and settings nonces for administration;
- sanitize inputs and escape output at the correct boundary;
- use prepared SQL for any database query;
- expose only selected public post types and published, non-password-protected
  content;
- preserve the global switch, path exclusions, exposure veto filter, and
  per-tool selection; and
- keep PHP 8.0-compatible syntax.

Page builders, shortcodes, membership plugins, and dynamic blocks can add
visibility behavior outside ordinary post status. Add a representative
integration test before claiming compatibility with one of them.

## Contract changes

`tools.manifest.json` is the contract for tool names, titles, descriptions,
input schemas, MCP annotations, and WebMCP annotations. A contract change must
update the manifest, the plugin, and `tests/ToolManifestParityTest.php`
together, and preserve `additionalProperties: false` and explicit bounds unless
a reviewed compatibility reason requires otherwise.

## Release

1. Bump the version in the plugin header, `CORSEN_CONTEXT_VERSION`, and
   `Stable tag`; move the changes into the `readme.txt` changelog and the root
   `CHANGELOG.md`.
2. Build the archive with `node scripts/build-wordpress-zip.mjs` and run the
   WordPress.org Plugin Check on its contents (the CI job does both).
3. Attach `dist/corsen-context-<version>.zip` and its `.sha256` to a GitHub
   release tagged `v<version>`.
4. Commit the same files to the WordPress.org SVN `trunk`, copy `trunk` to
   `tags/<version>`, and commit with the WordPress.org SVN password.

## Style and documentation

- Keep code, comments, public logs, and documentation in English.
- State experimental browser APIs as experimental and link to their current
  official setup documentation.
- Do not present a mock, skipped suite, `401`, `429`, or stale deployment as an
  end-to-end pass.

## License

By contributing, you agree that your contribution is licensed under the
[MIT License](LICENSE).
