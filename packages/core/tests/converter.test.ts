import { describe, it, expect } from 'vitest';
import { htmlToMarkdown, extractMetadata } from '../src/converter.js';

describe('HTML to Markdown Converter', () => {
  it('converts basic HTML to markdown', () => {
    const html = '<html><body><h1>Hello</h1><p>World</p></body></html>';
    const md = htmlToMarkdown(html);
    expect(md).toContain('# Hello');
    expect(md).toContain('World');
  });

  it('removes nav, footer, header', () => {
    const html = `
      <html><body>
        <nav><a href="/">Home</a></nav>
        <main><h1>Content</h1><p>Body text</p></main>
        <footer>Copyright</footer>
      </body></html>
    `;
    const md = htmlToMarkdown(html);
    expect(md).toContain('Content');
    expect(md).toContain('Body text');
    expect(md).not.toContain('Copyright');
  });

  it('extracts content from main/article element', () => {
    const html = `
      <html><body>
        <div class="sidebar">Sidebar stuff</div>
        <article><h2>Article Title</h2><p>Article body</p></article>
      </body></html>
    `;
    const md = htmlToMarkdown(html);
    expect(md).toContain('Article Title');
    expect(md).toContain('Article body');
  });

  it('converts links', () => {
    const html = '<html><body><a href="https://example.com">Click here</a></body></html>';
    const md = htmlToMarkdown(html);
    expect(md).toContain('[Click here](https://example.com)');
  });

  it('converts lists', () => {
    const html = '<html><body><ul><li>One</li><li>Two</li></ul></body></html>';
    const md = htmlToMarkdown(html);
    expect(md).toMatch(/- +One/);
    expect(md).toMatch(/- +Two/);
  });
});

describe('Metadata Extraction', () => {
  it('extracts title and description', () => {
    const html = `
      <html>
        <head>
          <title>My Page</title>
          <meta name="description" content="A great page">
        </head>
        <body></body>
      </html>
    `;
    const meta = extractMetadata(html);
    expect(meta.title).toBe('My Page');
    expect(meta.description).toBe('A great page');
  });

  it('extracts Open Graph data', () => {
    const html = `
      <html>
        <head>
          <meta property="og:title" content="OG Title">
          <meta property="og:image" content="https://img.com/pic.jpg">
          <meta property="og:type" content="article">
        </head>
        <body></body>
      </html>
    `;
    const meta = extractMetadata(html);
    expect(meta['og:title']).toBe('OG Title');
    expect(meta['og:image']).toBe('https://img.com/pic.jpg');
    expect(meta['og:type']).toBe('article');
  });

  it('extracts canonical URL', () => {
    const html = `
      <html>
        <head><link rel="canonical" href="https://example.com/page"></head>
        <body></body>
      </html>
    `;
    const meta = extractMetadata(html);
    expect(meta.canonical).toBe('https://example.com/page');
  });

  it('extracts language', () => {
    const html = '<html lang="fr"><head></head><body></body></html>';
    const meta = extractMetadata(html);
    expect(meta.lang).toBe('fr');
  });
});
