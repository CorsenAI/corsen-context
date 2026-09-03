import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const hostileSlug = 'quote-" onmouseover="alert(1)<tag>';
const hostileTitle = 'Title <unsafe> "quoted"';
const hostileDescription = 'Description <unsafe> & "quoted"';

const cases = [
  {
    name: 'directus-cms',
    envName: 'DIRECTUS_URL',
    payload: {
      data: [
        {
          slug: hostileSlug,
          title: hostileTitle,
          excerpt: hostileDescription,
          body: 'Body',
          status: 'published',
        },
      ],
    },
  },
  {
    name: 'ghost-cms',
    envName: 'GHOST_API_URL',
    payload: {
      posts: [
        { slug: hostileSlug, title: hostileTitle, excerpt: hostileDescription, plaintext: 'Body' },
      ],
    },
  },
  {
    name: 'strapi-cms',
    envName: 'STRAPI_URL',
    payload: {
      data: [{ slug: hostileSlug, title: hostileTitle, excerpt: hostileDescription, body: 'Body' }],
    },
  },
  {
    name: 'wagtail-cms',
    envName: 'WAGTAIL_URL',
    payload: {
      items: [{ title: hostileTitle, meta: { slug: hostileSlug }, body: hostileDescription }],
    },
  },
];

for (const name of ['directus-cms', 'ghost-cms', 'mediawiki-cms', 'strapi-cms', 'wagtail-cms']) {
  const source = await readFile(join(root, 'examples', name, 'server.js'), 'utf8');
  assert.match(
    source,
    /cache:\s*\{\s*enabled:\s*false\s*\}/,
    `${name}: the core page cache must stay disabled so it cannot outlive the provider TTL`,
  );
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function waitFor(url, child, logs) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`wrapper exited early (${child.exitCode}): ${logs.join('').slice(-2000)}`);
    }
    try {
      const response = await fetch(url);
      if (response.status < 500) return response;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`wrapper did not become ready: ${logs.join('').slice(-2000)}`);
}

for (const [index, testCase] of cases.entries()) {
  let upstreamRequests = 0;
  const upstream = createServer((_req, res) => {
    upstreamRequests += 1;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(testCase.payload));
  });
  const upstreamPort = await listen(upstream);
  const wrapperPort = 32140 + index;
  const baseUrl = `http://127.0.0.1:${wrapperPort}`;
  const logs = [];
  const child = spawn(process.execPath, ['server.js'], {
    cwd: join(root, 'examples', testCase.name),
    env: {
      ...process.env,
      PORT: String(wrapperPort),
      SITE_URL: baseUrl,
      CORSEN_CONTEXT_MCP_ENABLED: 'false',
      CORSEN_CONTEXT_LLMS_FULL_TXT_ENABLED: 'true',
      [testCase.envName]: `http://127.0.0.1:${upstreamPort}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => logs.push(chunk.toString()));
  child.stderr.on('data', (chunk) => logs.push(chunk.toString()));

  try {
    const full = await waitFor(`${baseUrl}/llms-full.txt`, child, logs);
    assert.equal(
      full.status,
      200,
      `${testCase.name}: llms-full.txt must be available when opted in`,
    );
    await full.text();

    const landing = await fetch(baseUrl);
    assert.equal(landing.status, 200, `${testCase.name}: landing page must return 200`);
    const html = await landing.text();
    const requestPath = `/posts/${encodeURIComponent(hostileSlug)}`;
    const encodedPath = requestPath
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
    assert.match(
      html,
      new RegExp(`href="${encodedPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`),
      `${testCase.name}: encoded slug is not preserved as one href value`,
    );
    assert.doesNotMatch(html, /\sonmouseover\s*=/i, `${testCase.name}: slug created an attribute`);
    assert.doesNotMatch(html, /<unsafe>/i, `${testCase.name}: text HTML was not escaped`);

    const detail = await fetch(`${baseUrl}${requestPath}`);
    assert.equal(detail.status, 200, `${testCase.name}: hostile-title detail must render`);
    const detailHtml = await detail.text();
    assert.match(
      detailHtml,
      /<title>Title &lt;unsafe&gt; "quoted"<\/title>/,
      `${testCase.name}: document title was not HTML escaped`,
    );
    assert.doesNotMatch(
      detailHtml,
      /<title>Title <unsafe>/i,
      `${testCase.name}: CMS title entered the document title context`,
    );
    assert.doesNotMatch(
      html,
      /\/webmcp\.js/i,
      `${testCase.name}: revoked page still advertises the WebMCP bridge`,
    );
    assert.equal(
      upstreamRequests,
      1,
      `${testCase.name}: llms-full plus landing caused repeated upstream list fetches`,
    );
  } finally {
    if (child.exitCode === null) {
      child.kill();
      await new Promise((resolve) => child.once('exit', resolve));
    }
    upstream.closeAllConnections?.();
    await close(upstream);
  }
}

