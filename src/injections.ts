/**
 * Injection Highlighter — Embedded Language Syntax Coloring (vscode adapter).
 *
 * The pure injection logic lives in `@lex/shared/injections`. This file is
 * the vscode host adapter:
 *
 *   - Owns tree-sitter parsing of the *outer* lex document
 *     (`ts.parse` + `ts.queryInjections`) and the editor event hooks
 *     (`onDidChangeActiveTextEditor`, `onDidChangeTextDocument`,
 *     `onDidChangeConfiguration`, debounce).
 *   - Delegates *inner* tokenization of each zone to a tree-sitter
 *     embedded-language tokenizer (`createEmbeddedTokenizer`) loaded
 *     from `resources/embedded-grammars/`. We previously sent zones
 *     through `vscode.provideDocumentSemanticTokens`, but VS Code's
 *     semantic-tokens API only exposes the LSP layer (function vs
 *     variable disambiguation) — keywords, strings, and comments live
 *     in the TextMate layer that we don't have for `.lex` files.
 *     Tree-sitter's `highlights.scm` for each language gives us the
 *     full set in a single pass.
 *   - Creates `TextEditorDecorationType` objects from the shared
 *     `CATEGORY_COLORS` / `CATEGORY_STYLES` constants.
 *   - Passes parsed zones to `injections.computeInjectionDecorations(...)`
 *     and converts the returned `InjectionRange[]` into `vscode.Range[]`
 *     for `editor.setDecorations`.
 */

import * as vscode from 'vscode'
import { injections } from '@lex/shared'
import type { LexTreeSitter } from './treesitter.js'
import type { EmbeddedTokenizer } from './embedded.js'

type DecorationCategory = injections.DecorationCategory
type InjectionZone = injections.InjectionZone
type InjectionStatus = injections.InjectionStatus
type ZoneDiagnostic = injections.ZoneDiagnostic

export interface InjectionHighlighterApi {
  getInjectionZones(): InjectionZone[]
  getDecorationTypes(): ReadonlyMap<DecorationCategory, vscode.TextEditorDecorationType>
  /**
   * Snapshot of the most recent refresh — populated even when highlighting
   * is disabled or no zones were found. Returns null only before the first
   * refresh has run.
   */
  getStatus(): InjectionStatus | null
  refresh(): Promise<void>
  dispose(): void
}

