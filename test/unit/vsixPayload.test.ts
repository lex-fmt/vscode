import assert from 'node:assert/strict'
import test from 'node:test'
import { crc32 } from 'node:zlib'
import {
  EMBEDDED_LANGUAGES,
  REQUIRED_PAYLOAD,
  findPayloadProblems,
  listVsixEntries,
  type VsixEntry
} from '../vsix-payload/payload.js'

/**
 * The negative half of the packaging check.
 *
 * `npm run test:vsix-payload` only ever sees a healthy `.vsix` on a
 * healthy branch, and a check that has never failed is not evidence
 * that it can. These tests are where it fails: each one hands
 * `findPayloadProblems` an entry list broken exactly the way a real
 * regression breaks it — a `.vscodeignore` re-include deleted, a
 * staging step that stopped running, an upstream fetch that no-oped,
 * a file that shipped at zero bytes — and pins that the check says so,
 * about the right file.
 *
 * The zip reader is covered on real archive bytes here too (built by
 * `zipArchive` below), since the lane exercises it only on the one
 * `.vsix` `vsce` happens to produce.
 */

/** A healthy package: every required member, plus unrelated files. */
function completeEntries(): VsixEntry[] {
  return [
    { name: '[Content_Types].xml', size: 428 },
    { name: 'extension.vsixmanifest', size: 1904 },
    { name: 'extension/package.json', size: 22_180 },
    { name: 'extension/out/src/main.cjs', size: 394_000 },
    ...REQUIRED_PAYLOAD.map((name) => ({ name, size: 1024 }))
  ]
}

/** The same package with `predicate`-matching members deleted. */
function without(predicate: (name: string) => boolean): VsixEntry[] {
  return completeEntries().filter((entry) => !predicate(entry.name))
}

test('a complete .vsix reports no payload problems', () => {
  assert.deepEqual(findPayloadProblems(completeEntries()), [])
})

test('a .vsix without the Lex grammar wasm is rejected, naming its staging step', () => {
  const problems = findPayloadProblems(
    without((name) => name.endsWith('resources/tree-sitter-lex.wasm'))
  )

  assert.equal(problems.length, 1)
  assert.match(problems[0], /^missing: extension\/resources\/tree-sitter-lex\.wasm/)
  assert.match(problems[0], /shipit stage/)
})

test('a .vsix without the queries is rejected — injections included', () => {
  const problems = findPayloadProblems(without((name) => name.includes('/resources/queries/')))

  // `injections.scm` is the one that finds embedded-code zones at all;
  // `src/treesitter.ts` merely logs and carries on without it, which is
  // precisely the silent degradation this check has to catch.
  assert.deepEqual(problems.map(headline), [
    'missing: extension/resources/queries/highlights.scm',
    'missing: extension/resources/queries/injections.scm'
  ])
})

test('a .vsix without the web-tree-sitter runtime wasm is rejected', () => {
  const problems = findPayloadProblems(
    without((name) => name.endsWith('resources/tree-sitter.wasm'))
  )

  assert.equal(problems.length, 1)
  assert.match(problems[0], /^missing: extension\/resources\/tree-sitter\.wasm/)
  assert.match(problems[0], /copy-wasm/)
})

test('a .vsix missing one embedded grammar file is rejected, naming the language', () => {
  const problems = findPayloadProblems(
    without((name) => name.endsWith('embedded-grammars/rust/parser.wasm'))
  )

  assert.deepEqual(problems.map(headline), [
    'missing: extension/resources/embedded-grammars/rust/parser.wasm'
  ])
  assert.match(problems[0], /stage-grammars/)
})

test('a .vsix that dropped the whole embedded-grammars tree is rejected per language', () => {
  // The `.vscodeignore` regression: `!resources/embedded-grammars/**`
  // deleted, so staging still runs and the tree is green while the
  // package ships no embedded parser at all.
  const problems = findPayloadProblems(without((name) => name.includes('/embedded-grammars/')))

  assert.equal(problems.length, EMBEDDED_LANGUAGES.length * 2)
  for (const lang of EMBEDDED_LANGUAGES) {
    assert.ok(
      problems.some((problem) => problem.includes(`/${lang}/parser.wasm`)),
      `no problem reported for ${lang}`
    )
  }
})

test('a payload file that shipped at zero bytes is rejected as empty', () => {
  const entries = completeEntries().map((entry) =>
    entry.name.endsWith('embedded-grammars/python/parser.wasm') ? { ...entry, size: 0 } : entry
  )

  assert.deepEqual(findPayloadProblems(entries).map(headline), [
    'empty: extension/resources/embedded-grammars/python/parser.wasm'
  ])
})

test('an empty .vsix reports every requirement', () => {
  assert.equal(findPayloadProblems([]).length, REQUIRED_PAYLOAD.length)
})

