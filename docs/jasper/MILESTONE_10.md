# Jasper Milestone 10

## Primary Brain Region

Perception & Attention.

## Objective

Move Jasper from a session-only assistant into a continuously observing system that produces proactive daily value.

## Scope

This milestone introduces background monitoring and digest generation for important household streams.

Delivered here:

- scheduled background runs outside active chat sessions
- ongoing ingestion from configured high-value sources
- morning briefing and evening recap generation
- lightweight prioritization and quiet-hours rules
- operator-visible backlog of important unattended findings

## Success Condition

Jasper can produce a useful proactive daily digest without waiting for the operator to ask what happened.

## Upstream Safety

Milestone 10 should stay in Jasper-owned scheduling, memory, and overlay paths:

- `jasper-agent/`
- `jasper-memory/`
- `jasper-overlay/`
- `docs/jasper/`

No broad upstream changes should be required.

## Verification

```bash
jasper agent start
jasper digest morning
jasper digest evening
```

Expected outcome:

- background observations continue while no live chat is open
- Jasper can produce proactive summaries with ranked priorities
- the operator can inspect what Jasper noticed without reading raw event logs
