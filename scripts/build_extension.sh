#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
EXT_DIR="$REPO_ROOT/editors/vscode"
RESOURCES_DIR="$EXT_DIR/resources"

TARGET_TRIPLE=""

BUILD_PROFILE="release"

usage() {
  cat <<USAGE
Usage: $(basename "$0") [--target <triple>]

Builds lex-lsp in release mode (optionally for the provided Rust target
triple), copies it into the VS Code extension resources directory, and bundles
the TypeScript sources.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGET_TRIPLE="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if ! command -v cargo >/dev/null 2>&1; then
  echo "cargo is required to build lex-lsp" >&2
  exit 1
fi

pushd "$REPO_ROOT" >/dev/null
if [[ -n "$TARGET_TRIPLE" ]]; then
  cargo build --bin lex-lsp --release --target "$TARGET_TRIPLE"
else
  cargo build --bin lex-lsp --release
fi
popd >/dev/null

TARGET_DIR="$REPO_ROOT/target"
if [[ -n "$TARGET_TRIPLE" ]]; then
  TARGET_DIR="$TARGET_DIR/$TARGET_TRIPLE/$BUILD_PROFILE"
else
  TARGET_DIR="$TARGET_DIR/$BUILD_PROFILE"
fi

BINARY_SRC="$TARGET_DIR/lex-lsp"
if [[ ! -f "$BINARY_SRC" && -f "$BINARY_SRC.exe" ]]; then
  BINARY_SRC="$BINARY_SRC.exe"
fi

if [[ ! -f "$BINARY_SRC" ]]; then
  echo "lex-lsp binary not found at $BINARY_SRC" >&2
  exit 1
fi

mkdir -p "$RESOURCES_DIR"
DEST_PATH="$RESOURCES_DIR/lex-lsp"
if [[ "$BINARY_SRC" == *.exe ]]; then
  DEST_PATH="$DEST_PATH.exe"
fi

cp "$BINARY_SRC" "$DEST_PATH"
chmod +x "$DEST_PATH"

echo "lex-lsp copied to $DEST_PATH"

pushd "$EXT_DIR" >/dev/null
npm ci
npm run build
npm run bundle
popd >/dev/null

echo "Extension bundle written to $EXT_DIR/out/src/main.cjs"
