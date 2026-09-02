#!/usr/bin/env bash
set -euo pipefail

for command_name in cmp mariadb mariadb-admin mariadb-install-db mariadbd node php unzip wp; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 2
  fi
done

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
PLUGIN_MAIN="$REPOSITORY_ROOT/packages/wordpress-plugin/corsen-context/corsen-context.php"
PLUGIN_README="$REPOSITORY_ROOT/packages/wordpress-plugin/corsen-context/readme.txt"
HEADER_VERSION="$(sed -nE 's/^[[:space:]]*\*[[:space:]]*Version:[[:space:]]*([^[:space:]]+).*/\1/p' "$PLUGIN_MAIN" | tr -d '\r' | head -n 1)"
STABLE_VERSION="$(sed -nE 's/^Stable tag:[[:space:]]*([^[:space:]]+).*/\1/p' "$PLUGIN_README" | tr -d '\r' | head -n 1)"
if [[ -z "$HEADER_VERSION" || "$HEADER_VERSION" != "$STABLE_VERSION" ]]; then
  echo "Plugin header and stable-tag versions must match before package verification" >&2
  exit 2
fi
ARCHIVE_PATH="${1:-$REPOSITORY_ROOT/dist/corsen-context-$HEADER_VERSION.zip}"
AURORA_FIXTURE_PATH="${AURORA_FIXTURE_PATH:-}"
WORDPRESS_VERSION="${WORDPRESS_VERSION:-7.0.2}"
TEMP_ROOT="$(realpath -m "${TMPDIR:-/tmp}")"
WORK_DIR="$(mktemp -d "$TEMP_ROOT/corsen-context-wp-XXXXXX")"
DB_DIR="$WORK_DIR/database"
DB_SOCKET="$WORK_DIR/mariadb.sock"
DB_PID_FILE="$WORK_DIR/mariadb.pid"
DB_LOG="$WORK_DIR/mariadb.log"
WP_DIR="$WORK_DIR/wordpress"
DB_PID=''
SERVER_PID=''

cleanup() {
  set +e
  if [[ -n "$SERVER_PID" ]]; then
    kill "$SERVER_PID" >/dev/null 2>&1
    wait "$SERVER_PID" >/dev/null 2>&1
  fi
  if [[ -S "$DB_SOCKET" ]]; then
    mariadb-admin --no-defaults --socket="$DB_SOCKET" --user=root shutdown >/dev/null 2>&1
  elif [[ -n "$DB_PID" ]]; then
    kill "$DB_PID" >/dev/null 2>&1
  fi
  if [[ -n "$DB_PID" ]]; then
    wait "$DB_PID" >/dev/null 2>&1
  fi

  local resolved_work
  resolved_work="$(realpath -m "$WORK_DIR")"
  if [[ "$resolved_work" == "$TEMP_ROOT"/corsen-context-wp-* && "$resolved_work" != "$TEMP_ROOT" ]]; then
    rm -rf -- "$resolved_work"
  else
    echo "Refusing to remove unexpected temporary path: $resolved_work" >&2
  fi
}
trap cleanup EXIT INT TERM

if [[ ! -f "$ARCHIVE_PATH" ]]; then
  echo "Plugin archive not found: $ARCHIVE_PATH" >&2
  exit 2
fi
ARCHIVE_PATH="$(realpath "$ARCHIVE_PATH")"

PACKAGED_LICENSE="$WORK_DIR/LICENSE"
if ! unzip -p "$ARCHIVE_PATH" corsen-context/LICENSE >"$PACKAGED_LICENSE"; then
  echo "Plugin archive does not contain corsen-context/LICENSE" >&2
  exit 1
fi
if ! cmp -s "$REPOSITORY_ROOT/LICENSE" "$PACKAGED_LICENSE"; then
  echo "Packaged WordPress LICENSE differs from the repository MIT LICENSE" >&2
  exit 1
fi

CONTENT_MODE='package'
if [[ -n "$AURORA_FIXTURE_PATH" ]]; then
  if [[ ! -f "$AURORA_FIXTURE_PATH" ]]; then
    echo "Aurora fixture not found: $AURORA_FIXTURE_PATH" >&2
    exit 2
  fi
  AURORA_FIXTURE_PATH="$(realpath "$AURORA_FIXTURE_PATH")"
  CONTENT_MODE='aurora'
