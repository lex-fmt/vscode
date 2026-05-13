<!-- Release notes for the next version. -->
<!-- Updated as work is done; consumed by scripts/create-release. -->

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
