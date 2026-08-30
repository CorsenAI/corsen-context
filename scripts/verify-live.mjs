#!/usr/bin/env node
/* global AbortSignal, TextDecoder, URL, console, fetch, process */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const PROTOCOL_VERSION = '2025-11-25';
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const MAX_JSON_BYTES = 1024 * 1024;

const targets = [
  {
    id: 'wordpress',
    baseUrl: 'https://webmcp.corsen.ai',
    mcpPath: '/wp-json/corsen-context/v1/mcp',
    bridge: 'inline',
    query: 'Explorer v2',
    expectedPath: '/explorer-kit-v2/',
    expectedMarker: 'Explorer Kit v2',
  },
  {
    id: 'express',
    baseUrl: 'https://express-webmcp.corsen.ai',
    mcpPath: '/v1/mcp',
    bridge: '/webmcp.js',
    query: 'AK-E17',
    expectedPath: '/guides/ak-e17',
    expectedMarker: 'AK-E17',
  },
  {
    id: 'nextjs',
    baseUrl: 'https://nextjs-webmcp.corsen.ai',
    mcpPath: '/v1/mcp',
    bridge: '/webmcp.js',
    query: 'AK-E17',
    expectedPath: '/guides/ak-e17',
    expectedMarker: 'AK-E17',
  },
  {
    id: 'astro',
    baseUrl: 'https://astro-webmcp.corsen.ai',
    mcpPath: '/v1/mcp',
    bridge: '/webmcp.js',
    query: 'Home',
    expectedPath: '/',
    expectedMarker: 'Welcome to the Astro Demo',
  },
  {
    id: 'static-html',
    baseUrl: 'https://html-webmcp.corsen.ai',
    mcpPath: '/v1/mcp',
    bridge: '/webmcp.js',
    query: 'Home',
    expectedPath: '/',
    expectedMarker: 'plain HTML',
  },
  {
    id: 'ghost',
    baseUrl: 'https://ghost-webmcp.corsen.ai',
    mcpPath: '/v1/mcp',
    bridge: '/webmcp.js',
    query: 'Ghost',
    expectedMarker: 'Ghost',
  },
  {
    id: 'strapi',
    baseUrl: 'https://strapi-webmcp.corsen.ai',
    mcpPath: '/v1/mcp',
    bridge: '/webmcp.js',
    query: 'Strapi',
    expectedMarker: 'Strapi',
  },
  {
    id: 'directus',
    baseUrl: 'https://directus-webmcp.corsen.ai',
    mcpPath: '/v1/mcp',
    bridge: '/webmcp.js',
    query: 'Directus',
    expectedMarker: 'Directus',
  },
  {
    id: 'wagtail',
    baseUrl: 'https://wagtail-webmcp.corsen.ai',
    mcpPath: '/v1/mcp',
    bridge: '/webmcp.js',
    query: 'Wagtail',
    expectedMarker: 'Wagtail',
  },
  {
    id: 'mediawiki',
    baseUrl: 'https://mediawiki-webmcp.corsen.ai',
    mcpPath: '/v1/mcp',
    bridge: '/webmcp.js',
    query: 'MediaWiki',
    expectedMarker: 'MediaWiki',
  },
];

class VerificationError extends Error {
  constructor(category, message) {
    super(message);
    this.name = 'VerificationError';
    this.category = category;
  }
}

