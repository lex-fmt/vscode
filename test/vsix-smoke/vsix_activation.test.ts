import assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { LexExtensionApi } from '../../src/main.js';
import { integrationTest } from '../integration/harness.js';
import {
  closeAllEditors,
  openWorkspaceDocument,
  TEST_DOCUMENT_PATH,
  waitForExtensionActivation
} from '../integration/helpers.js';

const EXTENSION_ID = 'lex.lex-vscode';

integrationTest('activates VSIX-installed extension when opening a Lex document', async () => {
  const extension = vscode.extensions.getExtension<LexExtensionApi>(EXTENSION_ID);
  assert.ok(extension, 'VSIX-installed extension should be discoverable');
  assert.equal(extension.isActive, false, 'Extension should be idle before opening Lex documents');

  const document = await openWorkspaceDocument(TEST_DOCUMENT_PATH);
  assert.equal(document.languageId, 'lex', 'Lex documents should retain lex language id');

  const activated = await waitForExtensionActivation<LexExtensionApi>(EXTENSION_ID, 15000);
  await activated.exports?.clientReady();
  assert.equal(activated.isActive, true, 'Extension should activate after Lex document opens');

  await closeAllEditors();
});
