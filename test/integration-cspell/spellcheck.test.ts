import assert from 'node:assert/strict'
import path from 'node:path'
import * as vscode from 'vscode'
import { integrationTest } from '../integration/harness.js'

// Drives CSpell against the canonical spellcheck fixture and asserts that
// the diagnostics CSpell publishes match the policy: every prose typo
// flagged, every non-prose typo hidden.
//
// Runs only via `npm run test:cspell`, which downloads the CSpell extension
// into the test VS Code instance before launching. In the default
// `test:integration` run (with `--disable-extensions`) this file is not
// loaded — `test/integration-cspell/index.ts` is sibling to the default
// runner, not part of its glob.

const CSPELL_ID = 'streetsidesoftware.code-spell-checker'

const PROSE_TYPOS = [
  'Spelchek', // doc title
  'contians', // subtitle / paragraph / definition body
  'recieve', // subtitle
  'Sectoin', // session
  'occured', // paragraph
  'behaviuor', // paragraph
  'Mispelled', // list item + definition subject
  'Brokn', // table caption
  'Coloumn', // table cell header
  'Pythn' // verbatim subject (prose per policy)
]

// Typos that live inside non-prose regions (verbatim body, labels,
// inline code/math/refs). CSpell should NOT surface these.
const NON_PROSE_TYPOS_TO_SUPPRESS = [
  'teh_function', // verbatim body identifier
  'nott_a_typo_label' // annotation header (between :: ::)
]

async function waitForDiagnostics(
  uri: vscode.Uri,
  match: (d: readonly vscode.Diagnostic[]) => boolean,
  timeoutMs = 15_000
): Promise<readonly vscode.Diagnostic[]> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const diags = vscode.languages.getDiagnostics(uri)
    if (match(diags)) return diags
    await new Promise((r) => setTimeout(r, 250))
  }
  return vscode.languages.getDiagnostics(uri)
}

integrationTest('CSpell flags prose typos and skips non-prose regions', async () => {
  const cspell = vscode.extensions.getExtension(CSPELL_ID)
  assert.ok(
    cspell,
    `Code Spell Checker (${CSPELL_ID}) is not installed in this VS Code instance — ` +
      'this test must be run via `npm run test:cspell`, which installs it via the CLI.'
  )
  if (!cspell.isActive) {
    await cspell.activate()
  }

  // Wait for our extension to activate so its contributed cSpell
  // configurationDefaults are in effect.
  const lex = vscode.extensions.getExtension('lex.lex-vscode')
  assert.ok(lex, 'lex.lex-vscode extension not available')
  if (!lex.isActive) await lex.activate()

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
  assert.ok(workspaceFolder, 'no workspace folder open')
  // workspaceFolder.uri.fsPath = `<repo>/test/fixtures/sample-workspace`;
  // the fixture lives at `<repo>/test/fixtures/spellcheck-fixture.lex`.
  const fixturePath = path.resolve(workspaceFolder.uri.fsPath, '..', 'spellcheck-fixture.lex')
  const fixtureUri = vscode.Uri.file(fixturePath)
  const doc = await vscode.workspace.openTextDocument(fixtureUri)
  await vscode.window.showTextDocument(doc)

  // Wait for CSpell to publish at least one diagnostic on the fixture —
  // serves as a readiness signal before we sample.
  const diagnostics = await waitForDiagnostics(fixtureUri, (d) =>
    d.some((diag) => diag.source === 'cSpell')
  )

  const cspellDiagnostics = diagnostics.filter((d) => d.source === 'cSpell')
  assert.ok(
    cspellDiagnostics.length > 0,
    `expected CSpell diagnostics on ${fixturePath}, got ${diagnostics.length} from sources: ` +
      [...new Set(diagnostics.map((d) => d.source))].join(',')
  )

  const flaggedWords = new Set<string>()
  for (const d of cspellDiagnostics) {
    const word = doc.getText(d.range)
    flaggedWords.add(word)
  }

  const missing: string[] = []
  for (const typo of PROSE_TYPOS) {
    if (!flaggedWords.has(typo)) missing.push(typo)
  }
  const leaks: string[] = []
  for (const typo of NON_PROSE_TYPOS_TO_SUPPRESS) {
    if (flaggedWords.has(typo)) leaks.push(typo)
  }

  const report =
    `\nflagged: ${[...flaggedWords].sort().join(', ')}\n` +
    (missing.length ? `missing (expected to flag): ${missing.join(', ')}\n` : '') +
    (leaks.length ? `leaks (expected to suppress): ${leaks.join(', ')}\n` : '')

  assert.deepEqual({ missing, leaks }, { missing: [], leaks: [] }, report)
})
