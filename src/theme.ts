/**
 * Lex Monochrome Theme
 * ====================
 *
 * Why a custom theme?
 * -------------------
 * Lex is an opinionated format focused on legibility and ergonomics for writing
 * plain-text documents. Unlike programming languages where colorful syntax
 * highlighting helps distinguish keywords, operators, and identifiers, Lex
 * documents are primarily prose with minimal syntax.
 *
 * Colorful highlighting adds visual noise without providing much value for Lex.
 * Instead, the monochrome theme uses typography (bold, italic, underline) and
 * grayscale intensity levels to create visual hierarchy while keeping the focus
 * on the content itself.
 *
 * Intensity Levels
 * ----------------
 * The theme uses four grayscale intensity levels:
 *
 *   - normal:   Full contrast for primary content (headings, body text, inline formatting)
 *   - muted:    Medium gray for structural elements (markers, references)
 *   - faint:    Light gray for meta-information (annotations, verbatim metadata)
 *   - faintest: Barely visible for syntax markers (*, _, `, [, ])
 *
 * These map to specific colors that adapt to light/dark mode:
 *
 *   Light mode: normal=#000000, muted=#808080, faint=#b3b3b3, faintest=#cacaca
 *   Dark mode:  normal=#e0e0e0, muted=#888888, faint=#666666, faintest=#555555
 *
 * How it works
 * ------------
 * VS Code doesn't support per-language themes, so we use the
 * `editor.semanticTokenColorCustomizations` setting with language-scoped token
 * types (e.g., `SessionTitleText:lex`). The `:lex` suffix ensures these colors
 * only apply to .lex files, leaving other file types unaffected.
 *
 * On extension activation, we detect whether VS Code is in light or dark mode
 * and apply the appropriate colors. We also listen for theme changes to update
 * the colors when the user switches between light and dark modes.
 *
 * @see editors/nvim/lua/lex/theme.lua - Neovim implementation with same colors
 */

import * as vscode from 'vscode';

interface MonochromeColors {
  normal: string;
  muted: string;
  faint: string;
  faintest: string;
}

const LIGHT_COLORS: MonochromeColors = {
  normal: '#000000',
  muted: '#808080',
  faint: '#b3b3b3',
  faintest: '#cacaca',
};

const DARK_COLORS: MonochromeColors = {
  normal: '#e0e0e0',
  muted: '#888888',
  faint: '#666666',
  faintest: '#555555',
};

function isDarkTheme(): boolean {
  return (
    vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ||
    vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.HighContrast
  );
}

function getMonochromeColors(): MonochromeColors {
  return isDarkTheme() ? DARK_COLORS : LIGHT_COLORS;
}

interface SemanticTokenRule {
  foreground?: string;
  fontStyle?: string;
}

function buildSemanticTokenRules(
  colors: MonochromeColors
): Record<string, string | SemanticTokenRule> {
  // Use :lex suffix to scope rules to .lex files only
  return {
    'SessionTitleText:lex': { foreground: colors.normal, fontStyle: 'bold' },
    'DefinitionSubject:lex': { foreground: colors.normal, fontStyle: 'italic' },
    'DefinitionContent:lex': colors.normal,
    'InlineStrong:lex': { foreground: colors.normal, fontStyle: 'bold' },
    'InlineEmphasis:lex': { foreground: colors.normal, fontStyle: 'italic' },
    'InlineCode:lex': colors.normal,
    'InlineMath:lex': { foreground: colors.normal, fontStyle: 'italic' },
    'VerbatimContent:lex': colors.normal,
    'ListItemText:lex': colors.normal,

    'DocumentTitle:lex': { foreground: colors.muted, fontStyle: 'bold' },
    'SessionMarker:lex': { foreground: colors.muted, fontStyle: 'italic' },
    'ListMarker:lex': { foreground: colors.muted, fontStyle: 'italic' },
    'Reference:lex': { foreground: colors.muted, fontStyle: 'underline' },
    'ReferenceCitation:lex': {
      foreground: colors.muted,
      fontStyle: 'underline',
    },
    'ReferenceFootnote:lex': {
      foreground: colors.muted,
      fontStyle: 'underline',
    },

    'AnnotationLabel:lex': colors.faint,
    'AnnotationParameter:lex': colors.faint,
    'AnnotationContent:lex': colors.faint,
    'VerbatimSubject:lex': colors.faint,
    'VerbatimLanguage:lex': colors.faint,
    'VerbatimAttribute:lex': colors.faint,

    'InlineMarker_strong_start:lex': {
      foreground: colors.faintest,
      fontStyle: 'italic',
    },
    'InlineMarker_strong_end:lex': {
      foreground: colors.faintest,
      fontStyle: 'italic',
    },
    'InlineMarker_emphasis_start:lex': {
      foreground: colors.faintest,
      fontStyle: 'italic',
    },
    'InlineMarker_emphasis_end:lex': {
      foreground: colors.faintest,
      fontStyle: 'italic',
    },
    'InlineMarker_code_start:lex': {
      foreground: colors.faintest,
      fontStyle: 'italic',
    },
    'InlineMarker_code_end:lex': {
      foreground: colors.faintest,
      fontStyle: 'italic',
    },
    'InlineMarker_math_start:lex': {
      foreground: colors.faintest,
      fontStyle: 'italic',
    },
    'InlineMarker_math_end:lex': {
      foreground: colors.faintest,
      fontStyle: 'italic',
    },
    'InlineMarker_ref_start:lex': {
      foreground: colors.faintest,
      fontStyle: 'italic',
    },
    'InlineMarker_ref_end:lex': {
      foreground: colors.faintest,
      fontStyle: 'italic',
    },
  };
}

const SEMANTIC_TOKEN_CONFIG_KEY = 'editor.semanticTokenColorCustomizations';

function getExistingCustomizations(): Record<string, unknown> {
  const config = vscode.workspace.getConfiguration();
  return config.get<Record<string, unknown>>(SEMANTIC_TOKEN_CONFIG_KEY) ?? {};
}

export async function applyLexTheme(): Promise<void> {
  const colors = getMonochromeColors();
  const rules = buildSemanticTokenRules(colors);

  const existing = getExistingCustomizations();
  const existingRules = (existing.rules as Record<string, unknown>) ?? {};

  // Merge our lex-specific rules with any existing rules
  const updated = {
    ...existing,
    rules: {
      ...existingRules,
      ...rules,
    },
  };

  await vscode.workspace
    .getConfiguration()
    .update(
      SEMANTIC_TOKEN_CONFIG_KEY,
      updated,
      vscode.ConfigurationTarget.Global
    );
}

export function setupThemeListeners(context: vscode.ExtensionContext): void {
  // Listen for VS Code color theme changes (light/dark switch)
  context.subscriptions.push(
    vscode.window.onDidChangeActiveColorTheme(async () => {
      await applyLexTheme();
    })
  );
}
