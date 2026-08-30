import { createWebMCPScriptHandler } from '@corsenai/corsen-context-nextjs';
import { demoProvider, SITE_URL } from '../../lib/provider';

const config = {
  siteUrl: SITE_URL,
  mcp: { enabled: process.env.CORSEN_CONTEXT_MCP_ENABLED !== 'false' },
  security: { trustProxy: process.env.TRUST_PROXY === '1' },
};

// Served as /webmcp.js — load it with <script src="/webmcp.js" defer>.
const GET = createWebMCPScriptHandler(config, demoProvider);

export { GET };
