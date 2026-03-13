/**
 * Injection Highlighter — Embedded Language Syntax Coloring
 *
 * Uses tree-sitter to find verbatim blocks with language annotations
 * (e.g., `:: python ::`) and applies syntax highlighting decorations
 * for the embedded code. This gives full-color highlighting inside
 * verbatim blocks, contrasting with the monochrome Lex theme.
 *
 * Architecture:
 *   1. tree-sitter parses the Lex document and runs injections.scm
 *   2. For each injection zone, the regex tokenizer produces token spans
 *   3. Token spans are mapped to VS Code TextEditorDecorationType instances
 *   4. Decorations are applied to the editor, overriding the monochrome
 *      VerbatimContent semantic tokens from the LSP
 *
 * Decorations use extension-contributed color IDs (lex.injection.*) that
 * respect the user's VS Code theme and can be customized.
 */

import * as vscode from 'vscode';
import type { LexTreeSitter, InjectionZone } from './treesitter.js';
import { tokenizeEmbedded, type TokenType } from './tokenizers.js';

const DEBOUNCE_MS = 150;

const TOKEN_COLOR_IDS: Record<TokenType, string> = {
  keyword: 'lex.injection.keyword',
  string: 'lex.injection.string',
  comment: 'lex.injection.comment',
  number: 'lex.injection.number',
  type: 'lex.injection.type',
  function: 'lex.injection.function',
  constant: 'lex.injection.constant',
  operator: 'lex.injection.operator',
  punctuation: 'lex.injection.punctuation',
};

const TOKEN_FONT_STYLES: Partial<Record<TokenType, string>> = {
  comment: 'italic',
  keyword: 'bold',
};

export interface InjectionHighlighterApi {
  /** Get current injection zones for testing */
  getInjectionZones(): InjectionZone[];
  /** Get decoration types for testing */
  getDecorationTypes(): ReadonlyMap<TokenType, vscode.TextEditorDecorationType>;
  /** Force a re-highlight of the active editor */
  refresh(): void;
  dispose(): void;
}

export function createInjectionHighlighter(ts: LexTreeSitter): InjectionHighlighterApi {
  const decorationTypes = new Map<TokenType, vscode.TextEditorDecorationType>();
  const disposables: vscode.Disposable[] = [];
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let currentZones: InjectionZone[] = [];

  // Create decoration types for each token category
  for (const [tokenType, colorId] of Object.entries(TOKEN_COLOR_IDS)) {
    const fontStyle = TOKEN_FONT_STYLES[tokenType as TokenType];
    const options: vscode.DecorationRenderOptions = {
      color: new vscode.ThemeColor(colorId),
      ...(fontStyle ? { fontStyle } : {}),
    };
    const dt = vscode.window.createTextEditorDecorationType(options);
    decorationTypes.set(tokenType as TokenType, dt);
    disposables.push(dt);
  }

  function isEnabled(): boolean {
    return vscode.workspace.getConfiguration('lex').get<boolean>('injectionHighlighting', true);
  }

  function highlightEditor(editor: vscode.TextEditor): void {
    if (!isEnabled() || editor.document.languageId !== 'lex') {
      clearDecorations(editor);
      currentZones = [];
      return;
    }

    const text = editor.document.getText();
    const tree = ts.parse(text);
    const zones = ts.queryInjections(tree);
    tree.delete();

    currentZones = zones;

    // Build decoration ranges per token type
    const rangesByType = new Map<TokenType, vscode.Range[]>();
    for (const dt of decorationTypes.keys()) {
      rangesByType.set(dt, []);
    }

    for (const zone of zones) {
      const tokens = tokenizeEmbedded(zone.text, zone.language);

      for (const token of tokens) {
        const ranges = rangesByType.get(token.type);
        if (!ranges) continue;

        // Convert token offset (within zone.text) to document position.
        // zone.text is the verbatim content, zone.startRow/startCol is its
        // position in the document. We need to map the flat offset to line/col.
        const pos = offsetToPosition(zone.text, token.start, zone.startRow, zone.startCol);
        if (!pos) continue;

        const endPos = offsetToPosition(
          zone.text,
          token.start + token.length,
          zone.startRow,
          zone.startCol
        );
        if (!endPos) continue;

        ranges.push(
          new vscode.Range(
            new vscode.Position(pos.line, pos.col),
            new vscode.Position(endPos.line, endPos.col)
          )
        );
      }
    }

    // Apply decorations
    for (const [tokenType, dt] of decorationTypes) {
      const ranges = rangesByType.get(tokenType) ?? [];
      editor.setDecorations(dt, ranges);
    }
  }

  function clearDecorations(editor: vscode.TextEditor): void {
    for (const dt of decorationTypes.values()) {
      editor.setDecorations(dt, []);
    }
  }

  function debouncedHighlight(): void {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const editor = vscode.window.activeTextEditor;
      if (editor) highlightEditor(editor);
    }, DEBOUNCE_MS);
  }

  // Listen for editor changes
  disposables.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) highlightEditor(editor);
    })
  );

  disposables.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      const editor = vscode.window.activeTextEditor;
      if (editor && e.document === editor.document) {
        debouncedHighlight();
      }
    })
  );

  disposables.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('lex.injectionHighlighting')) {
        const editor = vscode.window.activeTextEditor;
        if (editor) highlightEditor(editor);
      }
    })
  );

  // Initial highlight
  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor) highlightEditor(activeEditor);

  return {
    getInjectionZones: () => currentZones,
    getDecorationTypes: () => decorationTypes,
    refresh() {
      const editor = vscode.window.activeTextEditor;
      if (editor) highlightEditor(editor);
    },
    dispose() {
      if (debounceTimer) clearTimeout(debounceTimer);
      for (const d of disposables) d.dispose();
      decorationTypes.clear();
    },
  };
}

/**
 * Convert a flat character offset within `text` to a document line/col,
 * given that `text` starts at (baseRow, baseCol) in the document.
 */
function offsetToPosition(
  text: string,
  offset: number,
  baseRow: number,
  baseCol: number
): { line: number; col: number } | null {
  if (offset < 0 || offset > text.length) return null;

  let line = 0;
  let col = 0;

  for (let i = 0; i < offset; i++) {
    if (text[i] === '\n') {
      line++;
      col = 0;
    } else {
      col++;
    }
  }

  // First line starts at baseCol, subsequent lines start at column 0
  // (tree-sitter reports startCol as the column of the first character)
  if (line === 0) {
    return { line: baseRow, col: baseCol + col };
  }
  return { line: baseRow + line, col };
}
