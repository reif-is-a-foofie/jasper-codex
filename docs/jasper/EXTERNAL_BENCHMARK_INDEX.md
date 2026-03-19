# External Benchmark Index

## Purpose

Jasper should not grade itself only against internal benchmarks.

The external benchmark index is the public-benchmark basket Jasper uses to anchor itself against third-party evaluation suites.

It behaves like an index fund:

- Jasper tracks a weighted basket of public benchmarks
- each benchmark contributes according to a deliberate default weight
- the composite score shows both performance and coverage

This is meant to reduce benchmark cherry-picking.

## Default Basket

The current default basket is:

- `Terminal-Bench` — terminal execution
- `SWE-bench Verified` — software engineering task resolution
- `tau-bench` — tool-agent-user interaction
- `GAIA` — broad assistant reasoning and tool use
- `AppWorld` — multi-app workflow execution
- `WorkArena` — browser-based knowledge work
- `OSWorld` — open-ended computer use
- `macOSWorld` — macOS-native computer use
- `Agent Security Bench` — agent security and attack resistance

## Scoring

The index reports two related numbers:

- `indexScore`: the weighted full-basket score, where missing benchmarks count as zero evidence
- `coveredScore`: the weighted average across only the benchmarks that currently have imported results

This distinction matters:

- `indexScore` answers: how strong is Jasper across the full benchmark basket right now
- `coveredScore` answers: how strong is Jasper on the subset we have actually measured

The report also includes `coveragePercent`, which measures how much of the basket has live results.

## Commands

List the default basket:

```bash
jasper audit benchmark-index list
```

Print a template import file:

```bash
jasper audit benchmark-index scaffold
```

Compute the current weighted index from recorded results:

```bash
jasper audit benchmark-index
```

Import new results from JSON:

```bash
jasper audit benchmark-index import results.json
```

Optionally override weights from a JSON file:

```bash
jasper audit benchmark-index --weights-file weights.json
```

## Import Format

Jasper accepts either:

- a top-level array of result objects
- or an object with `results` and optional `weights`

Example:

```json
{
  "weights": {
    "terminal_bench": 20,
    "swe_bench_verified": 20
  },
  "results": [
    {
      "benchmarkId": "terminal_bench",
      "passed": 82,
      "total": 100,
      "runAt": "2026-03-19T00:00:00.000Z",
      "sourceName": "local-run"
    },
    {
      "benchmarkId": "gaia",
      "accuracy": 0.61,
      "runAt": "2026-03-18T00:00:00.000Z"
    }
  ]
}
```

Supported score fields include:

- `scorePercent`
- `score`
- `accuracy`
- `successRate`
- `passRate`
- `passed` and `total`
- `rawScore` and `maxScore`

## Storage

Imported external benchmark results are stored under Jasper home in:

```text
~/.jasper/data/evals/external-benchmark-results.jsonl
```

Each imported result also records a memory event so Jasper can reason about evaluation history over time.
