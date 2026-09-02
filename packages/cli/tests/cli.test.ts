import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { detectFramework, init } from '../src/init.js';
import { parseArgs } from '../src/generate.js';
import { doctor, resolveDiscoveredMcpEndpoint } from '../src/doctor.js';

describe('parseArgs (generate)', () => {
  it('parses --url and --output', () => {
    expect(parseArgs(['--url', 'https://a.com', '--output', '/tmp'])).toEqual({
      url: 'https://a.com',
      output: '/tmp',
    });
  });

  it('parses short flags -u/-o and the --full flag', () => {
    expect(parseArgs(['-u', 'https://a.com', '--full'])).toEqual({
      url: 'https://a.com',
      full: true,
    });
  });

  it('ignores a flag with no following value', () => {
    expect(parseArgs(['--url'])).toEqual({});
  });
});

describe('doctor exit status', () => {
  let previousExitCode: typeof process.exitCode;

  beforeEach(() => {
    previousExitCode = process.exitCode;
    process.exitCode = 0;
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.exitCode = previousExitCode;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns exit code 1 when the URL is missing', async () => {
    await expect(doctor([])).resolves.toEqual([]);
    expect(process.exitCode).toBe(1);
    expect(console.error).toHaveBeenCalledWith(
      '  Usage: npx @corsenai/corsen-context-cli doctor --url https://mysite.com',
    );
  });

  it('returns exit code 1 when a critical check or MCP lifecycle fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 })),
    );

    const results = await doctor(['--url', 'http://127.0.0.1']);

    expect(results.some((result) => result.status === 'fail')).toBe(true);
    expect(results.find((result) => result.name === 'MCP Endpoint')?.status).toBe('fail');
    expect(process.exitCode).toBe(1);
    expect(console.log).toHaveBeenCalledWith(
      '\n  Run "npx @corsenai/corsen-context-cli init" to set up missing components.\n',
    );
  });

  it('keeps exit code 0 when only optional checks warn', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/v1/mcp') && init?.method === 'POST') {
          const request = JSON.parse(String(init.body));
          if (request.method === 'initialize') {
            return Response.json({
              jsonrpc: '2.0',
              id: 1,
              result: {
                protocolVersion: request.params.protocolVersion,
                serverInfo: { name: 'doctor-test', version: '1.0.0' },
              },
            });
          }
          return new Response(null, { status: 202 });
        }
        return new Response('', { status: 404 });
      }),
    );

    const results = await doctor(['--url', 'https://8.8.8.8']);

    expect(results.some((result) => result.status === 'warn')).toBe(true);
    expect(results.some((result) => result.status === 'fail')).toBe(false);
    expect(process.exitCode).toBe(0);
  });

  it('uses a same-origin MCP endpoint discovered from llms.txt', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const target = String(input);
      if (target.endsWith('/llms.txt')) {
        return new Response('MCP endpoint: /wp-json/corsen-context/v1/mcp\n');
      }
      if (target.endsWith('/wp-json/corsen-context/v1/mcp') && init?.method === 'POST') {
        const request = JSON.parse(String(init.body));
        if (request.method === 'initialize') {
          return Response.json({
            jsonrpc: '2.0',
            id: 1,
            result: {
              protocolVersion: request.params.protocolVersion,
              serverInfo: { name: 'doctor-test', version: '1.0.0' },
            },
          });
        }
        return new Response(null, { status: 202 });
      }
      return new Response('', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const results = await doctor(['--url', 'https://8.8.8.8']);

    expect(results.find((result) => result.name === 'MCP Endpoint')?.status).toBe('pass');
    expect(
      fetchMock.mock.calls.some(([target]) => String(target) === 'https://8.8.8.8/v1/mcp'),
    ).toBe(false);
  });

  it('falls back to a valid same-origin MCP line in robots.txt', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const target = String(input);
      if (target.endsWith('/robots.txt')) {
        return new Response('User-agent: *\nMCP: /custom/mcp\n');
      }
      if (target.endsWith('/custom/mcp') && init?.method === 'POST') {
        const request = JSON.parse(String(init.body));
        if (request.method === 'initialize') {
          return Response.json({
            jsonrpc: '2.0',
            id: 1,
            result: {
              protocolVersion: request.params.protocolVersion,
              serverInfo: { name: 'doctor-test', version: '1.0.0' },
            },
          });
        }
        return new Response(null, { status: 202 });
      }
      return new Response('', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const results = await doctor(['--url', 'https://8.8.8.8']);

    expect(results.find((result) => result.name === 'robots.txt MCP')?.status).toBe('pass');
    expect(results.find((result) => result.name === 'MCP Endpoint')?.status).toBe('pass');
  });

  it('rejects cross-origin, private, credentialed, and fragment discovery values', () => {
    const base = 'https://example.com';
    expect(resolveDiscoveredMcpEndpoint(base, '/v1/mcp')).toBe('https://example.com/v1/mcp');
    expect(resolveDiscoveredMcpEndpoint(base, 'https://evil.example/v1/mcp')).toBeNull();
    expect(resolveDiscoveredMcpEndpoint(base, 'http://127.0.0.1/private')).toBeNull();
    expect(resolveDiscoveredMcpEndpoint(base, 'https://user:pass@example.com/v1/mcp')).toBeNull();
    expect(resolveDiscoveredMcpEndpoint(base, '/v1/mcp#fragment')).toBeNull();
  });
});

