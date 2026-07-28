- The Lex tree-sitter grammar now arrives as an ordinary pinned dependency of
  the build environment, resolved and checksummed by the lockfile, instead of
  being downloaded from a GitHub release at package time by a script the build
  fetched off the internet first. A wrong pin now fails on a laptop rather than
  in a release.
- A shipit-cut `.vsix` carries the Lex grammar. It previously shipped the
  language server but not the parser, because the grammar rode a separate
  download the shipit release path never ran — an extension that installed and
  highlighted nothing.
- Removed the retired dependency machinery outright: `deps.json`,
  `shared/lex-deps.json`, both `fetch-deps` bootstrap scripts, its remaining
  call sites in the dev and test launchers, and the legacy release workflow the
  pre-package hook existed for. There is no second path left.
- The dev and integration launchers now run the language server straight out of
  the resolved environment instead of copying a downloaded binary into the
  extension, so nothing but a release build ever writes `resources/lexd-lsp`.
