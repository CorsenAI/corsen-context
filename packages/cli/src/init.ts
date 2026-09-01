import { existsSync, readFileSync, writeFileSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';

type Framework =
  'nextjs-app' | 'nextjs-pages' | 'express' | 'astro' | 'hugo' | 'wordpress' | 'static' | 'unknown';

interface DetectionResult {
  framework: Framework;
  label: string;
}

export function detectFramework(cwd: string): DetectionResult {
  // WordPress
  if (existsSync(join(cwd, 'wp-config.php')) || existsSync(join(cwd, 'wp-content'))) {
    return { framework: 'wordpress', label: 'WordPress' };
  }

  // Hugo
  if (
    existsSync(join(cwd, 'hugo.toml')) ||
    existsSync(join(cwd, 'hugo.yaml')) ||
    existsSync(join(cwd, 'config.toml'))
  ) {
    return { framework: 'hugo', label: 'Hugo' };
  }

  const pkgPath = join(cwd, 'package.json');
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

    if (allDeps['next']) {
      // Detect App Router vs Pages Router
      if (existsSync(join(cwd, 'app')) || existsSync(join(cwd, 'src', 'app'))) {
        return { framework: 'nextjs-app', label: 'Next.js (App Router)' };
      }
      return { framework: 'nextjs-pages', label: 'Next.js (Pages Router)' };
    }
    if (allDeps['astro']) return { framework: 'astro', label: 'Astro' };
    if (allDeps['express']) return { framework: 'express', label: 'Express' };
  }

  if (existsSync(join(cwd, 'index.html'))) {
    return { framework: 'static', label: 'Static Site' };
  }

  return { framework: 'unknown', label: 'Unknown' };
}

