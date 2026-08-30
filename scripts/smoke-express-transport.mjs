import assert from 'node:assert/strict';

const [baseUrl, label = baseUrl, mode = 'enabled'] = process.argv.slice(2);
if (!baseUrl || !['enabled', 'disabled', 'disabled-discovery'].includes(mode)) {
  throw new Error(
    'Usage: node scripts/smoke-express-transport.mjs <base-url> [label] [enabled|disabled|disabled-discovery]',
  );
}

const endpoint = new URL('/v1/mcp', baseUrl);
const sameOriginHeaders = {
  Accept: 'application/json',
  'Content-Type': 'application/json',
  Origin: baseUrl,
};

async function waitUntilReachable() {
  const expected = mode.startsWith('disabled') ? 404 : 405;
  const deadline = Date.now() + 15_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(endpoint, { redirect: 'manual' });
      if (response.status === expected) return;
      lastError = new Error(`readiness returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const reason = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`${label}: transport did not become ready: ${reason}`);
}

async function responseText(response) {
  const text = await response.text();
  assert.doesNotMatch(
    text,
    /<!doctype|<html|Error:\s|\bat\s+\S+\s+\(/i,
    `${label}: leaked HTML or stack`,
  );
  return text;
}

await waitUntilReachable();

if (mode.startsWith('disabled')) {
  const requests = [
    ['/v1/mcp', { method: 'GET' }],
    ['/v1/mcp', { method: 'OPTIONS' }],
    ['/v1/mcp', { method: 'POST', headers: sameOriginHeaders, body: '{' }],
    ['/webmcp.js', { method: 'GET' }],
  ];
  for (const [path, options] of requests) {
    const response = await fetch(new URL(path, baseUrl), options);
    assert.equal(response.status, 404, `${label}: ${options.method} ${path} must be 404`);
    assert.equal(await response.text(), '', `${label}: disabled response must be empty`);
    assert.equal(response.headers.get('allow'), null, `${label}: disabled response emitted Allow`);
    assert.equal(
      response.headers.get('access-control-allow-origin'),
      null,
      `${label}: disabled response emitted CORS`,
    );
    assert.doesNotMatch(
      response.headers.get('content-type') || '',
      /javascript/i,
      `${label}: disabled response emitted JavaScript`,
    );
  }
  if (mode === 'disabled-discovery') {
    const homepage = await fetch(new URL('/', baseUrl));
    assert.equal(homepage.status, 200, `${label}: homepage must remain available`);
    const html = await homepage.text();
    assert.doesNotMatch(
      html,
      /(?:src=["']\/webmcp\.js|\/webmcp\.js["'])/i,
      `${label}: disabled HTML must not disclose the WebMCP bridge`,
    );
  }
  console.log(`${label}: owner-revoked MCP and WebMCP surfaces passed`);
}

if (mode === 'enabled') {
  const hostileOrigin = await fetch(endpoint, {
    method: 'POST',
    headers: { ...sameOriginHeaders, Origin: 'https://hostile.invalid' },
    body: '{',
  });
  assert.equal(hostileOrigin.status, 403, `${label}: Origin gate must precede JSON parsing`);
  await responseText(hostileOrigin);

  const malformed = await fetch(endpoint, {
    method: 'POST',
    headers: sameOriginHeaders,
    body: '{',
  });
  assert.equal(malformed.status, 400, `${label}: malformed JSON must return 400`);
  const malformedPayload = JSON.parse(await responseText(malformed));
  assert.equal(malformedPayload.error?.code, -32700, `${label}: malformed JSON code drift`);

  const unsupportedCharset = await fetch(endpoint, {
    method: 'POST',
    headers: {
      ...sameOriginHeaders,
      'Content-Type': 'application/json; charset=iso-8859-1',
    },
    body: '{}',
  });
  assert.equal(unsupportedCharset.status, 415, `${label}: unsupported charset must return 415`);
  const unsupportedCharsetPayload = JSON.parse(await responseText(unsupportedCharset));
  assert.equal(
    unsupportedCharsetPayload.error?.code,
    -32000,
    `${label}: unsupported charset code drift`,
  );

  const primitive = await fetch(endpoint, {
    method: 'POST',
    headers: sameOriginHeaders,
    body: '42',
  });
  assert.equal(primitive.status, 200, `${label}: a parsed primitive must reach core validation`);
  const primitivePayload = JSON.parse(await responseText(primitive));
  assert.equal(primitivePayload.error?.code, -32600, `${label}: primitive request code drift`);

  const oversized = await fetch(endpoint, {
    method: 'POST',
    headers: sameOriginHeaders,
    body: JSON.stringify({ padding: 'x'.repeat(102401) }),
  });
  assert.equal(oversized.status, 413, `${label}: oversized JSON must return 413`);
  const oversizedPayload = JSON.parse(await responseText(oversized));
  assert.equal(oversizedPayload.error?.code, -32600, `${label}: oversized request code drift`);

  const inboundResponse = await fetch(endpoint, {
    method: 'POST',
    headers: sameOriginHeaders,
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }),
  });
  assert.equal(inboundResponse.status, 400, `${label}: JSON-RPC Response must return 400`);
  const inboundPayload = JSON.parse(await responseText(inboundResponse));
  assert.equal(inboundPayload.error?.code, -32600, `${label}: JSON-RPC Response code drift`);

  const initialized = await fetch(endpoint, {
    method: 'POST',
    headers: { ...sameOriginHeaders, 'MCP-Protocol-Version': '2025-11-25' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }),
  });
  assert.equal(initialized.status, 202, `${label}: valid notification must return 202`);
  assert.equal(await initialized.text(), '', `${label}: notification response must be empty`);

  console.log(`${label}: ordered Express transport gates passed`);
}
