export default function Home() {
  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>Corsen Context — Next.js Demo</h1>
      <p>This site is AI-native. AI agents can access content through:</p>
      <ul>
        <li>
          <a href="/llms.txt">/llms.txt</a> — Structured overview
        </li>
        <li>
          <code>POST /v1/mcp</code> — MCP endpoint (JSON-RPC 2.0)
        </li>
      </ul>
      <h2>Try it</h2>
      <pre
        style={{
          background: '#f4f4f4',
          padding: '1rem',
          borderRadius: 8,
          overflow: 'auto',
        }}
      >
        {`curl -X POST http://localhost:3000/v1/mcp \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","method":"initialize","id":1}'`}
      </pre>
      <p style={{ marginTop: '2rem', color: '#888', fontSize: 14 }}>
        Powered by Corsen Context — Built by Corsen AI
      </p>
    </main>
  );
}
