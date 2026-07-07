import assert from 'node:assert/strict'
import * as vscode from 'vscode'
import { integrationTest } from './harness.js'
import {
  closeAllEditors,
  openWorkspaceDocument,
  removeWorkspacePath,
  requireWorkspaceFolder,
  writeWorkspaceFile
} from './helpers.js'

/**
 * Stub `vscode.window.showInputBox` so the test can drive the prompt without a
 * real UI. Returns a restore function that reinstates the original
 * implementation; tests use a try/finally so a failed assertion doesn't leak
 * the stub into later tests.
 */
function stubShowInputBox(value: string | undefined): () => void {
  const original = vscode.window.showInputBox
  vscode.window.showInputBox = () => Promise.resolve(value)
  return () => {
    vscode.window.showInputBox = original
  }
}

/**
 * Stub `vscode.window.showErrorMessage` and capture the most recent message.
 * Returns `[getter, restore]` — the getter reads the last observed message,
 * the restore function reinstates the original. Mirrors `stubShowInputBox`'s
 * try/finally pattern.
 */
function captureShowErrorMessage(): [() => string | undefined, () => void] {
  let observed: string | undefined
  const original = vscode.window.showErrorMessage
  vscode.window.showErrorMessage = (message: string) => {
    observed = message
    return Promise.resolve(undefined)
  }
  return [
    () => observed,
    () => {
      vscode.window.showErrorMessage = original
    }
  ]
}

integrationTest('extract-to-include creates target file and replaces selection', async () => {
  const folder = requireWorkspaceFolder()
  const hostRelative = 'documents/extract-host.lex'
  // The LSP resolves `src` relative to the host's directory, so we pass
  // a bare filename (`includeSrc`) and the on-disk target is at
  // `documents/extract-target.lex` — same dir as the host.
  const includeSrc = 'extract-target.lex'
  const targetRelative = 'documents/extract-target.lex'
  await writeWorkspaceFile(
    hostRelative,
    'Doc\n===\n\nIntro paragraph.\n\nSection A:\n    First body line.\n    Second body line.\n\nAfter section.\n'
  )
  await removeWorkspacePath(targetRelative)

  try {
    const document = await openWorkspaceDocument(hostRelative)
    const editor = vscode.window.activeTextEditor
    assert.ok(editor, 'Editor should be available')

    editor.selection = new vscode.Selection(new vscode.Position(6, 4), new vscode.Position(8, 0))

    const [observedError, restoreErr] = captureShowErrorMessage()
    const restoreInput = stubShowInputBox(includeSrc)
    try {
      await vscode.commands.executeCommand('lex.extractSelectionToInclude')
    } finally {
      restoreInput()
      restoreErr()
    }

    assert.equal(observedError(), undefined, `extract should not have failed: ${observedError()}`)

    const hostAfter = document.getText()
    assert.ok(
      hostAfter.includes(`:: lex.include src="${includeSrc}" ::`),
      `host should contain the include annotation, got:\n${hostAfter}`
    )
    assert.ok(
      !hostAfter.includes('First body line.'),
      'host should no longer contain the extracted body lines'
    )

    const targetUri = vscode.Uri.joinPath(folder.uri, targetRelative)
    const targetBytes = await vscode.workspace.fs.readFile(targetUri)
    const targetText = Buffer.from(targetBytes).toString('utf-8')
    assert.ok(
      targetText.startsWith('First body line.'),
      `target should hold indent-shifted content, got: ${targetText}`
    )
    assert.ok(targetText.includes('Second body line.'))
  } finally {
    await closeAllEditors()
    await removeWorkspacePath(hostRelative)
    await removeWorkspacePath(targetRelative)
  }
})

integrationTest('extract-to-include surfaces server validation errors', async () => {
  const hostRelative = 'documents/extract-host-err.lex'
  await writeWorkspaceFile(hostRelative, 'Doc\n===\n\nSome content.\n')

  try {
    await openWorkspaceDocument(hostRelative)
    const editor = vscode.window.activeTextEditor
    assert.ok(editor, 'Editor should be available')

    editor.selection = new vscode.Selection(new vscode.Position(3, 0), new vscode.Position(3, 13))

    const [observedError, restoreErr] = captureShowErrorMessage()
    const restoreInput = stubShowInputBox('https://elsewhere/foo.lex')
    try {
      await vscode.commands.executeCommand('lex.extractSelectionToInclude')
    } finally {
      restoreInput()
      restoreErr()
    }

    const message = observedError()
    assert.ok(
      message && message.toLowerCase().includes('url'),
      `expected URL-scheme error to surface, got: ${message}`
    )
  } finally {
    await closeAllEditors()
    await removeWorkspacePath(hostRelative)
  }
})
