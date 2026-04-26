#!/usr/bin/env bash
set -euo pipefail

# Downloads tree-sitter artifact (WASM + queries) from GitHub releases

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RESOURCES_DIR="$EXT_DIR/resources"
DEPS_FILE="$EXT_DIR/shared/lex-deps.json"

if [[ -f "$DEPS_FILE" ]]; then
  TS_VERSION="$(jq -r '.["tree-sitter"]' "$DEPS_FILE")"
  TS_REPO="$(jq -r '.["tree-sitter-repo"]' "$DEPS_FILE")"
else
  echo "Error: $DEPS_FILE not found" >&2
  exit 1
fi

VERSION_STAMP="$RESOURCES_DIR/.tree-sitter-version"

# True iff the cached artifacts on disk are for the currently-pinned version.
# We track a sidecar version stamp because the wasm + .scm files have no
# embedded version. Without this, bumping `tree-sitter` in lex-deps.json
# silently left the old wasm in place — the queries got refreshed via other
# paths and started referencing node names the stale wasm grammar didn't
# define, producing `Bad node name X` at extension activation.
artifacts_match_pinned_version() {
  [[ -f "$RESOURCES_DIR/tree-sitter-lex.wasm" ]] \
    && [[ -d "$RESOURCES_DIR/queries" ]] \
    && [[ -f "$RESOURCES_DIR/embedded-grammars.json" ]] \
    && [[ -f "$VERSION_STAMP" ]] \
    && [[ "$(cat "$VERSION_STAMP")" == "$TS_VERSION" ]]
}

download_tree_sitter() {
  if artifacts_match_pinned_version; then
    echo "tree-sitter $TS_VERSION already installed in $RESOURCES_DIR"
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

  # Replace cached artifacts atomically (relative to the stamp). Wipe the
  # query directory first so a removed query file from an older version
  # doesn't linger.
  mkdir -p "$RESOURCES_DIR/queries"
  rm -f "$RESOURCES_DIR/queries/"*.scm
  cp "$tmp_dir/extracted/tree-sitter-lex.wasm" "$RESOURCES_DIR/tree-sitter-lex.wasm"
  cp "$tmp_dir/extracted/queries/"*.scm "$RESOURCES_DIR/queries/"

  # Pull the cross-editor embedded-grammars manifest out of the tarball.
  # download-embedded-grammars.sh reads this file to decide which third-
  # party grammars to fetch — pinning tree-sitter-lex pins the manifest
  # in lockstep, so vscode and lexed share one curated list.
  if [[ -f "$tmp_dir/extracted/shared/embedded-grammars.json" ]]; then
    cp "$tmp_dir/extracted/shared/embedded-grammars.json" "$RESOURCES_DIR/embedded-grammars.json"
  else
    echo "Warning: tree-sitter $TS_VERSION did not ship shared/embedded-grammars.json" >&2
    rm -f "$RESOURCES_DIR/embedded-grammars.json"
  fi

  printf '%s' "$TS_VERSION" > "$VERSION_STAMP"

  rm -rf "$tmp_dir"
  echo "tree-sitter $TS_VERSION installed to $RESOURCES_DIR"
}

ensure_tree_sitter() {
  if artifacts_match_pinned_version; then
    return 0
  fi
  download_tree_sitter "$@"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  download_tree_sitter "$@"
fi
