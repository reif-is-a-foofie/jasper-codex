# Jasper Milestone 25

## Primary Brain Region

Executive & Action.

## Objective

Make Jasper a genuine strategic planning engine, not just a fast operator console.

## Scope

This milestone adds durable review and planning loops across weeks, months, and quarters.

Delivered here:

- weekly review generation from live household and project state
- quarterly planning support tied to commitments, capacity, and risks
- explicit goals, bets, and tradeoff tracking
- plan-versus-reality review surfaces
- strategy handoff from planning into workflows and daily execution

## Success Condition

Jasper can help the operator decide what to do next month and quarter, not only what to do next hour.

## Upstream Safety

Milestone 25 should remain in Jasper-owned planning and memory surfaces:

- `jasper-agent/`
- `jasper-memory/`
- `jasper-overlay/`
- `docs/jasper/`

## Verification

```bash
jasper review weekly
jasper plan quarter
jasper priorities audit
```

Expected outcome:

- Jasper can turn raw activity into strategic review
- priorities stay connected to actual execution load
- long-horizon decisions become easier to revisit and refine
