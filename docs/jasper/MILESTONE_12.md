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

Milestone 12 stays within Jasper-owned analysis and notification layers:

- `jasper-agent/`
- `jasper-memory/`
- `jasper-overlay/`
- `docs/jasper/`

## Task checklist

- **Guard status.** Run `jasper guard status` to read the most recent anomalies; each entry must show the category, severity score, and escalation channel so the operator understands why Jasper cares.
- **Simulation drills.** Run `jasper guard simulate suspicious-login` and `jasper guard simulate unexpected-calendar-change` to prove the CLI can raise high- and medium-severity anomalies while creating `guard.anomaly` records in memory for the audit trail (`jasper memory recent --type guard.anomaly`).
- **Contextual escalation.** After the runtime observes alerts (e.g., repeated `listener.session.snapshot`, calendar payloads with “calendar”, or filesystem jumps), confirm `jasper guard status` reports severity-ranked explanations and that the log events include the source event summary recorded in the payload.
- **Quiet windows & sensitivity.** The guard manager respects default quiet hours (22:00–06:00) and per-category sensitivity multipliers so operators can tune noise; verify quiet hours suppress severity by running scenarios at simulated quiet times if needed.
- **Escalation routing.** Every anomaly must include an escalation channel (`critical`, `alert`, or `notice` by default) and a context summary so automation can route the notification to the right operator surface; `jasper guard status` should mention the channel.

## Verification

```bash
jasper guard status
jasper guard simulate suspicious-login
jasper guard simulate unexpected-calendar-change
jasper memory recent --type guard.anomaly
```

Expected outcome:

- Jasper records each anomaly, gives it a severity score, and attaches the escalation channel.
- The CLI exposes context-rich summaries so the operator can act without distracting noise.
- The audit trail (`guard.anomaly` events) explains which event triggered the detection.
