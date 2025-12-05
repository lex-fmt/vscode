import assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { LexExtensionApi } from '../../src/main.js';
import { integrationTest } from './harness.js';
import {
  closeAllEditors,
  openWorkspaceDocument,
  SEMANTIC_TOKENS_DOCUMENT_PATH
} from './helpers.js';

integrationTest('provides document links for URLs and verbatim sources', async () => {
  const extension = vscode.extensions.getExtension<LexExtensionApi>('lex.lex-vscode');
  assert.ok(extension, 'Lex extension should be discoverable by VS Code');

  const api = await extension.activate();
  await api?.clientReady();

  const document = await openWorkspaceDocument(SEMANTIC_TOKENS_DOCUMENT_PATH);
  const links = await vscode.commands.executeCommand<vscode.DocumentLink[] | undefined>(
    'vscode.executeLinkProvider',
    document.uri
  );

  if (!links || links.length === 0) {
    throw new Error('Document links request should return entries');
  }

  const targets = links.map(link => link.target?.toString()).filter(Boolean);
  assert.ok(targets.some(target => target?.includes('lexlang.org')), 'External URL should be linked');

  await closeAllEditors();
});
