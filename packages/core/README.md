# @corsenai/corsen-context

The core engine of **[Corsen Context](https://github.com/CorsenAI/corsen-context)** — owner-controlled public content through MCP, WebMCP, and bounded `llms.txt` output.

```bash
npm install @corsenai/corsen-context
```

```typescript
import {
  CorsenContext,
  createInMemoryProvider,
  generateWebMCPScript,
  toWebMCPTools,
} from '@corsenai/corsen-context';

const cc = new CorsenContext(
  { siteUrl: 'https://example.com' },
  createInMemoryProvider([
    {
      url: 'https://example.com/',
      title: 'Home',
      description: 'Welcome',
      markdown: '# Home',
      metadata: {},
      type: 'page',
    },
  ]),
);

const server = cc.createMCPServer();
const result = await server.handleRequest(requestBody, clientIp);

// Serve this string as GET /webmcp.js on the same origin as POST /v1/mcp.
const webmcpScript = generateWebMCPScript(toWebMCPTools(server.getToolDefinitions()), {
  mcpEndpoint: '/v1/mcp',
});
```

Load `/webmcp.js` from the site's pages with
`<script src="/webmcp.js" defer></script>`. The bridge registers the four
tools through `document.modelContext` and forwards calls to the same-origin MCP
endpoint. It intentionally sends no API key or visitor credentials: use a
public, read-only, rate-limited endpoint for WebMCP, or omit the browser bridge
when MCP requires server-side authentication.

This package provides the framework-agnostic core: the MCP JSON-RPC 2.0 server,
WebMCP bridge generation, `llms.txt` generators, HTML-to-Markdown converter,
SSRF-safe fetching, rate limiting, caching, and the content-access policy. A
working site integration must also implement a `ContentProvider` backed only
by the public content it intends to expose.

The resolved configuration enforces these owner controls and bounds:

```typescript
const cc = new CorsenContext(
  {
    siteUrl: 'https://example.com',
    mcp: { enabled: true },
    content: { maxPages: 500 }, // 1–5000
    static: {
      generateLlmsTxt: true,
      includeFullContent: false,
      maxOutputBytes: 5_242_880, // 64 KiB–10 MiB
    },
  },
  provider,
);
```

With `mcp.enabled: false`, direct MCP dispatch is rejected before the provider
is invoked; adapters also use this value to return `404` from their MCP and
WebMCP routes. With `static.generateLlmsTxt: false`, both `CorsenContext`
generation methods refuse generation. Full-content generation additionally
requires
`static.includeFullContent: true`, which is off by default. Both static outputs
are capped at `maxOutputBytes` without splitting a UTF-8 code point and append
a truncation notice when the complete output would exceed the limit.
Full-content iteration returns as soon as the next block would exceed the budget.

Static headings, labels, descriptions, dates, and Markdown destinations are
normalized and escaped. The provider's page-body `markdown` is passed through
unchanged and remains untrusted site-authored content; this package does not
claim to neutralize it.

- **Full docs:** https://github.com/CorsenAI/corsen-context#readme
- **Security model:** [SECURITY.md](https://github.com/CorsenAI/corsen-context/blob/main/SECURITY.md)
- **License:** MIT
