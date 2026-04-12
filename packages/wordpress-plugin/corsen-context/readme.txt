=== Corsen Context ===
Contributors: corsenai
Donate link: https://corsen.ai
Tags: ai, mcp, llms-txt, model-context-protocol, ai-native
Requires at least: 6.0
Tested up to: 6.7
Requires PHP: 8.0
Stable tag: 1.1.0
License: MIT
License URI: https://opensource.org/licenses/MIT

Make your WordPress site AI-native. Generates llms.txt and exposes a full MCP server so AI agents can access your content.

== Description ==

**Corsen Context** is the Universal AI Context Layer for WordPress. It turns your site into an AI-native platform that Claude, ChatGPT, Cursor, Grok, and any MCP-compatible AI agent can understand — instantly.

= What it does =

Your site gets two new capabilities:

1. **Static Layer** — Automatically generates `/llms.txt` and `/llms-full.txt` files containing a clean, structured markdown overview of all your published content. AI agents read these files to understand your site at a glance.

2. **Dynamic Layer** — Exposes a full **Model Context Protocol (MCP)** server at `/wp-json/corsen-context/v1/mcp` with 4 powerful tools: search your site, get any page as clean markdown, list content by type, and retrieve the full sitemap.

= Key Features =

* **One-click install** — Zero configuration required. Works out of the box.
* **Full MCP 2025-11-25 compliance** — `initialize`, `ping`, `tools/list`, `tools/call`, `resources/list`, `resources/read`, `notifications/initialized`.
* **4 AI tools** — `search_site`, `get_page_content`, `list_content`, `get_sitemap`.
* **SEO integration** — Reads Yoast SEO and Rank Math metadata for better descriptions.
* **Security built-in** — Rate limiting, SSRF protection, input validation, security headers, optional API key auth.
* **Admin settings page** — Choose post types, exclude paths, set rate limits, toggle features.
* **Dashboard widget** — See your AI context status at a glance.
* **Smart caching** — Content is cached via transients and auto-invalidated on post save.
* **Content safety** — Only published, public content is ever exposed. Never drafts, trash, or private pages.
* **Credit line** — "Powered by Corsen Context" in generated files (configurable).

= How AI Agents Discover Your Site =

Once activated, AI agents can find your site through:

1. **robots.txt** — `MCP: https://yoursite.com/wp-json/corsen-context/v1/mcp`
2. **llms.txt** — The credit line includes the MCP endpoint URL
3. **HTML head** — `<link rel="mcp">` meta tag added automatically
4. **Direct URL** — Agents can try `/llms.txt` on any site

= Requirements =

* WordPress 6.0 or higher
* PHP 8.0 or higher
* Pretty permalinks enabled (Settings > Permalinks > anything except "Plain")

= Part of a Bigger Ecosystem =

Corsen Context is an open-source project by [Corsen AI](https://corsen.ai). The same core engine powers adapters for Next.js, Express, Astro, and any Node.js server. WordPress gets a dedicated plugin for the smoothest experience.

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
* `/llms-full.txt` — Full content version
* MCP endpoint — `https://yoursite.com/wp-json/corsen-context/v1/mcp`
* Dashboard widget — Check your admin dashboard

**Important:** Make sure pretty permalinks are enabled (Settings > Permalinks).

== Frequently Asked Questions ==

= What is MCP? =

Model Context Protocol is an open standard (maintained by Anthropic / Linux Foundation) that defines how AI agents communicate with data sources. Think of it as a REST API specifically designed for AI agents. Corsen Context implements MCP spec 2025-11-25.

= What is llms.txt? =

A convention where websites place a `/llms.txt` file (similar to `robots.txt`) containing a clean, structured markdown overview of the site. AI agents check this file to quickly understand what content is available.

= Is my content safe? =

Absolutely. Only published, public content is ever exposed. The plugin explicitly filters for `post_status = 'publish'` and respects all WordPress visibility settings. Draft, pending, private, password-protected, and trashed content is never included.

= Does this slow down my site? =

No. All generated content is cached using WordPress transients. The cache is automatically invalidated when you publish or update posts. The MCP endpoint only processes requests when an AI agent connects — it adds zero overhead to normal page loads.

= Does it work with page builders? =

Yes. Corsen Context uses `apply_filters('the_content')` which processes content through all active plugins including Elementor, Beaver Builder, Divi, and others. The rendered content is then converted to clean markdown.

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
* Full MCP 2025-11-25 JSON-RPC server with 4 tools
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

= 1.1.0 =
Security update: fixes SSRF fail-open, PHP crash on large content, rate limiter bugs. Adds WP-Cron cleanup and max_pages admin setting. Recommended for all users.

= 1.0.0 =
Initial release. Install to make your WordPress site AI-native with MCP + llms.txt.
