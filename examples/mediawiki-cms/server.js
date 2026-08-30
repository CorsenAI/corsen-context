import express from 'express';
import {
  CorsenContext,
  MCP_PROTOCOL_VERSION,
  extractClientIp,
  generateWebMCPScript,
  toWebMCPTools,
} from '@corsenai/corsen-context';

/**
 * MediaWiki wrapped by Corsen Context. MediaWiki stays internal; this server
 * is the public, agent-native front door. The provider reads pages through
 * the MediaWiki Action API — public reads, no key needed.
 */
const SITE_URL = (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
const MW_API = (process.env.MW_API_URL || 'http://127.0.0.1:8080/api.php').trim();
const MW_USER_AGENT = (
  process.env.MW_USER_AGENT ||
  'Corsen-Context-Example/1.0 (https://github.com/CorsenAI/corsen-context)'
).trim();
const TRUST_PROXY = process.env.TRUST_PROXY === '1';

function boundedInteger(name, fallback, min, max) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  const value = Number.parseInt(raw, 10);
  if (value < min || value > max) {
    throw new Error(`${name} must be between ${min} and ${max}`);
  }
  return value;
}

const MW_MAX_PAGES = boundedInteger('MW_MAX_PAGES', 100, 1, 200);
const MW_BATCH_SIZE = boundedInteger('MW_BATCH_SIZE', 20, 1, 50);
const MW_CACHE_TTL_MS = boundedInteger('MW_CACHE_TTL_MS', 30_000, 1_000, 300_000);

let parsedApiUrl;
try {
  parsedApiUrl = new URL(MW_API);
} catch {
  throw new Error('MW_API_URL must be a valid absolute HTTP or HTTPS URL');
}
if (!['http:', 'https:'].includes(parsedApiUrl.protocol)) {
  throw new Error('MW_API_URL must use HTTP or HTTPS');
}
if (!MW_USER_AGENT) {
  throw new Error('MW_USER_AGENT cannot be empty');
}

async function mwApi(params) {
  const url = new URL(parsedApiUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatversion', '2');

  let res;
  try {
    res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': MW_USER_AGENT,
      },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'network failure';
    throw new Error(`MediaWiki API request failed: ${reason}`);
  }
  if (!res.ok) throw new Error(`MediaWiki API returned HTTP ${res.status}`);

  let body;
  try {
    body = await res.json();
  } catch {
    throw new Error('MediaWiki API returned invalid JSON');
  }
  if (body.error) {
    const code = body.error.code || 'unknown';
    const info = body.error.info || 'request rejected';
    throw new Error(`MediaWiki API error ${code}: ${info}`);
  }
  return body;
}

async function fetchPageTitles() {
  const titles = [];
  const seenTitles = new Set();
  const seenContinuations = new Set();
  let continuation;

  for (let requestCount = 0; requestCount < 10 && titles.length < MW_MAX_PAGES; requestCount += 1) {
    const data = await mwApi({
      action: 'query',
      list: 'allpages',
      aplimit: String(Math.min(50, MW_MAX_PAGES - titles.length + 1)),
      apnamespace: '0',
      apcontinue: continuation,
    });
    for (const page of data.query?.allpages || []) {
      if (!page.title || page.title === 'Main Page' || seenTitles.has(page.title)) continue;
      seenTitles.add(page.title);
      titles.push(page.title);
      if (titles.length === MW_MAX_PAGES) break;
    }

    const nextContinuation = data.continue?.apcontinue;
    if (!nextContinuation || seenContinuations.has(nextContinuation)) break;
    seenContinuations.add(nextContinuation);
    continuation = nextContinuation;
  }

  return titles;
}

async function loadPages() {
  const titles = await fetchPageTitles();
  const pages = [];
  for (let offset = 0; offset < titles.length; offset += MW_BATCH_SIZE) {
    const batch = titles.slice(offset, offset + MW_BATCH_SIZE);
    const detail = await mwApi({
      action: 'query',
      prop: 'extracts|info',
      explaintext: '1',
      exintro: '0',
      titles: batch.join('|'),
    });
    const detailPages = Array.isArray(detail.query?.pages)
      ? detail.query.pages
      : Object.values(detail.query?.pages || {});
    for (const page of detailPages) {
      if (!page || page.missing !== undefined || !page.title) continue;
      const text = page.extract || '';
      pages.push({
        path: `/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
        title: page.title,
        description: text.split('\n')[0]?.slice(0, 160) || '',
        text,
        lastModified: page.touched,
      });
    }
  }
  return pages;
}

let cachedPages = null;
let cacheExpiresAt = 0;
let pageLoadPromise = null;

async function fetchPages() {
  if (cachedPages && Date.now() < cacheExpiresAt) return cachedPages;
  if (pageLoadPromise) return pageLoadPromise;

  pageLoadPromise = loadPages().then((pages) => {
    cachedPages = pages;
    cacheExpiresAt = Date.now() + MW_CACHE_TTL_MS;
    return pages;
  });
  try {
    return await pageLoadPromise;
  } finally {
    pageLoadPromise = null;
  }
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
const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);
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

app.get(
  '/llms.txt',
  asyncHandler(async (_req, res) => {
    if (!cc.getConfig().static.generateLlmsTxt) {
      return res.status(404).set('Cache-Control', 'no-store').end();
    }
    res
      .type('text/plain')
      .set('Cache-Control', 'public, max-age=300')
      .send(await cc.generateLlmsTxt());
  }),
);

app.get(
  '/llms-full.txt',
  asyncHandler(async (_req, res) => {
    const config = cc.getConfig();
    const includeFullContent = config.static.includeFullContent;
    if (!config.static.generateLlmsTxt || !includeFullContent) {
      return res.status(404).set('Cache-Control', 'no-store').end();
    }
    res
      .type('text/plain')
      .set('Cache-Control', 'public, max-age=300')
      .send(await cc.generateLlmsFullTxt());
  }),
);

app.options('/v1/mcp', (_req, res) => res.status(204).end());

app.get('/v1/mcp', (_req, res) => {
  res.set('Allow', 'POST');
  return res.status(405).end();
});

app.post(
  '/v1/mcp',
  mcpPostPreflight,
  mcpJsonParser,
  asyncHandler(async (req, res) => {
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
  }),
);

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

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const webmcpScriptTag = cc.getConfig().mcp.enabled
  ? '<script src="/webmcp.js" defer></script>'
  : '';
const pageShell = (title, inner) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>${webmcpScriptTag}</head>
<body><main style="max-width:680px;margin:0 auto;padding:2rem;font-family:system-ui;line-height:1.5">
${inner}
<p style="margin-top:2rem;color:#888;font-size:14px"><a href="/">Home</a> — MediaWiki + Corsen Context</p>
</main></body></html>`;

app.get(
  '/',
  asyncHandler(async (_req, res) => {
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
  }),
);

app.use(
  asyncHandler(async (req, res, next) => {
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
  }),
);

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const message = error instanceof Error ? error.message : 'Unexpected runtime error';
  console.error(`[mediawiki-cms] ${message}`);
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
  console.log(`MediaWiki + Corsen Context demo at ${SITE_URL} (port ${PORT})`);
});
