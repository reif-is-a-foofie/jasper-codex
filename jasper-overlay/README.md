# Jasper Overlay

`jasper-overlay/` is the primary integration layer for Jasper-specific behavior in this Codex fork.

Use this directory first for:

- identity loading
- prompt composition
- extension registration
- Jasper wrapper commands
- integration glue between Codex and Jasper-owned systems

Current launcher behavior:

- `node jasper-overlay/bin/jasper.js` launches Codex with Jasper branding enabled
- `node jasper-overlay/bin/jasper.js identity` reads Jasper identity config
- `node jasper-overlay/bin/jasper.js runtime` starts the standalone Jasper runtime scaffold
- `node jasper-overlay/bin/jasper.js runtime --watch-path PATH` enables filesystem observation for a target path
- `node jasper-overlay/bin/jasper.js memory recent` inspects Jasper raw event memory
- `node jasper-overlay/bin/jasper.js memory semantic "query"` runs semantic memory lookup
- `node jasper-overlay/bin/jasper.js dream reflect` generates a Jasper reflection record
- `node jasper-overlay/bin/jasper.js tools list` lists registered Jasper tools
- `node jasper-overlay/bin/jasper.js tools generate ...` writes a generated Jasper tool

Do not move Jasper behavior into `codex-rs/` or `codex-cli/` unless the core patch gate in `docs/jasper/FORK_STRATEGY.md` is satisfied.
