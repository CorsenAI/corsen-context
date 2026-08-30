#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
work_dir="$(mktemp -d "${TMPDIR:-/tmp}/corsen-release-ancestry.XXXXXX")"
cleanup() {
  case "$work_dir" in
    "${TMPDIR:-/tmp}"/corsen-release-ancestry.*) rm -rf -- "$work_dir" ;;
    *) echo "Refusing to remove unexpected temporary path: $work_dir" >&2 ;;
  esac
}
trap cleanup EXIT

remote_dir="$work_dir/remote.git"
repo_dir="$work_dir/repo"
git init --quiet --bare "$remote_dir"
git init --quiet "$repo_dir"
git -C "$repo_dir" config user.name "Release Test"
git -C "$repo_dir" config user.email "release-test@example.invalid"
git -C "$repo_dir" config core.autocrlf false
git -C "$repo_dir" checkout --quiet -b main
git -C "$repo_dir" remote add origin "$remote_dir"

printf 'first\n' > "$repo_dir/history.txt"
git -C "$repo_dir" add history.txt
git -C "$repo_dir" commit --quiet -m first
ancestor_commit="$(git -C "$repo_dir" rev-parse HEAD)"
git -C "$repo_dir" push --quiet -u origin main

printf 'second\n' >> "$repo_dir/history.txt"
git -C "$repo_dir" commit --quiet -am second
git -C "$repo_dir" push --quiet origin main

git -C "$repo_dir" checkout --quiet -b unrelated "$ancestor_commit"
printf 'side\n' > "$repo_dir/side.txt"
git -C "$repo_dir" add side.txt
git -C "$repo_dir" commit --quiet -m side
unrelated_commit="$(git -C "$repo_dir" rev-parse HEAD)"

git -C "$repo_dir" checkout --quiet --detach "$ancestor_commit"
(
  cd "$repo_dir"
  EXPECTED_COMMIT="$ancestor_commit" bash "$script_dir/verify-release-ancestry.sh"
)

git -C "$repo_dir" checkout --quiet --detach "$unrelated_commit"
if (
  cd "$repo_dir"
  EXPECTED_COMMIT="$unrelated_commit" bash "$script_dir/verify-release-ancestry.sh"
) > "$work_dir/non-ancestor.log" 2>&1; then
  echo "Expected a non-ancestor commit to be rejected." >&2
  exit 1
fi
grep -Fq 'is not an ancestor of origin/main' "$work_dir/non-ancestor.log"

echo "Verified ancestor acceptance and non-ancestor rejection."
