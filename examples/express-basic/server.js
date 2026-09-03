import express from 'express';
import {
  CorsenContext,
  MCP_PROTOCOL_VERSION,
  extractClientIp,
  generateWebMCPScript,
  toWebMCPTools,
} from '@corsenai/corsen-context';
import { pages } from './content.js';
import { renderPage } from './render.js';

const SITE_URL = (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
const TRUST_PROXY = process.env.TRUST_PROXY === '1';

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

const cc = new CorsenContext(
  {
    siteUrl: SITE_URL,
    mcp: { enabled: process.env.CORSEN_CONTEXT_MCP_ENABLED !== 'false' },
    static: {
      generateLlmsTxt: process.env.CORSEN_CONTEXT_LLMS_TXT_ENABLED !== 'false',
      includeFullContent: process.env.CORSEN_CONTEXT_LLMS_FULL_TXT_ENABLED === 'true',
    },
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
    .set('Cache-Control', 'public, max-age=3600')
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
    .set('Cache-Control', 'public, max-age=3600')
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
  return res.json(result);
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
  console.error('MCP request failed:', error instanceof Error ? error.message : 'unknown error');
  return res.status(500).json({
    jsonrpc: '2.0',
    error: { code: -32603, message: 'Internal error' },
    id: null,
  });
});

app.get('/webmcp.js', (_req, res) => {
  const server = cc.createMCPServer();
  const script = generateWebMCPScript(toWebMCPTools(server.getToolDefinitions()));
  for (const [key, value] of Object.entries(server.getSecurityHeaders())) res.set(key, value);
  res.type('application/javascript').set('Cache-Control', 'public, max-age=3600').send(script);
});

app.get('/webmcp-status.js', (_req, res) => {
  res.type('application/javascript').set('Cache-Control', 'public, max-age=3600').send(`(() => {
  const target = document.querySelector('[data-webmcp-status]');
  if (!target) return;
  const available = typeof document.modelContext?.registerTool === 'function';
  target.textContent = available ? 'available' : 'not available in this browser';
  target.dataset.state = available ? 'available' : 'unavailable';
})();`);
});

// Human pages are rendered from the same records as the four tools.
app.get('*path', (req, res, next) => {
  const page = pages.find((item) => item.path === req.path);
  if (!page) return next();
  const html = renderPage(page);
  const output = cc.getConfig().mcp.enabled
    ? html
    : html.replace('<script src="/webmcp.js" defer></script>', '');
  return res.type('html').send(output);
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';
app.listen(PORT, HOST, () => {
  console.log(`Aurora Kits Express demo running at http://localhost:${PORT}`);
  console.log('  GET /llms.txt');
  console.log('  POST /v1/mcp');
  console.log('  GET /webmcp.js');
});
