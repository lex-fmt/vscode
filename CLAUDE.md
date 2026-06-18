@.claude/IMPORTANT-RELEASE.md

# Releasing

This repo participates in the lex release cascade. Cutting a release here is triggered automatically when lex or tree-sitter-lex releases (via the `on-upstream-released` handler workflow). vscode receives events from both upstreams; the handler re-checks all pins (`shared/lex-deps.json` — flat schema, `lexd-lsp` + `tree-sitter`) via `should-release`.

For a manual cut: push an annotated tag (`git tag -a vX.Y.Z -m "..." && git push origin vX.Y.Z`). CI builds the VSIX for each platform target and publishes to VS Code Marketplace + Open VSX.

Design + ops + gotchas: [arthur-debert/release/docs/lex-release-cascade.md](https://github.com/arthur-debert/release/blob/main/docs/lex-release-cascade.md).
