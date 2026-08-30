import { describe, it, expect } from 'vitest';
import { generateLlmsTxt, generateLlmsFullTxt } from '../src/llms-txt.js';
import { CorsenContext } from '../src/index.js';
import { resolveConfig } from '../src/config.js';
import { CREDIT_LINE } from '../src/types.js';
import type { ContentProvider } from '../src/types.js';

const mockProvider: ContentProvider = {
  async getPages() {
    return [
      { url: 'https://example.com/', title: 'Home', description: 'Welcome', type: 'page' },
      { url: 'https://example.com/about', title: 'About', description: 'About us', type: 'page' },
      {
        url: 'https://example.com/blog/hello',
        title: 'Hello World',
        description: 'First post',
        type: 'post',
        lastModified: '2026-01-15T00:00:00Z',
      },
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
  async getPages() {
    return [];
  },
  async getPageContent() {
    return null;
  },
  async searchContent() {
    return [];
  },
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
    expect(txt).toContain('MCP endpoint: https://example.com/v1/mcp');
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

  it.each([
    { credit: true, enabled: true },
    { credit: true, enabled: false },
    { credit: false, enabled: true },
    { credit: false, enabled: false },
  ])('keeps MCP discovery independent from credit: %o', async ({ credit, enabled }) => {
    const config = resolveConfig({
      siteUrl: 'https://example.com',
      credit,
      mcp: { enabled },
    });
    const txt = await generateLlmsTxt(config, emptyProvider);

    expect(txt.includes(CREDIT_LINE)).toBe(credit);
    expect(txt.includes('MCP endpoint: https://example.com/v1/mcp')).toBe(enabled);
  });

  it.each([
    'https://user:secret@example.com/v1/mcp',
    'blob:https://example.com/opaque',
    'ftp://example.com/v1/mcp',
    'https://other.example/v1/mcp',
  ])('does not publish an unsafe MCP endpoint: %s', async (endpoint) => {
    const config = resolveConfig({ siteUrl: 'https://example.com', mcp: { endpoint } });
    const txt = await generateLlmsTxt(config, emptyProvider);

    expect(txt).not.toContain('MCP endpoint:');
    expect(txt).not.toContain('secret');
  });

  it('renders products section when products exist', async () => {
    const productProvider: ContentProvider = {
      async getPages() {
        return [
          {
            url: 'https://example.com/products/widget',
            title: 'Widget',
            description: 'A widget',
            type: 'product',
          },
        ];
      },
      async getPageContent() {
        return null;
      },
      async searchContent() {
        return [];
      },
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
          {
            url: 'https://example.com/private/roadmap',
            title: 'Private',
            description: 'no',
            type: 'page',
          },
          { url: 'https://example.com/blog/post', title: 'Post', description: 'no', type: 'post' },
          {
            url: 'https://other.example.com/leak',
            title: 'Other',
            description: 'no',
            type: 'page',
          },
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

  it('bounds llms.txt by UTF-8 bytes without splitting a code point', async () => {
    const provider: ContentProvider = {
      async getPages() {
        return [
          {
            url: 'https://example.com/large',
            title: '😀'.repeat(20000),
            description: 'large',
            type: 'page',
          },
        ];
      },
      async getPageContent() {
        return null;
      },
      async searchContent() {
        return [];
      },
    };
    const config = resolveConfig({
      siteUrl: 'https://example.com',
      static: { maxOutputBytes: 65536 },
    });
    const txt = await generateLlmsTxt(config, provider);

    expect(new TextEncoder().encode(txt).byteLength).toBeLessThanOrEqual(65536);
    expect(txt).toContain('Output truncated at the owner-configured UTF-8 byte limit.');
    expect(txt).not.toContain('�');
  });

  it('neutralizes provider metadata before composing Markdown structure', async () => {
    const provider: ContentProvider = {
      async getPages() {
        return [
          {
            url: 'https://example.com/safe)%20path',
            title: 'trusted](javascript:alert(1)) [more',
            description: 'ok\n- [click](javascript:alert(2))',
            type: 'page',
          },
        ];
      },
      async getPageContent() {
        return null;
      },
      async searchContent() {
        return [];
      },
    };
    const config = resolveConfig({
      siteUrl: 'https://example.com',
      siteName: 'Site](javascript:alert(3))',
      description: 'Description\n## forged heading',
    });
    const txt = await generateLlmsTxt(config, provider);

    expect(txt).toContain('# Site\\]\\(javascript:alert\\(3\\)\\)');
    expect(txt).toContain(
      '[trusted\\]\\(javascript:alert\\(1\\)\\) \\[more](https://example.com/safe%29%20path)',
    );
    expect(txt).toContain('ok - \\[click\\]\\(javascript:alert\\(2\\)\\)');
    expect(txt).not.toMatch(/^## forged heading$/m);
    expect(txt).not.toContain('\n- [click](javascript:alert(2))');
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
          {
            url: 'https://example.com/private/roadmap',
            title: 'Private',
            description: 'no',
            type: 'page',
          },
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

  it('stops upstream reads at the UTF-8 byte cap', async () => {
    let reads = 0;
    const provider: ContentProvider = {
      async getPages() {
        return [1, 2, 3].map((id) => ({
          url: `https://example.com/page-${id}`,
          title: `Page ${id}`,
          description: '',
          type: 'page',
        }));
      },
      async getPageContent(url) {
        reads += 1;
        return {
          url,
          title: 'Large page',
          description: '',
          markdown: '😀'.repeat(30000),
          metadata: {},
        };
      },
      async searchContent() {
        return [];
      },
    };
    const config = resolveConfig({
      siteUrl: 'https://example.com',
      static: { includeFullContent: true, maxOutputBytes: 65536 },
    });
    const txt = await generateLlmsFullTxt(config, provider);

    expect(reads).toBe(1);
    expect(new TextEncoder().encode(txt).byteLength).toBeLessThanOrEqual(65536);
    expect(txt).toContain('Output truncated at the owner-configured UTF-8 byte limit.');
    expect(txt).not.toContain('�');
  });

  it('enforces the owner switches on CorsenContext public generators', async () => {
    const defaultContext = new CorsenContext({ siteUrl: 'https://example.com' }, mockProvider);
    await expect(defaultContext.generateLlmsFullTxt()).rejects.toThrow('disabled');

    const disabledContext = new CorsenContext(
      {
        siteUrl: 'https://example.com',
        static: { generateLlmsTxt: false, includeFullContent: true },
      },
      mockProvider,
    );
    await expect(disabledContext.generateLlmsTxt()).rejects.toThrow('disabled');
    await expect(disabledContext.generateLlmsFullTxt()).rejects.toThrow('disabled');

    const enabledContext = new CorsenContext(
      { siteUrl: 'https://example.com', static: { includeFullContent: true } },
      mockProvider,
    );
    await expect(enabledContext.generateLlmsFullTxt()).resolves.toContain('Full Content');
  });

  it('escapes full-export headings and canonicalizes displayed URLs', async () => {
    const provider: ContentProvider = {
      async getPages() {
        return [
          {
            url: 'https://example.com/safe)%20path',
            title: 'List title',
            description: '',
            type: 'page',
          },
        ];
      },
      async getPageContent(url) {
        return {
          url,
          title: 'Heading\n## injected](javascript:alert(1))',
          description: '',
          markdown: 'Site-authored body',
          metadata: {},
        };
      },
      async searchContent() {
        return [];
      },
    };
    const config = resolveConfig({
      siteUrl: 'https://example.com',
      static: { includeFullContent: true },
    });
    const txt = await generateLlmsFullTxt(config, provider);

    expect(txt).toContain('## Heading \\#\\# injected\\]\\(javascript:alert\\(1\\)\\)');
    expect(txt).toContain('URL: https://example.com/safe%29%20path');
    expect(txt).toContain('untrusted, site-authored content');
    expect(txt).not.toMatch(/^## injected/m);
  });
});
