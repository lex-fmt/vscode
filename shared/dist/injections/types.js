/**
 * Host-neutral types for the injection highlighter.
 *
 * The shared injection module maps semantic-token output (from whatever host
 * syntax provider is available) onto the Lex document's verbatim zones. It
 * avoids any direct dependency on vscode, monaco, or web-tree-sitter so that
 * both `lex-vscode` and `lexed` can reuse the logic.
 */
export {};