export function createInjectionHighlighter(
  ts: LexTreeSitter,
  tokenizer: EmbeddedTokenizer
): InjectionHighlighterApi {
  const decorationTypes = new Map<DecorationCategory, vscode.TextEditorDecorationType>()
  const disposables: vscode.Disposable[] = []
  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  let currentZones: InjectionZone[] = []
  let lastStatus: InjectionStatus | null = null

  // Create decoration types from the shared category/style constants
  for (const [category, colorId] of Object.entries(injections.CATEGORY_COLORS) as Array<
    [DecorationCategory, string]
  >) {
    const fontStyle = injections.CATEGORY_STYLES[category]
    const dt = vscode.window.createTextEditorDecorationType({
      color: new vscode.ThemeColor(colorId),
      ...(fontStyle ? { fontStyle } : {})
    })
    decorationTypes.set(category, dt)
    disposables.push(dt)
  }

  function isEnabled(): boolean {
    return vscode.workspace.getConfiguration('lex').get<boolean>('injectionHighlighting', true)
  }

  function emptyStatus(
    enabled: boolean,
    documentUri: string | null,
    registeredCount: number
  ): InjectionStatus {
    const ranges = new Map<DecorationCategory, injections.InjectionRange[]>()
    for (const cat of Object.keys(injections.CATEGORY_COLORS) as DecorationCategory[]) {
      ranges.set(cat, [])
    }
    return {
      enabled,
      documentUri,
      timestamp: Date.now(),
      zoneCount: 0,
      zones: [],
      registeredLanguageCount: registeredCount,
      rangesByCategory: ranges
    }
  }

  function histogramTokenNames(
    tokens: readonly injections.EmbeddedToken[]
  ): Record<string, number> {
    const histogram: Record<string, number> = {}
    for (const t of tokens) {
      histogram[t.name] = (histogram[t.name] ?? 0) + 1
    }
    return histogram
  }

  async function highlightEditor(editor: vscode.TextEditor): Promise<void> {
    const docUri = editor.document.uri.toString()
    if (!isEnabled() || editor.document.languageId !== 'lex') {
      clearDecorations(editor)
      currentZones = []
      lastStatus = emptyStatus(isEnabled(), docUri, 0)
      return
    }

    const text = editor.document.getText()
    const tree = ts.parse(text)
    const zones = ts.queryInjections(tree)
    tree.delete()

    currentZones = zones

    const registered = tokenizer.availableLanguages()
    const diagnostics: ZoneDiagnostic[] = zones.map((zone, i) => ({
      index: i,
      annotationLanguage: zone.language,
      resolvedLanguageId: injections.resolveLanguageId(zone.language, registered),
      range: {
        startLine: zone.startRow,
        startCol: zone.startCol,
        endLine: zone.endRow,
        endCol: zone.endCol
      },
      contentLength: zone.text.length,
      requestedTokens: false,
      receivedTokens: false,
      tokenCount: 0
    }))

    // Tracking adapter: forward to the embedded tokenizer and mirror
    // each call's outcome into the corresponding ZoneDiagnostic so
    // `Lex: Dump Injection Status` can report what happened.
    const trackingAdapter: injections.InjectionHostAdapter = {
      getRegisteredLanguages: () => Promise.resolve(registered),
      tokenNameToCategory: injections.TREE_SITTER_HIGHLIGHT_MAP,
      getTokens: async (zoneIndex, content, langId) => {
        const diag = diagnostics[zoneIndex]
        diag.requestedTokens = true
        try {
          const tokens = await tokenizer.tokenize(content, langId)
          diag.receivedTokens = !!tokens
          diag.tokenCount = tokens ? tokens.length : 0
          if (tokens) {
            diag.tokenTypeHistogram = histogramTokenNames(tokens)
          }
          return tokens
        } catch (e: unknown) {
          diag.error = e instanceof Error ? e.message : String(e)
          throw e
        }
      }
    }

    const rangesByCategory = await injections.computeInjectionDecorations(zones, trackingAdapter)

    lastStatus = {
      enabled: true,
      documentUri: docUri,
      timestamp: Date.now(),
      zoneCount: zones.length,
      zones: diagnostics,
      registeredLanguageCount: registered.size,
      rangesByCategory
    }

    // Apply decorations (only if the editor is still active and showing the same doc)
    if (vscode.window.activeTextEditor === editor) {
      for (const [category, dt] of decorationTypes) {
        const ranges = rangesByCategory.get(category) ?? []
        editor.setDecorations(
          dt,
          ranges.map(
            (r) =>
              new vscode.Range(
                new vscode.Position(r.startLine, r.startCol),
                new vscode.Position(r.endLine, r.endCol)
              )
          )
        )
      }
    }
  }

  function clearDecorations(editor: vscode.TextEditor): void {
    for (const dt of decorationTypes.values()) {
      editor.setDecorations(dt, [])
    }
  }

  function debouncedHighlight(): void {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      const editor = vscode.window.activeTextEditor
      if (editor) void highlightEditor(editor)
    }, injections.DEBOUNCE_MS)
  }

  // Listen for editor changes
  disposables.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) void highlightEditor(editor)
    })
  )

  disposables.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      const editor = vscode.window.activeTextEditor
      if (editor && e.document === editor.document) {
        debouncedHighlight()
      }
    })
  )

  disposables.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('lex.injectionHighlighting')) {
        const editor = vscode.window.activeTextEditor
        if (editor) void highlightEditor(editor)
      }
    })
  )

  // Initial highlight
  const activeEditor = vscode.window.activeTextEditor
  if (activeEditor) void highlightEditor(activeEditor)

  return {
    getInjectionZones: () => currentZones,
    getDecorationTypes: () => decorationTypes,
    getStatus: () => lastStatus,
    async refresh() {
      const editor = vscode.window.activeTextEditor
      if (editor) await highlightEditor(editor)
    },
    dispose() {
      if (debounceTimer) clearTimeout(debounceTimer)
      for (const d of disposables) d.dispose()
      decorationTypes.clear()
    }
  }
}
