import assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { LexExtensionApi } from '../../src/main.js';
import { integrationTest } from './harness.js';
import {
  closeAllEditors,
  findPosition,
  openWorkspaceDocument,
  HOVER_DOCUMENT_PATH
} from './helpers.js';

interface HoverExpectation {
  search: string;
  description: string;
}

const EXPECTATIONS: HoverExpectation[] = [
  { search: '^footnote', description: 'footnote reference hover' },
  { search: '@citation', description: 'citation hover' },
  { search: 'Cache]', description: 'definition / reference hover' }
];

integrationTest('provides hover content for references and annotations', async () => {
  const extension = vscode.extensions.getExtension<LexExtensionApi>('lex.lex-vscode');
  assert.ok(extension, 'Lex extension should be discoverable by VS Code');

  const api = await extension.activate();
  await api?.clientReady();

  const document = await openWorkspaceDocument(HOVER_DOCUMENT_PATH);

  for (const expectation of EXPECTATIONS) {
    const positionInfo = findPosition(document, expectation.search);
    assert.ok(positionInfo, `Could not locate text for ${expectation.description}`);

    const position = new vscode.Position(positionInfo.line, positionInfo.character);
    const hoverResults = await vscode.commands.executeCommand<
      vscode.Hover[] | undefined
    >(
      'vscode.executeHoverProvider',
      document.uri,
      position
    );

    assert.ok(hoverResults && hoverResults.length > 0, `Hover result missing for ${expectation.description}`);
    const contents = hoverResults
      .flatMap(result => result.contents)
      .map(item => {
        if (typeof item === 'string') {
          return item;
        }

        if ('value' in item) {
          return item.value;
        }

        return '';
      });
    assert.ok(
      contents.some(value => value.trim().length > 0),
      `Hover content should not be empty for ${expectation.description}`
    );
  }

  await closeAllEditors();
});
