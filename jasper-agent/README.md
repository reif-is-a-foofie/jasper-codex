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

Milestone 3 begins with:

- a Jasper-owned tool registry in `jasper-tools/`
- callable example tools exposed through `jasper-agent/src/cli.js`

Milestone 4 now includes:

- environment listeners under `jasper-agent/src/listeners/`
- a session snapshot listener
- a polling filesystem listener that writes observations into memory

Milestone 5 begins with:

- dream-state reflection generation over recent memory events
- cluster summaries stored in `jasper-memory/data/clusters/`
- reflection records stored in `jasper-memory/data/reflections/`
