# @corsenai/corsen-context

The core engine of **[Corsen Context](https://github.com/CorsenAI/corsen-context)** — the Universal AI Context Layer that makes any website AI-native with an MCP server + enhanced `llms.txt`.

```bash
npm install @corsenai/corsen-context
```

```typescript
import { CorsenContext, createInMemoryProvider } from '@corsenai/corsen-context';

const cc = new CorsenContext(
  { siteUrl: 'https://example.com' },
  createInMemoryProvider([
    { url: 'https://example.com/', title: 'Home', description: 'Welcome', markdown: '# Home', metadata: {}, type: 'page' },
  ]),
);

const server = cc.createMCPServer();
const result = await server.handleRequest(requestBody, clientIp);
```

This package provides the framework-agnostic core: the MCP JSON-RPC 2.0 server, `llms.txt` generators, HTML→Markdown converter, SSRF-safe fetching, rate limiting, caching, and the content-access policy.

- **Full docs:** https://github.com/CorsenAI/corsen-context#readme
- **Security model:** [SECURITY.md](https://github.com/CorsenAI/corsen-context/blob/main/SECURITY.md)
- **License:** MIT
