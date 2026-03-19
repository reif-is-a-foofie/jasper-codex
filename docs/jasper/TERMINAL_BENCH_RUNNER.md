# Terminal-Bench Runner

## Purpose

This runner makes Jasper's Terminal-Bench workflow repeatable.

It does four things:

- bootstraps a local Terminal-Bench checkout when needed
- bootstraps a local Python virtualenv when needed
- runs `tb run` with Jasper's installed-agent adapter
- optionally imports the resulting score into `jasper audit benchmark-index`

## Basic Usage

Run a single task:

```bash
python3 scripts/run_terminal_bench_with_jasper.py --task-id hello-world
```

Run multiple tasks:

```bash
python3 scripts/run_terminal_bench_with_jasper.py \
  --task-id hello-world \
  --task-id fix-permissions \
  --task-id heterogeneous-dates
```

Run a task and import the measured slice into Jasper's weighted external benchmark index:

```bash
python3 scripts/run_terminal_bench_with_jasper.py \
  --task-id hello-world \
  --import-benchmark-index
```

## Defaults

By default the runner uses:

- Terminal-Bench checkout: `~/.jasper/benchmarks/terminal-bench`
- Terminal-Bench virtualenv: `~/.jasper/benchmarks/terminal-bench-venv`
- run output path: `~/.jasper/data/benchmarks/terminal-bench-runs`
- dataset: `terminal-bench-core==0.1.1`
- model: `openai/gpt-5.4`
- auth file: `~/.codex/auth.json`

## Useful Flags

- `--refresh` pulls the latest Terminal-Bench checkout before running
- `--run-id ID` pins a stable run id instead of auto-generating one
- `--no-cleanup` keeps Docker images around after the run
- `--import-benchmark-index` records the slice score into Jasper's external benchmark index
- `--source-name NAME` overrides the imported source label
- `--notes TEXT` attaches extra notes to the imported benchmark record
- `--dry-run` prints the resolved `tb run` command without executing it

## Notes

- Docker must be available locally because Terminal-Bench runs verifier-backed containers.
- The checked-in adapter lives at `scripts/jasper_tb_agent.py`.
- Jasper's adapter tells the agent to leave long-running services detached and to expect hidden edge-case checks, which matters for tasks like `fibonacci-server`.
