#!/usr/bin/env bash

set -euo pipefail

expected_commit="${EXPECTED_COMMIT:-}"
if [[ ! "$expected_commit" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Refusing to publish: EXPECTED_COMMIT must be a full lowercase SHA." >&2
  exit 1
fi

head_commit="$(git rev-parse HEAD)"
if [[ "$head_commit" != "$expected_commit" ]]; then
  echo "Refusing to publish: checked-out HEAD does not match EXPECTED_COMMIT." >&2
  exit 1
fi

git fetch --force --no-tags origin \
  '+refs/heads/main:refs/remotes/origin/main'

if ! git merge-base --is-ancestor "$expected_commit" refs/remotes/origin/main; then
  echo "Refusing to publish: EXPECTED_COMMIT is not an ancestor of origin/main." >&2
  exit 1
fi

echo "Verified release commit $expected_commit on origin/main history."
