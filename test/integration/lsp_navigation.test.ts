import assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { LexExtensionApi } from '../../src/main.js';
import { integrationTest } from './harness.js';
import {
  closeAllEditors,
  findPosition,
  openWorkspaceDocument,
  NAVIGATION_DOCUMENT_PATH
} from './helpers.js';

integrationTest('supports go-to-definition for references', async () => {
  const extension = vscode.extensions.getExtension<LexExtensionApi>('lex.lex-vscode');
  assert.ok(extension, 'Lex extension should be discoverable by VS Code');

  const api = await extension.activate();
  await api?.clientReady();

  const document = await openWorkspaceDocument(NAVIGATION_DOCUMENT_PATH);
  const positionInfo = findPosition(document, 'Cache]');
  assert.ok(positionInfo, 'Reference text should exist in document');

  const definitionLocations = await vscode.commands.executeCommand<
    readonly vscode.Location[] | undefined
  >('vscode.executeDefinitionProvider', document.uri, new vscode.Position(positionInfo.line, positionInfo.character));

  assert.ok(definitionLocations && definitionLocations.length > 0, 'Definition provider should return at least one result');
  const [definition] = definitionLocations;
  const definitionText = document.getText(definition.range);
  assert.ok(definitionText.includes('Cache'), 'Definition result should contain Cache entry');

  await closeAllEditors();
});

integrationTest('lists references for a definition', async () => {
  const extension = vscode.extensions.getExtension<LexExtensionApi>('lex.lex-vscode');
  assert.ok(extension, 'Lex extension should be discoverable by VS Code');

  const api = await extension.activate();
  await api?.clientReady();

  const document = await openWorkspaceDocument(NAVIGATION_DOCUMENT_PATH);
  const definitionInfo = findPosition(document, 'Cache:\n');
  assert.ok(definitionInfo, 'Definition section should be present');

  const references = await vscode.commands.executeCommand<
    readonly vscode.Location[] | undefined
  >('vscode.executeReferenceProvider', document.uri, new vscode.Position(definitionInfo.line, definitionInfo.character));

  assert.ok(references && references.length >= 1, 'Reference provider should return usages');

  await closeAllEditors();
});
