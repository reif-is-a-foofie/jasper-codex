# Jasper Milestone 28

## Primary Brain Region

Memory & World Model.

## Objective

Give Jasper a usable model of the operator's world so it can simulate options before acting.

## Scope

This milestone turns Jasper from a planner into a simulator for time, money, commitments, and tradeoffs.

Delivered here:

- scenario modeling for schedules, budgets, and project capacity
- what-if analysis over competing plans
- explicit assumptions behind Jasper recommendations
- tradeoff summaries for time, money, risk, and stress
- simulation history tied to the final decisions that were actually made

## Success Condition

Jasper can help the operator compare serious options before committing, instead of only reacting after a decision is already underway.

## Upstream Safety

Milestone 28 should remain mostly Jasper-owned:

- `jasper-agent/`
- `jasper-memory/`
- `jasper-overlay/`
- `docs/jasper/`

## Verification

```bash
jasper simulate week
jasper compare plan-a plan-b
jasper assumptions review
```

Expected outcome:

- Jasper can show why one option fits better than another
- assumptions are visible instead of hidden in prose
- simulation improves judgment rather than creating false precision
