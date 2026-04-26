import type { DecorationCategory } from './types.js';
/**
 * Debounce window between document edits and the next highlight refresh.
 */
export declare const DEBOUNCE_MS = 250;
/**
 * Aliases from common annotation strings (`:: py ::`, `:: js ::`) onto
 * canonical tokenizer language IDs — i.e. the directory name under
 * `resources/embedded-grammars/`. If the annotation text already
 * matches a registered language ID, it's used directly (see
 * `resolveLanguageId`).
 */
export declare const LANGUAGE_ALIASES: Readonly<Record<string, string>>;
/**
 * Default mapping from tree-sitter highlight capture names to our
 * `DecorationCategory` set. Hosts pass this (or an extended version) to
 * the shared compute module; lookups walk the dotted-prefix chain so
 * `function.method` falls back to `function` automatically.
 *
 * Capture names not listed here (`variable`, `variable.parameter`,
 * `punctuation.bracket`, `embedded`, etc.) intentionally produce no
 * decoration — they'd add noise without aiding scanning.
 */
export declare const TREE_SITTER_HIGHLIGHT_MAP: Readonly<Record<string, DecorationCategory>>;
/**
 * Theme color IDs per category. Hosts translate these into native
 * decoration types (`vscode.ThemeColor` / monaco theme token, etc.).
 */
export declare const CATEGORY_COLORS: Readonly<Record<DecorationCategory, string>>;
/**
 * Font-style overrides per category. Missing entries default to the
 * editor's regular style.
 */
export declare const CATEGORY_STYLES: Readonly<Partial<Record<DecorationCategory, string>>>;
