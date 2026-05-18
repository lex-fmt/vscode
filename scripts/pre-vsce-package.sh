#!/usr/bin/env bash
# pre-vsce-package.sh — convention hook for arthur-debert/release/vscode-ext.yml.
#
# Runs in the workflow's build job AFTER `npm ci` (root) and BEFORE
# `vsce package`. Single source of truth for everything that needs to
# happen between dependency install and VSIX packaging:
#
#   1. Build the shared/ submodule (sibling npm package consumed by the
#      extension's main code; the workflow's root npm ci does NOT recurse
#      into submodules, so it must be built explicitly here).
#   2. Download lex-fmt/lex's lexd-lsp binary for the current VSCE_TARGET.
#   3. Download lex-fmt/tree-sitter-lex's WASM + queries (target-agnostic).
#
# Env contract (provided by vscode-ext.yml's pre-package step):
#   VSCE_TARGET  e.g. darwin-arm64 (empty = universal, never the case here)
#   PLATFORM     mac | linux | windows
#   ARCH         arm64 | x64 | armhf
#   RUST_TARGET  e.g. aarch64-apple-darwin (set per target in the matrix)
#   GH_TOKEN     PAT for `gh release download` against the upstream repos
#
# Versions pinned in shared/lex-deps.json (read here via jq).
#
# This is a port of the inline curl/jq logic from the pre-migration
# release.yml. Migration to bin/fetch-artifact (artifacts.json schema)
# is a follow-up — blocked on lex-fmt/lex and lex-fmt/tree-sitter-lex
# adopting artifacts.json.

set -euo pipefail

# ---- 1. Build shared/ submodule ------------------------------------------

if [ ! -f shared/package.json ]; then
  echo "::error::shared/package.json not found — submodule not initialized?"
  exit 1
fi

echo "→ building shared/ submodule"
(
  cd shared
  npm ci
  npm run build
)

# ---- 2. Resolve pinned upstream versions ---------------------------------

if [ ! -f shared/lex-deps.json ]; then
  echo "::error::shared/lex-deps.json missing — needed for pinned upstream versions"
  exit 1
fi

LEX_LSP_VERSION=$(jq -r '."lexd-lsp"' shared/lex-deps.json)
LEX_LSP_REPO=$(jq -r '."lexd-lsp-repo"' shared/lex-deps.json)
TS_VERSION=$(jq -r '."tree-sitter"' shared/lex-deps.json)
TS_REPO=$(jq -r '."tree-sitter-repo"' shared/lex-deps.json)

echo "→ lexd-lsp:    ${LEX_LSP_VERSION} from ${LEX_LSP_REPO} (target=${VSCE_TARGET}, rust=${RUST_TARGET})"
echo "→ tree-sitter: ${TS_VERSION} from ${TS_REPO}"

mkdir -p resources resources/queries

# ---- 3. Download lexd-lsp for the current VSCE_TARGET --------------------

case "${PLATFORM}" in
  windows)
    LSP_ARCHIVE="lexd-lsp-${RUST_TARGET}.zip"
    LSP_BINARY="lexd-lsp.exe"
    ;;
  *)
    LSP_ARCHIVE="lexd-lsp-${RUST_TARGET}.tar.gz"
    LSP_BINARY="lexd-lsp"
    ;;
esac

LSP_URL="https://github.com/${LEX_LSP_REPO}/releases/download/${LEX_LSP_VERSION}/${LSP_ARCHIVE}"
LSP_TMP="$(mktemp -d)"
echo "→ downloading ${LSP_URL}"
curl -fsSL -o "${LSP_TMP}/${LSP_ARCHIVE}" "${LSP_URL}"

if [ "${PLATFORM}" = "windows" ]; then
  (cd "${LSP_TMP}" && unzip -q "${LSP_ARCHIVE}")
else
  tar -xzf "${LSP_TMP}/${LSP_ARCHIVE}" -C "${LSP_TMP}"
fi

# arthur-debert/release@v1 (lex-fmt/lex v0.10.0+) nests the binary under
# <name>-<target>/. Find by basename to be tolerant of both shapes.
LSP_SRC="$(find "${LSP_TMP}" -name "${LSP_BINARY}" -type f | head -1)"
if [ -z "${LSP_SRC}" ]; then
  echo "::error::${LSP_BINARY} not found in ${LSP_ARCHIVE}"
  exit 1
fi
cp "${LSP_SRC}" "resources/${LSP_BINARY}"
chmod +x "resources/${LSP_BINARY}" 2>/dev/null || true
rm -rf "${LSP_TMP}"

# ---- 4. Download tree-sitter-lex (target-agnostic) -----------------------

TS_URL="https://github.com/${TS_REPO}/releases/download/${TS_VERSION}/tree-sitter.tar.gz"
TS_TMP="$(mktemp -d)"
echo "→ downloading ${TS_URL}"
curl -fsSL -o "${TS_TMP}/tree-sitter.tar.gz" "${TS_URL}"
mkdir -p "${TS_TMP}/extracted"
tar -xzf "${TS_TMP}/tree-sitter.tar.gz" -C "${TS_TMP}/extracted"

cp "${TS_TMP}/extracted/tree-sitter-lex.wasm" resources/tree-sitter-lex.wasm
cp "${TS_TMP}/extracted/queries/"*.scm resources/queries/
rm -rf "${TS_TMP}"

echo "→ pre-package resources ready:"
ls -la resources/ resources/queries/
