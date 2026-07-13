import { MCP_PROTOCOL_VERSION } from './version.js';

/** Minimal shape needed to build discovery artifacts. */
export interface DiscoveryConfig {
  siteUrl: string;
  /** MCP endpoint path or absolute URL. Defaults to `/v1/mcp`. */
  mcpEndpoint?: string;
  /** Optional sitemap URL to advertise in robots.txt. */
  sitemapUrl?: string;
}

function absoluteEndpoint(config: DiscoveryConfig): string {
  const base = config.siteUrl.replace(/\/$/, '');
  const endpoint = config.mcpEndpoint || '/v1/mcp';
  return /^https?:\/\//.test(endpoint) ? endpoint : `${base}${endpoint}`;
}

/**
 * Build robots.txt lines that advertise the MCP endpoint (and sitemap) so AI
 * agents can discover the site. Append these to your existing robots.txt.
 */
export function generateRobotsTxt(config: DiscoveryConfig): string {
  const lines = [`MCP: ${absoluteEndpoint(config)}`];
  if (config.sitemapUrl) lines.push(`Sitemap: ${config.sitemapUrl}`);
  return lines.join('\n') + '\n';
}

/**
 * Build the JSON document to serve at /.well-known/mcp — the standard MCP
 * discovery endpoint.
 */
export function generateWellKnownMcp(config: DiscoveryConfig): {
  mcpEndpoint: string;
  protocolVersion: string;
  transport: string;
} {
  return {
    mcpEndpoint: absoluteEndpoint(config),
    protocolVersion: MCP_PROTOCOL_VERSION,
    transport: 'http',
  };
}

/** Build the `<link rel="mcp">` tag for the HTML head. */
export function mcpLinkTag(config: DiscoveryConfig): string {
  return `<link rel="mcp" href="${absoluteEndpoint(config)}" />`;
}
