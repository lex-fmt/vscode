import assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { LexExtensionApi } from '../../src/main.js';
import { integrationTest } from './harness.js';
import { closeAllEditors, openWorkspaceDocument, PARITY_DOCUMENT_PATH } from './helpers.js';

/**
 * Strict mapping from tree-sitter highlight captures to LSP semantic token types.
 *
 * Each tree-sitter capture must correspond to the correct LSP concept:
 * - markup.heading → session titles only (SessionTitleText)
 * - variable.other.definition → definition subjects (DefinitionSubject)
 * - markup.list → list items only, not session titles (ListMarker/ListItemText)
 * - reference → all reference types (tree-sitter can't classify subtypes yet, see #409)
 */
const TS_TO_LSP: Record<string, string[]> = {
  'markup.heading': ['SessionTitleText', 'SessionMarker', 'DocumentTitle'],
  'markup.heading.subtitle': ['DocumentSubtitle'],
  'variable.other.definition': ['DefinitionSubject'],
  'markup.raw.block': ['VerbatimSubject'],
  'markup.bold': ['InlineStrong'],
  'markup.italic': ['InlineEmphasis'],
  'markup.raw.inline': ['InlineCode'],
  'markup.math': ['InlineMath'],
  'markup.link': ['Reference', 'ReferenceCitation', 'ReferenceFootnote'],
  'markup.list': ['ListMarker', 'ListItemText'],
  'punctuation.special': ['AnnotationLabel'],
  comment: ['AnnotationLabel', 'AnnotationParameter', 'AnnotationContent'],
  'markup.raw': ['VerbatimContent'],
  'string.escape': [], // no direct LSP equivalent, skip
};

interface DecodedToken {
  line: number;
  startChar: number;
  length: number;
  type: string;
}

function decodeSemanticTokens(
  data: Uint32Array,
  legend: vscode.SemanticTokensLegend
): DecodedToken[] {
  const tokens: DecodedToken[] = [];
  let line = 0;
  let startChar = 0;

  for (let i = 0; i < data.length; i += 5) {
    const deltaLine = data[i];
    const deltaStart = data[i + 1];
    const length = data[i + 2];
    const typeIndex = data[i + 3];

    if (deltaLine > 0) {
      line += deltaLine;
      startChar = deltaStart;
    } else {
      startChar += deltaStart;
    }

    tokens.push({
      line,
      startChar,
      length,
      type: legend.tokenTypes[typeIndex] ?? `unknown(${typeIndex})`,
    });
  }

  return tokens;
}

function rangesOverlap(
  tsStartRow: number,
  tsStartCol: number,
  tsEndRow: number,
  tsEndCol: number,
  lspLine: number,
  lspStartChar: number,
  lspLength: number
): boolean {
  // LSP tokens are single-line
  if (tsStartRow > lspLine || tsEndRow < lspLine) return false;

  const lspEnd = lspStartChar + lspLength;

  // If tree-sitter spans multiple lines, any column on the matching line overlaps
  if (tsStartRow < lspLine && tsEndRow > lspLine) return true;
  if (tsStartRow < lspLine) return tsEndCol > lspStartChar || tsEndRow > lspLine;
  if (tsEndRow > lspLine) return tsStartCol < lspEnd;

  // Same line: check column overlap
  return tsStartCol < lspEnd && tsEndCol > lspStartChar;
}

integrationTest('tree-sitter parses without ERROR nodes', async () => {
  const extension = vscode.extensions.getExtension<LexExtensionApi>('lex.lex-vscode');
  assert.ok(extension, 'Lex extension should be discoverable');

  const api = await extension.activate();
  const ts = api.treeSitter();
  if (!ts) {
    console.log('  (skipped — tree-sitter not available)');
    return;
  }

  const document = await openWorkspaceDocument(PARITY_DOCUMENT_PATH);
  const tree = ts.parse(document.getText());

  // Walk tree looking for ERROR nodes
  const errors: string[] = [];
  function walkForErrors(node: {
    type: string;
    startPosition: { row: number; column: number };
    children: unknown[];
  }) {
    if (node.type === 'ERROR') {
      errors.push(`ERROR at line ${node.startPosition.row + 1}, col ${node.startPosition.column}`);
    }
    for (const child of node.children as (typeof node)[]) {
      walkForErrors(child);
    }
  }
  walkForErrors(tree.rootNode as unknown as Parameters<typeof walkForErrors>[0]);

  assert.equal(errors.length, 0, `Tree-sitter produced ERROR nodes:\n  ${errors.join('\n  ')}`);

  tree.delete();
  await closeAllEditors();
});

