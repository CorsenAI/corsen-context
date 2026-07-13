import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

type Framework = 'nextjs-app' | 'nextjs-pages' | 'express' | 'astro' | 'hugo' | 'wordpress' | 'static' | 'unknown';

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
  if (existsSync(join(cwd, 'hugo.toml')) || existsSync(join(cwd, 'hugo.yaml')) || existsSync(join(cwd, 'config.toml'))) {
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
  if (existsSync(filePath)) {
    console.log(`  Skipped: ${filePath} (already exists)`);
    return false;
  }
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf-8');
  console.log(`  Created: ${filePath}`);
  return true;
}

// --- Config Template ---

const CONFIG_TEMPLATE = `/** @type {import('@corsenai/corsen-context').CorsenContextConfig} */
export default {
  siteUrl: 'https://your-site.com',
  siteName: 'Your Site Name',
  description: 'Short description for AI agents.',

  static: {
    generateLlmsTxt: true,
    includeFullContent: true,
  },

  mcp: {
    enabled: true,
    endpoint: '/v1/mcp',
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
    driver: 'memory',
  },

  credit: true,
};
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
import { siteProvider } from '@/lib/corsen-provider';

const config = {
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || 'https://your-site.com',
};

const { POST, OPTIONS } = createMCPHandler(config, siteProvider);
export { POST, OPTIONS };
`;

const NEXTJS_APP_SSE_ROUTE = `import { createSSEHandler } from '@corsenai/corsen-context-nextjs';
import { siteProvider } from '@/lib/corsen-provider';

const config = {
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || 'https://your-site.com',
};

// Passing the provider shares auth + rate-limit state with the MCP route.
export const GET = createSSEHandler(config, siteProvider);
`;

const NEXTJS_APP_LLMS_ROUTE = `import { createLlmsTxtHandler } from '@corsenai/corsen-context-nextjs';
import { siteProvider } from '@/lib/corsen-provider';

const config = {
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || 'https://your-site.com',
};

export const GET = createLlmsTxtHandler(config, siteProvider);
`;

const NEXTJS_APP_LLMS_FULL_ROUTE = `import { createLlmsFullTxtHandler } from '@corsenai/corsen-context-nextjs';
import { siteProvider } from '@/lib/corsen-provider';

const config = {
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || 'https://your-site.com',
};

export const GET = createLlmsFullTxtHandler(config, siteProvider);
`;

const NEXTJS_CONFIG_WRAPPER = `// Add this to your next.config.mjs:
// import { withCorsenContext } from '@corsenai/corsen-context-nextjs';
//
// export default withCorsenContext({
//   siteUrl: 'https://your-site.com',
// })(yourExistingConfig);
`;

// --- Next.js Pages Router Templates ---

const NEXTJS_PAGES_MCP_ROUTE = `import type { NextApiRequest, NextApiResponse } from 'next';
import { CorsenContext } from '@corsenai/corsen-context';
// import { siteProvider } from '@/lib/corsen-provider';

const config = {
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || 'https://your-site.com',
};

// Replace with your provider
const provider = {
  async getPages() { return []; },
  async getPageContent(url) { return null; },
  async searchContent(query, limit) { return []; },
};

const cc = new CorsenContext(config, provider);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const server = cc.createMCPServer();

  // Security headers
  for (const [key, value] of Object.entries(server.getSecurityHeaders())) {
    res.setHeader(key, value);
  }

  // Use the socket address by default. Only trust X-Forwarded-For behind a
  // proxy you control, otherwise it is spoofable and defeats rate limiting.
  const clientIp = req.socket.remoteAddress || 'unknown';

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

  // skipRateLimit: we already ran the limiter above (don't double-count).
  const result = await server.handleRequest(req.body, clientIp, apiKey, { skipRateLimit: true });

  // Notification (no id) — 204 No Content
  if (result === null) {
    res.status(204).end();
    return;
  }

  res.status(200).json(result);
}
`;

