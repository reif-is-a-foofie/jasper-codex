#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import os
import shlex
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TERMINAL_BENCH_DIR = Path.home() / ".jasper" / "benchmarks" / "terminal-bench"
DEFAULT_VENV_DIR = Path.home() / ".jasper" / "benchmarks" / "terminal-bench-venv"
DEFAULT_OUTPUT_PATH = (
    Path.home() / ".jasper" / "data" / "benchmarks" / "terminal-bench-runs"
)
DEFAULT_AUTH_PATH = Path.home() / ".codex" / "auth.json"
DEFAULT_DATASET = "terminal-bench-core==0.1.1"
DEFAULT_MODEL = "openai/gpt-5.4"
DEFAULT_TERMINAL_BENCH_REPO_URL = "https://github.com/laude-institute/terminal-bench.git"
DEFAULT_TERMINAL_BENCH_SOURCE_URL = "https://github.com/laude-institute/terminal-bench"
DEFAULT_AGENT_IMPORT_PATH = "jasper_tb_agent:JasperInstalledAgent"


def run_command(command: list[str], *, cwd: Path | None = None, env: dict[str, str] | None = None) -> None:
    printable = shlex.join(command)
    if cwd is not None:
        print(f"$ (cd {shlex.quote(str(cwd))} && {printable})", flush=True)
    else:
        print(f"$ {printable}", flush=True)
    subprocess.run(command, check=True, cwd=cwd, env=env)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run Terminal-Bench with Jasper's installed-agent adapter.",
    )
    parser.add_argument("--dataset", default=DEFAULT_DATASET)
    parser.add_argument(
        "--task-id",
        action="append",
        dest="task_ids",
        default=[],
        help="Run only the given task id. Repeat to run multiple tasks.",
    )
    parser.add_argument("--run-id")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--terminal-bench-dir", type=Path, default=DEFAULT_TERMINAL_BENCH_DIR)
    parser.add_argument("--venv-dir", type=Path, default=DEFAULT_VENV_DIR)
    parser.add_argument("--output-path", type=Path, default=DEFAULT_OUTPUT_PATH)
    parser.add_argument("--auth-path", type=Path, default=DEFAULT_AUTH_PATH)
    parser.add_argument("--repo-root", type=Path, default=REPO_ROOT)
    parser.add_argument("--install-root", default="/opt/jasper")
    parser.add_argument("--codex-version", default="0.114.0")
    parser.add_argument("--node-version", default="22.14.0")
    parser.add_argument("--terminal-bench-repo-url", default=DEFAULT_TERMINAL_BENCH_REPO_URL)
    parser.add_argument("--n-concurrent", type=int, default=1)
    parser.add_argument(
        "--cleanup",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Remove Docker images after the run.",
    )
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="Pull the latest terminal-bench checkout before running.",
    )
    parser.add_argument(
        "--import-benchmark-index",
        action=argparse.BooleanOptionalAction,
        default=False,
        help="Import the run summary into `jasper audit benchmark-index`.",
    )
    parser.add_argument(
        "--source-name",
        help="Override the sourceName written when importing benchmark-index results.",
    )
    parser.add_argument(
        "--notes",
        help="Extra notes to include when importing benchmark-index results.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the resolved configuration and exit without running the harness.",
    )
    return parser.parse_args()


def default_run_id(task_ids: list[str]) -> str:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    task_part = "-".join(task_ids) if task_ids else "full-dataset"
    safe_task_part = "".join(
        character if character.isalnum() or character in {"-", "_"} else "-"
        for character in task_part
    )
    return f"jasper-terminal-bench-{safe_task_part}-{timestamp}"


def ensure_required_paths(args: argparse.Namespace) -> None:
    if not args.auth_path.exists():
        raise SystemExit(
            f"Missing Codex auth file at {args.auth_path}. Authenticate first."
        )
    if not (args.repo_root / "jasper-overlay" / "bin" / "jasper.js").exists():
        raise SystemExit(
            f"Repo root does not look like Jasper: {args.repo_root}"
        )


def ensure_terminal_bench_checkout(args: argparse.Namespace) -> bool:
    checkout_dir = args.terminal_bench_dir
    checkout_dir.parent.mkdir(parents=True, exist_ok=True)
    if not checkout_dir.exists():
        run_command(
            ["git", "clone", args.terminal_bench_repo_url, str(checkout_dir)]
        )
        return True
    if not (checkout_dir / ".git").exists():
        raise SystemExit(
            f"Terminal-Bench directory exists but is not a git checkout: {checkout_dir}"
        )
    if args.refresh:
        run_command(["git", "-C", str(checkout_dir), "pull", "--ff-only"])
    return False


def ensure_terminal_bench_venv(args: argparse.Namespace, *, reinstall: bool) -> Path:
    venv_python = args.venv_dir / "bin" / "python"
    venv_pip = args.venv_dir / "bin" / "pip"
    tb_executable = args.venv_dir / "bin" / "tb"

    created = False
    if not venv_python.exists():
        args.venv_dir.parent.mkdir(parents=True, exist_ok=True)
        run_command([sys.executable, "-m", "venv", str(args.venv_dir)])
        created = True

    if created or reinstall or not tb_executable.exists():
        run_command([str(venv_python), "-m", "pip", "install", "--upgrade", "pip"])
        run_command([str(venv_pip), "install", "-e", str(args.terminal_bench_dir)])

    if not tb_executable.exists():
        raise SystemExit(f"Terminal-Bench executable not found at {tb_executable}")
    return tb_executable


