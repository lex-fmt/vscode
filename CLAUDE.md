@AGENTS.md

# Releasing

Releases are cut through the shipit release pipeline: the `shipit-release.yml`
workflow_dispatch caller, with a `stage` choice (`full` | `prepare` | `build` |
`sign` | `publish`). It builds one `.vsix` per target
(darwin-arm64/linux-arm64/linux-x64/win32-x64) and publishes to the GitHub
release, the VS Code Marketplace and Open VSX — see `[artifacts.lex-vscode]` in
`.shipit.toml` for the declared surface and its flagged gaps.

There is no cross-repo release cascade any more. An upstream release does not
trigger a cut here: `lexd-lsp` is an ordinary pinned conda dependency
(`[feature.shipit-artifacts.dependencies]` in `pixi.toml`), bumped by a normal
dependency-bump PR.

**Every PR needs a `CHANGELOG/unreleased-*.md` fragment.** A cut coalesces the
fragments into the release notes and refuses an empty release, so a PR that
lands without one silently costs the next release its notes.