fi

mkdir -p "$DB_DIR" "$WP_DIR"
mariadb-install-db \
  --no-defaults \
  --auth-root-authentication-method=normal \
  --skip-test-db \
  --datadir="$DB_DIR" >/dev/null

mariadbd \
  --no-defaults \
  --datadir="$DB_DIR" \
  --socket="$DB_SOCKET" \
  --pid-file="$DB_PID_FILE" \
  --skip-networking \
  --log-error="$DB_LOG" \
  --user="$(id -un)" &
DB_PID=$!

for _ in $(seq 1 100); do
  if mariadb-admin --no-defaults --socket="$DB_SOCKET" --user=root ping >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "$DB_PID" >/dev/null 2>&1; then
    echo "Disposable MariaDB stopped before becoming ready" >&2
    sed -n '1,120p' "$DB_LOG" >&2
    exit 1
  fi
  sleep 0.1
done
mariadb-admin --no-defaults --socket="$DB_SOCKET" --user=root ping >/dev/null
mariadb --no-defaults --socket="$DB_SOCKET" --user=root \
  --execute='CREATE DATABASE corsen_context_receipt CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;'

wp core download --quiet --path="$WP_DIR" --version="$WORDPRESS_VERSION"
wp config create \
  --quiet \
  --path="$WP_DIR" \
  --dbname=corsen_context_receipt \
  --dbuser=root \
  --dbpass='' \
  --dbhost="localhost:$DB_SOCKET"
wp core install \
  --quiet \
  --path="$WP_DIR" \
  --url=http://127.0.0.1 \
  --title='Corsen Context package receipt' \
  --admin_user=receipt-admin \
  --admin_password=disposable-local-only \
  --admin_email=receipt@example.invalid \
  --skip-email
wp rewrite structure '/%postname%/' --path="$WP_DIR" >/dev/null
wp plugin install "$ARCHIVE_PATH" --path="$WP_DIR" --activate >/dev/null

INSTALLED_VERSION="$(wp plugin get corsen-context --path="$WP_DIR" --field=version)"
EXPECTED_VERSION="$(basename "$ARCHIVE_PATH" | sed -E 's/^corsen-context-([0-9A-Za-z.+-]+)\.zip$/\1/')"
if [[ "$INSTALLED_VERSION" != "$EXPECTED_VERSION" ]]; then
  echo "Installed version $INSTALLED_VERSION does not match archive version $EXPECTED_VERSION" >&2
  exit 1
fi

if [[ "$CONTENT_MODE" == 'aurora' ]]; then
  DEFAULT_CONTENT_IDS="$(wp post list --path="$WP_DIR" --post_type=post,page --post_status=any --format=ids)"
  if [[ -n "$DEFAULT_CONTENT_IDS" ]]; then
    # The path and database are both disposable and were created above.
    # shellcheck disable=SC2086
    wp post delete $DEFAULT_CONTENT_IDS --path="$WP_DIR" --force >/dev/null
  fi
  wp plugin install wordpress-importer --path="$WP_DIR" --activate >/dev/null
  wp import "$AURORA_FIXTURE_PATH" --path="$WP_DIR" --authors=create >/dev/null
  HOME_PAGE_ID="$(wp post list --path="$WP_DIR" --post_type=page --post_status=publish --name=home --field=ID --format=ids)"
  if [[ -z "$HOME_PAGE_ID" || "$HOME_PAGE_ID" == *' '* ]]; then
    echo "Expected exactly one imported Home page, got: ${HOME_PAGE_ID:-none}" >&2
    exit 1
  fi
  wp option update show_on_front page --path="$WP_DIR" >/dev/null
  wp option update page_on_front "$HOME_PAGE_ID" --path="$WP_DIR" >/dev/null
  wp eval '
    $post = get_page_by_path( "shipping-education" );
    if ( ! $post ) {
      fwrite( STDERR, "Unicode receipt page was not imported\n" );
      exit( 1 );
    }
    $result = wp_update_post(
      array(
        "ID"           => $post->ID,
        "post_excerpt" => "",
        "post_content" => "Unicode Needle " . str_repeat( "€", 220 ) . " 😀",
      ),
      true
    );
    if ( is_wp_error( $result ) ) {
      fwrite( STDERR, "Unicode receipt page could not be prepared\n" );
      exit( 1 );
    }
  ' --path="$WP_DIR" >/dev/null
