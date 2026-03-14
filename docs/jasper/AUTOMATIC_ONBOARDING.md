# Automatic Onboarding

## Current Goal

Jasper should be installable by a new operator with a short sequence:

```shell
npm install -g jasper-ai
jasper setup
jasper
```

`jasper setup` is responsible for:

- creating the local Jasper home at `~/.jasper/` by default
- copying the default identity configuration into the user's config directory
- creating the local raw-memory directories
- provisioning a local semantic store without requiring the operator to install infrastructure manually in the packaged product
- ensuring packaged Jasper dependencies are self-contained instead of assuming Rust, cargo, Docker, MCP servers, or model runtimes exist on the operator machine
- writing a runtime configuration file that later Jasper commands can reuse

## Current Scope

This onboarding flow intentionally stops short of guided account setup.

Deferred items:

- OpenAI credential entry and validation
- connector consent flows
- mailbox, calendar, and browser onboarding
- remote hosted vector store provisioning
- bundling or configuring the Codex runtime needed by Jasper's first-party web-research tool in packaged installs

For now, operators still need to complete authentication and connector setup manually after `jasper setup`.

Current terminal behavior before guided onboarding lands:

- Jasper can already auto-surface installed calendar and mailbox tools from normal household prompts during chat
- if the user asks for household app access and the connector is still missing, Jasper should direct them to `/apps` in the terminal UI

## Qdrant Provisioning Model

Product target:

- Jasper manages local semantic-store provisioning internally
- operators should not be asked to install Docker, Homebrew formulas, or database binaries by hand
- installer packages must bundle the native runtime and any required local semantic-model assets
- raw events continue to land in `~/.jasper/data/memory` before any semantic indexing happens
- `jasper memory materialize` is the pipe that pushes raw-memory embeddings into the local semantic index later

Current developer fallback:

- `jasper setup` attempts to run Qdrant locally through Docker
- storage is persisted under `~/.jasper/data/qdrant/storage`
- runtime config records the resolved Qdrant URL, collection, and provisioning mode

Supported setup modes:

- current local Docker fallback
- `jasper setup --skip-qdrant` for development or CI
- `jasper setup --qdrant-url URL` for an externally managed Qdrant instance

## Expected Runtime Artifacts

`jasper setup` should leave behind:

```text
~/.jasper/
  config/
    identity.yaml
    runtime.json
  data/
    memory/
    qdrant/
      storage/
```

## Near-Term Follow-Up

The next onboarding milestone is not more packaging. It is guided authentication:

1. validate OpenAI credentials after setup
2. store a minimal operator config safely
3. present connector consent steps one system at a time
4. confirm Jasper can materialize raw memory into its provisioned local semantic store automatically

The packaging milestone after that is app-managed infrastructure:

1. bundle or sidecar the local semantic-store process inside the macOS app
2. start and stop that process from Jasper, not from Docker
3. migrate the current developer fallback out of the default user path
4. bundle the local embedding model and ONNX runtime artifacts inside the app so semantic recall works without first-run dependency installs
5. bundle the Codex runtime Jasper uses for first-party web research, or write `JASPER_CODEX_EXECUTABLE` automatically during setup
