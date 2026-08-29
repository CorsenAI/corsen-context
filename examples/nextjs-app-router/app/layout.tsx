import type { ReactNode } from 'react';

export const metadata = {
  title: 'Corsen Context — Next.js WebMCP demo',
  description: 'A site made agent-native over MCP, llms.txt and WebMCP.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/*
          The WebMCP bridge. It registers this site's tools with an agent
          running inside the page (document.modelContext) and forwards every
          call to /v1/mcp. Served by the Next.js adapter — no inline script,
          so it stays compatible with a strict CSP.
        */}
        <script src="/webmcp.js" defer />
      </head>
      <body>{children}</body>
    </html>
  );
}
