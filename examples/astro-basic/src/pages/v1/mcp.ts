import { createMCPHandler } from '@corsenai/corsen-context-astro';
import { SITE_URL, demoProvider } from '../../lib/provider';

// MCP endpoint: POST /v1/mcp (JSON-RPC 2.0). OPTIONS answers the CORS
// preflight for cross-origin agents.
export const { GET, POST, OPTIONS } = createMCPHandler(
  {
    siteUrl: SITE_URL,
    mcp: { enabled: process.env.CORSEN_CONTEXT_MCP_ENABLED !== 'false' },
    security: { trustProxy: process.env.TRUST_PROXY === '1' },
  },
  demoProvider,
);
