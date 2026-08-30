# WordPress candidate packaging

The WordPress plugin has no runtime Composer dependencies. Build the candidate
archive from the repository root with a supported Node.js runtime:

```sh
pnpm build:wordpress
```

The builder checks that the main plugin header, runtime version constant, and
WordPress stable tag match. It then writes:

- `dist/corsen-context-VERSION.zip`; and
- `dist/corsen-context-VERSION.zip.sha256`.

Only the distributable plugin files are included: the main file, uninstall
handler, readme, and PHP files under `includes/`. Tests, Composer development
dependencies, private evidence, repository metadata, and build tools are not
packaged.

## Reproducibility check

Run the builder twice without changing the source and compare the reported
SHA-256 values. They must match byte-for-byte. The archive uses sorted paths,
fixed timestamps, normalized UTF-8 names, and the ZIP store method, so source
file timestamps and host compression libraries do not affect the result.

Inspect the archive before publishing:

```sh
tar -tf dist/corsen-context-1.4.1.zip
```

Every entry must be under one top-level `corsen-context/` directory. The
archive must not contain `tests/`, `vendor/`, `.challenge/`, `.env`, keys,
logs, or another ZIP.

## Clean installation receipt

On a disposable WordPress site:

1. back up the site and record the WordPress/PHP versions;
2. upload the exact ZIP through **Plugins > Add New > Upload Plugin**;
3. activate it and confirm the expected version on the Plugins screen;
4. review **Settings > Corsen Context** before enabling WebMCP;
5. verify `/llms.txt` and initialize the MCP endpoint;
6. confirm exactly four manifest tools, then run `search_site` followed by
   `get_page_content` on its returned URL;
7. repeat in a separately identified WebMCP-capable browser/client; and
8. retain the archive hash, commands, timestamps, screenshots, and errors.

The local ZIP is a candidate artifact, not evidence that WordPress.org or a
GitHub release already distributes that version.

On a Linux environment with WP-CLI and a local MariaDB server binary, the
repository can create an isolated database/site, install the candidate, and
execute the complete receipt automatically:

```sh
pnpm verify:wordpress
```

The script binds both disposable services to the local machine only, uses a
fresh validated temporary directory, performs the four-tool and two-call
checks, reports versions and the ZIP hash, then removes only that temporary
directory. Set `WORDPRESS_VERSION` to replay another explicit WordPress
version.

To prove the portable Aurora Kits corpus as well as the package, run:

```sh
pnpm verify:wordpress:aurora
```

That second receipt installs the official WordPress importer in the disposable
site, imports the checked-in WXR fixture, and verifies eight pages, six posts,
the sitemap, and the exact `search_site` to `get_page_content` journey for
`/guides/ak-e17/`. It excludes that path and proves that tools and `llms.txt`
stop exposing it while the human page remains public, restores the path, then
disables WebMCP and proves that the in-page registration disappears while MCP
remains available. The receipt finishes with the full plugin uninstall check.
See the [fixture instructions](../examples/wordpress-aurora/README.md) for
content invariants and manual rollback guidance.

## Rollback

Deactivate the plugin and restore the previous plugin archive or site backup.
Deleting it through WordPress invokes `uninstall.php` and removes its stored
settings and legacy data; do that only when a full uninstall is intended.
