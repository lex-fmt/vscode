- Dropped the retired `version` key from `[artifact-deps.lexd-lsp]` in
  `.shipit.toml`; shipit now rejects it outright (conda-direct, ADR-0077) and
  the pin is consumer-owned in pixi's `shipit-artifacts` feature, where it
  already lived
