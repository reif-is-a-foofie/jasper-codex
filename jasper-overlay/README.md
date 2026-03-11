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

Packaging:

- `python3 jasper-overlay/scripts/build_package.py --version 0.1.0 --staging-dir /tmp/jasper-package` stages a publishable `jasper-ai` package
- if `codex-cli/vendor` is already hydrated, the packager will bundle it automatically
- add `--vendor-src codex-cli/vendor` to point at a specific vendor tree explicitly
- add `--pack-output /tmp/jasper-ai-0.1.0.tgz` to emit an installable tarball
- the resulting package can be installed with `npm install -g /tmp/jasper-ai-0.1.0.tgz`

Installed package behavior:

- `jasper` launches the bundled Codex binary when `vendor/` is present
- `jasper identity`, `jasper memory`, `jasper dream`, and `jasper tools` work from the packaged Jasper JS modules without requiring a repo checkout
- OpenAI authentication and connector onboarding are not packaged as a guided flow yet; operators still need to complete those steps manually for now

Do not move Jasper behavior into `codex-rs/` or `codex-cli/` unless the core patch gate in `docs/jasper/FORK_STRATEGY.md` is satisfied.
