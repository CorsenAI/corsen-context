import type { ReactNode } from 'react';
import Script from 'next/script';
import './demo.css';

export const metadata = {
  title: 'Aurora Kits — Next.js WebMCP use-case gallery',
  description: 'Read-only product, support, policy, and guide workflows over four WebMCP tools.',
};

// Resolve owner revocation at request time so the HTML and transport cannot
// drift when the deployment flag changes.
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: ReactNode }) {
  const mcpEnabled = process.env.CORSEN_CONTEXT_MCP_ENABLED !== 'false';
  return (
    <html lang="en">
      <head>
        {/* Same-origin bridge: every browser tool call is forwarded to POST /v1/mcp. */}
        {mcpEnabled && <script src="/webmcp.js" defer />}
        <link rel="stylesheet" href="/corsen/cc-nav.css" />
        <link rel="stylesheet" href="/corsen/cc-observatory.css" />
      </head>
      <body>
        {children}
        {/* These scripts populate React-rendered placeholders, so run them after hydration. */}
        <Script src="/corsen/cc-observatory.js" strategy="afterInteractive" />
        <Script src="/corsen/cc-nav.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
