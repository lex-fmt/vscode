#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
EXT_DIR="$REPO_ROOT/editors/vscode"
RESOURCES_DIR="$EXT_DIR/resources"

usage() {
  cat <<USAGE
Usage: $(basename "$0") [--target <vsce-target>]

Builds a VSIX package for the VS Code extension.

Options:
  --target <vsce-target>  Platform-specific target (e.g., darwin-arm64, linux-x64, win32-x64)
                          If not specified, builds a universal VSIX.

Examples:
  $(basename "$0")                       # Build universal VSIX
  $(basename "$0") --target darwin-arm64 # Build for Apple Silicon macOS
USAGE
}

TARGET=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGET="$2"
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

echo "Building VS Code extension..."

if ! command -v cargo >/dev/null 2>&1; then
  echo "cargo is required to build lex-lsp" >&2
  exit 1
fi

echo "Building lex-lsp (release)..."
pushd "$REPO_ROOT" >/dev/null
cargo build --bin lex-lsp --release
popd >/dev/null

mkdir -p "$RESOURCES_DIR"
BINARY_SRC="$REPO_ROOT/target/release/lex-lsp"
if [[ ! -f "$BINARY_SRC" && -f "$BINARY_SRC.exe" ]]; then
  BINARY_SRC="$BINARY_SRC.exe"
fi

if [[ ! -f "$BINARY_SRC" ]]; then
  echo "lex-lsp binary not found at $BINARY_SRC" >&2
  exit 1
fi

DEST_PATH="$RESOURCES_DIR/lex-lsp"
if [[ "$BINARY_SRC" == *.exe ]]; then
  DEST_PATH="$DEST_PATH.exe"
fi

cp "$BINARY_SRC" "$DEST_PATH"
chmod +x "$DEST_PATH"

echo "lex-lsp copied to $DEST_PATH"

pushd "$EXT_DIR" >/dev/null

# Install dependencies
npm ci

# Build TypeScript
npm run build

# Bundle extension
npm run bundle

# Package VSIX
if [[ -n "$TARGET" ]]; then
  echo "Packaging for target: $TARGET"
  npx vsce package --no-dependencies --target "$TARGET"
else
  echo "Packaging universal VSIX"
  npx vsce package --no-dependencies
fi

popd >/dev/null

VSIX_FILE=$(find "$EXT_DIR" -name "*.vsix" -type f -print -quit)

if [[ -n "$VSIX_FILE" ]]; then
  echo "✓ VSIX package created: $VSIX_FILE"
else
  echo "✗ Failed to create VSIX package" >&2
  exit 1
fi
