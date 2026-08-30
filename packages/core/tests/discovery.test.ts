import { describe, expect, it } from 'vitest';
import { generateRobotsTxt, generateWellKnownMcp, mcpLinkTag } from '../src/discovery.js';

describe('discovery URL policy', () => {
  it('normalizes safe same-origin discovery outputs', () => {
    const config = {
      siteUrl: 'https://example.com',
      mcpEndpoint: '/v1/mcp?mode=a&source=b',
      sitemapUrl: '/sitemap.xml',
    };

    expect(generateRobotsTxt(config)).toBe(
      'MCP: https://example.com/v1/mcp?mode=a&source=b\n' +
        'Sitemap: https://example.com/sitemap.xml\n',
    );
    expect(generateWellKnownMcp(config).mcpEndpoint).toBe(
      'https://example.com/v1/mcp?mode=a&source=b',
    );
    expect(mcpLinkTag(config)).toBe(
      '<link rel="mcp" href="https://example.com/v1/mcp?mode=a&amp;source=b" />',
    );
  });

  it.each([
    'https://user:secret@example.com/v1/mcp',
    'https://other.example/v1/mcp',
    'blob:https://example.com/opaque',
    '/v1/mcp\nDisallow: /',
  ])('rejects an unsafe MCP endpoint: %s', (mcpEndpoint) => {
    const config = { siteUrl: 'https://example.com', mcpEndpoint };

    expect(() => generateRobotsTxt(config)).toThrow();
    expect(() => generateWellKnownMcp(config)).toThrow();
    expect(() => mcpLinkTag(config)).toThrow();
  });

  it('normalizes quote-bearing paths without creating HTML attributes', () => {
    const tag = mcpLinkTag({
      siteUrl: 'https://example.com',
      mcpEndpoint: '/v1/" autofocus onfocus=alert(1) x="',
    });

    expect(tag).not.toMatch(/\sautofocus(?:\s|=)/i);
    expect(tag).not.toMatch(/\sonfocus(?:\s|=)/i);
    expect(tag.match(/href=/g)).toHaveLength(1);
  });

  it.each([
    'https://user:secret@example.com/sitemap.xml',
    'https://other.example/sitemap.xml',
    'file:///tmp/sitemap.xml',
    '/sitemap.xml\r\nDisallow: /',
  ])('rejects an unsafe sitemap URL: %s', (sitemapUrl) => {
    expect(() => generateRobotsTxt({ siteUrl: 'https://example.com', sitemapUrl })).toThrow();
  });
});
