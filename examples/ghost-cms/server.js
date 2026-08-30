import express from 'express';
import { CorsenContext, generateWebMCPScript, toWebMCPTools } from '@corsenai/corsen-context';

/**
 * Ghost CMS wrapped by Corsen Context. Ghost stays internal; this server is
 * the public, agent-native front door. The provider reads published posts
 * through the Ghost Content API — the same pattern works for any CMS with an
 * HTTP API.
 */
const SITE_URL = (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
const GHOST_API_URL = (process.env.GHOST_API_URL || 'http://127.0.0.1:2368').replace(/\/$/, '');
const GHOST_CONTENT_KEY = process.env.GHOST_CONTENT_KEY || '';

async function fetchPosts() {
  const url =
    `${GHOST_API_URL}/ghost/api/content/posts/` +
    `?key=${encodeURIComponent(GHOST_CONTENT_KEY)}` +
    `&fields=title,slug,excerpt,plaintext,published_at&limit=all&order=published_at%20desc`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Ghost Content API returned ${res.status}`);
  const body = await res.json();
  return (body.posts || []).map((p) => ({
    path: `/posts/${p.slug}`,
    title: p.title,
    description: p.excerpt || '',
    text: p.plaintext || '',
    lastModified: p.published_at,
  }));
}

// A couple of static pages around the Ghost content, so the sitemap also
// shows the site is more than a post list.
const staticPages = [
  {
    path: '/',
    title: 'Home',
    description: 'A Ghost publication made agent-native',
    type: 'page',
    text: 'This site runs on Ghost. Corsen Context wraps the Ghost Content API and exposes the publication to AI agents over MCP, llms.txt and WebMCP.',
  },
  {
    path: '/about',
    title: 'About',
    description: 'How this Ghost site talks to AI agents',
    type: 'page',
    text: 'Ghost stays internal. This wrapper is the public front door: it serves the publication as pages, /llms.txt, an MCP endpoint, and WebMCP tools registered inside the page.',
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
        lastModified: p.lastModified,
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
  const text = await cc.generateLlmsTxt();
  res.type('text/plain').set('Cache-Control', 'public, max-age=300').send(text);
});

app.get('/llms-full.txt', async (_req, res) => {
  const text = await cc.generateLlmsFullTxt();
  res.type('text/plain').set('Cache-Control', 'public, max-age=300').send(text);
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
<p style="margin-top:2rem;color:#888;font-size:14px"><a href="/">Home</a> — Ghost + Corsen Context</p>
</main></body></html>`;

// Landing page: the post list, straight from Ghost.
app.get('/', async (_req, res) => {
  const posts = await fetchPosts();
  const items = posts
    .map((p) => `<li><a href="${p.path}">${esc(p.title)}</a> — ${esc(p.description)}</li>`)
    .join('\n');
  res.type('html').send(
    pageShell(
      'Ghost + Corsen Context',
      `<h1>A Ghost publication that talks to AI agents</h1>
<p>This site runs on <strong>Ghost</strong>. Corsen Context wraps the Ghost
Content API — the same four tools over <a href="/llms.txt">/llms.txt</a>,
<code>POST /v1/mcp</code>, and WebMCP inside this page.</p>
<h2>Posts (served live from Ghost)</h2>
<ul>${items}</ul>`,
    ),
  );
});

// Content pages (static pages + Ghost posts).
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
  console.log(`Ghost + Corsen Context demo at ${SITE_URL} (port ${PORT})`);
  console.log(`  Ghost API: ${GHOST_API_URL}`);
});
