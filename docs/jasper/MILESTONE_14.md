# Jasper Milestone 14

## Primary Brain Region

Self Model.

## Objective

Make Jasper the operator's default household command center rather than a tool that must be remembered occasionally.

## Scope

This milestone turns Jasper into a terminal-first operating system for planning, execution, review, and protection.

Delivered here:

- a terminal-first operator cockpit with today, alerts, pending approvals, and active workflows
- durable background execution model for Jasper services
- first-class review surfaces for daily state, risks, and pending actions
- packaging and startup behavior that make Jasper feel always available
- explicit benchmark tracking for the `2X` force-multiplier goal

## Success Condition

Jasper becomes the default daily place to:

- see what matters
- act on what matters
- review what changed
- decide what to do next

The operator should feel slower and less informed without it.

## Upstream Safety

Milestone 14 may require the broadest integration work, but Jasper-specific behavior should still remain isolated where possible and justified when it crosses fork boundaries.

## Verification

```bash
jasper
```

Expected outcome:

- Jasper opens into a useful operational view, not just an empty prompt
- pending work, risks, and routines are visible immediately
- daily use naturally flows through Jasper instead of around it
