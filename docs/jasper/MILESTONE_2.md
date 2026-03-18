# Jasper Milestone 2

## Primary Brain Region

Memory & World Model.

## Objective

Establish the first persistent Jasper memory layer without increasing merge pressure on upstream Codex.

## Scope

This milestone implements the first usable memory stack described in `docs/jasper/PROJECT_DETAILS.md`.

Delivered here:

- append-only event storage in `jasper-memory/data/events/events.jsonl`
- a Jasper-owned event store API in `jasper-memory/src/event-store.js`
- deterministic local embeddings in `jasper-memory/data/embeddings/events.jsonl`
- a second-stage semantic materialization path into local Qdrant
- runtime lifecycle persistence for initialize, start, tick, and stop events
- recent, keyword, and semantic event retrieval through the Jasper CLI

Deferred to later memory work:

- topic clustering
- nightly reflections

## Event Contract

Each stored event includes:

- `id`
- `ts`
- `type`
- `source`
- `tags`
- `session.id`
- `payload`

This keeps the raw event layer stable while later memory tiers derive richer artifacts from the same base log.

Embedding records include:

- `eventId`
- `dimension`
- `text`
- `vector`

## Runtime Integration

`jasper-agent/` now writes lifecycle events into `jasper-memory/`, records deterministic embeddings for each event, and loads recent context before the runtime loop begins.

Raw events remain the source of truth. `jasper memory materialize` can push those derived embeddings into a local Qdrant index later, and semantic retrieval falls back to local deterministic vectors when that index is unavailable.

## Upstream Safety

Milestone 2 stays entirely in Jasper-owned paths:

- `jasper-memory/`
- `jasper-agent/`
- `jasper-overlay/`
- `docs/jasper/`

No new upstream Codex patches were required.

## Verification

Targeted validation commands:

```bash
node jasper-agent/src/cli.js start --max-ticks 2 --interval-ms 10 --memory-root /tmp/jasper-memory-check
node jasper-agent/src/cli.js memory recent --memory-root /tmp/jasper-memory-check --limit 5
node jasper-agent/src/cli.js memory search runtime --memory-root /tmp/jasper-memory-check --limit 5
node jasper-agent/src/cli.js memory materialize --memory-root /tmp/jasper-memory-check
node jasper-agent/src/cli.js memory semantic "household operations" --memory-root /tmp/jasper-memory-check --limit 5
node jasper-overlay/bin/jasper.js memory recent --memory-root /tmp/jasper-memory-check --limit 3
```
