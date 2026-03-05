# Jasper Modularity Contract

This fork keeps **custom behavior isolated from core Codex runtime** so upstream updates remain straightforward.

## Design rule

- Keep customizations in `jasper-overlay/`.
- Avoid editing core files in `codex-rs/` and `codex-cli/` unless absolutely required.
- If a core patch is needed, keep it small, documented, and traceable to one feature.

## Extension API (v1)

Each extension is a folder with:

- `manifest.json`
- one or more instruction files referenced by `manifest.json`

Manifest shape:

```json
{
  "id": "example",
  "name": "Example",
  "instructions": ["instructions.md"],
  "env": { "EXAMPLE_FLAG": "1" }
}
```

## User personalization

User-level files are loaded from `~/.jasper/`:

- `config.json`
- `profile.md`
- `extensions/<id>/...`

This allows personalization without changing forked source.

## Upstream compatibility

- Keep overlays additive and external.
- Prefer launcher-level composition over runtime rewrites.
- Sync regularly from `upstream/main` and resolve only real conflicts.

## Suggested sync routine

Use `scripts/sync_upstream.sh`:

```bash
./scripts/sync_upstream.sh
```

Then run targeted smoke tests before merging.
