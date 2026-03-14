# Jasper Tool Acquisition

## Objective

Give Jasper a real tool-intake workflow instead of treating tool provisioning as a binary installed/not-installed choice.

The workflow should answer four questions:

1. what capability or tool is actually needed
2. where Jasper should search for it
3. whether the candidate survives quarantine
4. when Jasper should build the tool in-house instead of importing it

## Intake Flow

Jasper now plans tool work in five stages:

1. identify the required capability from user intent
2. inspect existing Jasper-owned, connector, curated, and MCP-backed paths
3. quarantine imported candidates before normal routing
4. admit or reject those candidates with recorded reasoning
5. build a Jasper-owned tool when no candidate is safe and sufficient

In the live terminal product, Jasper also runs this intake path automatically after completed chat turns. That keeps connector consent, quarantine work, and Jasper-owned build opportunities moving while the user continues chatting normally.

## CLI Surface

These commands expose and drive the acquisition flow through Jasper's agent CLI:

```bash
node jasper-agent/src/cli.js tools needs "check my calendar tomorrow"
node jasper-agent/src/cli.js tools search "check my calendar tomorrow"
node jasper-agent/src/cli.js tools quarantine "search my files for qdrant notes"
node jasper-agent/src/cli.js tools build "remind me what we discussed about qdrant"
node jasper-agent/src/cli.js tools plan "find the latest qdrant release notes"
node jasper-agent/src/cli.js tools acquire "find the latest qdrant release notes"
node jasper-agent/src/cli.js tools acquisitions
node jasper-agent/src/cli.js tools maintain
node jasper-agent/src/cli.js tools providers
node jasper-agent/src/cli.js tools quarantine list
node jasper-agent/src/cli.js tools quarantine admit RECORD_ID CANDIDATE_ID
node jasper-agent/src/cli.js tools activate RECORD_ID CANDIDATE_ID
node jasper-agent/src/cli.js tools build-local RECORD_ID --id TOOL_ID
```

## Current Contract

- built-in Jasper tools skip quarantine
- connector paths stay consent-gated
- imported `claw` and `mcp` candidates go through quarantine before promotion
- admitted curated external candidates can be activated for future broker routing
- acquisition history is written under `~/.jasper/data/tooling/`
- completed turn intake also records tool-status summaries into Jasper memory so later turns can treat newly available tools as remembered context
- `tools acquire` materializes built-in and Jasper-generated tool paths immediately when Jasper can complete them in-tree
- `tools maintain` processes the Jasper-owned build queue so generated tools can land while Jasper stays in use
- in-house build remains the fallback when safe imports are not good enough
