<!-- Release notes for the next version. -->
<!-- Updated as work is done; consumed by scripts/create-release. -->

### Changed

- Bumps `lexd-lsp` pin v0.12.0 → v0.13.0
  ([lex v0.13.0 release](https://github.com/lex-fmt/lex/releases/tag/v0.13.0)).
  This brings in the bare-as-blessed label namespace model
  ([lex#584](https://github.com/lex-fmt/lex/issues/584)) and the
  wire-v2 reverse-hook surface
  ([lex#583](https://github.com/lex-fmt/lex/issues/583)). User-facing
  changes flow through standard LSP responses with no extension-side
  wiring needed:
    - **Label-policy diagnostics.** `:: doc.foo ::` (reserved-forbidden)
      and `:: lex.unknown ::` (unregistered canonical) now surface as
      red squigglies with diagnostic codes
      `forbidden-label-prefix` / `unknown-lex-canonical`.
    - **Quickfix code action.** "Rewrite `doc.table` to `table`" /
      `doc.image` → `image` etc. for the four curated mappings, plus
      a generic "strip `doc.` prefix" fallback for any other `doc.*`.
    - **Hover form-classification.** Annotating a label site shows
      "Shortcut for `lex.metadata.author`" / "Prefix-stripped form of
      `lex.metadata.author`" / "Community label" depending on the
      source spelling.
    - **Permissive parse for diagnostics.** A `:: doc.foo ::` in a
      file no longer blanks out every LSP feature (semantic tokens,
      hover, completion, Go to Definition) — the rest of the file keeps
      working and the offending label gets a diagnostic in place.
- Bumps `comms` submodule to `2238b40` (`on_format` §6.5 framing +
  benchmark fixture flip off `doc.note`).
