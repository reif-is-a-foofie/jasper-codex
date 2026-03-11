# Jasper Agent

`jasper-agent/` owns Jasper's continuous runtime loop.

Milestone 1 provides:

- runtime bootstrap
- identity-first initialization
- heartbeat loop
- clean shutdown handling

Milestone 2 adds:

- raw event persistence through `jasper-memory/`
- recent-context retrieval on startup
- relevant-memory lookup during runtime ticks
- local semantic retrieval through deterministic embeddings
- CLI memory inspection through `memory recent` and `memory search`
