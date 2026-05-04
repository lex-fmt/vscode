<!-- Release notes for the next version. -->
<!-- Updated as work is done; consumed by scripts/create-release. -->

### Changed

- Bumped `lexd-lsp` pin from v0.8.8 to v0.10.0. Adds the `lex.include` annotation surface in the editor: real-time include diagnostics (broken paths, cycles, depth-exceeded, root-escape, container-policy violations, etc.) on every edit, goto-definition that jumps from `:: lex.include src="chapter.lex" ::` into the target file, and a hover preview that shows the resolved path plus the first non-blank lines of the target. No editor-side configuration required — the LSP handles include resolution from the host's `[includes]` config (with sensible defaults).
- Bumped `comms` submodule to v0.16.0 (canonical `lex.include` element doc + fixture set + formal reservation of the `lex.*` annotation namespace).
