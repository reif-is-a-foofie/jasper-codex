from __future__ import annotations

import shlex
import tempfile
from pathlib import Path

from terminal_bench.agents.base_agent import AgentResult
from terminal_bench.agents.installed_agents.abstract_installed_agent import (
    AbstractInstalledAgent,
)
from terminal_bench.terminal.models import TerminalCommand


class JasperInstalledAgent(AbstractInstalledAgent):
    @staticmethod
    def name() -> str:
        return "jasper-installed"

    def __init__(self, model_name: str, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._model_name = model_name.split("/")[-1]
        self._codex_version = kwargs.get("codex_version", "0.114.0")
        self._node_version = kwargs.get("node_version", "22.14.0")
        self._repo_root = Path(
            kwargs.get("repo_root", str(Path(__file__).resolve().parents[1]))
        )
        self._auth_path = Path(
            kwargs.get("auth_path", str(Path.home() / ".codex" / "auth.json"))
        )
        self._install_root = Path(kwargs.get("install_root", "/opt/jasper"))
        self._package_dirs = (
            "jasper-agent",
            "jasper-core",
            "jasper-memory",
            "jasper-tools",
            "jasper-overlay",
        )

    @property
    def _env(self) -> dict[str, str]:
        return {"JASPER_CODEX_BIN": "codex"}

    @property
    def _install_agent_script_path(self) -> Path:
        script = f"""#!/bin/bash
set -euo pipefail
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64)
    NODE_ARCH="x64"
    ;;
  aarch64|arm64)
    NODE_ARCH="arm64"
    ;;
  *)
    echo "Unsupported architecture: $ARCH" >&2
    exit 1
    ;;
esac
NODE_VERSION="{self._node_version}"
NODE_DIST="node-v$NODE_VERSION-linux-$NODE_ARCH"
NODE_URL="https://nodejs.org/dist/v$NODE_VERSION/$NODE_DIST.tar.xz"
echo "$NODE_URL" > /tmp/node-download-url.txt
python3 - <<'PY'
import pathlib
import urllib.request

url = pathlib.Path("/tmp/node-download-url.txt").read_text().strip()
destination = pathlib.Path("/tmp/node.tar.xz")
urllib.request.urlretrieve(url, destination)
PY
mkdir -p /opt/node
python3 - <<'PY'
import pathlib
import tarfile

archive_path = pathlib.Path("/tmp/node.tar.xz")
target_root = pathlib.Path("/opt/node")
with tarfile.open(archive_path, "r:xz") as archive:
    archive.extractall(target_root)
PY
export PATH="/opt/node/$NODE_DIST/bin:$PATH"
npm --version
npm install -g @openai/codex@{self._codex_version}
mkdir -p "$HOME/.codex"
cp /installed-agent/auth.json "$HOME/.codex/auth.json"
"""
        handle = tempfile.NamedTemporaryFile(mode="w", suffix=".sh", delete=False)
        handle.write(script)
        handle.close()
        script_path = Path(handle.name)
        script_path.chmod(0o755)
        return script_path

    def _run_agent_commands(self, instruction: str) -> list[TerminalCommand]:
        benchmark_instruction = (
            "Benchmark note: after your turn ends, an automated verifier will run "
            "in a fresh shell. If the task requires a server, worker, watcher, or "
            "any other long-running process, you must leave it running as a "
            "detached background process that stays alive after you finish. "
            "Write logs to a file when practical and verify the service is still reachable "
            "before you finish. Expect hidden tests and harden likely edge cases and invalid "
            "inputs implied by the task, not just the examples explicitly listed.\n\n"
            f"{instruction}"
        )
        escaped_instruction = shlex.quote(benchmark_instruction)
        escaped_install_root = shlex.quote(str(self._install_root))
        escaped_model_name = shlex.quote(self._model_name)
        command = (
            "mkdir -p /agent-logs && "
            f"node {escaped_install_root}/jasper-overlay/bin/jasper.js exec "
            "-C /app "
            "--skip-git-repo-check "
            "--sandbox danger-full-access "
            "--color never "
            f"--model {escaped_model_name} "
            f"--output-last-message /agent-logs/last-message.txt -- {escaped_instruction}"
        )
        return [
            TerminalCommand(
                command=command,
                min_timeout_sec=0.0,
                max_timeout_sec=float("inf"),
                block=True,
                append_enter=True,
            )
        ]

    def perform_task(
        self,
        instruction: str,
        session,
        logging_dir: Path | None = None,
    ) -> AgentResult:
        missing_paths = [
            str(path)
            for path in [self._repo_root, self._auth_path]
            if not path.exists()
        ]
        if missing_paths:
            raise FileNotFoundError(
                "Jasper Terminal-Bench agent is missing required paths: "
                + ", ".join(missing_paths)
            )

        for package_dir in self._package_dirs:
            session.copy_to_container(
                self._repo_root / package_dir,
                container_dir=str(self._install_root / package_dir),
            )

        session.copy_to_container(
            self._auth_path,
            container_dir="/installed-agent",
            container_filename="auth.json",
        )

        return super().perform_task(
            instruction=instruction,
            session=session,
            logging_dir=logging_dir,
        )
