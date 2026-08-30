# WebMCP Observatory — shared ten-site component

The Live Contract Observatory is the shared visual layer of the ten demo sites.
It is **purely presentational**: it never changes the WebMCP contract, the MCP
endpoints, CORS, auth, or the tool definitions. It calls the site's own MCP
endpoint from the browser with `credentials: omit` and a 15s timeout, and shows
only real responses (idle / running / success / error states, no simulated data).

## Files

| File | Purpose |
|------|---------|
| `cc-nav.css` | Shared sticky navigation + common footer styles (WCAG AA contrast) |
| `cc-nav.js` | Injects nav + footer from `[data-cc-nav]` / `[data-cc-foot]`; mobile menu with `aria-expanded` + Escape |
| `cc-observatory.css` | Observatory widget styles, isolated with `cc-obs-*` prefixes |
| `cc-observatory.js` | Runs `initialize → tools/list → search_site → get_page_content` against a same-origin MCP endpoint; renders real results |
| `wp-home.html` | WordPress flagship homepage (hero + observatory + 10-stack grid + owner section), **ASCII-only for wpautop safety** |

All files are ASCII-only (safe through WordPress `wpautop` and any charset
mangling). Widgets never reference third-party CDNs.

## How each stack consumes it

| Stack | Serving mode |
|-------|--------------|
| WordPress | `wp-home.html` inlined as the page content; CSS/JS injected via base64 bootstrap (see `scripts/build-observatory-bundle.mjs`) |
| Astro / Next.js / Static-HTML | Assets copied into `public/` (`/corsen/*` on Next+Static, `/cc-*` on Astro); page HTML has `data-cc-nav` / `data-cc-observatory` / `data-cc-foot` |
| Express + 5 CMS bridges | Shell (`pageShell`) inlines the CSS/JS and emits the same `data-*` markers; landing page includes the observatory section |

## Rebuilding the ten demos from a clean clone

1. `pnpm install --frozen-lockfile`
2. `node scripts/build-observatory-bundle.mjs` — builds the deployable bundle from
   `shared/webmcp-observatory/` and prints per-artifact sha256.
3. Deploy per stack using the project's existing scripts:
   - WordPress: paste the `wp-home.html` content into the Home page (Custom HTML
     recommended; the file is self-contained and ASCII-safe).
   - Astro/Next/Static: copy `cc-nav.*` + `cc-observatory.*` into the example's
     `public/` folder (or link `shared/` in dev).
   - Express/CMS bridges: the shared `pageShell` partials are embedded in each
     example's server (see `examples/*-cms/server.js` "Observatory" section).

The `.challenge/` directory on this machine is a private working area and is
**not** a build input for the public demos.
