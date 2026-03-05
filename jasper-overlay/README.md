# Jasper Overlay Shell

`jasper-overlay` provides a modular launcher on top of Codex.

Goals:

- keep upstream Codex core untouched as much as possible
- isolate branding and personalization in one place
- allow users to add custom extensions without editing core code

## Install locally

```bash
cd jasper-overlay
./scripts/install_local.sh
```

This installs `~/bin/jasper` pointing to `jasper-overlay/bin/jasper.js`.

## Personalize

Create user files under `~/.jasper/`:

- `config.json` (enable extensions and custom paths)
- `profile.md` (extra startup behavior)
- `extensions/<id>/manifest.json` + instruction files

Example `~/.jasper/config.json`:

```json
{
  "enabledExtensions": ["macos-ops", "email-triage"],
  "extensionPaths": ["~/.jasper/extensions"],
  "codexBin": "codex"
}
```

## Commands

- `jasper` starts Codex TUI with composed Jasper startup prompt
- `jasper <subcommand>` passes through to Codex (`exec`, `review`, etc.)
- `JASPER_START_PROMPT="..." jasper` overrides prompt composition

## Extension contract

See `docs/jasper-modularity.md` for extension/API rules.
