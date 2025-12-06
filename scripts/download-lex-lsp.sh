#!/usr/bin/env bash
set -euo pipefail

# Downloads lex-lsp binary from GitHub releases
# Can be used standalone or sourced by other scripts

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RESOURCES_DIR="$EXT_DIR/resources"

# lex-lsp version and repository
LEX_LSP_VERSION="${LEX_LSP_VERSION:-v0.2.2}"
LEX_LSP_REPO="lex-fmt/editors"

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

download_lex_lsp() {
  local target="${1:-$(detect_platform)}"

  mkdir -p "$RESOURCES_DIR"

  # Check if binary already exists
  if [[ -x "$RESOURCES_DIR/lex-lsp" ]] || [[ -x "$RESOURCES_DIR/lex-lsp.exe" ]]; then
    echo "lex-lsp already exists in $RESOURCES_DIR"
    return 0
  fi

  echo "Downloading lex-lsp $LEX_LSP_VERSION for $target..."

  local download_url="https://github.com/$LEX_LSP_REPO/releases/download/$LEX_LSP_VERSION"
  local archive_name binary_name

  if [[ "$target" == *windows* ]]; then
    archive_name="lex-lsp-$target.zip"
    binary_name="lex-lsp.exe"
  else
    archive_name="lex-lsp-$target.tar.gz"
    binary_name="lex-lsp"
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

  local binary_src="$tmp_dir/$binary_name"
  if [[ ! -f "$binary_src" ]]; then
    echo "Binary not found in archive" >&2
    rm -rf "$tmp_dir"
    exit 1
  fi

  # Copy binary to resources
  local dest_path="$RESOURCES_DIR/$binary_name"
  cp "$binary_src" "$dest_path"
  chmod +x "$dest_path"

  rm -rf "$tmp_dir"
  echo "lex-lsp $LEX_LSP_VERSION installed to $dest_path"
}

# Function to check if binary exists (for use by other scripts)
ensure_lex_lsp() {
  if [[ -x "$RESOURCES_DIR/lex-lsp" ]] || [[ -x "$RESOURCES_DIR/lex-lsp.exe" ]]; then
    return 0
  fi
  download_lex_lsp "$@"
}

# Run if executed directly (not sourced)
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  download_lex_lsp "$@"
fi
