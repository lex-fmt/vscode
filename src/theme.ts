/**
 * Lex Monochrome Theme — Light/Dark Adaptation
 * ==============================================
 *
 * Dark-mode colors are declared as defaults in package.json via
 * `configurationDefaults["editor.semanticTokenColorCustomizations"]`.
 * They apply automatically without writing to user settings.
 *
 * This module handles light-mode adaptation only: when VS Code is in a light
 * theme, it writes light-mode overrides to user settings (which take precedence
 * over the defaults). When switching back to dark, it removes those overrides
 * so the package.json defaults kick in again.
 *
 * Intensity Levels
 * ----------------
 *   - normal:   Full contrast for primary content
 *   - muted:    Medium gray for structural elements
 *   - faint:    Light gray for meta-information
 *   - faintest: Barely visible for syntax markers
 *
 *   Light mode: normal=#000000, muted=#808080, faint=#b3b3b3, faintest=#cacaca
 *   Dark mode:  normal=#e0e0e0, muted=#888888, faint=#666666, faintest=#555555
 *
 * @see editors/nvim/lua/lex/theme.lua - Neovim implementation with same colors
 */

import * as vscode from 'vscode';

const LIGHT_COLORS = {
  normal: '#000000',
  muted: '#808080',
  faint: '#b3b3b3',
  faintest: '#cacaca',
};

// All lex-scoped rule keys managed by this extension
const LEX_RULE_KEYS = [
  'SessionTitleText:lex',
  'DefinitionSubject:lex',
  'DefinitionContent:lex',
  'InlineStrong:lex',
  'InlineEmphasis:lex',
  'InlineCode:lex',
  'InlineMath:lex',
  'VerbatimContent:lex',
  'ListItemText:lex',
  'DocumentTitle:lex',
  'SessionMarker:lex',
  'ListMarker:lex',
  'Reference:lex',
  'ReferenceCitation:lex',
  'ReferenceFootnote:lex',
  'AnnotationLabel:lex',
  'AnnotationParameter:lex',
  'AnnotationContent:lex',
  'VerbatimSubject:lex',
  'VerbatimLanguage:lex',
  'VerbatimAttribute:lex',
  'InlineMarker_strong_start:lex',
  'InlineMarker_strong_end:lex',
  'InlineMarker_emphasis_start:lex',
  'InlineMarker_emphasis_end:lex',
  'InlineMarker_code_start:lex',
  'InlineMarker_code_end:lex',
  'InlineMarker_math_start:lex',
  'InlineMarker_math_end:lex',
  'InlineMarker_ref_start:lex',
  'InlineMarker_ref_end:lex',
];

interface SemanticTokenRule {
  foreground?: string;
  fontStyle?: string;
}

function buildLightRules(): Record<string, string | SemanticTokenRule> {
  const c = LIGHT_COLORS;
  return {
    'SessionTitleText:lex': { foreground: c.normal, fontStyle: 'bold' },
    'DefinitionSubject:lex': { foreground: c.normal, fontStyle: 'italic' },
    'DefinitionContent:lex': c.normal,
    'InlineStrong:lex': { foreground: c.normal, fontStyle: 'bold' },
    'InlineEmphasis:lex': { foreground: c.normal, fontStyle: 'italic' },
    'InlineCode:lex': c.normal,
    'InlineMath:lex': { foreground: c.normal, fontStyle: 'italic' },
    'VerbatimContent:lex': c.normal,
    'ListItemText:lex': c.normal,

    'DocumentTitle:lex': { foreground: c.normal, fontStyle: 'underline' },
    'SessionMarker:lex': { foreground: c.muted, fontStyle: 'italic' },
    'ListMarker:lex': { foreground: c.muted, fontStyle: 'italic' },
    'Reference:lex': { foreground: c.muted, fontStyle: 'underline' },
    'ReferenceCitation:lex': { foreground: c.muted, fontStyle: 'underline' },
    'ReferenceFootnote:lex': { foreground: c.muted, fontStyle: 'underline' },

    'AnnotationLabel:lex': c.faint,
    'AnnotationParameter:lex': c.faint,
    'AnnotationContent:lex': c.faint,
    'VerbatimSubject:lex': c.faint,
    'VerbatimLanguage:lex': c.faint,
    'VerbatimAttribute:lex': c.faint,

    'InlineMarker_strong_start:lex': { foreground: c.faintest, fontStyle: 'italic' },
    'InlineMarker_strong_end:lex': { foreground: c.faintest, fontStyle: 'italic' },
    'InlineMarker_emphasis_start:lex': { foreground: c.faintest, fontStyle: 'italic' },
    'InlineMarker_emphasis_end:lex': { foreground: c.faintest, fontStyle: 'italic' },
    'InlineMarker_code_start:lex': { foreground: c.faintest, fontStyle: 'italic' },
    'InlineMarker_code_end:lex': { foreground: c.faintest, fontStyle: 'italic' },
    'InlineMarker_math_start:lex': { foreground: c.faintest, fontStyle: 'italic' },
    'InlineMarker_math_end:lex': { foreground: c.faintest, fontStyle: 'italic' },
    'InlineMarker_ref_start:lex': { foreground: c.faintest, fontStyle: 'italic' },
    'InlineMarker_ref_end:lex': { foreground: c.faintest, fontStyle: 'italic' },
  };
}

function isDarkTheme(): boolean {
  return (
    vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ||
    vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.HighContrast
  );
}

const SEMANTIC_TOKEN_CONFIG_KEY = 'editor.semanticTokenColorCustomizations';

export async function applyLexTheme(): Promise<void> {
  const config = vscode.workspace.getConfiguration();
  const existing = config.get<Record<string, unknown>>(SEMANTIC_TOKEN_CONFIG_KEY) ?? {};
  const existingRules = (existing.rules as Record<string, unknown>) ?? {};

  if (isDarkTheme()) {
    // Dark mode: remove any light-mode overrides so package.json defaults apply
    const cleaned = { ...existingRules };
    let changed = false;
    for (const key of LEX_RULE_KEYS) {
      if (key in cleaned) {
        delete cleaned[key];
        changed = true;
      }
    }
    if (changed) {
      const updated = { ...existing, rules: cleaned };
      if (Object.keys(cleaned).length === 0) {
        delete (updated as Record<string, unknown>).rules;
      }
      const value = Object.keys(updated).length === 0 ? undefined : updated;
      await config.update(SEMANTIC_TOKEN_CONFIG_KEY, value, vscode.ConfigurationTarget.Global);
    }
  } else {
    // Light mode: write light-mode overrides (take precedence over defaults)
    const lightRules = buildLightRules();
    const updated = {
      ...existing,
      rules: {
        ...existingRules,
        ...lightRules,
      },
    };
    await config.update(SEMANTIC_TOKEN_CONFIG_KEY, updated, vscode.ConfigurationTarget.Global);
  }
}

export function setupThemeListeners(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.window.onDidChangeActiveColorTheme(async () => {
      await applyLexTheme();
    })
  );
}
