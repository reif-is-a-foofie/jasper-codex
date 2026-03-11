# Jasper Memory

`jasper-memory/` owns Jasper's multi-layer memory system.

Milestone 2 provides the raw event layer and retrieval foundation.

Current structure:

- `src/event-store.js`: append and retrieval APIs for raw event memory
- `data/events/events.jsonl`: append-only raw event log, created on first write
- `data/embeddings/`: reserved for vector outputs
- `data/clusters/`: reserved for topic grouping
- `data/reflections/`: reserved for nightly reflection outputs

Current capabilities:

- append structured events with source, tags, payload, and session identity
- retrieve recent events
- search relevant events with lightweight keyword scoring
- generate deterministic local embeddings for stored events
- run semantic retrieval without external model dependencies
- generate and persist reflection summaries from recent events

This directory remains Jasper-owned and should absorb future embedding, clustering, and reflection work before any upstream Codex integration is considered.
