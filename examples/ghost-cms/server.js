import express from 'express';
import {
  CorsenContext,
  MCP_PROTOCOL_VERSION,
  extractClientIp,
  generateWebMCPScript,
  toWebMCPTools,
} from '@corsenai/corsen-context';

/**
 * Ghost CMS wrapped by Corsen Context. Ghost stays internal; this server is
 * the public, agent-native front door. The provider reads published posts
 * through the Ghost Content API — the same pattern works for any CMS with an
 * HTTP API.
 */
const SITE_URL = (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
const GHOST_API_URL = (process.env.GHOST_API_URL || 'http://127.0.0.1:2368').replace(/\/$/, '');
const GHOST_CONTENT_KEY = process.env.GHOST_CONTENT_KEY || '';
const TRUST_PROXY = process.env.TRUST_PROXY === '1';

async function loadPosts() {
  const url =
    `${GHOST_API_URL}/ghost/api/content/posts/` +
    `?key=${encodeURIComponent(GHOST_CONTENT_KEY)}` +
    `&fields=title,slug,excerpt,plaintext,published_at&limit=100&order=published_at%20desc`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Ghost Content API returned ${res.status}`);
  const body = await res.json();
  return (body.posts || []).map((p) => ({
    path: `/posts/${encodeURIComponent(String(p.slug))}`,
    title: p.title,
    description: p.excerpt || '',
    text: p.plaintext || '',
    lastModified: p.published_at,
  }));
}

let postsCache = null;
let postsCacheExpiresAt = 0;
let postsLoadPromise = null;

async function fetchPosts() {
  if (postsCache && Date.now() < postsCacheExpiresAt) return postsCache;
  if (postsLoadPromise) return postsLoadPromise;
  postsLoadPromise = loadPosts().then((posts) => {
    postsCache = posts;
    postsCacheExpiresAt = Date.now() + 60_000;
    return posts;
  });
  try {
    return await postsLoadPromise;
  } finally {
    postsLoadPromise = null;
  }
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
        (p) => p.title.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q),
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

const cc = new CorsenContext(
  {
    siteUrl: SITE_URL,
    mcp: { enabled: process.env.CORSEN_CONTEXT_MCP_ENABLED !== 'false' },
    static: {
      generateLlmsTxt: process.env.CORSEN_CONTEXT_LLMS_TXT_ENABLED !== 'false',
      includeFullContent: process.env.CORSEN_CONTEXT_LLMS_FULL_TXT_ENABLED === 'true',
    },
    cache: { enabled: false },
    security: { trustProxy: TRUST_PROXY },
  },
  provider,
);

const app = express();
if (TRUST_PROXY) app.set('trust proxy', 1);
app.all(['/v1/mcp', '/webmcp.js'], (_req, res, next) => {
  if (!cc.getConfig().mcp.enabled) return res.status(404).end();
  return next();
});
app.all('/v1/mcp', (req, res, next) => {
  const server = cc.createMCPServer();
  for (const [key, value] of Object.entries(server.getSecurityHeaders())) res.set(key, value);
  const origin = req.get('Origin') || undefined;
  if (!server.validateRequestOrigin(origin)) {
    return res.status(403).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Invalid Origin' },
      id: null,
    });
  }
  for (const [key, value] of Object.entries(server.getCorsHeaders(origin))) res.set(key, value);
  res.locals.mcpServer = server;
  return next();
});

async function mcpPostPreflight(req, res, next) {
  try {
    const contentType = (req.get('Content-Type') || '').split(';', 1)[0].trim().toLowerCase();
    if (contentType !== 'application/json') {
      return res.status(415).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Content-Type must be application/json' },
        id: null,
      });
    }
    const accept = (req.get('Accept') || '').trim().toLowerCase();
    if (accept && !accept.includes('application/json') && !accept.includes('*/*')) {
      return res.status(406).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Client must accept application/json' },
        id: null,
      });
    }
    const server = res.locals.mcpServer;
    const clientIp = extractClientIp(req.headers, req.socket.remoteAddress, TRUST_PROXY);
    const apiKey =
      req.headers['x-mcp-key']?.toString() ||
      req.headers['authorization']?.toString().replace('Bearer ', '') ||
      undefined;
    const rateLimit = await server.checkRateLimit(clientIp, apiKey);
    for (const [key, value] of Object.entries(rateLimit.headers)) res.set(key, value);
    if (!rateLimit.allowed) {
      return res.status(429).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Rate limit exceeded' },
        id: null,
      });
    }
    if (!server.checkAuth(apiKey)) {
      return res.status(401).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Unauthorized' },
        id: null,
      });
    }
    res.locals.mcpClientIp = clientIp;
    res.locals.mcpApiKey = apiKey;
    return next();
  } catch (error) {
    return next(error);
  }
}

const mcpJsonParser = express.json({ limit: 102400, strict: false });

function isJsonRpcResponse(body) {
  return (
    !!body &&
    typeof body === 'object' &&
    !Array.isArray(body) &&
    !('method' in body) &&
    ('result' in body || 'error' in body)
  );
}

app.get('/llms.txt', async (_req, res) => {
  if (!cc.getConfig().static.generateLlmsTxt) {
    return res.status(404).set('Cache-Control', 'no-store').end();
  }
  const text = await cc.generateLlmsTxt();
  res.type('text/plain').set('Cache-Control', 'public, max-age=300').send(text);
});

app.get('/llms-full.txt', async (_req, res) => {
  const config = cc.getConfig();
  const includeFullContent = config.static.includeFullContent;
  if (!config.static.generateLlmsTxt || !includeFullContent) {
    return res.status(404).set('Cache-Control', 'no-store').end();
  }
  const text = await cc.generateLlmsFullTxt();
  res.type('text/plain').set('Cache-Control', 'public, max-age=300').send(text);
});

app.options('/v1/mcp', (_req, res) => res.status(204).end());

app.get('/v1/mcp', (_req, res) => {
  res.set('Allow', 'POST');
  return res.status(405).end();
});

app.post('/v1/mcp', mcpPostPreflight, mcpJsonParser, async (req, res) => {
  const server = res.locals.mcpServer;
  const clientIp = res.locals.mcpClientIp;
  const apiKey = res.locals.mcpApiKey;
  if (isJsonRpcResponse(req.body)) {
    return res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32600, message: 'JSON-RPC responses are not accepted' },
      id: null,
    });
  }
  const method =
    req.body && typeof req.body === 'object' && !Array.isArray(req.body)
      ? req.body.method
      : undefined;
  if (typeof method === 'string' && method !== 'initialize') {
    const requestedVersion = req.get('MCP-Protocol-Version') || '2025-03-26';
    if (requestedVersion !== MCP_PROTOCOL_VERSION) {
      return res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Unsupported MCP-Protocol-Version' },
        id: null,
      });
    }
  }
  const result = await server.handleRequest(req.body, clientIp, apiKey, { skipRateLimit: true });
  if (result === null) return res.status(202).end();
  res.json(result);
});

app.use('/v1/mcp', (error, _req, res, next) => {
  if (error?.type === 'entity.parse.failed') {
    return res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32700, message: 'Parse error' },
      id: null,
    });
  }
  if (error?.type === 'entity.too.large') {
    return res.status(413).json({
      jsonrpc: '2.0',
      error: { code: -32600, message: 'Request body too large' },
      id: null,
    });
  }
  if (error?.type === 'charset.unsupported' || error?.type === 'encoding.unsupported') {
    return res.status(415).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Unsupported request encoding' },
      id: null,
    });
  }
  return next(error);
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

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => esc(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const webmcpScriptTag = cc.getConfig().mcp.enabled
  ? '<script src="/webmcp.js" defer></script>'
  : '';
const pageShell = (title, inner) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>${webmcpScriptTag}</head>
<body><main style="max-width:680px;margin:0 auto;padding:2rem;font-family:system-ui;line-height:1.5">
${inner}
<p style="margin-top:2rem;color:#888;font-size:14px"><a href="/">Home</a> — Ghost + Corsen Context</p>
</main></body></html>`;

// Landing page: the post list, straight from Ghost.
app.get('/', async (_req, res) => {
  const posts = await fetchPosts();
  const items = posts
    .map((p) => `<li><a href="${escAttr(p.path)}">${esc(p.title)}</a> — ${esc(p.description)}</li>`)
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

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const message = error instanceof Error ? error.message : 'Unexpected runtime error';
  console.error(`[ghost-cms] ${message}`);
  if (req.path === '/v1/mcp') {
    return res.status(502).json({
      jsonrpc: '2.0',
      error: { code: -32603, message: 'Content source is temporarily unavailable' },
      id: req.body?.id ?? null,
    });
  }
  return res.status(502).type('text/plain').send('Content source is temporarily unavailable.');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Ghost + Corsen Context demo at ${SITE_URL} (port ${PORT})`);
  console.log(`  Ghost API: ${GHOST_API_URL}`);
});
