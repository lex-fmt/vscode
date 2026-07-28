- The release path produces a `.vsix` again. Packaging walked the extension's
  npm dependency graph, which the `@lex/shared` workspace symlink dependency
  broke — every cut died with "Extension entrypoint(s) missing", so the
  completed grammar and language-server migration had no way to ship. The
  packaging step now skips that walk, which a bundled extension never needed:
  its runtime dependencies already live inside the bundle.
