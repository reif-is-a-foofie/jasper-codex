# Jasper Milestone 9

## Primary Brain Region

Perception & Attention.

## Status

Active.

## Objective

Make household connectors feel like native Jasper abilities while preserving explicit consent boundaries.

## Scope

This milestone introduces guided connector activation and reliable post-consent operation for household systems.

Delivered here:

- connector discovery and recommendation flows from normal prompts
- one-system-at-a-time consent guidance for mailbox, calendar, and related household tools
- persisted connector approval state through `jasper apps approve` and `jasper apps revoke`
- explicit connector runtime state through `jasper apps activate` and `jasper apps deactivate`
- activation now binds a connector to a concrete preferred provider lane for later broker routing
- connector state remembered in Jasper memory and surfaced in user-facing status
- strong remediation path through `jasper apps` when required access is still missing

## Success Condition

A normal operator can say things like:

- `check tomorrow's calendar`
- `summarize important unread email`
- `what changed on my schedule this week`

and Jasper can either complete the request or route the operator through a clear consent flow without leaking internal provider plumbing.

## Upstream Safety

Milestone 9 should remain mostly Jasper-owned:

- `jasper-agent/`
- `jasper-overlay/`
- `jasper-tools/`
- `docs/jasper/`

If app discovery needs fork support, the patch boundary should stay narrow and Jasper-specific.

## Verification

```bash
jasper apps
jasper apps approve calendar
jasper apps activate calendar
jasper
```

Run live prompts:

1. `check tomorrow's calendar`
2. `summarize my unread important email`
3. `what apps do you need connected for this`

Expected outcome:

- Jasper uses available connectors automatically
- missing connectors trigger a clear consent or `jasper apps` path
- `jasper apps` shows whether Jasper is blocked on approval or activation
- connector approval and activation state persist across later broker inspections and app-status reads
- once approval and activation are complete, the same prompt resolves through Jasper without re-teaching the infrastructure
