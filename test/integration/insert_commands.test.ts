import assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { integrationTest } from './harness.js';
import {
  closeAllEditors,
  openWorkspaceDocument,
  TEST_DOCUMENT_PATH,
  writeWorkspaceFile,
  removeWorkspacePath
} from './helpers.js';

integrationTest('insert asset command inserts snippet from selected file', async () => {
  const document = await openWorkspaceDocument(TEST_DOCUMENT_PATH);
  const editor = vscode.window.activeTextEditor;
  assert.ok(editor, 'Editor should be available');

  const relativeAssetPath = 'documents/tmp-insert/diagram.png';
  const assetUri = await writeWorkspaceFile(relativeAssetPath, new Uint8Array([0, 159, 146, 150]));

  const insertionPosition = new vscode.Position(0, 0);
  editor.selection = new vscode.Selection(insertionPosition, insertionPosition);

  await vscode.commands.executeCommand('lex.insertAssetReference', assetUri);
  const insertedSnippet = document.getText(
    new vscode.Range(
      insertionPosition,
      editor.document.positionAt(editor.document.offsetAt(insertionPosition) + 120)
    )
  );
  assert.ok(insertedSnippet.includes(':: doc.image'), 'Asset snippet should include image label');

  await vscode.commands.executeCommand('undo');
  await removeWorkspacePath('documents/tmp-insert');
  await closeAllEditors();
});

integrationTest('insert verbatim command embeds text content', async () => {
  const document = await openWorkspaceDocument(TEST_DOCUMENT_PATH);
  const editor = vscode.window.activeTextEditor;
  assert.ok(editor, 'Editor should be available');

  const relativeScriptPath = 'documents/tmp-insert/script.py';
  const scriptUri = await writeWorkspaceFile(relativeScriptPath, Buffer.from("print('hello from lex')\n"));

  const insertionPosition = new vscode.Position(1, 0);
  editor.selection = new vscode.Selection(insertionPosition, insertionPosition);

  await vscode.commands.executeCommand('lex.insertVerbatimBlock', scriptUri);
  const snippetRange = new vscode.Range(
    insertionPosition,
    editor.document.positionAt(editor.document.offsetAt(insertionPosition) + 200)
  );
  const snippetText = document.getText(snippetRange);
  assert.ok(snippetText.includes(':: python'), 'Verbatim snippet should infer python language');
  assert.ok(snippetText.includes("print('hello from lex')"));

  await vscode.commands.executeCommand('undo');
  await removeWorkspacePath('documents/tmp-insert');
  await closeAllEditors();
});
