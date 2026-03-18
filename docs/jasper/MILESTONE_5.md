# Jasper Milestone 5

## Primary Brain Region

Memory & World Model.

## Objective

Introduce a first dream-state system that turns recent memory events into higher-level reflections and reusable clusters.

## Scope

This milestone implements a Jasper-owned reflection generator on top of the existing event and embedding layers.

Delivered here:

- cluster generation from recent memory events
- reflection summaries with recommendations
- persisted outputs in:
  - `jasper-memory/data/clusters/clusters.jsonl`
  - `jasper-memory/data/reflections/reflections.jsonl`
- CLI access through `dream reflect` and `dream recent`

## Success Condition

Jasper can synthesize recent activity into a stored reflection record without relying on upstream Codex services.

## Upstream Safety

Milestone 5 stays in Jasper-owned paths:

- `jasper-memory/`
- `jasper-agent/`
- `jasper-overlay/`
- `docs/jasper/`

No new upstream Codex patches are required.

## Verification

```bash
TMP_MEMORY_ROOT="$(mktemp -d)"
node jasper-agent/src/cli.js start --max-ticks 2 --interval-ms 10 --memory-root "$TMP_MEMORY_ROOT"
node jasper-agent/src/cli.js dream reflect --memory-root "$TMP_MEMORY_ROOT" --limit 10
node jasper-agent/src/cli.js dream recent --memory-root "$TMP_MEMORY_ROOT" --limit 5
node jasper-overlay/bin/jasper.js dream reflect --memory-root "$TMP_MEMORY_ROOT" --limit 10
```