function fail(category, message) {
  throw new VerificationError(category, message);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }

  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function sha256(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function contractFromTools(tools) {
  return tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
}

function validateManifest(manifest) {
  if (
    !isRecord(manifest) ||
    !Number.isInteger(manifest.version) ||
    !Array.isArray(manifest.tools)
  ) {
    fail('MANIFEST_ERROR', 'tools.manifest.json has an invalid top-level shape');
  }

  if (manifest.tools.length === 0) {
    fail('MANIFEST_ERROR', 'tools.manifest.json declares no tools');
  }

  const names = new Set();
  for (const tool of manifest.tools) {
    if (
      !isRecord(tool) ||
      typeof tool.name !== 'string' ||
      tool.name.length === 0 ||
      typeof tool.description !== 'string' ||
      tool.description.length === 0 ||
      !isRecord(tool.inputSchema)
    ) {
      fail('MANIFEST_ERROR', 'tools.manifest.json contains an invalid tool definition');
    }
    if (names.has(tool.name)) {
      fail('MANIFEST_ERROR', `tools.manifest.json contains duplicate tool ${tool.name}`);
    }
    names.add(tool.name);
  }

  return contractFromTools(manifest.tools);
}

async function readBounded(response, maximumBytes, label, category = 'SURFACE_FAILURE') {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    fail(category, `${label} exceeds ${maximumBytes} bytes`);
  }

  let bytes;
  try {
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    const kind = error instanceof Error && error.name ? error.name : 'network error';
    fail(category, `${label} response body failed (${kind})`);
  }
  if (bytes.byteLength > maximumBytes) {
    fail(category, `${label} exceeds ${maximumBytes} bytes`);
  }
  return new TextDecoder().decode(bytes);
}

async function fetchText(url, expectedContentType, label) {
  const accept =
    expectedContentType === 'javascript'
      ? 'application/javascript, text/javascript;q=0.9, */*;q=0.1'
      : expectedContentType;
  let response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: accept,
        'Cache-Control': 'no-cache',
        'User-Agent': 'corsen-context-live-verifier/1.0',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const kind = error instanceof Error && error.name ? error.name : 'network error';
    fail('SURFACE_FAILURE', `${label} request failed (${kind})`);
  }

  if (!response.ok) {
    fail('SURFACE_FAILURE', `${label} returned HTTP ${response.status}`);
  }

  if (new URL(response.url).origin !== new URL(url).origin) {
    fail('SURFACE_FAILURE', `${label} redirected to another origin`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes(expectedContentType)) {
    fail('SURFACE_FAILURE', `${label} returned unexpected content-type`);
  }

  const text = await readBounded(response, MAX_TEXT_BYTES, label);
  if (text.trim().length === 0) {
    fail('SURFACE_FAILURE', `${label} returned an empty body`);
  }
  return text;
}

