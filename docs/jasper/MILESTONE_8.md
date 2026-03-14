# Jasper Milestone 8

## Status

Complete.

## Objective

Make Jasper installable and usable by a new operator without relying on manual setup knowledge.

## Scope

This milestone turns the current developer-first setup into a guided product onboarding flow.

Delivered here:

- guided OpenAI credential validation during `jasper setup`
- first-run health checks for runtime, memory, and local semantic dependencies
- persisted runtime configuration that later commands can trust
- automatic resolution or bundling of the Codex executable Jasper needs for first-party web research
- clear first-run remediation when Jasper cannot reach a ready state

## Success Condition

The intended operator path works end to end:

```bash
npm install -g jasper-ai
jasper setup
jasper
```

The operator should not need to read implementation docs to reach a healthy terminal session.

## Upstream Safety

Milestone 8 should stay primarily in Jasper-owned packaging, setup, and overlay paths:

- `jasper-overlay/`
- `jasper-agent/`
- `jasper-core/`
- `docs/jasper/`

Any fork patches should be limited to boot-time configuration seams that Jasper cannot yet own externally.

## Verification

```bash
jasper setup
jasper doctor
jasper
```

Expected outcome:

- setup validates credentials and writes a reusable runtime config
- `jasper doctor` reports a healthy or clearly remediable state
- the first terminal launch reaches a usable Jasper session without extra manual steps
