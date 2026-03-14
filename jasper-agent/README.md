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
- local-first semantic retrieval with deterministic embeddings
- optional semantic materialization into a local Qdrant collection
- CLI memory inspection through `memory recent`, `memory search`, and `memory materialize`

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

Milestone 6 begins with:

- generated tool specs and modules in `jasper-tools/generated/`
- CLI-driven tool generation from repeatable templates
- broker-backed tool scouting with quarantine/build guidance
- tool acquisition planning for need detection, search, quarantine, and build fallback
- broker-backed acquisition materialization for built-in and Jasper-generated tool paths
- activation state for admitted external providers so later requests can reuse trusted candidates
- a first-party web-research tool that bridges into upstream Codex web search
- runtime tool maintenance that processes Jasper's self-build queue during normal ticks
