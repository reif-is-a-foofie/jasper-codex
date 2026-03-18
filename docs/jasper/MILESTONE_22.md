# Jasper Milestone 22

## Primary Brain Region

Regulation & Growth.

## Objective

Turn Jasper into an extensible platform with installable skills, apps, and packaged integrations.

## Scope

This milestone opens Jasper beyond first-party development while keeping the operator experience coherent.

Delivered here:

- signed or trusted install flows for Jasper skills and apps
- extension discovery and rating surfaces
- stable packaging conventions for third-party capabilities
- platform APIs for memory, workflows, notifications, and approvals
- compatibility policy for community and private extensions

## Success Condition

Operators and contributors can extend Jasper without forking the whole product or breaking trust boundaries.

## Upstream Safety

Milestone 22 should remain mostly Jasper-owned:

- `jasper-tools/`
- `jasper-agent/`
- `jasper-overlay/`
- `docs/jasper/`

## Verification

```bash
jasper apps browse
jasper skills install example-skill
jasper apps doctor
```

Expected outcome:

- extensions install cleanly
- Jasper can explain what each extension can access
- platform growth does not degrade the daily operator experience
