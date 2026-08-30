import { createWebMCPScriptHandler } from '@corsenai/corsen-context-astro';
import { SITE_URL, demoProvider } from '../lib/provider';

// Served as /webmcp.js — pages load it with <script src="/webmcp.js" defer>.
export const GET = createWebMCPScriptHandler(
  {
    siteUrl: SITE_URL,
    mcp: { enabled: process.env.CORSEN_CONTEXT_MCP_ENABLED !== 'false' },
    security: { trustProxy: process.env.TRUST_PROXY === '1' },
  },
  demoProvider,
);
