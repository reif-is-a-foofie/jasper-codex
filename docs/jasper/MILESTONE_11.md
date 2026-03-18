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

## Task checklist for connectors and approvals

- CLI workflows: `jasper workflows list` must show `daily-plan` and `inbox-triage`; `jasper workflows run daily-plan --auto-approve` and `jasper workflows run inbox-triage` should walk through each step while the terminal logs the `workflow.execution` events.
- approval gates: the calendar and email steps should pause with `approval_required` unless you pass `--auto-approve`, keeping the connector data protected until consent is granted.
- duct tape: after approving a connector via `jasper apps approve` and `activate`, rerun `jasper workflows run daily-plan` and expect it to finish, confirming the workflow manager respects connector readiness.
- unattended authority: the runtime now schedules `daily-plan` every twelve hours (stage=`scheduled`) and records `workflow.execution` events; inspect recent workflow logs with `jasper memory recent --type workflow.execution` to see the same progress even while you sleep.