function assertWebMCPBridge(source, expectedContract) {
  if (!/(?:document|navigator)\.modelContext/.test(source) || !/\.registerTool\s*\(/.test(source)) {
    fail('SURFACE_FAILURE', 'WebMCP bridge does not contain a modelContext registration');
  }

  for (const tool of expectedContract) {
    if (!source.includes(JSON.stringify(tool.name)) && !source.includes(`'${tool.name}'`)) {
      fail('SURFACE_FAILURE', `WebMCP bridge does not contain ${tool.name}`);
    }
  }
}

async function verifySurfaces(target, expectedContract) {
  const homeUrl = new URL('/', target.baseUrl);
  const home = await fetchText(homeUrl, 'text/html', 'home page');
  await fetchText(new URL('/llms.txt', target.baseUrl), 'text/plain', 'llms.txt');

  const bridge =
    target.bridge === 'inline'
      ? home
      : await fetchText(new URL(target.bridge, target.baseUrl), 'javascript', 'WebMCP bridge');
  if (target.bridge !== 'inline' && !home.includes(target.bridge)) {
    fail('SURFACE_FAILURE', 'home page does not load the WebMCP bridge');
  }
  assertWebMCPBridge(bridge, expectedContract);
}

async function postMCP(target, body, protocolVersion) {
  const headers = {
    Accept: 'application/json, text/event-stream;q=0.9',
    'Cache-Control': 'no-cache',
    'Content-Type': 'application/json',
    Origin: new URL(target.baseUrl).origin,
    'User-Agent': 'corsen-context-live-verifier/1.0',
  };
  if (protocolVersion) {
    headers['MCP-Protocol-Version'] = protocolVersion;
  }

  let response;
  try {
    response = await fetch(new URL(target.mcpPath, target.baseUrl), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const kind = error instanceof Error && error.name ? error.name : 'network error';
    fail('MCP_FAILURE', `${body.method} request failed (${kind})`);
  }

  if (!response.ok) {
    fail('MCP_FAILURE', `${body.method} returned HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    fail('MCP_FAILURE', `${body.method} returned unexpected content-type`);
  }

  let payload;
  try {
    const text = await readBounded(response, MAX_JSON_BYTES, body.method, 'MCP_FAILURE');
    payload = JSON.parse(text);
  } catch (error) {
    if (error instanceof VerificationError) throw error;
    fail('MCP_FAILURE', `${body.method} returned invalid JSON`);
  }

  if (!isRecord(payload) || payload.jsonrpc !== '2.0' || payload.id !== body.id) {
    fail('MCP_FAILURE', `${body.method} returned an invalid JSON-RPC envelope`);
  }
  if (isRecord(payload.error)) {
    const code = Number.isInteger(payload.error.code) ? payload.error.code : 'unknown';
    fail('MCP_FAILURE', `${body.method} returned JSON-RPC error ${code}`);
  }
  if (!isRecord(payload.result)) {
    fail('MCP_FAILURE', `${body.method} returned no result`);
  }

  return payload.result;
}

async function postInitializedNotification(target) {
  const body = {
    jsonrpc: '2.0',
    method: 'notifications/initialized',
    params: {},
  };
  const headers = {
    Accept: 'application/json, text/event-stream;q=0.9',
    'Cache-Control': 'no-cache',
    'Content-Type': 'application/json',
    'MCP-Protocol-Version': PROTOCOL_VERSION,
    Origin: new URL(target.baseUrl).origin,
    'User-Agent': 'corsen-context-live-verifier/1.0',
  };

  let response;
  try {
    response = await fetch(new URL(target.mcpPath, target.baseUrl), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const kind = error instanceof Error && error.name ? error.name : 'network error';
    fail('MCP_FAILURE', `notifications/initialized request failed (${kind})`);
  }

  if (response.status !== 202 && response.status !== 204) {
    fail('MCP_FAILURE', `notifications/initialized returned HTTP ${response.status}`);
  }
  const text = await readBounded(
    response,
    MAX_JSON_BYTES,
    'notifications/initialized',
    'MCP_FAILURE',
  );
  if (text.length !== 0) {
    fail('MCP_FAILURE', 'notifications/initialized returned a response body');
  }
}

async function initialize(target) {
  const result = await postMCP(target, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'corsen-context-live-verifier', version: '1.0.0' },
    },
  });

  if (result.protocolVersion !== PROTOCOL_VERSION) {
    fail('MCP_FAILURE', `initialize negotiated ${String(result.protocolVersion)}`);
  }
  if (
    !isRecord(result.capabilities) ||
    !isRecord(result.capabilities.tools) ||
    !isRecord(result.serverInfo) ||
    typeof result.serverInfo.name !== 'string' ||
    result.serverInfo.name.length === 0 ||
    typeof result.serverInfo.version !== 'string' ||
    result.serverInfo.version.length === 0
  ) {
    fail('MCP_FAILURE', 'initialize returned incomplete server capabilities');
  }

  await postInitializedNotification(target);
}

function contractDifferences(expected, actual) {
  const differences = [];
  const expectedNames = expected.map((tool) => tool.name);
  const actualNames = actual.map((tool) => tool.name);
  if (canonicalJson(expectedNames) !== canonicalJson(actualNames)) {
    differences.push('tool names/order');
  }

  for (const expectedTool of expected) {
    const actualTool = actual.find((tool) => tool.name === expectedTool.name);
    if (!actualTool) continue;
    if (actualTool.description !== expectedTool.description) {
      differences.push(`${expectedTool.name}.description`);
    }
    if (canonicalJson(actualTool.inputSchema) !== canonicalJson(expectedTool.inputSchema)) {
      differences.push(`${expectedTool.name}.inputSchema`);
    }
  }
  return differences;
}

async function listTools(target, expectedContract) {
  const result = await postMCP(
    target,
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    PROTOCOL_VERSION,
  );

  if (!Array.isArray(result.tools)) {
    fail('MCP_FAILURE', 'tools/list returned no tools array');
  }
  for (const tool of result.tools) {
    if (
      !isRecord(tool) ||
      typeof tool.name !== 'string' ||
      typeof tool.description !== 'string' ||
      !isRecord(tool.inputSchema)
    ) {
      fail('MCP_FAILURE', 'tools/list returned an invalid tool definition');
    }
  }

  const actualContract = contractFromTools(result.tools);
  const actualHash = sha256(actualContract);
  const expectedHash = sha256(expectedContract);
  if (actualHash !== expectedHash) {
    const differences = contractDifferences(expectedContract, actualContract);
    fail(
      'CONTRACT_DRIFT',
      `expected ${expectedHash.slice(0, 16)}, got ${actualHash.slice(0, 16)} (${differences.join(', ') || 'contract differs'})`,
    );
  }

  return actualHash;
}

async function searchSite(target) {
  const result = await postMCP(
    target,
    {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'search_site', arguments: { query: target.query, limit: 3 } },
    },
    PROTOCOL_VERSION,
  );

  const textBlock = Array.isArray(result.content)
    ? result.content.find(
        (item) => isRecord(item) && item.type === 'text' && typeof item.text === 'string',
      )
    : undefined;
  if (!textBlock) {
    fail('SEARCH_FAILURE', 'search_site returned no text content');
  }

  let matches;
  try {
    matches = JSON.parse(textBlock.text);
  } catch {
    fail('SEARCH_FAILURE', 'search_site text content is not JSON');
  }
  if (!Array.isArray(matches) || matches.length === 0) {
    fail('SEARCH_FAILURE', `search_site returned no result for the configured ${target.id} query`);
  }

  const targetOrigin = new URL(target.baseUrl).origin;
  for (const match of matches) {
    if (!isRecord(match) || typeof match.title !== 'string' || typeof match.url !== 'string') {
      fail('SEARCH_FAILURE', 'search_site returned an invalid result item');
    }
    let matchOrigin;
    try {
      matchOrigin = new URL(match.url).origin;
    } catch {
      fail('SEARCH_FAILURE', 'search_site returned an invalid result URL');
    }
    if (matchOrigin !== targetOrigin) {
      fail('SEARCH_FAILURE', 'search_site returned a cross-origin result URL');
    }
  }

  return matches;
}

function normalizePath(pathname) {
  if (pathname === '/') return '/';
  return pathname.replace(/\/+$/, '');
}

function selectScenarioResult(target, matches) {
  if (!target.expectedPath) return matches[0];
  const expectedPath = normalizePath(target.expectedPath);
  const match = matches.find((item) => {
    try {
      return normalizePath(new URL(item.url).pathname) === expectedPath;
    } catch {
      return false;
    }
  });
  if (!match) {
    fail('SCENARIO_FAILURE', `search_site did not return the expected ${target.expectedPath} path`);
  }
  return match;
}

async function readSearchResult(target, match) {
  const result = await postMCP(
    target,
    {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'get_page_content', arguments: { uri: match.url } },
    },
    PROTOCOL_VERSION,
  );

  const textBlock = Array.isArray(result.content)
    ? result.content.find(
        (item) => isRecord(item) && item.type === 'text' && typeof item.text === 'string',
      )
    : undefined;
  if (!textBlock) {
    fail('SCENARIO_FAILURE', 'get_page_content returned no text content');
  }

  let page;
  try {
    page = JSON.parse(textBlock.text);
  } catch {
    fail('SCENARIO_FAILURE', 'get_page_content text content is not JSON');
  }
  if (
    !isRecord(page) ||
    typeof page.url !== 'string' ||
    typeof page.title !== 'string' ||
    typeof page.markdown !== 'string' ||
    page.markdown.trim().length === 0
  ) {
    fail('SCENARIO_FAILURE', 'get_page_content returned an invalid page');
  }

  let requestedUrl;
  let returnedUrl;
  try {
    requestedUrl = new URL(match.url);
    returnedUrl = new URL(page.url);
  } catch {
    fail('SCENARIO_FAILURE', 'get_page_content returned an invalid page URL');
  }
  if (
    returnedUrl.origin !== new URL(target.baseUrl).origin ||
    normalizePath(returnedUrl.pathname) !== normalizePath(requestedUrl.pathname) ||
    returnedUrl.search !== requestedUrl.search
  ) {
    fail('SCENARIO_FAILURE', 'get_page_content did not read the selected same-origin result');
  }

  const searchableText = `${page.title}\n${page.description || ''}\n${page.markdown}`;
  if (target.expectedMarker && !searchableText.includes(target.expectedMarker)) {
    fail(
      'SCENARIO_FAILURE',
      `get_page_content did not contain the expected ${target.expectedMarker} marker`,
    );
  }

  return returnedUrl.pathname;
}

async function captureStage(result, action) {
  try {
    return await action();
  } catch (error) {
    if (error instanceof VerificationError) {
      result.issues.push({ category: error.category, message: error.message });
      return undefined;
    }
    throw error;
  }
}

async function verifyTarget(target, expectedContract) {
  const result = {
    id: target.id,
    surfacesOk: false,
    initialized: false,
    contractHash: null,
    searchResults: null,
    contentPath: null,
    issues: [],
  };

  result.surfacesOk = Boolean(
    await captureStage(result, async () => {
      await verifySurfaces(target, expectedContract);
      return true;
    }),
  );

  result.initialized = Boolean(
    await captureStage(result, async () => {
      await initialize(target);
      return true;
    }),
  );
  if (!result.initialized) return result;

  result.contractHash =
    (await captureStage(result, () => listTools(target, expectedContract))) || null;
  const matches = await captureStage(result, () => searchSite(target));
  result.searchResults = matches?.length ?? null;
  if (matches) {
    result.contentPath =
      (await captureStage(result, () =>
        readSearchResult(target, selectScenarioResult(target, matches)),
      )) || null;
  }

  return result;
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log('Usage: pnpm verify:live');
    console.log('Verifies the ten public Corsen Context demos with read-only requests.');
    return;
  }
  if (process.argv.length > 2) {
    fail('USAGE_ERROR', 'unsupported command-line argument');
  }

  const manifestUrl = new URL('../tools.manifest.json', import.meta.url);
  let manifest;
  try {
    manifest = JSON.parse(await readFile(fileURLToPath(manifestUrl), 'utf8'));
  } catch {
    fail('MANIFEST_ERROR', 'could not read tools.manifest.json');
  }

  const expectedContract = validateManifest(manifest);
  const expectedHash = sha256(expectedContract);
  console.log(`Manifest contract SHA-256: ${expectedHash}`);

  const results = await Promise.all(
    targets.map((target) => verifyTarget(target, expectedContract)),
  );
  for (const result of results) {
    const hasContractDrift = result.issues.some((issue) => issue.category === 'CONTRACT_DRIFT');
    const state = [
      `surfaces=${result.surfacesOk ? 'ok' : 'fail'}`,
      `mcp=${result.initialized ? 'ok' : 'fail'}`,
      `contract=${result.contractHash ? result.contractHash.slice(0, 16) : hasContractDrift ? 'drift' : 'not-verified'}`,
      `search=${result.searchResults ?? 'not-verified'}`,
      `read=${result.contentPath || 'not-verified'}`,
    ].join(' ');
    if (result.issues.length === 0) {
      console.log(`PASS ${result.id.padEnd(11)} ${state}`);
      continue;
    }

    console.log(`FAIL ${result.id.padEnd(11)} ${state}`);
    for (const issue of result.issues) {
      console.log(`  ${issue.category}: ${issue.message}`);
    }
  }

  const failures = results.filter((result) => result.issues.length > 0).length;
  if (failures > 0) {
    console.log(`FAILED: ${failures}/${results.length} live integrations did not verify.`);
    process.exitCode = 1;
  } else {
    console.log(
      `VERIFIED: ${results.length}/${results.length} live integrations match the manifest.`,
    );
  }
}

main().catch((error) => {
  const category = error instanceof VerificationError ? error.category : 'VERIFIER_ERROR';
  const message = error instanceof Error ? error.message : 'unknown verifier error';
  console.error(`${category}: ${message}`);
  process.exitCode = 2;
});
