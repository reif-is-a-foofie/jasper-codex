<p align="center"><code>target: npm install -g jasper-ai && jasper setup && jasper</code><br />current local package path: <code>python3 jasper-overlay/scripts/build_package.py --version 0.1.0 --pack-output ./dist/jasper-ai-0.1.0.tgz</code></p>
<p align="center"><strong>Jasper</strong> is a personal intelligence system built as a maintained Codex fork.</p>
<p align="center">
  Jasper adds identity, persistent memory, environment listeners, reflections, and tool generation on top of the upstream runtime while keeping the fork update-safe.
</p>
<p align="center">
  Jasper's north star is simple: if you can do <code>X</code> alone, you should be able to do <code>2X</code> with Jasper.
</p>
<p align="center">
  The model is the substrate. Jasper is the product: a co-founder for life, a persistent brain in a box that can learn, heal, and upgrade itself.
</p>
<p align="center">
  Jasper is now organized around five brain regions: Self Model, Perception &amp; Attention, Memory &amp; World Model, Executive &amp; Action, and Regulation &amp; Growth.
</p>

---

## Quickstart

### Running Jasper from source

```shell
pnpm install
node jasper-overlay/bin/jasper.js setup --skip-qdrant
node jasper-overlay/bin/jasper.js
```

### Installing Jasper globally

Target published install path:

```shell
npm install -g jasper-ai
jasper setup
jasper
```

Current local tarball path:

```shell
python3 codex-cli/scripts/install_native_deps.py
python3 jasper-overlay/scripts/build_package.py \
  --version 0.1.0 \
  --pack-output ./dist/jasper-ai-0.1.0.tgz

npm install -g ./dist/jasper-ai-0.1.0.tgz
jasper setup
jasper
```

### Staging an installable Jasper package

```shell
python3 codex-cli/scripts/install_native_deps.py
python3 jasper-overlay/scripts/build_package.py \
  --version 0.1.0 \
  --pack-output ./dist/jasper-ai-0.1.0.tgz

npm install -g ./dist/jasper-ai-0.1.0.tgz
jasper setup
jasper
```

### Notes

- The packaged `jasper` launcher uses the bundled native Codex binary plus Jasper-owned JS modules.
- If `codex-cli/vendor` is already hydrated, the Jasper packager will pick it up automatically.
- Installable Jasper packages must be self-contained. End users should not need Rust, cargo, or other build tools on PATH.
- `jasper setup` currently uses Docker as a developer fallback for local Qdrant provisioning. The packaged Jasper app should manage local services internally instead of asking end users to install infrastructure.
- `jasper doctor` reports whether Jasper has a usable runtime, OpenAI/Codex auth, and a healthy local semantic-store configuration.
- `jasper audit brain-in-a-box` runs Jasper's automated baseline brain-in-a-box audit and prints the current score, ceilings, evidence, and next steps.
- `jasper audit benchmark-index` computes Jasper's weighted external benchmark index across public suites; `jasper audit benchmark-index queue` prints the prioritized integration order, `jasper audit benchmark-index scaffold` prints an import template, and `jasper audit benchmark-index import FILE` records benchmark results.
- `jasper benchmark list|queue|score` exposes the benchmark basket directly, and `jasper benchmark run terminal-bench ...` runs the wired public benchmark path through Jasper itself.
- `python3 scripts/run_terminal_bench_with_jasper.py --task-id hello-world` bootstraps Terminal-Bench locally, runs Jasper against a real verifier-backed task, and can optionally import the result into the external benchmark index.
- `jasper browser open URL` and `jasper browser run --plan-file browser-plan.json` now drive a real local Chrome automation session for navigation, filling, clicks, snapshots, and screenshots.
- `jasper action plan create --action-context-file browser-plan.json --requires-approval`, followed by `jasper action plan approve PLAN_ID` and `jasper action plan run PLAN_ID`, runs the same browser plan under approval-aware Milestone 15 guardrails and records the result in `computer-use.execution`.
- `jasper apps` reports connector and app requests Jasper is currently blocked on, and `jasper apps approve CONNECTOR_ID`, `jasper apps activate CONNECTOR_ID`, `jasper apps deactivate CONNECTOR_ID`, and `jasper apps revoke CONNECTOR_ID` now model consent and runtime readiness separately.
- Connector activation now also records Jasper's preferred provider lane, so later broker decisions can resolve to concrete paths like `jasper/calendar` instead of a generic connector placeholder.
- Jasper now ships a first read-only calendar tool, `calendar-read`, which is exposed through the activated `jasper/calendar` provider lane.
- Jasper also exposes a read-only `email-read` tool that becomes available once the `jasper/email` connector is activated, keeping sensitive inbox access behind consent.
- Jasper writes raw memory into local JSONL logs first, then `jasper memory materialize` can push that history into the local semantic index.
- The near-term semantic-memory plan is `fastembed` with bundled local model and runtime assets plus local-first storage, not a hosted dependency.
- `jasper setup` now validates existing OpenAI/Codex auth when possible; guided connector setup is still deferred for now.
- In the current terminal product, installed calendar and mailbox tools can already surface from normal household prompts; missing household connectors should route the user to `jasper apps`, where Jasper can now show whether a connector still needs approval or just needs activation.
- Live terminal Jasper now also runs automatic after-turn tool intake and remembers tool-status summaries, so Jasper can keep pulling in connector/quarantine/build work while you use it.
- Some deeper docs and source directories still use Codex naming because the fork inherits upstream internals.
- The maintained Jasper product contract lives in [docs/jasper/PROJECT_DETAILS.md](./docs/jasper/PROJECT_DETAILS.md).

## Docs

- [**Jasper PRD**](./docs/jasper/PROJECT_DETAILS.md)
- [**Jasper Vision**](./docs/jasper/VISION.md)
- [**Jasper Brain Regions**](./docs/jasper/BRAIN_REGIONS.md)
- [**Brain-In-A-Box Test**](./docs/jasper/BRAIN_IN_A_BOX_TEST.md)
- [**Browser Mode**](./docs/jasper/BROWSER_MODE.md)
- [**External Benchmark Index**](./docs/jasper/EXTERNAL_BENCHMARK_INDEX.md)
- [**Jasper Roadmap**](./docs/jasper/ROADMAP.md)
- [**Jasper Onboarding**](./docs/jasper/AUTOMATIC_ONBOARDING.md)
- [**Jasper Tool Acquisition**](./docs/jasper/TOOL_ACQUISITION.md)
- [**Jasper Fork Strategy**](./docs/jasper/FORK_STRATEGY.md)
- [**Jasper Overlay**](./jasper-overlay/README.md)
- [**Upstream Codex Documentation**](https://developers.openai.com/codex)
- [**Contributing**](./docs/contributing.md)
- [**Installing & building**](./docs/install.md)
- [**Open source fund**](./docs/open-source-fund.md)

This repository is licensed under the [Apache-2.0 License](LICENSE).
