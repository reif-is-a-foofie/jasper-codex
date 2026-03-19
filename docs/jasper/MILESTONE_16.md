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

## Task checklist

- **Comms brief command.** Run `jasper comms brief` and confirm it returns a ranked list of threads with urgency, context, and follow-up notes that fit expectations for the top three responses.
- **Draft replies.** Use `jasper comms draft --voice calm --limit 3` so Jasper can produce drafts that mention actor names, thread summaries, and next step commitments; verify tone and structure resemble the operator’s voice.
- **Follow-up tracking.** Create at least one follow-up with `jasper comms draft` outcome or manual memory event, then run `jasper comms followups` to ensure the brief surfaces overdue follow-ups until marked closed.
- **Dashboard visibility.** Open `jasper` and see the new “Comms brief” section summarizing urgent threads alongside digest, guard alerts, workflows, and action plans so the cockpit covers communications plus operations.
- **Operator control.** Track `jasper action plan` interactions plus manual approvals so messages never move ahead without explicit go-ahead, fulfilling the guardrail requirement.

## Verification

```bash
jasper
jasper comms brief
jasper comms draft --limit 2
jasper comms followups
```

Expected outcome:

- Jasper ranks communication work accurately and keeps drafts grounded in context.
- Follow-ups remain visible until cleared, and the dashboard shows communications alongside digests and workflows.
