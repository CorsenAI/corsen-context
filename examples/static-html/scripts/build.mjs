import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CorsenContext, generateWebMCPScript, toWebMCPTools } from '@corsenai/corsen-context';
import { SITE_URL, pages } from '../content.mjs';

/**
 * Static build: one pass turns content.mjs into the whole agent-ready site —
 * HTML pages, llms.txt, llms-full.txt, and the WebMCP bridge (webmcp.js).
 * The only thing not built here is the MCP function (function/server.js).
 *
 * If your static site is already live, you can skip this script entirely and
 * generate llms.txt from the live site instead:
 *   npx @corsenai/corsen-context-cli generate --url https://yoursite.com --full
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public');
mkdirSync(outDir, { recursive: true });

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const shell = (title, inner) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(title)}">
<script src="/webmcp.js" defer></script></head>
<body><main style="max-width:680px;margin:0 auto;padding:2rem;font-family:system-ui;line-height:1.5">
${inner}
<p style="margin-top:2rem;color:#888;font-size:14px"><a href="/">Home</a> — Static HTML + Corsen Context</p>
</main></body></html>`;

// 1. HTML pages
for (const page of pages) {
  const inner =
    page.path === '/'
      ? `<h1>${esc(page.title)}</h1>
<p>${esc(page.body)}</p>
<h2>Pages</h2>
<ul>
${pages
  .filter((p) => p.path !== '/')
  .map((p) => `  <li><a href="${p.path}">${esc(p.title)}</a> — ${esc(p.description)}</li>`)
  .join('\n')}
</ul>
<h2>Agent surfaces</h2>
<ul>
  <li><a href="/llms.txt">/llms.txt</a> — static discovery</li>
  <li><code>POST /v1/mcp</code> — MCP endpoint (one small function)</li>
  <li><code>document.modelContext</code> — WebMCP tools registered by this page</li>
</ul>`
      : `<h1>${esc(page.title)}</h1>\n<p>${esc(page.body)}</p>`;
  const file = page.path === '/' ? 'index.html' : page.path;
  const target = join(outDir, file);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, shell(page.title, inner), 'utf-8');
  console.log(`written: public/${file}`);
}

// 2. llms.txt / llms-full.txt from the same content
const provider = {
  async getPages() {
    return pages.map((p) => ({
      url: `${SITE_URL}${p.path}`,
      title: p.title,
      description: p.description,
      type: p.type,
      lastModified: p.lastModified,
    }));
  },
  async getPageContent(url) {
    const page = pages.find((p) => `${SITE_URL}${p.path}` === url);
    if (!page) return null;
    return {
      url,
      title: page.title,
      description: page.description,
      markdown: `# ${page.title}\n\n${page.body}`,
      lastModified: page.lastModified,
      metadata: {},
    };
  },
  async searchContent(query, limit) {
    const q = query.toLowerCase();
    return (await this.getPages())
      .filter(
        (p) =>
          p.title.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q),
      )
      .slice(0, limit)
      .map((p) => ({ url: p.url, title: p.title, description: p.description, snippet: p.description, score: 1 }));
  },
};

const cc = new CorsenContext({ siteUrl: SITE_URL }, provider);
writeFileSync(join(outDir, 'llms.txt'), await cc.generateLlmsTxt(), 'utf-8');
writeFileSync(join(outDir, 'llms-full.txt'), await cc.generateLlmsFullTxt(), 'utf-8');
console.log('written: public/llms.txt, public/llms-full.txt');

// 3. The WebMCP bridge as a static asset. The endpoint it calls is relative,
// so the same file works on any host.
const server = cc.createMCPServer();
const script = generateWebMCPScript(toWebMCPTools(server.getToolDefinitions()), {
  mcpEndpoint: '/v1/mcp',
});
writeFileSync(join(outDir, 'webmcp.js'), script, 'utf-8');
console.log('written: public/webmcp.js');
console.log(`\nStatic build done for ${SITE_URL}`);
