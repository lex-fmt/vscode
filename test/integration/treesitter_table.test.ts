import assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { LexExtensionApi } from '../../src/main.js';
import { integrationTest } from './harness.js';
import { closeAllEditors, openWorkspaceDocument } from './helpers.js';

const TABLE_DOCUMENT_PATH = 'documents/table-test.lex';

integrationTest('table blocks are not treated as injection zones', async () => {
  const extension = vscode.extensions.getExtension<LexExtensionApi>('lex.lex-vscode');
  assert.ok(extension, 'Lex extension should be discoverable');

  const api = await extension.activate();
  const ts = api.treeSitter();
  if (!ts) {
    console.log('  (skipped — tree-sitter not available)');
    return;
  }

  const document = await openWorkspaceDocument(TABLE_DOCUMENT_PATH);
  const tree = ts.parse(document.getText());
  const zones = ts.queryInjections(tree);

  // The fixture has table blocks (:: table ::) and a python block (:: python ::)
  // Only python should appear as an injection zone — table should be excluded
  const languages = zones.map((z) => z.language);
  assert.ok(languages.includes('python'), 'Should detect python injection');
  assert.ok(!languages.includes('table'), 'Table block should NOT be an injection zone');

  // Should have exactly 1 injection zone (python only)
  assert.equal(
    zones.length,
    1,
    `Expected 1 injection zone (python), got ${zones.length}: ${languages.join(', ')}`
  );

  tree.delete();
  await closeAllEditors();
});

integrationTest('table blocks parse as verbatim_block in tree-sitter', async () => {
  const extension = vscode.extensions.getExtension<LexExtensionApi>('lex.lex-vscode');
  assert.ok(extension, 'Lex extension should be discoverable');

  const api = await extension.activate();
  const ts = api.treeSitter();
  if (!ts) {
    console.log('  (skipped — tree-sitter not available)');
    return;
  }

  const document = await openWorkspaceDocument(TABLE_DOCUMENT_PATH);
  const tree = ts.parse(document.getText());
  const highlights = ts.queryHighlights(tree);

  // Table caption ("Results") should be highlighted as markup.heading
  const headingCaptures = highlights.filter((h) => h.name === 'markup.heading');
  const hasCaption = headingCaptures.some((h) => h.text.includes('Results'));
  assert.ok(hasCaption, 'Table caption should be captured as markup.heading');

  // Table closing annotation should be captured as keyword
  const keywordCaptures = highlights.filter((h) => h.name === 'keyword');
  const hasTableKeyword = keywordCaptures.some((h) => h.text.includes('table'));
  assert.ok(hasTableKeyword, 'Table closing annotation should be captured as keyword');

  tree.delete();
  await closeAllEditors();
});

integrationTest('tree-sitter parses pipe delimiters in table rows', async () => {
  const extension = vscode.extensions.getExtension<LexExtensionApi>('lex.lex-vscode');
  assert.ok(extension, 'Lex extension should be discoverable');

  const api = await extension.activate();
  const ts = api.treeSitter();
  if (!ts) {
    console.log('  (skipped — tree-sitter not available)');
    return;
  }

  const document = await openWorkspaceDocument(TABLE_DOCUMENT_PATH);
  const tree = ts.parse(document.getText());
  const highlights = ts.queryHighlights(tree);

  // Pipe delimiters should be captured as punctuation.delimiter
  const delimiterCaptures = highlights.filter((h) => h.name === 'punctuation.delimiter');
  const hasPipeDelimiter = delimiterCaptures.some((h) => h.text === '|');
  assert.ok(hasPipeDelimiter, 'Pipe delimiters should be captured as punctuation.delimiter');

  tree.delete();
  await closeAllEditors();
});
