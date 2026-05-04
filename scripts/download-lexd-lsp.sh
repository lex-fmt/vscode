#!/usr/bin/env bash
set -euo pipefail

# Downloads lexd-lsp binary from GitHub releases
# Can be used standalone or sourced by other scripts

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RESOURCES_DIR="$EXT_DIR/resources"
DEPS_FILE="$EXT_DIR/shared/lex-deps.json"

# Read lexd-lsp version and repository from shared/lex-deps.json
if [[ -f "$DEPS_FILE" ]]; then
  LEX_LSP_VERSION="$(jq -r '.["lexd-lsp"]' "$DEPS_FILE")"
  LEX_LSP_REPO="$(jq -r '.["lexd-lsp-repo"]' "$DEPS_FILE")"
else
  echo "Error: $DEPS_FILE not found" >&2
  exit 1
fi

detect_platform() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"

  case "$os" in
    Linux)
      case "$arch" in
        x86_64) echo "x86_64-unknown-linux-gnu" ;;
        aarch64|arm64) echo "aarch64-unknown-linux-gnu" ;;
        *) echo "x86_64-unknown-linux-gnu" ;;
      esac
      ;;
    Darwin)
      case "$arch" in
        x86_64) echo "x86_64-apple-darwin" ;;
        arm64|aarch64) echo "aarch64-apple-darwin" ;;
        *) echo "x86_64-apple-darwin" ;;
      esac
      ;;
    MINGW*|MSYS*|CYGWIN*|Windows*)
      echo "x86_64-pc-windows-msvc"
      ;;
    *)
      echo "Unknown OS: $os" >&2
      exit 1
      ;;
  esac
}

download_lexd_lsp() {
  local target="${1:-$(detect_platform)}"

  mkdir -p "$RESOURCES_DIR"

  # Check if binary already exists
  if [[ -x "$RESOURCES_DIR/lexd-lsp" ]] || [[ -x "$RESOURCES_DIR/lexd-lsp.exe" ]]; then
    echo "lexd-lsp already exists in $RESOURCES_DIR"
    return 0
  fi

  echo "Downloading lexd-lsp $LEX_LSP_VERSION for $target..."

  local download_url="https://github.com/$LEX_LSP_REPO/releases/download/$LEX_LSP_VERSION"
  local archive_name binary_name

  if [[ "$target" == *windows* ]]; then
    archive_name="lexd-lsp-$target.zip"
    binary_name="lexd-lsp.exe"
  else
    archive_name="lexd-lsp-$target.tar.gz"
    binary_name="lexd-lsp"
  fi

  local archive_url="$download_url/$archive_name"
  local tmp_dir
  tmp_dir="$(mktemp -d)"
  local archive_path="$tmp_dir/$archive_name"

  # Download with optional GitHub token
  local curl_opts=(-fsSL -o "$archive_path")
  if [[ -n "${GITHUB_TOKEN:-}" ]]; then
    curl_opts+=(-H "Authorization: Bearer $GITHUB_TOKEN")
  fi

  if ! curl "${curl_opts[@]}" "$archive_url"; then
    echo "Failed to download $archive_url" >&2
    rm -rf "$tmp_dir"
    exit 1
  fi

  # Extract
  pushd "$tmp_dir" >/dev/null
  if [[ "$archive_name" == *.zip ]]; then
    unzip -q "$archive_name"
  else
    tar -xzf "$archive_name"
  fi
  popd >/dev/null

  # arthur-debert/release@v1 (lex v0.10.0+) nests the binary under
  # <name>-<target>/; earlier releases had it at the top level. Locate
  # by name to handle both layouts.
  local binary_src
  binary_src="$(find "$tmp_dir" -name "$binary_name" -type f | head -1)"
  if [[ -z "$binary_src" ]]; then
    echo "Binary $binary_name not found in archive" >&2
    rm -rf "$tmp_dir"
    exit 1
  fi

  # Copy binary to resources
  local dest_path="$RESOURCES_DIR/$binary_name"
  cp "$binary_src" "$dest_path"
  chmod +x "$dest_path"

  rm -rf "$tmp_dir"
  echo "lexd-lsp $LEX_LSP_VERSION installed to $dest_path"
}

# Function to check if binary exists (for use by other scripts)
ensure_lexd_lsp() {
  if [[ -x "$RESOURCES_DIR/lexd-lsp" ]] || [[ -x "$RESOURCES_DIR/lexd-lsp.exe" ]]; then
    return 0
  fi
  download_lexd_lsp "$@"
}

# Run if executed directly (not sourced)
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  download_lexd_lsp "$@"
fi
