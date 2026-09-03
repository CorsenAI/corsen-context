import { rename, writeFile } from 'node:fs/promises';
import http from 'node:http';

const [portFile] = process.argv.slice(2);

if (!portFile) {
  throw new Error('Usage: node scripts/mock-public-cms.mjs <port-file>');
}

const publishedAt = '2026-08-30T12:00:00Z';

const fixtures = {
  ghost: {
    posts: [
      {
        slug: 'webmcp-guide',
        title: 'WebMCP Guide',
        excerpt: 'Deterministic public WebMCP verification article served by Ghost.',
        plaintext: 'This public Ghost article proves search and page retrieval through WebMCP.',
        published_at: publishedAt,
      },
    ],
  },
  strapi: {
    data: [
      {
        attributes: {
          slug: 'webmcp-guide',
          title: 'WebMCP Guide',
          excerpt: 'Deterministic public WebMCP verification article served by Strapi.',
          body: 'This public Strapi article proves search and page retrieval through WebMCP.',
        },
      },
    ],
  },
  directus: {
    data: [
      {
        slug: 'webmcp-guide',
        title: 'WebMCP Guide',
        excerpt: 'Deterministic public WebMCP verification article served by Directus.',
        body: 'This public Directus article proves search and page retrieval through WebMCP.',
        status: 'published',
      },
    ],
  },
  wagtail: {
    items: [
      {
        title: 'WebMCP Guide',
        meta: { slug: 'webmcp-guide' },
        body: '<p>This public Wagtail article proves search and page retrieval through WebMCP.</p>',
      },
    ],
  },
  mediawikiList: {
    query: {
      allpages: [{ title: 'Main Page' }, { title: 'WebMCP Guide' }],
    },
  },
  mediawikiPage: {
    query: {
      pages: [
        {
          title: 'WebMCP Guide',
          extract:
            'Deterministic public WebMCP verification article.\nThis MediaWiki page proves search and page retrieval.',
          touched: publishedAt,
        },
      ],
    },
  },
};

function sendJson(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(payload),
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(payload);
}

const server = http.createServer((request, response) => {
  if (request.method !== 'GET' || !request.url) {
    sendJson(response, 405, { error: 'Method not allowed' });
    return;
  }

  const url = new URL(request.url, 'http://127.0.0.1');
  switch (url.pathname) {
    case '/ghost/api/content/posts/':
      sendJson(response, 200, fixtures.ghost);
      return;
    case '/api/posts':
      // Exercise the wrapper's documented Strapi v5 -> v4 compatibility fallback.
      if (url.searchParams.get('status') === 'published') {
        sendJson(response, 400, { error: 'Use publicationState on this fixture' });
        return;
      }
      sendJson(response, 200, fixtures.strapi);
      return;
    case '/items/posts':
      sendJson(response, 200, fixtures.directus);
      return;
    case '/api/v2/pages/':
      sendJson(response, 200, fixtures.wagtail);
      return;
    case '/mediawiki/api.php':
      if (url.searchParams.get('list') === 'allpages') {
        sendJson(response, 200, fixtures.mediawikiList);
        return;
      }
      if ((url.searchParams.get('prop') || '').includes('extracts')) {
        sendJson(response, 200, fixtures.mediawikiPage);
        return;
      }
      sendJson(response, 400, { error: 'Unsupported MediaWiki fixture request' });
      return;
    default:
      sendJson(response, 404, { error: 'Fixture route not found' });
  }
});

async function shutdown() {
  await new Promise((resolve) => server.close(resolve));
}

server.on('error', (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

server.listen(0, '127.0.0.1', async () => {
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('CMS fixture server did not receive a TCP port');
  }

  const temporaryPortFile = `${portFile}.${process.pid}.tmp`;
  await writeFile(temporaryPortFile, `${address.port}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(temporaryPortFile, portFile);
  console.log(`Public CMS fixture listening on http://127.0.0.1:${address.port}`);
});

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
