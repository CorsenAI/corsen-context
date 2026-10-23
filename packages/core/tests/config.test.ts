import { describe, it, expect } from 'vitest';
import { resolveConfig, corsenContextConfigSchema } from '../src/config.js';

describe('Config', () => {
  it('resolves minimal config with defaults', () => {
    const config = resolveConfig({ siteUrl: 'https://example.com' });

    expect(config.siteUrl).toBe('https://example.com');
    expect(config.mcp.enabled).toBe(true);
    expect(config.mcp.endpoint).toBe('/v1/mcp');
    expect(config.static.generateLlmsTxt).toBe(true);
    expect(config.static.includeFullContent).toBe(false);
    expect(config.static.maxOutputBytes).toBe(5 * 1024 * 1024);
    expect(config.security.rateLimit).toBe(100);
    expect(config.cache.enabled).toBe(true);
    expect(config.cache.ttl).toBe(3600);
    expect(config.credit).toBe(true);
    expect(config.content.maxPages).toBe(500);
    expect(config.content.excludePaths).toEqual([]);
  });

  it('overrides defaults with provided values', () => {
    const config = resolveConfig({
      siteUrl: 'https://mysite.com',
      siteName: 'My Site',
      description: 'A test site',
      security: { rateLimit: 50 },
      cache: { ttl: 600, driver: 'memory' },
      credit: false,
    });

    expect(config.siteName).toBe('My Site');
    expect(config.security.rateLimit).toBe(50);
    expect(config.cache.ttl).toBe(600);
    expect(config.credit).toBe(false);
  });

  it('uses CORSEN_CONTEXT_API_KEY when security.apiKey is not provided', () => {
    const previous = process.env.CORSEN_CONTEXT_API_KEY;
    process.env.CORSEN_CONTEXT_API_KEY = 'env-secret';

    const config = resolveConfig({ siteUrl: 'https://example.com' });

    expect(config.security.apiKey).toBe('env-secret');

    if (previous === undefined) {
      delete process.env.CORSEN_CONTEXT_API_KEY;
    } else {
      process.env.CORSEN_CONTEXT_API_KEY = previous;
    }
  });

  it('rejects invalid siteUrl', () => {
    expect(() => resolveConfig({ siteUrl: 'not-a-url' })).toThrow();
  });

  it('requires an http(s) siteUrl without embedded credentials', () => {
    expect(() => resolveConfig({ siteUrl: 'ftp://example.com' })).toThrow(/http\(s\)/);
    expect(() => resolveConfig({ siteUrl: 'javascript:alert(1)' })).toThrow();
    expect(() => resolveConfig({ siteUrl: 'https://user:secret@example.com' })).toThrow(
      /credentials/,
    );
    expect(resolveConfig({ siteUrl: 'http://localhost:3000' }).siteUrl).toBe(
      'http://localhost:3000',
    );
  });

  it('accepts only the three known forwarding headers as clientIpHeader', () => {
    for (const header of ['cf-connecting-ip', 'x-real-ip', 'x-forwarded-for'] as const) {
      const config = resolveConfig({
        siteUrl: 'https://example.com',
        security: { trustProxy: true, clientIpHeader: header },
      });
      expect(config.security.clientIpHeader).toBe(header);
    }
    expect(resolveConfig({ siteUrl: 'https://example.com' }).security.clientIpHeader).toBe(
      undefined,
    );
    expect(() =>
      resolveConfig({
        siteUrl: 'https://example.com',
        // @ts-expect-error unknown header names are rejected at runtime too
        security: { clientIpHeader: 'x-client-ip' },
      }),
    ).toThrow();
  });

  it('rejects negative rate limit', () => {
    expect(() =>
      resolveConfig({ siteUrl: 'https://example.com', security: { rateLimit: -1 } }),
    ).toThrow();
  });

  it('bounds static corpus size and output bytes', () => {
    expect(() =>
      resolveConfig({ siteUrl: 'https://example.com', content: { maxPages: 5001 } }),
    ).toThrow();
    expect(() =>
      resolveConfig({ siteUrl: 'https://example.com', static: { maxOutputBytes: 65535 } }),
    ).toThrow();
    expect(() =>
      resolveConfig({ siteUrl: 'https://example.com', static: { maxOutputBytes: 10485761 } }),
    ).toThrow();
  });
});
