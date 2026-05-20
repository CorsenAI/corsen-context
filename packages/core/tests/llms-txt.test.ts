import { describe, it, expect } from 'vitest';
import { generateLlmsTxt, generateLlmsFullTxt } from '../src/llms-txt.js';
import { resolveConfig } from '../src/config.js';
import { CREDIT_LINE } from '../src/types.js';
import type { ContentProvider } from '../src/types.js';

const mockProvider: ContentProvider = {
  async getPages() {
    return [
      { url: 'https://example.com/', title: 'Home', description: 'Welcome', type: 'page' },
      { url: 'https://example.com/about', title: 'About', description: 'About us', type: 'page' },
      { url: 'https://example.com/blog/hello', title: 'Hello World', description: 'First post', type: 'post', lastModified: '2026-01-15T00:00:00Z' },
    ];
  },
  async getPageContent(url) {
    return { url, title: 'Test', description: 'Desc', markdown: '# Test content', metadata: {} };
  },
  async searchContent() {
    return [];
  },
};

const emptyProvider: ContentProvider = {
  async getPages() { return []; },
  async getPageContent() { return null; },
  async searchContent() { return []; },
};

describe('generateLlmsTxt', () => {
  it('includes site name as header', async () => {
    const config = resolveConfig({ siteUrl: 'https://example.com', siteName: 'My Site' });
    const txt = await generateLlmsTxt(config, mockProvider);
    expect(txt).toContain('# My Site');
  });

  it('falls back to hostname when no siteName', async () => {
    const config = resolveConfig({ siteUrl: 'https://example.com' });
    const txt = await generateLlmsTxt(config, mockProvider);
    expect(txt).toContain('# example.com');
  });

  it('includes description when set', async () => {
    const config = resolveConfig({ siteUrl: 'https://example.com', description: 'A test site' });
    const txt = await generateLlmsTxt(config, mockProvider);
    expect(txt).toContain('> A test site');
  });

  it('groups pages by type with correct sections', async () => {
    const config = resolveConfig({ siteUrl: 'https://example.com' });
    const txt = await generateLlmsTxt(config, mockProvider);
    expect(txt).toContain('## Main Pages');
    expect(txt).toContain('## Blog & Content');
    expect(txt).toContain('[Home](https://example.com/)');
    expect(txt).toContain('[Hello World](https://example.com/blog/hello)');
  });

  it('includes credit line by default', async () => {
    const config = resolveConfig({ siteUrl: 'https://example.com' });
    const txt = await generateLlmsTxt(config, mockProvider);
    expect(txt).toContain(CREDIT_LINE);
  });

  it('omits credit line when credit: false', async () => {
    const config = resolveConfig({ siteUrl: 'https://example.com', credit: false });
    const txt = await generateLlmsTxt(config, mockProvider);
    expect(txt).not.toContain(CREDIT_LINE);
  });

  it('includes MCP endpoint when enabled', async () => {
    const config = resolveConfig({ siteUrl: 'https://example.com' });
    const txt = await generateLlmsTxt(config, mockProvider);
    expect(txt).toContain('https://example.com/v1/mcp');
  });

  it('handles empty pages gracefully', async () => {
    const config = resolveConfig({ siteUrl: 'https://example.com' });
    const txt = await generateLlmsTxt(config, emptyProvider);
    expect(txt).toContain('# example.com');
    expect(txt).not.toContain('## Main Pages');
    expect(txt).not.toContain('## Blog');
  });

  it('includes About section', async () => {
    const config = resolveConfig({ siteUrl: 'https://example.com' });
    const txt = await generateLlmsTxt(config, mockProvider);
    expect(txt).toContain('## About this AI Context File');
  });

  it('includes lastModified date for blog posts', async () => {
    const config = resolveConfig({ siteUrl: 'https://example.com' });
    const txt = await generateLlmsTxt(config, mockProvider);
    expect(txt).toContain('2026-01-15');
  });

  it('omits MCP endpoint when mcp disabled', async () => {
    const config = resolveConfig({ siteUrl: 'https://example.com', mcp: { enabled: false } });
    const txt = await generateLlmsTxt(config, mockProvider);
    expect(txt).not.toContain('/v1/mcp');
  });

  it('renders products section when products exist', async () => {
    const productProvider: ContentProvider = {
      async getPages() {
        return [
          { url: 'https://example.com/products/widget', title: 'Widget', description: 'A widget', type: 'product' },
        ];
      },
      async getPageContent() { return null; },
      async searchContent() { return []; },
    };
    const config = resolveConfig({
      siteUrl: 'https://example.com',
      content: { postTypes: ['product'] },
    });
    const txt = await generateLlmsTxt(config, productProvider);
    expect(txt).toContain('## Products / Services');
    expect(txt).toContain('[Widget]');
  });

  it('filters excluded paths, disallowed types, and cross-origin pages', async () => {
    const provider: ContentProvider = {
      async getPages() {
        return [
          { url: 'https://example.com/public', title: 'Public', description: 'ok', type: 'page' },
          { url: 'https://example.com/private/roadmap', title: 'Private', description: 'no', type: 'page' },
          { url: 'https://example.com/blog/post', title: 'Post', description: 'no', type: 'post' },
          { url: 'https://other.example.com/leak', title: 'Other', description: 'no', type: 'page' },
        ];
      },
      async getPageContent(url) {
        return { url, title: 'Loaded', description: '', markdown: `# ${url}`, metadata: {} };
      },
      async searchContent() {
        return [];
      },
    };

    const config = resolveConfig({
      siteUrl: 'https://example.com',
      content: { postTypes: ['page'], excludePaths: ['/private'], maxPages: 10 },
    });
    const txt = await generateLlmsTxt(config, provider);

    expect(txt).toContain('[Public](https://example.com/public)');
    expect(txt).not.toContain('Private');
    expect(txt).not.toContain('Post');
    expect(txt).not.toContain('Other');
  });
});

