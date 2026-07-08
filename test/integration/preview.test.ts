import assert from 'node:assert/strict'
import * as vscode from 'vscode'
import type { LexExtensionApi } from '../../src/main.js'
import { integrationTest } from './harness.js'
import { closeAllEditors, EXPORT_DOCUMENT_PATH, openWorkspaceDocument } from './helpers.js'

// Smoke test for the live HTML preview command. We can't read the rendered
// webview HTML from within the extension host, but the preview module does
// expose `activePreviewCount()` through the extension API, which is enough
// to confirm the command actually created (and disposed of) a webview
// without the invocation throwing.
integrationTest('lex.showPreviewToSide opens a webview for .lex documents', async () => {
  const extension = vscode.extensions.getExtension<LexExtensionApi>('lex.lex-vscode')
  assert.ok(extension, 'Lex extension should be discoverable by VS Code')

  const api = await extension.activate()
  await api.clientReady()

  const document = await openWorkspaceDocument(EXPORT_DOCUMENT_PATH)
  assert.strictEqual(document.languageId, 'lex', 'Document should be recognised as lex')

  const before = api.activePreviewCount()

  try {
    await vscode.commands.executeCommand('lex.showPreviewToSide')

    // The preview renders asynchronously; poll briefly for the count to
    // increase rather than asserting immediately on an inherently-racy
    // activation path.
    const deadline = Date.now() + 2000
    while (Date.now() < deadline && api.activePreviewCount() === before) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    assert.strictEqual(
      api.activePreviewCount(),
      before + 1,
      'Preview command should register an active preview panel'
    )

    // Re-invoking on the same document must reuse the existing panel, not
    // create a second one.
    await vscode.commands.executeCommand('lex.showPreviewToSide')
    assert.strictEqual(
      api.activePreviewCount(),
      before + 1,
      'Second invocation on the same document should reuse the existing preview'
    )
  } finally {
    await closeAllEditors()
    // closeAllEditors disposes the webview; wait for the dispose callback
    // to drain the map so later tests see a clean slate.
    const deadline = Date.now() + 2000
    while (Date.now() < deadline && api.activePreviewCount() > before) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    assert.strictEqual(
      api.activePreviewCount(),
      before,
      'Preview cleanup should dispose all preview panels before the test completes'
    )
  }
})
