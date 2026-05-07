<!-- Release notes for the next version. -->
<!-- Updated as work is done; consumed by scripts/create-release. -->

### Changed

- Bumped `lexd-lsp` pin from v0.10.0 to v0.10.5. Headline fixes for the
  document-link surface that VSCode renders as the clickable + underlined
  region for `[bracketed]` references:
  - The link range is now scoped to the bracketed reference itself; a
    paragraph containing a URL or file reference no longer renders end-to-end
    as one giant clickable link.
  - References that appear in a section heading (e.g.
    `1. See [./handlers.lex] for details`) now also contribute clickable
    links — previously the LSP silently dropped them from the
    `documentLink` response.
- Also includes everything else from v0.10.1 through v0.10.5: the
  `include-not-found` diagnostic now points at the offending
  `lex.include` annotation instead of the document head, and `FsLoader`
  picked up symlink-traversal defenses, resource limits
  (`max_total_includes`, `max_file_size`), and rejection of
  platform-absolute include paths.
