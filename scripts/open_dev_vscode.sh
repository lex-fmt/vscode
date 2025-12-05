#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
EXTENSION_DIR="$REPO_ROOT/editors/vscode"
WORKSPACE_FILE="$EXTENSION_DIR/test/fixtures/sample-workspace.code-workspace"
LEX_LSP_BIN="$REPO_ROOT/target/debug/lex-lsp"
USER_DATA_DIR="$EXTENSION_DIR/.vscode-test-user-data"

if [[ ! -x "$LEX_LSP_BIN" ]]; then
  echo "lex-lsp binary not found at $LEX_LSP_BIN"
  echo "Run 'cargo build --bin lex-lsp' from the repo root before launching VS Code."
  exit 1
fi

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
