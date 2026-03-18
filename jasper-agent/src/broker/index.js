import { createToolRegistry } from "../../../jasper-tools/src/registry.js";
import { generateToolFromTemplate } from "../../../jasper-tools/src/generator.js";
import { createConnectorStore } from "../connector-store.js";
import { createToolAcquisitionStore } from "./acquisition-store.js";
import { createCapabilityRegistry } from "./capability-registry.js";
import { listInternalAgents } from "./internal-agents.js";
import { createProviderResolver } from "./provider-adapters.js";
import { planToolAcquisition } from "./tool-acquisition-plan.js";

function unique(values) {
  return [...new Set(values)];
}

function activeAgentIdsForPlan(resolution, acquisition) {
  const active = ["harbor", "sounding", "logbook"];
  const status = resolution?.selected?.status;

  if (status === "provisionable") {
    active.push("dockyard");
  }

  if (status === "consent_required") {
    active.push("breakwater");
  }

  if (status === "activation_required") {
    active.push("breakwater");
  }

  if (status === "available" || status === "provisionable") {
    active.push("helm");
  }

  if (
    acquisition?.strategy === "search_and_quarantine" ||
    acquisition?.strategy === "build_in_house"
  ) {
    active.push("dockyard", "breakwater");
  }

  return unique(active);
}

function acknowledgementForResolution(resolution) {
  const status = resolution?.selected?.status;
  switch (status) {
    case "available":
      return "Let me check on that.";
    case "activation_required":
      return "I can check that once the connection is activated.";
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
    case "activation_required":
      return "Jasper has approval for this connector but still needs it activated before use.";
    case "provisionable":
      return "Jasper can provision a trusted capability and then handle the request.";
    case "consent_required":
      return "Jasper needs user consent before accessing the requested data source.";
    default:
      return "Jasper needs a capability path before it can complete this request.";
  }
}

function summarizeTool(tool) {
  if (!tool) {
    return null;
  }

  return {
    id: tool.id,
    description: tool.description,
    inputSchema: tool.inputSchema,
  };
}