const NEXTJS_PAGES_LLMS_ROUTE = `import type { NextApiRequest, NextApiResponse } from 'next';
import { CorsenContext } from '@corsenai/corsen-context';

const config = {
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || 'https://your-site.com',
};

const provider = {
  async getPages() { return []; },
  async getPageContent(url) { return null; },
  async searchContent(query, limit) { return []; },
};

const cc = new CorsenContext(config, provider);

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  const text = await cc.generateLlmsTxt();
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
  res.status(200).send(text);
}
`;

// --- Express Template ---

const EXPRESS_MIDDLEWARE = `import express from 'express';
import { CorsenContext } from '@corsenai/corsen-context';
// import config from './corsen-context.config.mjs';

const config = {
  siteUrl: 'https://your-site.com',
};

// Replace with your content provider
const provider = {
  async getPages() { return []; },
  async getPageContent(url) { return null; },
  async searchContent(query, limit) { return []; },
};

const cc = new CorsenContext(config, provider);

/**
 * Mount these routes in your Express app:
 *   import corsenContextRoutes from './corsen-context.routes.js';
 *   corsenContextRoutes(app);
 */
export default function corsenContextRoutes(app) {
  // Ensure JSON body parsing is available for the MCP endpoint.
  app.use('/v1/mcp', express.json());

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
    const apiKey = req.headers['x-mcp-key']?.toString()
      || req.headers['authorization']?.toString().replace('Bearer ', '')
      || undefined;

    const rateLimit = await server.checkRateLimit(clientIp, apiKey);
    for (const [key, value] of Object.entries(rateLimit.headers)) {
      res.set(key, value);
    }
    if (!rateLimit.allowed) {
      return res.status(429).json({
        jsonrpc: '2.0', error: { code: -32000, message: 'Rate limit exceeded' }, id: null,
      });
    }

    // skipRateLimit: we already ran the limiter above (don't double-count).
    const result = await server.handleRequest(req.body, clientIp, apiKey, { skipRateLimit: true });

    // Notification — no response
    if (result === null) {
      return res.status(204).end();
    }

    res.json(result);
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
import { siteProvider } from '../../lib/corsen-provider';

// The Astro adapter handles auth, rate limiting (by clientAddress), CORS, and
// security headers. It reads the real client IP from Astro's clientAddress.
export const { POST, OPTIONS } = createMCPHandler(
  { siteUrl: import.meta.env.SITE ?? 'https://your-site.com' },
  siteProvider,
);
`;

const ASTRO_LLMS_ENDPOINT = `import { createLlmsTxtHandler } from '@corsenai/corsen-context-astro';
import { siteProvider } from '../lib/corsen-provider';

export const GET = createLlmsTxtHandler(
  { siteUrl: import.meta.env.SITE ?? 'https://your-site.com' },
  siteProvider,
);
`;

// --- Scaffold Functions ---

function scaffoldNextjsApp(cwd: string): void {
  const appDir = existsSync(join(cwd, 'src', 'app')) ? join(cwd, 'src') : cwd;
  const libDir = existsSync(join(cwd, 'src')) ? join(cwd, 'src', 'lib') : join(cwd, 'lib');

  writeIfNotExists(join(libDir, 'corsen-provider.ts'), NEXTJS_APP_PROVIDER);
  writeIfNotExists(join(appDir, 'app', 'api', 'mcp', 'route.ts'), NEXTJS_APP_MCP_ROUTE);
  writeIfNotExists(join(appDir, 'app', 'api', 'mcp', 'sse', 'route.ts'), NEXTJS_APP_SSE_ROUTE);
  writeIfNotExists(join(appDir, 'app', 'api', 'corsen-context', 'llms-txt', 'route.ts'), NEXTJS_APP_LLMS_ROUTE);
  writeIfNotExists(join(appDir, 'app', 'api', 'corsen-context', 'llms-full-txt', 'route.ts'), NEXTJS_APP_LLMS_FULL_ROUTE);

  console.log('\n  Next steps:');
  console.log('  1. npm install @corsenai/corsen-context @corsenai/corsen-context-nextjs');
  console.log('  2. Edit lib/corsen-provider.ts with your content source');
  console.log('  3. Update siteUrl in the route files or set NEXT_PUBLIC_SITE_URL env var');
  console.log('  4. Optionally wrap next.config.mjs with withCorsenContext() for /llms.txt rewrites');
}