else
  wp post create \
    --quiet \
    --path="$WP_DIR" \
    --post_type=page \
    --post_status=publish \
    --post_name=package-receipt \
    --post_title='Package receipt AK-E17' \
    --post_content='Deterministic package receipt marker AK-E17.'
fi
wp option patch insert corsen_context_settings webmcp_enabled 1 --path="$WP_DIR" >/dev/null
wp rewrite flush --path="$WP_DIR" >/dev/null

TEST_PORT="$(php -r '$s=stream_socket_server("tcp://127.0.0.1:0", $e, $m); echo parse_url(stream_socket_get_name($s, false), PHP_URL_PORT); fclose($s);')"
BASE_URL="http://127.0.0.1:$TEST_PORT"
wp option update home "$BASE_URL" --path="$WP_DIR" >/dev/null
wp option update siteurl "$BASE_URL" --path="$WP_DIR" >/dev/null
wp server --host=127.0.0.1 --port="$TEST_PORT" --path="$WP_DIR" >"$WORK_DIR/wp-server.log" 2>&1 &
SERVER_PID=$!

for _ in $(seq 1 100); do
  if php -r '$u=$argv[1]; $c=@file_get_contents($u); exit($c === false ? 1 : 0);' "$BASE_URL/"; then
    break
  fi
  if ! kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    echo "Disposable WordPress server stopped before becoming ready" >&2
    sed -n '1,120p' "$WORK_DIR/wp-server.log" >&2
    exit 1
  fi
  sleep 0.1
done

wp option update permalink_structure '' --path="$WP_DIR" >/dev/null
wp rewrite flush --path="$WP_DIR" >/dev/null
PLAIN_MCP_ENDPOINT="$(wp eval 'echo rest_url("corsen-context/v1/mcp");' --path="$WP_DIR")"
node --input-type=module - "$BASE_URL" "$PLAIN_MCP_ENDPOINT" <<'NODE'
const baseUrl = process.argv[2];
const endpoint = new URL(process.argv[3]);
if (endpoint.origin !== new URL(baseUrl).origin || !endpoint.searchParams.has('rest_route')) {
  throw new Error(`Plain-permalink REST URL was not canonical: ${endpoint}`);
}
const home = await fetch(new URL('/', baseUrl)).then((response) => response.text());
if (!home.includes(endpoint.href) && !home.includes(endpoint.href.replaceAll('&', '&amp;'))) {
  throw new Error('WordPress discovery did not publish the canonical plain-permalink REST URL');
}
const response = await fetch(endpoint, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'plain-permalink-receipt', version: '1' },
    },
  }),
});
const payload = await response.json();
if (!response.ok || payload.result?.protocolVersion !== '2025-11-25') {
  throw new Error(`Plain-permalink MCP initialization failed: HTTP ${response.status}`);
}
console.log('WORDPRESS REST plain-permalink canonical endpoint verified');
NODE

