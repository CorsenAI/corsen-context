import express from 'express';
import { CorsenContext, generateWebMCPScript, toWebMCPTools } from '@corsenai/corsen-context';

/**
 * MediaWiki wrapped by Corsen Context. MediaWiki stays internal; this server
 * is the public, agent-native front door. The provider reads pages through
 * the MediaWiki Action API — public reads, no key needed.
 */
const SITE_URL = (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
const MW_API = (process.env.MW_API_URL || 'http://127.0.0.1:8080/api.php').trim();

async function mwApi(params) {
  const url = `${MW_API}?${new URLSearchParams({ ...params, format: 'json' })}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MediaWiki API returned ${res.status}`);
  return res.json();
}

async function fetchPages() {
  const data = await mwApi({ action: 'query', list: 'allpages', aplimit: '100', apnamespace: '0' });
  const titles = (data.query?.allpages || []).map((p) => p.title).filter((t) => t !== 'Main Page');
  const pages = [];
  for (const title of titles) {
    const detail = await mwApi({
      action: 'query',
      prop: 'extracts|info',
      explaintext: '1',
      exintro: '0',
      titles: title,
    });
    const page = Object.values(detail.query?.pages || {})[0];
    if (!page || page.missing !== undefined) continue;
    const text = page.extract || '';
    pages.push({
      path: `/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
      title: page.title,
      description: text.split('\n')[0]?.slice(0, 160) || '',
      text,
      lastModified: page.touched,
    });
  }
  return pages;
}

const staticPages = [
  {
    path: '/',
    title: 'Home',
    description: 'A MediaWiki site made agent-native',
    type: 'page',
    text: 'This site runs on MediaWiki — the software behind Wikipedia. Corsen Context wraps its Action API and exposes the wiki to AI agents over MCP, llms.txt and WebMCP.',
  },
  {
    path: '/about',
    title: 'About',
    description: 'How this wiki talks to AI agents',
    type: 'page',
    text: 'MediaWiki stays internal. This wrapper is the public front door: it serves wiki pages, /llms.txt, an MCP endpoint, and WebMCP tools registered inside the page.',
  },
];

const provider = {
  async getPages() {
    const wikiPages = await fetchPages();
    return [
      ...staticPages.map((p) => ({
        url: `${SITE_URL}${p.path}`,
        title: p.title,
        description: p.description,
        type: p.type,
      })),
      ...wikiPages.map((p) => ({
        url: `${SITE_URL}${p.path}`,
        title: p.title,
        description: p.description,
        type: 'post',
        lastModified: p.lastModified,
      })),
    ];
  },

  async getPageContent(url) {
    const all = [
      ...staticPages.map((p) => ({ ...p, url: `${SITE_URL}${p.path}` })),
      ...(await fetchPages()).map((p) => ({ ...p, type: 'post', url: `${SITE_URL}${p.path}` })),
    ];
    const page = all.find((p) => p.url === url);
    if (!page) return null;
    return {
      url,
      title: page.title,
      description: page.description,
      markdown: `# ${page.title}\n\n${page.text}`,
      lastModified: page.lastModified,
      metadata: {},
    };
  },

  async searchContent(query, limit) {
    const q = query.toLowerCase();
    const pages = await this.getPages();
    return pages
      .filter(
        (p) =>
          p.title.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q),
      )
      .slice(0, limit)
      .map((p) => ({
        url: p.url,
        title: p.title,
        description: p.description,
        snippet: p.description,
        score: 1,
      }));
  },
};

const cc = new CorsenContext({ siteUrl: SITE_URL }, provider);

const app = express();
app.use(express.json());

app.get('/llms.txt', async (_req, res) => {
  res.type('text/plain').set('Cache-Control', 'public, max-age=300').send(await cc.generateLlmsTxt());
});

app.get('/llms-full.txt', async (_req, res) => {
  res
    .type('text/plain')
    .set('Cache-Control', 'public, max-age=300')
    .send(await cc.generateLlmsFullTxt());
});

app.post('/v1/mcp', async (req, res) => {
  const server = cc.createMCPServer();
  for (const [key, value] of Object.entries(server.getSecurityHeaders())) {
    res.set(key, value);
  }
  const clientIp = req.socket.remoteAddress || 'unknown';
  const apiKey =
    req.headers['x-mcp-key']?.toString() ||
    req.headers['authorization']?.toString().replace('Bearer ', '') ||
    undefined;
  const rateLimit = await server.checkRateLimit(clientIp, apiKey);
  for (const [key, value] of Object.entries(rateLimit.headers)) {
    res.set(key, value);
  }
  if (!rateLimit.allowed) {
    return res
      .status(429)
      .json({ jsonrpc: '2.0', error: { code: -32000, message: 'Rate limit exceeded' }, id: null });
  }
  const result = await server.handleRequest(req.body, clientIp, apiKey, { skipRateLimit: true });
  if (result === null) return res.status(204).end();
  res.json(result);
});

// WebMCP bridge — every page loads it with <script src="/webmcp.js" defer>.
app.get('/webmcp.js', (_req, res) => {
  const server = cc.createMCPServer();
  const script = generateWebMCPScript(toWebMCPTools(server.getToolDefinitions()));
  for (const [key, value] of Object.entries(server.getSecurityHeaders())) {
    res.set(key, value);
  }
  res.type('application/javascript').set('Cache-Control', 'public, max-age=3600').send(script);
});

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const pageShell = (title, inner) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><script src="/webmcp.js" defer></script></head>
<body><main style="max-width:680px;margin:0 auto;padding:2rem;font-family:system-ui;line-height:1.5">
${inner}
<p style="margin-top:2rem;color:#888;font-size:14px"><a href="/">Home</a> — MediaWiki + Corsen Context</p>
</main></body></html>`;

app.get('/', async (_req, res) => {
  const wikiPages = await fetchPages();
  const items = wikiPages
    .map((p) => `<li><a href="${p.path}">${esc(p.title)}</a> — ${esc(p.description)}</li>`)
    .join('\n');
  res.type('html').send(
    pageShell(
      'MediaWiki + Corsen Context',
      `<h1>A wiki that talks to AI agents</h1>
<p>This site runs on <strong>MediaWiki</strong> — the software behind
Wikipedia. Corsen Context wraps its Action API: the same four tools over
<a href="/llms.txt">/llms.txt</a>, <code>POST /v1/mcp</code>, and WebMCP inside
this page.</p>
<h2>Wiki pages (served live)</h2>
<ul>${items}</ul>`,
    ),
  );
});

app.use(async (req, res, next) => {
  if (req.method !== 'GET') return next();
  const page = await provider.getPageContent(`${SITE_URL}${req.path}`);
  if (!page) return next();
  const paragraphs = page.markdown
    .split('\n')
    .map((line) => {
      if (line.startsWith('# ')) return `<h1>${esc(line.slice(2))}</h1>`;
      return line.trim() ? `<p>${esc(line)}</p>` : '';
    })
    .join('\n');
  res.type('html').send(pageShell(page.title, paragraphs));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MediaWiki + Corsen Context demo at ${SITE_URL} (port ${PORT})`);
});
