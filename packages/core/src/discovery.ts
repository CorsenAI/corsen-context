import { MCP_PROTOCOL_VERSION } from './version.js';

/** Minimal shape needed to build discovery artifacts. */
export interface DiscoveryConfig {
  siteUrl: string;
  /** MCP endpoint path or absolute URL. Defaults to `/v1/mcp`. */
  mcpEndpoint?: string;
  /** Optional sitemap URL to advertise in robots.txt. */
  sitemapUrl?: string;
}

function sameOriginHttpUrl(value: string, siteUrl: string, label: string): string {
  if (/[\r\n]/.test(value) || /[\r\n]/.test(siteUrl)) {
    throw new Error(`Corsen Context: ${label} cannot contain line breaks.`);
  }

  let site: URL;
  let candidate: URL;
  try {
    site = new URL(siteUrl);
    candidate = new URL(value, site);
  } catch {
    throw new Error(`Corsen Context: ${label} must be a valid URL.`);
  }

  if (!['http:', 'https:'].includes(site.protocol) || site.username || site.password) {
    throw new Error('Corsen Context: siteUrl must be an HTTP(S) URL without credentials.');
  }
  if (!['http:', 'https:'].includes(candidate.protocol)) {
    throw new Error(`Corsen Context: ${label} must use HTTP(S).`);
  }
  if (candidate.username || candidate.password) {
    throw new Error(`Corsen Context: ${label} cannot contain credentials.`);
  }
  if (candidate.origin !== site.origin) {
    throw new Error(`Corsen Context: ${label} must be same-origin with siteUrl.`);
  }
  return candidate.toString();
}

function absoluteEndpoint(config: DiscoveryConfig): string {
  return sameOriginHttpUrl(config.mcpEndpoint || '/v1/mcp', config.siteUrl, 'mcpEndpoint');
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Build robots.txt lines that advertise the MCP endpoint (and sitemap) so AI
 * agents can discover the site. Append these to your existing robots.txt.
 */
export function generateRobotsTxt(config: DiscoveryConfig): string {
  const lines = [`MCP: ${absoluteEndpoint(config)}`];
  if (config.sitemapUrl) {
    lines.push(`Sitemap: ${sameOriginHttpUrl(config.sitemapUrl, config.siteUrl, 'sitemapUrl')}`);
  }
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
  return `<link rel="mcp" href="${escapeHtmlAttribute(absoluteEndpoint(config))}" />`;
}
