#!/usr/bin/env bash
# Interactive testing of the Lex extension via VSIX in an isolated VS Code instance.
#
# Builds a VSIX from the current working tree (no commit required), installs it
# into a segregated VS Code profile, and opens VS Code on a target directory.
#
# The isolated profile has its own settings, extensions, and keybindings — it
# will never interfere with your main VS Code installation.
#
# Usage:
#   ./scripts/try-lex-extension.sh                    # Build, install, open
#   ./scripts/try-lex-extension.sh --open-only        # Skip rebuild, just open
#   ./scripts/try-lex-extension.sh --dir ~/my/project # Open a different directory
#   ./scripts/try-lex-extension.sh --reset            # Wipe the test profile and start fresh
#
# Extra extensions are read from scripts/try-lex-extension-extensions.txt (one ID per line).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

PROFILE_DIR="$HOME/.lex-vscode-test"
EXTENSIONS_DIR="$PROFILE_DIR/extensions"
EXTENSIONS_LIST="$SCRIPT_DIR/try-lex-extension-extensions.txt"
# This assumes that this repo and the core ones are under the same dir in the file system
OPEN_DIR="$SCRIPT_DIR/../../core/comms/specs"
OPEN_ONLY=false
RESET=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --open-only)
      OPEN_ONLY=true
      shift
      ;;
    --dir)
      OPEN_DIR="$2"
      shift 2
      ;;
    --reset)
      RESET=true
      shift
      ;;
    -h|--help)
      head -17 "$0" | tail -15 | sed 's/^# \?//'
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      echo "Run $0 --help for usage." >&2
      exit 1
      ;;
  esac
done

if ! command -v code >/dev/null 2>&1; then
  echo "Error: VS Code CLI (code) not found on PATH." >&2
  exit 1
fi

# ── Reset ──────────────────────────────────────────────────────────────────────
if [[ "$RESET" == "true" ]]; then
  echo "Removing test profile at $PROFILE_DIR..."
  rm -rf "$PROFILE_DIR"
  echo "Done. Run again without --reset to rebuild."
  exit 0
fi

mkdir -p "$PROFILE_DIR" "$EXTENSIONS_DIR"

# ── Build & Install VSIX ──────────────────────────────────────────────────────
if [[ "$OPEN_ONLY" == "false" ]]; then
  cd "$EXT_DIR"

  # Ensure lex-lsp binary is present
  LEX_LSP_BIN="$EXT_DIR/resources/lex-lsp"
  if [[ ! -x "$LEX_LSP_BIN" ]]; then
    echo "lex-lsp binary not found, downloading..."
    bash "$SCRIPT_DIR/download-lex-lsp.sh"
  fi

  # Build VSIX (universal, for local testing)
  VSIX_FILE="$EXT_DIR/dist/lex-test.vsix"
  mkdir -p "$EXT_DIR/dist"

  echo "Compiling TypeScript..."
  npm run build

  echo "Bundling extension..."
  npm run bundle -- --minify

  echo "Packaging VSIX..."
  npx @vscode/vsce package -o "$VSIX_FILE" 2>&1

  echo "Installing VSIX into test profile..."
  code --extensions-dir "$EXTENSIONS_DIR" --install-extension "$VSIX_FILE" --force 2>&1

  # ── Install extra extensions ─────────────────────────────────────────────
  if [[ -f "$EXTENSIONS_LIST" ]]; then
    while IFS= read -r ext_id || [[ -n "$ext_id" ]]; do
      ext_id="${ext_id%%#*}"     # strip comments
      ext_id="${ext_id// /}"     # strip whitespace
      [[ -z "$ext_id" ]] && continue

      # Only install if not already present
      if ! code --extensions-dir "$EXTENSIONS_DIR" --list-extensions 2>/dev/null | grep -qi "^${ext_id}$"; then
        echo "Installing extra extension: $ext_id"
        code --extensions-dir "$EXTENSIONS_DIR" --install-extension "$ext_id" --force 2>&1
      fi
    done < "$EXTENSIONS_LIST"
  fi
fi

# ── Open VS Code ──────────────────────────────────────────────────────────────
echo ""
echo "Opening isolated VS Code on: $OPEN_DIR"
echo "  Profile dir:    $PROFILE_DIR"
echo "  Extensions dir: $EXTENSIONS_DIR"
echo ""

exec code \
  --user-data-dir "$PROFILE_DIR" \
  --extensions-dir "$EXTENSIONS_DIR" \
  "$OPEN_DIR"
