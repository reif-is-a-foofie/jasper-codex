# Jasper Milestone 20

## Primary Brain Region

Perception & Attention.

## Objective

Make Jasper useful away from the terminal through mobile capture, alerting, and interrupt intelligence.

## Scope

This milestone gives Jasper a mobile presence that preserves focus instead of just mirroring terminal chat.

Delivered here:

- quick-capture flows from phone for tasks, notes, photos, and voice
- push notifications with severity and timing rules
- interruption scoring for what deserves immediate attention
- mobile review surfaces for approvals, digests, and critical alerts
- continuity between mobile capture and the terminal operating view

## Success Condition

Jasper can help the operator while moving through the day without becoming another noisy notification source.

## Upstream Safety

Milestone 20 should stay mostly Jasper-owned:

- `jasper-agent/`
- `jasper-overlay/`
- `docs/jasper/`

Mobile clients can remain separate product surfaces that consume Jasper-owned APIs.

## Verification

```bash
jasper mobile inbox
jasper notify test critical
```

Expected outcome:

- mobile captures land in Jasper memory immediately
- urgent alerts break through correctly while low-value noise stays quiet
- mobile and terminal views stay in sync