function scaffoldNextjsPages(cwd: string): void {
  const pagesDir = existsSync(join(cwd, 'src', 'pages')) ? join(cwd, 'src', 'pages') : join(cwd, 'pages');

  writeIfNotExists(join(pagesDir, 'api', 'mcp.ts'), NEXTJS_PAGES_MCP_ROUTE);
  writeIfNotExists(join(pagesDir, 'api', 'llms-txt.ts'), NEXTJS_PAGES_LLMS_ROUTE);

  console.log('\n  Next steps:');
  console.log('  1. npm install @corsenai/corsen-context');
  console.log('  2. Edit pages/api/mcp.ts — replace the stub provider');
  console.log('  3. Set NEXT_PUBLIC_SITE_URL env var');
  console.log('  4. Add rewrites in next.config.mjs:');
  console.log('     { source: "/llms.txt", destination: "/api/llms-txt" }');
}

function scaffoldExpress(cwd: string): void {
  const srcDir = existsSync(join(cwd, 'src')) ? join(cwd, 'src') : cwd;

  writeIfNotExists(join(srcDir, 'corsen-context.routes.js'), EXPRESS_MIDDLEWARE);

  console.log('\n  Next steps:');
  console.log('  1. npm install @corsenai/corsen-context');
  console.log('  2. Import and mount the routes in your Express app:');
  console.log('     import corsenContextRoutes from "./corsen-context.routes.js";');
  console.log('     corsenContextRoutes(app);');
  console.log('  3. Edit the provider in corsen-context.routes.js');
}

function scaffoldAstro(cwd: string): void {
  const srcDir = existsSync(join(cwd, 'src')) ? join(cwd, 'src') : cwd;
  const pagesDir = join(srcDir, 'pages');

  writeIfNotExists(join(srcDir, 'lib', 'corsen-provider.ts'), ASTRO_PROVIDER);
  writeIfNotExists(join(pagesDir, 'v1', 'mcp.ts'), ASTRO_MCP_ENDPOINT);
  writeIfNotExists(join(pagesDir, 'llms.txt.ts'), ASTRO_LLMS_ENDPOINT);

  console.log('\n  Next steps:');
  console.log('  1. npm install @corsenai/corsen-context @corsenai/corsen-context-astro');
  console.log('  2. Make sure Astro SSR is enabled (output: "server" or "hybrid" in astro.config)');
  console.log('  3. Edit the provider in src/lib/corsen-provider.ts with your content source');
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
  console.log('  3. For a dynamic MCP server, deploy a serverless function alongside your Hugo site');
}

// --- Main Init ---

export async function init() {
  const cwd = process.cwd();
  const { framework, label } = detectFramework(cwd);

  console.log(`\n  Detected framework: ${label}`);
  console.log('  Initializing Corsen Context...\n');

  // Create config file (all frameworks)
  writeIfNotExists(join(cwd, 'corsen-context.config.mjs'), CONFIG_TEMPLATE);

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
      console.log('  https://github.com/CorsenAI/corsen-context/tree/main/packages/wordpress-plugin');
      break;
    default:
      console.log('\n  Framework not detected. Generic setup:');
      console.log('  1. npm install @corsenai/corsen-context');
      console.log('  2. See: https://github.com/CorsenAI/corsen-context#quick-start');
      break;
  }

  console.log('\n  Edit corsen-context.config.mjs to set your siteUrl and options.');
  console.log('  Run "npx @corsenai/corsen-context-cli doctor --url https://your-site.com" to validate.\n');
}
