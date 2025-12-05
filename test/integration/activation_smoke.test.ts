import assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { LexExtensionApi } from '../../src/main.js';
import { integrationTest } from './harness.js';
import {
  closeAllEditors,
  openWorkspaceDocument,
  TEST_DOCUMENT_PATH
} from './helpers.js';

integrationTest('activates extension and tags Lex documents', async () => {
  const extensionId = 'lex.lex-vscode';
  const extension = vscode.extensions.getExtension<LexExtensionApi>(extensionId);
  assert.ok(extension, `Extension ${extensionId} should be available`);

  const api = await extension.activate();
  await api?.clientReady();
  assert.equal(extension.isActive, true, 'Extension should activate without errors');

  const document = await openWorkspaceDocument(TEST_DOCUMENT_PATH);
  assert.equal(document.languageId, 'lex', 'Lex documents must use the lex language id');

  await closeAllEditors();
});
