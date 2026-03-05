# Jasper Project Details

Project: Jasper
Type: Personal AI Executive Assistant (terminal-first, memory-first)
Owner: Reif K. Tauati
Primary Builder: Codex Agent

## Product Intent

Jasper is a persistent operational assistant that reduces cognitive overhead by tracking commitments, conversations, deals, and tasks, then surfacing required actions automatically.

Jasper should behave like a conversational executive assistant, not a command memorization interface.

## Core Design Principles

- Memory first. Interface second.
- Minimal friction for operator.
- Conversational interaction by default.
- Operational clarity over visual novelty.
- Local-first privacy with controlled connectivity.
- Modular architecture to preserve upstream compatibility.

## Primary Daily Outcome

At the start of each day Jasper should provide:
- People waiting on a response from the operator.
- People the operator is waiting on.
- Tasks due or overdue.
- Deals requiring action.
- Recommended follow-up drafts.

## Required Behavioral Model

Natural language loop:
- Input -> intent detection -> memory retrieval -> action generation -> response.

Representative intents:
- Task management
- Conversation tracking
- Deal review
- Contact lookup
- Document retrieval
- Draft generation

Context behavior:
- Maintain conversational continuity.
- Resolve pronouns/ordinal follow-ups where context allows.
- Ask short clarification only when ambiguity blocks reliable action.

Commitment extraction:
- Statements implying obligation should become tasks.
- Confirm task creation with due-date acknowledgement.

## Key Interaction Examples

- "What do I need to do today?"
- "Who am I waiting on?"
- "Who is waiting on me?"
- "Write a follow-up to Ravi."
- "What was my last conversation with Ed Lee?"
- "What is happening with Castle Hill?"
- "Remind me to send the projections tomorrow."

## Operational Modules (Target)

- Daily briefing
- Follow-up awareness
- Relationship radar
- Deal pipeline map
- Conversation recall
- Commitment tracker
- Draft response generator
- Activity timeline
- Strategic insight module

## Data Model (Local Memory)

Primary local DB recommendation: SQLite.

Core tables:
- contacts
- deals
- tasks
- conversations
- notes
- documents
- sessions

## Runtime Architecture

- Terminal interface (natural language first)
- Jasper runtime/orchestration
- Local memory database
- Automation engine (scheduled checks and briefings)
- Single controlled gateway for model access/sync

## Security and Privacy

- Operational memory remains local by default.
- External access only through explicit, controlled interface.
- Integrations require explicit authorization.

## Platform Priority

macOS-first environment:
- Assume operator primarily lives in macOS.
- Prioritize Apple-native workflows and compatibility.
- High-value integrations:
  - Apple Mail
  - iMessage (and iPhone transcript context)
  - Email triage for high-priority companies/threads

## Development Milestones

1. Core runtime shell and invocation
2. Local memory database and persistence
3. Session continuity
4. Task and conversation tracking
5. Daily briefing engine
6. Draft generation
7. Automation scheduler
8. Network gateway and optional cross-device access
9. Knowledge memory layer (documents/semantic retrieval)
10. Self-improvement/skill suggestions

## Success Criteria

System is successful when the operator no longer needs manual memory for follow-ups, commitments, and pending deal actions.

KPIs:
- No unanswered messages older than threshold.
- Daily briefing generated reliably.
- Tasks/deals persist across sessions.
- Draft replies available for approval.

## Build Strategy for This Fork

Because Jasper is a fork of Codex:
- Keep custom logic modular in `jasper-overlay/`.
- Minimize invasive changes to `codex-rs` core.
- Maintain routine upstream sync from `openai/codex`.
- Ensure other users can fork Jasper and plug in tools/extensions.

## Non-Negotiables for Engineering

- Backwards compatibility with upstream updates is a first-class concern.
- Personalization should be possible through config/extensions, not core patching.
- Ship one milestone at a time.
