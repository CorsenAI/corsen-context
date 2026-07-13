import { describe, it, expect } from 'vitest';
import { resolveConfig } from '../src/config.js';
import {
  resolvePublicPageUrl,
  isPublicListItem,
  filterPublicPages,
} from '../src/content-policy.js';

const config = resolveConfig({
  siteUrl: 'https://example.com',
  content: { postTypes: ['page', 'post'], excludePaths: ['/admin', '/cart'], maxPages: 100 },
});

describe('resolvePublicPageUrl', () => {
  it('accepts same-origin absolute URLs', () => {
    expect(resolvePublicPageUrl('https://example.com/about', config)).toBe(
      'https://example.com/about',
    );
  });

  it('accepts relative URLs by resolving against siteUrl', () => {
    expect(resolvePublicPageUrl('/about', config)).toBe('https://example.com/about');
  });

  it('accepts resource:// URIs', () => {
    expect(resolvePublicPageUrl('resource://about', config)).toBe('https://example.com/about');
  });

  it('rejects cross-origin URLs', () => {
    expect(resolvePublicPageUrl('https://evil.com/x', config)).toBeNull();
  });

  it('rejects non-http(s) schemes', () => {
    expect(resolvePublicPageUrl('javascript:alert(1)', config)).toBeNull();
    expect(resolvePublicPageUrl('file:///etc/passwd', config)).toBeNull();
  });

  it('rejects excluded paths', () => {
    expect(resolvePublicPageUrl('https://example.com/admin', config)).toBeNull();
    expect(resolvePublicPageUrl('https://example.com/admin/users', config)).toBeNull();
  });

  it('does not exclude paths that merely share a prefix segment', () => {
    // /administrator is not under /admin
    expect(resolvePublicPageUrl('https://example.com/administrator', config)).toBe(
      'https://example.com/administrator',
    );
  });

  it('blocks case-variant exclusion bypass', () => {
    expect(resolvePublicPageUrl('https://example.com/ADMIN', config)).toBeNull();
    expect(resolvePublicPageUrl('https://example.com/Admin/settings', config)).toBeNull();
  });

  it('blocks percent-encoded exclusion bypass', () => {
    // /%61dmin decodes to /admin
    expect(resolvePublicPageUrl('https://example.com/%61dmin', config)).toBeNull();
    // double-encoded /%2561dmin -> /%61dmin -> /admin
    expect(resolvePublicPageUrl('https://example.com/%2561dmin', config)).toBeNull();
  });
});

describe('filterPublicPages / isPublicListItem', () => {
  it('drops disallowed types, excluded paths, and cross-origin items', () => {
    const pages = [
      { url: 'https://example.com/', title: 'Home', description: '', type: 'page' },
      { url: 'https://example.com/admin', title: 'Admin', description: '', type: 'page' },
      { url: 'https://example.com/thing', title: 'Thing', description: '', type: 'secret' },
      { url: 'https://evil.com/x', title: 'Evil', description: '', type: 'page' },
    ];
    const result = filterPublicPages(pages, config).map((p) => p.url);
    expect(result).toEqual(['https://example.com/']);
  });

  it('rejects a disallowed type via isPublicListItem', () => {
    expect(
      isPublicListItem({ url: 'https://example.com/x', title: 'x', description: '', type: 'secret' }, config),
    ).toBe(false);
  });
});
