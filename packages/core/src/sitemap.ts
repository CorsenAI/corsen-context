import { XMLParser } from 'fast-xml-parser';
import type { SitemapEntry } from './types.js';
import { safeFetch, isPrivateUrl } from './security.js';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  processEntities: false, // Defense in depth: block XXE even if lib defaults change
});

interface SitemapXmlUrl {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: number | string;
}

interface SitemapXmlIndex {
  loc: string;
  lastmod?: string;
}

export async function parseSitemap(
  sitemapUrl: string,
  maxPages: number = 500,
): Promise<SitemapEntry[]> {
  if (await isPrivateUrl(sitemapUrl)) {
    throw new Error('SSRF protection: cannot fetch private/internal URLs');
  }

  const entries: SitemapEntry[] = [];
  await fetchAndParseSitemap(sitemapUrl, entries, maxPages, 0);
  return entries.slice(0, maxPages);
}

async function fetchAndParseSitemap(
  url: string,
  entries: SitemapEntry[],
  maxPages: number,
  depth: number,
): Promise<void> {
  if (depth > 3 || entries.length >= maxPages) return;

  let response: Response;
  try {
    response = await safeFetch(url, {
      headers: { 'User-Agent': 'CorsenContext/1.0 (+https://github.com/CorsenAI/corsen-context)' },
      timeout: 10000,
    });
  } catch {
    return; // SSRF blocked or network error — skip silently
  }

  if (!response.ok) return;

  // XML bomb protection: limit response body to 5 MB.
  const MAX_SITEMAP_SIZE = 5 * 1024 * 1024;
  const contentLength = response.headers?.get?.('content-length');
  if (contentLength && parseInt(contentLength, 10) > MAX_SITEMAP_SIZE) {
    return;
  }

  const xml = await response.text();
  if (xml.length > MAX_SITEMAP_SIZE) {
    return;
  }
  const parsed = parser.parse(xml);

  // Sitemap index (contains other sitemaps)
  if (parsed.sitemapindex?.sitemap) {
    const sitemaps: SitemapXmlIndex[] = Array.isArray(parsed.sitemapindex.sitemap)
      ? parsed.sitemapindex.sitemap
      : [parsed.sitemapindex.sitemap];

    for (const sm of sitemaps) {
      if (entries.length >= maxPages) break;
      if (sm.loc) {
        await fetchAndParseSitemap(sm.loc, entries, maxPages, depth + 1);
      }
    }
    return;
  }

  // Regular sitemap (contains URLs)
  if (parsed.urlset?.url) {
    const urls: SitemapXmlUrl[] = Array.isArray(parsed.urlset.url)
      ? parsed.urlset.url
      : [parsed.urlset.url];

    for (const u of urls) {
      if (entries.length >= maxPages) break;
      if (u.loc && !(await isPrivateUrl(u.loc))) {
        entries.push({
          url: u.loc,
          lastmod: u.lastmod,
          changefreq: u.changefreq,
          priority: typeof u.priority === 'string' ? parseFloat(u.priority) : u.priority,
        });
      }
    }
  }
}

export async function discoverSitemap(siteUrl: string): Promise<string | null> {
  const base = siteUrl.replace(/\/$/, '');

  // Try common sitemap locations
  const candidates = [
    `${base}/sitemap.xml`,
    `${base}/sitemap_index.xml`,
    `${base}/sitemap/sitemap.xml`,
  ];

  // Try robots.txt first
  try {
    const robotsUrl = `${base}/robots.txt`;
    const res = await safeFetch(robotsUrl, { timeout: 5000 });
    if (res.ok) {
      const text = await res.text();
      const match = text.match(/^Sitemap:\s*(.+)$/im);
      if (match?.[1]) {
        return match[1].trim();
      }
    }
  } catch {
    // Continue to other candidates
  }

  for (const url of candidates) {
    try {
      const res = await safeFetch(url, {
        method: 'HEAD',
        timeout: 5000,
      });
      if (res.ok) return url;
    } catch {
      continue;
    }
  }

  return null;
}
