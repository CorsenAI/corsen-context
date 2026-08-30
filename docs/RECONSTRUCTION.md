# Rebuilding the ten live demos from a clean clone

The ten demo sites are the public WebMCP evidence for The WebMCP Challenge. Every
part of them is reconstructible from this repository alone - `shared/webmcp-observatory/`
holds the shared UI, the examples hold the servers, and the scripts below assemble
and deploy them. Nothing lives only in a private `.challenge/` folder or on the VM.

## Layout

```
shared/webmcp-observatory/     # shared nav + observatory widget + flagship homepage
examples/*-cms/server.js       # Express-based bridges (Ghost, Strapi, Directus, Wagtail, MediaWiki)
examples/express-basic/        # Express reference
examples/nextjs-app-router/    # Next.js reference (observatory after hero)
examples/astro-basic/          # Astro reference
examples/static-html/          # Static HTML + same-origin MCP function
packages/wordpress-plugin/     # WordPress plugin (distributed, untouched by the observatory)
scripts/build-observatory-bundle.mjs  # builds deployable bundle + per-artifact sha256
scripts/patch-observatory-examples.py # idempotent source patch for the five CMS bridges
```

## Step 1 - shared assets

```bash
pnpm install --frozen-lockfile
node scripts/build-observatory-bundle.mjs
```

Output: `.challenge/observatory/dist/` (or any workdir) with `cc-nav.*`,
`cc-observatory.*` and `wp-home.html` (bootstrap-inlined for WordPress `wpautop`
safety). A `manifest.json` records sha256 for every artifact.

## Step 2 - WordPress flagship

`shared/webmcp-observatory/wp-home.html` is a self-contained, ASCII-only
homepage: hero with observatory, 10-stack grid, owner-control section.
Install: Pages → Home → switch to **Custom HTML** (or paste the raw HTML) →
Publish. Redirection `/webmcp-and-ai-agents/ → /#how` is handled by the site's
redirect rule (see the plugin settings / site config for the 301).

## Step 3 - the nine Node/static demos

Sources are authoritative in `examples/`. Deploy via the existing helper on the
target host: `~/deploy-wrapper.sh <example> <port> <subdomain>` for CMS bridges,
`~/deploy-vm.sh` for the JS trio, `~/deploy-static.sh` for the static site.
The shared `cc-nav.*` / `cc-observatory.*` files are already committed under
each example's `public/` (or inlined in the bridge `pageShell`), so a fresh
clone + build reproduces the exact pages.

## Note on CMS bridges

The Ghost, Strapi, Directus, Wagtail and MediaWiki bridges are reference
services, not self-contained demos: each requires a live CMS instance configured
with the collection, fields and read credentials described in that bridge's own
README (e.g. `examples/ghost-cms/README.md`). Without a properly configured CMS,
`search_site` returns no useful result and the demo homepage still renders but
shows no content. A fresh clone rebuilds the bridge code; it does not provision
the CMS.

## Step 4 - verify


```bash
pnpm verify:live        # expects 10/10 with manifest 3786c5d0d401cb98
```

Open each demo and click **Run live trace**; the widget performs
`initialize → tools/list → search_site → get_page_content` against the site's
own MCP endpoint (same-origin, `credentials: omit`, 15s timeout, honest
idle/running/success/error states).

## Contract safety

The observatory is presentation-only. It does not modify `tools.manifest.json`,
tool names/descriptions/schemas/annotations, MCP endpoints, CORS, auth, headers,
the distributed WordPress plugin, npm packages, or WordPress.org assets.
`pnpm verify:live` (contract hash check) must stay 10/10 after any UI change.
