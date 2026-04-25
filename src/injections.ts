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
type InjectionStatus = injections.InjectionStatus;
type ZoneDiagnostic = injections.ZoneDiagnostic;

export interface InjectionHighlighterApi {
  getInjectionZones(): InjectionZone[];
  getDecorationTypes(): ReadonlyMap<DecorationCategory, vscode.TextEditorDecorationType>;
  /**
   * Snapshot of the most recent refresh — populated even when highlighting
   * is disabled or no zones were found. Returns null only before the first
   * refresh has run.
   */
  getStatus(): InjectionStatus | null;
  refresh(): Promise<void>;
  dispose(): void;
}

export function createInjectionHighlighter(ts: LexTreeSitter): InjectionHighlighterApi {
  const decorationTypes = new Map<DecorationCategory, vscode.TextEditorDecorationType>();
  const disposables: vscode.Disposable[] = [];
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let currentZones: InjectionZone[] = [];
  let cachedLanguages: Set<string> | null = null;
  let lastStatus: InjectionStatus | null = null;

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
    _zoneIndex: number,
    content: string,
    langId: string
  ): Promise<injections.SemanticTokens | null> {
    // Create an in-memory `untitled:` document and let vscode pick it up
    // through the normal language-registration path. Many semantic-token
    // providers (Pylance, etc.) declare a `documentSelector` restricted to
    // common schemes — `file`, `untitled`, sometimes `vscode-notebook-cell`.
    // Custom schemes like `lex-embedded` get silently filtered, which is
    // what made every verbatim block render as plain text. `untitled:` is
    // close to universally accepted; if a provider needs `file:` we can
    // fall back to a temp file later.
    const doc = await vscode.workspace.openTextDocument({
      language: langId,
      content,
    });
    const uri = doc.uri;

    // Throw with descriptive messages so the per-zone diagnostic shows
    // exactly which stage failed in the dump output.
    const legend = await vscode.commands.executeCommand<vscode.SemanticTokensLegend>(
      'vscode.provideDocumentSemanticTokensLegend',
      uri
    );
    if (!legend) {
      throw new Error(
        `no semantic-tokens legend for ${langId} (scheme=${uri.scheme}); is a tokens provider registered for this scheme?`
      );
    }

    const tokens = await vscode.commands.executeCommand<vscode.SemanticTokens>(
      'vscode.provideDocumentSemanticTokens',
      uri
    );
    if (!tokens) {
      throw new Error(
        `no semantic tokens returned for ${langId} (scheme=${uri.scheme}); legend was present but provider produced none`
      );
    }

    return { legend, data: tokens.data };
  }

  const hostAdapter: injections.InjectionHostAdapter = {
    getRegisteredLanguages,
    getSemanticTokens: getSemanticTokensForZone,
  };

  function isEnabled(): boolean {
    return vscode.workspace.getConfiguration('lex').get<boolean>('injectionHighlighting', true);
  }

  function emptyStatus(
    enabled: boolean,
    documentUri: string | null,
    registeredCount: number
  ): InjectionStatus {
    const ranges = new Map<DecorationCategory, injections.InjectionRange[]>();
    for (const cat of Object.keys(injections.CATEGORY_COLORS) as DecorationCategory[]) {
      ranges.set(cat, []);
    }
    return {
      enabled,
      documentUri,
      timestamp: Date.now(),
      zoneCount: 0,
      zones: [],
      registeredLanguageCount: registeredCount,
      rangesByCategory: ranges,
    };
  }

  async function highlightEditor(editor: vscode.TextEditor): Promise<void> {
    const docUri = editor.document.uri.toString();
    if (!isEnabled() || editor.document.languageId !== 'lex') {
      clearDecorations(editor);
      currentZones = [];
      lastStatus = emptyStatus(isEnabled(), docUri, 0);
      return;
    }

    const text = editor.document.getText();
    const tree = ts.parse(text);
    const zones = ts.queryInjections(tree);
    tree.delete();

    currentZones = zones;

    // Resolve up front so diagnostics know each zone's resolved langId even
    // for zones that compute() will skip.
    const registered = await getRegisteredLanguages();
    const diagnostics: ZoneDiagnostic[] = zones.map((zone, i) => ({
      index: i,
      annotationLanguage: zone.language,
      resolvedLanguageId: injections.resolveLanguageId(zone.language, registered),
      range: {
        startLine: zone.startRow,
        startCol: zone.startCol,
        endLine: zone.endRow,
        endCol: zone.endCol,
      },
      contentLength: zone.text.length,
      requestedTokens: false,
      receivedTokens: false,
      tokenCount: 0,
    }));

    // Wrap the real host adapter so each call updates the corresponding
    // diagnostic record. We hand `compute()` a pre-resolved registered set
    // so its behaviour matches the diagnostics built above.
    const trackingAdapter: injections.InjectionHostAdapter = {
      getRegisteredLanguages: () => Promise.resolve(registered),
      getSemanticTokens: async (zoneIndex, content, langId) => {
        const diag = diagnostics[zoneIndex];
        diag.requestedTokens = true;
        try {
          const tokens = await hostAdapter.getSemanticTokens(zoneIndex, content, langId);
          diag.receivedTokens = !!tokens;
          diag.tokenCount = tokens ? Math.floor(tokens.data.length / 5) : 0;
          return tokens;
        } catch (e: unknown) {
          diag.error = e instanceof Error ? e.message : String(e);
          throw e;
        }
      },
    };

    const rangesByCategory = await injections.computeInjectionDecorations(zones, trackingAdapter);

    lastStatus = {
      enabled: true,
      documentUri: docUri,
      timestamp: Date.now(),
      zoneCount: zones.length,
      zones: diagnostics,
      registeredLanguageCount: registered.size,
      rangesByCategory,
    };

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
    getStatus: () => lastStatus,
    async refresh() {
      const editor = vscode.window.activeTextEditor;
      if (editor) await highlightEditor(editor);
    },
    dispose() {
      if (debounceTimer) clearTimeout(debounceTimer);
      for (const d of disposables) d.dispose();
      decorationTypes.clear();
    },
  };
}
