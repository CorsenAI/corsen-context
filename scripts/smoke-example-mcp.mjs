import assert from 'node:assert/strict';

const [baseUrl, label = baseUrl, searchQuery = 'webmcp'] = process.argv.slice(2);

if (!baseUrl) {
  throw new Error('Usage: node scripts/smoke-example-mcp.mjs <base-url> [label] [search-query]');
}

const endpoint = new URL('/v1/mcp', baseUrl);
const expectedTools = ['get_page_content', 'get_sitemap', 'list_content', 'search_site'];
const protocolVersion = '2025-11-25';
const accept = 'application/json, text/event-stream';
const embeddedNavigationExamples = new Set([
  'express-basic',
  'ghost-cms',
  'strapi-cms',
  'directus-cms',
  'wagtail-cms',
  'mediawiki-cms',
]);

async function verifyInlineScriptsCompile() {
  if (!embeddedNavigationExamples.has(label)) return;

  const response = await fetch(baseUrl);
  assert.equal(response.status, 200, `${label}: homepage must render`);
  const html = await response.text();
  // First-party demo markup only: this extracts inline scripts for a compile
  // check and is not an HTML sanitizer. The closing tag tolerates whitespace.
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
    .filter((match) => !/\bsrc\s*=/i.test(match[1]))
    .map((match) => match[2])
    .filter((script) => script.trim());

  assert.ok(scripts.length > 0, `${label}: homepage must contain an inline script`);
  for (const [index, script] of scripts.entries()) {
    assert.doesNotThrow(
      () => new Function(script),
      `${label}: inline script ${index + 1} must compile`,
    );
  }
}

