# Jasper Tools

`jasper-tools/` owns Jasper's tool registry and generated tools.

Current contents:

- `src/registry.js`: Jasper-owned tool registry
- `src/generator.js`: generated tool scaffolding and registry metadata updates
- `src/tools/identity-summary.js`: returns Jasper identity state
- `src/tools/recent-memory.js`: returns recent memory events
- `src/tools/semantic-memory-search.js`: runs semantic memory retrieval
- `generated/registry.json`: generated-tool registration metadata

The registry remains outside upstream Codex so Jasper tools can evolve independently and later be packaged as an open extension surface.
