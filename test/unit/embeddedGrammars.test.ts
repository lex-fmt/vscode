import assert from 'node:assert/strict'
import test from 'node:test'
import path from 'node:path'
import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { Parser, Language, Query } from 'web-tree-sitter'

/**
 * Supply-chain contract for the five bundled embedded grammars.
 *
 * Parser WASM, `highlights.scm` and LICENSE all come out of one
 * official `tree-sitter-<lang>` npm package, so query and parser can no
 * longer drift apart in the tree — but the staged copy still can, and
 * so can the runtime that has to load it. These tests pin the joints
 * that remain:
 *
 *   1. staged set ↔ the languages the extension promises, in BOTH
 *      directions: staging wipes its output, so a language dropped
 *      from the script cannot survive in the gitignored output tree
 *      and keep being discovered.
 *   2. staged files ↔ the installed packages, byte for byte — a stale
 *      staging dir left over from an older pin fails here.
 *   3. staged `resources/embedded-grammars/<lang>/` ↔ the pinned
 *      `web-tree-sitter` runtime: the WASM must actually LOAD (an
 *      incompatible prebuilt fails on emscripten dylink metadata, not
 *      on ABI number) and the query must produce real captures.
 *
 * (3) is the ABI-compatibility check the npm migration turned on. It is
 * a test, not a one-off verification, so bumping `web-tree-sitter` or a
 * grammar pin can never quietly break tokenization.
 */

const repoRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..')
const stagedDir = path.join(repoRoot, 'resources', 'embedded-grammars')
const require = createRequire(path.join(repoRoot, 'package.json'))

/**
 * The languages `src/injections.ts` resolves annotations to, and the
 * set `test/integration/treesitter_injection.test.ts` asserts against.
 * Mirrors `LANGUAGES` in `app-bin/stage-embedded-grammars.mjs`.
 * Dropping one is a product decision, not a refactor — make it here.
 */
const EXPECTED_LANGUAGES = ['bash', 'javascript', 'json', 'python', 'rust']

/** Minimal snippet per language that must yield at least one capture. */
const SAMPLES: Record<string, string> = {
  python: 'def f(x):\n    # comment\n    return "s"\n',
  javascript: 'async function f(a) { /* comment */ return `s` }\n',
  json: '{"a": [1, true, null]}\n',
  rust: 'fn main() {\n    // comment\n    let s = "x";\n}\n',
  bash: '#!/bin/bash\nif [ -f x ]; then echo "hi"; fi\n'
}

/** Root of the installed `tree-sitter-<lang>` package. */
function packageDir(lang: string): string {
  return path.dirname(require.resolve(`tree-sitter-${lang}/package.json`))
}

test('staging produces the parser.wasm + highlights.scm pair the loader requires', () => {
  for (const lang of EXPECTED_LANGUAGES) {
    for (const file of ['parser.wasm', 'highlights.scm', 'LICENSE']) {
      const staged = path.join(stagedDir, lang, file)
      assert.ok(
        existsSync(staged),
        `missing ${staged} — run \`npm run stage-grammars\` ` +
          '(wired into `npm run bundle` and `pretest:unit`)'
      )
    }
  }
})

test('staged grammars are the installed packages, byte for byte', () => {
  for (const lang of EXPECTED_LANGUAGES) {
    const src = packageDir(lang)
    const pairs: [string, string][] = [
      [path.join(src, `tree-sitter-${lang}.wasm`), path.join(stagedDir, lang, 'parser.wasm')],
      [path.join(src, 'queries', 'highlights.scm'), path.join(stagedDir, lang, 'highlights.scm')],
      [path.join(src, 'LICENSE'), path.join(stagedDir, lang, 'LICENSE')]
    ]
    for (const [from, to] of pairs) {
      assert.ok(
        readFileSync(from).equals(readFileSync(to)),
        `${lang}: ${to} differs from ${from} — the staging dir is stale, re-run ` +
          '`npm run stage-grammars`'
      )
    }
    // Only MIT-licensed grammars may be redistributed inside the .vsix;
    // a package relicensing across a version bump must not slip through.
    assert.match(
      readFileSync(path.join(stagedDir, lang, 'LICENSE'), 'utf-8'),
      /MIT License/i,
      `${lang}: staged LICENSE is not the MIT notice this extension may redistribute`
    )
  }
})

test('staging prunes a grammar the script no longer lists', () => {
  // `resources/embedded-grammars/` is gitignored, so a language dropped
  // from the staging script is never cleaned by git and would linger in
  // the working tree. The loader discovers languages by SCANNING that
  // directory, so a stale pair would keep being announced as available
  // and would ride along into a `.vsix` packaged from that tree.
  const stale = path.join(stagedDir, 'cobol')
  mkdirSync(stale, { recursive: true })
  writeFileSync(path.join(stale, 'parser.wasm'), 'not a real parser')
  writeFileSync(path.join(stale, 'highlights.scm'), '(comment) @comment')

  execFileSync(process.execPath, [path.join(repoRoot, 'app-bin', 'stage-embedded-grammars.mjs')], {
    cwd: repoRoot,
    stdio: 'pipe'
  })

  // The restage is exactly the promised set — subtractive AND complete.
  assert.deepEqual(
    readdirSync(stagedDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort(),
    EXPECTED_LANGUAGES,
    'staged languages do not match the set the extension promises'
  )
})

test('every staged grammar loads under the pinned web-tree-sitter and yields captures', async () => {
  await Parser.init()

  for (const lang of EXPECTED_LANGUAGES) {
    const dir = path.join(stagedDir, lang)
    const sample = SAMPLES[lang]
    assert.ok(sample, `no sample snippet for ${lang}`)

    // Language.load is where an incompatible prebuilt WASM fails —
    // ABI too old, or emscripten dylink metadata the 0.26 loader
    // rejects. Both surface here as a throw.
    const language = await Language.load(path.join(dir, 'parser.wasm'))
    const parser = new Parser()
    parser.setLanguage(language)

    const query = new Query(language, readFileSync(path.join(dir, 'highlights.scm'), 'utf-8'))
    const tree = parser.parse(sample)
    assert.ok(tree, `${lang}: parse returned null`)

    const captures = query.captures(tree.rootNode)
    assert.ok(
      captures.length > 0,
      `${lang}: highlights.scm produced no captures — query and parser revisions have drifted`
    )

    tree.delete()
    query.delete()
    parser.delete()
  }
})
