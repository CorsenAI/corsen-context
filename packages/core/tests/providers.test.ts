import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSitemapProvider } from '../src/providers.js';
import { MAX_FETCH_BODY_BYTES } from '../src/http-body.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const ROBOTS = 'User-agent: *\nSitemap: https://example.com/sitemap.xml';
const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset>
  <url><loc>https://example.com/small</loc></url>
  <url><loc>https://example.com/huge</loc></url>
</urlset>`;
const SMALL_PAGE = '<html><head><title>Small</title></head><body><main>Hello</main></body></html>';

function respond(url: string) {
  if (url.endsWith('/robots.txt')) return { ok: true, text: async () => ROBOTS };
  if (url.endsWith('/sitemap.xml')) return { ok: true, text: async () => SITEMAP };
  if (url.endsWith('/huge')) {
    return { ok: true, text: async () => 'x'.repeat(MAX_FETCH_BODY_BYTES + 1) };
  }
  return { ok: true, text: async () => SMALL_PAGE };
}

describe('createSitemapProvider', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockImplementation(async (url: string) => respond(url));
  });

  it('skips pages whose body exceeds the shared byte budget', async () => {
    const provider = createSitemapProvider('https://example.com');
    const pages = await provider.getPages();
    expect(pages.map((page) => page.url)).toEqual(['https://example.com/small']);
    expect(pages[0].title).toBe('Small');

    expect(await provider.getPageContent('https://example.com/huge')).toBeNull();
    const small = await provider.getPageContent('https://example.com/small');
    expect(small?.markdown).toContain('Hello');
  });

  it('coalesces concurrent first loads into one crawl', async () => {
    const provider = createSitemapProvider('https://example.com');
    const [a, b] = await Promise.all([provider.getPages(), provider.getPages()]);
    expect(a).toEqual(b);
    const robotsFetches = mockFetch.mock.calls.filter(([url]) =>
      String(url).endsWith('/robots.txt'),
    );
    expect(robotsFetches).toHaveLength(1);
    await provider.getPages();
    expect(
      mockFetch.mock.calls.filter(([url]) => String(url).endsWith('/robots.txt')),
    ).toHaveLength(1);
  });

  it('retries the crawl after a failed load instead of caching the rejection', async () => {
    // A sitemap on a private address makes parseSitemap throw, so the whole
    // crawl rejects. The provider must forget that rejection and crawl again.
    let robots = 'User-agent: *\nSitemap: http://127.0.0.1/sitemap.xml';
    mockFetch.mockImplementation(async (url: string) =>
      url.endsWith('/robots.txt') ? { ok: true, text: async () => robots } : respond(url),
    );
    const provider = createSitemapProvider('https://example.com');
    await expect(provider.getPages()).rejects.toThrow('SSRF');

    robots = ROBOTS;
    const pages = await provider.getPages();
    expect(pages.map((page) => page.url)).toEqual(['https://example.com/small']);
  });
});
