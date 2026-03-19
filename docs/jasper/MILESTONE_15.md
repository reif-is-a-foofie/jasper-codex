# Jasper Milestone 15

## Primary Brain Region

Executive & Action.

## Objective

Let Jasper perform real browser and desktop work under explicit operator guardrails.

## Scope

This milestone moves Jasper from advising on computer tasks to carrying them out safely.

Delivered here:

- browser and desktop action plans attached to user requests
- approval-aware execution for navigation, form filling, downloads, and file moves
- session replay and audit trail for every computer-use action
- interruption and takeover rules when the operator wants to steer manually
- recovery flows when web pages, selectors, or applications drift

## Success Condition

The operator can ask Jasper to complete routine computer tasks and Jasper can either do them safely or stop at the correct approval boundary.

## Upstream Safety

Milestone 15 should remain primarily Jasper-owned:

- `jasper-agent/`
- `jasper-tools/`
- `jasper-overlay/`
- `docs/jasper/`

Any fork patches should stay limited to computer-use seams Jasper cannot yet own externally.

## Task checklist

- **Browser execution.** Run `jasper browser run --plan-file browser-plan.json` to execute a real Chrome-backed browser plan that can open pages, wait for selectors, fill fields, click buttons, and capture snapshots.
- **Action plans.** Use `jasper action plan create --action-title "Download statement" --action-context-file browser-plan.json --requires-approval` to log the desired browser task and record it in `memory` under `computer-use.plan`.
- **Approval-aware execution.** Run `jasper action plan list` and `jasper action plan status PLAN_ID` to review the steps, then `jasper action plan approve PLAN_ID` before running `jasper action plan run PLAN_ID` so the automation stops at approval boundaries until authorized.
- **Session replay and audit trail.** Inspect `jasper memory recent --type computer-use.execution` and `jasper memory recent --type computer-use.step` to see the recorded actions, and confirm that every execution entry references the plan ID, stage, and step statuses.
- **Operator takeover.** Use `jasper action plan pending` to surface action plans still waiting for approval, so the operator can steer or cancel them manually.
- **Dashboard visibility.** Run `jasper` (dashboard) and confirm the cockpit lists the digest, connectors, guard alerts, workflows, strategic summary, and new “Action plans” section summarizing the most recent computer-use requests.

## Verification

```bash
jasper browser run --plan-file browser-plan.json
jasper action plan list
jasper action plan create --action-title "Download statement" --action-context-file browser-plan.json --requires-approval
jasper action plan approve PLAN_ID
jasper action plan run PLAN_ID
jasper action plan pending
jasper memory recent --type computer-use.execution
```

Expected outcome:

- Jasper explains the plan and its steps, pauses for approvals, and records what it did in the audit trail.
- The dashboard keeps showing daily state so the operator feels the terminal is now the default command center.
