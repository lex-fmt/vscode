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
#   ./app-bin/try-lex-extension.sh                    # Build, install, open
#   ./app-bin/try-lex-extension.sh --open-only        # Skip rebuild, just open
#   ./app-bin/try-lex-extension.sh --dir ~/my/project # Open a different directory
#   ./app-bin/try-lex-extension.sh --reset            # Wipe the test profile and start fresh
#   ./app-bin/try-lex-extension.sh --lsp-path ../core # Build lexd-lsp from Cargo workspace
#   ./app-bin/try-lex-extension.sh --lsp-path /path/to/target/release  # Use pre-built binary
#   ./app-bin/try-lex-extension.sh --ts-path ../tree-sitter-lex       # Build WASM from local grammar
#   ./app-bin/try-lex-extension.sh --ts-path /path/to/tree-sitter-lex # Same, absolute path
#
# Extra extensions are read from app-bin/try-lex-extension-extensions.txt (one ID per line).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

PROFILE_DIR="$HOME/.lex-vscode-test"
EXTENSIONS_DIR="$PROFILE_DIR/extensions"
EXTENSIONS_LIST="$SCRIPT_DIR/try-lex-extension-extensions.txt"
# This assumes that this repo and the core ones are under the same dir in the file system
OPEN_DIR="$SCRIPT_DIR/../comms/specs"
OPEN_ONLY=false
RESET=false
LSP_PATH=""
TS_PATH=""

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
    --lsp-path)
      LSP_PATH="$2"
      shift 2
      ;;
    --ts-path)
      TS_PATH="$2"
      shift 2
      ;;
    --reset)
      RESET=true
      shift
      ;;
    -h|--help)
      head -21 "$0" | tail -19 | sed 's/^# \?//'
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
  # Clean previous Lex extension to avoid VS Code's "restart required" error.
  # Must remove both the directory AND the extensions.json entry.
  rm -rf "$EXTENSIONS_DIR"/lex.lex-vscode-*
  if [[ -f "$EXTENSIONS_DIR/extensions.json" ]]; then
    node -e "
      const fs = require('fs');
      const p = '$EXTENSIONS_DIR/extensions.json';
      const exts = JSON.parse(fs.readFileSync(p, 'utf8'));
      const filtered = exts.filter(e => e.identifier?.id !== 'lex.lex-vscode');
      fs.writeFileSync(p, JSON.stringify(filtered));
    "
  fi

  cd "$EXT_DIR"

  # ── Resolve lexd-lsp binary ──────────────────────────────────────────────
  LEX_LSP_BIN="$EXT_DIR/resources/lexd-lsp"
  LSP_SOURCE=""

  if [[ -n "$LSP_PATH" ]]; then
    LSP_PATH="$(cd "$LSP_PATH" 2>/dev/null && pwd || echo "$LSP_PATH")"

    if [[ -x "$LSP_PATH/lexd-lsp" ]]; then
      # Case 1: directory containing a lexd-lsp binary (e.g. target/release/)
      echo "Using lexd-lsp binary from: $LSP_PATH/lexd-lsp"
      cp "$LSP_PATH/lexd-lsp" "$LEX_LSP_BIN"
      chmod +x "$LEX_LSP_BIN"
      LSP_SOURCE="$LSP_PATH/lexd-lsp"

    elif [[ -f "$LSP_PATH/Cargo.toml" ]] && grep -q 'lexd-lsp' "$LSP_PATH/Cargo.toml"; then
      # Case 2: Cargo workspace root — build lexd-lsp from source
      echo "Building lexd-lsp from Cargo workspace: $LSP_PATH"
      cargo build --release -p lexd-lsp --manifest-path "$LSP_PATH/Cargo.toml"
      BUILT="$LSP_PATH/target/release/lexd-lsp"
      if [[ ! -x "$BUILT" ]]; then
        echo "Error: cargo build succeeded but binary not found at $BUILT" >&2
        exit 1
      fi
      cp "$BUILT" "$LEX_LSP_BIN"
      chmod +x "$LEX_LSP_BIN"
      LSP_SOURCE="$BUILT (built from source)"

    else
      echo "Error: --lsp-path '$LSP_PATH' is neither a directory with a lexd-lsp binary" >&2
      echo "       nor a Cargo workspace containing lexd-lsp." >&2
      exit 1
    fi
  elif [[ ! -x "$LEX_LSP_BIN" ]]; then
    echo "lexd-lsp binary not found, downloading..."
    bash "$SCRIPT_DIR/download-lexd-lsp.sh"
  fi

  # ── Resolve tree-sitter grammar ───────────────────────────────────────
  TS_SOURCE=""

  if [[ -n "$TS_PATH" ]]; then
    TS_PATH="$(cd "$TS_PATH" 2>/dev/null && pwd || echo "$TS_PATH")"

    if [[ -f "$TS_PATH/grammar.js" ]]; then
      echo "Building tree-sitter WASM from: $TS_PATH"
      (cd "$TS_PATH" && npx tree-sitter generate >/dev/null 2>&1 && npx tree-sitter build --wasm 2>&1)
      WASM="$TS_PATH/tree-sitter-lex.wasm"
      if [[ ! -f "$WASM" ]]; then
        echo "Error: WASM build succeeded but file not found at $WASM" >&2
        exit 1
      fi
      cp "$WASM" "$EXT_DIR/resources/tree-sitter-lex.wasm"
      if [[ -d "$TS_PATH/queries" ]]; then
        cp "$TS_PATH/queries/"*.scm "$EXT_DIR/resources/queries/"
      fi
      TS_SOURCE="$TS_PATH (built from source)"
    elif [[ -f "$TS_PATH/tree-sitter-lex.wasm" ]]; then
      echo "Using pre-built WASM from: $TS_PATH"
      cp "$TS_PATH/tree-sitter-lex.wasm" "$EXT_DIR/resources/tree-sitter-lex.wasm"
      if [[ -d "$TS_PATH/queries" ]]; then
        cp "$TS_PATH/queries/"*.scm "$EXT_DIR/resources/queries/"
      fi
      TS_SOURCE="$TS_PATH/tree-sitter-lex.wasm"
    else
      echo "Error: --ts-path '$TS_PATH' has neither grammar.js nor tree-sitter-lex.wasm" >&2
      exit 1
    fi
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
if [[ -n "$LSP_SOURCE" ]]; then
  echo "  LSP binary:     $LSP_SOURCE"
fi
if [[ -n "$TS_SOURCE" ]]; then
  echo "  Tree-sitter:    $TS_SOURCE"
fi
echo ""

if [[ -n "$LSP_SOURCE" ]]; then
  export LEX_LSP_SOURCE="$LSP_SOURCE"
fi
exec code \
  --user-data-dir "$PROFILE_DIR" \
  --extensions-dir "$EXTENSIONS_DIR" \
  "$OPEN_DIR"
