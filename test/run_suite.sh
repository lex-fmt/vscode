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
EXT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LEX_BINARY="$EXT_DIR/resources/lex-lsp"

# Download binary if needed
if [[ ! -x "$LEX_BINARY" ]]; then
  echo "lex-lsp binary not found, downloading..."
  bash "$EXT_DIR/scripts/download-lex-lsp.sh"
fi

if ! command -v bats &> /dev/null; then
  echo "Error: bats is not installed."
  echo "Install bats-core (e.g. brew install bats-core)."
  exit 1
fi

exec bats "$TEST_FILE" --formatter "$FORMATTER"
