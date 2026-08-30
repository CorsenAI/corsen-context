import express from 'express';
import { CorsenContext, generateWebMCPScript, toWebMCPTools } from '@corsenai/corsen-context';

const SITE_URL = (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, '');

const app = express();
app.use(express.json());

// Demo content provider
const provider = {
  async getPages() {
    return [
      { url: `${SITE_URL}/`, title: 'Home', description: 'Welcome to our AI-native demo', type: 'page' },
      { url: `${SITE_URL}/about`, title: 'About', description: 'How we expose content to AI agents over MCP and WebMCP', type: 'page' },
      {
        url: `${SITE_URL}/blog/hello`,
        title: 'Hello World',
        description: 'Our first post — what an MCP and WebMCP context layer is',
        type: 'post',
        lastModified: '2026-04-01',
      },
    ];
  },

  async getPageContent(url) {
    const pages = {
      [`${SITE_URL}/`]: {
        title: 'Home',
        markdown: '# Welcome\n\nThis is a demo Express server with Corsen Context.',
      },
      [`${SITE_URL}/about`]: {
        title: 'About',
        markdown: '# About Us\n\nWe make websites AI-native.\n\n## What we use\n\nCorsen Context serves our content over MCP, llms.txt and the WebMCP bridge built into this page.',
      },
      [`${SITE_URL}/blog/hello`]: {
        title: 'Hello World',
        markdown: '# Hello World\n\nThis is our first blog post.\n\n## What is Corsen Context?\n\nA Universal AI Context Layer. AI agents read this site through the MCP endpoint, /llms.txt, or the WebMCP tools registered right inside the page.',
      },
    };
    const page = pages[url];
    if (!page) return null;
    const meta = (await this.getPages()).find((p) => p.url === url);
    return {
      url,
      title: page.title,
      description: meta?.description || '',
      markdown: page.markdown,
      lastModified: meta?.lastModified,
      metadata: {},
    };
  },

  async searchContent(query, limit) {
    const pages = await this.getPages();
    return pages
      .filter(
        (p) =>
          p.title.toLowerCase().includes(query.toLowerCase()) ||
          p.description.toLowerCase().includes(query.toLowerCase()),
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

// Serve /llms.txt
app.get('/llms.txt', async (_req, res) => {
  const text = await cc.generateLlmsTxt();
  res.type('text/plain').set('Cache-Control', 'public, max-age=3600').send(text);
});

// Serve /llms-full.txt
app.get('/llms-full.txt', async (_req, res) => {
  const text = await cc.generateLlmsFullTxt();
  res.type('text/plain').set('Cache-Control', 'public, max-age=3600').send(text);
});

// MCP endpoint
app.post('/v1/mcp', async (req, res) => {
  const server = cc.createMCPServer();

  // Security headers
  for (const [key, value] of Object.entries(server.getSecurityHeaders())) {
    res.set(key, value);
  }

  // Use the socket address by default. Only trust X-Forwarded-For behind a
  // proxy you control, otherwise it is spoofable and defeats rate limiting.
  const clientIp = req.socket.remoteAddress || 'unknown';

  // Forward the API key so CORSEN_CONTEXT_API_KEY auth works.
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

  // skipRateLimit: we already ran the limiter above (don't double-count).
  const result = await server.handleRequest(req.body, clientIp, apiKey, { skipRateLimit: true });

  // Notification (no id) — 204 No Content
  if (result === null) {
    return res.status(204).end();
  }

  res.json(result);
});

// WebMCP bridge — load it with <script src="/webmcp.js" defer>: the page then
// registers the same tools the MCP endpoint serves with an agent running
// inside the page (document.modelContext). Every execute() calls back into
// POST /v1/mcp, so the browser never reimplements a tool.
app.get('/webmcp.js', (_req, res) => {
  const server = cc.createMCPServer();
  const script = generateWebMCPScript(toWebMCPTools(server.getToolDefinitions()));

  for (const [key, value] of Object.entries(server.getSecurityHeaders())) {
    res.set(key, value);
  }

  res.type('application/javascript').set('Cache-Control', 'public, max-age=3600').send(script);
});

// Landing page
app.get('/', (_req, res) => {
  res.type('html').send(`
    <script src="/webmcp.js" defer></script>
    <h1>Corsen Context — Express Demo</h1>
    <p>This server is AI-native.</p>
    <ul>
      <li><a href="/llms.txt">/llms.txt</a></li>
      <li><code>POST /v1/mcp</code> — MCP endpoint</li>
      <li><code>GET /webmcp.js</code> — WebMCP bridge for in-page agents</li>
    </ul>
    <p style="color:#888">Powered by Corsen Context — Corsen AI</p>
  `);
});

// Content pages: render the provider's markdown as real HTML so the URLs the
// tools advertise never 404 when a human (or a jury) clicks them.
app.use(async (req, res, next) => {
  if (req.method !== 'GET') return next();
  const page = await provider.getPageContent(`${SITE_URL}${req.path}`);
  if (!page) return next();
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = page.markdown
    .split('\n')
    .map((line) => {
      if (line.startsWith('## ')) return `<h2>${esc(line.slice(3))}</h2>`;
      if (line.startsWith('# ')) return `<h1>${esc(line.slice(2))}</h1>`;
      return line.trim() ? `<p>${esc(line)}</p>` : '';
    })
    .join('\n');
  res.type('html').send(`
    <script src="/webmcp.js" defer></script>
    <main style="max-width:680px;margin:0 auto;padding:2rem;font-family:system-ui;line-height:1.5">
      ${html}
      <p style="color:#888"><a href="/">Home</a> — Powered by Corsen Context</p>
    </main>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Corsen Context Express demo running at http://localhost:${PORT}`);
  console.log(`  /llms.txt       — AI context file`);
  console.log(`  POST /v1/mcp   — MCP endpoint`);
  console.log(`  GET /webmcp.js — WebMCP bridge`);
});
