# Lex for VS Code

VS Code extension for [Lex](https://github.com/lex-fmt/lex) — a plain text format for structured documents.

**[lex.ing](https://lex.ing)** — project site, specs, and documentation.

## Features

All language features are provided by `lex-lsp` — no TypeScript-side language logic:

- Semantic highlighting (monochrome theme, adapts to light/dark)
- Document symbols and outline
- Formatting
- Completion
- Diagnostics
- Hover
- Go to definition and references
- Folding and document links

### Export & Convert

- **Lex: Export to Markdown** — convert `.lex` to Markdown (opens in new editor)
- **Lex: Export to HTML** — convert `.lex` to HTML (opens in new editor)
- **Lex: Export to PDF** — convert `.lex` to PDF (save dialog)
- **Lex: Convert to Lex** — convert `.md` to Lex format

### Live Preview

- **Lex: Open Preview** / **Lex: Open Preview to the Side** — live HTML preview that updates as you type

## Install

Install from the VS Code Marketplace (search "Lex") or build from source:

```sh
npm ci
npm run build
npx vsce package
```

## Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| `lex.cliBinaryPath` | Path to the `lex` CLI binary | `./resources/lex` (bundled) |

## Development

```sh
npm ci
npm run lint && npm run build
npm test
./test/run_suite.sh --format=simple
```

See `README.lex` for architecture details.

## License

MIT