describe('generateLlmsFullTxt', () => {
  it('includes full markdown content for each page', async () => {
    const config = resolveConfig({ siteUrl: 'https://example.com' });
    const txt = await generateLlmsFullTxt(config, mockProvider);
    expect(txt).toContain('# Test content');
    expect(txt).toContain('URL: https://example.com/');
  });

  it('includes credit line', async () => {
    const config = resolveConfig({ siteUrl: 'https://example.com' });
    const txt = await generateLlmsFullTxt(config, mockProvider);
    expect(txt).toContain(CREDIT_LINE);
  });

  it('handles empty pages', async () => {
    const config = resolveConfig({ siteUrl: 'https://example.com' });
    const txt = await generateLlmsFullTxt(config, emptyProvider);
    expect(txt).toContain('Full Content');
    expect(txt).not.toContain('URL:');
  });

  it('omits credit line when credit: false', async () => {
    const config = resolveConfig({ siteUrl: 'https://example.com', credit: false });
    const txt = await generateLlmsFullTxt(config, mockProvider);
    expect(txt).not.toContain(CREDIT_LINE);
  });

  it('omits excluded full content', async () => {
    const provider: ContentProvider = {
      async getPages() {
        return [
          { url: 'https://example.com/public', title: 'Public', description: 'ok', type: 'page' },
          { url: 'https://example.com/private/roadmap', title: 'Private', description: 'no', type: 'page' },
        ];
      },
      async getPageContent(url) {
        return { url, title: 'Loaded', description: '', markdown: `# ${url}`, metadata: {} };
      },
      async searchContent() {
        return [];
      },
    };
    const config = resolveConfig({
      siteUrl: 'https://example.com',
      content: { excludePaths: ['/private'] },
    });
    const txt = await generateLlmsFullTxt(config, provider);

    expect(txt).toContain('# https://example.com/public');
    expect(txt).not.toContain('private/roadmap');
  });
});
