/**
 * The tree-sitter payload contract for a packaged `.vsix`.
 *
 * The extension parses nothing without files it does NOT compile from
 * source: they are copied into `resources/` by build steps and then
 * swept into the `.vsix` by `.vscodeignore`. Every one of those joints
 * can break silently — a dropped `.vscodeignore` re-include, a staging
 * step that stops running, an upstream fetch that quietly no-ops — and
 * the result is an extension that installs, activates, and highlights
 * nothing. `src/treesitter.ts` reports it as `runtime-wasm-missing` /
 * `lang-wasm-missing` / `highlights-missing` at runtime; nothing said
 * it at build time.
 *
 * This module is the build-time half: given the entries of a built
 * `.vsix`, it answers whether the payload the runtime loaders demand is
 * actually inside the package. Both halves are covered, because they
 * arrive by different roads and fail independently:
 *
 *   - the LEX grammar payload (`tree-sitter-lex.wasm`, `queries/`),
 *     staged out of the resolved `tree-sitter` conda package
 *     (`lex-fmt/tree-sitter-lex`) by `./bin/shipit stage`, per
 *     `[stage.tree-sitter]` in `.shipit.toml`;
 *   - the EMBEDDED grammars (`embedded-grammars/<lang>/`), staged out
 *     of the `tree-sitter-<lang>` npm packages by
 *     `app-bin/stage-embedded-grammars.mjs`;
 *   - plus the web-tree-sitter RUNTIME wasm, copied from
 *     `node_modules` by `npm run copy-wasm`. Without it neither half
 *     loads, so it belongs to the same contract.
 *
 * Kept free of I/O and of `node:child_process` on purpose: the entry
 * list is the only input, so the negative cases — the ones that prove
 * the check can fail — are ordinary unit tests
 * (`test/unit/vsixPayload.test.ts`) rather than a packaging run.
 */

/** One archive member of a `.vsix`, as recorded in its zip directory. */
export interface VsixEntry {
  /** Slash-separated archive path, e.g. `extension/resources/…`. */
  name: string
  /** Uncompressed size in bytes. Zero means the file shipped empty. */
  size: number
}

/**
 * The languages whose grammars ride inside the `.vsix`. Mirrors
 * `LANGUAGES` in `app-bin/stage-embedded-grammars.mjs` and
 * `EXPECTED_LANGUAGES` in `test/unit/embeddedGrammars.test.ts` —
 * adding or dropping one is a product decision made there, and this
 * list follows it.
 */
export const EMBEDDED_LANGUAGES = ['bash', 'javascript', 'json', 'python', 'rust'] as const

/**
 * `vsce` roots every packaged file under `extension/`; the manifest and
 * `[Content_Types].xml` sit beside it at the archive root.
 */
const EXTENSION_ROOT = 'extension/'

/**
 * The Lex half: the grammar WASM and the queries `src/treesitter.ts`
 * loads. `highlights.scm` is what a `lang-wasm`-loaded parser is
 * queried with, and `injections.scm` is what finds the embedded-code
 * zones in the first place — an extension packaged without it degrades
 * to "no injections at all", which is exactly the failure this check
 * exists to catch.
 */
const LEX_GRAMMAR_PAYLOAD = [
  'resources/tree-sitter.wasm',
  'resources/tree-sitter-lex.wasm',
  'resources/queries/highlights.scm',
  'resources/queries/injections.scm'
]

/**
 * The embedded half: `src/embedded.ts` treats a language as available
 * only when BOTH `parser.wasm` and `highlights.scm` are present, so
 * both are required per language. The LICENSE file is staged beside
 * them for redistribution and is asserted by
 * `test/unit/embeddedGrammars.test.ts`; the loader does not read it, so
 * it is not part of this runtime contract.
 */
function embeddedGrammarPayload(): string[] {
  return EMBEDDED_LANGUAGES.flatMap((lang) => [
    `resources/embedded-grammars/${lang}/parser.wasm`,
    `resources/embedded-grammars/${lang}/highlights.scm`
  ])
}

/**
 * Every archive path a shippable `.vsix` must contain, non-empty.
 * Ordered Lex-half first so a failure report reads in the same order as
 * the build steps that produce it.
 */
export const REQUIRED_PAYLOAD: readonly string[] = [
  ...LEX_GRAMMAR_PAYLOAD,
  ...embeddedGrammarPayload()
].map((entry) => `${EXTENSION_ROOT}${entry}`)

