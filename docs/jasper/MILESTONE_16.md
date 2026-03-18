# Jasper Milestone 16

## Primary Brain Region

Executive & Action.

## Objective

Make Jasper the operator's communications chief of staff across inboxes, messages, and meetings.

## Scope

This milestone turns communication handling into a proactive Jasper surface instead of an endless manual loop.

Delivered here:

- unified triage across email, messages, and meeting follow-ups
- draft generation that reflects operator voice and relationship context
- follow-up tracking for unanswered threads and pending commitments
- meeting prep and post-meeting action extraction
- communication priority rules that suppress noise while surfacing what matters

## Success Condition

Jasper can keep the operator's communication surface under control without making the operator reread or rewrite everything personally.

## Upstream Safety

Milestone 16 should stay mostly Jasper-owned:

- `jasper-agent/`
- `jasper-tools/`
- `jasper-memory/`
- `docs/jasper/`

## Verification

```bash
jasper comms brief
jasper
```

Run live prompts:

1. `summarize what needs replies today`
2. `draft replies for the top three threads in my voice`
3. `what follow-ups are overdue from last week's meetings`

Expected outcome:

- Jasper ranks communication work accurately
- drafts are grounded in thread context and prior relationship tone
- unanswered commitments stay visible until closed
