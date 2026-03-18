# Jasper Milestone 17

## Primary Brain Region

Executive & Action.

## Objective

Give Jasper real leverage over finance and household operations while preserving approval boundaries.

## Scope

This milestone adds bill management, subscription awareness, and recurring operational follow-through.

Delivered here:

- bill and subscription inventory with due dates and owners
- cash-outflow summaries and anomaly detection for recurring charges
- approval-aware payment and cancellation workflows
- renewal and service-deadline reminders with escalation
- operational dashboards for recurring household obligations

## Success Condition

Jasper can reduce missed payments, forgotten renewals, and wasted subscription spend without taking unsanctioned financial action.

## Upstream Safety

Milestone 17 should remain primarily Jasper-owned:

- `jasper-agent/`
- `jasper-tools/`
- `jasper-memory/`
- `docs/jasper/`

## Verification

```bash
jasper finance due
jasper
```

Run live prompts:

1. `what bills are due in the next 10 days`
2. `show me subscriptions we should review this month`
3. `cancel the gym membership and stop before final confirmation`

Expected outcome:

- Jasper can surface real financial obligations quickly
- risky actions require approval
- recurring household obligations stop slipping through the cracks
