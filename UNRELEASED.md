<!-- Release notes for the next version. -->
<!-- Updated as work is done; consumed by scripts/create-release. -->

- Embedded-language parsers (python, javascript, json, rust, bash) now come
  from npm dependencies (`@lumis-sh/wasm-*`) instead of being fetched from
  GitHub release assets via a manifest in `lex-fmt/tree-sitter-lex`. Their
  `highlights.scm` queries are vendored under `vendor/embedded-grammars/`
  with the upstream MIT licenses, pinned to the same grammar revision each
  parser WASM was built from. A side effect: `vsce package` now stages the
  embedded grammars on its own, so a shipit-cut `.vsix` carries them too.