function defaultGeneratedToolId(record) {
  return String(
    record.primaryCapabilityId || record.requirement?.label || "jasper-tool",
  )
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function createCapabilityBroker(options = {}) {
  const registryOptions = {
    identityPath: options.identityPath,
    memoryRoot: options.memoryRoot,
    jasperHome: options.jasperHome,
    toolsRoot: options.toolsRoot,
  };
  const toolRegistry =
    options.toolRegistry || createToolRegistry(registryOptions);
  const acquisitionStore =
    options.acquisitionStore ||
    createToolAcquisitionStore({
      jasperHome: options.jasperHome,
    });
  const connectorStore =
    options.connectorStore ||
    createConnectorStore({
      jasperHome: options.jasperHome,
    });
  const installedProviders =
    options.installedProviders ??
    acquisitionStore
      .listActivatedProviders({ limit: Number.MAX_SAFE_INTEGER })
      .map((provider) => provider.id);
  const approvedConnectors =
    options.approvedConnectors ??
    connectorStore
      .listApprovedConnectors()
      .map((connector) => connector.id);
  const activeConnectors =
    options.activeConnectors ??
    connectorStore
      .listActiveConnectors()
      .map((connector) => connector.id);
  const capabilityRegistry =
    options.capabilityRegistry || createCapabilityRegistry({ toolRegistry });
  const providerResolver =
    options.providerResolver ||
    createProviderResolver({
      toolRegistry,
      installedProviders,
      approvedConnectors,
      activeConnectors,
      clawAutoProvision: options.clawAutoProvision,
      mcpAutoProvision: options.mcpAutoProvision,
    });

  function inspectRequest(query, inspectOptions = {}) {
    const matches = capabilityRegistry.matchRequest(query, {
      limit: inspectOptions.limit,
    });
    const capabilityPlans = matches.map((match) => {
      const resolution = providerResolver.resolveCapability(match.capability);
      const acquisition = planToolAcquisition(match.capability, resolution);
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
        acquisition,
        activeAgentIds: activeAgentIdsForPlan(resolution, acquisition),
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
        activationRequired:
          primaryPlan?.resolution?.selected?.status === "activation_required",
        autoProvision:
          primaryPlan?.resolution?.selected?.status === "provisionable",
        tooling: {
          strategy: primaryPlan?.acquisition?.strategy || null,
          quarantineRequired:
            primaryPlan?.acquisition?.quarantine?.required || false,
          buildRecommended:
            primaryPlan?.acquisition?.build?.recommended || false,
        },
      },
      internalPlan: {
        activeAgents: listInternalAgents().filter((agent) =>
          activeAgentIds.includes(agent.id),
        ),
        primaryCapabilityId: primaryPlan?.capability?.id || null,
        primaryProvider: primaryPlan?.resolution?.selected || null,
        acquisition: primaryPlan?.acquisition || null,
        capabilities: capabilityPlans,
      },
    };
  }

  return {
    listCapabilities() {
      return capabilityRegistry.listCapabilities();
    },
    listInternalAgents() {
      return listInternalAgents();
    },
    inspectRequest,
    acquireRequest(query, requestOptions = {}) {
      const plan = inspectRequest(query, requestOptions);
      const acquisition = acquisitionStore.acquire(plan, {
        source: requestOptions.source,
      });
      const nextAction = plan.internalPlan.acquisition?.nextAction || null;
      const provider = plan.internalPlan.primaryProvider || null;

      if (nextAction === "use_existing_tool") {
        const tool = provider?.toolId
          ? toolRegistry.getTool(provider.toolId)
          : null;
        return {
          plan,
          acquisition,
          outcome: {
            status: "ready",
            action: nextAction,
            provider,
            tool: summarizeTool(tool),
            executionMode: provider?.executionMode || null,
          },
        };
      }

      if (nextAction === "generate_local_tool") {
        const template =
          requestOptions.template ||
          acquisition.build?.recommendedTemplates?.[0]?.id ||
          null;
        if (!template) {
          return {
            plan,
            acquisition,
            outcome: {
              status: "build_required",
              action: "build_local_tool",
              provider,
              build: acquisition.build,
            },
          };
        }

        const generation = generateToolFromTemplate({
          id: requestOptions.id || defaultGeneratedToolId(acquisition),
          template,
          description:
            requestOptions.description ||
            `${acquisition.requirement?.label || "Jasper"} tool`,
          toolsRoot: options.toolsRoot,
          query: requestOptions.query || acquisition.request,
          limit: requestOptions.limit,
          type: requestOptions.type,
          source: requestOptions.source,
        });
        const updatedAcquisition = acquisitionStore.recordGeneratedBuild(
          acquisition.id,
          generation,
        );
        const refreshedRegistry = createToolRegistry(registryOptions);
        return {
          plan,
          acquisition: updatedAcquisition,
          outcome: {
            status: "generated",
            action: nextAction,
            provider,
            generation,
            tool: summarizeTool(refreshedRegistry.getTool(generation.spec.id)),
          },
        };
      }

      if (nextAction === "request_connector_consent") {
        return {
          plan,
          acquisition,
          outcome: {
            status: "awaiting_consent",
            action: nextAction,
            provider,
            connectorId: provider?.connectorId || null,
          },
        };
      }

      if (nextAction === "activate_connector_runtime") {
        return {
          plan,
          acquisition,
          outcome: {
            status: "activation_pending",
            action: nextAction,
            provider,
            connectorId: provider?.connectorId || null,
          },
        };
      }

      if (nextAction === "queue_quarantine_review") {
        return {
          plan,
          acquisition,
          outcome: {
            status: "quarantine_pending",
            action: nextAction,
            provider,
            candidates: acquisition.candidates.filter(
              (candidate) => candidate.status === "pending_quarantine",
            ),
          },
        };
      }

      if (nextAction === "build_local_tool") {
        return {
          plan,
          acquisition,
          outcome: {
            status: "build_required",
            action: nextAction,
            provider,
            build: acquisition.build,
          },
        };
      }

      return {
        plan,
        acquisition,
        outcome: {
          status: "planned",
          action: nextAction,
          provider,
        },
      };
    },
  };
}
