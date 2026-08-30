#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Public dependencies do not require a user-level npm credential. Keeping it
# out of this verification also makes the same command reproducible in CI.
export NPM_CONFIG_USERCONFIG=/dev/null
export NEXT_TELEMETRY_DISABLED=1
export ASTRO_TELEMETRY_DISABLED=1

for command in node npm pnpm diff sha256sum; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Missing required command: $command" >&2
    exit 1
  fi
done

node -e "const [major, minor] = process.versions.node.split('.').map(Number); if (major < 22 || (major === 22 && minor < 13)) process.exit(1)" || {
  echo "Node.js 22.13 or newer is required." >&2
  exit 1
}

if [[ ! -d node_modules ]]; then
  echo "Install root dependencies first with: pnpm install --frozen-lockfile" >&2
  exit 1
fi

EXAMPLES=(
  nextjs-app-router
  astro-basic
  express-basic
  static-html
  ghost-cms
  strapi-cms
  directus-cms
  wagtail-cms
  mediawiki-cms
)

LOCKS=()
for example in "${EXAMPLES[@]}"; do
  lock="examples/$example/package-lock.json"
  if [[ ! -f "$lock" ]]; then
    echo "Missing lockfile: $lock" >&2
    exit 1
  fi
  LOCKS+=("$lock")
done

TMP_BASE="$(cd "${TMPDIR:-/tmp}" && pwd -P)"
WORK_DIR="$(mktemp -d "$TMP_BASE/corsen-context-example-ci.XXXXXX")"
PACK_DIR="$WORK_DIR/packages"
mkdir -p "$PACK_DIR"
SERVER_PID=""
SERVER_LOG=""
MOCK_PID=""
MOCK_LOG="$WORK_DIR/public-cms-mock.log"
MOCK_PORT_FILE="$WORK_DIR/public-cms-mock.port"
MOCK_BASE_URL=""

stop_server() {
  if [[ -z "$SERVER_PID" ]]; then
    return
  fi
  if kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    for _ in 1 2 3 4 5; do
      if ! kill -0 "$SERVER_PID" 2>/dev/null; then
        break
      fi
      sleep 0.2
    done
    if kill -0 "$SERVER_PID" 2>/dev/null; then
      kill -KILL "$SERVER_PID" 2>/dev/null || true
    fi
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  SERVER_PID=""
}

stop_mock() {
  if [[ -z "$MOCK_PID" ]]; then
    return
  fi
  if kill -0 "$MOCK_PID" 2>/dev/null; then
    kill "$MOCK_PID" 2>/dev/null || true
    for _ in 1 2 3 4 5; do
      if ! kill -0 "$MOCK_PID" 2>/dev/null; then
        break
      fi
      sleep 0.2
    done
    if kill -0 "$MOCK_PID" 2>/dev/null; then
      kill -KILL "$MOCK_PID" 2>/dev/null || true
    fi
    wait "$MOCK_PID" 2>/dev/null || true
  fi
  MOCK_PID=""
}

cleanup() {
  stop_server
  stop_mock
  if [[ ! -d "$WORK_DIR" ]]; then
    return
  fi
  local resolved_work_dir
  resolved_work_dir="$(cd "$WORK_DIR" && pwd -P)"
  case "$resolved_work_dir" in
    "$TMP_BASE"/corsen-context-example-ci.*) rm -rf -- "$resolved_work_dir" ;;
    *) echo "Refusing to remove unexpected temporary path: $resolved_work_dir" >&2 ;;
  esac
}
trap cleanup EXIT

sha256sum "${LOCKS[@]}" > "$WORK_DIR/locks.before"

echo "Building candidate packages from this checkout"
pnpm --filter @corsenai/corsen-context build
pnpm --filter @corsenai/corsen-context-nextjs build
pnpm --filter @corsenai/corsen-context-astro build

pnpm --dir packages/core pack --out "$PACK_DIR/core.tgz"
pnpm --dir packages/nextjs-adapter pack --out "$PACK_DIR/nextjs.tgz"
pnpm --dir packages/astro-adapter pack --out "$PACK_DIR/astro.tgz"

verify_candidate_files() {
  local source_package="$1"
  local installed_package="$2"
  local label="$3"

  if [[ ! -d "$installed_package/dist" ]]; then
    echo "$label did not install a built candidate package" >&2
    return 1
  fi
  diff -qr "$source_package/dist" "$installed_package/dist" >/dev/null || {
    echo "$label does not match the locally built candidate" >&2
    return 1
  }
}

