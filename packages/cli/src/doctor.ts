import { isPrivateUrl, MCP_PROTOCOL_VERSION } from '@corsenai/corsen-context';

function parseArgs(args: string[]): { url?: string } {
  const result: { url?: string } = {};
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--url' || args[i] === '-u') && args[i + 1]) {
      result.url = args[++i];
    }
  }
  return result;
}

interface CheckResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
}

export async function doctor(args: string[]) {
  const { url } = parseArgs(args);

  if (!url) {
    console.error('  Error: --url is required');
    console.error('  Usage: npx @corsenai/corsen-context-cli doctor --url https://mysite.com');
    process.exitCode = 1;
    return [];
  }

  console.log(`\n  Checking public agent surfaces for ${url}...\n`);

  const results: CheckResult[] = [];

  // Check 1: HTTPS
  results.push({
    name: 'HTTPS',
    status: url.startsWith('https://') ? 'pass' : 'fail',
    message: url.startsWith('https://') ? 'Site uses HTTPS' : 'Site must use HTTPS',
  });

  // Check 2: Not private URL
  const isPrivate = await isPrivateUrl(url);
  results.push({
    name: 'Public URL',
    status: !isPrivate ? 'pass' : 'fail',
    message: !isPrivate ? 'URL is publicly accessible' : 'URL points to private network',
  });

  const base = url.replace(/\/$/, '');

  // Check 3: llms.txt
  try {
    const res = await fetch(`${base}/llms.txt`, {
      signal: AbortSignal.timeout(10000),
      redirect: 'follow',
    });
    results.push({
      name: 'llms.txt',
      status: res.ok ? 'pass' : 'warn',
      message: res.ok ? `Found /llms.txt (${res.status})` : `No /llms.txt found (${res.status})`,
    });
  } catch {
    results.push({
      name: 'llms.txt',
      status: 'warn',
      message: 'Could not check /llms.txt',
    });
  }

  // Check 4: Sitemap
  try {
    const res = await fetch(`${base}/sitemap.xml`, {
      signal: AbortSignal.timeout(10000),
      redirect: 'follow',
    });
    results.push({
      name: 'Sitemap',
      status: res.ok ? 'pass' : 'warn',
      message: res.ok
        ? `Found /sitemap.xml (${res.status})`
        : `No /sitemap.xml found (${res.status})`,
    });
  } catch {
    results.push({
      name: 'Sitemap',
      status: 'warn',
      message: 'Could not check /sitemap.xml',
    });
  }

  // Check 5: robots.txt with MCP reference
  try {
    const res = await fetch(`${base}/robots.txt`, {
      signal: AbortSignal.timeout(10000),
      redirect: 'follow',
    });
    if (res.ok) {
      const text = await res.text();
      const hasMcp = text.toLowerCase().includes('mcp:');
      results.push({
        name: 'robots.txt MCP',
        status: hasMcp ? 'pass' : 'warn',
        message: hasMcp
          ? 'robots.txt contains MCP endpoint reference'
          : 'robots.txt exists but no MCP reference found',
      });
    } else {
      results.push({
        name: 'robots.txt MCP',
        status: 'warn',
        message: 'No robots.txt found',
      });
    }
  } catch {
    results.push({
      name: 'robots.txt MCP',
      status: 'warn',
      message: 'Could not check robots.txt',
    });
  }

  // Check 6: MCP endpoint
  try {
    const res = await fetch(`${base}/v1/mcp`, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'corsen-context-doctor', version: '1.0.0' },
        },
        id: 1,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const data = (await res.json()) as Record<string, any>;
      const protocolVersion = data?.result?.protocolVersion;
      const serverName = data?.result?.serverInfo?.name;
      const serverVersion = data?.result?.serverInfo?.version;
      let lifecycleComplete = false;
      if (
        protocolVersion === MCP_PROTOCOL_VERSION &&
        typeof serverName === 'string' &&
        serverName.length > 0 &&
        typeof serverVersion === 'string' &&
        serverVersion.length > 0
      ) {
        const acknowledged = await fetch(`${base}/v1/mcp`, {
          method: 'POST',
          headers: {
            Accept: 'application/json, text/event-stream',
            'Content-Type': 'application/json',
            'MCP-Protocol-Version': MCP_PROTOCOL_VERSION,
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'notifications/initialized',
            params: {},
          }),
          signal: AbortSignal.timeout(10000),
        });
        lifecycleComplete = acknowledged.status === 202 && (await acknowledged.text()).length === 0;
      }
      results.push({
        name: 'MCP Endpoint',
        status: lifecycleComplete ? 'pass' : 'fail',
        message: lifecycleComplete
          ? `MCP lifecycle active (protocol ${protocolVersion}, server ${serverVersion})`
          : 'MCP endpoint responded but did not complete the required lifecycle',
      });
    } else {
      results.push({
        name: 'MCP Endpoint',
        status: 'fail',
        message: `MCP endpoint at /v1/mcp returned ${res.status}`,
      });
    }
  } catch {
    results.push({
      name: 'MCP Endpoint',
      status: 'fail',
      message: 'No MCP endpoint found at /v1/mcp',
    });
  }

  // Check 7: WebMCP bridge on the homepage
  try {
    const res = await fetch(base, { signal: AbortSignal.timeout(10000) });
    const html = res.ok ? await res.text() : '';
    const hasBridge = html.includes('modelContext') || html.includes('/webmcp.js');
    results.push({
      name: 'WebMCP',
      status: hasBridge ? 'pass' : 'warn',
      message: hasBridge
        ? 'WebMCP bridge reference found on the homepage; browser execution is not proven'
        : 'No WebMCP bridge detected on the homepage (in-page agents cannot see tools)',
    });
  } catch {
    results.push({
      name: 'WebMCP',
      status: 'warn',
      message: 'Could not check the homepage for a WebMCP bridge',
    });
  }

  // Print results
  const icons = { pass: '\u2705', fail: '\u274C', warn: '\u26A0\uFE0F' };
  for (const r of results) {
    console.log(`  ${icons[r.status]}  ${r.name}: ${r.message}`);
  }

  const passes = results.filter((r) => r.status === 'pass').length;
  const fails = results.filter((r) => r.status === 'fail').length;
  const warns = results.filter((r) => r.status === 'warn').length;

  console.log(`\n  Score: ${passes}/${results.length} checks passed`);
  if (fails > 0) console.log(`  ${fails} critical issue(s) found`);
  if (warns > 0) console.log(`  ${warns} warning(s)`);

  if (fails > 0) process.exitCode = 1;

  if (passes === results.length) {
    console.log(
      '\n  All checked public surfaces responded. Run a real tool chain and browser receipt before release.\n',
    );
  } else {
    console.log('\n  Run "npx @corsenai/corsen-context-cli init" to set up missing components.\n');
  }

  return results;
}
