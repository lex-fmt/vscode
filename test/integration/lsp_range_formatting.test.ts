import assert from 'node:assert/strict'
import * as vscode from 'vscode'
import type { LexExtensionApi } from '../../src/main.js'
import { integrationTest } from './harness.js'
import { closeAllEditors, FORMATTING_DOCUMENT_PATH, openWorkspaceDocument } from './helpers.js'

// Regression test for the default LanguageClient wiring of
// `textDocument/rangeFormatting`. The server advertises the capability
// (documentRangeFormattingProvider), so VS Code's built-in Format
// Selection command should reach it without any extension-side glue. We
// assert edits come back non-empty when formatting the full range of a
// known-misaligned document, which exercises the same code path a user
// would hit via Format Selection.
integrationTest('range formatting forwards through the LSP', async () => {
  const extension = vscode.extensions.getExtension<LexExtensionApi>('lex.lex-vscode')
  assert.ok(extension, 'Lex extension should be discoverable by VS Code')

  const api = await extension.activate()
  await api.clientReady()

  const document = await openWorkspaceDocument(FORMATTING_DOCUMENT_PATH)
  const originalContent = document.getText()

  const misformatEdit = new vscode.WorkspaceEdit()
  misformatEdit.insert(document.uri, new vscode.Position(0, 0), '  ')
  await vscode.workspace.applyEdit(misformatEdit)
  await new Promise((resolve) => setTimeout(resolve, 500))

  try {
    const fullRange = new vscode.Range(
      new vscode.Position(0, 0),
      document.positionAt(document.getText().length)
    )

    const edits = await vscode.commands.executeCommand<vscode.TextEdit[] | undefined>(
      'vscode.executeFormatRangeProvider',
      document.uri,
      fullRange,
      {
        tabSize: 2,
        insertSpaces: true
      }
    )

    assert.ok(edits && edits.length > 0, 'Range formatting should produce edits')
    const changed = edits.some((edit) => {
      const original = document.getText(edit.range)
      return original !== (edit.newText ?? '')
    })
    assert.ok(changed, 'Range formatting should modify the document content')
  } finally {
    const revertEdit = new vscode.WorkspaceEdit()
    const fullRange = new vscode.Range(
      new vscode.Position(0, 0),
      document.positionAt(document.getText().length)
    )
    revertEdit.replace(document.uri, fullRange, originalContent)
    await vscode.workspace.applyEdit(revertEdit)
    await closeAllEditors()
  }
})
