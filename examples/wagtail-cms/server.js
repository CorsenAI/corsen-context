import express from 'express';
import { CorsenContext, generateWebMCPScript, toWebMCPTools } from '@corsenai/corsen-context';

/**
 * Wagtail (Python/Django) wrapped by Corsen Context. Wagtail stays internal;
 * this server is the public, agent-native front door. The provider reads
 * pages through Wagtail's public REST API v2 — read access needs no key.
 */
const SITE_URL = (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
const WAGTAIL_URL = (process.env.WAGTAIL_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');

const stripHtml = (s) =>
  String(s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

async function fetchPosts() {
  const res = await fetch(`${WAGTAIL_URL}/api/v2/pages/?type=home.HomePage&fields=body&limit=50`);
  if (!res.ok) throw new Error(`Wagtail API returned ${res.status}`);
  const body = await res.json();
  return (body.items || [])
    .filter((p) => p.meta && p.meta.slug && p.meta.slug !== 'home')
    .map((p) => ({
      path: `/posts/${p.meta.slug}`,
      title: p.title,
      description: stripHtml(p.body).slice(0, 160),
      text: stripHtml(p.body),
    }));
}

const staticPages = [
  {
    path: '/',
    title: 'Home',
    description: 'A Wagtail site made agent-native',
    type: 'page',
    text: 'This site runs on Wagtail (Python/Django). Corsen Context wraps the Wagtail REST API and exposes the content to AI agents over MCP, llms.txt and WebMCP.',
  },
  {
    path: '/about',
    title: 'About',
    description: 'How this Wagtail site talks to AI agents',
    type: 'page',
    text: 'Wagtail stays internal. This wrapper is the public front door: it serves the content as pages, /llms.txt, an MCP endpoint, and WebMCP tools registered inside the page.',
  },
];

const provider = {
  async getPages() {
    const posts = await fetchPosts();
    return [
      ...staticPages.map((p) => ({
        url: `${SITE_URL}${p.path}`,
        title: p.title,
        description: p.description,
        type: p.type,
      })),
      ...posts.map((p) => ({
        url: `${SITE_URL}${p.path}`,
        title: p.title,
        description: p.description,
        type: 'post',
      })),
    ];
  },

  async getPageContent(url) {
    const all = [
      ...staticPages.map((p) => ({ ...p, url: `${SITE_URL}${p.path}` })),
      ...(await fetchPosts()).map((p) => ({ ...p, type: 'post', url: `${SITE_URL}${p.path}` })),
    ];
    const page = all.find((p) => p.url === url);
    if (!page) return null;
    return {
      url,
      title: page.title,
      description: page.description,
      markdown: `# ${page.title}\n\n${page.text}`,
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
<p style="margin-top:2rem;color:#888;font-size:14px"><a href="/">Home</a> — Wagtail + Corsen Context</p>
</main></body></html>`;

app.get('/', async (_req, res) => {
  const posts = await fetchPosts();
  const items = posts
    .map((p) => `<li><a href="${p.path}">${esc(p.title)}</a> — ${esc(p.description)}</li>`)
    .join('\n');
  res.type('html').send(
    pageShell(
      'Wagtail + Corsen Context',
      `<h1>A Wagtail site that talks to AI agents</h1>
<p>This site runs on <strong>Wagtail</strong> (Python/Django). Corsen Context
wraps the Wagtail REST API — the same four tools over
<a href="/llms.txt">/llms.txt</a>, <code>POST /v1/mcp</code>, and WebMCP inside
this page.</p>
<h2>Posts (served live from Wagtail)</h2>
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
  console.log(`Wagtail + Corsen Context demo at ${SITE_URL} (port ${PORT})`);
});
