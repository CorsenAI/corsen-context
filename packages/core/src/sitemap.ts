import { XMLParser } from 'fast-xml-parser';
import type { SitemapEntry } from './types.js';
import { safeFetch, isPrivateUrl } from './security.js';
import { MAX_FETCH_BODY_BYTES, readBoundedText } from './http-body.js';

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

/** XML bomb protection: hard cap on a sitemap response body (5 MiB). */
const MAX_SITEMAP_SIZE = MAX_FETCH_BODY_BYTES;

/**
 * Upper bound on sitemap documents fetched by one parseSitemap() call, index
 * included. `maxPages` alone does not bound the work: an index listing
 * thousands of empty child sitemaps would otherwise cost one fetch each
 * without ever filling the entry budget.
 */
export const MAX_SITEMAP_DOCUMENTS = 50;

interface CrawlBudget {
  documents: number;
}

export async function parseSitemap(
  sitemapUrl: string,
  maxPages: number = 500,
): Promise<SitemapEntry[]> {
  if (await isPrivateUrl(sitemapUrl)) {
    throw new Error('SSRF protection: cannot fetch private/internal URLs');
  }

  const entries: SitemapEntry[] = [];
  const seen = new Set<string>();
  const budget: CrawlBudget = { documents: MAX_SITEMAP_DOCUMENTS };
  await fetchAndParseSitemap(sitemapUrl, entries, seen, maxPages, 0, budget);
  return entries.slice(0, maxPages);
}

async function fetchAndParseSitemap(
  url: string,
  entries: SitemapEntry[],
  seen: Set<string>,
  maxPages: number,
  depth: number,
  budget: CrawlBudget,
): Promise<void> {
  if (depth > 3 || entries.length >= maxPages || budget.documents <= 0) return;
  budget.documents -= 1;

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

  const xml = await readBoundedText(response, MAX_SITEMAP_SIZE);
  if (xml === null) return;
  const parsed = parser.parse(xml);

  // Sitemap index (contains other sitemaps)
  if (parsed.sitemapindex?.sitemap) {
    const sitemaps: SitemapXmlIndex[] = Array.isArray(parsed.sitemapindex.sitemap)
      ? parsed.sitemapindex.sitemap
      : [parsed.sitemapindex.sitemap];

    for (const sm of sitemaps) {
      if (entries.length >= maxPages || budget.documents <= 0) break;
      if (sm.loc) {
        await fetchAndParseSitemap(sm.loc, entries, seen, maxPages, depth + 1, budget);
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
      if (!u.loc || seen.has(u.loc)) continue;
      if (await isPrivateUrl(u.loc)) continue;

      seen.add(u.loc);
      const priority = typeof u.priority === 'string' ? parseFloat(u.priority) : u.priority;
      entries.push({
        url: u.loc,
        lastmod: u.lastmod,
        changefreq: u.changefreq,
        priority: typeof priority === 'number' && Number.isFinite(priority) ? priority : undefined,
      });
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
      const text = (await readBoundedText(res)) ?? '';
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
