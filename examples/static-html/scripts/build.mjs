import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CorsenContext, generateWebMCPScript, toWebMCPTools } from '@corsenai/corsen-context';
import { SITE_URL, pages } from '../content.mjs';
import { renderDocument } from '../render.mjs';

/** Build the human pages and all discovery surfaces from the same records. */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public');
// Shared observatory assets -> public/corsen (single source: shared/webmcp-observatory)
// Shared assets: honour an explicit dir, else a sibling repo clone (reproducible).
const corsenSrc = process.env.CORSEN_SHARED_DIR || join(root, '..', '..', 'shared', 'webmcp-observatory');
mkdirSync(join(outDir, 'corsen'), { recursive: true });
for (const f of ['cc-nav.css', 'cc-nav.js', 'cc-observatory.css', 'cc-observatory.js']) {
  copyFileSync(join(corsenSrc, f), join(outDir, 'corsen', f));
}

const mcpEnabled = process.env.CORSEN_CONTEXT_MCP_ENABLED !== 'false';
const llmsTxtEnabled = process.env.CORSEN_CONTEXT_LLMS_TXT_ENABLED !== 'false';
// This reference gallery deliberately opts into the bounded full export. Set
// the variable to false and rebuild to remove it from a static deployment.
const llmsFullTxtEnabled =
  llmsTxtEnabled && process.env.CORSEN_CONTEXT_LLMS_FULL_TXT_ENABLED !== 'false';
mkdirSync(outDir, { recursive: true });

for (const page of pages) {
  const relativeFile = page.file ? page.file.replace(/^\/+/, '') : 'index.html';
  const target = join(outDir, relativeFile);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, renderDocument(page, { mcpEnabled, llmsTxtEnabled }), 'utf-8');
  console.log(`written: public/${relativeFile}`);
}

const provider = {
  async getPages() {
    return pages.map((page) => ({
      url: `${SITE_URL}${page.path}`,
      title: page.title,
      description: page.description,
      type: page.type,
      lastModified: page.lastModified,
    }));
  },
  async getPageContent(url) {
    const page = pages.find((item) => `${SITE_URL}${item.path}` === url);
    if (!page) return null;
    return {
      url,
      title: page.title,
      description: page.description,
      markdown: page.markdown,
      lastModified: page.lastModified,
      metadata: {},
    };
  },
  async searchContent(query, limit) {
    const normalizedQuery = query.toLowerCase();
    return (await this.getPages())
      .filter(
        (page) =>
          page.title.toLowerCase().includes(normalizedQuery) ||
          page.description.toLowerCase().includes(normalizedQuery),
      )
      .slice(0, limit)
      .map((page) => ({
        url: page.url,
        title: page.title,
        description: page.description,
        snippet: page.description,
        score: 1,
      }));
  },
};

const context = new CorsenContext(
  {
    siteUrl: SITE_URL,
    mcp: { enabled: mcpEnabled },
    static: {
      generateLlmsTxt: llmsTxtEnabled,
      includeFullContent: llmsFullTxtEnabled,
    },
  },
  provider,
);

for (const filename of ['llms.txt', 'llms-full.txt', 'webmcp.js', 'webmcp-status.js']) {
  rmSync(join(outDir, filename), { force: true });
}

if (llmsTxtEnabled) {
  writeFileSync(join(outDir, 'llms.txt'), await context.generateLlmsTxt(), 'utf-8');
  console.log('written: public/llms.txt');
}
if (llmsFullTxtEnabled) {
  writeFileSync(join(outDir, 'llms-full.txt'), await context.generateLlmsFullTxt(), 'utf-8');
  console.log('written: public/llms-full.txt');
}

if (mcpEnabled) {
  const server = context.createMCPServer();
  const bridge = generateWebMCPScript(toWebMCPTools(server.getToolDefinitions()), {
    mcpEndpoint: '/v1/mcp',
  });
  writeFileSync(join(outDir, 'webmcp.js'), bridge, 'utf-8');

  writeFileSync(
    join(outDir, 'webmcp-status.js'),
    `(() => {
  const target = document.querySelector('[data-webmcp-status]');
  if (!target) return;
  const available = typeof document.modelContext?.registerTool === 'function';
  target.textContent = available ? 'available' : 'not available in this browser';
  target.dataset.state = available ? 'available' : 'unavailable';
})();`,
    'utf-8',
  );
  console.log('written: public/webmcp.js, public/webmcp-status.js');
}
console.log(`Static build done for ${SITE_URL}`);
