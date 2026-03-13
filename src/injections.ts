/**
 * Injection Highlighter — Embedded Language Syntax Coloring
 *
 * Uses tree-sitter to find verbatim blocks with language annotations
 * (e.g., `:: python ::`) and delegates syntax highlighting to VS Code's
 * own language infrastructure. Any language the editor supports gets
 * highlighted — we don't provide grammars or tokenizers ourselves.
 *
 * Architecture:
 *   1. tree-sitter parses the Lex document and runs injections.scm
 *   2. For each injection zone, a virtual document is created with the
 *      target language ID (e.g., "python", "javascript")
 *   3. VS Code's semantic token providers tokenize the virtual document
 *   4. Tokens are mapped back to the real document as decorations,
 *      overriding the monochrome VerbatimContent semantic tokens
 *
 * If a language has no semantic token provider installed, that zone
 * is silently skipped — no fallback tokenization, no hardcoded grammars.
 */

import * as vscode from 'vscode';
import type { LexTreeSitter, InjectionZone } from './treesitter.js';

const DEBOUNCE_MS = 250;
const SCHEME = 'lex-embedded';

// Common annotation aliases → VS Code language IDs.
// If the annotation text is already a registered language ID, it's used directly.
const LANGUAGE_ALIASES: Record<string, string> = {
  py: 'python',
  js: 'javascript',
  jsx: 'javascriptreact',
  ts: 'typescript',
  tsx: 'typescriptreact',
  rs: 'rust',
  rb: 'ruby',
  sh: 'shellscript',
  bash: 'shellscript',
  zsh: 'shellscript',
  shell: 'shellscript',
  yml: 'yaml',
  'c++': 'cpp',
  cxx: 'cpp',
  cc: 'cpp',
  htm: 'html',
  golang: 'go',
};

// Standard VS Code semantic token types → our decoration categories.
// Types not listed here (variable, parameter, property, etc.) get no
// special coloring — they inherit the editor's default foreground.
type DecorationCategory =
  | 'keyword'
  | 'string'
  | 'comment'
  | 'number'
  | 'type'
  | 'function'
  | 'operator';

const SEMANTIC_TOKEN_MAP: Record<string, DecorationCategory> = {
  keyword: 'keyword',
  modifier: 'keyword',
  function: 'function',
  method: 'function',
  macro: 'function',
  decorator: 'function',
  string: 'string',
  regexp: 'string',
  number: 'number',
  comment: 'comment',
  type: 'type',
  class: 'type',
  enum: 'type',
  interface: 'type',
  struct: 'type',
  typeParameter: 'type',
  namespace: 'type',
  operator: 'operator',
};

const CATEGORY_COLORS: Record<DecorationCategory, string> = {
  keyword: 'lex.injection.keyword',
  string: 'lex.injection.string',
  comment: 'lex.injection.comment',
  number: 'lex.injection.number',
  type: 'lex.injection.type',
  function: 'lex.injection.function',
  operator: 'lex.injection.operator',
};

const CATEGORY_STYLES: Partial<Record<DecorationCategory, string>> = {
  comment: 'italic',
  keyword: 'bold',
};

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

  const contentProvider = vscode.workspace.registerTextDocumentContentProvider(SCHEME, {
    onDidChange: changeEmitter.event,
    provideTextDocumentContent(uri: vscode.Uri): string {
      return contentMap.get(uri.path) ?? '';
    },
  });
  disposables.push(contentProvider, changeEmitter);

  // Track which virtual docs have had their language set
  const docLanguages = new Map<string, string>();

  // Create decoration types
  for (const [category, colorId] of Object.entries(CATEGORY_COLORS)) {
    const fontStyle = CATEGORY_STYLES[category as DecorationCategory];
    const dt = vscode.window.createTextEditorDecorationType({
      color: new vscode.ThemeColor(colorId),
      ...(fontStyle ? { fontStyle } : {}),
    });
    decorationTypes.set(category as DecorationCategory, dt);
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

  async function resolveLanguageId(annotation: string): Promise<string | null> {
    const name = annotation.toLowerCase().trim();
    const resolved = LANGUAGE_ALIASES[name] ?? name;
    const registered = await getRegisteredLanguages();
    return registered.has(resolved) ? resolved : null;
  }

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

    // Build decoration ranges per category
    const rangesByCategory = new Map<DecorationCategory, vscode.Range[]>();
    for (const cat of decorationTypes.keys()) {
      rangesByCategory.set(cat, []);
    }

    // Process zones: create virtual docs and fetch semantic tokens
    for (let i = 0; i < zones.length; i++) {
      const zone = zones[i];
      const langId = await resolveLanguageId(zone.language);
      if (!langId) continue;

      try {
        const tokens = await getSemanticTokensForZone(i, zone.text, langId);
        if (!tokens) continue;

        mapTokensToDecorations(tokens, zone, rangesByCategory);
      } catch {
        // Language provider not available or errored — skip this zone
      }
    }

    // Apply decorations (only if the editor is still active and showing the same doc)
    if (vscode.window.activeTextEditor === editor) {
      for (const [category, dt] of decorationTypes) {
        editor.setDecorations(dt, rangesByCategory.get(category) ?? []);
      }
    }
  }

  async function getSemanticTokensForZone(
    zoneIndex: number,
    content: string,
    langId: string
  ): Promise<{ legend: vscode.SemanticTokensLegend; data: Uint32Array } | null> {
    const docPath = `/zone-${zoneIndex}`;

    // Update virtual document content
    contentMap.set(docPath, content);
    const uri = vscode.Uri.parse(`${SCHEME}://${docPath}`);
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

  function mapTokensToDecorations(
    tokens: { legend: vscode.SemanticTokensLegend; data: Uint32Array },
    zone: InjectionZone,
    rangesByCategory: Map<DecorationCategory, vscode.Range[]>
  ): void {
    const { legend, data } = tokens;
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

      const tokenTypeName = legend.tokenTypes[typeIndex];
      if (!tokenTypeName) continue;

      const category = SEMANTIC_TOKEN_MAP[tokenTypeName];
      if (!category) continue;

      const ranges = rangesByCategory.get(category);
      if (!ranges) continue;

      // Map virtual document position → real document position.
      // The virtual doc contains just the zone text. Line 0 of the virtual
      // doc corresponds to zone.startRow in the real doc, etc.
      const realLine = zone.startRow + line;
      const realStartChar = line === 0 ? zone.startCol + startChar : startChar;

      ranges.push(
        new vscode.Range(
          new vscode.Position(realLine, realStartChar),
          new vscode.Position(realLine, realStartChar + length)
        )
      );
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
    }, DEBOUNCE_MS);
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