/**
 * Hint attached to a failure, naming the build step that produces the
 * missing file. A red check should say what to re-run, not just what is
 * absent.
 */
function remedy(entry: string): string {
  if (entry.includes('/embedded-grammars/')) {
    return 'run `npm run stage-grammars`'
  }
  if (entry.endsWith('resources/tree-sitter.wasm')) {
    return 'run `npm run copy-wasm`'
  }
  return 'run `./bin/shipit stage` (the [stage.tree-sitter] map, off the resolved conda env)'
}

/**
 * Compare a built `.vsix`'s entries against {@link REQUIRED_PAYLOAD}.
 *
 * Returns one human-readable problem per broken requirement, empty when
 * the package is complete. A zero-byte member counts as broken: it
 * packages and unpacks cleanly, then fails at `Language.load` with an
 * error that points at the runtime rather than at the build.
 */
export function findPayloadProblems(entries: readonly VsixEntry[]): string[] {
  const sizes = new Map(entries.map((entry) => [entry.name, entry.size]))
  const problems: string[] = []

  for (const required of REQUIRED_PAYLOAD) {
    const size = sizes.get(required)
    if (size === undefined) {
      problems.push(`missing: ${required} — ${remedy(required)}`)
    } else if (size === 0) {
      problems.push(`empty: ${required} — ${remedy(required)}`)
    }
  }

  return problems
}

// ---------------------------------------------------------------------------
// Minimal zip reader
// ---------------------------------------------------------------------------
//
// A `.vsix` is a zip file, and the names + uncompressed sizes of its
// members all live in one place: the central directory at the tail of
// the archive. Reading just that is a few dozen lines against a stable
// 30-year-old format — cheaper than taking a zip dependency into a
// check whose whole job is to notice when a dependency stopped
// arriving. No member is decompressed; the check never needs the bytes.

const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50
const CENTRAL_FILE_HEADER_SIGNATURE = 0x02014b50
/** Size of an end-of-central-directory record with an empty comment. */
const EOCD_MIN_SIZE = 22
/** The comment length field is 16-bit, so the record starts no earlier. */
const MAX_COMMENT_SIZE = 0xffff
/** Fixed part of a central-directory file header, before the name. */
const CENTRAL_HEADER_SIZE = 46

/** Locate the end-of-central-directory record, scanning back from EOF. */
function findEndOfCentralDirectory(archive: Buffer): number {
  const earliest = Math.max(0, archive.length - EOCD_MIN_SIZE - MAX_COMMENT_SIZE)
  for (let offset = archive.length - EOCD_MIN_SIZE; offset >= earliest; offset--) {
    if (archive.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      return offset
    }
  }
  throw new Error('not a zip archive: no end-of-central-directory record found')
}

/**
 * List a `.vsix`'s members from its central directory.
 *
 * Takes the archive bytes rather than a path so it stays testable
 * without a packaging run. Zip64 archives are rejected outright: a
 * `.vsix` is a couple of megabytes, so hitting the 4 GiB / 65535-entry
 * escape hatch means the input is not what this check thinks it is.
 */
export function listVsixEntries(archive: Buffer): VsixEntry[] {
  const eocd = findEndOfCentralDirectory(archive)
  const entryCount = archive.readUInt16LE(eocd + 10)
  const directoryOffset = archive.readUInt32LE(eocd + 16)

  if (entryCount === 0xffff || directoryOffset === 0xffffffff) {
    throw new Error('zip64 archives are not supported by this check')
  }

  const entries: VsixEntry[] = []
  let offset = directoryOffset

  for (let index = 0; index < entryCount; index++) {
    if (archive.readUInt32LE(offset) !== CENTRAL_FILE_HEADER_SIGNATURE) {
      throw new Error(`corrupt zip: no central file header at offset ${offset}`)
    }
    const size = archive.readUInt32LE(offset + 24)
    const nameLength = archive.readUInt16LE(offset + 28)
    const extraLength = archive.readUInt16LE(offset + 30)
    const commentLength = archive.readUInt16LE(offset + 32)
    const nameStart = offset + CENTRAL_HEADER_SIZE

    entries.push({
      name: archive.toString('utf-8', nameStart, nameStart + nameLength),
      size
    })

    offset = nameStart + nameLength + extraLength + commentLength
  }

  return entries
}
