import { describe, it, expect } from 'vitest';
import { resolveConfig, corsenContextConfigSchema } from '../src/config.js';

describe('Config', () => {
  it('resolves minimal config with defaults', () => {
    const config = resolveConfig({ siteUrl: 'https://example.com' });

    expect(config.siteUrl).toBe('https://example.com');
    expect(config.mcp.enabled).toBe(true);
    expect(config.mcp.endpoint).toBe('/v1/mcp');
    expect(config.static.generateLlmsTxt).toBe(true);
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

  it('rejects negative rate limit', () => {
    expect(() =>
      resolveConfig({ siteUrl: 'https://example.com', security: { rateLimit: -1 } }),
    ).toThrow();
  });
});
