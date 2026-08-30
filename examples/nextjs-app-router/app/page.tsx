export default function Home() {
  return (
    <main style={{ maxWidth: 680, margin: '0 auto', padding: '2rem', fontFamily: 'system-ui', lineHeight: 1.5 }}>
      <h1>Corsen Context — Next.js WebMCP demo</h1>
      <p>
        This page is agent-native. The same four tools are exposed over three
        surfaces from a single definition — no scraping, no guessing the DOM.
      </p>

      <ul>
        <li>
          <a href="/llms.txt">/llms.txt</a> — static overview for discovery
        </li>
        <li>
          <code>POST /v1/mcp</code> — MCP endpoint for agents outside the browser
        </li>
        <li>
          <code>document.modelContext</code> — WebMCP, for an agent running inside this page
        </li>
      </ul>

      <h2>Ask the agent</h2>
      <p>
        In a WebMCP-capable browser (Chrome with{' '}
        <code>chrome://flags/#enable-webmcp-testing</code>, or an agent browser
        with built-in support), the agent can call these tools directly:
      </p>
      <ul>
        <li>
          <code>search_site</code> — search content by keyword
        </li>
        <li>
          <code>get_page_content</code> — read a page as clean markdown
        </li>
        <li>
          <code>list_content</code> — browse by type
        </li>
        <li>
          <code>get_sitemap</code> — the structured sitemap
        </li>
      </ul>
      <p>
        Try: <em>&ldquo;Search this site for AI context, then summarise the top result.&rdquo;</em>
      </p>

      <h2>Or call it directly</h2>
      <pre style={{ background: '#f4f4f4', padding: '1rem', borderRadius: 8, overflow: 'auto' }}>
        {`curl -X POST http://localhost:3000/v1/mcp \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","method":"tools/call","id":1,\\
       "params":{"name":"search_site","arguments":{"query":"AI"}}}'`}
      </pre>

      <p style={{ marginTop: '2rem', color: '#888', fontSize: 14 }}>
        Powered by Corsen Context — Built by Corsen AI
      </p>
    </main>
  );
}
