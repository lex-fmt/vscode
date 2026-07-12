#!/usr/bin/env bash
# Shared-module build hook for the PR-time test lane.
#
# Builds the shared/ workspace module before the umbrella check runs.
# The main extension's TypeScript depends on the shared module's
# compiled output (dist/), so this MUST run before tsc / lint / tests
# kick off in the test lane.
#
# Invoked from pixi.toml's `test-full` task (the shipit `test` lane in
# .shipit.toml, run by the wf-checks block; ADP02-WS03, #155). Previously
# the `pre-check` input of the legacy vscode-ext-ci.yml caller
# (.github/workflows/test.yml), removed in that migration.

set -euo pipefail

if ! command -v npm >/dev/null 2>&1; then
	echo "::error::npm not found on \$PATH (needed for shared/ build)" >&2
	exit 2
fi

if [ ! -d shared ]; then
	echo "::error::shared/ directory missing at repo root" >&2
	exit 2
fi

cd shared
npm ci
npm run build
