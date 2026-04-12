import * as cheerio from 'cheerio';
import TurndownService from 'turndown';

const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
});

// Remove unwanted elements before conversion
turndown.remove(['script', 'style', 'nav', 'footer', 'header', 'iframe', 'noscript', 'svg']);

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

  // Remove common non-content elements
  $(
    'nav, footer, header, aside, .sidebar, .menu, .navigation, .cookie-banner, .popup, .modal, #comments, .comments, .ad, .advertisement, [role="navigation"], [role="banner"], [role="complementary"]',
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
    if (el.length && el.html()) {
      contentHtml = el.html()!;
      break;
    }
  }

  if (!contentHtml) {
    contentHtml = $('body').html() || html;
  }

  const markdown = turndown.turndown(contentHtml);

  // Clean up excessive whitespace
  return markdown
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+|\s+$/g, '')
    .trim();
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
