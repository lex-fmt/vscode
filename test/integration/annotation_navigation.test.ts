import assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { integrationTest } from './harness.js';
import {
  closeAllEditors,
  openWorkspaceDocument,
  writeWorkspaceFile,
  removeWorkspacePath
} from './helpers.js';

const TEMP_ANNOTATION_PATH = 'documents/tmp-annotations/nav.lex';
const ANNOTATION_DOC = `# Annotation Navigation\n\n:: note ::\n    First\n::\n\n:: note ::\n    Second\n::\n`;

integrationTest('navigates between annotations using commands', async () => {
  await writeWorkspaceFile(TEMP_ANNOTATION_PATH, ANNOTATION_DOC);
  await openWorkspaceDocument(TEMP_ANNOTATION_PATH);
  const editor = vscode.window.activeTextEditor;
  assert.ok(editor, 'Editor should be active');

  editor.selection = new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0));
  await vscode.commands.executeCommand('lex.goToNextAnnotation');
  assert.equal(editor.selection.active.line, 2, 'First annotation should be at line 2');

  await vscode.commands.executeCommand('lex.goToNextAnnotation');
  assert.equal(editor.selection.active.line, 6, 'Second annotation should be at line 6');

  await vscode.commands.executeCommand('lex.goToPreviousAnnotation');
  assert.equal(editor.selection.active.line, 2, 'Previous annotation should wrap to line 2');

  await closeAllEditors();
  await removeWorkspacePath('documents/tmp-annotations');
});