wp rewrite structure '/%postname%/' --path="$WP_DIR" >/dev/null
wp rewrite flush --path="$WP_DIR" >/dev/null
MCP_ENDPOINT="$(wp eval 'echo rest_url("corsen-context/v1/mcp");' --path="$WP_DIR")"
case "$MCP_ENDPOINT" in
  "$BASE_URL"/*) ;;
  *) echo "Canonical MCP endpoint escaped the disposable site origin" >&2; exit 1 ;;
esac

node --input-type=module - "$BASE_URL" "$CONTENT_MODE" "$MCP_ENDPOINT" <<'NODE'
const baseUrl = process.argv[2];
const contentMode = process.argv[3];
const endpoint = new URL(process.argv[4]);
const sameOrigin = new URL(baseUrl).origin;

const getResponse = await fetch(endpoint, {
  method: 'GET',
  headers: { Origin: sameOrigin },
  redirect: 'manual',
});
if (getResponse.status !== 405 || !/\bPOST\b/i.test(getResponse.headers.get('allow') || '')) {
  throw new Error('GET MCP transport did not return 405 with Allow: POST');
}

const optionsResponse = await fetch(endpoint, {
  method: 'OPTIONS',
  headers: {
    Origin: sameOrigin,
    'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'accept,content-type,mcp-protocol-version',
  },
});
if (
  optionsResponse.status !== 204 ||
  optionsResponse.headers.get('access-control-allow-origin') !== sameOrigin
) {
  throw new Error('Same-origin MCP preflight did not return 204 with matching CORS origin');
}

const hostileOptions = await fetch(endpoint, {
  method: 'OPTIONS',
  headers: {
    Origin: 'https://cross-origin.invalid',
    'Access-Control-Request-Method': 'POST',
  },
});
if (hostileOptions.status !== 403) {
  throw new Error(`Hostile MCP preflight returned HTTP ${hostileOptions.status}, expected 403`);
}

const initializeBody = JSON.stringify({
  jsonrpc: '2.0',
  id: 0,
  method: 'initialize',
  params: {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: { name: 'wordpress-package-receipt', version: '1.0.0' },
  },
});
const wrongContentType = await fetch(endpoint, {
  method: 'POST',
  headers: { Accept: 'application/json', 'Content-Type': 'text/plain' },
  body: initializeBody,
});
if (wrongContentType.status !== 415) {
  throw new Error(`Wrong MCP Content-Type returned HTTP ${wrongContentType.status}, expected 415`);
}
const incompatibleAccept = await fetch(endpoint, {
  method: 'POST',
  headers: { Accept: 'text/plain', 'Content-Type': 'application/json; charset=utf-8' },
  body: initializeBody,
});
if (incompatibleAccept.status !== 406) {
  throw new Error(`Incompatible MCP Accept returned HTTP ${incompatibleAccept.status}, expected 406`);
}

async function expectJsonRpcFailure(rawBody, expectedStatus, expectedCode, label) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: rawBody,
  });
  const contentType = response.headers.get('content-type') || '';
  const payload = await response.json();
  if (
    response.status !== expectedStatus ||
    !contentType.includes('application/json') ||
    payload.error?.code !== expectedCode
  ) {
    throw new Error(
      `${label} returned HTTP ${response.status} / JSON-RPC ${String(payload.error?.code)} / ${contentType || 'no content type'}; expected HTTP ${expectedStatus} / JSON-RPC ${expectedCode}`,
    );
  }
}

await expectJsonRpcFailure('{', 400, -32700, 'Malformed JSON');
await expectJsonRpcFailure('42', 400, -32600, 'Valid primitive JSON');
await expectJsonRpcFailure(' '.repeat(102401), 413, -32600, 'Oversized request body');
await expectJsonRpcFailure(
  '{"jsonrpc":"2.0","method":"ping","id":null}',
  200,
  -32600,
  'Null request id',
);
await expectJsonRpcFailure(
  '{"jsonrpc":"2.0","method":"ping","id":1,"params":null}',
  200,
  -32600,
  'Null request params',
);
await expectJsonRpcFailure(
  '{"jsonrpc":"2.0","method":"ping","id":1,"params":[]}',
  200,
  -32600,
  'List request params',
);
await expectJsonRpcFailure(
  '{"jsonrpc":"2.0","id":1,"result":{}}',
  400,
  -32600,
  'Unexpected JSON-RPC response',
);

async function post(body, protocolVersion, isNotification = false) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      ...(protocolVersion ? { 'MCP-Protocol-Version': protocolVersion } : {}),
    },
    body: JSON.stringify(body),
  });
  if (isNotification) {
    if (response.status !== 202) {
      throw new Error(`${body.method} returned HTTP ${response.status}, expected 202`);
    }
    const text = await response.text();
    if (text.length !== 0) throw new Error(`${body.method} returned a response body`);
    return null;
  }
  if (!response.ok) throw new Error(`${body.method} returned HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.error) throw new Error(`${body.method} returned ${payload.error.code}`);
  return payload.result;
}

const protocolVersion = '2025-11-25';
const initialized = await post({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion,
    capabilities: {},
    clientInfo: { name: 'wordpress-package-receipt', version: '1.0.0' },
  },
});
if (initialized.protocolVersion !== protocolVersion) {
  throw new Error(`Unexpected protocol version ${initialized.protocolVersion}`);
}

await post(
  { jsonrpc: '2.0', method: 'notifications/initialized', params: {} },
  protocolVersion,
  true,
);

async function expectProtocolError(body, expectedCode, label) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'MCP-Protocol-Version': protocolVersion,
    },
    body: JSON.stringify(body),
  });
  const contentType = response.headers.get('content-type') || '';
  const payload = await response.json();
  if (
    response.status !== 200 ||
    !contentType.includes('application/json') ||
    payload.error?.code !== expectedCode ||
    payload.id !== body.id
  ) {
    throw new Error(
      `${label} returned HTTP ${response.status} / JSON-RPC ${String(payload.error?.code)}; expected HTTP 200 / JSON-RPC ${expectedCode}`,
    );
  }
}

await expectProtocolError(
  { jsonrpc: '2.0', id: 20, method: 'unknown/method', params: {} },
  -32601,
  'Unknown method',
);
await expectProtocolError(
  {
    jsonrpc: '2.0',
    id: 21,
    method: 'tools/call',
    params: { name: 'get_sitemap', arguments: [] },
  },
  -32602,
  'Invalid tool envelope',
);
await expectProtocolError(
  {
    jsonrpc: '2.0',
    id: 22,
    method: 'resources/read',
    params: { uri: `${baseUrl}/not-exposed` },
  },
  -32002,
  'Missing resource',
);
await expectProtocolError(
  {
    jsonrpc: '2.0',
    id: 23,
    method: 'tools/call',
    params: { name: 'not_a_tool', arguments: {} },
  },
  -32602,
  'Unknown tool',
);

const invalidResourceReads = [
  [24, {}, 'Missing resource URI'],
  [25, { uri: null }, 'Null resource URI'],
  [26, { uri: [] }, 'List resource URI'],
  [27, { uri: '' }, 'Empty resource URI'],
  [28, { uri: '😀'.repeat(2001) }, 'Oversized resource URI'],
];
for (const [id, params, label] of invalidResourceReads) {
  await expectProtocolError(
    { jsonrpc: '2.0', id, method: 'resources/read', params },
    -32602,
    label,
  );
}

const resourcesWithoutCursor = await post(
  { jsonrpc: '2.0', id: 29, method: 'resources/list', params: {} },
  protocolVersion,
);
if (!Array.isArray(resourcesWithoutCursor.resources)) {
  throw new Error('resources/list without a cursor did not return a resource array');
}
await expectProtocolError(
  { jsonrpc: '2.0', id: 30, method: 'resources/list', params: { cursor: null } },
  -32602,
  'Null resource cursor',
);
await expectProtocolError(
  { jsonrpc: '2.0', id: 31, method: 'resources/list', params: { cursor: '' } },
  -32602,
  'Empty resource cursor',
);

const listed = await post(
  { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
  protocolVersion,
);
const expectedTools = ['search_site', 'get_page_content', 'list_content', 'get_sitemap'];
const actualTools = listed.tools?.map((tool) => tool.name) || [];
if (JSON.stringify(actualTools) !== JSON.stringify(expectedTools)) {
  throw new Error(`Unexpected tools: ${actualTools.join(', ')}`);
}

const searchArguments = contentMode === 'aurora'
  ? { query: 'AK-E17 Maker arm calibration', limit: 10 }
  : { query: 'AK-E17', limit: 3 };
const searched = await post(
  {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: { name: 'search_site', arguments: searchArguments },
  },
  protocolVersion,
);
const matches = JSON.parse(searched.content?.[0]?.text || 'null');
if (!Array.isArray(matches) || matches.length < 1) {
  throw new Error('search_site did not return an expected result');
}
const selected = contentMode === 'aurora'
  ? matches.find((match) => new URL(match.url).pathname === '/guides/ak-e17/')
  : matches[0];
if (!selected) throw new Error('search_site did not return the canonical AK-E17 page');

const read = await post(
  {
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: { name: 'get_page_content', arguments: { uri: selected.url } },
  },
  protocolVersion,
);
const page = JSON.parse(read.content?.[0]?.text || 'null');
if (!page?.markdown?.includes('AK-E17') || new URL(page.url).origin !== new URL(baseUrl).origin) {
  throw new Error('get_page_content did not return the selected same-origin marker');
}

if (contentMode === 'aurora') {
  const requiredStepMarkers = [
    'Power down.',
    'Zero the arm.',
    'Test once.',
  ];
  for (const marker of requiredStepMarkers) {
    if (!page.markdown.includes(marker)) throw new Error(`AK-E17 content is missing: ${marker}`);
  }
  const recoverySection = page.markdown.match(
    /## Three fixed steps\s+([\s\S]*?)\s+## Escalation condition/,
  );
  const runtimeSteps = recoverySection?.[1].match(/^- /gm) || [];
  if (runtimeSteps.length !== 3) {
    throw new Error(`AK-E17 runtime content must contain exactly 3 recovery steps, got ${runtimeSteps.length}`);
  }
  if (!page.markdown.includes('Do not repeat calibration.')) {
    throw new Error('AK-E17 content is missing the human escalation condition');
  }

  const call = async (id, name, args) => {
    const result = await post(
      { jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } },
      protocolVersion,
    );
    return JSON.parse(result.content?.[0]?.text || 'null');
  };
  const pages = await call(5, 'list_content', { type: 'page', page: 1, limit: 20 });
  const posts = await call(6, 'list_content', { type: 'post', page: 1, limit: 20 });
  const sitemap = await call(7, 'get_sitemap', {});
  if (pages?.total !== 8 || pages.items?.length !== 8) {
    throw new Error(`Expected 8 imported pages, got ${pages?.total ?? 'unknown'}`);
  }
  if (posts?.total !== 6 || posts.items?.length !== 6) {
    throw new Error(`Expected 6 imported posts, got ${posts?.total ?? 'unknown'}`);
  }
  const unicodeMatches = await call(8, 'search_site', { query: 'Unicode Needle', limit: 10 });
  const unicodePage = unicodeMatches.find(
    (item) => new URL(item.url).pathname === '/shipping-education/',
  );
  if (
    !unicodePage ||
    typeof unicodePage.description !== 'string' ||
    typeof unicodePage.snippet !== 'string' ||
    !unicodePage.description.includes('€') ||
    !unicodePage.description.endsWith('...') ||
    !unicodePage.snippet.includes('€') ||
    unicodePage.description.includes('�') ||
    unicodePage.snippet.includes('�')
  ) {
    throw new Error('Multilingual search metadata was not returned as valid bounded UTF-8');
  }
  const sitemapPaths = new Set((sitemap || []).map((item) => new URL(item.url).pathname));
  for (const path of ['/products/', '/guides/ak-e17/', '/shipping-education/', '/agent-access/']) {
    if (!sitemapPaths.has(path)) throw new Error(`Sitemap is missing ${path}`);
  }
}

const [home, llms] = await Promise.all([
  fetch(new URL('/', baseUrl)).then((response) => response.text()),
  fetch(new URL('/llms.txt', baseUrl)).then(async (response) => ({
    ok: response.ok,
    text: await response.text(),
  })),
]);
if (!home.includes('document.modelContext') || !home.includes('registerTool')) {
  throw new Error('Home page does not contain the enabled WebMCP registration');
}
const expectedLlmsMarker = contentMode === 'aurora' ? 'Aurora Kits' : 'Package receipt';
if (!llms.ok || !llms.text.includes(expectedLlmsMarker)) {
  throw new Error(`llms.txt does not contain the expected ${contentMode} marker`);
}

console.log(`VERIFIED WordPress ${initialized.protocolVersion} plugin=${expectedTools.length} tools`);
console.log(`CHAIN search_site -> get_page_content ${new URL(page.url).pathname}`);
if (contentMode === 'aurora') console.log('CORPUS Aurora pages=8 posts=6 sitemap=verified');
NODE

if [[ "$CONTENT_MODE" == 'aurora' ]]; then
  wp option patch update corsen_context_settings exclude_paths '/guides/ak-e17/' --path="$WP_DIR" >/dev/null
  CACHE_VERSION="$(wp option get corsen_context_cache_version --path="$WP_DIR")"
  wp option update corsen_context_cache_version "$((CACHE_VERSION + 1))" --path="$WP_DIR" >/dev/null
  wp transient delete corsen_context_llms_txt --path="$WP_DIR" >/dev/null
  wp transient delete corsen_context_llms_full_txt --path="$WP_DIR" >/dev/null 2>&1 || true

  node --input-type=module - "$BASE_URL" exclude "$MCP_ENDPOINT" <<'NODE'
const baseUrl = process.argv[2];
const expectedState = process.argv[3];
const endpoint = new URL(process.argv[4]);
const protocolVersion = '2025-11-25';
const canonicalPath = '/guides/ak-e17/';
const canonicalUrl = new URL(canonicalPath, baseUrl).href;

async function rawCall(id, name, args) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'MCP-Protocol-Version': protocolVersion,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  });
  const payload = await response.json();
  if (!response.ok && !payload.error) throw new Error(`${name} returned HTTP ${response.status}`);
  return payload;
}

const searched = await rawCall(20, 'search_site', {
  query: 'AK-E17 Maker arm calibration',
  limit: 10,
});
if (searched.error) throw new Error(`search_site returned ${searched.error.code}`);
const matches = JSON.parse(searched.result?.content?.[0]?.text || 'null');
if (!Array.isArray(matches)) throw new Error('search_site did not return an array');
const hasCanonical = matches.some((match) => new URL(match.url).pathname === canonicalPath);

const read = await rawCall(21, 'get_page_content', { uri: canonicalUrl });
const [llms, humanPage] = await Promise.all([
  fetch(new URL('/llms.txt', baseUrl)).then((response) => response.text()),
  fetch(canonicalUrl),
]);

if (expectedState === 'exclude') {
  if (hasCanonical) throw new Error('Excluded path remained in search_site');
  const readErrorText = read.result?.content?.[0]?.text || '';
  if (
    read.error ||
    read.result?.isError !== true ||
    !readErrorText.includes('Resource not found or not exposed')
  ) {
    throw new Error('Excluded path remained readable by get_page_content');
  }
  if (llms.includes(canonicalPath)) throw new Error('Excluded path remained in llms.txt');
  if (!humanPage.ok) throw new Error('Owner exclusion unexpectedly removed the human page');
  console.log('OWNER CONTROL path hidden from tools/llms while human page remains public');
} else {
  if (!hasCanonical || read.error || read.result?.isError === true) {
    throw new Error('Restored path did not return to both tools');
  }
  if (!llms.includes(canonicalPath)) throw new Error('Restored path did not return to llms.txt');
  console.log('OWNER CONTROL path restored to tools and llms.txt');
}
NODE

  wp option patch update corsen_context_settings exclude_paths '' --path="$WP_DIR" >/dev/null
  CACHE_VERSION="$(wp option get corsen_context_cache_version --path="$WP_DIR")"
  wp option update corsen_context_cache_version "$((CACHE_VERSION + 1))" --path="$WP_DIR" >/dev/null
  wp transient delete corsen_context_llms_txt --path="$WP_DIR" >/dev/null
  wp transient delete corsen_context_llms_full_txt --path="$WP_DIR" >/dev/null 2>&1 || true

  node --input-type=module - "$BASE_URL" restore "$MCP_ENDPOINT" <<'NODE'
const baseUrl = process.argv[2];
const expectedState = process.argv[3];
const endpoint = new URL(process.argv[4]);
const protocolVersion = '2025-11-25';
const canonicalPath = '/guides/ak-e17/';
const canonicalUrl = new URL(canonicalPath, baseUrl).href;

async function rawCall(id, name, args) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'MCP-Protocol-Version': protocolVersion,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  });
  const payload = await response.json();
  if (!response.ok && !payload.error) throw new Error(`${name} returned HTTP ${response.status}`);
  return payload;
}

const searched = await rawCall(22, 'search_site', {
  query: 'AK-E17 Maker arm calibration',
  limit: 10,
});
if (searched.error) throw new Error(`search_site returned ${searched.error.code}`);
const matches = JSON.parse(searched.result?.content?.[0]?.text || 'null');
const hasCanonical = Array.isArray(matches)
  && matches.some((match) => new URL(match.url).pathname === canonicalPath);
const read = await rawCall(23, 'get_page_content', { uri: canonicalUrl });
const llms = await fetch(new URL('/llms.txt', baseUrl)).then((response) => response.text());
if (expectedState !== 'restore' || !hasCanonical || read.error) {
  throw new Error('Restored path did not return to both tools');
}
if (!llms.includes(canonicalPath)) throw new Error('Restored path did not return to llms.txt');
console.log('OWNER CONTROL path restored to tools and llms.txt');
NODE
fi

wp option patch update corsen_context_settings webmcp_enabled 0 --path="$WP_DIR" >/dev/null
node --input-type=module - "$BASE_URL" "$MCP_ENDPOINT" <<'NODE'
const baseUrl = process.argv[2];
const mcpEndpoint = process.argv[3];
const [home, endpoint] = await Promise.all([
  fetch(new URL('/', baseUrl)).then((response) => response.text()),
  fetch(new URL(mcpEndpoint), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'MCP-Protocol-Version': '2025-11-25',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  }),
]);
if (home.includes('document.modelContext') || home.includes('registerTool')) {
  throw new Error('Disabling WebMCP did not remove the in-page registration');
}
if (!endpoint.ok) throw new Error(`Disabling WebMCP unexpectedly disabled MCP: HTTP ${endpoint.status}`);
console.log('OWNER CONTROL WebMCP registration removed while MCP remains available');
NODE

wp plugin deactivate corsen-context --path="$WP_DIR" >/dev/null
wp eval \
  'define("WP_UNINSTALL_PLUGIN", "corsen-context/corsen-context.php"); require WP_PLUGIN_DIR . "/corsen-context/uninstall.php";' \
  --path="$WP_DIR" \
  --skip-plugins >/dev/null
wp plugin delete corsen-context --path="$WP_DIR" >/dev/null
if wp option get corsen_context_settings --path="$WP_DIR" >/dev/null 2>&1; then
  echo 'Plugin settings remained after full uninstall' >&2
  exit 1
fi
if wp option get corsen_context_form_submissions --path="$WP_DIR" >/dev/null 2>&1; then
  echo 'Legacy submission storage remained after full uninstall' >&2
  exit 1
fi

node --input-type=module - "$BASE_URL" "$MCP_ENDPOINT" <<'NODE'
const baseUrl = process.argv[2];
const endpoint = new URL(process.argv[3]);
const response = await fetch(endpoint, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
});
if (response.status !== 404) {
  throw new Error(`Removed plugin endpoint returned HTTP ${response.status}, expected 404`);
}
const home = await fetch(new URL('/', baseUrl)).then((result) => result.text());
if (home.includes('document.modelContext') || home.includes('registerTool')) {
  throw new Error('Removed plugin left a WebMCP registration on the page');
}
console.log('ROLLBACK plugin removed, settings cleared, endpoint=404');
NODE

echo "Package: $(basename "$ARCHIVE_PATH")"
echo "SHA-256: $(sha256sum "$ARCHIVE_PATH" | cut -d' ' -f1)"
echo "WordPress: $WORDPRESS_VERSION"
echo "PHP: $(php -r 'echo PHP_VERSION;')"
echo "Installed plugin: $INSTALLED_VERSION"
if [[ "$CONTENT_MODE" == 'aurora' ]]; then
  echo "Aurora fixture: $(basename "$AURORA_FIXTURE_PATH")"
  echo "Aurora SHA-256: $(sha256sum "$AURORA_FIXTURE_PATH" | cut -d' ' -f1)"
fi
