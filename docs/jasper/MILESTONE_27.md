# Jasper Milestone 27

## Primary Brain Region

Executive & Action.

## Objective

Scale Jasper from one reasoning stream into a supervised network of specialized agent workers.

## Scope

This milestone makes multi-agent execution a product feature instead of an implementation trick.

Delivered here:

- project pods with specialized workers for research, coding, ops, and follow-up
- supervisor logic for delegation, review, and merge decisions
- workload routing based on cost, trust, and urgency
- durable agent handoff state across interruptions and restarts
- operator-facing visibility into who is doing what and why

## Success Condition

Jasper can decompose and execute larger projects in parallel while preserving coherence and operator control.

## Upstream Safety

Milestone 27 may touch fork seams, but orchestration behavior should stay Jasper-specific whenever possible.

## Verification

```bash
jasper projects run weekly-reset
jasper agents status
jasper agents review
```

Expected outcome:

- Jasper can delegate bounded work in parallel
- the operator can inspect and redirect worker activity
- merged output remains coherent instead of fragmented
