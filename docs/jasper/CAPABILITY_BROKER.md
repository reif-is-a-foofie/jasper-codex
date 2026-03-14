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
- a new Jasper-owned tool that should be built in-house

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

## Tool Acquisition Loop

When Jasper does not already have a direct tool path, the broker should stay capability-first and move through an acquisition loop:

1. infer the needed capability from the request
2. scout Jasper-owned, connector, curated provider channels first
3. quarantine unknown or community-provided candidates before admission
4. build a Jasper-owned tool when no candidate is safe and sufficient

Quarantine means:

- keep the candidate out of normal routing
- review permissions, auth model, and data egress
- run it in isolation first
- confirm it is maintained and narrow in scope

The `tools scout` and `broker inspect` flows should expose this internal planning state without forcing the user to think in provider plumbing.

`tools acquire` should persist the chosen path and complete only the flows Jasper can already execute locally:

- built-in Jasper tools
- Jasper-owned generated tools

Connector consent and external quarantine work should stay recorded but deferred until those runtimes exist for real.

Admitted curated `claw` and `mcp` candidates can now be activated for future routing, so the broker can treat them as available on later requests without re-running quarantine.

## Success Condition

The broker is working when Jasper can:

- inspect a request
- infer the required capability
- choose a provider path
- distinguish between available, consent-required, and auto-provisionable actions
- persist the chosen acquisition state
- materialize built-in and Jasper-generated tool paths immediately
- plan how to scout, quarantine, or build missing tool paths
- keep all of that internal to Jasper
