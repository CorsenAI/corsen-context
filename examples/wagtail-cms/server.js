import express from 'express';
import {
  CorsenContext,
  MCP_PROTOCOL_VERSION,
  extractClientIp,
  generateWebMCPScript,
  toWebMCPTools,
} from '@corsenai/corsen-context';

/**
 * The underlying Wagtail site runs on Python/Django. Corsen Context uses a
 * Node bridge over the Wagtail API; Wagtail stays internal;
 * this server is the public, agent-native front door. The provider reads
 * pages through Wagtail's public REST API v2 — read access needs no key.
 */
const SITE_URL = (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
const WAGTAIL_URL = (process.env.WAGTAIL_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const WAGTAIL_PAGE_TYPE = (process.env.WAGTAIL_PAGE_TYPE || 'home.HomePage').trim();
const WAGTAIL_BODY_FIELD = (process.env.WAGTAIL_BODY_FIELD || 'body').trim();
const TRUST_PROXY = process.env.TRUST_PROXY === '1';

if (!/^[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*$/.test(WAGTAIL_PAGE_TYPE)) {
  throw new Error(
    'WAGTAIL_PAGE_TYPE must use the app.ModelName format (for example blog.BlogPage)',
  );
}
if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(WAGTAIL_BODY_FIELD)) {
  throw new Error('WAGTAIL_BODY_FIELD must be a single Wagtail API field name');
}

const stripHtml = (s) =>
  String(s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function fieldText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number') return stripHtml(value);
  if (Array.isArray(value)) return value.map(fieldText).filter(Boolean).join('\n\n');
  if (typeof value === 'object') {
    return Object.entries(value)
      .filter(([key]) => key !== 'id' && key !== 'type')
      .map(([, child]) => fieldText(child))
      .filter(Boolean)
      .join('\n\n');
  }
  return '';
}

async function loadPosts() {
  const params = new URLSearchParams({
    type: WAGTAIL_PAGE_TYPE,
    fields: WAGTAIL_BODY_FIELD,
    limit: '20',
  });
  const res = await fetch(`${WAGTAIL_URL}/api/v2/pages/?${params}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Wagtail API returned ${res.status}`);
  const body = await res.json();
  return (body.items || [])
    .filter((p) => p.meta && p.meta.slug && p.meta.slug !== 'home')
    .map((p) => {
      const text = fieldText(p[WAGTAIL_BODY_FIELD]);
      return {
        path: `/posts/${encodeURIComponent(String(p.meta.slug))}`,
        title: p.title,
        description: text.slice(0, 160),
        text,
      };
    });
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

const staticPages = [
  {
    path: '/',
    title: 'Home',
    description: 'A Wagtail site made agent-native',
    type: 'page',
    text: 'Wagtail runs on Python/Django. Corsen Context uses a Node bridge over the Wagtail API and exposes the content to AI agents over MCP, llms.txt and WebMCP.',
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
  res
    .type('text/plain')
    .set('Cache-Control', 'public, max-age=300')
    .send(await cc.generateLlmsTxt());
});

app.get('/llms-full.txt', async (_req, res) => {
  const config = cc.getConfig();
  const includeFullContent = config.static.includeFullContent;
  if (!config.static.generateLlmsTxt || !includeFullContent) {
    return res.status(404).set('Cache-Control', 'no-store').end();
  }
  res
    .type('text/plain')
    .set('Cache-Control', 'public, max-age=300')
    .send(await cc.generateLlmsFullTxt());
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
    return res
      .status(400)
      .json({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null });
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
const mcpEnabled = process.env.CORSEN_CONTEXT_MCP_ENABLED !== 'false';
const bridgeTag = mcpEnabled ? '<script src="/webmcp.js" defer></script>' : '';
const pageShell = (title, inner) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>/* ============================================================
   Corsen Context shared navigation (v2)
   Isolated: .cc-nav / .cc-nav-*. Sticky, accessible, mobile-ready.
   Stack accent via --cc-accent (set per site).
   ============================================================ */

:where([data-cc-nav], [data-cc-foot], .cc-nav, .cc-foot-common) {
  --cc-nav-bg: rgba(255, 255, 255, 0.94);
  --cc-nav-border: #d8dfe7;
  --cc-nav-text: #101828;
  --cc-nav-muted: #475467;
  --cc-nav-accent: var(--cc-accent, #8f0e60);
  --cc-nav-h: 58px;
  font-family: ui-sans-serif, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}

.cc-nav {
  position: sticky; top: 0; z-index: 60;
  background: var(--cc-nav-bg);
  border-bottom: 1px solid var(--cc-nav-border);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
.cc-nav-inner {
  max-width: 1160px; margin: 0 auto; padding: 0 20px;
  height: var(--cc-nav-h);
  display: flex; align-items: center; gap: 14px;
}
.cc-nav-logo {
  display: inline-flex; align-items: center; gap: 8px;
  font-weight: 700; font-size: 15.5px; color: var(--cc-nav-text);
  text-decoration: none; white-space: nowrap;
}
.cc-nav-logo:hover { color: var(--cc-nav-accent); }
.cc-nav-logo:focus-visible { outline: 3px solid var(--cc-nav-accent); outline-offset: 2px; border-radius: 4px; }
.cc-nav-logo .cc-nav-mark {
  width: 22px; height: 22px; border-radius: 6px; display: grid; place-items: center;
  background: var(--cc-nav-accent); color: #fff; font-size: 11px; font-weight: 800; flex: none;
}
.cc-nav-stack {
  font-size: 12px; font-weight: 700; color: var(--cc-nav-accent);
  border: 1px solid var(--cc-accent-soft, #e6c9dc); background: var(--cc-accent-soft-bg, #fbeff7);
  border-radius: 999px; padding: 3px 10px; white-space: nowrap;
}
.cc-nav-links { display: flex; align-items: center; gap: 2px; margin-left: auto; }
.cc-nav-link {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 13.5px; font-weight: 600; color: var(--cc-nav-text);
  text-decoration: none; padding: 8px 12px; border-radius: 8px;
  transition: background .12s ease, color .12s ease;
}
.cc-nav-link:hover { background: #f1f4f8; color: var(--cc-nav-accent); }
.cc-nav-link:focus-visible { outline: 3px solid var(--cc-nav-accent); outline-offset: 2px; }
.cc-nav-link[aria-current="true"] { color: var(--cc-nav-accent); background: var(--cc-accent-soft-bg, #fbeff7); }
.cc-nav-cta {
  display: inline-flex; align-items: center; gap: 6px; white-space: nowrap;
  font-size: 13px; font-weight: 700; color: #ffffff;
  background: var(--cc-nav-accent); border-radius: 9px; padding: 8px 14px;
  text-decoration: none; margin-left: 8px;
}
.cc-nav-cta:hover { filter: brightness(1.10); }
.cc-nav-cta:focus-visible { outline: 3px solid var(--cc-nav-accent); outline-offset: 2px; }

/* Mobile toggle */
.cc-nav-toggle {
  display: none; margin-left: auto;
  width: 40px; height: 40px; border: 1px solid var(--cc-nav-border);
  background: #fff; border-radius: 9px; cursor: pointer;
  align-items: center; justify-content: center; flex-direction: column; gap: 4px;
}
.cc-nav-toggle:focus-visible { outline: 3px solid var(--cc-nav-accent); outline-offset: 2px; }
.cc-nav-toggle span { display: block; width: 18px; height: 2px; background: var(--cc-nav-text); border-radius: 2px; transition: transform .18s ease, opacity .18s ease; }
.cc-nav-toggle[aria-expanded="true"] span:nth-child(1) { transform: translateY(6px) rotate(45deg); }
.cc-nav-toggle[aria-expanded="true"] span:nth-child(2) { opacity: 0; }
.cc-nav-toggle[aria-expanded="true"] span:nth-child(3) { transform: translateY(-6px) rotate(-45deg); }

.cc-nav-mobile {
  display: none; flex-direction: column; gap: 2px;
  border-top: 1px solid var(--cc-nav-border); background: #fff; padding: 10px 20px 16px;
}
.cc-nav-mobile .cc-nav-link { padding: 12px 10px; font-size: 15px; }
.cc-nav-mobile .cc-nav-cta { justify-content: center; margin: 8px 0 0; }

@media (max-width: 760px) {
  .cc-nav-links { display: none; }
  .cc-nav-toggle { display: flex; }
  .cc-nav-mobile.is-open { display: flex; }
  .cc-nav-stack { display: none; }
}

/* Shared footer */
.cc-foot-common {
  margin-top: 56px; border-top: 1px solid var(--cc-nav-border);
  padding: 26px 20px 30px; text-align: center;
  color: var(--cc-nav-muted); font-size: 13px;
  font-family: ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif;
}
.cc-foot-common a { color: var(--cc-nav-text); font-weight: 600; text-decoration: underline; }
.cc-foot-common a:hover { color: var(--cc-nav-accent); }
.cc-foot-common .cc-foot-stack { display: block; margin-top: 10px; font-size: 12px; opacity: .9; }
.cc-foot-common .cc-foot-links { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px 18px; margin-top: 8px; font-size: 13px; }
.cc-foot-common .cc-foot-legal {
  display: flex; flex-direction: column; align-items: center; gap: 3px;
  margin-top: 12px; font-size: 12px; color: var(--cc-nav-muted);
}
.cc-foot-common .cc-foot-mit {
  display: inline-flex; align-items: center; gap: 6px; margin-top: 10px;
  background: #f1f4f8; border: 1px solid var(--cc-nav-border);
  border-radius: 999px; padding: 4px 12px; font-size: 12px; color: var(--cc-nav-muted);
}
</style>
<style>/* ============================================================
   Live Contract Observatory  - shared component (v1)
   Isolated CSS: all rules prefixed with .cc-observatory / cc-obs-
   No external deps. WCAG AA contrast. prefers-reduced-motion.
   ============================================================ */

:where(.cc-obs-root) {
  --cc-obs-bg: #ffffff;
  --cc-obs-panel: #f8fafc;
  --cc-obs-border: #dbe2e9;
  --cc-obs-text: #12202e;
  --cc-obs-muted: #5d6b78;
  --cc-obs-accent: #b6167b;
  --cc-obs-accent-soft: #e9d4e3;
  --cc-obs-ok: #0a7a3d;
  --cc-obs-ok-soft: #d9f1e2;
  --cc-obs-err: #b3261e;
  --cc-obs-err-soft: #f8dcd9;
  --cc-obs-run: #8a4a00;
  --cc-obs-run-soft: #fbe8cd;
  --cc-obs-font: ui-sans-serif, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}

.cc-obs-root {
  font-family: var(--cc-obs-font);
  color: var(--cc-obs-text);
  max-width: 100%;
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--cc-obs-border);
  border-radius: 14px;
  background: var(--cc-obs-panel);
  padding: 16px;
  font-size: 15px;
  line-height: 1.45;
}
.cc-obs-root *, .cc-obs-root *::before, .cc-obs-root *::after { box-sizing: border-box; }

.cc-obs-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin-bottom: 10px; }
.cc-obs-stack {
  display: inline-flex; align-items: center; gap: 6px;
  font-weight: 700; font-size: 14px; letter-spacing: .01em;
}
.cc-obs-stack-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--cc-obs-ok); flex: none; }
.cc-obs-route { font-size: 12.5px; color: var(--cc-obs-muted); font-variant-numeric: tabular-nums; }

.cc-obs-tools { display: flex; flex-wrap: wrap; gap: 6px; margin: 2px 0 12px; }
.cc-obs-tool {
  font-size: 12px; font-weight: 600; color: var(--cc-obs-text);
  background: var(--cc-obs-accent-soft);
  border-radius: 999px; padding: 4px 10px;
  border: 1px solid transparent;
}

.cc-obs-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
.cc-obs-run {
  font: inherit; font-weight: 700; font-size: 13.5px;
  color: #fff; background: var(--cc-obs-accent);
  border: 0; border-radius: 9px; padding: 9px 16px; cursor: pointer;
  display: inline-flex; align-items: center; gap: 8px;
  transition: background .15s ease, transform .12s ease;
}
.cc-obs-run:hover { background: var(--cc-obs-accent); filter: brightness(1.08); }
.cc-obs-run:active { transform: translateY(1px); }
.cc-obs-run:focus-visible { outline: 3px solid var(--cc-obs-accent); outline-offset: 2px; }
.cc-obs-run[disabled] { opacity: .55; cursor: wait; }
.cc-obs-run-icon { font-size: 15px; line-height: 1; }

.cc-obs-status {
  display: flex; align-items: center; gap: 8px;
  font-size: 13px; font-weight: 600; color: var(--cc-obs-muted);
  margin-bottom: 10px; min-height: 20px;
}
.cc-obs-status[data-state="idle"] { color: var(--cc-obs-muted); }
.cc-obs-status[data-state="running"] { color: var(--cc-obs-run); }
.cc-obs-status[data-state="success"] { color: var(--cc-obs-ok); }
.cc-obs-status[data-state="error"] { color: var(--cc-obs-err); }
.cc-obs-status-text { font-weight: 600; }

.cc-obs-steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.cc-obs-step {
  display: flex; align-items: center; gap: 10px;
  font-size: 13px; color: var(--cc-obs-muted);
  border: 1px solid transparent; border-radius: 8px; padding: 6px 10px;
  background: transparent;
}
.cc-obs-step[data-state="running"] { background: var(--cc-obs-run-soft); color: var(--cc-obs-run); border-color: #f0d5ab; }
.cc-obs-step[data-state="success"] { background: var(--cc-obs-ok-soft); color: var(--cc-obs-ok); border-color: #bfe3cc; }
.cc-obs-step[data-state="error"] { background: var(--cc-obs-err-soft); color: var(--cc-obs-err); border-color: #efbeb9; }
.cc-obs-step-mark { width: 18px; height: 18px; border-radius: 50%; flex: none; display: grid; place-items: center; font-size: 11px; font-weight: 800; }
.cc-obs-step[data-state="idle"] .cc-obs-step-mark { background: var(--cc-obs-border); color: var(--cc-obs-muted); }
.cc-obs-step[data-state="running"] .cc-obs-step-mark { background: var(--cc-obs-run); color: #fff; }
.cc-obs-step[data-state="success"] .cc-obs-step-mark { background: var(--cc-obs-ok); color: #fff; }
.cc-obs-step[data-state="error"] .cc-obs-step-mark { background: var(--cc-obs-err); color: #fff; }
.cc-obs-step-name { font-weight: 600; }
.cc-obs-step-note { font-size: 11.5px; opacity: .85; margin-left: auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 46%; }

.cc-obs-result { margin-top: 10px; border-top: 1px dashed var(--cc-obs-border); padding-top: 10px; display: grid; gap: 6px; }
.cc-obs-result[hidden] { display: none; }
.cc-obs-result-label { font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--cc-obs-muted); }
.cc-obs-result-url {
  font-size: 13px; font-weight: 600; color: var(--cc-obs-accent); word-break: break-all;
}
.cc-obs-result-url a { color: inherit; text-decoration: underline; }
.cc-obs-result-url a:focus-visible { outline: 3px solid var(--cc-obs-accent); outline-offset: 2px; }
.cc-obs-result-excerpt { font-size: 13px; color: var(--cc-obs-text); max-height: 84px; overflow: hidden; position: relative; }

.cc-obs-result table { width: 100%; border-collapse: collapse; margin-top: 4px; }
.cc-obs-result td { font-size: 12.5px; padding: 4px 6px; border-bottom: 1px solid #edf1f5; vertical-align: top; }
.cc-obs-result td:first-child { font-weight: 600; color: var(--cc-obs-muted); width: 46%; }

.cc-obs-schema { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 6px; }
.cc-obs-chip { font-size: 11.5px; color: var(--cc-obs-muted); background: #eef2f6; border-radius: 999px; padding: 4px 10px; }

/* Focus visibility */
.cc-obs-root :focus-visible { outline: 3px solid var(--cc-obs-accent); outline-offset: 2px; border-radius: 4px; }

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .cc-obs-step[data-state="running"] .cc-obs-step-mark { animation: none !important; }
  .cc-obs-run { transition: none; }
}

/* Responsive */
@media (max-width: 560px) {
  .cc-obs-root { padding: 12px; font-size: 14px; }
  .cc-obs-step-note { max-width: 40%; }
  .cc-obs-tool { font-size: 11px; padding: 3px 8px; }
}
</style>
${bridgeTag}</head>
<body>
<div data-cc-nav data-stack="Wagtail" data-uid="wagtail" data-home="#top" data-accent="#0d6b57"></div>
<main id="top" style="max-width:1080px;margin:0 auto;padding:32px 24px;font-family:system-ui;line-height:1.55;color:#12202e">
${inner}
<section id="live" style="margin:36px 0 0">
  <h2>Live contract observatory</h2>
  <div data-cc-observatory data-stack="Wagtail" data-endpoint="/v1/mcp" data-query="Wagtail" data-accent="#0d6b57"></div>
</section>
</main>
<footer data-cc-foot data-stack="Wagtail" data-accent="#0d6b57"></footer>
<script>/* ============================================================
   Live Contract Observatory - shared component (v2)
   Vanilla JS. No deps. Reads config from data-* attributes.
   Sequence: initialize -> tools/list -> search_site ->
             get_page_content -> get_sitemap -> list_content
   Every tool is really executed; each row turns green after its
   real response. Empty results are success when the call answers.
   Same-origin only, credentials: "omit", 15s timeout, one run at a time.
   Honest states: idle | running | success | error. No simulated data.
   Exposes window.CcObservatory.mountAll() for delayed init.
   ============================================================ */
(function () {
  'use strict';

  var PROTOCOL = '2025-11-25';
  var TIMEOUT_MS = 15000;

  var TOOLS = [
    { name: 'search_site', label: 'search_site' },
    { name: 'get_page_content', label: 'get_page_content' },
    { name: 'get_sitemap', label: 'get_sitemap' },
    { name: 'list_content', label: 'list_content' },
  ];

  function esc(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function truncate(value, max) {
    var s = String(value || '');
    if (s.length <= max) return s;
    return s.slice(0, max - 1) + '...';
  }

  function mount(root) {
    if (!root || root.__ccObsMounted) return;
    root.__ccObsMounted = true;

    var stack = root.getAttribute('data-stack') || 'stack';
    var endpoint = root.getAttribute('data-endpoint') || '/v1/mcp';
    var query = root.getAttribute('data-query') || 'site';

    root.classList.add('cc-obs-root');

    var html =
      '<div class="cc-obs-head">' +
        '<span class="cc-obs-stack"><span class="cc-obs-stack-dot" aria-hidden="true"></span>' +
        esc(stack) + '</span>' +
        '<span class="cc-obs-route">' + esc(endpoint) + '</span>' +
      '</div>' +
      '<div class="cc-obs-tools" aria-label="Observed tools">' +
        TOOLS.map(function (t) {
          return '<span class="cc-obs-tool">' + esc(t.name) + '</span>';
        }).join('') +
      '</div>' +
      '<div class="cc-obs-actions">' +
        '<button type="button" class="cc-obs-run" data-cc-obs-run><span class="cc-obs-run-icon" aria-hidden="true">&#9654;</span> Run live trace</button>' +
      '</div>' +
      '<div class="cc-obs-status" data-state="idle" role="status" aria-live="polite">' +
        '<span class="cc-obs-status-text">Idle - press "Run live trace" to call the real MCP endpoint.</span>' +
      '</div>' +
      '<ol class="cc-obs-steps">' +
        TOOLS.map(function (t) {
          return '<li class="cc-obs-step" data-state="idle" data-step-tool="' + esc(t.name) + '">' +
            '<span class="cc-obs-step-mark" aria-hidden="true">.</span>' +
            '<span class="cc-obs-step-name">' + esc(t.label) + '</span>' +
            '<span class="cc-obs-step-note"></span>' +
          '</li>';
        }).join('') +
      '</ol>' +
      '<div class="cc-obs-result" hidden>' +
        '<div class="cc-obs-result-label">Live result &mdash; sourced from this site</div>' +
        '<div class="cc-obs-result-url"></div>' +
        '<div class="cc-obs-result-excerpt"></div>' +
      '</div>';

    root.innerHTML = html;

    var runBtn = root.querySelector('[data-cc-obs-run]');
    var statusEl = root.querySelector('.cc-obs-status');
    var statusText = root.querySelector('.cc-obs-status-text');
    var resultEl = root.querySelector('.cc-obs-result');
    var resultUrl = root.querySelector('.cc-obs-result-url');
    var resultExcerpt = root.querySelector('.cc-obs-result-excerpt');
    var stepEls = {};

    TOOLS.forEach(function (t) {
      stepEls[t.name] = root.querySelector('[data-step-tool="' + t.name + '"]');
    });

    function setStatus(state, text) {
      statusEl.setAttribute('data-state', state);
      statusText.textContent = text;
    }

    function setStep(name, state, note) {
      var el = stepEls[name];
      if (!el) return;
      el.setAttribute('data-state', state);
      var mark = el.querySelector('.cc-obs-step-mark');
      if (state === 'running') mark.textContent = '...';
      if (state === 'success') mark.textContent = 'ok';
      if (state === 'error') mark.textContent = '!';
      if (state === 'idle') mark.textContent = '.';
      el.querySelector('.cc-obs-step-note').textContent = note || '';
    }

    function resetSteps() {
      TOOLS.forEach(function (t) { setStep(t.name, 'idle', ''); });
    }

    async function rpc(method, params, headers) {
      var headersOut = {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'MCP-Protocol-Version': PROTOCOL,
        ...headers,
      };
      var res = await fetch(endpoint, {
        method: 'POST',
        headers: headersOut,
        body: JSON.stringify({ jsonrpc: '2.0', id: Date.now() % 1000000, method: method, params: params || {} }),
        credentials: 'omit',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        if (res.status === 202 || res.status === 204) return null; // notification accepted
        throw new Error('HTTP ' + res.status);
      }
      var data = await res.json();
      if (data && data.error) throw new Error(data.error.message || ('RPC error ' + data.error.code));
      return data.result || null;
    }

    function parseResult(raw) {
      var text = raw && raw.content && raw.content[0] ? raw.content[0].text : '';
      try { return JSON.parse(text); } catch (e) { return null; }
    }

    function runTrace() {
      if (runBtn.disabled) return;
      runBtn.disabled = true;
      runBtn.querySelector('.cc-obs-run-icon').textContent = '...';
      resultEl.hidden = true;
      resetSteps();
      setStatus('running', 'Running live trace against the real MCP endpoint...');

      (async function () {
        try {
          // 0. handshake
          setStep('search_site', 'running', 'initialize + tools/list');
          await rpc('initialize', {
            protocolVersion: PROTOCOL,
            capabilities: {},
            clientInfo: { name: 'cc-observatory', version: '1.0.0' },
          });
          var listed = await rpc('tools/list');
          var names = (listed && listed.tools ? listed.tools : []).map(function (t) { return t.name; });
          for (var i = 0; i < TOOLS.length; i++) {
            if (names.indexOf(TOOLS[i].name) === -1) {
              throw new Error('tools/list did not expose ' + TOOLS[i].name + ' (got: ' + names.join(', ') + ')');
            }
          }

          // 1. search_site
          setStep('search_site', 'running', 'search_site("' + query + '")');
          var searchRaw = await rpc('tools/call', { name: 'search_site', arguments: { query: query, limit: 3 } });
          var searchResults = parseResult(searchRaw) || [];
          var first = searchResults[0];
          var foundNote = first ? first.title || first.url : '0 results (empty result is a success)';
          setStep('search_site', 'success', foundNote);

          // 2. get_page_content
          if (first && first.url) {
            setStep('get_page_content', 'running', 'get_page_content(' + first.url + ')');
          } else {
            setStep('get_page_content', 'running', 'no result from search_site to read');
          }
          var readRaw = first && first.url
            ? await rpc('tools/call', { name: 'get_page_content', arguments: { uri: first.url } })
            : null;
          var page = readRaw ? parseResult(readRaw) : null;
          var excerpt = page && page.markdown ? page.markdown : (page && page.title ? page.title : '');
          var readNote = excerpt ? truncate(excerpt.replace(/\s+/g, ' ').trim(), 90) : 'answered (read-only)';
          if (first && first.url) {
            resultUrl.innerHTML = 'Found: <a href="' + esc(first.url) + '" target="_blank" rel="noopener">' + esc(first.title || first.url) + '</a>';
          }
          setStep('get_page_content', 'success', readNote);

          // 3. get_sitemap
          setStep('get_sitemap', 'running', 'get_sitemap()');
          var sitemapRaw = await rpc('tools/call', { name: 'get_sitemap', arguments: {} });
          var sitemapData = parseResult(sitemapRaw);
          var sitemapEntries = Array.isArray(sitemapData)
            ? sitemapData
            : (sitemapData && Array.isArray(sitemapData.entries)
                ? sitemapData.entries
                : (sitemapData && Array.isArray(sitemapData.pages) ? sitemapData.pages : null));
          var sitemapType = null;
          if (sitemapEntries && sitemapEntries.length) {
            for (var i2 = 0; i2 < sitemapEntries.length; i2++) {
              if (sitemapEntries[i2] && sitemapEntries[i2].type) { sitemapType = sitemapEntries[i2].type; break; }
            }
          }
          var sitemapNote = sitemapEntries ? sitemapEntries.length + ' entries' + (sitemapType ? ' (type: ' + sitemapType + ')' : '') : 'answered';
          setStep('get_sitemap', 'success', sitemapNote);

          // 4. list_content (type from sitemap when available)
          var listArgs = {};
          if (sitemapType) listArgs.type = sitemapType;
          setStep('list_content', 'running', sitemapType ? 'list_content(type: ' + sitemapType + ')' : 'list_content()');
          var listRaw = await rpc('tools/call', { name: 'list_content', arguments: listArgs });
          var listData = parseResult(listRaw);
          var items = listData && listData.items ? listData.items : (Array.isArray(listData) ? listData : null);
          var listNote = items ? items.length + ' items' : 'answered (empty result is a success)';
          setStep('list_content', 'success', listNote);

          if (excerpt) {
            resultExcerpt.textContent = '"...' + truncate(excerpt.replace(/\s+/g, ' ').trim(), 240) + '"';
          }
          setStatus('success', 'Live trace complete - all four read-only tools executed successfully.');
          runBtn.disabled = false;
          runBtn.querySelector('.cc-obs-run-icon').textContent = '>';
        } catch (err) {
          setStatus('error', 'Trace failed: ' + truncate(err && err.message ? err.message : String(err), 180) + ' - this is a real error state, no simulated result.');
          var failedStep = currentRunningStep();
          if (failedStep) setStep(failedStep, 'error', 'failed');
          runBtn.disabled = false;
          runBtn.querySelector('.cc-obs-run-icon').textContent = '>';
        }
      })();
    }

    function currentRunningStep() {
      for (var i = 0; i < TOOLS.length; i++) {
        var el = stepEls[TOOLS[i].name];
        if (el && el.getAttribute('data-state') === 'running') return TOOLS[i].name;
      }
      return null;
    }

    runBtn.addEventListener('click', runTrace);
  }

  function mountAll() {
    document.querySelectorAll('[data-cc-observatory]').forEach(mount);
  }

  window.CcObservatory = { mountAll: mountAll };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountAll);
  } else {
    mountAll();
  }
})();
</script>
<script>/* ============================================================
   Corsen Context shared navigation  - logic (v5)
   Injects nav+footer into [data-cc-nav] / [data-cc-foot].
   Mobile toggle, aria-expanded, Escape, per-stack accent.
   v3: builds every node through the DOM API (createElement /
   textContent / setAttribute) — no innerHTML anywhere, so page
   attributes can never be reinterpreted as HTML (CodeQL
   js/xss-through-dom). href values pass a scheme allowlist.
   v5: every href written to the DOM is a constant from this file.
   data-repository is resolved through an allowlist of known
   repositories and data-home through a two-value switch, so no
   attribute text ever reaches an href sink.
   ============================================================ */
(function () {
  'use strict';

  var FLAGSHIP = 'https://webmcp.corsen.ai';
  var MAIN_REPO = 'https://github.com/CorsenAI/corsen-context';
  var REPOS = {
    WordPress: 'https://github.com/CorsenAI/corsen-context-wordpress',
    Express: 'https://github.com/CorsenAI/corsen-context-express',
    'Next.js': 'https://github.com/CorsenAI/corsen-context-nextjs',
    Astro: 'https://github.com/CorsenAI/corsen-context-astro',
    'Static HTML': 'https://github.com/CorsenAI/corsen-context-static-html',
    Netlify: 'https://github.com/CorsenAI/corsen-context-netlify',
    Ghost: 'https://github.com/CorsenAI/corsen-context-ghost',
    Strapi: 'https://github.com/CorsenAI/corsen-context-strapi',
    Directus: 'https://github.com/CorsenAI/corsen-context-directus',
    Wagtail: 'https://github.com/CorsenAI/corsen-context-wagtail',
    MediaWiki: 'https://github.com/CorsenAI/corsen-context-mediawiki',
  };

  /* Repositories a page may name in data-repository. Any other value falls
     back to the stack default, so the attribute can select a constant but
     can never inject a destination. */
  var KNOWN_REPOSITORIES = {};
  KNOWN_REPOSITORIES[MAIN_REPO] = MAIN_REPO;
  Object.keys(REPOS).forEach(function (stack) {
    KNOWN_REPOSITORIES[REPOS[stack]] = REPOS[stack];
  });

  function applyAccent(root) {
    var acc = String(root.getAttribute('data-accent') || '').trim();
    if (/^#[0-9a-fA-F]{3,8}$/.test(acc)) root.style.setProperty('--cc-accent', acc);
  }

  /* href allowlist: in-page anchors, root-relative paths, http(s) only. */
  function safeHref(value, fallback) {
    var s = String(value || '').trim();
    var lower = s.toLowerCase();
    if (s.charAt(0) === '#' || s.charAt(0) === '/') return s;
    if (lower.indexOf('https://') === 0 || lower.indexOf('http://') === 0) return s;
    return fallback;
  }

  /* id fragments: [A-Za-z0-9_-] only. */
  function safeId(value) {
    var s = String(value || '').replace(/[^A-Za-z0-9_-]/g, '');
    return s || 'm';
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function link(className, href, text, external) {
    var a = el('a', className, text);
    a.setAttribute('href', safeHref(href, '#top'));
    if (external) {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }
    return a;
  }

  var LINKS = [
    { text: 'Live trace', href: '#live' },
    { text: 'How it works', href: '#how' },
    { text: 'All integrations', href: FLAGSHIP + '/#integrations', external: true },
  ];

  function repositoryFor(root, stack) {
    var declared = String(root.getAttribute('data-repository') || '').trim();
    if (Object.prototype.hasOwnProperty.call(KNOWN_REPOSITORIES, declared)) {
      return KNOWN_REPOSITORIES[declared];
    }
    return REPOS[stack] || MAIN_REPO;
  }

  /* data-home selects between two constants: the site root or the
     in-page top anchor. */
  function homeFor(root) {
    return root.getAttribute('data-home') === '/' ? '/' : '#top';
  }

  function appendLinks(container, repository) {
    LINKS.forEach(function (l) {
      container.appendChild(link('cc-nav-link', l.href, l.text, l.external));
    });
    container.appendChild(link('cc-nav-link', repository, 'Get this integration', true));
    container.appendChild(link('cc-nav-cta', FLAGSHIP, 'Flagship', true));
    return container;
  }

  function mount(root) {
    if (!root || root.__ccNavMounted) return;
    root.__ccNavMounted = true;
    applyAccent(root);

    var stack = root.getAttribute('data-stack') || 'Demo';
    var repository = repositoryFor(root, stack);
    var uid = safeId(root.getAttribute('data-uid'));
    var homeHref = homeFor(root);

    var nav = el('div', 'cc-nav');
    var inner = el('div', 'cc-nav-inner');

    var logo = el('a', 'cc-nav-logo');
    logo.setAttribute('href', homeHref);
    var mark = el('span', 'cc-nav-mark');
    mark.setAttribute('aria-hidden', 'true');
    mark.textContent = 'C';
    logo.appendChild(mark);
    logo.appendChild(document.createTextNode('Corsen Context'));

    var navEl = el('nav', 'cc-nav-links');
    navEl.setAttribute('aria-label', 'Primary');
    appendLinks(navEl, repository);

    var toggle = el('button', 'cc-nav-toggle');
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', 'cc-nav-mobile-' + uid);
    toggle.setAttribute('aria-label', 'Open menu');
    toggle.appendChild(el('span'));
    toggle.appendChild(el('span'));
    toggle.appendChild(el('span'));

    inner.appendChild(logo);
    inner.appendChild(el('span', 'cc-nav-stack', stack));
    inner.appendChild(navEl);
    inner.appendChild(toggle);

    var mobile = el('nav', 'cc-nav-mobile');
    mobile.id = 'cc-nav-mobile-' + uid;
    mobile.setAttribute('aria-label', 'Primary mobile');
    appendLinks(mobile, repository);

    nav.appendChild(inner);
    nav.appendChild(mobile);

    root.textContent = '';
    root.appendChild(nav);

    var toggleBtn = root.querySelector('.cc-nav-toggle');
    var mobileNav = root.querySelector('.cc-nav-mobile');
    if (toggleBtn && mobileNav) {
      toggleBtn.addEventListener('click', function () {
        var open = mobileNav.classList.toggle('is-open');
        toggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        toggleBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      });
      window.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && mobileNav.classList.contains('is-open')) {
          mobileNav.classList.remove('is-open');
          toggleBtn.setAttribute('aria-expanded', 'false');
          toggleBtn.setAttribute('aria-label', 'Open menu');
          toggleBtn.focus();
        }
      });
    }
  }

  function mountFooter(root) {
    if (!root || root.__ccFootMounted) return;
    root.__ccFootMounted = true;
    applyAccent(root);

    var stack = root.getAttribute('data-stack') || 'Demo';
    var repository = repositoryFor(root, stack);

    var wrap = el('div', 'cc-foot-common');

    var linksEl = el('div', 'cc-foot-links');
    linksEl.appendChild(link('', FLAGSHIP, 'Flagship demo', true));
    linksEl.appendChild(link('', repository, 'Download this integration', true));

    wrap.appendChild(linksEl);
    wrap.appendChild(el('div', 'cc-foot-stack', 'Demonstration site — stack: ' + stack));

    var legal = el('div', 'cc-foot-legal');
    legal.appendChild(el('span', '', 'Open-source demo (MIT), built for The WebMCP Challenge.'));
    legal.appendChild(
      el(
        'span',
        '',
        'No form or account is required for this read-only demo; hosting logs may apply.',
      ),
    );
    wrap.appendChild(legal);

    wrap.appendChild(el('span', 'cc-foot-mit', 'MIT License'));

    root.textContent = '';
    root.appendChild(wrap);
  }

  function mountAll() {
    document.querySelectorAll('[data-cc-nav]').forEach(function (node) {
      if (node.querySelector('.cc-nav')) return;
      mount(node);
    });
    document.querySelectorAll('[data-cc-foot]').forEach(function (node) {
      if (node.querySelector('.cc-foot-common')) return;
      mountFooter(node);
    });
  }

  window.CcNav = { mountAll: mountAll, mountFooter: mountFooter };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountAll);
  } else {
    mountAll();
  }
})();
</script>
</body></html>`;
app.get('/', async (_req, res) => {
  const posts = await fetchPosts();
  const items = posts
    .map((p) => `<li><a href="${escAttr(p.path)}">${esc(p.title)}</a> — ${esc(p.description)}</li>`)
    .join('\n');
  res.type('html').send(
    pageShell(
      'Wagtail + Corsen Context',
      `<h1>A Wagtail site that talks to AI agents</h1>
<p>Wagtail runs on Python/Django. Corsen Context uses a Node bridge over
<strong>the Wagtail API</strong> — the same four tools over
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

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const message = error instanceof Error ? error.message : 'Unexpected runtime error';
  console.error(`[wagtail-cms] ${message}`);
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
const HOST = process.env.HOST || '127.0.0.1';
app.listen(PORT, HOST, () => {
  console.log(`Wagtail + Corsen Context demo at ${SITE_URL} (port ${PORT})`);
});
