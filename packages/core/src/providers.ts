import type {
  ContentProvider,
  ContentListItem,
  PageContent,
  SearchResult,
} from './types.js';
import { safeFetch, isPrivateUrl } from './security.js';
import { discoverSitemap, parseSitemap } from './sitemap.js';
import { htmlToMarkdown, extractMetadata } from './converter.js';

/** A page for the in-memory provider — a PageContent plus an optional content type. */
export interface InMemoryPage extends PageContent {
  type?: string;
}

function makeSnippet(text: string, query: string): string {
  const haystack = text.toLowerCase();
  const idx = haystack.indexOf(query.toLowerCase());
  if (idx === -1) return text.slice(0, 200).trim();
  const start = Math.max(0, idx - 80);
  return text.slice(start, start + 200).trim();
}

/**
 * Batteries-included provider backed by an in-memory array of pages.
 *
 * Ideal for static sites, markdown-file blogs, or tests: pass your pages and
 * you get getPages/getPageContent plus a simple case-insensitive full-text
 * search for free — no need to hand-write the ContentProvider interface.
 */
export function createInMemoryProvider(pages: InMemoryPage[]): ContentProvider {
  const byUrl = new Map(pages.map((p) => [p.url, p]));

  return {
    async getPages(): Promise<ContentListItem[]> {
      return pages.map((p) => ({
        url: p.url,
        title: p.title,
        description: p.description,
        type: p.type || 'page',
        lastModified: p.lastModified,
      }));
    },

    async getPageContent(url: string): Promise<PageContent | null> {
      return byUrl.get(url) ?? null;
    },

    async searchContent(query: string, limit: number): Promise<SearchResult[]> {
      const q = query.toLowerCase();
      const results: SearchResult[] = [];
      for (const p of pages) {
        const haystack = `${p.title}\n${p.description}\n${p.markdown}`.toLowerCase();
        if (!haystack.includes(q)) continue;
        results.push({
          url: p.url,
          title: p.title,
          description: p.description,
          snippet: makeSnippet(p.markdown || p.description || '', query),
          score: 1,
        });
        if (results.length >= limit) break;
      }
      return results;
    },
  };
}

/**
 * Provider that fetches a live site's pages via its sitemap and converts each
 * page to clean markdown on demand. SSRF-safe (uses safeFetch + isPrivateUrl).
 * Search is unsupported (returns []) since there is no index to query.
 */
export function createSitemapProvider(
  siteUrl: string,
  options?: { maxPages?: number },
): ContentProvider {
  const maxPages = options?.maxPages ?? 100;
  let pagesCache: ContentListItem[] | null = null;

  async function loadPages(): Promise<ContentListItem[]> {
    if (pagesCache) return pagesCache;
    const sitemapUrl = await discoverSitemap(siteUrl);
    if (!sitemapUrl) {
      pagesCache = [];
      return pagesCache;
    }
    const entries = await parseSitemap(sitemapUrl, maxPages);
    const pages: ContentListItem[] = [];
    for (const entry of entries) {
      try {
        const res = await safeFetch(entry.url, { timeout: 10000 });
        if (!res.ok) continue;
        const meta = extractMetadata(await res.text());
        pages.push({
          url: entry.url,
          title: meta.title || entry.url,
          description: meta.description || '',
          type: meta['og:type'] === 'article' ? 'post' : 'page',
          lastModified: meta.modified || meta.published,
        });
      } catch {
        continue;
      }
    }
    pagesCache = pages;
    return pages;
  }

  return {
    async getPages(): Promise<ContentListItem[]> {
      return loadPages();
    },

    async getPageContent(url: string): Promise<PageContent | null> {
      if (await isPrivateUrl(url)) return null;
      try {
        const res = await safeFetch(url, { timeout: 10000 });
        if (!res.ok) return null;
        const html = await res.text();
        const meta = extractMetadata(html);
        return {
          url,
          title: meta.title || url,
          description: meta.description || '',
          markdown: htmlToMarkdown(html),
          lastModified: meta.modified || meta.published,
          metadata: meta,
        };
      } catch {
        return null;
      }
    },

    async searchContent(): Promise<SearchResult[]> {
      return [];
    },
  };
}