def build_environment(args: argparse.Namespace) -> dict[str, str]:
    pythonpath_parts = [str(args.repo_root / "scripts"), str(args.terminal_bench_dir)]
    existing_pythonpath = os.environ.get("PYTHONPATH")
    if existing_pythonpath:
        pythonpath_parts.append(existing_pythonpath)

    env = os.environ.copy()
    env["PYTHONPATH"] = os.pathsep.join(pythonpath_parts)
    return env


def build_tb_command(args: argparse.Namespace, tb_executable: Path) -> list[str]:
    run_id = args.run_id or default_run_id(args.task_ids)
    args.run_id = run_id
    args.output_path.mkdir(parents=True, exist_ok=True)

    command = [
        str(tb_executable),
        "run",
        "--dataset",
        args.dataset,
        "--agent-import-path",
        DEFAULT_AGENT_IMPORT_PATH,
        "--model",
        args.model,
        "--output-path",
        str(args.output_path),
        "--run-id",
        run_id,
        "--n-concurrent",
        str(args.n_concurrent),
        "--agent-kwarg",
        f"repo_root={args.repo_root}",
        "--agent-kwarg",
        f"auth_path={args.auth_path}",
        "--agent-kwarg",
        f"install_root={args.install_root}",
        "--agent-kwarg",
        f"codex_version={args.codex_version}",
        "--agent-kwarg",
        f"node_version={args.node_version}",
        "--no-upload-results",
    ]
    command.append("--cleanup" if args.cleanup else "--no-cleanup")
    for task_id in args.task_ids:
        command.extend(["--task-id", task_id])
    return command


def load_results(results_path: Path) -> dict:
    if not results_path.exists():
        raise SystemExit(f"Expected results file was not produced: {results_path}")
    with results_path.open("r", encoding="utf8") as handle:
        return json.load(handle)


def latest_run_time(results: dict) -> str:
    timestamps = [
        result.get("trial_ended_at")
        for result in results.get("results", [])
        if result.get("trial_ended_at")
    ]
    if timestamps:
        return max(timestamps)
    return datetime.now(timezone.utc).isoformat()


def default_source_name(args: argparse.Namespace) -> str:
    if args.task_ids:
        return (
            "terminal-bench "
            f"{args.dataset} tasks={','.join(args.task_ids)}"
        )
    return f"terminal-bench {args.dataset}"


def default_notes(args: argparse.Namespace, results: dict) -> str:
    parts = [
        f"Run ID {args.run_id}.",
        f"Resolved {results.get('n_resolved', 0)}/{len(results.get('results', []))} tasks.",
    ]
    if args.task_ids:
        parts.append(f"Tasks: {', '.join(args.task_ids)}.")
    return " ".join(parts)


def import_benchmark_index(args: argparse.Namespace, results: dict) -> None:
    payload = {
        "schemaVersion": 1,
        "results": [
            {
                "benchmarkId": "terminal_bench",
                "passed": results.get("n_resolved", 0),
                "total": len(results.get("results", [])),
                "runAt": latest_run_time(results),
                "sourceName": args.source_name or default_source_name(args),
                "sourceUrl": DEFAULT_TERMINAL_BENCH_SOURCE_URL,
                "notes": args.notes or default_notes(args, results),
            }
        ],
    }

    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".json", delete=False, encoding="utf8"
    ) as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")
        temp_path = Path(handle.name)

    try:
        jasper_cli = args.repo_root / "jasper-overlay" / "bin" / "jasper.js"
        run_command(
            [
                "node",
                str(jasper_cli),
                "audit",
                "benchmark-index",
                "import",
                str(temp_path),
            ]
        )
        run_command(["node", str(jasper_cli), "audit", "benchmark-index"])
    finally:
        temp_path.unlink(missing_ok=True)


def print_run_summary(results: dict, results_path: Path) -> None:
    total = len(results.get("results", []))
    resolved = results.get("n_resolved", 0)
    accuracy = results.get("accuracy", 0) * 100
    print(
        f"Summary: resolved {resolved}/{total} tasks "
        f"({accuracy:.2f}% accuracy).",
        flush=True,
    )
    print(f"Results file: {results_path}", flush=True)


def main() -> int:
    args = parse_args()
    ensure_required_paths(args)
    created_checkout = ensure_terminal_bench_checkout(args)
    tb_executable = ensure_terminal_bench_venv(
        args,
        reinstall=created_checkout or args.refresh,
    )
    env = build_environment(args)
    command = build_tb_command(args, tb_executable)
    results_path = args.output_path / args.run_id / "results.json"

    print(f"Run ID: {args.run_id}", flush=True)
    print(f"Results path: {results_path}", flush=True)

    if args.dry_run:
        print("Dry run only. Resolved command:", flush=True)
        print(shlex.join(command), flush=True)
        return 0

    run_command(command, cwd=args.terminal_bench_dir, env=env)
    results = load_results(results_path)
    print_run_summary(results, results_path)

    if args.import_benchmark_index:
        import_benchmark_index(args, results)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
