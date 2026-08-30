# WebMCP browser setup

Verified against official documentation on 2026-08-30.

WebMCP is an experimental browser API. The current specification is a
[Community Group draft](https://webmachinelearning.github.io/webmcp/), not a
W3C Standard. Chrome's documentation says the origin trial is available from
Chrome 149 and that browser/client support remains subject to change.

Serving `/webmcp.js` is necessary but not sufficient: the browser must expose
`document.modelContext`, and an agent/client must know how to consume the
registered tools.

## Local development

Chrome documents this test path:

1. open `chrome://flags/#enable-webmcp-testing`;
2. set **WebMCP for testing** to **Enabled**;
3. relaunch Chrome;
4. open the site as a top-level page;
5. verify `typeof document.modelContext === 'object'` in DevTools;
6. reload after changing tool registration.

See the official [Chrome WebMCP guide](https://developer.chrome.com/docs/ai/webmcp).

The Chrome Model Context Tool Inspector can display registered tools and call
them manually. That inspector is a test client; it is separate from Gemini in
Chrome and from other browser-agent products.

## Public origin-trial deployment

Register the exact HTTPS origin for the active WebMCP trial, then provide its
token before the page accesses the API. Chrome supports either:

```html
<meta http-equiv="origin-trial" content="TOKEN_FOR_THIS_EXACT_ORIGIN" />
```

or the response header:

```http
Origin-Trial: TOKEN_FOR_THIS_EXACT_ORIGIN
```

Tokens expire and are origin-specific. Never copy a token from another site
or assume an old token remains valid. Confirm enrollment in DevTools under the
Application panel. See Chrome's
[origin-trial instructions](https://developer.chrome.com/docs/web-platform/origin-trials)
and [troubleshooting guide](https://developer.chrome.com/docs/web-platform/origin-trial-troubleshooting/).

For WordPress, the plugin's optional origin-trial field emits the first-party
meta tag. Other integrations should use their framework layout or an HTTP
response header. Do not store the token as an MCP secret: origin-trial tokens
are intentionally delivered to browsers, but must still match the enrolled
origin and current trial.

## Document requirements

Chrome currently requires:

- a secure context for public deployment;
- an origin-isolated document (do not opt out with
  `Origin-Agent-Cluster: ?0` or `document.domain`);
- the `tools` Permissions Policy, which defaults to `self`;
- a top-level or allowed same-origin context.

Corsen Context additionally refuses to register inside a frame and refuses an
invalid, credential-bearing, non-HTTP(S), or cross-origin MCP endpoint.

## Client labels and evidence

Record the exact browser, agent/client or extension, date, site URL, tool
names, and calls executed. Do not infer that one client works because another
client on the same machine succeeded.

A valid end-to-end receipt shows:

1. exactly `search_site`, `get_page_content`, `list_content`, and
   `get_sitemap` registered;
2. a natural-language request causing `search_site`;
3. one returned public URL passed to `get_page_content`;
4. a grounded answer linked to that page;
5. no unhandled registration or fetch error in the console.

## Security note

Chrome's [WebMCP security guidance](https://developer.chrome.com/docs/ai/webmcp/secure-tools)
states that tool metadata and returned content can be prompt-injection
surfaces. `readOnlyHint` and `untrustedContentHint` are signals, not enforcement.
Corsen Context's demonstrated tools remain read-only at the server and expose
only the public corpus configured by the site owner.
