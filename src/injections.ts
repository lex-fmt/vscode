/**
 * Injection Highlighter — Embedded Language Syntax Coloring (vscode adapter).
 *
 * The pure injection logic lives in `@lex/shared/injections`. This file is
 * the vscode host adapter:
 *
 *   - Owns tree-sitter parsing (`ts.parse` + `ts.queryInjections`) and the
 *     event hooks (`onDidChangeActiveTextEditor`, `onDidChangeTextDocument`,
 *     `onDidChangeConfiguration`, debounce).
 *   - Owns the virtual-document content provider used to back
 *     `vscode.provideDocumentSemanticTokens` calls.
 *   - Creates `TextEditorDecorationType` objects from the shared
 *     `CATEGORY_COLORS` / `CATEGORY_STYLES` constants.
 *   - Passes parsed zones to `injections.computeInjectionDecorations(...)`
 *     and converts the returned `InjectionRange[]` into `vscode.Range[]`
 *     for `editor.setDecorations`.
 *
 * If a language has no semantic token provider installed, that zone is
 * silently skipped — no fallback tokenization, no hardcoded grammars.
 */

import * as vscode from 'vscode';
import { injections } from '@lex/shared';
import type { LexTreeSitter } from './treesitter.js';

type DecorationCategory = injections.DecorationCategory;
type InjectionZone = injections.InjectionZone;

export interface InjectionHighlighterApi {
  getInjectionZones(): InjectionZone[];
  getDecorationTypes(): ReadonlyMap<DecorationCategory, vscode.TextEditorDecorationType>;
  refresh(): Promise<void>;
  dispose(): void;
}

export function createInjectionHighlighter(ts: LexTreeSitter): InjectionHighlighterApi {
  const decorationTypes = new Map<DecorationCategory, vscode.TextEditorDecorationType>();
  const disposables: vscode.Disposable[] = [];
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let currentZones: InjectionZone[] = [];
  let cachedLanguages: Set<string> | null = null;

  // Virtual document content provider
  const contentMap = new Map<string, string>();
  const changeEmitter = new vscode.EventEmitter<vscode.Uri>();

  const contentProvider = vscode.workspace.registerTextDocumentContentProvider(
    injections.VIRTUAL_DOC_SCHEME,
    {
      onDidChange: changeEmitter.event,
      provideTextDocumentContent(uri: vscode.Uri): string {
        return contentMap.get(uri.path) ?? '';
      },
    }
  );
  disposables.push(contentProvider, changeEmitter);

  // Track which virtual docs have had their language set
  const docLanguages = new Map<string, string>();

  // Create decoration types from the shared category/style constants
  for (const [category, colorId] of Object.entries(injections.CATEGORY_COLORS) as Array<
    [DecorationCategory, string]
  >) {
    const fontStyle = injections.CATEGORY_STYLES[category];
    const dt = vscode.window.createTextEditorDecorationType({
      color: new vscode.ThemeColor(colorId),
      ...(fontStyle ? { fontStyle } : {}),
    });
    decorationTypes.set(category, dt);
    disposables.push(dt);
  }

  async function getRegisteredLanguages(): Promise<Set<string>> {
    if (!cachedLanguages) {
      const langs = await vscode.languages.getLanguages();
      cachedLanguages = new Set(langs);
      // Invalidate cache after 30s so newly installed extensions are picked up
      setTimeout(() => {
        cachedLanguages = null;
      }, 30_000);
    }
    return cachedLanguages;
  }

  async function getSemanticTokensForZone(
    zoneIndex: number,
    content: string,
    langId: string
  ): Promise<injections.SemanticTokens | null> {
    const docPath = `/zone-${zoneIndex}`;

    // Update virtual document content
    contentMap.set(docPath, content);
    const uri = vscode.Uri.parse(`${injections.VIRTUAL_DOC_SCHEME}://${docPath}`);
    changeEmitter.fire(uri);

    // Open the document (no-op if already open)
    const doc = await vscode.workspace.openTextDocument(uri);

    // Set language if changed
    if (docLanguages.get(docPath) !== langId) {
      await vscode.languages.setTextDocumentLanguage(doc, langId);
      docLanguages.set(docPath, langId);
    }

    // Request semantic tokens from whatever provider handles this language
    const legend = await vscode.commands.executeCommand<vscode.SemanticTokensLegend>(
      'vscode.provideDocumentSemanticTokensLegend',
      uri
    );
    if (!legend) return null;

    const tokens = await vscode.commands.executeCommand<vscode.SemanticTokens>(
      'vscode.provideDocumentSemanticTokens',
      uri
    );
    if (!tokens) return null;

    return { legend, data: tokens.data };
  }

  const hostAdapter: injections.InjectionHostAdapter = {
    getRegisteredLanguages,
    getSemanticTokens: getSemanticTokensForZone,
  };

  function isEnabled(): boolean {
    return vscode.workspace.getConfiguration('lex').get<boolean>('injectionHighlighting', true);
  }

  async function highlightEditor(editor: vscode.TextEditor): Promise<void> {
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

    const rangesByCategory = await injections.computeInjectionDecorations(zones, hostAdapter);

    // Apply decorations (only if the editor is still active and showing the same doc)
    if (vscode.window.activeTextEditor === editor) {
      for (const [category, dt] of decorationTypes) {
        const ranges = rangesByCategory.get(category) ?? [];
        editor.setDecorations(
          dt,
          ranges.map(
            (r) =>
              new vscode.Range(
                new vscode.Position(r.startLine, r.startCol),
                new vscode.Position(r.endLine, r.endCol)
              )
          )
        );
      }
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
      if (editor) void highlightEditor(editor);
    }, injections.DEBOUNCE_MS);
  }

  // Listen for editor changes
  disposables.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) void highlightEditor(editor);
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
        if (editor) void highlightEditor(editor);
      }
    })
  );

  // Initial highlight
  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor) void highlightEditor(activeEditor);

  return {
    getInjectionZones: () => currentZones,
    getDecorationTypes: () => decorationTypes,
    async refresh() {
      const editor = vscode.window.activeTextEditor;
      if (editor) await highlightEditor(editor);
    },
    dispose() {
      if (debounceTimer) clearTimeout(debounceTimer);
      contentMap.clear();
      docLanguages.clear();
      for (const d of disposables) d.dispose();
      decorationTypes.clear();
    },
  };
}
