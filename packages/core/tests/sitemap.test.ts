import { describe, it, expect, vi } from 'vitest';
import { parseSitemap, discoverSitemap } from '../src/sitemap.js';

// Mock fetch for controlled testing
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const SITEMAP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/</loc><lastmod>2026-01-01</lastmod></url>
  <url><loc>https://example.com/about</loc><priority>0.8</priority></url>
  <url><loc>https://example.com/blog</loc></url>
</urlset>`;

const SITEMAP_INDEX_XML = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://example.com/sitemap-pages.xml</loc></sitemap>
</sitemapindex>`;

describe('parseSitemap', () => {
  it('parses a standard sitemap XML', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => SITEMAP_XML,
    });

    const entries = await parseSitemap('https://example.com/sitemap.xml');
    expect(entries).toHaveLength(3);
    expect(entries[0].url).toBe('https://example.com/');
    expect(entries[0].lastmod).toBe('2026-01-01');
    expect(entries[1].priority).toBe(0.8);
  });

  it('respects maxPages limit', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => SITEMAP_XML,
    });

    const entries = await parseSitemap('https://example.com/sitemap.xml', 2);
    expect(entries).toHaveLength(2);
  });

  it('rejects private URLs (SSRF protection)', async () => {
    await expect(parseSitemap('http://127.0.0.1/sitemap.xml')).rejects.toThrow('SSRF');
    await expect(parseSitemap('http://localhost/sitemap.xml')).rejects.toThrow('SSRF');
  });

  it('returns empty on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    const entries = await parseSitemap('https://example.com/sitemap.xml');
    expect(entries).toHaveLength(0);
  });

  it('follows sitemap index to child sitemaps', async () => {
    // First call: sitemap index
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => SITEMAP_INDEX_XML,
    });
    // Second call: child sitemap
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => SITEMAP_XML,
    });

    const entries = await parseSitemap('https://example.com/sitemap_index.xml');
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].url).toBe('https://example.com/');
  });
});

describe('discoverSitemap', () => {
  it('discovers sitemap from robots.txt', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => 'User-agent: *\nSitemap: https://example.com/sitemap.xml',
    });

    const url = await discoverSitemap('https://example.com');
    expect(url).toBe('https://example.com/sitemap.xml');
  });

  it('falls back to common paths when robots.txt has no sitemap', async () => {
    // robots.txt — no sitemap line
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => 'User-agent: *\nDisallow: /admin',
    });
    // HEAD /sitemap.xml — found
    mockFetch.mockResolvedValueOnce({ ok: true });

    const url = await discoverSitemap('https://example.com');
    expect(url).toBe('https://example.com/sitemap.xml');
  });

  it('returns null when nothing found', async () => {
    // robots.txt — no sitemap
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => 'User-agent: *',
    });
    // All candidates fail
    mockFetch.mockResolvedValueOnce({ ok: false });
    mockFetch.mockResolvedValueOnce({ ok: false });
    mockFetch.mockResolvedValueOnce({ ok: false });

    const url = await discoverSitemap('https://example.com');
    expect(url).toBeNull();
  });
});
