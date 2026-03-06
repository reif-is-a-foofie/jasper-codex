# Concept Mining From Prior Repos

Date: 2026-03-06
Owner: Reif
Scope: distill reusable architecture from prior agent systems for `jasper-codex`.

## Repos analyzed

- `ocean`
- `megamind`
- `Jarvis`
- `Alma`
- `Jasper` (older)
- `42`
- `Alma-ui-` (UI only, low architecture signal)

Local clones used:
`~/Desktop/not-secret-projects/jasper-concept-mining/*`

## Highest-value reusable patterns

## 1) Contract-driven separation of duties

Observed in:
- `megamind/orchestrator/state_machine.py`
- `megamind/orchestrator/role_enforcer.py`
- `megamind/orchestrator/contract_manager.py`

Core idea:
- Explicit workflow states (`pending -> in_progress -> awaiting_review -> completed`)
- Role-gated actions (Captain assigns, Worker implements, Tester validates)
- Audit trail for transitions and actions

Why this is useful for Jasper:
- Prevents role blur/spec-gaming in autonomous workflows
- Gives deterministic governance around autonomous actions
- Easy to expose as a plugin module, independent of Codex core

Recommendation:
- Implement as a Jasper extension (`workflow-contracts`) with its own store.
- Keep it outside core Codex runtime.

## 2) Stateless role agents with startup contracts

Observed in:
- `megamind/agents/*.mdc`
- `megamind/agents/agents.md`

Core idea:
- Each agent bootstraps from a complete startup instruction file
- No hidden memory assumptions
- Strong sequencing and API-only interaction rules

Why useful:
- Works with context resets/restarts
- Maps well to Codex thread/session model
- Makes behavior portable for other forks/users

Recommendation:
- Keep role packs in `jasper-overlay/extensions/<role-pack>/`.
- Treat each role as a composable instruction bundle.

## 3) Mission + guardrails manifest as policy layer

Observed in:
- `Jarvis/manifesto.yaml`
- `Jarvis/main_graph.py` (`policy_ok` gate)

Core idea:
- Central policy manifest defines allowed actions, forbidden operations, cost/safety constraints
- Every decision is validated before execution

Why useful:
- Gives deterministic safety boundaries
- Decouples policy from prompt text and implementation details

Recommendation:
- Add `~/.jasper/policy.yaml` support in overlay launcher/extensions.
- Route all high-risk actions through policy check middleware.

## 4) Multi-layer memory model (personal + streams + world)

Observed in:
- `Jarvis/checkpoints.md`
- `Alma/backend/enhanced_memory.py`
- `Alma/backend/feed_parsing_system.py`
- `megamind/memory/*`

Core idea:
- Separate memory layers by source and trust:
  - personal conversation memory
  - structured ingestion streams (email/docs/tasks)
  - curated external/research layer
- Query blends layers with recency + relevance

Why useful:
- Matches your local-first assistant requirements
- Prevents mixing noisy external data with personal operational memory

Recommendation:
- Implement `memory-core` extension with source-tagged records and retrieval policies.
- Start with SQLite schema + source namespaces.

## 5) Queue-based worker execution for heavy jobs

Observed in:
- `Alma/backend/moroni.py`
- `Alma/backend/sons_of_helaman.py`

Core idea:
- Dispatcher submits tasks to workers (Celery/Redis pattern)
- Track task status/progress/results separately from chat loop

Why useful:
- Keeps conversational UI responsive
- Enables ingestion/triage/indexing jobs in background

Recommendation:
- Add optional `jobs` extension (SQLite queue first, Redis later)
- Reserve for ingestion and periodic briefings, not simple chat turns

## 6) Dynamic tool registry with capability mapping

Observed in:
- `Alma/backend/tool_registry.py`
- `Jasper/backend/mcp_manager.py` (older prototype)

Core idea:
- Tool discovery, capability tagging, active/failed tool status, fallback selection

Why useful:
- Lets users plug in custom tools without editing core runtime
- Supports community forks with different providers/tooling

Recommendation:
- Define extension manifest contract (already started in `jasper-overlay`).
- Add health/test metadata for each extension tool.

## 7) Stage-based orchestrator with specialist agents

Observed in:
- `ocean/ocean/planner.py`
- `ocean/ocean/agents.py`

Core idea:
- Work partitioned by specialization, phase-ordered execution, explicit eventing

Why useful:
- Good model for multi-step build/ops workflows
- Helps convert broad user prompts into coordinated execution

Recommendation:
- Use this pattern only for complex workflows, not default chat.
- Keep orchestration in a plugin module to minimize upstream conflicts.

## What to avoid carrying forward directly

- Tight coupling to platform-specific deployment assumptions from old repos (Railway/Heroku-first paths).
- Overly symbolic personas as hard runtime dependencies (keep optional and composable).
- Unbounded autonomous tool installation/execution without strict policy gate.
- Large monolithic memory abstractions before validating core operational loop.

## Proposed Jasper adoption sequence (modular, upstream-safe)

1. `policy-core` extension
- Mission/guardrails manifest + action gate.

2. `memory-core` extension
- SQLite source-tagged memory namespaces (`personal`, `streams`, `world`).

3. `workflow-contracts` extension
- Role/state contract engine + audit log.

4. `ingestion-macos` extension
- Read-only Apple Mail/iMessage ingestion into `streams` namespace.

5. `triage-email` extension
- Prioritization + follow-up drafting for high-value threads.

6. `jobs` extension
- Background queue for ingestion/index/briefing jobs.

## Mapping to current fork

Current foundation in `jasper-codex` already aligns:
- modular overlay launcher
- extension manifests
- upstream sync workflow

Next work should implement the above as additive extensions under `jasper-overlay/extensions/` with no invasive changes to `codex-rs` unless unavoidable.
