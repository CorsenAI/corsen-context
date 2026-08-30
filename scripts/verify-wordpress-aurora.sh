#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
export AURORA_FIXTURE_PATH="${AURORA_FIXTURE_PATH:-$REPOSITORY_ROOT/examples/wordpress-aurora/aurora-kits.wordpress.xml}"

exec "$REPOSITORY_ROOT/scripts/verify-wordpress-package.sh" "$@"
