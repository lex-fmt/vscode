#!/usr/bin/env bash
# Build VSIX packages for VS Code and Open VSX (VSCodium)
# Usage: ./scripts/build-vsix.sh [--target <platform>] [--openvsx]
#
# Platforms: darwin-x64, darwin-arm64, linux-x64, linux-arm64, win32-x64
# The --openvsx flag builds a universal (non-platform-specific) package for Open VSX

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

TARGET=""
OPENVSX=false
OUTPUT_DIR="$EXT_DIR/dist"

while [[ $# -gt 0 ]]; do
  case $1 in
    --target)
      TARGET="$2"
      shift 2
      ;;
    --openvsx)
      OPENVSX=true
      shift
      ;;
    --output)
      OUTPUT_DIR="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--target <platform>] [--openvsx] [--output <dir>]"
      exit 1
      ;;
  esac
done

cd "$EXT_DIR"

# Ensure output directory exists
mkdir -p "$OUTPUT_DIR"

# Get version from package.json
VERSION=$(node -p "require('./package.json').version")

echo "Building Lex extension v$VERSION"

# Build TypeScript and bundle
echo "Compiling TypeScript..."
npm run build

echo "Bundling extension..."
npm run bundle -- --minify

if [[ "$OPENVSX" == "true" ]]; then
  # Open VSX: Build universal package (no platform target)
  # This works on all platforms since the LSP binary path is configurable
  OUTPUT_FILE="$OUTPUT_DIR/lex-$VERSION-openvsx.vsix"
  echo "Packaging universal VSIX for Open VSX..."
  npx @vscode/vsce package -o "$OUTPUT_FILE"
  echo "Created: $OUTPUT_FILE"
elif [[ -n "$TARGET" ]]; then
  # Platform-specific build for VS Code Marketplace
  OUTPUT_FILE="$OUTPUT_DIR/lex-$TARGET.vsix"
  echo "Packaging platform-specific VSIX for $TARGET..."
  npx @vscode/vsce package --target "$TARGET" -o "$OUTPUT_FILE"
  echo "Created: $OUTPUT_FILE"
else
  echo "Error: Must specify either --target <platform> or --openvsx"
  echo ""
  echo "Platforms: darwin-x64, darwin-arm64, linux-x64, linux-arm64, win32-x64"
  echo ""
  echo "Examples:"
  echo "  $0 --target darwin-arm64    # Build for macOS ARM"
  echo "  $0 --openvsx                # Build universal for Open VSX"
  exit 1
fi

echo "Done!"
