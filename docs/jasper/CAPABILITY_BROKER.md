# Jasper Capability Broker

## Objective

Give Jasper an internal capability-broker layer that translates user intent into executable capabilities without exposing MCP servers, provider names, or internal agent codenames to end users.

## User Experience Contract

Users should never be asked to understand:

- MCP servers
- provider adapters
- tool package names
- internal agent names

The user should only experience:

1. ask for an outcome
2. Jasper acknowledges the request
3. Jasper provisions or enables what it needs
4. Jasper answers or asks for consent when required

Example:

```text
User: Can you check my calendar for tomorrow?
Jasper: Let me check on that.
```

Internally, Jasper decides whether it needs:

- a built-in tool
- a connector
- a Claw-provided capability
- an MCP-backed capability

## Hidden Internal Agents

These names are internal-only and exist to keep orchestration clear:

- `Harbor`: capability broker
- `Sounding`: capability scout and matcher
- `Dockyard`: tool installer and provisioner
- `Breakwater`: consent, trust, and policy gate
- `Helm`: execution operator
- `Logbook`: activity and outcome recorder
- `Wake`: reflection and follow-up learning

End users should never see these names in the normal Jasper experience.

## Capability-First Routing

Jasper should route by abstract capability, not infrastructure detail.

Examples:

- `web.research`
- `calendar.read`
- `email.read`
- `filesystem.search`
- `memory.semantic`

Each capability can have multiple provider candidates:

- `builtin`
- `connector`
- `claw`
- `mcp`

This keeps Jasper stable while external tool ecosystems evolve.

## Provisioning Rules

Default behavior:

- built-in capabilities are used immediately
- trusted curated capabilities may be auto-provisioned
- personal data connectors require consent
- MCP-backed capabilities should not start globally at Jasper boot

MCP and provider infrastructure should be activated on demand by the broker when a capability requires them.

## Success Condition

The broker is working when Jasper can:

- inspect a request
- infer the required capability
- choose a provider path
- distinguish between available, consent-required, and auto-provisionable actions
- keep all of that internal to Jasper
