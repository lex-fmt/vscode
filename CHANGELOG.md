# Changelog

## v0.6.8 (2026-04-26)

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

## v0.6.7 (2026-04-25)

### Changed

- Bumped pinned LSP version to v0.8.8. Picks up the "Add missing footnote definition" quickfix (lex-fmt/lex#463): when a footnote reference like `[1]` has no matching definition, the LSP now offers a code action that inserts the definition into an existing or new `:: notes ::` block. Surfaced through the standard `vscode-languageclient` code-action flow — no extension code change required.

## v0.6.6 (2026-04-24)

### Changed

- Bumped pinned LSP version to v0.8.7 (picks up the comms v0.14.0 spec content).
- Bumped pinned tree-sitter grammar to v0.9.1 (picks up the new `[::label]` annotation reference syntax and directly-nested inline formatting markers).
- Rewired `src/injections.ts` as a thin adapter over the host-neutral `@lex/shared/injections` module so the same injection rules drive vscode and the Monaco-based host. Adds unit tests for the shared module and deterministic readdir ordering in tests.

## v0.6.5 (2026-04-22)

### Changed

- Bumped pinned LSP version to v0.8.5. Picks up two `lex-analysis` diagnostic fixes from lexd-lsp:
  - `missing-footnote` no longer false-positives on numbered references in a table cell when the resolving list is the table's own positional footnote list (lex-fmt/lex#460).
  - `table-inconsistent-columns` correctly accounts for `^^` rowspan carry-over when computing effective row width (lex-fmt/lex#458).

## Unreleased

### Changed

- Renamed LSP binary from `lex-lsp` to `lexd-lsp` to avoid conflicts with the Unix `lex` tool (companion to lex-fmt/lex#450).
- Bumped pinned LSP version to v0.8.5 (picks up the table-scoped footnote resolver fix from lex-fmt/lex#460 and the rowspan diagnostic fix from lex-fmt/lex#458).
