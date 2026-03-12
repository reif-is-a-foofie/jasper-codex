import { createToolRegistry } from "../../../jasper-tools/src/registry.js";
import { createCapabilityRegistry } from "./capability-registry.js";
import { listInternalAgents } from "./internal-agents.js";
import { createProviderResolver } from "./provider-adapters.js";

function unique(values) {
  return [...new Set(values)];
}

function activeAgentIdsForResolution(resolution) {
  const active = ["harbor", "sounding", "logbook"];
  const status = resolution?.selected?.status;

  if (status === "provisionable") {
    active.push("dockyard");
  }

  if (status === "consent_required") {
    active.push("breakwater");
  }

  if (status === "available" || status === "provisionable") {
    active.push("helm");
  }

  return unique(active);
}

function acknowledgementForResolution(resolution) {
  const status = resolution?.selected?.status;
  switch (status) {
    case "available":
      return "Let me check on that.";
    case "provisionable":
      return "Let me set that up and check on it.";
    case "consent_required":
      return "I can check that once you approve the connection.";
    default:
      return "Let me figure out the best way to handle that.";
  }
}

function publicSummaryForPlan(plan) {
  const selected = plan?.resolution?.selected;
  if (!selected) {
    return "Jasper is still deciding how to handle this request.";
  }

  switch (selected.status) {
    case "available":
      return "Jasper can handle this immediately with an available capability.";
    case "provisionable":
      return "Jasper can provision a trusted capability and then handle the request.";
    case "consent_required":
      return "Jasper needs user consent before accessing the requested data source.";
    default:
      return "Jasper needs a capability path before it can complete this request.";
  }
}

export function createCapabilityBroker(options = {}) {
  const toolRegistry =
    options.toolRegistry ||
    createToolRegistry({
      identityPath: options.identityPath,
      memoryRoot: options.memoryRoot,
      jasperHome: options.jasperHome,
      toolsRoot: options.toolsRoot,
    });
  const capabilityRegistry = createCapabilityRegistry({ toolRegistry });
  const providerResolver = createProviderResolver({
    toolRegistry,
    installedProviders: options.installedProviders,
    approvedConnectors: options.approvedConnectors,
    clawAutoProvision: options.clawAutoProvision,
    mcpAutoProvision: options.mcpAutoProvision,
  });

  return {
    listCapabilities() {
      return capabilityRegistry.listCapabilities();
    },
    listInternalAgents() {
      return listInternalAgents();
    },
    inspectRequest(query, options = {}) {
      const matches = capabilityRegistry.matchRequest(query, {
        limit: options.limit,
      });
      const capabilityPlans = matches.map((match) => {
        const resolution = providerResolver.resolveCapability(match.capability);
        return {
          capability: {
            id: match.capability.id,
            label: match.capability.label,
            description: match.capability.description,
          },
          score: match.score,
          matchedKeywords: match.matchedKeywords,
          matchedPhrases: match.matchedPhrases,
          resolution,
          activeAgentIds: activeAgentIdsForResolution(resolution),
        };
      });

      const primaryPlan = capabilityPlans[0] || null;
      const activeAgentIds = unique(
        capabilityPlans.flatMap((plan) => plan.activeAgentIds),
      );

      return {
        request: String(query || "").trim(),
        acknowledgement: acknowledgementForResolution(primaryPlan?.resolution),
        publicPlan: {
          summary: publicSummaryForPlan(primaryPlan),
          consentRequired:
            primaryPlan?.resolution?.selected?.status === "consent_required",
          autoProvision:
            primaryPlan?.resolution?.selected?.status === "provisionable",
        },
        internalPlan: {
          activeAgents: listInternalAgents().filter((agent) =>
            activeAgentIds.includes(agent.id),
          ),
          primaryCapabilityId: primaryPlan?.capability?.id || null,
          primaryProvider: primaryPlan?.resolution?.selected || null,
          capabilities: capabilityPlans,
        },
      };
    },
  };
}
