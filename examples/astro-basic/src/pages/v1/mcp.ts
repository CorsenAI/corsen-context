import { createMCPHandler } from '@corsenai/corsen-context-astro';
import { SITE_URL, demoProvider } from '../../lib/provider';

// MCP endpoint: POST /v1/mcp (JSON-RPC 2.0). OPTIONS answers the CORS
// preflight for cross-origin agents.
export const { POST, OPTIONS } = createMCPHandler({ siteUrl: SITE_URL }, demoProvider);
