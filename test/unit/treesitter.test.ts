import assert from 'node:assert/strict'
import test from 'node:test'
import os from 'node:os'
import path from 'node:path'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { initTreeSitter, type TreeSitterInitResult } from '../../src/treesitter.js'

/**
 * Unit coverage for `initTreeSitter`'s synchronous pre-flight stage. The
 * success path (real WASM parse/query) is exercised by the integration suite
 * under the extension host; here we pin the *diagnostics* contract the module
 * is built around — each missing-resource case returns a distinct, attributable
 * `{ ok: false, stage }` BEFORE any WASM load, so a misconfigured install
 * surfaces "missing X" rather than an opaque loader error.
 */

const RUNTIME_WASM = 'tree-sitter.wasm'
const LANG_WASM = 'tree-sitter-lex.wasm'

/** Build a throwaway extension dir, writing only the named resources. */
function makeExtensionDir(present: string[]): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'lex-ts-'))
  try {
    const resources = path.join(dir, 'resources')
    mkdirSync(resources, { recursive: true })
    for (const rel of present) {
      const full = path.join(resources, rel)
      mkdirSync(path.dirname(full), { recursive: true })
      writeFileSync(full, '')
    }
    return dir
  } catch (err) {
    // Don't leak the temp dir if setup throws before the caller can clean up.
    rmSync(dir, { recursive: true, force: true })
    throw err
  }
}

function assertFailure(
  result: TreeSitterInitResult
): asserts result is Extract<TreeSitterInitResult, { ok: false }> {
  assert.equal(result.ok, false, 'expected init to fail')
}

test('initTreeSitter: missing runtime wasm reports the runtime-wasm-missing stage first', async () => {
  const dir = makeExtensionDir([]) // nothing present
  try {
    const result = await initTreeSitter(dir)
    assertFailure(result)
    assert.equal(result.stage, 'runtime-wasm-missing')
    assert.match(result.error, /tree-sitter\.wasm not found/)
    assert.equal(result.resourcesDir, path.join(dir, 'resources'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('initTreeSitter: runtime present but language wasm missing reports lang-wasm-missing', async () => {
  const dir = makeExtensionDir([RUNTIME_WASM])
  try {
    const result = await initTreeSitter(dir)
    assertFailure(result)
    assert.equal(result.stage, 'lang-wasm-missing')
    assert.match(result.error, /tree-sitter-lex\.wasm not found/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('initTreeSitter: runtime + language present but highlights missing reports highlights-missing', async () => {
  const dir = makeExtensionDir([RUNTIME_WASM, LANG_WASM])
  try {
    const result = await initTreeSitter(dir)
    assertFailure(result)
    assert.equal(result.stage, 'highlights-missing')
    assert.match(result.error, /highlights\.scm not found/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('initTreeSitter: the failure stage is logged through the optional logger', async () => {
  const dir = makeExtensionDir([])
  const lines: string[] = []
  try {
    const result = await initTreeSitter(dir, (msg) => lines.push(msg))
    assertFailure(result)
    assert.ok(
      lines.some((l) => l.includes('runtime-wasm-missing failed')),
      `expected a logged failure breadcrumb, got: ${JSON.stringify(lines)}`
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('initTreeSitter: works with no logger supplied (logger is optional)', async () => {
  const dir = makeExtensionDir([])
  try {
    // Must not throw when `log` is undefined.
    const result = await initTreeSitter(dir)
    assertFailure(result)
    assert.equal(result.stage, 'runtime-wasm-missing')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
