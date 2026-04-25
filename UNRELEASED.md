<!-- Release notes for the next version. -->
<!-- Updated as work is done; consumed by scripts/create-release. -->

### Changed

- Bumped pinned LSP version to v0.8.7 (picks up the comms v0.14.0 spec content).
- Bumped pinned tree-sitter grammar to v0.9.1 (picks up the new `[::label]` annotation reference syntax and directly-nested inline formatting markers).
- Rewired `src/injections.ts` as a thin adapter over the host-neutral `@lex/shared/injections` module so the same injection rules drive vscode and the Monaco-based host. Adds unit tests for the shared module and deterministic readdir ordering in tests.