function writeIfNotExists(filePath: string, content: string): boolean {
  mkdirSync(dirname(filePath), { recursive: true });
  // Exclusive create: no existsSync/write window for a racing process.
  let fd: number | undefined;
  try {
    fd = openSync(filePath, 'wx');
    writeFileSync(fd, content, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
      console.log(`  Skipped: ${filePath} (already exists)`);
      return false;
    }
    throw err;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
  console.log(`  Created: ${filePath}`);
  return true;
}

function relativeModuleSpecifier(fromFile: string, toFile: string): string {
  let specifier = relative(dirname(fromFile), toFile).replace(/\\/g, '/');
  if (!specifier.startsWith('.')) specifier = `./${specifier}`;
  return specifier;
}

function withSharedConfig(template: string, outputPath: string, configPath: string): string {
  return template.replaceAll(
    '__CORSEN_CONTEXT_CONFIG__',
    relativeModuleSpecifier(outputPath, configPath),
  );
}

function withSharedProvider(template: string, outputPath: string, providerPath: string): string {
  const providerSpecifier = relativeModuleSpecifier(outputPath, providerPath).replace(/\.ts$/, '');
  return template.replaceAll('__CORSEN_CONTEXT_PROVIDER__', providerSpecifier);
}

function withSharedRuntime(
  template: string,
  outputPath: string,
  configPath: string,
  providerPath: string,
): string {
  return withSharedProvider(
    withSharedConfig(template, outputPath, configPath),
    outputPath,
    providerPath,
  );
}

// --- Config Template ---

const CONFIG_TEMPLATE = `/** @type {import('@corsenai/corsen-context').CorsenContextConfig} */
export default {
  siteUrl: 'https://your-site.com',
  siteName: 'Your Site Name',
  description: 'Short description for AI agents.',

  static: {
    generateLlmsTxt: true,
    includeFullContent: false,
    maxOutputBytes: 5242880,
  },

  mcp: {
    enabled: true,
    // Generated filesystem routes are fixed at /v1/mcp.
    tools: ['search_site', 'get_page_content', 'list_content', 'get_sitemap'],
  },

  content: {
    postTypes: ['post', 'page'],
    excludePaths: ['/admin', '/cart', '/checkout'],
    maxPages: 500,
  },

  security: {
    rateLimit: 100,
    burstLimit: 10,
    allowedOrigins: [],
    // Only trust X-Forwarded-For / X-Real-IP when behind a proxy you control.
    trustProxy: false,
  },

  cache: {
    enabled: true,
    ttl: 3600,
    // Set "redis" only when injecting a RedisCache into the runtime handler.
    driver: 'memory',
  },

  credit: true,
};
`;

const CONFIG_DECLARATION_TEMPLATE = `declare const config: import('@corsenai/corsen-context').CorsenContextConfig;
export default config;
`;

// --- Next.js App Router Templates ---

const NEXTJS_APP_PROVIDER = `import type { ContentProvider } from '@corsenai/corsen-context';

/**
 * Implement your content provider here.
 * This tells Corsen Context how to access your site's pages.
 *
 * Replace the stub methods below with real data from your CMS,
 * database, filesystem, or API.
 */
export const siteProvider: ContentProvider = {
  async getPages() {
    // Return all public pages with metadata.
    // Example:
    // return [
    //   { url: 'https://your-site.com/', title: 'Home', description: 'Welcome', type: 'page' },
    //   { url: 'https://your-site.com/blog/hello', title: 'Hello', description: '...', type: 'post' },
    // ];
    return [];
  },

  async getPageContent(url) {
    // Return full markdown content for a given URL.
    // Example:
    // return { url, title: 'Page', description: '...', markdown: '# Page\\n\\nContent', metadata: {} };
    return null;
  },

  async searchContent(query, limit) {
    // Return search results matching the query.
    // Example:
    // return [{ url: '...', title: '...', description: '...', snippet: '...', score: 1 }];
    return [];
  },
};
`;

const NEXTJS_APP_MCP_ROUTE = `import { createMCPHandler } from '@corsenai/corsen-context-nextjs';
import { siteProvider } from '__CORSEN_CONTEXT_PROVIDER__';
import corsenConfig from '__CORSEN_CONTEXT_CONFIG__';

const { GET, POST, OPTIONS } = createMCPHandler(corsenConfig, siteProvider);
export { GET, POST, OPTIONS };
`;

const NEXTJS_APP_LLMS_ROUTE = `import { createLlmsTxtHandler } from '@corsenai/corsen-context-nextjs';
import { siteProvider } from '__CORSEN_CONTEXT_PROVIDER__';
import corsenConfig from '__CORSEN_CONTEXT_CONFIG__';

export const GET = createLlmsTxtHandler(corsenConfig, siteProvider);
`;

const NEXTJS_APP_LLMS_FULL_ROUTE = `import { createLlmsFullTxtHandler } from '@corsenai/corsen-context-nextjs';
import { siteProvider } from '__CORSEN_CONTEXT_PROVIDER__';
import corsenConfig from '__CORSEN_CONTEXT_CONFIG__';

export const GET = createLlmsFullTxtHandler(corsenConfig, siteProvider);
`;

const NEXTJS_APP_WEBMCP_ROUTE = `import { createWebMCPScriptHandler } from '@corsenai/corsen-context-nextjs';
import { siteProvider } from '__CORSEN_CONTEXT_PROVIDER__';
import corsenConfig from '__CORSEN_CONTEXT_CONFIG__';

export const GET = createWebMCPScriptHandler(corsenConfig, siteProvider);
`;

// --- Next.js Pages Router Templates ---

const NEXTJS_PAGES_MCP_ROUTE = `import type { NextApiRequest, NextApiResponse } from 'next';
import { Buffer } from 'node:buffer';
import {
  CorsenContext,
  MCP_PROTOCOL_VERSION,
  extractClientIp,
} from '@corsenai/corsen-context';
import corsenConfig from '__CORSEN_CONTEXT_CONFIG__';
import { siteProvider } from '__CORSEN_CONTEXT_PROVIDER__';

const cc = new CorsenContext(corsenConfig, siteProvider);

// Disable Next.js's eager parser so revocation, Origin, media, rate-limit and
// auth gates all run before the bounded body read.
export const config = { api: { bodyParser: false } };

async function readJsonBody(req: NextApiRequest, res: NextApiResponse) {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > 102400) {
      res.status(413).json({
        jsonrpc: '2.0', error: { code: -32600, message: 'Request body too large' }, id: null,
      });
      return { ok: false as const };
    }
    chunks.push(buffer);
  }
  try {
    return { ok: true as const, body: JSON.parse(Buffer.concat(chunks, total).toString('utf8')) };
  } catch {
    res.status(400).json({
      jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null,
    });
    return { ok: false as const };
  }
}

function isJsonRpcResponse(body: unknown): boolean {
  return !!body
    && typeof body === 'object'
    && !Array.isArray(body)
    && !('method' in body)
    && ('result' in body || 'error' in body);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!cc.getConfig().mcp.enabled) {
    res.status(404).end();
    return;
  }
  const server = cc.createMCPServer();

  // Security headers and Origin validation come before transport handling.
  for (const [key, value] of Object.entries(server.getSecurityHeaders())) {
    res.setHeader(key, value);
  }
  const origin = req.headers.origin || undefined;
  if (!server.validateRequestOrigin(origin)) {
    res.status(403).json({
      jsonrpc: '2.0', error: { code: -32000, message: 'Invalid Origin' }, id: null,
    });
    return;
  }

  if (req.method === 'OPTIONS') {
    for (const [key, value] of Object.entries(server.getCorsHeaders(origin))) {
      res.setHeader(key, value);
    }
    res.status(204).end();
    return;
  }

  if (req.method === 'GET') {
    res.setHeader('Allow', 'POST');
    res.status(405).end();
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  for (const [key, value] of Object.entries(server.getCorsHeaders(origin))) {
    res.setHeader(key, value);
  }

  const contentType = (req.headers['content-type']?.toString() || '')
    .split(';', 1)[0]
    ?.trim()
    .toLowerCase();
  if (contentType !== 'application/json') {
    res.status(415).json({
      jsonrpc: '2.0', error: { code: -32000, message: 'Content-Type must be application/json' }, id: null,
    });
    return;
  }

  const accept = (req.headers.accept?.toString() || '').trim().toLowerCase();
  if (accept && !accept.includes('application/json') && !accept.includes('*/*')) {
    res.status(406).json({
      jsonrpc: '2.0', error: { code: -32000, message: 'Client must accept application/json' }, id: null,
    });
    return;
  }

  const clientIp = extractClientIp(
    req.headers,
    req.socket.remoteAddress,
    cc.getConfig().security.trustProxy,
  );

  // Forward the API key so CORSEN_CONTEXT_API_KEY auth works.
  const apiKey =
    (req.headers['x-mcp-key'] as string) ||
    (req.headers['authorization'] as string)?.replace('Bearer ', '') ||
    undefined;

  const rateLimit = await server.checkRateLimit(clientIp, apiKey);
  for (const [key, value] of Object.entries(rateLimit.headers)) {
    res.setHeader(key, value);
  }
  if (!rateLimit.allowed) {
    res.status(429).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Rate limit exceeded' }, id: null });
    return;
  }

  if (!server.checkAuth(apiKey)) {
    res.status(401).json({
      jsonrpc: '2.0', error: { code: -32000, message: 'Unauthorized' }, id: null,
    });
    return;
  }

  const parsed = await readJsonBody(req, res);
  if (!parsed.ok) return;
  const body = parsed.body;

  if (isJsonRpcResponse(body)) {
    res.status(400).json({
      jsonrpc: '2.0', error: { code: -32600, message: 'JSON-RPC responses are not accepted' }, id: null,
    });
    return;
  }

  const method =
    body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>).method
      : undefined;
  if (typeof method === 'string' && method !== 'initialize') {
    const requestedVersion =
      (req.headers['mcp-protocol-version'] as string | undefined) || '2025-03-26';
    if (requestedVersion !== MCP_PROTOCOL_VERSION) {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Unsupported MCP-Protocol-Version' },
        id: null,
      });
      return;
    }
  }

  // skipRateLimit: we already ran the limiter above (don't double-count).
  const result = await server.handleRequest(body, clientIp, apiKey, { skipRateLimit: true });

  // Notification (no id) — accepted with no response body.
  if (result === null) {
    res.status(202).end();
    return;
  }

  res.status(200).json(result);
}
`;

const NEXTJS_PAGES_WEBMCP_ROUTE = `import type { NextApiRequest, NextApiResponse } from 'next';
import {
  CorsenContext,
  generateWebMCPScript,
  toWebMCPTools,
} from '@corsenai/corsen-context';
import corsenConfig from '__CORSEN_CONTEXT_CONFIG__';
import { siteProvider } from '__CORSEN_CONTEXT_PROVIDER__';

const cc = new CorsenContext(corsenConfig, siteProvider);

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!cc.getConfig().mcp.enabled) {
    res.status(404).end();
    return;
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).end();
    return;
  }

  const server = cc.createMCPServer();
  for (const [key, value] of Object.entries(server.getSecurityHeaders())) {
    res.setHeader(key, value);
  }
  const script = generateWebMCPScript(toWebMCPTools(server.getToolDefinitions()), {
    mcpEndpoint: cc.getConfig().mcp.endpoint,
  });
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.status(200).send(script);
}
`;

const NEXTJS_PAGES_LLMS_ROUTE = `import type { NextApiRequest, NextApiResponse } from 'next';
import { CorsenContext } from '@corsenai/corsen-context';
import corsenConfig from '__CORSEN_CONTEXT_CONFIG__';
import { siteProvider } from '__CORSEN_CONTEXT_PROVIDER__';

const cc = new CorsenContext(corsenConfig, siteProvider);

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  if (!cc.getConfig().static.generateLlmsTxt) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(404).end();
    return;
  }
  const text = await cc.generateLlmsTxt();
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
  res.status(200).send(text);
}
`;

const NEXTJS_PAGES_LLMS_FULL_ROUTE = `import type { NextApiRequest, NextApiResponse } from 'next';
import { CorsenContext } from '@corsenai/corsen-context';
import corsenConfig from '__CORSEN_CONTEXT_CONFIG__';
import { siteProvider } from '__CORSEN_CONTEXT_PROVIDER__';

const cc = new CorsenContext(corsenConfig, siteProvider);

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  const resolved = cc.getConfig();
  if (!resolved.static.generateLlmsTxt || !resolved.static.includeFullContent) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(404).end();
    return;
  }
  const text = await cc.generateLlmsFullTxt();
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
  res.status(200).send(text);
}
`;

const NEXTJS_PAGES_CONFIG = `import corsenConfig from '__CORSEN_CONTEXT_CONFIG__';

const mcpEndpoint = corsenConfig.mcp?.endpoint || '/v1/mcp';

export default {
  async rewrites() {
    return [
      { source: mcpEndpoint, destination: '/api/mcp' },
      { source: '/webmcp.js', destination: '/api/webmcp' },
      { source: '/llms.txt', destination: '/api/llms-txt' },
      { source: '/llms-full.txt', destination: '/api/llms-full-txt' },
    ];
  },
};
`;

// --- Express Template ---

const EXPRESS_MIDDLEWARE = `import express from 'express';
import {
  CorsenContext,
  MCP_PROTOCOL_VERSION,
  extractClientIp,
  generateWebMCPScript,
  toWebMCPTools,
} from '@corsenai/corsen-context';
import corsenConfig from '__CORSEN_CONTEXT_CONFIG__';

// Replace with your content provider
const provider = {
  async getPages() { return []; },
  async getPageContent(url) { return null; },
  async searchContent(query, limit) { return []; },
};

const cc = new CorsenContext(corsenConfig, provider);

/**
 * Mount these routes in your Express app:
 *   import corsenContextRoutes from './corsen-context.routes.mjs';
 *   corsenContextRoutes(app);
 */
export default function corsenContextRoutes(app) {
  if (cc.getConfig().security.trustProxy) app.set('trust proxy', 1);

  // Owner revocation runs before any server creation, headers or body parsing.
  app.all(['/v1/mcp', '/webmcp.js'], (_req, res, next) => {
    if (!cc.getConfig().mcp.enabled) return res.status(404).end();
    return next();
  });

  app.all('/v1/mcp', (req, res, next) => {
    const server = cc.createMCPServer();
    for (const [key, value] of Object.entries(server.getSecurityHeaders())) {
      res.set(key, value);
    }
    const origin = req.get('Origin') || undefined;
    if (!server.validateRequestOrigin(origin)) {
      return res.status(403).json({
        jsonrpc: '2.0', error: { code: -32000, message: 'Invalid Origin' }, id: null,
      });
    }
    for (const [key, value] of Object.entries(server.getCorsHeaders(origin))) {
      res.set(key, value);
    }
    res.locals.mcpServer = server;
    return next();
  });

  async function mcpPostPreflight(req, res, next) {
    try {
      const contentType = (req.get('Content-Type') || '').split(';', 1)[0].trim().toLowerCase();
      if (contentType !== 'application/json') {
        return res.status(415).json({
          jsonrpc: '2.0', error: { code: -32000, message: 'Content-Type must be application/json' }, id: null,
        });
      }
      const accept = (req.get('Accept') || '').trim().toLowerCase();
      if (accept && !accept.includes('application/json') && !accept.includes('*/*')) {
        return res.status(406).json({
          jsonrpc: '2.0', error: { code: -32000, message: 'Client must accept application/json' }, id: null,
        });
      }
      const server = res.locals.mcpServer;
      const clientIp = extractClientIp(
        req.headers,
        req.socket.remoteAddress,
        cc.getConfig().security.trustProxy,
      );
      const apiKey = req.headers['x-mcp-key']?.toString()
        || req.headers['authorization']?.toString().replace('Bearer ', '')
        || undefined;
      const rateLimit = await server.checkRateLimit(clientIp, apiKey);
      for (const [key, value] of Object.entries(rateLimit.headers)) res.set(key, value);
      if (!rateLimit.allowed) {
        return res.status(429).json({
          jsonrpc: '2.0', error: { code: -32000, message: 'Rate limit exceeded' }, id: null,
        });
      }
      if (!server.checkAuth(apiKey)) {
        return res.status(401).json({
          jsonrpc: '2.0', error: { code: -32000, message: 'Unauthorized' }, id: null,
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
    return !!body
      && typeof body === 'object'
      && !Array.isArray(body)
      && !('method' in body)
      && ('result' in body || 'error' in body);
  }

  // Serve /llms.txt
  app.get('/llms.txt', async (_req, res) => {
    if (!cc.getConfig().static.generateLlmsTxt) {
      return res.status(404).set('Cache-Control', 'no-store').end();
    }
    const text = await cc.generateLlmsTxt();
    res.type('text/plain').set('Cache-Control', 'public, max-age=3600').send(text);
  });

  // Serve /llms-full.txt
  app.get('/llms-full.txt', async (_req, res) => {
    const resolved = cc.getConfig();
    const includeFullContent = resolved.static.includeFullContent;
    if (!resolved.static.generateLlmsTxt || !includeFullContent) {
      return res.status(404).set('Cache-Control', 'no-store').end();
    }
    const text = await cc.generateLlmsFullTxt();
    res.type('text/plain').set('Cache-Control', 'public, max-age=3600').send(text);
  });

  app.options('/v1/mcp', (_req, res) => res.status(204).end());

  app.get('/v1/mcp', (_req, res) => {
    res.set('Allow', 'POST');
    return res.status(405).end();
  });

  // MCP endpoint
  app.post('/v1/mcp', mcpPostPreflight, mcpJsonParser, async (req, res) => {
    const server = res.locals.mcpServer;
    const clientIp = res.locals.mcpClientIp;
    const apiKey = res.locals.mcpApiKey;
    if (isJsonRpcResponse(req.body)) {
      return res.status(400).json({
        jsonrpc: '2.0', error: { code: -32600, message: 'JSON-RPC responses are not accepted' }, id: null,
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

    // skipRateLimit: we already ran the limiter above (don't double-count).
    const result = await server.handleRequest(req.body, clientIp, apiKey, { skipRateLimit: true });

    // Notification — accepted with no response body.
    if (result === null) {
      return res.status(202).end();
    }

    res.json(result);
  });

  app.use('/v1/mcp', (error, _req, res, next) => {
    if (error?.type === 'entity.parse.failed') {
      return res.status(400).json({
        jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null,
      });
    }
    if (error?.type === 'entity.too.large') {
      return res.status(413).json({
        jsonrpc: '2.0', error: { code: -32600, message: 'Request body too large' }, id: null,
      });
    }
    if (error?.type === 'charset.unsupported' || error?.type === 'encoding.unsupported') {
      return res.status(415).json({
        jsonrpc: '2.0', error: { code: -32000, message: 'Unsupported request encoding' }, id: null,
      });
    }
    console.error('MCP request failed:', error instanceof Error ? error.message : 'unknown error');
    return res.status(500).json({
      jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null,
    });
  });

  app.get('/webmcp.js', (_req, res) => {
    const server = cc.createMCPServer();
    const script = generateWebMCPScript(toWebMCPTools(server.getToolDefinitions()), {
      mcpEndpoint: cc.getConfig().mcp.endpoint,
    });
    for (const [key, value] of Object.entries(server.getSecurityHeaders())) {
      res.set(key, value);
    }
    return res
      .type('application/javascript')
      .set('Cache-Control', 'public, max-age=3600')
      .send(script);
  });
}
`;

// --- Astro Template ---

const ASTRO_PROVIDER = `import type { ContentProvider } from '@corsenai/corsen-context';

/**
 * Implement your content provider here — tell Corsen Context how to read your
 * pages. Replace the stubs with real data from your content collections or CMS.
 */
export const siteProvider: ContentProvider = {
  async getPages() {
    return [];
  },
  async getPageContent(url) {
    return null;
  },
  async searchContent(query, limit) {
    return [];
  },
};
`;

const ASTRO_MCP_ENDPOINT = `import { createMCPHandler } from '@corsenai/corsen-context-astro';
import { siteProvider } from '__CORSEN_CONTEXT_PROVIDER__';
import corsenConfig from '__CORSEN_CONTEXT_CONFIG__';

// The Astro adapter handles auth, rate limiting (by clientAddress), CORS, and
// security headers. It reads the real client IP from Astro's clientAddress.
export const { GET, POST, OPTIONS } = createMCPHandler(corsenConfig, siteProvider);
`;

const ASTRO_LLMS_ENDPOINT = `import { createLlmsTxtHandler } from '@corsenai/corsen-context-astro';
import { siteProvider } from '__CORSEN_CONTEXT_PROVIDER__';
import corsenConfig from '__CORSEN_CONTEXT_CONFIG__';

export const GET = createLlmsTxtHandler(corsenConfig, siteProvider);
`;

const ASTRO_LLMS_FULL_ENDPOINT = `import { createLlmsFullTxtHandler } from '@corsenai/corsen-context-astro';
import { siteProvider } from '__CORSEN_CONTEXT_PROVIDER__';
import corsenConfig from '__CORSEN_CONTEXT_CONFIG__';

export const GET = createLlmsFullTxtHandler(corsenConfig, siteProvider);
`;

const ASTRO_WEBMCP_ENDPOINT = `import { createWebMCPScriptHandler } from '@corsenai/corsen-context-astro';
import { siteProvider } from '__CORSEN_CONTEXT_PROVIDER__';
import corsenConfig from '__CORSEN_CONTEXT_CONFIG__';

export const GET = createWebMCPScriptHandler(corsenConfig, siteProvider);
`;

// --- Scaffold Functions ---

function scaffoldNextjsApp(cwd: string): void {
  const appDir = existsSync(join(cwd, 'src', 'app')) ? join(cwd, 'src') : cwd;
  const libDir = existsSync(join(cwd, 'src')) ? join(cwd, 'src', 'lib') : join(cwd, 'lib');
  const configPath = join(cwd, 'corsen-context.config.mjs');
  const providerPath = join(libDir, 'corsen-provider.ts');
  const mcpPath = join(appDir, 'app', 'v1', 'mcp', 'route.ts');
  const llmsPath = join(appDir, 'app', 'llms.txt', 'route.ts');
  const llmsFullPath = join(appDir, 'app', 'llms-full.txt', 'route.ts');
  const webmcpPath = join(appDir, 'app', 'webmcp.js', 'route.ts');

  writeIfNotExists(providerPath, NEXTJS_APP_PROVIDER);
  writeIfNotExists(
    mcpPath,
    withSharedRuntime(NEXTJS_APP_MCP_ROUTE, mcpPath, configPath, providerPath),
  );
  writeIfNotExists(
    llmsPath,
    withSharedRuntime(NEXTJS_APP_LLMS_ROUTE, llmsPath, configPath, providerPath),
  );
  writeIfNotExists(
    llmsFullPath,
    withSharedRuntime(NEXTJS_APP_LLMS_FULL_ROUTE, llmsFullPath, configPath, providerPath),
  );
  writeIfNotExists(
    webmcpPath,
    withSharedRuntime(NEXTJS_APP_WEBMCP_ROUTE, webmcpPath, configPath, providerPath),
  );

  console.log('\n  Next steps:');
  console.log('  1. npm install @corsenai/corsen-context @corsenai/corsen-context-nextjs');
  console.log('  2. Edit lib/corsen-provider.ts with your content source');
  console.log('  3. Update siteUrl and owner controls in corsen-context.config.mjs');
  console.log(
    '  4. In app/layout.tsx, load <script src="/webmcp.js" defer /> only when mcp.enabled is true',
  );
}

function scaffoldNextjsPages(cwd: string): void {
  const pagesDir = existsSync(join(cwd, 'src', 'pages'))
    ? join(cwd, 'src', 'pages')
    : join(cwd, 'pages');
  const libDir = existsSync(join(cwd, 'src')) ? join(cwd, 'src', 'lib') : join(cwd, 'lib');
  const configPath = join(cwd, 'corsen-context.config.mjs');
  const providerPath = join(libDir, 'corsen-provider.ts');
  const mcpPath = join(pagesDir, 'api', 'mcp.ts');
  const webmcpPath = join(pagesDir, 'api', 'webmcp.ts');
  const llmsPath = join(pagesDir, 'api', 'llms-txt.ts');
  const llmsFullPath = join(pagesDir, 'api', 'llms-full-txt.ts');

  writeIfNotExists(providerPath, NEXTJS_APP_PROVIDER);
  writeIfNotExists(
    mcpPath,
    withSharedRuntime(NEXTJS_PAGES_MCP_ROUTE, mcpPath, configPath, providerPath),
  );
  writeIfNotExists(
    webmcpPath,
    withSharedRuntime(NEXTJS_PAGES_WEBMCP_ROUTE, webmcpPath, configPath, providerPath),
  );
  writeIfNotExists(
    llmsPath,
    withSharedRuntime(NEXTJS_PAGES_LLMS_ROUTE, llmsPath, configPath, providerPath),
  );
  writeIfNotExists(
    llmsFullPath,
    withSharedRuntime(NEXTJS_PAGES_LLMS_FULL_ROUTE, llmsFullPath, configPath, providerPath),
  );

  const existingNextConfig = ['next.config.mjs', 'next.config.js', 'next.config.ts'].find((name) =>
    existsSync(join(cwd, name)),
  );
  if (existingNextConfig) {
    console.log(
      `  Preserved: ${existingNextConfig} (merge /v1/mcp, /webmcp.js and llms.txt rewrites shown below)`,
    );
  } else {
    const nextConfigPath = join(cwd, 'next.config.mjs');
    writeIfNotExists(
      nextConfigPath,
      withSharedConfig(NEXTJS_PAGES_CONFIG, nextConfigPath, configPath),
    );
  }

  console.log('\n  Next steps:');
  console.log('  1. npm install @corsenai/corsen-context');
  console.log('  2. Edit lib/corsen-provider.ts with your content source');
  console.log('  3. Update siteUrl and owner controls in corsen-context.config.mjs');
  if (existingNextConfig) {
    console.log(`  4. Merge these rewrites into ${existingNextConfig}:`);
    console.log('     { source: "/v1/mcp", destination: "/api/mcp" }');
    console.log('     { source: "/webmcp.js", destination: "/api/webmcp" }');
    console.log('     { source: "/llms.txt", destination: "/api/llms-txt" }');
    console.log('     { source: "/llms-full.txt", destination: "/api/llms-full-txt" }');
  }
  console.log(
    '  Required: in pages/_document.tsx, load <script src="/webmcp.js" defer /> only when mcp.enabled is true',
  );
}

function scaffoldExpress(cwd: string): void {
  const srcDir = existsSync(join(cwd, 'src')) ? join(cwd, 'src') : cwd;
  const configPath = join(cwd, 'corsen-context.config.mjs');
  // .mjs is executable in both CommonJS and ESM Express projects; a .js file
  // containing imports would fail to parse when package.json has no type field.
  const routesPath = join(srcDir, 'corsen-context.routes.mjs');

  writeIfNotExists(routesPath, withSharedConfig(EXPRESS_MIDDLEWARE, routesPath, configPath));

  console.log('\n  Next steps:');
  console.log('  1. npm install @corsenai/corsen-context');
  console.log('  2. Import and mount the routes in your Express app:');
  console.log('     import corsenContextRoutes from "./corsen-context.routes.mjs";');
  console.log('     corsenContextRoutes(app);');
  console.log('  3. Edit the provider in corsen-context.routes.mjs');
  console.log(
    '  4. In your HTML template, load <script src="/webmcp.js" defer></script> only when mcp.enabled is true',
  );
}

function scaffoldAstro(cwd: string): void {
  const srcDir = existsSync(join(cwd, 'src')) ? join(cwd, 'src') : cwd;
  const pagesDir = join(srcDir, 'pages');
  const configPath = join(cwd, 'corsen-context.config.mjs');
  const providerPath = join(srcDir, 'lib', 'corsen-provider.ts');
  const mcpPath = join(pagesDir, 'v1', 'mcp.ts');
  const llmsPath = join(pagesDir, 'llms.txt.ts');
  const llmsFullPath = join(pagesDir, 'llms-full.txt.ts');
  const webmcpPath = join(pagesDir, 'webmcp.js.ts');

  writeIfNotExists(providerPath, ASTRO_PROVIDER);
  writeIfNotExists(
    mcpPath,
    withSharedRuntime(ASTRO_MCP_ENDPOINT, mcpPath, configPath, providerPath),
  );
  writeIfNotExists(
    llmsPath,
    withSharedRuntime(ASTRO_LLMS_ENDPOINT, llmsPath, configPath, providerPath),
  );
  writeIfNotExists(
    llmsFullPath,
    withSharedRuntime(ASTRO_LLMS_FULL_ENDPOINT, llmsFullPath, configPath, providerPath),
  );
  writeIfNotExists(
    webmcpPath,
    withSharedRuntime(ASTRO_WEBMCP_ENDPOINT, webmcpPath, configPath, providerPath),
  );

  console.log('\n  Next steps:');
  console.log('  1. npm install @corsenai/corsen-context @corsenai/corsen-context-astro');
  console.log('  2. Make sure Astro SSR is enabled (output: "server" or "hybrid" in astro.config)');
  console.log('  3. Edit the provider in src/lib/corsen-provider.ts with your content source');
  console.log(
    '  4. In your Astro layout, load <script src="/webmcp.js" defer></script> only when mcp.enabled is true',
  );
}

function scaffoldStatic(cwd: string): void {
  console.log('\n  Static site detected. Options:');
  console.log('  1. Generate llms.txt from your live site:');
  console.log('     npx @corsenai/corsen-context-cli generate --url https://your-site.com');
  console.log('  2. Place the generated llms.txt in your site root');
  console.log('  3. For a dynamic MCP server, deploy a serverless function:');
  console.log('     - Vercel: create api/mcp.ts');
  console.log('     - Netlify: create netlify/functions/mcp.ts');
  console.log('     - Cloudflare Workers: use the core library directly');
}

function scaffoldHugo(cwd: string): void {
  console.log('\n  Hugo detected. Options:');
  console.log('  1. Generate llms.txt from your live site:');
  console.log('     npx @corsenai/corsen-context-cli generate --url https://your-site.com');
  console.log('  2. Place llms.txt in your static/ directory');
  console.log(
    '  3. For a dynamic MCP server, deploy a serverless function alongside your Hugo site',
  );
}

// --- Main Init ---

export async function init() {
  const cwd = process.cwd();
  const { framework, label } = detectFramework(cwd);

  console.log(`\n  Detected framework: ${label}`);
  console.log('  Initializing Corsen Context...\n');

  // Create config file (all frameworks)
  writeIfNotExists(join(cwd, 'corsen-context.config.mjs'), CONFIG_TEMPLATE);
  writeIfNotExists(join(cwd, 'corsen-context.config.d.mts'), CONFIG_DECLARATION_TEMPLATE);

  // Framework-specific scaffolding
  switch (framework) {
    case 'nextjs-app':
      scaffoldNextjsApp(cwd);
      break;
    case 'nextjs-pages':
      scaffoldNextjsPages(cwd);
      break;
    case 'express':
      scaffoldExpress(cwd);
      break;
    case 'astro':
      scaffoldAstro(cwd);
      break;
    case 'hugo':
      scaffoldHugo(cwd);
      break;
    case 'static':
      scaffoldStatic(cwd);
      break;
    case 'wordpress':
      console.log('\n  WordPress detected.');
      console.log('  Install the Corsen Context plugin from WordPress.org or GitHub:');
      console.log(
        '  https://github.com/CorsenAI/corsen-context/tree/main/packages/wordpress-plugin',
      );
      break;
    default:
      console.log('\n  Framework not detected. Generic setup:');
      console.log('  1. npm install @corsenai/corsen-context');
      console.log('  2. See: https://github.com/CorsenAI/corsen-context#quick-start');
      break;
  }

  console.log('\n  Edit corsen-context.config.mjs to set your siteUrl and options.');
  console.log(
    '  Run "npx @corsenai/corsen-context-cli doctor --url https://your-site.com" to validate.\n',
  );
}
