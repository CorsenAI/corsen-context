# WebMCP browser setup

Verified against the current Chrome documentation and WebMCP Community Group
draft on 2026-09-03.

WebMCP is an experimental browser API, not a W3C Standard. For Corsen Context's
imperative registrations, loading the generated bridge is necessary but not
sufficient: the page must run in a browser that exposes a supported
`modelContext` API, and an agent or inspector must consume the registered
tools.

## ChatGPT in-app browser

The WebMCP Challenge accepts a live URL opened in ChatGPT's in-app browser,
which provides WebMCP support for judging. Open the live page as the active
top-level page, reload once if the page was already open, and use a prompt that
causes visible tool calls. Record the client name and date with the result.

## Chrome 149 or newer

For local testing, Chrome documents this path:

1. open `chrome://flags/#enable-webmcp-testing`;
2. set **WebMCP for testing** to **Enabled**;
3. relaunch Chrome;
4. open the site as a top-level page;
5. verify
   `typeof (document.modelContext || navigator.modelContext) === 'object'` in
   DevTools; and
6. reload after changing tool registration.

See the official [Chrome WebMCP guide](https://developer.chrome.com/docs/ai/webmcp).

To inspect and execute tools from Chrome DevTools, Chrome 149 also documents
the experimental `chrome://flags/#devtools-webmcp-support` flag. Enable it in
addition to the WebMCP testing flag, relaunch, then use the WebMCP tooling in
the Application panel. The inspector is a test client; it is separate from a
browser agent.

## Public origin-trial deployment

For a public Chrome origin-trial deployment, enroll the exact HTTPS origin and
provide its current token before the page accesses the API. Chrome accepts an
origin-trial meta tag or response header. Tokens expire and are origin-specific;
confirm enrollment in DevTools instead of assuming an old token still works.

For WordPress, the plugin's optional origin-trial setting emits the first-party
meta tag. Other integrations can use their framework layout or an HTTP response
header. An origin-trial token is public browser-delivered metadata, not an MCP
API credential.

## Document and bridge requirements

- Use a secure context for public deployment.
- Keep the page origin-isolated; do not opt out with
  `Origin-Agent-Cluster: ?0` or `document.domain`.
- Allow the `tools` Permissions Policy for the current origin.
- Corsen Context intentionally registers only in the top-level browsing
  context. Chrome can expose WebMCP to same-origin frames and to cross-origin
  frames explicitly delegated with `allow="tools"`, but this bridge refuses all
  framed registration.
- Scripts that populate framework-owned placeholders must not mutate
  server-rendered DOM before hydration; this is a framework integration rule,
  not a general WebMCP registration requirement.
- Resolve the MCP endpoint against the current page and reject invalid,
  credential-bearing, non-HTTP(S), cross-origin, or framed registrations.

## What a valid receipt looks like

On the nine non-WordPress targets in the ten-stack parity set, a valid receipt
shows exactly the four shared tools: `search_site`, `get_page_content`,
`list_content`, and `get_sitemap`. The additional Netlify deployment exposes
the same four tools but is outside the `10/10` manifest-hash claim.

On the WordPress flagship, a valid receipt shows those four core tools plus
`get_product`, `get_sections`, `get_structured_data`, `check_agent_access`, and
`request_expert_call`. Every tool except `request_expert_call` is read-only;
that tool is explicitly non-read-only and must return `human_only` before any
business side effect.

For either shape, record:

1. the page URL, browser/client, version, and date;
2. the registered tool names and annotations;
3. a natural-language request that causes a real tool call;
4. a same-origin canonical source URL in the result;
5. the grounded answer; and
6. zero unhandled registration, hydration, fetch, or execution errors.

An HTTP probe or the page's own live-trace component is supporting evidence,
not a substitute for a real WebMCP client receipt.

## Security note

Tool metadata and site-authored results can carry untrusted instructions.
`readOnlyHint` and `untrustedContentHint` are signals for clients, not server
enforcement. Corsen Context enforces each core tool's read and content boundary
on the server and exposes only the public corpus selected by the site owner.
WordPress extensions are enabled and gated separately.
