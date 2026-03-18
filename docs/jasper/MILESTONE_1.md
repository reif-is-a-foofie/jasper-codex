# Jasper Milestone 1

## Primary Brain Region

Self Model.

## Scope

Build the initial Jasper system skeleton with Jasper-specific code kept outside upstream Codex wherever possible.

This milestone delivers:

- Jasper-owned repository structure
- identity loader
- continuous runtime loop scaffold
- thin Jasper launcher wrapper
- Jasper-branded launch path for the TUI

## Files And Modules

- `jasper-core/config/identity.example.yaml`
- `jasper-core/src/identity.js`
- `jasper-agent/src/runtime.js`
- `jasper-agent/src/cli.js`
- `jasper-overlay/bin/jasper.js`
- `codex-rs/tui/src/branding.rs`

## Verification

Run:

```bash
node jasper-agent/src/cli.js identity
node jasper-agent/src/cli.js start --max-ticks 2 --interval-ms 10
JASPER_CODEX_BIN=/usr/bin/env node jasper-overlay/bin/jasper.js
```

Expected outcome:

- identity loads before the runtime loop starts
- the runtime emits structured lifecycle events
- the overlay wrapper launches the Jasper-branded Codex path
- Jasper launch sets `JASPER_BRANDED=1`

## Upstream Safety

Most of the milestone stays in Jasper-owned paths.

A small TUI patch is used for Jasper-only visible branding and is gated by `JASPER_BRANDED=1`.

See `docs/jasper/BRANDING.md` for the rationale and patch boundary.
