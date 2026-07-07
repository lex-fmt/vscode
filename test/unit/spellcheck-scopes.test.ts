import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import type * as VscTm from 'vscode-textmate'

const require_ = createRequire(import.meta.url)
// vscode-oniguruma + vscode-textmate are CJS; load via require for predictable
// interop in Node's native ESM + TS-compiled-to-CJS context.
const oniguruma = require_('vscode-oniguruma') as typeof import('vscode-oniguruma')
const vsctm = require_('vscode-textmate') as typeof VscTm
const readFileAsync = promisify(readFile)
const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..', '..', '..')
const grammarPath = path.join(repoRoot, 'resources', 'lex.tmLanguage.json')
const fixturePath = path.join(repoRoot, 'test', 'fixtures', 'spellcheck-fixture.lex')

// Scopes whose presence on a token indicates "not prose" — CSpell should
// ignore words inside any token bearing one of these. The TextMate grammar
// exists for exactly this purpose: tag non-prose regions so CSpell skips
// them.
const NON_PROSE_SCOPE_PREFIXES = [
  'meta.tag.',
  'markup.raw.',
  'markup.inline.math.',
  'meta.reference.',
  'markup.underline.link.'
]

function isNonProse(scopes: readonly string[]): boolean {
  return scopes.some((s) => NON_PROSE_SCOPE_PREFIXES.some((p) => s.startsWith(p)))
}

async function makeGrammar(): Promise<VscTm.IGrammar> {
  const wasmPath = require_.resolve('vscode-oniguruma/release/onig.wasm')
  // Pass the Buffer directly — readFileSync(...).buffer can return an
  // oversized ArrayBuffer that ignores the Buffer's byteOffset/byteLength,
  // which loadWASM would then read past the end of.
  const wasmBin = readFileSync(wasmPath)
  await oniguruma.loadWASM(wasmBin)

  const registry = new vsctm.Registry({
    onigLib: Promise.resolve({
      createOnigScanner: (sources: string[]) => new oniguruma.OnigScanner(sources),
      createOnigString: (str: string) => new oniguruma.OnigString(str)
    }),
    loadGrammar: async (scopeName: string) => {
      if (scopeName === 'text.lex') {
        const raw = await readFileAsync(grammarPath, 'utf8')
        return vsctm.parseRawGrammar(raw, grammarPath)
      }
      return null
    }
  })

  const grammar = await registry.loadGrammar('text.lex')
  if (!grammar) throw new Error('failed to load text.lex grammar')
  return grammar
}

interface TokenAt {
  scopes: string[]
  text: string
}

function tokenizeAll(
  grammar: VscTm.IGrammar,
  text: string
): Array<{ line: string; tokens: VscTm.IToken[] }> {
  const lines = text.split('\n')
  let ruleStack: VscTm.StateStack | null = null
  return lines.map((line) => {
    const result = grammar.tokenizeLine(line, ruleStack)
    ruleStack = result.ruleStack
    return { line, tokens: result.tokens }
  })
}

function tokenAt(
  perLine: Array<{ line: string; tokens: VscTm.IToken[] }>,
  row1: number,
  col1: number
): TokenAt | null {
  const row = row1 - 1
  const col = col1 - 1
  const entry = perLine[row]
  if (!entry) return null
  for (const tok of entry.tokens) {
    if (tok.startIndex <= col && col < tok.endIndex) {
      return {
        scopes: tok.scopes,
        text: entry.line.slice(tok.startIndex, tok.endIndex)
      }
    }
  }
  return null
}

function findWord(text: string, needle: string): { row: number; col: number } | null {
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const idx = lines[i].indexOf(needle)
    if (idx !== -1) {
      return { row: i + 1, col: idx + 1 + Math.floor(needle.length / 2) }
    }
  }
  return null
}