{
  let upstreamRequests = 0;
  const upstream = createServer((req, res) => {
    upstreamRequests += 1;
    const requestUrl = new URL(req.url || '/', 'http://127.0.0.1');
    let payload;
    if (requestUrl.searchParams.get('list') === 'allpages') {
      payload = { query: { allpages: [{ title: hostileTitle }] } };
    } else if ((requestUrl.searchParams.get('prop') || '').includes('extracts')) {
      payload = {
        query: {
          pages: [
            {
              title: hostileTitle,
              extract: hostileDescription,
              touched: '2026-08-30T12:00:00Z',
            },
          ],
        },
      };
    } else {
      payload = { error: { code: 'unsupported', info: 'Unsupported fixture request' } };
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  });
  const upstreamPort = await listen(upstream);
  const portProbe = createServer();
  const wrapperPort = await listen(portProbe);
  await close(portProbe);
  const baseUrl = `http://127.0.0.1:${wrapperPort}`;
  const logs = [];
  const child = spawn(process.execPath, ['server.js'], {
    cwd: join(root, 'examples', 'mediawiki-cms'),
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(wrapperPort),
      SITE_URL: baseUrl,
      CORSEN_CONTEXT_MCP_ENABLED: 'false',
      CORSEN_CONTEXT_LLMS_FULL_TXT_ENABLED: 'true',
      MW_API_URL: `http://127.0.0.1:${upstreamPort}/api.php`,
      MW_USER_AGENT: 'Corsen-Context-Safety-Test/1.0',
      MW_MAX_PAGES: '1',
      MW_BATCH_SIZE: '1',
      MW_CACHE_TTL_MS: '1000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => logs.push(chunk.toString()));
  child.stderr.on('data', (chunk) => logs.push(chunk.toString()));

  try {
    const full = await waitFor(`${baseUrl}/llms-full.txt`, child, logs);
    assert.equal(full.status, 200, 'mediawiki-cms: llms-full.txt must be available when opted in');
    await full.text();
    const requestPath = `/wiki/${encodeURIComponent(hostileTitle.replace(/ /g, '_'))}`;
    const detail = await fetch(`${baseUrl}${requestPath}`);
    assert.equal(detail.status, 200, 'mediawiki-cms: hostile-title detail must render');
    const detailHtml = await detail.text();
    assert.match(
      detailHtml,
      /<title>Title &lt;unsafe&gt; "quoted"<\/title>/,
      'mediawiki-cms: document title was not HTML escaped',
    );
    assert.doesNotMatch(
      detailHtml,
      /<title>Title <unsafe>/i,
      'mediawiki-cms: CMS title entered the document title context',
    );
    assert.doesNotMatch(
      detailHtml,
      /\/webmcp\.js/i,
      'mediawiki-cms: revoked page still advertises the WebMCP bridge',
    );
    assert.equal(upstreamRequests, 2, 'mediawiki-cms: provider cache caused repeated API fetches');
  } finally {
    if (child.exitCode === null) {
      child.kill();
      await new Promise((resolve) => child.once('exit', resolve));
    }
    upstream.closeAllConnections?.();
    await close(upstream);
  }
}

console.log('CMS wrapper encoding and bounded in-flight cache smoke passed');
