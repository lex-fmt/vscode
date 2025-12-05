#!/usr/bin/env bash

set -euo pipefail

FORMATTER="junit"

while [[ "$#" -gt 0 ]]; do
  case $1 in
    --format=simple) FORMATTER="pretty" ;;
    --format=junit) FORMATTER="junit" ;;
    *) echo "Unknown parameter: $1"; exit 1 ;;
  esac
  shift
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_FILE="$SCRIPT_DIR/lex_vscode_extension.bats"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
LEX_BINARY="$REPO_ROOT/target/debug/lex-lsp"

if [[ ! -x "$LEX_BINARY" ]]; then
  echo "Error: lex-lsp binary not found at $LEX_BINARY"
  echo "Run 'cargo build --bin lex-lsp' from the repository root before running the VS Code tests."
  exit 1
fi

if ! command -v bats &> /dev/null; then
  echo "Error: bats is not installed."
  echo "Install bats-core (e.g. brew install bats-core)."
  exit 1
fi

exec bats "$TEST_FILE" --formatter "$FORMATTER"
