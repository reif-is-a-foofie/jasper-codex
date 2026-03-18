# Jasper Milestone 6

## Primary Brain Region

Regulation & Growth.

## Objective

Start Jasper self-extension by letting the system generate and register new tools from repeatable templates.

## Scope

This milestone introduces a Jasper-owned generation flow for new tool modules and registration metadata.

Delivered here:

- generated tool metadata in `jasper-tools/generated/registry.json`
- generated tool modules in `jasper-tools/generated/tools/`
- a generator in `jasper-tools/src/generator.js`
- CLI access through `tools templates` and `tools generate`

## Success Condition

Jasper can generate a new tool definition, register it, and execute it through the same registry used by built-in tools.

## Upstream Safety

Milestone 6 stays in Jasper-owned paths:

- `jasper-tools/`
- `jasper-agent/`
- `jasper-overlay/`
- `docs/jasper/`

No new upstream Codex patches are required.

## Verification

```bash
TMP_TOOLS_ROOT="$(mktemp -d)"
mkdir -p "$TMP_TOOLS_ROOT/generated/tools"
printf '[]\n' > "$TMP_TOOLS_ROOT/generated/registry.json"
node jasper-agent/src/cli.js tools templates
node jasper-agent/src/cli.js tools generate --tools-root "$TMP_TOOLS_ROOT" --id ops-focus --template semantic-memory-search --description "Operational focus search" --query "household operations"
node jasper-agent/src/cli.js tools list --tools-root "$TMP_TOOLS_ROOT"
node jasper-agent/src/cli.js tools run ops-focus --tools-root "$TMP_TOOLS_ROOT" --memory-root /tmp/jasper-memory-check
```
