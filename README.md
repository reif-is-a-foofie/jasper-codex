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
- `jasper apps` reports connector and app requests Jasper is currently blocked on.
- Jasper writes raw memory into local JSONL logs first, then `jasper memory materialize` can push that history into the local semantic index.
- The near-term semantic-memory plan is `fastembed` with bundled local model and runtime assets plus local-first storage, not a hosted dependency.
- `jasper setup` now validates existing OpenAI/Codex auth when possible; guided connector setup is still deferred for now.
- In the current terminal product, installed calendar and mailbox tools can already surface from normal household prompts; missing household connectors should route the user to `jasper apps`.
- Live terminal Jasper now also runs automatic after-turn tool intake and remembers tool-status summaries, so Jasper can keep pulling in connector/quarantine/build work while you use it.
- Some deeper docs and source directories still use Codex naming because the fork inherits upstream internals.
- The maintained Jasper product contract lives in [docs/jasper/PROJECT_DETAILS.md](./docs/jasper/PROJECT_DETAILS.md).

## Docs

- [**Jasper PRD**](./docs/jasper/PROJECT_DETAILS.md)
- [**Jasper Vision**](./docs/jasper/VISION.md)
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
