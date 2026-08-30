=== Corsen Context ===
Contributors: corsenai
Donate link: https://corsen.ai
Tags: ai, mcp, llms-txt, model-context-protocol, ai-native
Requires at least: 6.0
Tested up to: 7.0
Requires PHP: 8.0
Stable tag: 1.4.0
License: MIT
License URI: https://opensource.org/licenses/MIT

Publish selected public WordPress content through llms.txt and a read-only MCP-style JSON-RPC endpoint.

== Description ==

**Corsen Context** publishes a bounded overview of selected public WordPress content and provides a read-only JSON-RPC endpoint for compatible MCP clients.

= What it does =

Your site gets three new capabilities:

1. **Static Layer** — Generates `/llms.txt` with a structured overview of selected public content. An optional, bounded `/llms-full.txt` export can be enabled in settings.

2. **Dynamic Layer** — Exposes a read-only **Model Context Protocol (MCP)** Streamable HTTP-style endpoint at `/wp-json/corsen-context/v1/mcp` with four content tools.

3. **In-Page Layer (opt-in)** - Registers the same four read-only tools with AI agents running inside the browser page, through the WebMCP `document.modelContext` API. Enable it in Settings > Corsen Context.

= Key Features =

* **Safe defaults** — `/llms.txt` and the read-only endpoint are enabled; the heavier `/llms-full.txt` export is opt-in.
* **MCP 2025-11-25 target** — Supports `initialize`, `ping`, `tools/list`, `tools/call`, `resources/list`, `resources/read`, and `notifications/initialized`. The endpoint returns JSON responses and does not provide server-sent event streaming.
* **4 AI tools** — `search_site`, `get_page_content`, `list_content`, `get_sitemap`.
* **SEO integration** — Reads Yoast SEO and Rank Math metadata for better descriptions.
* **Security built-in** — Rate limiting, SSRF protection, input validation, security headers, optional API key auth.
* **Admin settings page** — Choose post types, exclude paths, set rate limits, toggle features.
* **Dashboard widget** — See your AI context status at a glance.
* **Bounded generation** — Total item and output-byte limits protect the optional full-content export.
* **Content safety** — Drafts, private posts, password-protected posts, excluded paths, and content vetoed by the exposure filter are not served.
* **Credit line** — "Powered by Corsen Context" in generated files (configurable).

= Published Endpoints and Discovery Hints =

When enabled, Corsen Context publishes:

1. **robots.txt** — `MCP: https://yoursite.com/wp-json/corsen-context/v1/mcp`
2. **llms.txt** — The credit line includes the MCP endpoint URL
3. **HTML head** — `<link rel="mcp">` meta tag added automatically
4. **Direct URL** — `/llms.txt` remains available to clients that know the convention

These discovery hints are not universal standards and do not guarantee that a search engine or AI client will use the endpoint.

= Requirements =

* WordPress 6.0 or higher
* PHP 8.0 or higher
* Pretty permalinks enabled (Settings > Permalinks > anything except "Plain")

= Part of a Bigger Ecosystem =

