import assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { LexExtensionApi } from '../../src/main.js';
import { integrationTest } from './harness.js';
import {
  closeAllEditors,
  openWorkspaceDocument,
  SEMANTIC_TOKENS_DOCUMENT_PATH
} from './helpers.js';

integrationTest('provides folding ranges for sessions, lists, and verbatim blocks', async () => {
  const extension = vscode.extensions.getExtension<LexExtensionApi>('lex.lex-vscode');
  assert.ok(extension, 'Lex extension should be discoverable by VS Code');

  const api = await extension.activate();
  await api?.clientReady();

  const document = await openWorkspaceDocument(SEMANTIC_TOKENS_DOCUMENT_PATH);

  const ranges = await vscode.commands.executeCommand<vscode.FoldingRange[] | undefined>(
    'vscode.executeFoldingRangeProvider',
    document.uri
  );
  if (!ranges || ranges.length === 0) {
    throw new Error('Folding range request should return entries');
  }

  const spans = ranges.map(range => ({ start: range.start, end: range.end }));

  // Verify we have meaningful folding ranges (multi-line spans)
  const meaningfulFolds = spans.filter(span => span.end > span.start + 1);
  assert.ok(meaningfulFolds.length >= 3, 'Document should have at least 3 multi-line folding ranges');

  // Verify we have a range early in the document (session fold)
  const earlyFold = spans.some(span => span.start <= 10 && span.end > span.start + 2);
  assert.ok(earlyFold, 'Sessions should produce folding ranges');

  // Verify we have ranges spanning significant portions of the document
  const largeFold = spans.some(span => span.end - span.start >= 5);
  assert.ok(largeFold, 'At least one folding range should span 5+ lines');

  await closeAllEditors();
});
