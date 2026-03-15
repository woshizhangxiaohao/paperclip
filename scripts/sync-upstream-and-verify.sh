#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

UPSTREAM_REF="${1:-upstream/master}"
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"

if ! git remote get-url upstream >/dev/null 2>&1; then
  echo "Missing git remote 'upstream'. Add it first, then retry."
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is not clean. Commit/stash changes before syncing upstream."
  exit 1
fi

echo "Fetching from upstream..."
git fetch upstream

echo "Merging ${UPSTREAM_REF} into ${CURRENT_BRANCH} (ff-only)..."
git merge --ff-only "${UPSTREAM_REF}"

echo "Running custom integration verification..."
pnpm run verify:company-custom

echo "Sync and verification completed."
