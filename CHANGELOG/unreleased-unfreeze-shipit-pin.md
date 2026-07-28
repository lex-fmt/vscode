- Fixed a silent packaging bug: the `lexd-lsp` version pin sat inside the
  shipit-managed pixi block, which carries only the channel under
  conda-direct, so the next reconcile would have regenerated the block
  without the pin and shipped a `.vsix` with no language server — no error,
  no failing check. The pin now lives outside the managed markers, where the
  consumer owns it.
- The bundled language server moves off the release candidate
  (`0.19.10-rc.1`) onto the real `lexd-lsp 0.19.10`.
- `lexd` — the lex lint gate's tool — now arrives as an ordinary pinned
  dependency of the lint environment instead of being fetched at lint time by
  the retired `shipit provision lexd` command.
- Removed two retired release-automation workflows: the artifact cascade
  receiver and the upstream-released cascade handler. Releases are cut
  through the shipit release pipeline.
- Agent-tooling directories are excluded from the packaged extension. They
  were never payload, and one of them is now a symlinked directory, which
  `vsce package`'s secret scan cannot read — it failed the packaging step
  outright.
