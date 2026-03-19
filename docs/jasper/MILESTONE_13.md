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

## Task checklist

- **Memory strategic recent.** Run `jasper memory strategic recent --limit 5` to pull goals, commitments, and constraints that already exist as strategic events; confirm the command returns stable summaries, timestamps, and total counts that can be tracked later.
- **Commitments list.** Use `jasper commitments list` and verify the output shows each recorded commitment with subject, status, confidence, and context so Jasper can explain long-horizon promises.
- **Commitments audit.** Run `jasper commitments audit` to highlight contradictions or drift across the recorded commitments; the audit report should note how many entries were analyzed, how many subjects show status drift, and include the `memory.strategic.summary` events that consolidate this information.
- **Drift detection.** Observe that repeating `commitments list` after running `commitments record` (via scheduled automation or workflow reflections) retains history rather than overwriting it, and the audit events note the conflicting statuses instead of silently resetting them.

## Verification

```bash
jasper memory strategic recent
jasper commitments list
jasper commitments audit
jasper memory recent --type memory.strategic.summary
```

Expected outcome:

- Jasper surfaces strategic records in a stable format and creates periodic `memory.strategic.summary` events.
- Long-horizon commitments are preserved, contradictions are flagged, and the output remains consistent across sessions.
- The audit trail explains where drift occurred and keeps the operator informed about true strategic state.