test('the payload contract covers both halves and every embedded language', () => {
  // Guards the contract itself: a language added to the staging script
  // but not here would leave this check blind to it.
  for (const lang of EMBEDDED_LANGUAGES) {
    assert.ok(
      REQUIRED_PAYLOAD.includes(`extension/resources/embedded-grammars/${lang}/parser.wasm`),
      `${lang} is not part of the required payload`
    )
  }
  assert.ok(REQUIRED_PAYLOAD.includes('extension/resources/tree-sitter-lex.wasm'))
  // `vsce` roots every packaged file under `extension/`; a contract
  // written against working-tree paths would match nothing in a .vsix
  // and pass an empty package.
  assert.ok(REQUIRED_PAYLOAD.every((entry) => entry.startsWith('extension/')))
})

test('the zip reader lists names and uncompressed sizes from real archive bytes', () => {
  const archive = zipArchive([
    { name: 'extension/resources/tree-sitter-lex.wasm', data: Buffer.from('\0asm fake') },
    { name: 'extension/resources/embedded-grammars/rust/parser.wasm', data: Buffer.alloc(0) }
  ])

  assert.deepEqual(listVsixEntries(archive), [
    { name: 'extension/resources/tree-sitter-lex.wasm', size: 9 },
    { name: 'extension/resources/embedded-grammars/rust/parser.wasm', size: 0 }
  ])
})

test('the zip reader finds the directory past a trailing archive comment', () => {
  // The end-of-central-directory record is located by scanning back
  // from EOF; a comment pushes it off the tail.
  const archive = zipArchive([{ name: 'a.txt', data: Buffer.from('hi') }], 'a trailing comment')

  assert.deepEqual(listVsixEntries(archive), [{ name: 'a.txt', size: 2 }])
})

test('the zip reader rejects bytes that are not an archive', () => {
  assert.throws(
    () => listVsixEntries(Buffer.from('this is not a zip file at all')),
    /not a zip archive/
  )
})

test('a synthetic .vsix round-trips through the reader into the same verdict', () => {
  const members = REQUIRED_PAYLOAD.map((name) => ({ name, data: Buffer.from('payload') }))

  assert.deepEqual(findPayloadProblems(listVsixEntries(zipArchive(members))), [])
  assert.deepEqual(
    findPayloadProblems(listVsixEntries(zipArchive(members.slice(1)))).map(headline),
    [`missing: ${REQUIRED_PAYLOAD[0]}`]
  )
})

/** The `kind: path` part of a problem, dropping the remedy hint. */
function headline(problem: string): string {
  return problem.split(' — ')[0]
}

/**
 * Build a real (uncompressed) zip archive in memory.
 *
 * Only the STORE method and the fields the reader consumes are
 * emitted — enough to be a well-formed archive that any zip tool can
 * open, so the reader is exercised against genuine bytes rather than a
 * hand-fed entry list.
 */
function zipArchive(files: { name: string; data: Buffer }[], comment = ''): Buffer {
  const LOCAL_HEADER_SIGNATURE = 0x04034b50
  const CENTRAL_HEADER_SIGNATURE = 0x02014b50
  const EOCD_SIGNATURE = 0x06054b50

  const local: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0

  for (const file of files) {
    const name = Buffer.from(file.name, 'utf-8')
    const checksum = crc32(file.data)

    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(LOCAL_HEADER_SIGNATURE, 0)
    localHeader.writeUInt16LE(20, 4) // version needed
    localHeader.writeUInt32LE(checksum, 14)
    localHeader.writeUInt32LE(file.data.length, 18) // compressed size (stored)
    localHeader.writeUInt32LE(file.data.length, 22) // uncompressed size
    localHeader.writeUInt16LE(name.length, 26)
    local.push(localHeader, name, file.data)

    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(CENTRAL_HEADER_SIGNATURE, 0)
    centralHeader.writeUInt16LE(20, 4) // version made by
    centralHeader.writeUInt16LE(20, 6) // version needed
    centralHeader.writeUInt32LE(checksum, 16)
    centralHeader.writeUInt32LE(file.data.length, 20)
    centralHeader.writeUInt32LE(file.data.length, 24)
    centralHeader.writeUInt16LE(name.length, 28)
    centralHeader.writeUInt32LE(offset, 42) // local header offset
    central.push(centralHeader, name)

    offset += localHeader.length + name.length + file.data.length
  }

  const directory = Buffer.concat(central)
  const trailer = Buffer.from(comment, 'utf-8')
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(EOCD_SIGNATURE, 0)
  eocd.writeUInt16LE(files.length, 8)
  eocd.writeUInt16LE(files.length, 10)
  eocd.writeUInt32LE(directory.length, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(trailer.length, 20)

  return Buffer.concat([...local, directory, eocd, trailer])
}
