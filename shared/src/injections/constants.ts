import type { DecorationCategory } from './types.js';

/**
 * Debounce window between document edits and the next highlight refresh.
 */
export const DEBOUNCE_MS = 250;

/**
 * Aliases from common annotation strings (`:: py ::`, `:: js ::`) onto
 * canonical tokenizer language IDs — i.e. the directory name under
 * `resources/embedded-grammars/`. If the annotation text already
 * matches a registered language ID, it's used directly (see
 * `resolveLanguageId`).
 */
export const LANGUAGE_ALIASES: Readonly<Record<string, string>> = {
  py: 'python',
  js: 'javascript',
  ts: 'typescript',
  rs: 'rust',
  sh: 'bash',
  zsh: 'bash',
  shell: 'bash',
  shellscript: 'bash',
  yml: 'yaml',
  'c++': 'cpp',
  cxx: 'cpp',
  cc: 'cpp',
  htm: 'html',
  golang: 'go',
};

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
export const TREE_SITTER_HIGHLIGHT_MAP: Readonly<Record<string, DecorationCategory>> = {
  keyword: 'keyword',
  'keyword.function': 'keyword',
  'keyword.return': 'keyword',
  'keyword.operator': 'keyword',
  string: 'string',
  escape: 'string',
  comment: 'comment',
  number: 'number',
  function: 'function',
  method: 'function',
  decorator: 'function',
  type: 'type',
  'type.builtin': 'type',
  operator: 'operator',
  'constant.builtin': 'keyword',
};

/**
 * Theme color IDs per category. Hosts translate these into native
 * decoration types (`vscode.ThemeColor` / monaco theme token, etc.).
 */
export const CATEGORY_COLORS: Readonly<Record<DecorationCategory, string>> = {
  keyword: 'lex.injection.keyword',
  string: 'lex.injection.string',
  comment: 'lex.injection.comment',
  number: 'lex.injection.number',
  type: 'lex.injection.type',
  function: 'lex.injection.function',
  operator: 'lex.injection.operator',
};

/**
 * Font-style overrides per category. Missing entries default to the
 * editor's regular style.
 */
export const CATEGORY_STYLES: Readonly<Partial<Record<DecorationCategory, string>>> = {
  comment: 'italic',
  keyword: 'bold',
};
