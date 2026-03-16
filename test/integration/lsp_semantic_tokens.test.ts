import assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { LexExtensionApi } from '../../src/main.js';
import { integrationTest } from './harness.js';
import {
  closeAllEditors,
  openWorkspaceDocument,
  SEMANTIC_TOKENS_DOCUMENT_PATH,
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
  assert.ok(
    tokens.data.every((value) => Number.isInteger(value)),
    'Token deltas must be integers'
  );

  // Verify DocumentTitle and DocumentSubtitle are in the legend
  const titleIndex = legend.tokenTypes.indexOf('DocumentTitle');
  const subtitleIndex = legend.tokenTypes.indexOf('DocumentSubtitle');
  assert.ok(titleIndex >= 0, 'Legend must contain DocumentTitle');
  assert.ok(subtitleIndex >= 0, 'Legend must contain DocumentSubtitle');

  // Decode semantic tokens to find DocumentTitle and DocumentSubtitle
  // Token data is encoded as groups of 5 integers:
  //   [deltaLine, deltaStartChar, length, tokenType, tokenModifiers]
  const tokenTypes: number[] = [];
  for (let i = 0; i < tokens.data.length; i += 5) {
    tokenTypes.push(tokens.data[i + 3]);
  }

  assert.ok(
    tokenTypes.includes(titleIndex),
    `Semantic tokens must include DocumentTitle (index ${titleIndex}). ` +
      `Found types: [${[...new Set(tokenTypes)]
        .sort((a, b) => a - b)
        .map((i) => `${i}:${legend.tokenTypes[i]}`)
        .join(', ')}]`
  );
  assert.ok(
    tokenTypes.includes(subtitleIndex),
    `Semantic tokens must include DocumentSubtitle (index ${subtitleIndex}). ` +
      `Found types: [${[...new Set(tokenTypes)]
        .sort((a, b) => a - b)
        .map((i) => `${i}:${legend.tokenTypes[i]}`)
        .join(', ')}]`
  );

  // Verify the title token is on line 0 (first line of document)
  // First token's deltaLine is absolute (from line 0)
  let currentLine = 0;
  let foundTitleLine = -1;
  let foundSubtitleLine = -1;
  for (let i = 0; i < tokens.data.length; i += 5) {
    currentLine += tokens.data[i]; // deltaLine
    const tokenType = tokens.data[i + 3];
    if (tokenType === titleIndex && foundTitleLine === -1) {
      foundTitleLine = currentLine;
    }
    if (tokenType === subtitleIndex && foundSubtitleLine === -1) {
      foundSubtitleLine = currentLine;
    }
  }

  assert.equal(foundTitleLine, 0, 'DocumentTitle should be on line 0');
  assert.equal(foundSubtitleLine, 1, 'DocumentSubtitle should be on line 1');

  await closeAllEditors();
});
