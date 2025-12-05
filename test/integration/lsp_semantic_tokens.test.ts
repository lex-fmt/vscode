import assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { LexExtensionApi } from '../../src/main.js';
import { integrationTest } from './harness.js';
import {
  closeAllEditors,
  openWorkspaceDocument,
  SEMANTIC_TOKENS_DOCUMENT_PATH
} from './helpers.js';

integrationTest('exposes semantic tokens and legend', async () => {
  const extension = vscode.extensions.getExtension<LexExtensionApi>('lex.lex-vscode');
  assert.ok(extension, 'Lex extension should be discoverable by VS Code');

  const api = await extension.activate();
  await api?.clientReady();

  const document = await openWorkspaceDocument(SEMANTIC_TOKENS_DOCUMENT_PATH);

  const legend = await vscode.commands.executeCommand<vscode.SemanticTokensLegend | undefined>(
    'vscode.provideDocumentSemanticTokensLegend',
    document.uri
  );
  if (!legend) {
    throw new Error('Semantic tokens legend should be available');
  }
  assert.ok(legend.tokenTypes.length > 0, 'Legend must list token types');

  const tokens = await vscode.commands.executeCommand<vscode.SemanticTokens | undefined>(
    'vscode.provideDocumentSemanticTokens',
    document.uri
  );
  if (!tokens) {
    throw new Error('Semantic tokens result should exist');
  }
  assert.ok(tokens.data.length > 0, 'Token data should be non-empty');
  assert.ok(tokens.data.every(value => Number.isInteger(value)), 'Token deltas must be integers');

  await closeAllEditors();
});