start_mock() {
  node scripts/mock-public-cms.mjs "$MOCK_PORT_FILE" >"$MOCK_LOG" 2>&1 &
  MOCK_PID=$!

  local mock_port=""
  local attempt
  for ((attempt = 0; attempt < 200; attempt += 1)); do
    if [[ -s "$MOCK_PORT_FILE" ]]; then
      mock_port="$(tr -d '[:space:]' < "$MOCK_PORT_FILE")"
      if [[ "$mock_port" =~ ^[0-9]+$ ]] && (( mock_port >= 1 && mock_port <= 65535 )); then
        break
      fi
      mock_port=""
    fi
    if ! kill -0 "$MOCK_PID" 2>/dev/null; then
      echo "Public CMS fixture stopped before becoming ready." >&2
      tail -n 80 "$MOCK_LOG" >&2 || true
      return 1
    fi
    sleep 0.05
  done

  if [[ -z "$mock_port" ]]; then
    echo "Public CMS fixture did not publish a valid ephemeral port." >&2
    tail -n 80 "$MOCK_LOG" >&2 || true
    return 1
  fi
  MOCK_BASE_URL="http://127.0.0.1:$mock_port"
  echo "Public CMS fixture ready at $MOCK_BASE_URL"
}

allocate_loopback_port() {
  node <<'NODE'
const net = require('node:net');
const server = net.createServer();
server.on('error', (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, () => {
  const address = server.address();
  if (!address || typeof address === 'string') {
    console.error('Could not allocate a loopback test port.');
    process.exitCode = 1;
    server.close();
    return;
  }
  console.log(address.port);
  server.close();
});
NODE
}

smoke_example() {
  local example="$1"
  local port="$2"
  local example_dir="$ROOT_DIR/examples/$example"
  if [[ ! "$port" =~ ^[0-9]+$ ]] || (( port < 1 || port > 65535 )); then
    echo "Could not allocate a valid loopback port for $example." >&2
    return 1
  fi
  local base_url="http://127.0.0.1:$port"
  local -a command
  local -a upstream_environment=()

  case "$example" in
    nextjs-app-router) command=("$example_dir/node_modules/.bin/next" start) ;;
    astro-basic) command=(node ./dist/server/entry.mjs) ;;
    static-html) command=(node ./function/server.js) ;;
    *) command=(node ./server.js) ;;
  esac

  case "$example" in
    ghost-cms)
      upstream_environment=(
        GHOST_API_URL="$MOCK_BASE_URL"
        GHOST_CONTENT_KEY=candidate-public-fixture
      )
      ;;
    strapi-cms)
      upstream_environment=(STRAPI_URL="$MOCK_BASE_URL" STRAPI_TOKEN=)
      ;;
    directus-cms)
      upstream_environment=(DIRECTUS_URL="$MOCK_BASE_URL" DIRECTUS_TOKEN=)
      ;;
    wagtail-cms)
      upstream_environment=(
        WAGTAIL_URL="$MOCK_BASE_URL"
        WAGTAIL_PAGE_TYPE=blog.BlogPage
        WAGTAIL_BODY_FIELD=body
      )
      ;;
    mediawiki-cms)
      upstream_environment=(
        MW_API_URL="$MOCK_BASE_URL/mediawiki/api.php"
        MW_USER_AGENT=Corsen-Context-Candidate-Verification/1.0
        MW_MAX_PAGES=1
        MW_BATCH_SIZE=1
        MW_CACHE_TTL_MS=1000
      )
      ;;
  esac

  SERVER_LOG="$WORK_DIR/$example.log"
  (
    cd "$example_dir"
    exec env \
      "${upstream_environment[@]}" \
      HOST=127.0.0.1 \
      PORT="$port" \
      SITE_URL="$base_url" \
      NEXT_PUBLIC_SITE_URL="$base_url" \
      TRUST_PROXY=0 \
      CORSEN_CONTEXT_MCP_ENABLED=true \
      "${command[@]}"
  ) >"$SERVER_LOG" 2>&1 &
  SERVER_PID=$!

  if ! node scripts/smoke-example-mcp.mjs "$base_url" "$example"; then
    echo "--- $example server log ---" >&2
    tail -n 80 "$SERVER_LOG" >&2 || true
    return 1
  fi
  stop_server

  # Exercise the transport gates with a fresh rate-limit window. The lifecycle
  # and useful-content smoke intentionally consumes real request quota.
  SERVER_LOG="$WORK_DIR/$example-transport.log"
  (
    cd "$example_dir"
    exec env \
      "${upstream_environment[@]}" \
      HOST=127.0.0.1 \
      PORT="$port" \
      SITE_URL="$base_url" \
      NEXT_PUBLIC_SITE_URL="$base_url" \
      TRUST_PROXY=0 \
      CORSEN_CONTEXT_MCP_ENABLED=true \
      "${command[@]}"
  ) >"$SERVER_LOG" 2>&1 &
  SERVER_PID=$!
  if ! node scripts/smoke-express-transport.mjs "$base_url" "$example" enabled; then
    echo "--- $example transport log ---" >&2
    tail -n 80 "$SERVER_LOG" >&2 || true
    return 1
  fi
  stop_server

  SERVER_LOG="$WORK_DIR/$example-disabled.log"
  (
    cd "$example_dir"
    exec env \
      "${upstream_environment[@]}" \
      HOST=127.0.0.1 \
      PORT="$port" \
      SITE_URL="$base_url" \
      NEXT_PUBLIC_SITE_URL="$base_url" \
      TRUST_PROXY=0 \
      CORSEN_CONTEXT_MCP_ENABLED=false \
      "${command[@]}"
  ) >"$SERVER_LOG" 2>&1 &
  SERVER_PID=$!

  disabled_mode=disabled
  case "$example" in
    nextjs-app-router|astro-basic|express-basic|ghost-cms|strapi-cms|directus-cms|wagtail-cms|mediawiki-cms)
      disabled_mode=disabled-discovery
      ;;
  esac
  if ! node scripts/smoke-express-transport.mjs "$base_url" "$example" "$disabled_mode"; then
    echo "--- $example disabled transport log ---" >&2
    tail -n 80 "$SERVER_LOG" >&2 || true
    return 1
  fi
  stop_server
}

