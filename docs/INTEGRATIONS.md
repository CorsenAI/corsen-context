# Integration guide

Corsen Context exposes the same four read-only public-content tools through
MCP and WebMCP. The repository offers three integration shapes. Choose the
shape that matches who controls the site runtime; do not describe a bridge as
a native CMS plugin.

## Choose an integration

| Site               | Delivered shape                            | Site-owned prerequisite                                  | Main adaptation point                                              |
| ------------------ | ------------------------------------------ | -------------------------------------------------------- | ------------------------------------------------------------------ |
| WordPress          | Native PHP plugin                          | WordPress administrator access                           | Select public post types and excluded paths in Settings            |
| Next.js App Router | npm adapter and complete example           | A server-capable Next.js deployment                      | Implement the `ContentProvider` and mount three same-origin routes |
| Astro              | npm adapter and complete SSR example       | An Astro server adapter                                  | Implement the `ContentProvider` and mount the handlers             |
| Express            | Core npm package and reference server      | A Node.js service                                        | Replace the in-memory `ContentProvider`                            |
| Static HTML        | Build-time generator and one Node function | A host that can run one same-origin POST endpoint        | Replace `content.mjs` and route `/v1/mcp` to the function          |
| Ghost              | Read-only Node bridge                      | Ghost public URL and Content API key                     | Configure the permitted public Content API corpus                  |
| Strapi             | Read-only Node bridge                      | Strapi URL, collection schema, and optional read token   | Map the published collection and fields                            |
| Directus           | Read-only Node bridge                      | Directus URL, collection schema, and optional read token | Map fields and retain an explicit published filter                 |
| Wagtail            | Read-only Node bridge                      | Wagtail API URL and exposed page model                   | Configure the model and public text fields                         |
| MediaWiki          | Read-only Node bridge                      | MediaWiki Action API with TextExtracts                   | Configure the API URL and public namespaces                        |

The five CMS bridges can either render the public reference frontend or run
behind an existing frontend as a same-origin sidecar. Follow
[the CMS bridge deployment guide](CMS-BRIDGE-DEPLOYMENT.md) for proxy and
credential boundaries. Each bridge has a process-local, single-flight provider
cache: a fixed 60-second TTL for Ghost, Strapi, Directus, and Wagtail, and a
bounded `MW_CACHE_TTL_MS` with a 30-second default for MediaWiki.

For a portable WordPress content corpus, use the
[Aurora Kits WXR fixture](../examples/wordpress-aurora/README.md). It is
content-only and deliberately requires neither Elementor nor WooCommerce.

## Shared public contract

Every complete integration serves:

- a page that loads its same-origin WebMCP registration;
- `GET /llms.txt` as a separate bounded publication surface;
- `POST /v1/mcp` for the supplied Node examples; WordPress uses the absolute
  URL returned by `rest_url('corsen-context/v1/mcp')`, which is displayed under
  Settings > Corsen Context and in enabled discovery surfaces. A common URL is
  `/wp-json/corsen-context/v1/mcp`, while Plain permalinks can produce
  `?rest_route=/corsen-context/v1/mcp` and filters can change the REST prefix;
- `GET` on that MCP route returning `405` with `Allow: POST` when SSE is not
  supported, and an Origin-checked `OPTIONS` preflight;
- exactly `search_site`, `get_page_content`, `list_content`, and
  `get_sitemap`.

Every MCP `POST` uses `Content-Type: application/json` and an `Accept` value
that permits JSON. After `initialize` negotiates `2025-11-25`, send
`notifications/initialized` with `MCP-Protocol-Version: 2025-11-25` and require
HTTP `202` with an empty body before calling tools. A supplied hostile `Origin`
must be rejected with HTTP `403`.

The content provider is part of the security boundary. It must return only
published, public, same-site URLs and must apply the source system's tenant,
visibility, field, and path rules. Corsen Context cannot infer unpublished or
member-only status that the provider fails to enforce.

## Framework and static paths

Use the example README for the exact commands and files:

- [Next.js App Router](../examples/nextjs-app-router/README.md)
- [Astro](../examples/astro-basic/README.md)
- [Express](../examples/express-basic/README.md)
- [Static HTML](../examples/static-html/README.md)

The static example is not a client-only integration. Its generated files and
Node endpoint must share one public origin. A static host without functions or
another server-side route can publish `llms.txt`, but it cannot expose the MCP
or executable WebMCP path by itself.

## CMS bridge paths

Each bridge has its own environment template and schema assumptions:

- [Ghost](../examples/ghost-cms/README.md)
- [Strapi](../examples/strapi-cms/README.md)
- [Directus](../examples/directus-cms/README.md)
- [Wagtail](../examples/wagtail-cms/README.md)
- [MediaWiki](../examples/mediawiki-cms/README.md)

CMS credentials stay on the bridge server. Give them the smallest read-only
role that can access the intended published fields. Never put them in HTML,
`webmcp.js`, browser-visible environment variables, screenshots, or logs.

## WebMCP and API-key modes

The browser bridge intentionally sends no cookies, visitor credentials, or
API key. A deployment therefore chooses one endpoint mode:

1. **Public WebMCP mode** — the MCP endpoint is public, read-only,
   rate-limited, and backed only by public content.
2. **Authenticated server MCP mode** — the endpoint requires
   `CORSEN_CONTEXT_API_KEY` and the site does not publish or load the WebMCP
   bridge.

Do not embed an API key to make browser WebMCP work. See
[WebMCP browser setup](WEBMCP-BROWSER-SETUP.md) for the browser flag and
origin-trial requirements.

## Clean-room acceptance checklist

Before calling an integration ready for another site owner, repeat the setup
from a fresh directory and retain a receipt containing:

1. runtime and package-manager versions;
2. the public source revision or package versions;
3. install, build, start, and verification commands with exit codes;
4. environment-variable names, never their values;
5. `initialize` negotiating MCP `2025-11-25` with non-empty server metadata;
6. `notifications/initialized` returning HTTP `202` with an empty body;
7. `tools/list` returning exactly the four manifest tools;
8. `search_site` returning a same-origin public URL;
9. `get_page_content` successfully reading that returned URL;
10. a browser/client receipt separate from HTTP verification;
11. removal or rollback steps.

The hosted demos prove deployed behavior. They do not replace this independent
installation test.

## Removal and rollback

- WordPress: deactivate and delete the plugin. Use its documented uninstall
  behavior only when stored settings should also be removed.
- Frameworks: remove the MCP and WebMCP routes, remove the shared page script,
  uninstall the adapter, and redeploy the previous revision.
- Express and CMS bridges: stop the service, remove the exact proxy routes,
  revoke the CMS read credential, and restore the previous frontend revision.
- Static HTML: remove the generated bridge assets and exact `/v1/mcp` route,
  then redeploy the previous static build.

After rollback, verify that the former MCP endpoint no longer responds and
that no page still loads `/webmcp.js`.
