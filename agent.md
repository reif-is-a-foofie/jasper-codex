# Jasper Agent Contract

This repository is a fork of `openai/codex` for building **Jasper** as a branded, modular executive-assistant runtime.

Primary goals:
- Keep upstream Codex compatibility high.
- Keep Jasper-specific behavior modular and overridable.
- Make it easy for other users to fork and plug in their own tools.

Operating directives:
- Preserve core upstream behavior unless there is a clear Jasper-specific requirement.
- Put Jasper customization in `jasper-overlay/` first, not `codex-rs/` core.
- Treat `docs/jasper/PROJECT_DETAILS.md` as product truth.
- Prefer additive extension points over hard-coded behavior.
- Maintain macOS-first ergonomics for local workflows.
- Sequence work one milestone at a time.

Execution priorities:
1. Upstream sync safety
2. Modular extension surface
3. Memory-first assistant capabilities
4. UI/branding customizations
5. Tool integrations (Mail/iMessage/email triage)

Definition of done for changes:
- Upstream merge path remains clear.
- New behavior can be disabled or replaced without patching core.
- Docs are updated for users who want to fork Jasper and customize it.