start_mock

for example in "${EXAMPLES[@]}"; do
  example_dir="examples/$example"
  echo
  echo "Verifying $example against local candidate archives"

  npm ci --prefix "$example_dir" --no-audit --no-fund

  rm -rf -- \
    "$example_dir/node_modules/@corsenai/corsen-context" \
    "$example_dir/node_modules/@corsenai/corsen-context-nextjs" \
    "$example_dir/node_modules/@corsenai/corsen-context-astro"

  candidate_archives=("$PACK_DIR/core.tgz")
  case "$example" in
    nextjs-app-router) candidate_archives+=("$PACK_DIR/nextjs.tgz") ;;
    astro-basic) candidate_archives+=("$PACK_DIR/astro.tgz") ;;
  esac

  npm install \
    --prefix "$example_dir" \
    --no-save \
    --package-lock=false \
    --no-audit \
    --no-fund \
    "${candidate_archives[@]}"

  verify_candidate_files \
    packages/core \
    "$example_dir/node_modules/@corsenai/corsen-context" \
    "$example core package"

  example_port="$(allocate_loopback_port)"
  if [[ ! "$example_port" =~ ^[0-9]+$ ]] || (( example_port < 1 || example_port > 65535 )); then
    echo "Could not allocate a valid loopback port for $example." >&2
    exit 1
  fi
  example_base_url="http://127.0.0.1:$example_port"

  case "$example" in
    nextjs-app-router)
      verify_candidate_files \
        packages/nextjs-adapter \
        "$example_dir/node_modules/@corsenai/corsen-context-nextjs" \
        "$example Next.js adapter"
      NEXT_PUBLIC_SITE_URL="$example_base_url" npm run build --prefix "$example_dir"
      ;;
    astro-basic)
      verify_candidate_files \
        packages/astro-adapter \
        "$example_dir/node_modules/@corsenai/corsen-context-astro" \
        "$example Astro adapter"
      SITE_URL="$example_base_url" npm run build --prefix "$example_dir"
      ;;
    static-html)
      node --check "$example_dir/function/server.js"
      SITE_URL="$example_base_url" npm run build --prefix "$example_dir"
      ;;
    *)
      node --check "$example_dir/server.js"
      ;;
  esac

  smoke_example "$example" "$example_port"
done

sha256sum "${LOCKS[@]}" > "$WORK_DIR/locks.after"
if ! diff -u "$WORK_DIR/locks.before" "$WORK_DIR/locks.after"; then
  echo "An example package-lock.json changed during candidate verification." >&2
  exit 1
fi

echo
echo "All nine examples passed with local candidate packages; lockfiles are unchanged."
