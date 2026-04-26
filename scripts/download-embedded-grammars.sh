#!/usr/bin/env bash
set -euo pipefail

# Downloads tree-sitter parser WASMs and highlight queries for languages
# we want to render inside Lex `:: lang ::` verbatim blocks.
#
# Each entry below is a single language. We pin both the parser version
# (which determines the WASM ABI) and the queries' commit/tag so a
# language update is an explicit decision, not a silent drift.
#
# Layout per language:
#   resources/embedded-grammars/<lang>/parser.wasm
#   resources/embedded-grammars/<lang>/highlights.scm
#   resources/embedded-grammars/<lang>/.version  (sidecar; "vX.Y.Z")
#
# A `.version` mismatch triggers a re-download on the next run, mirroring
# the pattern in download-tree-sitter.sh.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
GRAMMARS_DIR="$EXT_DIR/resources/embedded-grammars"

# language|version|wasm-asset|queries-path
GRAMMARS=(
  "python|v0.23.6|tree-sitter-python.wasm|queries/highlights.scm"
)

REPO_BASE_URL="https://github.com/tree-sitter"
RAW_BASE_URL="https://raw.githubusercontent.com/tree-sitter"

curl_opts=(-fsSL)
if [[ -n "${GITHUB_TOKEN:-}" ]]; then
  curl_opts+=(-H "Authorization: Bearer $GITHUB_TOKEN")
fi

for entry in "${GRAMMARS[@]}"; do
  IFS='|' read -r lang version wasm_asset queries_path <<< "$entry"

  lang_dir="$GRAMMARS_DIR/$lang"
  version_stamp="$lang_dir/.version"
  wasm_path="$lang_dir/parser.wasm"
  highlights_path="$lang_dir/highlights.scm"

  if [[ -f "$wasm_path" ]] \
     && [[ -f "$highlights_path" ]] \
     && [[ -f "$version_stamp" ]] \
     && [[ "$(cat "$version_stamp")" == "$version" ]]; then
    echo "embedded grammar $lang $version already installed"
    continue
  fi

  echo "Downloading embedded grammar $lang $version..."
  mkdir -p "$lang_dir"

  wasm_url="$REPO_BASE_URL/tree-sitter-$lang/releases/download/$version/$wasm_asset"
  if ! curl "${curl_opts[@]}" -o "$wasm_path" "$wasm_url"; then
    echo "Failed to download $wasm_url" >&2
    exit 1
  fi

  highlights_url="$RAW_BASE_URL/tree-sitter-$lang/$version/$queries_path"
  if ! curl "${curl_opts[@]}" -o "$highlights_path" "$highlights_url"; then
    echo "Failed to download $highlights_url" >&2
    exit 1
  fi

  printf '%s' "$version" > "$version_stamp"
  echo "embedded grammar $lang $version installed at $lang_dir"
done
