import express from 'express';
import { CorsenContext } from '@corsenai/corsen-context';

const app = express();
app.use(express.json());

// Demo content provider
const provider = {
  async getPages() {
    return [
      { url: 'http://localhost:3000/', title: 'Home', description: 'Welcome', type: 'page' },
      { url: 'http://localhost:3000/about', title: 'About', description: 'About us', type: 'page' },
      {
        url: 'http://localhost:3000/blog/hello',
        title: 'Hello World',
        description: 'Our first post',
        type: 'post',
        lastModified: '2026-04-01',
      },
    ];
  },

  async getPageContent(url) {
    const pages = {
      'http://localhost:3000/': {
        title: 'Home',
        markdown: '# Welcome\n\nThis is a demo Express server with Corsen Context.',
      },
      'http://localhost:3000/about': {
        title: 'About',
        markdown: '# About Us\n\nWe make websites AI-native.',
      },
      'http://localhost:3000/blog/hello': {
        title: 'Hello World',
        markdown: '# Hello World\n\nThis is our first blog post.\n\n## What is Corsen Context?\n\nA Universal AI Context Layer.',
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

const cc = new CorsenContext({ siteUrl: 'http://localhost:3000' }, provider);

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

  // Rate limit
  const clientIp =
    req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    'unknown';
  const rateLimit = await server.checkRateLimit(clientIp);
  for (const [key, value] of Object.entries(rateLimit.headers)) {
    res.set(key, value);
  }
  if (!rateLimit.allowed) {
    return res
      .status(429)
      .json({ jsonrpc: '2.0', error: { code: -32000, message: 'Rate limit exceeded' }, id: null });
  }

  const result = await server.handleRequest(req.body, clientIp);

  // Notification (no id) — 204 No Content
  if (result === null) {
    return res.status(204).end();
  }

  res.json(result);
});

// Landing page
app.get('/', (_req, res) => {
  res.type('html').send(`
    <h1>Corsen Context — Express Demo</h1>
    <p>This server is AI-native.</p>
    <ul>
      <li><a href="/llms.txt">/llms.txt</a></li>
      <li><code>POST /v1/mcp</code> — MCP endpoint</li>
    </ul>
    <p style="color:#888">Powered by Corsen Context — Corsen AI</p>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Corsen Context Express demo running at http://localhost:${PORT}`);
  console.log(`  /llms.txt       — AI context file`);
  console.log(`  POST /v1/mcp   — MCP endpoint`);
});
