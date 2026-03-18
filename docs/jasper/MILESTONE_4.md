# Jasper Milestone 4

## Primary Brain Region

Perception & Attention.

## Objective

Make Jasper environment-aware by introducing listener-driven observation that automatically writes to memory.

## Scope

This milestone starts the observation layer with Jasper-owned listeners inside `jasper-agent/`.

Delivered here:

- a session snapshot listener
- a polling filesystem listener
- runtime integration that records listener observations to memory
- CLI support for explicit watch paths

## Current Listener Set

- `listener.session.snapshot`
- `listener.filesystem.snapshot`
- `listener.filesystem.changed`

## Success Condition

Jasper records environment observations automatically while the runtime loop is active.

## Upstream Safety

Milestone 4 stays in Jasper-owned paths:

- `jasper-agent/`
- `jasper-memory/`
- `jasper-overlay/`
- `docs/jasper/`

No new upstream Codex patches are required.

## Verification

```bash
TMP_MEMORY_ROOT="$(mktemp -d)"
TMP_WATCH_ROOT="$(mktemp -d)"
(sleep 0.12; printf "hello\n" > "$TMP_WATCH_ROOT"/note.txt) &
node jasper-agent/src/cli.js start --max-ticks 4 --interval-ms 80 --memory-root "$TMP_MEMORY_ROOT" --watch-path "$TMP_WATCH_ROOT"
node jasper-agent/src/cli.js memory search listener.filesystem.changed --memory-root "$TMP_MEMORY_ROOT" --limit 10
```
