# Jasper Overlay

`jasper-overlay/` is the primary integration layer for Jasper-specific behavior in this Codex fork.

Use this directory first for:

- identity loading
- prompt composition
- extension registration
- Jasper wrapper commands
- integration glue between Codex and Jasper-owned systems

Current launcher behavior:

- `node jasper-overlay/bin/jasper.js` launches Codex with Jasper branding enabled
- `node jasper-overlay/bin/jasper.js setup` initializes Jasper home state and provisions Qdrant
- `node jasper-overlay/bin/jasper.js identity` reads Jasper identity config
- `node jasper-overlay/bin/jasper.js runtime` starts the standalone Jasper runtime scaffold
- `node jasper-overlay/bin/jasper.js runtime --watch-path PATH` enables filesystem observation for a target path
- `node jasper-overlay/bin/jasper.js memory recent` inspects Jasper raw event memory
- `node jasper-overlay/bin/jasper.js memory semantic "query"` runs semantic memory lookup
- `node jasper-overlay/bin/jasper.js memory materialize` pushes raw-memory embeddings into the local semantic index
- `node jasper-overlay/bin/jasper.js dream reflect` generates a Jasper reflection record
- `node jasper-overlay/bin/jasper.js tools list` lists registered Jasper tools
- built-in tool coverage now includes first-party web research through Codex web search
- `node jasper-overlay/bin/jasper.js tools scout "query"` inspects the full acquisition plan for a request
- `node jasper-overlay/bin/jasper.js tools needs "query"` identifies the capability Jasper thinks it needs
- `node jasper-overlay/bin/jasper.js tools search "query"` shows candidate search/import lanes
- `node jasper-overlay/bin/jasper.js tools quarantine "query"` shows the quarantine checklist and candidates Jasper would review
- `node jasper-overlay/bin/jasper.js tools build "query"` shows whether Jasper should build the tool in-house
- `node jasper-overlay/bin/jasper.js tools plan "query"` is an alias for the full acquisition plan
- `node jasper-overlay/bin/jasper.js tools acquire "query"` records acquisition state under Jasper home and immediately materializes built-in or Jasper-generated tool paths when possible
- `node jasper-overlay/bin/jasper.js tools acquisitions` lists recorded acquisition state
- `node jasper-overlay/bin/jasper.js tools maintain` processes Jasper's build queue for locally generatable tools
- `node jasper-overlay/bin/jasper.js tools providers` lists activated external providers
- `node jasper-overlay/bin/jasper.js tools quarantine list` lists pending quarantine work
- `node jasper-overlay/bin/jasper.js tools activate RECORD_ID CANDIDATE_ID` activates an admitted curated provider for future routing
- `node jasper-overlay/bin/jasper.js tools build-local RECORD_ID --id TOOL_ID` generates a Jasper-owned tool from a recorded acquisition
- `node jasper-overlay/bin/jasper.js tools generate ...` writes a generated Jasper tool
- normal live chat now also runs Jasper's after-turn intake hook, so missing connector/quarantine/build work can be queued while the user keeps talking
- Jasper startup instructions now advertise the local `jasper tools run/acquire/maintain` bridge so the live terminal agent can use Jasper-owned tools without exposing internals unless asked

Packaging:

- `python3 jasper-overlay/scripts/build_package.py --version 0.1.0 --staging-dir /tmp/jasper-package` stages a publishable `jasper-ai` package
- if `codex-cli/vendor` is already hydrated, the packager will bundle it automatically
- add `--vendor-src codex-cli/vendor` to point at a specific vendor tree explicitly
- add `--semantic-model-src jasper-core/resources/semantic-models` to bundle local embedding-model assets when they exist
- add `--semantic-runtime-src jasper-core/resources/semantic-runtime` to bundle local ONNX runtime assets when they exist
- add `--pack-output /tmp/jasper-ai-0.1.0.tgz` to emit an installable tarball
- the resulting package can be installed with `npm install -g /tmp/jasper-ai-0.1.0.tgz`
- installable tarballs must bundle the native runtime; `--pack-output` now fails if no vendored runtime is present

Installed package behavior:

- `jasper setup` creates `~/.jasper/`, copies the default identity config, writes runtime config, and provisions Qdrant through Docker unless `--skip-qdrant` or `--qdrant-url` is used
- raw events still land in `~/.jasper/data/memory` first; `jasper memory materialize` is the second-stage semantic pipe
- Docker is the current developer fallback only. The shipped Jasper app should provision and manage local services internally.
- `jasper` launches the bundled Codex binary when `vendor/` is present
- `jasper identity`, `jasper memory`, `jasper dream`, and `jasper tools` work from the packaged Jasper JS modules without requiring a repo checkout
- packaged Jasper should also carry its own local semantic-model and semantic-runtime assets once model-based embeddings replace the deterministic placeholder
- OpenAI authentication and connector onboarding are not packaged as a guided flow yet; operators still need to complete those steps manually for now
- in the live terminal chat, Jasper now auto-surfaces installed calendar and mailbox tools from normal household prompts and should send the user to `/apps` when a household connector is still missing

Do not move Jasper behavior into `codex-rs/` or `codex-cli/` unless the core patch gate in `docs/jasper/FORK_STRATEGY.md` is satisfied.
