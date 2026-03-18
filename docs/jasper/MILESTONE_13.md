# Jasper Milestone 13

## Primary Brain Region

Memory & World Model.

## Objective

Give Jasper durable strategic memory so long-horizon goals, commitments, and constraints stay coherent across weeks and months.

## Scope

This milestone promotes Jasper from episodic recall into commitment-aware continuity.

Delivered here:

- strategic memory records for goals, commitments, promises, and standing constraints
- periodic consolidation from episodic events and reflections into durable project state
- contradiction and drift detection when new information conflicts with prior commitments
- operator-visible summaries of what Jasper believes is currently true
- confidence tracking for inferred versus explicit facts

## Success Condition

Jasper can answer questions like:

- `what have we committed to recently`
- `what is still open on this project`
- `what changed in my priorities this month`

without relying on fragile thread-local context.

## Upstream Safety

Milestone 13 should remain in Jasper-owned memory and summarization paths:

- `jasper-memory/`
- `jasper-agent/`
- `jasper-overlay/`
- `docs/jasper/`

## Verification

```bash
jasper memory strategic recent
jasper commitments list
jasper commitments audit
```

Expected outcome:

- Jasper can surface strategic state in a stable format
- long-horizon commitments are preserved across sessions
- conflicting updates are visible instead of silently overwriting history
