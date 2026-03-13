#!/usr/bin/env bash
set -euo pipefail

# Downloads tree-sitter artifact (WASM + queries) from GitHub releases

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RESOURCES_DIR="$EXT_DIR/resources"
DEPS_FILE="$EXT_DIR/shared/lex-deps.json"

if [[ -f "$DEPS_FILE" ]]; then
  TS_VERSION="$(jq -r '.["tree-sitter"]' "$DEPS_FILE")"
  TS_REPO="$(jq -r '.["lex-lsp-repo"]' "$DEPS_FILE")"
else
  echo "Error: $DEPS_FILE not found" >&2
  exit 1
fi

download_tree_sitter() {
  # Check if already downloaded
  if [[ -f "$RESOURCES_DIR/tree-sitter-lex.wasm" ]] && [[ -d "$RESOURCES_DIR/queries" ]]; then
    echo "tree-sitter artifacts already exist in $RESOURCES_DIR"
    return 0
  fi

  echo "Downloading tree-sitter $TS_VERSION..."

  local download_url="https://github.com/$TS_REPO/releases/download/$TS_VERSION/tree-sitter.tar.gz"
  local tmp_dir
  tmp_dir="$(mktemp -d)"
  local archive_path="$tmp_dir/tree-sitter.tar.gz"

  local curl_opts=(-fsSL -o "$archive_path")
  if [[ -n "${GITHUB_TOKEN:-}" ]]; then
    curl_opts+=(-H "Authorization: Bearer $GITHUB_TOKEN")
  fi

  if ! curl "${curl_opts[@]}" "$download_url"; then
    echo "Failed to download $download_url" >&2
    rm -rf "$tmp_dir"
    exit 1
  fi

  # Extract
  mkdir -p "$tmp_dir/extracted"
  tar -xzf "$archive_path" -C "$tmp_dir/extracted"

  # Copy WASM and queries to resources
  mkdir -p "$RESOURCES_DIR/queries"
  cp "$tmp_dir/extracted/tree-sitter-lex.wasm" "$RESOURCES_DIR/tree-sitter-lex.wasm"
  cp "$tmp_dir/extracted/queries/"*.scm "$RESOURCES_DIR/queries/"

  rm -rf "$tmp_dir"
  echo "tree-sitter $TS_VERSION installed to $RESOURCES_DIR"
}

ensure_tree_sitter() {
  if [[ -f "$RESOURCES_DIR/tree-sitter-lex.wasm" ]] && [[ -d "$RESOURCES_DIR/queries" ]]; then
    return 0
  fi
  download_tree_sitter "$@"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  download_tree_sitter "$@"
fi
