# Corsen Context — The Universal WebMCP Layer

**Turn any existing website agent-native — over WebMCP, MCP and llms.txt — without rewriting it.**

One tool definition is served across every surface an AI agent can reach: an
in-page agent through WebMCP (`document.modelContext`), an agent outside the
browser through an MCP endpoint, and static discovery through `llms.txt`. A
single install makes a site reachable; on WordPress — over 40% of the web — it
takes no JavaScript at all.

---

## Why WebMCP fits this project

WebMCP lets a page hand an in-page agent a structured list of tools instead of
making it guess the DOM. Corsen Context already had the hard part: it extracts
clean, permission-checked, structured tools from a live site and serves them
over MCP. WebMCP is the surface it was missing — and it needs no new tool
logic, because the browser bridge forwards every call back to the same MCP
endpoint. The result is one implementation behind three transports, kept honest
by a cross-runtime parity test.

This matters most on WordPress. WebMCP asks a site owner to write JavaScript on
their pages; a large share of the web never will. The Corsen Context plugin
generates the bridge from content the site already publishes, handles the
Chrome origin-trial token, and supports the `document`/`navigator` API split —
so a WordPress site becomes agent-native in the browser by ticking one box.

## What a person and an agent can do together

Open a Corsen Context site in a WebMCP-capable browser and ask the in-page
agent, in plain language:

> "Search this site for our WebMCP support, read the top result, and summarise
> what it offers."

The agent calls `search_site`, then `get_page_content`, and answers from the
site's own structured content — no scraping, no hallucinated URLs, no brittle
DOM selectors. The person stays in control and sees exactly which tools ran.

## The security posture is the differentiator

WebMCP's own spec names its risks: instructions hidden in a tool's description
or return value, a gap between a tool's declared and actual intent, and tools
that run inside the user's authenticated session. Corsen Context answers each:

- **Untrusted output, declared.** Every tool carries `untrustedContentHint:
  true` — site content comes from authors, comments and imports, so a consuming
  agent is told to treat tool output as data, not instructions.
- **Read-only, declared.** Every tool carries `readOnlyHint: true`.
- **Same-origin only.** The bridge never sets `exposedTo`, and refuses to
  register inside a frame (the Permissions Policy `tools` feature already
  defaults to `['self']`).
- **No ambient authority.** The bridge sends no credentials, so it cannot act
  with a signed-in visitor's session, and it can only reach the site's own MCP
  endpoint — it cannot introduce a tool the server does not already serve.
- **No markup injection.** Tool definitions are encoded so a hostile post title
  cannot close the inline script and become markup.

Every one of these is covered by an automated test, on both the TypeScript and
the WordPress runtime.

## The site owner stays in control

A person, not just an agent, is in the loop. The WordPress admin has an
**Agent Access** panel that states plainly what agents can see and do, and
per-tool checkboxes to choose exactly which of the four tools are exposed —
unchecking one removes it from every surface at once (MCP, WebMCP, sitemap),
proven end to end by a test. Content visibility (post types, hidden paths) is
the owner's to set, and the panel makes the read-only guarantee explicit:
agents read published content and can never create, edit, delete, or click
anything.

## How the implementation stays honest

The four tools are declared once, in a language-neutral
[`tools.manifest.json`](tools.manifest.json): name, description, input schema
and WebMCP annotations. The TypeScript core and the PHP WordPress plugin each
implement that contract independently, and a parity test on each side fails CI
if either drifts — a real defect it already caught, where the two runtimes had
diverged on what `get_sitemap` returns.

---

## Prior work vs. new work (required disclosure)

Corsen Context is a mature open-source project: published on npm and
wordpress.org, security-hardened across two release waves, with 167 core tests
and a PHP suite before this challenge began. **None of that WebMCP-era work
existed before the submission period** — the public repository contained no
`modelContext`, `webmcp`, or `web-mcp` reference at all.

- **Prior work** — everything up to and including commit `73ecaee` on `main`.
- **New work, built during the submission period** — the WebMCP layer, on
  branch `feat/webmcp-challenge`, commits after `73ecaee`. Timestamped,
  dated commit history is public on the branch.

What the new work adds:

| Area | New in this submission |
|------|------------------------|
| Contract | `tools.manifest.json` + cross-runtime parity tests |
| Core (TS) | `generateWebMCPScript`, tool annotations, bridge security tests |
| WordPress | WebMCP emitter, admin toggle, origin-trial token support, tests |
| Next.js | `createWebMCPScriptHandler` route handler + tests |
| Astro | `createWebMCPScriptHandler` route handler + tests |
| CLI | `doctor` now checks the homepage for a WebMCP bridge |
| Example | Next.js demo serving MCP + WebMCP + llms.txt from one definition; Express demo serves the bridge at `/webmcp.js` |
| Diagnostics | `examples/webmcp-diagnostic.html` |
| Docs | README WebMCP surface; corrected earlier MCP compliance wording |

The one honest bound: the four public tools are read-only by design. Write
actions (e.g. drafting a post) would require site-specific logic the site owner
must author safely, and are deliberately out of scope for the distributed
packages.
