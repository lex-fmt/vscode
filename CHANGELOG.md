# Changelog

## v0.7.2 (2026-05-07)

### Changed

- Bumped `lexd-lsp` pin from v0.10.5 to v0.10.6. Picks up the LSP
  position UTF-16 column fix: inline tokens (the highlighter for
  `*bold*`, `_italic_`, `` `code` ``, `[ref]`) and goto-definition /
  find-references targets now land on the correct character even when
  the line contains non-ASCII characters like `→`. Previously the open
  marker of an inline code span on a line like
  ``Provision → `Setup` → `PathExport`...`` would render on the
  *next* glyph (the `e` of `Setup` instead of the `` ` ``), shifting
  the inline-code styling one character right of where it should be.
- Bumped `comms` submodule pin to v0.16.1 and regenerated
  `src/theme-data.ts` + the `Reference:lex` semantic-token color
  customizations in `package.json`. Reference inlines (`Reference`,
  `ReferenceCitation`, `ReferenceFootnote`, `ReferenceAnnotation`)
  now render with **bold** instead of underline. Underline reads as
  "follow this link" and conflicted with the LSP `documentLink`
  decoration that VSCode reserves for actually-clickable URL/file
  targets; bold matches the way references read in printed text.

## v0.7.1 (2026-05-07)

### Changed

- Bumped `lexd-lsp` pin from v0.10.0 to v0.10.5. Headline fixes for the
  document-link surface that VSCode renders as the clickable + underlined
  region for `[bracketed]` references:
  - The link range is now scoped to the bracketed reference itself; a
    paragraph containing a URL or file reference no longer renders end-to-end
    as one giant clickable link.
  - References that appear in a section heading (e.g.
    `1. See [./handlers.lex] for details`) now also contribute clickable
    links — previously the LSP silently dropped them from the
    `documentLink` response.
- Also includes everything else from v0.10.1 through v0.10.5: the
  `include-not-found` diagnostic now points at the offending
  `lex.include` annotation instead of the document head, and `FsLoader`
  picked up symlink-traversal defenses, resource limits
  (`max_total_includes`, `max_file_size`), and rejection of
  platform-absolute include paths.

## v0.7.0 (2026-05-04)

### Changed

- Bumped `lexd-lsp` pin from v0.8.8 to v0.10.0. Adds the `lex.include` annotation surface in the editor: real-time include diagnostics (broken paths, cycles, depth-exceeded, root-escape, container-policy violations, etc.) on every edit, goto-definition that jumps from `:: lex.include src="chapter.lex" ::` into the target file, and a hover preview that shows the resolved path plus the first non-blank lines of the target. No editor-side configuration required — the LSP handles include resolution from the host's `[includes]` config (with sensible defaults).
- Bumped `comms` submodule to v0.16.0 (canonical `lex.include` element doc + fixture set + formal reservation of the `lex.*` annotation namespace).

### Fixed

- CI: handle the new arthur-debert/release@v1 tarball layout (lex v0.10.0+ packages binaries under `<name>-<target>/` instead of at the top level). Fix applied to both `scripts/download-lexd-lsp.sh` and `.github/workflows/release.yml` so this works for both layouts. (#50)

## v0.6.9 (2026-05-02)

### Changed

- Theme rules now derive from the canonical Lex monochrome theme at `comms/shared/theming/lex-theme.json` (cross-editor source of truth) via `scripts/gen-theme.py`. The generator updates two artifacts: dark-mode rules in `package.json` (under `contributes.configurationDefaults.editor.semanticTokenColorCustomizations.rules`, applied automatically without writing user settings) and light-mode rules in `src/theme-data.ts` (consumed at runtime when VS Code is in a light theme). `theme:check` runs in `prebuild` and CI so stale generated output fails the build. Bumps the `comms` submodule to v0.15.0. (#48)
- Repo onboarded to the canonical lex-fmt CI standardization: `.github/CODEOWNERS`, `.github/workflows/copilot-review.yml`, dependabot config grouping + auto-merge for patch/minor, and a `gh pr merge --auto` retry to handle the CI-race timing window. (#26, #27, #40, #47)
- Routine dependency bumps via Dependabot: `web-tree-sitter` 0.25.10 → 0.26.8, `globals` 15.15.0 → 17.5.0, eslint group, `esbuild` 0.23.1 → 0.28.0, `@vscode/vsce` 3.7.1 → 3.9.1, `prettier` 3.6.2 → 3.8.3, plus several github-actions group bumps.

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
