- Embedded-language parsers (python, javascript, json, rust, bash) now come
  from the official `tree-sitter-<lang>` npm packages instead of being
  fetched from GitHub release assets via a manifest in
  `lex-fmt/tree-sitter-lex`. Each package ships the parser WASM, its own
  `highlights.scm` and its MIT license together, so query and parser can no
  longer drift apart. A side effect: `vsce package` now stages the embedded
  grammars on its own, so a shipit-cut `.vsix` carries them too.
