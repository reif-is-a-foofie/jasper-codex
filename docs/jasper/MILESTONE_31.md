# Jasper Milestone 31

## Primary Brain Region

Regulation & Growth.

## Objective

Define and operationalize how Jasper should be tested for JARVIS-level quality rather than only benchmark-level competence.

## Scope

This milestone is about the evaluation framework itself.

Delivered here:

- a clear definition of what `JARVIS-level quality` means for Jasper
- a qualification stack that separates public benchmark strength from true long-horizon assistant quality
- private holdout evals for memory, continuity, judgment, trust, and relationship-aware assistance
- longitudinal evals that measure performance over days and weeks instead of only one-shot tasks
- failure taxonomy and scoring rules for when Jasper looks strong on benchmarks but weak in real life
- a promotion bar that states what must be true before Jasper can be called `JARVIS-grade`

## Success Condition

Jasper has a hard, explicit, defensible testing standard for JARVIS-level quality, and the team can explain why a high benchmark score alone is not enough.

## Upstream Safety

Milestone 31 should stay mostly in Jasper-owned planning, evaluation, and documentation surfaces:

- `docs/jasper/`
- `jasper-agent/`
- `jasper-memory/`
- `jasper-overlay/`

## Verification

```bash
jasper audit benchmark-index
jasper audit benchmark-index queue
jasper audit brain-in-a-box
```

Supporting docs to review alongside those commands:

- `docs/jasper/BENCHMARK_QUEUE.md`
- `docs/jasper/EXTERNAL_BENCHMARK_INDEX.md`
- `docs/jasper/BRAIN_IN_A_BOX_TEST.md`

Expected outcome:

- Jasper distinguishes `strong public benchmark performance` from `JARVIS-level quality`
- the missing eval surfaces are explicit
- future milestone work can be prioritized against a real qualification standard
