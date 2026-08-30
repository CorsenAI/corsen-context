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

/** XML bomb protection: hard cap on sitemap response body (5 MB). */
const MAX_SITEMAP_SIZE = 5 * 1024 * 1024;

export async function parseSitemap(
  sitemapUrl: string,
  maxPages: number = 500,
): Promise<SitemapEntry[]> {
  if (await isPrivateUrl(sitemapUrl)) {
    throw new Error('SSRF protection: cannot fetch private/internal URLs');
  }

  const entries: SitemapEntry[] = [];
  const seen = new Set<string>();
  await fetchAndParseSitemap(sitemapUrl, entries, seen, maxPages, 0);
  return entries.slice(0, maxPages);
}

/**
 * Read a response body but abort once MAX_SITEMAP_SIZE bytes have been
 * consumed, so a chunked (Content-Length-less) response can't be buffered
 * unbounded. Returns null when the cap is exceeded.
 */
async function readBounded(response: Response): Promise<string | null> {
  const contentLength = response.headers?.get?.('content-length');
  if (contentLength && parseInt(contentLength, 10) > MAX_SITEMAP_SIZE) {
    return null;
  }

  const body = response.body;
  if (!body || typeof body.getReader !== 'function') {
    // No stream available (e.g. a mocked Response) — fall back to text() with a
    // post-read length guard.
    const text = await response.text();
    return text.length > MAX_SITEMAP_SIZE ? null : text;
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > MAX_SITEMAP_SIZE) {
          await reader.cancel();
          return null;
        }
        chunks.push(value);
      }
    }
  } catch {
    return null;
  }

  return new TextDecoder().decode(concatChunks(chunks, total));
}

function concatChunks(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

async function fetchAndParseSitemap(
  url: string,
  entries: SitemapEntry[],
  seen: Set<string>,
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

  const xml = await readBounded(response);
  if (xml === null) return;
  const parsed = parser.parse(xml);

  // Sitemap index (contains other sitemaps)
  if (parsed.sitemapindex?.sitemap) {
    const sitemaps: SitemapXmlIndex[] = Array.isArray(parsed.sitemapindex.sitemap)
      ? parsed.sitemapindex.sitemap
      : [parsed.sitemapindex.sitemap];

    for (const sm of sitemaps) {
      if (entries.length >= maxPages) break;
      if (sm.loc) {
        await fetchAndParseSitemap(sm.loc, entries, seen, maxPages, depth + 1);
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
