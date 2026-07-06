#!/usr/bin/env bash
# pre-vsce-package-hook.sh — convention hook for arthur-debert/release/vscode-ext.yml.
#
# Runs in the workflow's build job AFTER `npm ci` (root) and BEFORE
# `vsce package`. Single source of truth for everything that needs to
# happen between dependency install and VSIX packaging:
#
#   1. Build the shared/ submodule (sibling npm package consumed by the
#      extension's main code; the workflow's root npm ci does NOT recurse
#      into submodules, so it must be built explicitly here).
#   2. fetch-deps: download lexd-lsp binary + tree-sitter WASM/queries
#      + the per-language WASM + highlights from the embedded-grammars
#      manifest (manifest iteration shape, all driven from deps.json).
#
# Env contract (provided by vscode-ext.yml's pre-package step):
#   VSCE_TARGET  e.g. darwin-arm64 (empty = universal, never the case here)
#   PLATFORM     mac | linux | windows
#   ARCH         arm64 | x64 | armhf
#   RUST_TARGET  e.g. aarch64-apple-darwin (set per target in the matrix)
#   GH_TOKEN     PAT for `gh release download` against the upstream repos
#
# Versions pinned in deps.json (read by fetch-deps).

set -euo pipefail

# ---- 0. Dependency check ---------------------------------------------------

required_tools=(jq curl npm tar)
if [ "${PLATFORM:-}" = "windows" ]; then
	required_tools+=(unzip)
fi
for tool in "${required_tools[@]}"; do
	if ! command -v "$tool" >/dev/null 2>&1; then
		echo "::error::$tool is required but not installed"
		exit 1
	fi
done

# ---- 1. Build shared/ submodule --------------------------------------------

if [ ! -f shared/package.json ]; then
	echo "::error::shared/package.json not found — submodule not initialized?"
	exit 1
fi

echo "-> building shared/ submodule"
(
	cd shared
	npm ci
	npm run build
)

# ---- 2. Bootstrap fetch-deps (not on PATH in CI) ---------------------------

FETCH_DEPS=fetch-deps
if ! command -v fetch-deps &>/dev/null; then
	FETCH_DEPS="$(mktemp "${TMPDIR:-/tmp}/fetch-deps.XXXXXX")"
	trap 'rm -f "$FETCH_DEPS"' EXIT
	curl -fsSL -o "$FETCH_DEPS" \
		"https://raw.githubusercontent.com/arthur-debert/release/main/bin/fetch-deps"
	chmod +x "$FETCH_DEPS"
fi

# ---- 3. Download everything via fetch-deps ---------------------------------

# deps.json drives both the lexd-lsp/tree-sitter download AND the
# per-grammar iteration (from-manifest + for-each shape).
echo "-> fetching deps (target=${RUST_TARGET})"
"$FETCH_DEPS" --target "${RUST_TARGET}"

echo "-> pre-package resources ready:"
ls -la resources/ resources/queries/