integrationTest('tree-sitter highlights match LSP semantic tokens', async () => {
  const extension = vscode.extensions.getExtension<LexExtensionApi>('lex.lex-vscode');
  assert.ok(extension, 'Lex extension should be discoverable');

  const api = await extension.activate();
  await api.clientReady();

  const ts = api.treeSitter();
  if (!ts) {
    console.log('  (skipped — tree-sitter not available)');
    return;
  }

  const document = await openWorkspaceDocument(PARITY_DOCUMENT_PATH);

  // Parse with tree-sitter
  const tree = ts.parse(document.getText());
  const captures = ts.queryHighlights(tree);

  // Get LSP semantic tokens
  const legend = await vscode.commands.executeCommand<vscode.SemanticTokensLegend | undefined>(
    'vscode.provideDocumentSemanticTokensLegend',
    document.uri
  );
  assert.ok(legend, 'Semantic tokens legend should be available');

  const tokens = await vscode.commands.executeCommand<vscode.SemanticTokens | undefined>(
    'vscode.provideDocumentSemanticTokens',
    document.uri
  );
  assert.ok(tokens, 'Semantic tokens should exist');

  const lspTokens = decodeSemanticTokens(tokens.data, legend);

  // Debug: show LSP tokens for lines where we expect mismatches
  const lspByLine = new Map<number, DecodedToken[]>();
  for (const tok of lspTokens) {
    const arr = lspByLine.get(tok.line) ?? [];
    arr.push(tok);
    lspByLine.set(tok.line, arr);
  }

  // For each tree-sitter capture with a mapping, verify LSP has a matching token
  let verified = 0;
  let skipped = 0;
  const mismatches: string[] = [];

  for (const capture of captures) {
    const lspTypes = TS_TO_LSP[capture.name];
    if (!lspTypes || lspTypes.length === 0) {
      skipped++;
      continue;
    }

    const hasMatch = lspTokens.some(
      (tok) =>
        lspTypes.includes(tok.type) &&
        rangesOverlap(
          capture.startRow,
          capture.startCol,
          capture.endRow,
          capture.endCol,
          tok.line,
          tok.startChar,
          tok.length
        )
    );

    if (hasMatch) {
      verified++;
    } else {
      const lineToks = lspByLine.get(capture.startRow) ?? [];
      const tokSummary = lineToks.map((t) => `${t.type}@${t.startChar}+${t.length}`).join(', ');
      mismatches.push(
        `TS "${capture.name}" at ${capture.startRow + 1}:${capture.startCol} ("${capture.text.slice(0, 40)}") — want [${lspTypes.join(', ')}], LSP has: [${tokSummary || 'none'}]`
      );
    }
  }

  console.log(
    `  tree-sitter parity: ${verified} verified, ${skipped} skipped, ${mismatches.length} mismatches`
  );

  // Allow some mismatches (granularity differences) but flag if too many
  const mismatchRate = mismatches.length / (verified + mismatches.length);
  if (mismatches.length > 0) {
    console.log(`  Mismatches:\n    ${mismatches.join('\n    ')}`);
  }

  // Structural agreement should be high — fail if >20% mismatch
  assert.ok(
    mismatchRate < 0.2,
    `Tree-sitter/LSP parity too low: ${verified} matches, ${mismatches.length} mismatches (${(mismatchRate * 100).toFixed(1)}%)`
  );
  assert.ok(verified > 0, 'Should have at least some verified captures');

  tree.delete();
  await closeAllEditors();
});
