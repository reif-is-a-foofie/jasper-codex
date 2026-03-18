# Jasper Milestone 11

## Primary Brain Region

Executive & Action.

## Objective

Turn repeated work into reusable Jasper workflows so the system compounds operator throughput instead of only answering one-off prompts.

## Scope

This milestone introduces multi-step routines, approvals, and reusable workflow templates.

Delivered here:

- declarative Jasper workflow definitions
- multi-step orchestration across built-in and connector-backed tools
- approval checkpoints for sensitive actions
- scheduled or event-triggered workflow execution
- reusable routine library for common household and operator tasks

## Success Condition

Jasper can reliably execute repeatable workflows such as:

- daily planning
- inbox triage prep
- meeting prep
- travel checklist generation
- household maintenance follow-up

without requiring the operator to restate the same sequence every time.

## Upstream Safety

Milestone 11 should remain primarily in Jasper-owned orchestration paths:

- `jasper-agent/`
- `jasper-tools/`
- `jasper-overlay/`
- `docs/jasper/`

## Verification

```bash
jasper workflows list
jasper workflows run daily-plan
jasper workflows run inbox-triage
```

Expected outcome:

- Jasper can execute multi-step routines with clear progress and approval boundaries
- the operator can inspect, rerun, and refine workflows over time
