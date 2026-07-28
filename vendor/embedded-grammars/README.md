# Vendored embedded-grammar queries

`src/embedded.ts` needs **two** files per embedded language:
`parser.wasm` and `highlights.scm`. The prebuilt-WASM npm packages ship
only the `.wasm` — verified, not assumed: `@lumis-sh/wasm-*`,
`@vscode/tree-sitter-wasm`, `@repomix/tree-sitter-wasms` and
`tree-sitter-wasms` all publish `out/*.wasm` and no `queries/`. So the
parser comes from npm and the query is vendored here, alongside the
upstream `LICENSE` (all five grammars are MIT, which permits
redistribution with the notice attached).

Layout, one directory per language:

    <lang>/highlights.scm   copied verbatim from <upstreamRepo>@<upstreamRev>/queries/highlights.scm
    <lang>/LICENSE          copied verbatim from <upstreamRepo>@<upstreamRev>/LICENSE

`grammars.json` is the single source of truth: npm package + pinned
version, upstream repo, tag and revision, and the query path taken.
`app-bin/stage-embedded-grammars.mjs` reads it to stage
`resources/embedded-grammars/<lang>/{parser.wasm,highlights.scm,LICENSE}`,
which is what ships in the `.vsix` and what the loader scans.

## Refreshing a grammar

Deliberate, and always both halves at once — a `highlights.scm` from a
different revision than the WASM silently stops matching node names:

1. `npm install --save-exact @lumis-sh/wasm-<lang>@<new>`
2. Read the new package's `package.json` → `lumis.upstreamVersion` and
   `lumis.rev`.
3. Re-download `queries/highlights.scm` and `LICENSE` from
   `<upstreamRepo>` at that **rev** into `<lang>/`.
4. Update the language's entry in `grammars.json` (`npmVersion`,
   `upstreamTag`, `upstreamRev`).
5. `npm run test:unit` — `test/unit/embeddedGrammars.test.ts` re-checks
   that manifest, npm pin, staged files, parser ABI and query all agree.

## Why these packages

`@lumis-sh/wasm-*` is versioned on the tree-sitter release line
(`0.26.x`) that `web-tree-sitter` is pinned to, records the exact
upstream grammar revision it was built from, is MIT, and is the only
source found that covers all five languages this extension bundles.
The alternatives were rejected on evidence:

| candidate | verdict |
| --- | --- |
| `tree-sitter-wasms` (Gregoor), `@sourcegraph/tree-sitter-wasms` | built with tree-sitter-cli 0.20/0.21; `Language.load` **throws** in `getDylinkMetadata` under `web-tree-sitter` 0.26 — incompatible, not merely old |
| `@vscode/tree-sitter-wasm` | ABI 15, loads fine, but ships no `json` grammar |
| `@repomix/tree-sitter-wasms` | ABI 15, loads fine, but ships neither `bash` nor `json` |