Corsen Context is an open-source project by [Corsen AI](https://corsen.ai). The project also provides packages for Next.js, Express, Astro, and Node.js. WordPress uses this dedicated PHP plugin.

* [GitHub Repository](https://github.com/CorsenAI/corsen-context)
* [Full Documentation](https://github.com/CorsenAI/corsen-context#readme)

== Installation ==

= From WordPress.org (recommended) =

1. Go to Plugins > Add New in your WordPress admin
2. Search for "Corsen Context"
3. Click "Install Now" then "Activate"
4. Done! Visit Settings > Corsen Context to customize.

= Manual Installation =

1. Download the plugin ZIP from [GitHub Releases](https://github.com/CorsenAI/corsen-context/releases)
2. Go to Plugins > Add New > Upload Plugin
3. Upload the ZIP file and activate
4. Configure at Settings > Corsen Context

= After Activation =

Your site immediately has:

* `/llms.txt` — Visit `https://yoursite.com/llms.txt` to see it
* `/llms-full.txt` — Optional bounded content export (enable it in Settings > Corsen Context)
* MCP endpoint — `https://yoursite.com/wp-json/corsen-context/v1/mcp`
* Dashboard widget — Check your admin dashboard

**Important:** Make sure pretty permalinks are enabled (Settings > Permalinks).

== Frequently Asked Questions ==

= What is MCP? =

Model Context Protocol is an open protocol for communication between AI applications and external systems. Corsen Context targets the 2025-11-25 protocol version for its read-only JSON-RPC endpoint.

= What is llms.txt? =

A proposed convention where websites place a `/llms.txt` file containing a structured Markdown overview. Support varies by client and search engine, so it should be treated as an additional publishing surface rather than an indexing guarantee.

= Is my content safe? =

The plugin limits output to selected public post types and rejects draft, pending, private, password-protected, trashed, or excluded content. Site owners can also veto individual posts with the `corsen_context_can_expose_post` filter. As with any public export, review the selected post types and exclusions before enabling it on a site with membership or conditional-visibility plugins.

= Does this slow down my site? =

Normal pages only receive a small discovery link when MCP is enabled. Generated metadata may use bounded WordPress transients for anonymous, cookie-free requests. Rendered page content is not placed in the shared MCP cache, and `/llms-full.txt` uses item, byte, and generation-lock limits.

= Does it work with page builders? =

By default, Corsen Context reads stored public content without executing `the_content`, dynamic blocks, or shortcodes. This avoids accidentally exporting personalized output. Site owners can opt into full rendering with the `corsen_context_render_mode` filter; full-rendered output is never stored in the shared content cache. Compatibility depends on the page builder and should be tested on the site.

= Can I control which content is exposed? =

Yes. In Settings > Corsen Context you can:

* Choose which post types to include (pages, posts, products, custom types)
* Exclude specific URL paths
* Disable MCP, llms.txt, or the entire plugin

= Does it work with WooCommerce? =

Yes. Enable the "Products" post type in settings and your WooCommerce products will be included in llms.txt and available through the MCP tools.

= How do I protect the MCP endpoint? =

You can set an API key by defining `CORSEN_CONTEXT_API_KEY` in your `wp-config.php`:

`define('CORSEN_CONTEXT_API_KEY', 'your-secret-key-here');`

Requests must then include `X-MCP-Key: your-secret-key-here` header.

= Can I remove the credit line? =

Yes. Uncheck "Show Credit" in Settings > Corsen Context. However, the credit helps grow the open-source ecosystem and we appreciate keeping it enabled.

== Screenshots ==

1. Settings page — Configure post types, exclusions, and security
2. Dashboard widget — AI context status at a glance
3. llms.txt output — Clean structured markdown for AI agents
4. MCP endpoint — JSON-RPC response with tools and resources

== Changelog ==

= 1.4.0 - 2026-08-30 =
* Feature: agent-callable forms (declarative WebMCP) - the [corsen_agent_form] shortcode renders a real form; with the new opt-in setting it carries toolname/tooldescription/toolparamdescription attributes, so Chrome registers it as a tool and an in-page agent can fill and submit it like a person. Off: the same form stays human-only. Submissions are stored (bounded to 50) and marked human or agent via SubmitEvent.agentInvoked, listed in the Agent Access panel.

= 1.3.1 - 2026-08-30 =
* Fix: the WebMCP bridge now forwards the AbortSignal that Chrome 153+ passes to execute(), so a cancelled agent call aborts the in-flight request to the MCP endpoint instead of leaving work running.

= 1.3.0 - 2026-08-29 =
* Feature: WebMCP support (opt-in) - registers the same four read-only tools with AI agents running inside the page through document.modelContext, with an optional Chrome origin-trial token field. The in-page bridge forwards every call to the existing MCP endpoint, sends no credentials, stays same-origin, and refuses to register inside frames.
* Feature: Agent Tools setting - choose exactly which tools are exposed; unchecking a tool removes it from MCP, WebMCP, and the sitemap at once.
* Feature: Agent Access panel - the settings page now states at a glance which surfaces are on, which tools and content types agents can see, which paths are hidden, and that agents are read-only.
* Quality: WebMCP tool annotations (read-only, untrusted content) are kept in sync with the repository-wide tool manifest by automated parity tests.

= 1.2.1 - 2026-07-21 =
* Security: Enforced the global kill switch across llms.txt, llms-full.txt, MCP routes, discovery tags, and dashboard state.
* Security: Safe rendering no longer executes `the_content`, dynamic blocks, or shortcodes by default; full rendering is explicit opt-in and never shared-cacheable.
* Security: Added same-origin browser checks, HMAC cache/rate-limit keys, conservative path normalization, Markdown URL neutralization, and an exposure veto filter.
* Security: Disabled llms-full.txt by default and added global item, byte, cache-safety, regeneration-lock, and background-generation controls.
* Privacy: Author display names are omitted by default and can be enabled separately.
* MCP: Added protocol-version validation, 202 notification responses, GET/POST transport handling, bounded resources pagination, signed cursors, and prompt-injection trust-boundary notices.
* Quality: Added PHP unit/integration tests and made WordPress coding standards blocking in CI.
* Documentation: Replaced unsupported universal-discovery, zero-overhead, page-builder, and full-compliance claims with precise behavior and limitations.
* Routing: Keeps `/llms.txt` and `/llms-full.txt` free of canonical trailing-slash redirects and refreshes rewrite rules once per plugin version.

= 1.2.0 - 2026-07-13 =
* Security: Rate limiter now uses REMOTE_ADDR by default; forwarding headers (X-Forwarded-For/X-Real-IP) are only trusted behind a proxy you opt into via CORSEN_CONTEXT_TRUST_PROXY. Closes a spoofable rate-limit bypass.
* Security: Rate limiter uses the object cache's atomic INCR when a persistent cache (Redis/Memcached) is present, preventing burst overshoot.
* Security: Rate limiting now runs before authentication, so the API key can't be brute-forced unthrottled.
* Security: resources/read and get_page_content now validate the URI resolves to a same-site, non-excluded, http(s) URL before returning content.
* Security: Settings sanitization restricts post types to publicly-registered types.
* Performance: MCP tool responses are cached (transients) and invalidated when content changes — bounds compute on the public endpoint.
* Fix: resources/list preserves query strings in resource URIs (parity with the core library).
* Improvement: Configurable enabled tool set via the corsen_context_enabled_tools filter.
* Improvement: Loads the plugin text domain so strings are translatable.
* Improvement: Uninstall now also clears cached MCP response transients.

= 1.1.0 - 2026-04-12 =
* Security: SSRF protection now fails closed when DNS resolution fails
* Security: Fixed PHP ReDoS crash on large HTML payloads (preg_replace null safety)
* Security: Fixed rate limiter TTL renewal bug that converted per-minute into per-session limits
* Fix: Added max_pages setting to admin UI (was only configurable in code)
* Fix: Uninstall now cleans up all rate-limit transients from database
* Improvement: Added hourly WP-Cron garbage collector for expired rate-limit transients
* Improvement: Better rate limit window tracking with remaining TTL preservation

= 1.0.0 - 2026-04-08 =
* Initial release
* Read-only MCP-style JSON-RPC endpoint with 4 tools
* `initialize`, `ping`, `notifications/initialized` support
* `tools/list`, `tools/call`, `resources/list`, `resources/read`
* llms.txt and llms-full.txt generation with auto-caching
* Admin settings page with post type selection and path exclusion
* Dashboard widget showing AI context status
* Yoast SEO and Rank Math metadata integration
* Rate limiting (configurable, default 100 req/min)
* SSRF protection blocking all private IP ranges
* Security headers on all responses
* Optional API key authentication (timing-safe comparison)
* Cache invalidation on post save/delete
* `<link rel="mcp">` meta tag in HTML head
* Clean uninstall (removes all options and transients)

== Upgrade Notice ==

= 1.2.1 =
Security and reliability update. `/llms-full.txt` is now disabled by default; review and enable it explicitly if the bounded full-content export is desired.

= 1.1.0 =
Security update: fixes SSRF fail-open, PHP crash on large content, rate limiter bugs. Adds WP-Cron cleanup and max_pages admin setting. Recommended for all users.

= 1.0.0 =
Initial release with MCP-style JSON-RPC and llms.txt publishing.
