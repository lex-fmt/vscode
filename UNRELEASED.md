<!-- Release notes for the next version. -->
<!-- Updated as work is done; consumed by scripts/create-release. -->

### Changed

- Theme rules now derive from the canonical Lex monochrome theme at `comms/shared/theming/lex-theme.json` (cross-editor source of truth) via `scripts/gen-theme.py`. The generator updates two artifacts: dark-mode rules in `package.json` (under `contributes.configurationDefaults.editor.semanticTokenColorCustomizations.rules`, applied automatically without writing user settings) and light-mode rules in `src/theme-data.ts` (consumed at runtime when VS Code is in a light theme). `theme:check` runs in `prebuild` and CI so stale generated output fails the build. Bumps the `comms` submodule to v0.15.0. (#48)
- Repo onboarded to the canonical lex-fmt CI standardization: `.github/CODEOWNERS`, `.github/workflows/copilot-review.yml`, dependabot config grouping + auto-merge for patch/minor, and a `gh pr merge --auto` retry to handle the CI-race timing window. (#26, #27, #40, #47)
- Routine dependency bumps via Dependabot: `web-tree-sitter` 0.25.10 → 0.26.8, `globals` 15.15.0 → 17.5.0, eslint group, `esbuild` 0.23.1 → 0.28.0, `@vscode/vsce` 3.7.1 → 3.9.1, `prettier` 3.6.2 → 3.8.3, plus several github-actions group bumps.
