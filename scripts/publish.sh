#!/usr/bin/env bash
set -euo pipefail

# publish.sh - create and push a release tag that triggers the production workflow.
# This script derives:
#   WORKER_VERSION from package.json (prefixed with v)
#   MAP_VERSION from data/mapping (latest CalVer)
# Then creates a tag: release/worker-${WORKER_VERSION}-map-${MAP_VERSION}
# and pushes it. CI release workflow listens on that pattern.

red() { printf "\033[31m%s\033[0m\n" "$*"; }
green() { printf "\033[32m%s\033[0m\n" "$*"; }
yellow() { printf "\033[33m%s\033[0m\n" "$*"; }

if [[ -n "${CI:-}" ]]; then
	NON_INTERACTIVE=1
else
	NON_INTERACTIVE=${NON_INTERACTIVE:-0}
fi

if ! command -v jq >/dev/null 2>&1; then
	red "jq is required (used to read package.json). Install jq and retry." >&2
	exit 2
fi

if [[ -n $(git status --porcelain) ]]; then
	red "Working tree not clean. Commit or stash changes first." >&2
	exit 2
fi

if ! git fetch --tags --quiet; then
	yellow "Warning: failed to fetch remote tags; proceeding with local view." >&2
fi

PKG_VERSION=$(jq -r .version package.json)
if [[ -z "$PKG_VERSION" || "$PKG_VERSION" == "null" ]]; then
	red "Unable to extract version from package.json" >&2
	exit 2
fi
WORKER_VERSION="v${PKG_VERSION}"

# Derive latest map version using existing TS helper through node/tsx; fallback pure bash if needed.
if command -v npx >/dev/null 2>&1; then
	set +e
	MAP_LINE=$(npm run --silent map:version 2>/dev/null || true)
	set -e
fi
if [[ -z "${MAP_LINE:-}" || ! "$MAP_LINE" =~ ^GULL_MAP_VERSION= ]]; then
	# Fallback: scan data/mapping for map-YYYY.MM.json files
	if [[ ! -d data/mapping ]]; then
		red "data/mapping directory not found." >&2
		exit 2
	fi
	MAP_FILE=$(ls data/mapping/map-*.json 2>/dev/null | sed -E 's#.*/map-([0-9]{4}\.[0-9]{2})\.json#\1#' | sort | tail -n1)
	if [[ -z "$MAP_FILE" ]]; then
		red "Could not determine mapping version." >&2
		exit 2
	fi
	MAP_VERSION="$MAP_FILE"
else
	MAP_VERSION="${MAP_LINE#GULL_MAP_VERSION=}"
fi

TAG="release/worker-${WORKER_VERSION}-map-${MAP_VERSION}"

if git rev-parse -q --verify "refs/tags/${TAG}" >/dev/null; then
	red "Tag ${TAG} already exists." >&2
	exit 3
fi

echo "Will create tag: ${TAG}";
echo "  Worker: ${WORKER_VERSION}";
echo "  Map   : ${MAP_VERSION}";

if [[ "$NON_INTERACTIVE" != 1 ]]; then
	read -r -p "Proceed? (y/N) " ans
	if [[ ! "$ans" =~ ^[Yy]$ ]]; then
		yellow "Aborted by user."; exit 0
	fi
fi

git tag -a "${TAG}" -m "Release worker ${WORKER_VERSION} map ${MAP_VERSION}" || {
	red "Failed to create tag."; exit 4; }
git push origin "${TAG}" || { red "Failed to push tag."; exit 5; }

green "Tag ${TAG} pushed. Production workflow should start shortly."
