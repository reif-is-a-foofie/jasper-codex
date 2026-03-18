# Jasper Milestone 3

## Primary Brain Region

Executive & Action.

## Objective

Give Jasper a standalone tool framework that can execute modular actions without depending on upstream Codex internals.

## Scope

This milestone starts the tool-execution layer with a Jasper-owned registry and example tools.

Delivered here:

- a tool registry in `jasper-tools/src/registry.js`
- three callable example tools:
  - `identity-summary`
  - `recent-memory`
  - `semantic-memory-search`
- CLI access through `jasper-agent/src/cli.js`
- overlay access through `jasper-overlay/bin/jasper.js`

## Success Condition

Jasper can list tools and execute at least one useful tool action through its own runtime layer.

## Upstream Safety

Milestone 3 stays in Jasper-owned paths:

- `jasper-tools/`
- `jasper-agent/`
- `jasper-overlay/`
- `docs/jasper/`

No new upstream Codex patches are required.

## Verification

```bash
node jasper-agent/src/cli.js tools list
node jasper-agent/src/cli.js tools run identity-summary
node jasper-agent/src/cli.js tools run semantic-memory-search --memory-root /tmp/jasper-memory-check --query "household operations"
node jasper-overlay/bin/jasper.js tools list
```
