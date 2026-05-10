<!-- Release notes for the next version. -->
<!-- Updated as work is done; consumed by scripts/create-release. -->

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
