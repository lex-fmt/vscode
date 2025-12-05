import assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { LexExtensionApi } from '../../src/main.js';
import { integrationTest } from './harness.js';
import {
  closeAllEditors,
  openWorkspaceDocument,
  TEST_DOCUMENT_PATH
} from './helpers.js';

integrationTest('establishes lex-lsp handshake', async () => {
  const extension = vscode.extensions.getExtension<LexExtensionApi>('lex.lex-vscode');
  assert.ok(extension, 'Lex extension should be discoverable by VS Code');

  const api = await extension.activate();
  await api?.clientReady();

  const document = await openWorkspaceDocument(TEST_DOCUMENT_PATH);
  const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[] | undefined>(
    'vscode.executeDocumentSymbolProvider',
    document.uri
  );

  assert.ok(Array.isArray(symbols), 'Document symbol request should return an array');
  await closeAllEditors();
});
