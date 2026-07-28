- CI now packages a `.vsix` the way a release does and fails when the
  tree-sitter payload — the Lex grammar wasm and queries, plus the five
  embedded grammars — is not inside it. The suites that would otherwise
  notice a missing payload are the integration ones, which the check lane
  excludes, so a payload-less extension could package with CI green.