describe('public CLI instructions', () => {
  it('uses the published scoped package and describes generate accurately', () => {
    const sourceDir = resolve(import.meta.dirname, '..', 'src');
    const publicCopy = [
      readFileSync(join(sourceDir, 'index.ts'), 'utf-8'),
      readFileSync(join(sourceDir, 'generate.ts'), 'utf-8'),
      readFileSync(join(sourceDir, 'doctor.ts'), 'utf-8'),
      readFileSync(resolve(import.meta.dirname, '..', 'README.md'), 'utf-8'),
    ].join('\n');

    expect(publicCopy).not.toMatch(/\bnpx corsen-context(?:\s|$)/m);
    expect(publicCopy).toContain(
      'generate    Generate llms.txt from a live site (--full adds llms-full.txt)',
    );
    expect(publicCopy).toContain('doctor      Diagnose public discovery, MCP, and WebMCP surfaces');
    expect(publicCopy).toContain(
      'npx @corsenai/corsen-context-cli generate --url https://mysite.com [--full]',
    );
  });
});

describe('detectFramework', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'corsen-cli-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function pkg(deps: Record<string, string>) {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: deps }));
  }

  it('detects WordPress via wp-config.php', () => {
    writeFileSync(join(dir, 'wp-config.php'), '<?php');
    expect(detectFramework(dir).framework).toBe('wordpress');
  });

  it('detects Next.js App Router', () => {
    pkg({ next: '15.0.0' });
    mkdirSync(join(dir, 'app'));
    expect(detectFramework(dir).framework).toBe('nextjs-app');
  });

  it('detects Next.js Pages Router', () => {
    pkg({ next: '15.0.0' });
    expect(detectFramework(dir).framework).toBe('nextjs-pages');
  });

  it('detects Astro and Express', () => {
    pkg({ astro: '4.0.0' });
    expect(detectFramework(dir).framework).toBe('astro');
  });

  it('detects a static site via index.html', () => {
    writeFileSync(join(dir, 'index.html'), '<html></html>');
    expect(detectFramework(dir).framework).toBe('static');
  });

  it('returns unknown for an empty directory', () => {
    expect(detectFramework(dir).framework).toBe('unknown');
  });
});

