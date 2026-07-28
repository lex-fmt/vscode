#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXTENSION_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKSPACE_FILE="$EXTENSION_DIR/test/fixtures/sample-workspace.code-workspace"
USER_DATA_DIR="$EXTENSION_DIR/.vscode-test-user-data"

# Both cross-repo artifacts are ordinary conda packages pinned in pixi.toml
# (conda-direct): `pixi install` resolves and extracts them, and nothing here
# downloads. The GRAMMAR is copied into resources/ because the extension
# resolves it relative to its own dir; the LANGUAGE SERVER is used IN PLACE off
# the env prefix and named through LEX_LSP_PATH, the override src/config.ts
# checks first.
LEX_LSP_BIN="$EXTENSION_DIR/.pixi/envs/default/bin/lexd-lsp"
if [[ ! -x "$LEX_LSP_BIN" ]]; then
	echo "error: lexd-lsp is not materialized at $LEX_LSP_BIN" >&2
	echo "       run 'pixi install' so the pinned conda package is resolved" >&2
	exit 1
fi
export LEX_LSP_PATH="$LEX_LSP_BIN"

"$EXTENSION_DIR/bin/shipit" stage "$EXTENSION_DIR"

if ! command -v code >/dev/null 2>&1; then
	echo "VS Code CLI (code) not found on PATH. Install VS Code and ensure 'code' is available."
	exit 1
fi

mkdir -p "$USER_DATA_DIR"

echo "Opening VS Code with clean test configuration at: $USER_DATA_DIR"

exec code \
	--extensionDevelopmentPath="$EXTENSION_DIR" \
	--user-data-dir="$USER_DATA_DIR" \
	--extensions-dir="$USER_DATA_DIR/extensions" \
	"$WORKSPACE_FILE"
