# Jasper Milestone 23

## Primary Brain Region

Regulation & Growth.

## Objective

Give Jasper a self-evaluation and self-correction loop that catches drift before it becomes user-visible failure.

## Scope

This milestone turns Jasper's own quality and reliability into monitored product surfaces.

Delivered here:

- recurring smoke tests for setup, terminal launch, connectors, and high-value workflows
- eval suites tied to milestone outcomes and daily operator tasks
- regression detection from live usage and test history
- self-heal queue for issues Jasper can remediate safely
- operator review surfaces for failures Jasper could not fix alone

## Success Condition

Jasper can notice and correct a meaningful subset of its own operational regressions without waiting for the operator to discover them first.

## Upstream Safety

Milestone 23 should stay primarily Jasper-owned:

- `jasper-agent/`
- `jasper-overlay/`
- `jasper-tools/`
- `docs/jasper/`

## Verification

```bash
jasper evals run daily
jasper self-heal status
jasper smoke terminal
```

Expected outcome:

- Jasper detects broken paths quickly
- safe regressions are corrected automatically
- unsafe or ambiguous failures are escalated with context
