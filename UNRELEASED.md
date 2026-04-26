<!-- Release notes for the next version. -->
<!-- Updated as work is done; consumed by scripts/create-release. -->

### Changed

- **Verbatim block syntax highlighting now goes through tree-sitter, not LSP
  semantic tokens.** VS Code's semantic-tokens layer only carries
  high-level disambiguation (variable vs. function); it doesn't carry
  syntactic tokens like keywords, strings, or comments. With no TextMate
  grammar to fall back on, the previous pipeline produced a near-empty
  set of decorations inside `:: lang ::` blocks. The extension now loads
  per-language tree-sitter parsers and runs each language's
  `highlights.scm` directly on the zone content. A 30-line Python verbatim
  that produced a single decoration before now produces ~12.
- **Bundled grammars expanded from 1 → 5.** Verbatim blocks closed with
  `:: python ::`, `:: javascript ::`, `:: json ::`, `:: rust ::`, or
  `:: bash ::` now get full tree-sitter-driven highlighting out of the
  box. Other annotation values (`:: ocaml ::`, `:: zig ::`, etc.) still
  parse correctly — they just don't get highlighting unless the user
  drops in their own grammar.
- **Bundled grammar list is now sourced from
  `tree-sitter-lex/shared/embedded-grammars.json`,** not a hardcoded array
  in `scripts/download-embedded-grammars.sh`. Bumping the `tree-sitter`
  pin in `shared/lex-deps.json` picks up grammar additions and version
  changes automatically — vscode and lexed share one curated set.
- Bumped tree-sitter pin to `v0.10.0` (introduces the manifest).
- Surfaced tree-sitter init failures and per-zone injection diagnostics
  through the Lex output channel for easier debugging when a zone fails
  to render.
