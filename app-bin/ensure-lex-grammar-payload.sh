#!/usr/bin/env bash
# ensure-lex-grammar-payload.sh — put the Lex tree-sitter payload in
# `resources/` if it is not already there.
#
# The Lex half of the parser payload — `tree-sitter-lex.wasm` and
# `queries/` — is NOT built here: it is downloaded from the
# `lex-fmt/tree-sitter-lex` release pinned in `deps.json`, by
# `fetch-deps`. (The five EMBEDDED-language parsers do not ride this
# path; they are staged from npm packages by `npm run stage-grammars`,
# which `npm run bundle` already runs.)
#
# The release build gets that download from
# `app-bin/pre-vsce-package-hook.sh`; the test lane's packaging check
# gets it from here — `test/vsix-payload/index.ts` runs this script
# before it packages, so `npm run test:vsix-payload` is a plain `node`
# invocation on every platform. Same fetch, minus the
# release-only work — no shared/ build, no lexd-lsp binary, no
# per-target `RUST_TARGET` — so a check lane does not pay for a
# platform binary it never opens.
#
# Idempotent: a checkout that already has the payload (a laptop, a
# warm CI cache) exits without touching the network. "Has it" means
# PRESENT AND NON-EMPTY, the same contract
# `test/vsix-payload/payload.ts` applies to the packaged `.vsix`: a
# zero-byte wasm copies and packages cleanly, then dies at
# `Language.load`. Treating one as present here would skip the fetch
# that repairs it and hand the packaging check a failure it cannot
# explain.

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

# The exact set `test/vsix-payload/payload.ts` requires of the Lex half,
# minus `resources/tree-sitter.wasm` (the web-tree-sitter runtime, which
# `npm run copy-wasm` takes from node_modules — never fetched).
required=(
	resources/tree-sitter-lex.wasm
	resources/queries/highlights.scm
	resources/queries/injections.scm
)

missing=0
for file in "${required[@]}"; do
	if [ ! -s "$file" ]; then
		missing=1
	fi
done

if [ "$missing" -eq 0 ]; then
	echo "-> lex tree-sitter payload already present in resources/"
	exit 0
fi

# `fetch-deps` is on PATH on a dev box but not on a hosted runner, where
# nothing outside pixi is provisioned. Same bootstrap the pre-package
# hook uses.
FETCH_DEPS=fetch-deps
if ! command -v fetch-deps >/dev/null 2>&1; then
	FETCH_DEPS="$(mktemp "${TMPDIR:-/tmp}/fetch-deps.XXXXXX")"
	trap 'rm -f "$FETCH_DEPS"' EXIT
	curl -fsSL -o "$FETCH_DEPS" \
		"https://raw.githubusercontent.com/arthur-debert/release/main/bin/fetch-deps"
	chmod +x "$FETCH_DEPS"
fi

echo "-> fetching the lex tree-sitter payload (deps.json: tree-sitter)"
"$FETCH_DEPS" tree-sitter

# Fail here, attributably, rather than let a silent no-op surface later
# as "the .vsix is missing its payload" — a fetch that did nothing is a
# network/pin problem, not a packaging one. Same present-and-non-empty
# test as the gate above: a truncated download is a fetch that did
# nothing, dressed up.
for file in "${required[@]}"; do
	if [ ! -s "$file" ]; then
		echo "error: fetch-deps left $file missing or empty — check deps.json's tree-sitter pin" >&2
		exit 1
	fi
done
