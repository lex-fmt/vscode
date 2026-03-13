import assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { LexExtensionApi } from '../../src/main.js';
import { integrationTest } from '../integration/harness.js';
import {
  closeAllEditors,
  delay,
  openWorkspaceDocument,
  TEST_DOCUMENT_PATH,
  waitForExtensionActivation,
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

integrationTest('VSIX provides semantic tokens via LSP', async () => {
  const extension = vscode.extensions.getExtension<LexExtensionApi>(EXTENSION_ID);
  assert.ok(extension);

  const api = extension.isActive ? extension.exports : await extension.activate();
  assert.ok(api);
  await api.clientReady();

  const document = await openWorkspaceDocument(TEST_DOCUMENT_PATH);
  // Give LSP time to respond
  await delay(2000);

  const legend = await vscode.commands.executeCommand<vscode.SemanticTokensLegend>(
    'vscode.provideDocumentSemanticTokensLegend',
    document.uri
  );
  assert.ok(legend, 'VSIX should provide a semantic tokens legend');
  assert.ok(legend.tokenTypes.length > 0, 'Legend should have token types');

  const tokens = await vscode.commands.executeCommand<vscode.SemanticTokens>(
    'vscode.provideDocumentSemanticTokens',
    document.uri
  );
  assert.ok(tokens, 'VSIX should provide semantic tokens');
  assert.ok(tokens.data.length > 0, 'Should have token data');

  await closeAllEditors();
});

integrationTest('VSIX provides document symbols (outline)', async () => {
  const extension = vscode.extensions.getExtension<LexExtensionApi>(EXTENSION_ID);
  assert.ok(extension);

  const api = extension.isActive ? extension.exports : await extension.activate();
  assert.ok(api);
  await api.clientReady();

  const document = await openWorkspaceDocument(TEST_DOCUMENT_PATH);
  await delay(2000);

  const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
    'vscode.executeDocumentSymbolProvider',
    document.uri
  );
  assert.ok(symbols, 'VSIX should provide document symbols');
  assert.ok(symbols.length > 0, 'Should have at least one symbol for outline');

  // Keep VS Code open for manual inspection if LEX_VSIX_INSPECT is set
  const inspectMs = parseInt(process.env.LEX_VSIX_INSPECT ?? '0', 10);
  if (inspectMs > 0) {
    console.log(`Keeping VS Code open for ${inspectMs / 1000}s — inspect now...`);
    await delay(inspectMs);
  }

  await closeAllEditors();
});
