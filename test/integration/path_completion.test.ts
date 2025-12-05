import assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { LexExtensionApi } from '../../src/main.js';
import { integrationTest } from './harness.js';
import {
  closeAllEditors,
  openWorkspaceDocument,
  TEST_DOCUMENT_PATH
} from './helpers.js';

integrationTest('provides path completion items when typing @', async () => {
  const document = await openWorkspaceDocument(TEST_DOCUMENT_PATH);
  const editor = vscode.window.activeTextEditor;
  assert.ok(editor, 'Editor should be active');

  // Wait for LSP to be ready
  const extension = vscode.extensions.getExtension<LexExtensionApi>('lex.lex-vscode');
  assert.ok(extension, 'Lex extension should be registered');
  const api = extension.isActive ? extension.exports : await extension.activate();
  await api.clientReady();

  // Move to end of document and insert @ to trigger completion
  const lastLine = document.lineCount - 1;
  const lastChar = document.lineAt(lastLine).text.length;
  const endPosition = new vscode.Position(lastLine, lastChar);

  await editor.edit(editBuilder => {
    editBuilder.insert(endPosition, '\n@');
  });

  // Position cursor after the @
  const newPosition = new vscode.Position(lastLine + 1, 1);
  editor.selection = new vscode.Selection(newPosition, newPosition);

  // Trigger completion via LSP (@ is a registered trigger character)
  const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
    'vscode.executeCompletionItemProvider',
    document.uri,
    newPosition,
    '@'
  );

  assert.ok(completions, 'Completions should be returned');
  assert.ok(completions.items.length > 0, 'Should return at least one completion item');

  // Verify we get file completions from the LSP
  const fileItems = completions.items.filter(
    item => item.kind === vscode.CompletionItemKind.File
  );
  assert.ok(fileItems.length > 0, 'Should include file completions from LSP');

  // Check that workspace files appear in completions
  const labels = completions.items.map(item =>
    typeof item.label === 'string' ? item.label : item.label.label
  );
  const hasLexFile = labels.some(label => label.endsWith('.lex') || label.endsWith('.md'));
  assert.ok(hasLexFile, 'Should include .lex or .md files from the workspace');

  await closeAllEditors();
});

integrationTest('@ trigger returns only file completions from LSP', async () => {
  const document = await openWorkspaceDocument(TEST_DOCUMENT_PATH);
  const editor = vscode.window.activeTextEditor;
  assert.ok(editor, 'Editor should be active');

  // Wait for LSP to be ready
  const extension = vscode.extensions.getExtension<LexExtensionApi>('lex.lex-vscode');
  assert.ok(extension, 'Lex extension should be registered');
  const api = extension.isActive ? extension.exports : await extension.activate();
  await api.clientReady();

  const lastLine = document.lineCount - 1;
  const lastChar = document.lineAt(lastLine).text.length;
  const endPosition = new vscode.Position(lastLine, lastChar);

  await editor.edit(editBuilder => {
    editBuilder.insert(endPosition, '\n@');
  });

  const newPosition = new vscode.Position(lastLine + 1, 1);

  const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
    'vscode.executeCompletionItemProvider',
    document.uri,
    newPosition,
    '@'
  );

  assert.ok(completions, 'Completions should be returned');

  // All items should be File kind when triggered by @
  for (const item of completions.items) {
    assert.equal(
      item.kind,
      vscode.CompletionItemKind.File,
      `All @ completions should be File kind, got ${item.kind} for "${typeof item.label === 'string' ? item.label : item.label.label}"`
    );
  }

  await closeAllEditors();
});

integrationTest('path completion diagnostics indicates LSP handling', async () => {
  const extension = vscode.extensions.getExtension<LexExtensionApi>('lex.lex-vscode');
  assert.ok(extension, 'Lex extension should be registered');
  const api = extension.isActive ? extension.exports : await extension.activate();

  const diags = api.pathCompletionDiagnostics();
  assert.equal(diags.lspHandlesPathCompletion, true, 'Should indicate LSP handles path completion');
});
