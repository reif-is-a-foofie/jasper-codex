# Jasper Milestone 19

## Primary Brain Region

Memory & World Model.

## Objective

Expand Jasper from a single-operator tool into a true household coordination system.

## Scope

This milestone introduces person-aware planning, shared responsibilities, and household-safe notification behavior.

Delivered here:

- household member profiles, roles, and preferences
- shared plans, responsibilities, and reminders
- person-aware calendar and communication summaries
- notification targeting and quiet-hours rules by person
- consent boundaries that keep one person's data from leaking into another's view

## Success Condition

Jasper can coordinate household activity without collapsing everything into one undifferentiated stream.

## Upstream Safety

Milestone 19 should remain Jasper-owned:

- `jasper-agent/`
- `jasper-memory/`
- `jasper-overlay/`
- `docs/jasper/`

## Verification

```bash
jasper household status
jasper
```

Run live prompts:

1. `what does the family schedule look like tomorrow`
2. `who still owns open follow-ups for the weekend trip`
3. `only notify me if something changes that affects both calendars`

Expected outcome:

- Jasper can track responsibilities by person
- summaries respect role and consent boundaries
- shared coordination becomes simpler instead of noisier
