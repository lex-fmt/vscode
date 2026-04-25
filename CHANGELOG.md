# Changelog

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
