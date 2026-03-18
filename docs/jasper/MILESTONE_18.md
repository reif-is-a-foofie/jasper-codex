# Jasper Milestone 18

## Primary Brain Region

Memory & World Model.

## Objective

Ground Jasper in the operator's documents, notes, and records so it can reason from real source material.

## Scope

This milestone turns Jasper memory into a broader knowledge vault with citations and durable document understanding.

Delivered here:

- document ingestion for PDFs, notes, exports, and structured records
- citation-aware retrieval in Jasper answers
- document lifecycle handling for updated, replaced, and archived files
- source confidence and freshness tracking
- operator-visible knowledge spaces for projects, household records, and reference material

## Success Condition

Jasper can answer project and household questions from grounded documents instead of relying on vague recall or thread-local context.

## Upstream Safety

Milestone 18 should stay largely in Jasper-owned memory and retrieval paths:

- `jasper-memory/`
- `jasper-agent/`
- `jasper-tools/`
- `docs/jasper/`

## Verification

```bash
jasper vault ingest ~/Documents/household
jasper
```

Run live prompts:

1. `what does our insurance deductible document actually say`
2. `find the latest contractor quote and compare it to the previous one`
3. `show me the source documents behind this answer`

Expected outcome:

- Jasper cites source material directly
- updated documents replace stale assumptions cleanly
- the operator can inspect why Jasper believes something
