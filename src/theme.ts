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
 * The light-mode rules and key list are generated from
 * `comms/shared/theming/lex-theme.json` by `scripts/gen-theme.py`.
 * See `src/theme-data.ts` (do not hand-edit).
 */

import * as vscode from 'vscode';

import { LEX_RULE_KEYS, LIGHT_RULES } from './theme-data.js';

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
    const updated = {
      ...existing,
      rules: {
        ...existingRules,
        ...LIGHT_RULES,
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
