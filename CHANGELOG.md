<!-- generated - do not edit. See CHANGELOG/README.txt -->

# Changelog

## Unreleased

## 0.11.3 - 2026-06-20

- Stop prettier-checking generated shared/dist and test fixtures

## 0.11.2 - 2026-06-20

- reformat source to managed prettier 3.8.4
- Extract pure smart-paste helpers into smartPasteCore.ts and cover them with node:test unit tests.

## 0.11.1 - 2026-06-16

- ci: migrate release reusable-workflow callers from @v2 to @v3
- Add unit tests for tree-sitter init pre-flight failure staging (#136)
- Migrate managed tree onto WS7 baseline (untrack .release/ + mirrors, drop husky, add pr-loop-guard)

## 0.11.0 - 2026-06-03

### Added

- Smart paste: pasted text is now re-anchored to the caret's structural
  level via the lexd-lsp `lex/preparePaste` request, so copy-paste into and
  between Lex documents lands at the right indentation instead of carrying
  the source's. Implemented as a `DocumentPasteEditProvider` that forwards
  to the server and falls back to native paste when the server does not
  advertise the capability (requires lexd-lsp >= v0.17.0). (#121)

## 0.10.9 - 2026-06-01

### Added

- Minimal `text.lex` TextMate grammar (`resources/lex.tmLanguage.json`)
  that scopes annotation labels (`:: label ::`), inline code,
  math spans (`#…#`), references (`[…]`), URLs, and file paths as
  non-prose so third-party spell checkers can skip them. The grammar
  does NOT drive visual coloring — LSP semantic tokens remain the
  source of truth for that. Contributes `cSpell.languageSettings`
  defaults for the `lex` language id via `configurationDefaults`
  including matching `ignoreRegExpList` entries for annotations,
  inline code, math, references, URLs, and file paths.
- Recommends [Code Spell Checker](https://marketplace.visualstudio.com/items?itemName=streetsidesoftware.code-spell-checker)
  in README.lex (not a hard dependency).
- `test/unit/spellcheck-scopes.test.ts` — runs the grammar through
  `vscode-textmate` + `vscode-oniguruma` against the canonical fixture
  mirrored from `tree-sitter-lex` and asserts every prose typo sits on
  a prose-scoped token and every non-prose typo sits on
  `meta.tag.*`, `markup.raw.*`, `meta.reference.*`, or
  `markup.underline.link.*`.
- `test/runCspellTests.ts` + `test/integration-cspell/spellcheck.test.ts`
  — live VS Code + CSpell integration test (`npm run test:cspell`):
  downloads VS Code, installs Code Spell Checker via the CLI, opens
  the fixture, and asserts CSpell's published diagnostics match the
  policy (prose typos surfaced, non-prose typos suppressed).

### Changed

- `tree-sitter` pin bumped to `v0.11.0`.
- `.husky/pre-commit` now exits early when `CI=true` so the GitHub
  Actions release runner — which does `npm ci --omit=dev` and lacks
  prettier — can commit version bumps without the pre-commit hook
  firing `prettier --write` and crashing with ENOENT.

### Known limitation

- Verbatim block *bodies* are not currently scoped as non-prose on the
  VS Code side. Distinguishing verbatim from a definition's indented
  body requires parser-level lookahead at the closer, which TextMate
  grammars can't safely do. Nvim and lexed handle this correctly via
  tree-sitter `#has-ancestor?` and a state machine respectively. The
  gap shows up as CSpell occasionally flagging code identifiers inside
  verbatim blocks. Tracked for an eventual LSP-side spellable-ranges
  request.

## v0.10.5 (2026-05-21)

## v0.10.4 (2026-05-18)

## v0.10.1 (2026-05-17)

## v0.10.0 (2026-05-14)

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

## v0.9.0 (2026-05-13)

### Added

- **Extract Selection to Include File**
  ([lex#498](https://github.com/lex-fmt/lex/issues/498)). New
  `lex.extractSelectionToInclude` command (palette + editor context
  menu, gated on `editorLangId == lex && editorHasSelection`).
  Prompts via `showInputBox` for the target include path; the LSP
  server validates the path (URL scheme, root-escape, existing
  target, missing parent dir), indent-shifts the selection so the
  shallowest non-blank line lands at column 0, parses it as a Lex
  fragment, and returns an atomic `WorkspaceEdit` containing
  `CreateFile` + content `TextEdit` + host-replace `TextEdit`.
  All path / parse logic lives in
  [`lex-lsp`](https://github.com/lex-fmt/lex/pull/572) so this shim
  stays thin.

### Changed

- Bumps `lexd-lsp` pin v0.11.0 → v0.12.0
  ([lex v0.12.0 release](https://github.com/lex-fmt/lex/releases/tag/v0.12.0)).
- vscode's `workspace.applyEdit` silently no-ops the `TextDocumentEdit`
  targeted at a freshly-`CreateFile`'d URI (the buffer isn't loaded
  as a `TextDocument`). The extract wrapper now walks the
  WorkspaceEdit by hand: writes each `CreateFile` target's content
  directly via `vscode.workspace.fs.writeFile`, then applies the
  remaining host-side edits via `applyEdit`.

### Fixed

- New `src/instrumentation.ts` (extension-side, gated on
  `LEX_LOG_TO_STDERR=1`) mirrors notifications + the Lex output
  channel to `/tmp/lex-vscode-test.log` (configurable via
  `LEX_LOG_FILE`). Workaround for the test-electron split-module-
  context limitation documented in
  `test/integration/runtime_errors.ts` — earlier debugging passes
  couldn't see extension-side `showErrorMessage` calls or output
  channel writes from the test harness. Production installs don't
  set the env var; the mirror is a noop there.

## v0.8.0 (2026-05-10)

### Added

- Extension trust prompt. When `lexd-lsp` boots a workspace with a
  `[labels]` namespace whose subprocess handler hasn't been pinned in
  `<workspace>/.lex/trust.json`, the server fires a `lex/trustRequest`
  custom request and the extension renders a modal **"Trust"** /
  **"Deny"** dialog with the namespace name, command string, schema
  source, and declared capabilities. The user's reply is fed back to
  the trust gate and pinned for subsequent sessions. Dismissing the
  modal counts as denied (fail-closed). Pairs with `lexd-lsp` v0.11
  which adds the trust-request forwarding (lex-fmt/lex#549). Part of
  the γ phase of the extension system (lex-fmt/lex#516).
- New integration test (`test/integration/aa_lsp_trust_prompt.test.ts`)
  that verifies the trust prompt round-trips end-to-end against a
  real `lexd-lsp` v0.11+: opens the test fixture's `.lex.toml`
  declaring an unpinned subprocess handler, monkey-patches
  `vscode.window.showWarningMessage`, triggers the LSP boot via a
  hover request, and asserts the captured prompt matches the wire
  shape. Test sorts first (`aa_` prefix) so it runs before any
  other test triggers the extension registry boot.

### Changed

- Bumped `lexd-lsp` pin from v0.10.6 to v0.11.0. Picks up the
  extension dispatch + trust prompt + boot-serialization wiring
  this extension's trust-prompt handler depends on. See lex-fmt/lex
  CHANGELOG `[0.11.0]` for the full surface.

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

## Pre-v0.6.5 unreleased (historical)

### Changed

- Renamed LSP binary from `lex-lsp` to `lexd-lsp` to avoid conflicts with the Unix `lex` tool (companion to lex-fmt/lex#450).
- Bumped pinned LSP version to v0.8.5 (picks up the table-scoped footnote resolver fix from lex-fmt/lex#460 and the rowspan diagnostic fix from lex-fmt/lex#458).
