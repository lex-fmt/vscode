#!/usr/bin/env bats

setup() {
  export EXTENSION_DIR="$(cd "${BATS_TEST_DIRNAME}/.." && pwd)"
  export VSIX_EXTRACT_DIR="$BATS_TEST_TMPDIR/vsix-extract"
}

teardown() {
  # Clean up extracted VSIX
  if [[ -d "$VSIX_EXTRACT_DIR" ]]; then
    rm -rf "$VSIX_EXTRACT_DIR"
  fi
  # Clean up any VSIX files created during tests
  rm -f "$EXTENSION_DIR"/*.vsix 2>/dev/null || true
}

@test "VS Code extension npm test" {
  cd "$EXTENSION_DIR"
  run npm test
  if [ "$status" -ne 0 ]; then
    echo "$output" >&2
  fi
  [ "$status" -eq 0 ]
  [[ "$output" =~ "VSCode Integration" ]]
}

# Ensures we can package, install, and activate the extension through a VSIX
@test "VSIX install smoke test" {
  cd "$EXTENSION_DIR"
  run npm run test:vsix
  if [ "$status" -ne 0 ]; then
    echo "$output" >&2
  fi
  [ "$status" -eq 0 ]
  [[ "$output" =~ "VSIX smoke tests" ]]
}

@test "VSIX packaging produces valid extension" {
  cd "$EXTENSION_DIR"

  # Build the bundle
  run npm run bundle
  [ "$status" -eq 0 ]

  # Package the VSIX
  run npx vsce package --no-dependencies
  [ "$status" -eq 0 ]

  # Find the VSIX file
  VSIX_FILE=$(ls -t "$EXTENSION_DIR"/*.vsix 2>/dev/null | head -1)
  [ -n "$VSIX_FILE" ]
  [ -f "$VSIX_FILE" ]

  # Extract the VSIX (it's a zip file)
  mkdir -p "$VSIX_EXTRACT_DIR"
  run unzip -q "$VSIX_FILE" -d "$VSIX_EXTRACT_DIR"
  [ "$status" -eq 0 ]

  # Verify package.json exists in extracted extension
  [ -f "$VSIX_EXTRACT_DIR/extension/package.json" ]

  # Get the main entry point from package.json
  MAIN_ENTRY=$(node -e "console.log(require('$VSIX_EXTRACT_DIR/extension/package.json').main)")
  [ -n "$MAIN_ENTRY" ]

  # Verify the main entry point file exists
  MAIN_FILE="$VSIX_EXTRACT_DIR/extension/$MAIN_ENTRY"
  [ -f "$MAIN_FILE" ]

  # Verify main.js is not empty (catches the "empty extension" bug)
  MAIN_SIZE=$(wc -c < "$MAIN_FILE" | tr -d ' ')
  [ "$MAIN_SIZE" -gt 1000 ]  # Bundled extension should be > 1KB

  # Verify it contains expected extension code
  run grep -q "applyLexTheme\|LanguageClient\|activate" "$MAIN_FILE"
  [ "$status" -eq 0 ]

  echo "VSIX validation passed: main entry ($MAIN_ENTRY) is $MAIN_SIZE bytes"
}
