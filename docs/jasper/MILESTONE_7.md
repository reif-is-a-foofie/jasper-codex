# Jasper Milestone 7

## Primary Brain Region

Executive & Action.

## Objective

Make Jasper reason about capabilities instead of tool names, and let it queue self-extension work while the user is still talking.

## Scope

This milestone introduces the first outcome-oriented capability broker plus the first live self-extension loop.

Delivered here:

- capability-to-provider routing in `jasper-agent/src/broker/`
- public versus internal tool planning
- built-in web research as a first-party Jasper bridge tool
- acquisition-store persistence for search, quarantine, and build work
- after-turn intake that can queue connector and tooling follow-up from normal chat
- terminal startup instructions that expose Jasper bridge tools to the live session
- Jasper memory events for tool intake and completed-turn summaries

## Success Condition

Jasper can take a plain-language request, map it to capabilities, use what already exists, and queue missing connector or tooling work without forcing the user to think in connector or provider jargon.

## Upstream Safety

Most of the milestone stays in Jasper-owned paths:

- `jasper-agent/`
- `jasper-core/`
- `jasper-memory/`
- `jasper-overlay/`
- `jasper-tools/`
- `docs/jasper/`

This milestone also uses limited Jasper-specific fork patches in `codex-rs/core/` so the live terminal session can receive Jasper startup context and remember additional session activity.

## Verification

```bash
node jasper-agent/src/cli.js tools plan "check my calendar for tomorrow morning"
node jasper-agent/src/cli.js tools plan "find the latest qdrant release notes"
node jasper-agent/src/cli.js tools maintain
node jasper-overlay/bin/jasper.js tools list
```

Live terminal smoke:

1. Launch `node jasper-overlay/bin/jasper.js --no-alt-screen`
2. Ask `What Jasper tools are available to you right now?`
3. Ask `Use your recent-memory tool and tell me the last 5 memory events you have for this session.`

Expected outcome:

- Jasper names its built-in bridge tools
- Jasper can call a Jasper-owned tool from the live terminal session
- the recent-memory output includes the current session events
