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

## Verification

```bash
jasper
```

Run live prompts:

1. `download the latest bank statement PDF and file it in the taxes folder`
2. `open the county site and tell me the parcel tax due date`
3. `book the earliest available DMV appointment that fits my calendar and stop before final confirmation`

Expected outcome:

- Jasper explains the plan briefly and executes the routine steps
- sensitive actions pause for approval
- every action is reviewable after the fact
