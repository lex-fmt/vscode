/**
 * Host-neutral types for the injection highlighter.
 *
 * The shared injection module maps tokenized output (produced by an
 * embedded-language tokenizer — currently tree-sitter) onto the Lex
 * document's verbatim zones. It avoids any direct dependency on vscode,
 * monaco, or web-tree-sitter so that both `lex-vscode` and `lexed` can
 * reuse the logic.
 */
export {};
