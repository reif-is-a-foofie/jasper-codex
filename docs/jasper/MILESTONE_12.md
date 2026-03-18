# Jasper Milestone 12

## Primary Brain Region

Perception & Attention.

## Objective

Make Jasper a trusted guardian that detects important anomalies and escalates them with useful context.

## Scope

This milestone introduces risk detection, scoring, and escalation behavior across the most important monitored systems.

Delivered here:

- anomaly detection for financial, schedule, mailbox, security, and household operations signals
- risk scoring with severity thresholds
- escalation routing with contextual summaries
- audit trail for why Jasper flagged an issue
- configurable operator sensitivity and quiet windows

## Success Condition

Jasper can detect important abnormalities early and notify the operator with enough context to act, while keeping false-positive noise low enough to remain trusted.

## Upstream Safety

Milestone 12 should stay mainly in Jasper-owned analysis and notification layers:

- `jasper-agent/`
- `jasper-memory/`
- `jasper-overlay/`
- `docs/jasper/`

## Verification

```bash
jasper guard status
jasper guard simulate suspicious-login
jasper guard simulate unexpected-calendar-change
```

Expected outcome:

- Jasper records the anomaly
- Jasper produces a severity-ranked explanation
- Jasper routes the issue through the correct escalation channel
