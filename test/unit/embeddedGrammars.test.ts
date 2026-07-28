import assert from 'node:assert/strict'
import test from 'node:test'
import path from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { Parser, Language, Query } from 'web-tree-sitter'

/**
 * Supply-chain contract for the five bundled embedded grammars.
 *
 * The parser WASM comes from an npm dependency and the `highlights.scm`
 * is vendored in-repo (no prebuilt-WASM package publishes queries), so
 * the two halves can drift apart in ways nothing else would notice: a
 * query written against a different grammar revision still *compiles*,
 * it just stops matching node names and silently highlights nothing.
 * These tests pin all three joints of that seam:
 *
 *   1. manifest ↔ installed npm package (version, and the upstream
 *      revision the package records as the WASM's source)
 *   2. manifest ↔ vendored `highlights.scm` + `LICENSE` on disk
 *   3. staged `resources/embedded-grammars/<lang>/` ↔ the pinned
 *      `web-tree-sitter` runtime: the WASM must actually LOAD (older
 *      prebuilt packages fail here on emscripten dylink metadata, not
 *      on ABI number) and the query must produce real captures.
 *
 * (3) is the ABI-compatibility check the migration turned on. It is a
 * test, not a one-off verification, so bumping `web-tree-sitter` or a
 * `@lumis-sh/wasm-*` pin can never quietly break tokenization.
 */

const repoRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..')
const vendorDir = path.join(repoRoot, 'vendor', 'embedded-grammars')
const stagedDir = path.join(repoRoot, 'resources', 'embedded-grammars')
const require = createRequire(path.join(repoRoot, 'package.json'))

interface GrammarEntry {
  name: string
  npm: string
  npmVersion: string
  wasm: string
  upstreamRepo: string
  upstreamTag: string
  upstreamRev: string
  queriesPath: string
  license: string
}

/** The slice of a `@lumis-sh/wasm-*` package.json this test reads. */
interface LumisPackage {
  version: string
  lumis: { upstreamVersion: string; rev: string }
}

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, 'utf-8')) as T
}

const manifest = readJson<{ schema_version: number; grammars: GrammarEntry[] }>(
  path.join(vendorDir, 'grammars.json')
)

/**
 * The languages `src/injections.ts` resolves annotations to, and the
 * set `test/integration/treesitter_injection.test.ts` asserts against.
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

test('grammar manifest covers exactly the bundled languages', () => {
  assert.deepEqual(
    manifest.grammars.map((g) => g.name).sort(),
    EXPECTED_LANGUAGES,
    'vendor/embedded-grammars/grammars.json must list every bundled language and no others'
  )
})

test('manifest pins agree with the installed npm packages', () => {
  for (const entry of manifest.grammars) {
    // The packages' `exports` map does not expose `./package.json`, so
    // reach it via the one subpath they do export — the WASM we stage.
    // Reading the manifest of the very file we ship is the point.
    const pkgDir = path.dirname(require.resolve(`${entry.npm}/${entry.wasm}`))
    const pkg = readJson<LumisPackage>(path.join(pkgDir, 'package.json'))

    assert.equal(
      pkg.version,
      entry.npmVersion,
      `${entry.npm}: manifest pins ${entry.npmVersion} but ${pkg.version} is installed — ` +
        're-vendor the query and update grammars.json together'
    )
    // The package records which grammar revision its WASM was built
    // from; the vendored query MUST come from that same revision.
    assert.equal(
      `v${pkg.lumis.upstreamVersion}`,
      entry.upstreamTag,
      `${entry.npm}: WASM is built from grammar ${pkg.lumis.upstreamVersion}, ` +
        `manifest claims the query came from ${entry.upstreamTag}`
    )
    assert.equal(
      pkg.lumis.rev,
      entry.upstreamRev,
      `${entry.npm}: WASM is built from rev ${pkg.lumis.rev}, ` +
        `manifest claims the query came from ${entry.upstreamRev}`
    )
  }
})

test('every grammar has a vendored query and its upstream MIT license', () => {
  for (const entry of manifest.grammars) {
    const query = path.join(vendorDir, entry.name, 'highlights.scm')
    const license = path.join(vendorDir, entry.name, 'LICENSE')

    assert.ok(existsSync(query), `missing vendored query: ${query}`)
    assert.ok(readFileSync(query, 'utf-8').trim().length > 0, `empty vendored query: ${query}`)
    assert.ok(existsSync(license), `missing upstream license: ${license}`)
    assert.equal(entry.license, 'MIT', `${entry.name}: only MIT grammars may be redistributed here`)
    assert.match(
      readFileSync(license, 'utf-8'),
      /MIT License/i,
      `${license} does not look like the MIT license the manifest claims`
    )
  }
})

test('staging produces the parser.wasm + highlights.scm pair the loader requires', () => {
  for (const entry of manifest.grammars) {
    for (const file of ['parser.wasm', 'highlights.scm', 'LICENSE']) {
      const staged = path.join(stagedDir, entry.name, file)
      assert.ok(
        existsSync(staged),
        `missing ${staged} — run \`npm run stage-grammars\` (wired into \`npm run bundle\`)`
      )
    }
    // The staged query must be the vendored one, byte for byte.
    assert.equal(
      readFileSync(path.join(stagedDir, entry.name, 'highlights.scm'), 'utf-8'),
      readFileSync(path.join(vendorDir, entry.name, 'highlights.scm'), 'utf-8'),
      `${entry.name}: staged highlights.scm differs from the vendored source`
    )
  }
})

test('every staged grammar loads under the pinned web-tree-sitter and yields captures', async () => {
  await Parser.init()

  for (const entry of manifest.grammars) {
    const dir = path.join(stagedDir, entry.name)
    const sample = SAMPLES[entry.name]
    assert.ok(sample, `no sample snippet for ${entry.name}`)

    // Language.load is where an incompatible prebuilt WASM fails —
    // ABI too old, or emscripten dylink metadata the 0.26 loader
    // rejects. Both surface here as a throw.
    const language = await Language.load(path.join(dir, 'parser.wasm'))
    const parser = new Parser()
    parser.setLanguage(language)

    const query = new Query(language, readFileSync(path.join(dir, 'highlights.scm'), 'utf-8'))
    const tree = parser.parse(sample)
    assert.ok(tree, `${entry.name}: parse returned null`)

    const captures = query.captures(tree.rootNode)
    assert.ok(
      captures.length > 0,
      `${entry.name}: highlights.scm produced no captures — query and parser revisions have drifted`
    )

    tree.delete()
    query.delete()
    parser.delete()
  }
})
