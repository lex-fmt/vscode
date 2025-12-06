#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXTENSION_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKSPACE_FILE="$EXTENSION_DIR/test/fixtures/sample-workspace.code-workspace"
LEX_LSP_BIN="$EXTENSION_DIR/resources/lex-lsp"
USER_DATA_DIR="$EXTENSION_DIR/.vscode-test-user-data"

# Download binary if needed
if [[ ! -x "$LEX_LSP_BIN" ]]; then
  echo "lex-lsp binary not found, downloading..."
  bash "$SCRIPT_DIR/download-lex-lsp.sh"
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
