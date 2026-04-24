import type { DecorationCategory } from './types.js';
/**
 * Debounce window between document edits and the next highlight refresh.
 * Lifted verbatim from the original vscode implementation.
 */
export declare const DEBOUNCE_MS = 250;
/**
 * URI scheme used for virtual documents that back semantic-token requests.
 * Hosts register a text-document content provider against this scheme.
 */
export declare const VIRTUAL_DOC_SCHEME = "lex-embedded";
/**
 * Common annotation aliases → host language IDs.
 * If the annotation text is already a registered language ID, it's used
 * directly (see `resolveLanguageId`).
 */
export declare const LANGUAGE_ALIASES: Readonly<Record<string, string>>;
/**
 * Standard semantic token types → decoration categories. Types not listed
 * here (variable, parameter, property, etc.) get no special coloring — they
 * inherit the editor's default foreground.
 */
export declare const SEMANTIC_TOKEN_MAP: Readonly<Record<string, DecorationCategory>>;
/**
 * Theme color IDs per category. Hosts translate these into native decoration
 * types (`vscode.ThemeColor` / monaco theme token, etc.).
 */
export declare const CATEGORY_COLORS: Readonly<Record<DecorationCategory, string>>;
/**
 * Font-style overrides per category. Missing entries default to the editor's
 * regular style.
 */
export declare const CATEGORY_STYLES: Readonly<Partial<Record<DecorationCategory, string>>>;