async function waitUntilReachable() {
  const deadline = Date.now() + 30_000;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(endpoint, { redirect: 'manual' });
      if (response.status === 405) return response;
      lastError = new Error(`readiness probe returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  const reason = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`${label} did not become ready: ${reason}`);
}

async function post(payload, extraHeaders = {}) {
  return fetch(endpoint, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      Accept: accept,
      'Content-Type': 'application/json; charset=utf-8',
      Origin: baseUrl,
      ...extraHeaders,
    },
    body: JSON.stringify(payload),
  });
}

const getResponse = await waitUntilReachable();
assert.equal(getResponse.status, 405, `${label}: GET /v1/mcp must return 405`);
assert.match(getResponse.headers.get('allow') || '', /\bPOST\b/i, `${label}: missing Allow: POST`);
await verifyInlineScriptsCompile();

const optionsResponse = await fetch(endpoint, {
  method: 'OPTIONS',
  headers: {
    Accept: accept,
    Origin: baseUrl,
    'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'content-type,mcp-protocol-version',
  },
});
assert.equal(optionsResponse.status, 204, `${label}: same-origin OPTIONS must return 204`);
assert.equal(
  optionsResponse.headers.get('access-control-allow-origin'),
  baseUrl,
  `${label}: CORS must reflect the allowed origin`,
);

const rejectedOrigin = await fetch(endpoint, {
  method: 'POST',
  headers: {
    Accept: accept,
    'Content-Type': 'application/json',
    Origin: 'https://cross-origin.invalid',
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion,
      capabilities: {},
      clientInfo: { name: 'candidate-example-smoke', version: '1.0.0' },
    },
  }),
});
assert.equal(rejectedOrigin.status, 403, `${label}: cross-origin POST must return 403`);

const rejectedContentType = await post(
  {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion,
      capabilities: {},
      clientInfo: { name: 'candidate-example-smoke', version: '1.0.0' },
    },
  },
  { 'Content-Type': 'text/plain' },
);
assert.equal(rejectedContentType.status, 415, `${label}: non-JSON media type must return 415`);
const rejectedContentTypePayload = await rejectedContentType.json();
assert.equal(rejectedContentTypePayload.jsonrpc, '2.0', `${label}: 415 must use JSON-RPC`);
assert.equal(rejectedContentTypePayload.error?.code, -32000, `${label}: 415 error code drift`);

const rejectedAccept = await post(
  {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion,
      capabilities: {},
      clientInfo: { name: 'candidate-example-smoke', version: '1.0.0' },
    },
  },
  { Accept: 'text/plain' },
);
assert.equal(rejectedAccept.status, 406, `${label}: incompatible Accept must return 406`);
const rejectedAcceptPayload = await rejectedAccept.json();
assert.equal(rejectedAcceptPayload.jsonrpc, '2.0', `${label}: 406 must use JSON-RPC`);
assert.equal(rejectedAcceptPayload.error?.code, -32000, `${label}: 406 error code drift`);

const initializeResponse = await post({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion,
    capabilities: {},
    clientInfo: { name: 'candidate-example-smoke', version: '1.0.0' },
  },
});
assert.equal(initializeResponse.status, 200, `${label}: initialize must return 200`);
const initialize = await initializeResponse.json();
assert.equal(
  initialize.result?.protocolVersion,
  protocolVersion,
  `${label}: negotiated version drift`,
);

const initializedResponse = await post(
  {
    jsonrpc: '2.0',
    method: 'notifications/initialized',
    params: {},
  },
  { 'MCP-Protocol-Version': protocolVersion },
);
assert.equal(initializedResponse.status, 202, `${label}: initialized notification must return 202`);
assert.equal(await initializedResponse.text(), '', `${label}: notification response must be empty`);

const toolsResponse = await post(
  { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
  { 'MCP-Protocol-Version': protocolVersion },
);
assert.equal(toolsResponse.status, 200, `${label}: tools/list must return 200`);
const toolsPayload = await toolsResponse.json();
const toolNames = (toolsPayload.result?.tools || []).map((tool) => tool.name).sort();
assert.deepEqual(toolNames, expectedTools, `${label}: unexpected tool contract`);

async function readToolResult(response, toolName) {
  assert.equal(response.status, 200, `${label}: ${toolName} must return 200`);
  const payload = await response.json();
  assert.equal(payload.error, undefined, `${label}: ${toolName} returned a JSON-RPC error`);
  assert.equal(payload.result?.isError, false, `${label}: ${toolName} returned a tool error`);
  const text = (payload.result?.content || [])
    .filter((item) => item?.type === 'text' && typeof item.text === 'string')
    .map((item) => item.text)
    .join('\n')
    .trim();
  assert.ok(text, `${label}: ${toolName} returned no text content`);
  return JSON.parse(text);
}

const searchResponse = await post(
  {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'search_site',
      arguments: { query: searchQuery, limit: 5 },
    },
  },
  { 'MCP-Protocol-Version': protocolVersion },
);
const searchResults = await readToolResult(searchResponse, 'search_site');
assert.ok(Array.isArray(searchResults), `${label}: search_site result must be an array`);
assert.ok(searchResults.length > 0, `${label}: search_site returned no useful result`);
const returnedUrl = searchResults.find((item) => typeof item?.url === 'string')?.url;
assert.ok(returnedUrl, `${label}: search_site returned no page URL`);
assert.equal(
  new URL(returnedUrl).origin,
  new URL(baseUrl).origin,
  `${label}: search_site returned a cross-origin URL`,
);

const pageResponse = await post(
  {
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: {
      name: 'get_page_content',
      arguments: { uri: returnedUrl },
    },
  },
  { 'MCP-Protocol-Version': protocolVersion },
);
const page = await readToolResult(pageResponse, 'get_page_content');
assert.equal(page?.url, returnedUrl, `${label}: retrieved page URL drifted from search result`);
assert.ok(typeof page?.title === 'string' && page.title.trim(), `${label}: page title is empty`);
assert.ok(
  typeof page?.markdown === 'string' && page.markdown.trim().length > 20,
  `${label}: page content is not useful`,
);

const bridgeResponse = await fetch(new URL('/webmcp.js', baseUrl));
assert.equal(bridgeResponse.status, 200, `${label}: /webmcp.js must return 200`);
const bridge = await bridgeResponse.text();
assert.match(bridge, /document\.modelContext/, `${label}: bridge must use document.modelContext`);
assert.match(bridge, /registerTool/, `${label}: bridge must register tools`);

console.log(`${label}: package lifecycle, four-tool contract, and search-to-page smoke passed`);
