#!/usr/bin/env node
/**
 * stage-embedded-grammars.mjs — materialize `resources/embedded-grammars/`.
 *
 * `src/embedded.ts` scans `resources/embedded-grammars/<lang>/` and
 * tokenizes a language only when BOTH `parser.wasm` and
 * `highlights.scm` are present. This script is what puts them there.
 * All three staged files come out of ONE npm dependency per language —
 * the official `tree-sitter-<lang>` package published by the
 * tree-sitter org itself, which ships the compiled WASM, its own
 * queries and its license side by side:
 *
 *   parser.wasm     <pkg>/tree-sitter-<lang>.wasm
 *   highlights.scm  <pkg>/queries/highlights.scm
 *   LICENSE         <pkg>/LICENSE — the MIT notice for the grammar we
 *                   redistribute, shipped inside the .vsix
 *
 * Taking the query from the same package as the WASM is the point:
 * they are built from one grammar revision, so query node names can
 * never drift from the parser the way a hand-copied query would. A
 * version bump is a single `npm install --save-exact` with nothing to
 * re-vendor.
 *
 * The output directory is WIPED first, so what ships is strictly
 * `LANGUAGES` below — dropping a language retires it everywhere,
 * rather than leaving a stale grammar that `discoverLanguages` keeps
 * finding. Idempotent and cheap — safe to run on every build.
 *
 * Wired into `npm run bundle` (hence `pretest`, `test:vsix` and
 * `vscode:prepublish`/`vsce package`) AND into `pretest:unit`, so the
 * unit lane stands on its own — CI's `test-full` runs `test:unit`
 * without ever calling `bundle`. No caller has to remember it; run
 * standalone with `npm run stage-grammars`.
 *
 * Exits non-zero with an attributable message when a language has no
 * installed package — a half-staged grammar dir would otherwise
 * degrade silently into "language not available".
 */

import { createRequire } from 'node:module'
import { copyFileSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The embedded languages this extension bundles. Each name must be an
 * official `tree-sitter-<name>` npm package pinned in `package.json`;
 * adding or dropping one is a product decision, mirrored by
 * `EXPECTED_LANGUAGES` in `test/unit/embeddedGrammars.test.ts`.
 */
const LANGUAGES = ['python', 'javascript', 'json', 'rust', 'bash']

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(repoRoot, 'resources', 'embedded-grammars')
const require = createRequire(path.join(repoRoot, 'package.json'))

/** Locate an installed grammar package's root directory. */
function packageDir(pkg) {
  try {
    // These packages declare no `exports` map, so every file in them —
    // including `package.json` — is resolvable by subpath.
    return path.dirname(require.resolve(`${pkg}/package.json`))
  } catch (err) {
    throw new Error(
      `cannot resolve ${pkg} — is it installed? (run npm ci)\n  ` +
        `${err instanceof Error ? err.message : String(err)}`
    )
  }
}

// Wipe before staging, so the output is strictly `LANGUAGES`.
// `resources/embedded-grammars/` is gitignored, so nothing else may live
// here and no `git clean` ever prunes it: dropping a language would
// otherwise leave a working tree where `discoverLanguages` still finds
// the retired grammar's `parser.wasm` + `highlights.scm` and keeps
// announcing it as available — and a `.vsix` packaged from that tree
// would ship it.
rmSync(outDir, { recursive: true, force: true })

for (const lang of LANGUAGES) {
  const pkg = `tree-sitter-${lang}`
  const src = packageDir(pkg)
  const langOut = path.join(outDir, lang)
  mkdirSync(langOut, { recursive: true })

  // copyFileSync throws ENOENT with the offending path, which is the
  // whole diagnostic — no need to pre-check existence.
  copyFileSync(path.join(src, `${pkg}.wasm`), path.join(langOut, 'parser.wasm'))
  copyFileSync(path.join(src, 'queries', 'highlights.scm'), path.join(langOut, 'highlights.scm'))
  copyFileSync(path.join(src, 'LICENSE'), path.join(langOut, 'LICENSE'))
}

console.log(`staged ${LANGUAGES.length} embedded grammar(s): ${LANGUAGES.join(', ')}`)
