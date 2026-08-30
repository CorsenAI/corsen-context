import { describe, it, expect } from 'vitest';
import { resolveConfig } from '../src/config.js';
import {
  resolvePublicPageUrl,
  isPublicListItem,
  filterPublicPages,
  filterPublicSearchResults,
} from '../src/content-policy.js';

const config = resolveConfig({
  siteUrl: 'https://example.com',
  content: {
    postTypes: ['page', 'post'],
    excludePaths: ['/admin', '/cart', '/private'],
    maxPages: 100,
  },
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
    expect(resolvePublicPageUrl('blob:https://example.com/id', config)).toBeNull();
    expect(resolvePublicPageUrl('ftp://example.com/file', config)).toBeNull();
  });

  it('rejects URLs containing credentials', () => {
    expect(resolvePublicPageUrl('https://user:secret@example.com/about', config)).toBeNull();
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

  it('rejects ambiguous separators before downstream URL canonicalization', () => {
    expect(resolvePublicPageUrl('https://example.com/%5cadmin', config)).toBeNull();
    expect(resolvePublicPageUrl('https://example.com/private//area', config)).toBeNull();
    expect(resolvePublicPageUrl('resource://private//area', config)).toBeNull();
    expect(resolvePublicPageUrl('https://example.com/private\\area', config)).toBeNull();
  });

  it('rejects literal, encoded, and double-encoded dot segments', () => {
    const bypasses = [
      'https://example.com/private/../public',
      'https://example.com/private/%2e%2e/public',
      'https://example.com/private/%252e%252e/public',
      'https://example.com/%252e/admin',
    ];
    for (const bypass of bypasses) {
      expect(resolvePublicPageUrl(bypass, config), bypass).toBeNull();
    }
  });

  it('rejects decoded controls and encoded query or fragment delimiters', () => {
    for (const bypass of [
      'https://example.com/%00admin',
      'https://example.com/%2500admin',
      'https://example.com/admin%3fpublic',
      'https://example.com/admin%2523public',
    ]) {
      expect(resolvePublicPageUrl(bypass, config), bypass).toBeNull();
    }

    expect(resolvePublicPageUrl('/about?view=full#details', config)).toBe(
      'https://example.com/about?view=full#details',
    );
  });
});

describe('filterPublicPages / isPublicListItem', () => {
  it('drops disallowed types, excluded paths, and cross-origin items', () => {
    const pages = [
      { url: 'https://example.com/', title: 'Home', description: '', type: 'page' },
      { url: 'https://example.com/admin', title: 'Admin', description: '', type: 'page' },
      { url: 'https://example.com/thing', title: 'Thing', description: '', type: 'secret' },
      { url: 'https://evil.com/x', title: 'Evil', description: '', type: 'page' },
      {
        url: 'https://example.com/private/%252e%252e/public',
        title: 'Canonicalization bypass',
        description: '',
        type: 'page',
      },
      {
        url: 'https://example.com/private//area',
        title: 'Repeated separator',
        description: '',
        type: 'page',
      },
    ];
    const result = filterPublicPages(pages, config).map((p) => p.url);
    expect(result).toEqual(['https://example.com/']);
  });

  it('rejects a disallowed type via isPublicListItem', () => {
    expect(
      isPublicListItem(
        { url: 'https://example.com/x', title: 'x', description: '', type: 'secret' },
        config,
      ),
    ).toBe(false);
  });

  it('applies the same credential and protocol policy to search results', () => {
    const results = filterPublicSearchResults(
      [
        {
          url: 'https://example.com/public',
          title: 'Public',
          description: '',
          snippet: '',
          score: 1,
        },
        {
          url: 'https://user:secret@example.com/private',
          title: 'Credentials',
          description: '',
          snippet: '',
          score: 1,
        },
        {
          url: 'blob:https://example.com/opaque',
          title: 'Blob',
          description: '',
          snippet: '',
          score: 1,
        },
      ],
      config,
      10,
    );

    expect(results.map((result) => result.title)).toEqual(['Public']);
  });
});