describe('init transport scaffolds', () => {
  let dir: string;
  let previousCwd: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'corsen-cli-transport-'));
    previousCwd = process.cwd();
  });

  afterEach(() => {
    process.chdir(previousCwd);
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  async function scaffold(dependencies: Record<string, string>): Promise<void> {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies }));
    process.chdir(dir);
    await init();
    process.chdir(previousCwd);
  }

  function expectSharedConfigImport(routePath: string): string {
    const source = readFileSync(routePath, 'utf-8');
    const match = source.match(/import corsenConfig from '([^']+corsen-context\.config\.mjs)'/);
    expect(match).not.toBeNull();
    expect(resolve(dirname(routePath), match![1])).toBe(resolve(dir, 'corsen-context.config.mjs'));
    expect(source).not.toContain('__CORSEN_CONTEXT_CONFIG__');
    return source;
  }

  function expectSharedProviderImport(routePath: string, providerPath: string): string {
    const source = readFileSync(routePath, 'utf-8');
    const match = source.match(/import \{ siteProvider \} from '([^']+corsen-provider)'/);
    expect(match).not.toBeNull();
    expect(`${resolve(dirname(routePath), match![1])}.ts`).toBe(resolve(providerPath));
    expect(source).not.toContain('__CORSEN_CONTEXT_PROVIDER__');
    return source;
  }

  it('generates an Express transport with Origin, method, version, and notification handling', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await scaffold({ express: '5.0.0' });
    const routePath = join(dir, 'corsen-context.routes.mjs');
    const route = expectSharedConfigImport(routePath);
    execFileSync(process.execPath, ['--check', routePath]);

    expect(route).toContain('MCP_PROTOCOL_VERSION');
    expect(route).toContain("app.options('/v1/mcp'");
    expect(route).toContain("app.get('/v1/mcp'");
    expect(route).toContain('server.validateRequestOrigin(origin)');
    expect(route).toContain("req.get('Content-Type')");
    expect(route).toContain('res.status(415)');
    expect(route).toContain("req.get('Accept')");
    expect(route).toContain('res.status(406)');
    expect(route).toContain("req.get('MCP-Protocol-Version') || '2025-03-26'");
    expect(route).toContain('res.status(202).end()');
    expect(route).toContain("app.all(['/v1/mcp', '/webmcp.js']");
    expect(route.indexOf('cc.getConfig().mcp.enabled')).toBeLessThan(
      route.indexOf('cc.createMCPServer()'),
    );
    expect(route).toContain("app.post('/v1/mcp', mcpPostPreflight, mcpJsonParser");
    expect(route).toContain('express.json({ limit: 102400, strict: false })');
    expect(route).toContain('server.checkRateLimit(clientIp, apiKey)');
    expect(route).toContain('server.checkAuth(apiKey)');
    expect(route).toContain("app.set('trust proxy', 1)");
    expect(route).toContain('extractClientIp(');
    expect(route).toContain('cc.getConfig().security.trustProxy');
    expect(route).toContain("error?.type === 'entity.parse.failed'");
    expect(route).toContain("error?.type === 'entity.too.large'");
    expect(route).toContain("error?.type === 'charset.unsupported'");
    expect(route).toContain("error?.type === 'encoding.unsupported'");
    expect(route).toContain("message: 'Unsupported request encoding'");
    expect(route).toContain("error: { code: -32603, message: 'Internal error' }");
    expect(route).toContain("message: 'JSON-RPC responses are not accepted'");
    expect(route).toContain("app.get('/webmcp.js'");
    expect(route).toContain('generateWebMCPScript(toWebMCPTools');
    expect(route).toContain("set('Cache-Control', 'no-store')");
    expect(route).toContain('new CorsenContext(corsenConfig, provider)');

    const configPath = join(dir, 'corsen-context.config.mjs');
    const edited = readFileSync(configPath, 'utf-8')
      .replace('generateLlmsTxt: true', 'generateLlmsTxt: false')
      .replace('enabled: true', 'enabled: false')
      .replace(
        "excludePaths: ['/admin', '/cart', '/checkout']",
        "excludePaths: ['/owner-disabled']",
      );
    writeFileSync(configPath, edited);
    const imported = (await import(`${pathToFileURL(configPath).href}?test=owner-controls`))
      .default;
    expect(imported.mcp.enabled).toBe(false);
    expect(imported.mcp.endpoint).toBeUndefined();
    expect(imported.static.generateLlmsTxt).toBe(false);
    expect(imported.content.excludePaths).toEqual(['/owner-disabled']);
    expect(() => readFileSync(join(dir, 'corsen-context.routes.js'), 'utf-8')).toThrow();
    expect(log.mock.calls.flat().join('\n')).toContain(
      'In your HTML template, load <script src="/webmcp.js" defer></script>',
    );
  });

  it('generates a Next.js Pages transport with the same protocol gates', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await scaffold({ next: '16.0.0' });
    const providerPath = join(dir, 'lib', 'corsen-provider.ts');
    const routePath = join(dir, 'pages', 'api', 'mcp.ts');
    const route = expectSharedProviderImport(routePath, providerPath);
    expectSharedConfigImport(routePath);

    expect(route).toContain('MCP_PROTOCOL_VERSION');
    expect(route).toContain('server.validateRequestOrigin(origin)');
    expect(route).toContain("req.headers['content-type']");
    expect(route).toContain('res.status(415)');
    expect(route).toContain('req.headers.accept');
    expect(route).toContain('res.status(406)');
    expect(route).toContain("req.method === 'GET'");
    expect(route).toContain("res.setHeader('Allow', 'POST')");
    expect(route).toContain("'2025-03-26'");
    expect(route).toContain('res.status(202).end()');
    expect(route).toContain('export const config = { api: { bodyParser: false } }');
    expect(route).toContain('total > 102400');
    expect(route).toContain('server.checkAuth(apiKey)');
    expect(route).toContain('extractClientIp(');
    expect(route).toContain('cc.getConfig().security.trustProxy');
    expect(route).toContain("message: 'JSON-RPC responses are not accepted'");
    expect(route.indexOf('cc.getConfig().mcp.enabled')).toBeLessThan(
      route.indexOf('cc.createMCPServer()'),
    );

    const webmcpPath = join(dir, 'pages', 'api', 'webmcp.ts');
    const webmcp = expectSharedProviderImport(webmcpPath, providerPath);
    expectSharedConfigImport(webmcpPath);
    expect(webmcp).toContain('cc.getConfig().mcp.enabled');
    expect(webmcp.indexOf('cc.getConfig().mcp.enabled')).toBeLessThan(
      webmcp.indexOf('cc.createMCPServer()'),
    );
    expect(webmcp).toContain('generateWebMCPScript(toWebMCPTools');
    expect(webmcp).toContain('mcpEndpoint: cc.getConfig().mcp.endpoint');

    const llmsPath = join(dir, 'pages', 'api', 'llms-txt.ts');
    const llmsFullPath = join(dir, 'pages', 'api', 'llms-full-txt.ts');
    const llms = expectSharedProviderImport(llmsPath, providerPath);
    const llmsFull = expectSharedProviderImport(llmsFullPath, providerPath);
    expectSharedConfigImport(llmsPath);
    expectSharedConfigImport(llmsFullPath);
    expect(llms).toContain('cc.getConfig().static.generateLlmsTxt');
    expect(llmsFull).toContain('!resolved.static.includeFullContent');

    const nextConfigPath = join(dir, 'next.config.mjs');
    expectSharedConfigImport(nextConfigPath);
    const nextConfig = (await import(pathToFileURL(nextConfigPath).href)).default;
    await expect(nextConfig.rewrites()).resolves.toEqual(
      expect.arrayContaining([
        { source: '/v1/mcp', destination: '/api/mcp' },
        { source: '/webmcp.js', destination: '/api/webmcp' },
      ]),
    );
    expect(readFileSync(providerPath, 'utf-8')).toContain('export const siteProvider');
    for (const source of [route, webmcp, llms, llmsFull]) {
      expect(source).not.toContain('const provider =');
    }
    expect(log.mock.calls.flat().join('\n')).toContain(
      'in pages/_document.tsx, load <script src="/webmcp.js" defer />',
    );
  });

  it('exports GET from generated adapter routes', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    mkdirSync(join(dir, 'app'));
    await scaffold({ next: '16.0.0' });
    const providerPath = join(dir, 'lib', 'corsen-provider.ts');
    const nextRoutePath = join(dir, 'app', 'v1', 'mcp', 'route.ts');
    const nextRoute = expectSharedProviderImport(nextRoutePath, providerPath);
    expectSharedConfigImport(nextRoutePath);
    expect(nextRoute).toContain('const { GET, POST, OPTIONS }');
    expect(nextRoute).toContain('export { GET, POST, OPTIONS }');
    expect(nextRoute).toContain('createMCPHandler(corsenConfig, siteProvider)');
    for (const routePath of [
      join(dir, 'app', 'llms.txt', 'route.ts'),
      join(dir, 'app', 'llms-full.txt', 'route.ts'),
      join(dir, 'app', 'webmcp.js', 'route.ts'),
    ]) {
      expectSharedConfigImport(routePath);
      expectSharedProviderImport(routePath, providerPath);
    }
    expect(nextRoute).not.toContain("from '@/lib/corsen-provider'");
    expect(() => readFileSync(join(dir, 'app', 'api', 'mcp', 'route.ts'), 'utf-8')).toThrow();
    expect(log.mock.calls.flat().join('\n')).toContain(
      'In app/layout.tsx, load <script src="/webmcp.js" defer />',
    );
  });

  it('exports GET from the generated Astro adapter route', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await scaffold({ astro: '7.0.0' });
    const providerPath = join(dir, 'lib', 'corsen-provider.ts');
    const routePath = join(dir, 'pages', 'v1', 'mcp.ts');
    const route = expectSharedProviderImport(routePath, providerPath);
    expectSharedConfigImport(routePath);
    expect(route).toContain('export const { GET, POST, OPTIONS }');
    expect(route).toContain('createMCPHandler(corsenConfig, siteProvider)');
    for (const endpointPath of [
      join(dir, 'pages', 'llms.txt.ts'),
      join(dir, 'pages', 'llms-full.txt.ts'),
      join(dir, 'pages', 'webmcp.js.ts'),
    ]) {
      expectSharedConfigImport(endpointPath);
      expectSharedProviderImport(endpointPath, providerPath);
    }
    expect(log.mock.calls.flat().join('\n')).toContain(
      'In your Astro layout, load <script src="/webmcp.js" defer></script>',
    );
  });
});