test('lex TextMate grammar tags non-prose regions for CSpell skip', async () => {
  const grammar = await makeGrammar()
  const text = await readFileAsync(fixturePath, 'utf8')
  const lines = tokenizeAll(grammar, text)

  type Case = { needle: string; expectNonProse: boolean; note: string }
  const cases: Case[] = [
    // Prose positions: should NOT be tagged as non-prose
    { needle: 'Spelchek', expectNonProse: false, note: 'doc title' },
    { needle: 'contians', expectNonProse: false, note: 'subtitle' },
    { needle: 'Sectoin', expectNonProse: false, note: 'session title' },
    { needle: 'occured', expectNonProse: false, note: 'paragraph' },
    { needle: 'Mispelled', expectNonProse: false, note: 'list/definition' },
    { needle: 'Brokn', expectNonProse: false, note: 'table caption' },
    { needle: 'Coloumn', expectNonProse: false, note: 'table cell' },
    { needle: 'Pythn', expectNonProse: false, note: 'verbatim subject' },
    { needle: 'trailing descriptor', expectNonProse: false, note: 'annotation trailing' },
    { needle: 'body of this annotation', expectNonProse: false, note: 'annotation block body' },

    // Non-prose positions: SHOULD be tagged
    { needle: 'note nott_a_typo_label', expectNonProse: true, note: 'annotation header/label' },
    { needle: 'data src=somepath', expectNonProse: true, note: 'annotation header/params' },
    { needle: 'teh code span', expectNonProse: true, note: 'inline code span' },
    { needle: 'teh math', expectNonProse: true, note: 'inline math span' },
    { needle: 'teh refernce', expectNonProse: true, note: 'inline reference' }
  ]

  // Synthetic URL / path coverage — neither appears in the canonical
  // fixture, but the grammar exists to scope them as non-prose. Token
  // them in isolation so this test catches regressions in #url / #path.
  const inlineCases: Array<{
    line: string
    needle: string
    expectNonProse: boolean
    note: string
  }> = [
    {
      line: 'Visit https://example.com/foo-bar for docs',
      needle: 'https://example.com/foo-bar',
      expectNonProse: true,
      note: 'URL'
    },
    {
      line: 'Edit ./src/main.rs and /etc/hosts please',
      needle: './src/main.rs',
      expectNonProse: true,
      note: 'relative file path'
    },
    {
      line: 'Edit ./src/main.rs and /etc/hosts please',
      needle: '/etc/hosts',
      expectNonProse: true,
      note: 'absolute file path'
    }
  ]

  const failures: string[] = []
  for (const c of cases) {
    const pos = findWord(text, c.needle)
    if (!pos) {
      failures.push(`${c.note}: needle ${JSON.stringify(c.needle)} not found in fixture`)
      continue
    }
    const tok = tokenAt(lines, pos.row, pos.col)
    if (!tok) {
      failures.push(`${c.note}: no token at (${pos.row},${pos.col})`)
      continue
    }
    const actual = isNonProse(tok.scopes)
    if (actual !== c.expectNonProse) {
      failures.push(
        `${c.note}: needle=${JSON.stringify(c.needle)} expected nonProse=${c.expectNonProse} actual=${actual} scopes=${tok.scopes.join(' ')}`
      )
    }
  }

  // Synthetic inline cases — tokenized in isolation
  for (const c of inlineCases) {
    const result = grammar.tokenizeLine(c.line, null)
    const col = c.line.indexOf(c.needle) + Math.floor(c.needle.length / 2)
    const tok = result.tokens.find((t) => t.startIndex <= col && col < t.endIndex)
    if (!tok) {
      failures.push(`${c.note}: no token at col ${col} of "${c.line}"`)
      continue
    }
    const actual = isNonProse(tok.scopes)
    if (actual !== c.expectNonProse) {
      failures.push(
        `${c.note}: needle=${JSON.stringify(c.needle)} expected nonProse=${c.expectNonProse} actual=${actual} scopes=${tok.scopes.join(' ')}`
      )
    }
  }

  assert.deepEqual(failures, [], failures.join('\n'))
})

test('annotation with trailing descriptor: label region is meta.tag, trailing is prose', async () => {
  const grammar = await makeGrammar()
  // `:: note :: trailing` — the label region should be meta.tag, trailing prose.
  const line = ':: note :: trailing words here'
  const result = grammar.tokenizeLine(line, null)

  // Find the `note` token and the `trailing` token.
  const noteCol = line.indexOf('note')
  const trailingCol = line.indexOf('trailing')
  const noteTok = result.tokens.find((t) => t.startIndex <= noteCol && noteCol < t.endIndex)
  const trailingTok = result.tokens.find(
    (t) => t.startIndex <= trailingCol && trailingCol < t.endIndex
  )
  assert.ok(noteTok, 'no token covering `note`')
  assert.ok(trailingTok, 'no token covering `trailing`')
  assert.ok(
    isNonProse(noteTok.scopes),
    'expected `note` to be tagged as non-prose; scopes=' + noteTok.scopes.join(' ')
  )
  assert.ok(
    !isNonProse(trailingTok.scopes),
    'expected `trailing` to be prose; scopes=' + trailingTok.scopes.join(' ')
  )
})
