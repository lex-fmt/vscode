#!/usr/bin/env bash
# Pre-check hook for the canonical vscode-ext-ci.yml@v1 thin caller.
#
# Builds the shared/ workspace module before the umbrella check runs.
# The main extension's TypeScript depends on the shared module's
# compiled output (dist/), so this MUST run before tsc / lint / tests
# kick off in the canonical's check step.
#
# Invoked from .github/workflows/test.yml's
# `pre-check: scripts/ci-build-shared.sh`.

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
