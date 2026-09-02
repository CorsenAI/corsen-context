import { CorsenContext, MCP_PROTOCOL_VERSION, extractClientIp } from '@corsenai/corsen-context';
import { pages } from '../../content.mjs';

const SITE_URL = 'https://corsen-context-demo.netlify.app';

const provider = {
  async getPages() {
    return pages.map((p) => ({
      url: `${SITE_URL}${p.path}`,
      title: p.title,
      description: p.description,
      type: p.type,
      lastModified: p.lastModified,
    }));
  },
  async getPageContent(url) {
    const page = pages.find((p) => `${SITE_URL}${p.path}` === url);
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
    const q = query.toLowerCase();
    return (await this.getPages())
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
    mcp: { enabled: true },
    static: { generateLlmsTxt: true, includeFullContent: true },
    security: { trustProxy: true },
  },
  provider,
);

const server = cc.createMCPServer();

function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

export default async (req) => {
  const method = (req.method || 'GET').toUpperCase();
  const origin = req.headers.get('Origin') || undefined;

  if (method === 'OPTIONS') {
    const headers = { ...server.getCorsHeaders(origin) };
    return new Response(null, { status: 204, headers });
  }
  if (method !== 'POST') {
    return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  }
  if (!server.validateRequestOrigin(origin)) {
    return json(403, {
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Invalid Origin' },
      id: null,
    });
  }

  const contentType = (req.headers.get('Content-Type') || '').split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/json') {
    return json(415, {
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Content-Type must be application/json' },
      id: null,
    });
  }
  const accept = (req.headers.get('Accept') || '').trim().toLowerCase();
  if (accept && !accept.includes('application/json') && !accept.includes('*/*')) {
    return json(406, {
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Client must accept application/json' },
      id: null,
    });
  }

  const clientIp = extractClientIp(
    Object.fromEntries(req.headers.entries()),
    req.headers.get('x-nf-client-connection-ip') || undefined,
    true,
  );
  const apiKey =
    req.headers.get('x-mcp-key') ||
    req.headers.get('authorization')?.replace('Bearer ', '') ||
    undefined;

  const rateLimit = await server.checkRateLimit(clientIp, apiKey);
  if (!rateLimit.allowed) {
    return json(
      429,
      {
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Rate limit exceeded' },
        id: null,
      },
      Object.fromEntries(Object.entries(rateLimit.headers)),
    );
  }
  if (!server.checkAuth(apiKey)) {
    return json(401, {
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Unauthorized' },
      id: null,
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, {
      jsonrpc: '2.0',
      error: { code: -32700, message: 'Parse error' },
      id: null,
    });
  }

  const isResponse =
    !!body &&
    typeof body === 'object' &&
    !Array.isArray(body) &&
    !('method' in body) &&
    ('result' in body || 'error' in body);
  if (isResponse) {
    return json(400, {
      jsonrpc: '2.0',
      error: { code: -32600, message: 'JSON-RPC responses are not accepted' },
      id: null,
    });
  }

  const methodName =
    body && typeof body === 'object' && !Array.isArray(body) ? body.method : undefined;
  if (typeof methodName === 'string' && methodName !== 'initialize') {
    const requestedVersion = req.headers.get('MCP-Protocol-Version') || '2025-03-26';
    if (requestedVersion !== MCP_PROTOCOL_VERSION) {
      return json(400, {
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Unsupported MCP-Protocol-Version' },
        id: null,
      });
    }
  }

  const result = await server.handleRequest(body, clientIp, apiKey, { skipRateLimit: true });
  if (result === null) return new Response(null, { status: 202 });

  const headers = { ...server.getSecurityHeaders(), ...server.getCorsHeaders(origin) };
  return json(200, result, headers);
};

export const config = { path: '/v1/mcp' };
