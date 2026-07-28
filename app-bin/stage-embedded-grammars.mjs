#!/usr/bin/env node
/**
 * stage-embedded-grammars.mjs — materialize `resources/embedded-grammars/`.
 *
 * `src/embedded.ts` scans `resources/embedded-grammars/<lang>/` and
 * tokenizes a language only when BOTH `parser.wasm` and
 * `highlights.scm` are present. This script is what puts them there.
 * The two halves come from two different places, on purpose:
 *
 *   parser.wasm     copied from the `@lumis-sh/wasm-<lang>` npm
 *                   dependency (a normal, lock-pinned package — no
 *                   GitHub release download, no manifest fetch)
 *   highlights.scm  copied from `vendor/embedded-grammars/<lang>/`,
 *                   vendored in-repo because no prebuilt-WASM package
 *                   publishes queries
 *   LICENSE         copied alongside, so the MIT notice for each
 *                   redistributed grammar ships inside the .vsix
 *
 * `vendor/embedded-grammars/grammars.json` drives all of it and pins
 * which upstream revision each vendored query came from; see the README
 * next to it. Idempotent and cheap — safe to run on every build.
 *
 * Wired into `npm run bundle` (hence `pretest`, `test:vsix` and
 * `vscode:prepublish`/`vsce package`) AND into `pretest:unit`, so the
 * unit lane stands on its own — CI's `test-full` runs `test:unit`
 * without ever calling `bundle`. No caller has to remember it; run
 * standalone with `npm run stage-grammars`.
 *
 * Exits non-zero with an attributable message when a manifest entry has
 * no installed package or no vendored query — a half-staged grammar dir
 * would otherwise degrade silently into "language not available".
 */

import { createRequire } from 'node:module'
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const vendorDir = path.join(repoRoot, 'vendor', 'embedded-grammars')
const outDir = path.join(repoRoot, 'resources', 'embedded-grammars')
const require = createRequire(path.join(repoRoot, 'package.json'))

/** Resolve `<pkg>/<wasm>` through the package's own `exports` map. */
function resolveWasm(entry) {
  try {
    return require.resolve(`${entry.npm}/${entry.wasm}`)
  } catch (err) {
    throw new Error(
      `cannot resolve ${entry.npm}/${entry.wasm} — is ${entry.npm} installed? ` +
        `(run npm ci)\n  ${err instanceof Error ? err.message : String(err)}`
    )
  }
}

const manifest = JSON.parse(readFileSync(path.join(vendorDir, 'grammars.json'), 'utf-8'))

const staged = []
for (const entry of manifest.grammars) {
  const wasmSrc = resolveWasm(entry)
  const langVendor = path.join(vendorDir, entry.name)
  const langOut = path.join(outDir, entry.name)
  mkdirSync(langOut, { recursive: true })

  copyFileSync(wasmSrc, path.join(langOut, 'parser.wasm'))
  // copyFileSync throws ENOENT with the offending path, which is the
  // whole diagnostic — no need to pre-check existence.
  copyFileSync(path.join(langVendor, 'highlights.scm'), path.join(langOut, 'highlights.scm'))
  copyFileSync(path.join(langVendor, 'LICENSE'), path.join(langOut, 'LICENSE'))
  staged.push(entry.name)
}

console.log(`staged ${staged.length} embedded grammar(s): ${staged.join(', ')}`)
