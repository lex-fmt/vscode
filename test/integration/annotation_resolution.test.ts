import assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { integrationTest } from './harness.js';
import {
  closeAllEditors,
  openWorkspaceDocument,
  writeWorkspaceFile,
  removeWorkspacePath,
  delay
} from './helpers.js';

const TEMP_RESOLVE_PATH = 'documents/tmp-annotations/resolve.lex';
const TEMP_TOGGLE_PATH = 'documents/tmp-annotations/toggle.lex';
const RESOLVE_DOC = `1. Review\n\n    :: note ::\n        Pending\n    ::\n`;
const TOGGLE_DOC = `1. Review\n\n    :: note status=resolved ::\n        Pending\n    ::\n`;

integrationTest('resolves and toggles annotation state', async () => {
  await writeWorkspaceFile(TEMP_RESOLVE_PATH, RESOLVE_DOC);
  const resolveDocument = await openWorkspaceDocument(TEMP_RESOLVE_PATH);
  let editor = vscode.window.activeTextEditor;
  assert.ok(editor, 'Editor should be active for resolve command');

  await delay(200);
  await vscode.commands.executeCommand('lex.goToNextAnnotation');
  let headerPosition = editor.selection.active.with({
    character: editor.selection.active.character + 4
  });
  editor.selection = new vscode.Selection(headerPosition, headerPosition);
  await vscode.commands.executeCommand('lex.resolveAnnotation');
  await delay(200);
  const resolvedText = resolveDocument.getText();
  assert.ok(
    resolvedText.includes(':: note status=resolved ::'),
    'Annotation header should include status parameter after resolve'
  );

  await closeAllEditors();

  await writeWorkspaceFile(TEMP_TOGGLE_PATH, TOGGLE_DOC);
  const toggleDocument = await openWorkspaceDocument(TEMP_TOGGLE_PATH);
  editor = vscode.window.activeTextEditor;
  assert.ok(editor, 'Editor should be active for toggle command');

  await delay(200);
  await vscode.commands.executeCommand('lex.goToNextAnnotation');
  headerPosition = editor.selection.active.with({
    character: editor.selection.active.character + 4
  });
  editor.selection = new vscode.Selection(headerPosition, headerPosition);
  await vscode.commands.executeCommand('lex.toggleAnnotationResolution');
  await delay(200);
  const toggledText = toggleDocument.getText();
  assert.ok(
    !toggledText.includes('status=resolved'),
    'Toggle command should remove resolved status'
  );

  await closeAllEditors();
  await removeWorkspacePath('documents/tmp-annotations');
});
