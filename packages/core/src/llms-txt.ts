import type { ContentListItem, ContentProvider } from './types.js';
import type { ResolvedConfig } from './config.js';
import { CREDIT_LINE } from './types.js';

export async function generateLlmsTxt(
  config: ResolvedConfig,
  provider: ContentProvider,
): Promise<string> {
  const pages = await provider.getPages();
  const siteUrl = config.siteUrl.replace(/\/$/, '');
  const mcpEndpoint = config.mcp.enabled ? `${siteUrl}${config.mcp.endpoint}` : null;

  const lines: string[] = [];

  // Header
  lines.push(`# ${config.siteName || new URL(config.siteUrl).hostname}`);
  lines.push('');

  if (config.description) {
    lines.push(`> ${config.description}`);
    lines.push('');
  }

  // About section
  lines.push('## About this AI Context File');
  lines.push(
    'This file is optimized for AI agents and MCP clients (2025-11-25 spec).',
  );
  if (mcpEndpoint) {
    lines.push(`For dynamic structured access use the MCP endpoint below.`);
  }
  lines.push('');

  // Group pages by type
  const grouped = groupByType(pages);

  // Main pages
  if (grouped.page && grouped.page.length > 0) {
    lines.push('## Main Pages');
    for (const p of grouped.page) {
      const desc = p.description ? ` \u2013 ${p.description}` : '';
      lines.push(`- [${p.title}](${p.url})${desc}`);
    }
    lines.push('');
  }

  // Blog posts
  if (grouped.post && grouped.post.length > 0) {
    lines.push('## Blog & Content');
    for (const p of grouped.post) {
      const desc = p.description ? ` \u2013 ${p.description}` : '';
      const date = p.lastModified ? ` \u2022 ${p.lastModified.split('T')[0]}` : '';
      lines.push(`- [${p.title}](${p.url})${desc}${date}`);
    }
    lines.push('');
  }

  // Products
  if (grouped.product && grouped.product.length > 0) {
    lines.push('## Products / Services');
    for (const p of grouped.product) {
      const desc = p.description ? ` \u2013 ${p.description}` : '';
      lines.push(`- [${p.title}](${p.url})${desc}`);
    }
    lines.push('');
  }

  // Other types
  for (const [type, items] of Object.entries(grouped)) {
    if (['page', 'post', 'product'].includes(type)) continue;
    if (items.length === 0) continue;
    lines.push(`## ${capitalize(type)}`);
    for (const p of items) {
      const desc = p.description ? ` \u2013 ${p.description}` : '';
      lines.push(`- [${p.title}](${p.url})${desc}`);
    }
    lines.push('');
  }

  // Credit line
  if (config.credit) {
    const mcpPart = mcpEndpoint ? ` \u2022 MCP endpoint: ${mcpEndpoint}` : '';
    lines.push(`**${CREDIT_LINE}**${mcpPart}`);
    lines.push('');
  }

  return lines.join('\n');
}

export async function generateLlmsFullTxt(
  config: ResolvedConfig,
  provider: ContentProvider,
): Promise<string> {
  const pages = await provider.getPages();
  const sections: string[] = [];

  sections.push(`# ${config.siteName || new URL(config.siteUrl).hostname} — Full Content`);
  sections.push('');
  sections.push(
    '> This file contains the full markdown content of all pages for AI consumption.',
  );
  sections.push('');

  for (const page of pages) {
    const content = await provider.getPageContent(page.url);
    if (!content) continue;

    sections.push('---');
    sections.push('');
    sections.push(`## ${content.title}`);
    sections.push(`URL: ${content.url}`);
    if (content.lastModified) {
      sections.push(`Last modified: ${content.lastModified}`);
    }
    sections.push('');
    sections.push(content.markdown);
    sections.push('');
  }

  if (config.credit) {
    sections.push('---');
    sections.push('');
    sections.push(`**${CREDIT_LINE}**`);
    sections.push('');
  }

  return sections.join('\n');
}

function groupByType(pages: ContentListItem[]): Record<string, ContentListItem[]> {
  const grouped: Record<string, ContentListItem[]> = {};
  for (const page of pages) {
    const type = page.type || 'page';
    if (!grouped[type]) grouped[type] = [];
    grouped[type].push(page);
  }
  return grouped;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
