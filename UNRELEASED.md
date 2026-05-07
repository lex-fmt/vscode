<!-- Release notes for the next version. -->
<!-- Updated as work is done; consumed by scripts/create-release. -->

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
