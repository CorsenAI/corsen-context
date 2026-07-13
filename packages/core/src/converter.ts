import * as cheerio from 'cheerio';
import TurndownService from 'turndown';

const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
});

// Remove unwanted elements before conversion.
// Note: `header`/`footer` are intentionally NOT removed here — an in-article
// <header> commonly wraps the page H1/title. Site-level chrome is removed via
// the scoped selectors in htmlToMarkdown() instead.
turndown.remove(['script', 'style', 'nav', 'iframe', 'noscript', 'svg']);

/** URL schemes that must never survive into generated content. */
const DANGEROUS_URL_SCHEME = /^\s*(?:javascript|vbscript|file|data):/i;

/**
 * Neutralize links/images whose target uses a dangerous scheme. The markdown is
 * served as text to AI agents rather than rendered, so this is defense in depth
 * against a downstream consumer that renders it as HTML.
 */
function sanitizeUrls(markdown: string): string {
  return markdown.replace(/(!?)\[([^\]]*)\]\(([^)]*)\)/g, (match, bang, label, url) => {
    if (!DANGEROUS_URL_SCHEME.test(url)) return match;
    // Drop the image marker and point the link at a harmless anchor.
    return `[${label}](#)`;
  });
}

// Better handling of code blocks
turndown.addRule('pre', {
  filter: 'pre',
  replacement(content, node) {
    const el = node as unknown as { textContent?: string };
    const code = el.textContent || content;
    return `\n\`\`\`\n${code.trim()}\n\`\`\`\n`;
  },
});

export function htmlToMarkdown(html: string): string {
  const $ = cheerio.load(html);

  // Remove common non-content elements. Site-level <header>/<footer> are
  // targeted only as direct children of <body> (page chrome), so an in-article
  // <header> holding the H1/title is preserved.
  $(
    'nav, aside, body > header, body > footer, .sidebar, .menu, .navigation, .cookie-banner, .popup, .modal, #comments, .comments, .ad, .advertisement, [role="navigation"], [role="banner"], [role="complementary"]',
  ).remove();

  // Try to extract main content area
  const mainSelectors = [
    'main',
    'article',
    '[role="main"]',
    '.entry-content',
    '.post-content',
    '.article-content',
    '.page-content',
    '#content',
    '.content',
  ];

  let contentHtml = '';
  for (const sel of mainSelectors) {
    const el = $(sel).first();
    // Skip empty/whitespace-only containers so a bare <main></main> wrapper
    // doesn't shadow the real content further down the fallback list.
    if (el.length && el.text().trim()) {
      contentHtml = el.html() || '';
      if (contentHtml) break;
    }
  }

  if (!contentHtml) {
    contentHtml = $('body').html() || html;
  }

  const markdown = turndown.turndown(contentHtml);

  // Clean up excessive whitespace
  return sanitizeUrls(
    markdown
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^\s+|\s+$/g, '')
      .trim(),
  );
}

export function extractMetadata(html: string): Record<string, string> {
  const $ = cheerio.load(html);
  const meta: Record<string, string> = {};

  // Title
  const title = $('title').first().text().trim();
  if (title) meta['title'] = title;

  // Meta description
  const desc =
    $('meta[name="description"]').attr('content') ||
    $('meta[property="og:description"]').attr('content');
  if (desc) meta['description'] = desc.trim();

  // Open Graph
  const ogTitle = $('meta[property="og:title"]').attr('content');
  if (ogTitle) meta['og:title'] = ogTitle.trim();

  const ogImage = $('meta[property="og:image"]').attr('content');
  if (ogImage) meta['og:image'] = ogImage.trim();

  const ogType = $('meta[property="og:type"]').attr('content');
  if (ogType) meta['og:type'] = ogType.trim();

  // Canonical URL
  const canonical = $('link[rel="canonical"]').attr('href');
  if (canonical) meta['canonical'] = canonical.trim();

  // Author
  const author = $('meta[name="author"]').attr('content');
  if (author) meta['author'] = author.trim();

  // Published / modified dates
  const published =
    $('meta[property="article:published_time"]').attr('content') ||
    $('time[datetime]').first().attr('datetime');
  if (published) meta['published'] = published.trim();

  const modified = $('meta[property="article:modified_time"]').attr('content');
  if (modified) meta['modified'] = modified.trim();

  // Language
  const lang = $('html').attr('lang');
  if (lang) meta['lang'] = lang.trim();

  return meta;
}
