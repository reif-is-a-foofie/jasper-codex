import { listGeneratorTemplates } from "../../../jasper-tools/src/generator.js";

function unique(values) {
  return [...new Set(values)];
}

function querySeedsForCapability(capability) {
  return unique(
    [
      capability.id,
      capability.label,
      ...capability.keywords,
      ...capability.phrases,
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean),
  );
}

function buildTemplateSuggestions(capabilityId) {
  switch (capabilityId) {
    case "memory.recent":
      return ["recent-memory"];
    case "memory.semantic":
    case "web.research":
      return ["semantic-memory-search"];
    default:
      return [];
  }
}

function searchChannelsForCapability(resolution) {
  const channels = [];

  for (const candidate of resolution?.candidates || []) {
    switch (candidate.providerId) {
      case "builtin":
        channels.push({
          id: candidate.toolId || "jasper.builtin",
          kind: "builtin_registry",
          trust: "jasper_owned",
          quarantineRequired: false,
          status: candidate.status,
          reason: "Check Jasper-owned built-in tools first.",
        });
        break;
      case "connector":
        channels.push({
          id: `connector.${candidate.connectorId}`,
          kind: "connector",
          trust: "consent_gated",
          quarantineRequired: false,
          status: candidate.status,
          reason: `Use the ${candidate.connectorId} connector only with operator consent.`,
        });
        break;
      case "claw":
        channels.push({
          id: candidate.packageId,
          kind: "curated_toolpack",
          trust: candidate.trust || "unknown",
          quarantineRequired: true,
          status: candidate.status,
          reason:
            candidate.trust === "curated"
              ? "Curated external toolpack candidate. Review it in quarantine before promotion."
              : "Non-curated external toolpack candidate should stay in quarantine first.",
        });
        break;
      case "mcp":
        channels.push({
          id: candidate.packageId || candidate.serverName,
          kind: "mcp_capability",
          trust: candidate.trust || "unknown",
          quarantineRequired: true,
          status: candidate.status,
          startup: candidate.startup || "on_demand",
          reason:
            candidate.trust === "curated"
              ? "Curated MCP capability can be evaluated in quarantine before on-demand activation."
              : "Unknown MCP capability should stay in quarantine first.",
        });
        break;
      default:
        channels.push({
          id: candidate.providerId,
          kind: "unknown_provider",
          trust: "unknown",
          quarantineRequired: true,
          status: candidate.status,
          reason: `Unknown provider "${candidate.providerId}" requires quarantine review.`,
        });
        break;
    }
  }

  channels.push({
    id: "community.search",
    kind: "external_search",
    trust: "unknown",
    quarantineRequired: true,
    status: "available",
    reason:
      "Search external tool ecosystems only after Jasper-owned and curated paths are exhausted.",
  });
  channels.push({
    id: "jasper.build",
    kind: "internal_build",
    trust: "jasper_owned",
    quarantineRequired: false,
    status: "available",
    reason:
      "Build a Jasper-owned tool when imported candidates do not survive quarantine.",
  });

  return channels;
}

function acquisitionStrategyForResolution(resolution) {
  const selected = resolution?.selected || null;
  const hasProviderCandidates = (resolution?.candidates || []).length > 0;

  if (selected?.status === "consent_required") {
    return "request_consent";
  }

  if (selected?.status === "available") {
    return "use_existing";
  }

  if (selected?.providerId === "claw" || selected?.providerId === "mcp") {
    return "search_and_quarantine";
  }

  if (!hasProviderCandidates) {
    return "build_in_house";
  }

  if (selected?.status === "available") {
    return "use_existing";
  }

  return "search_and_quarantine";
}

function buildPlan(capability, strategy) {
  const availableTemplates = listGeneratorTemplates();
  const recommendedTemplateIds = buildTemplateSuggestions(capability.id);
  const recommendedTemplates = availableTemplates.filter((template) =>
    recommendedTemplateIds.includes(template.id),
  );

  return {
    recommended: strategy === "build_in_house",
    strategy:
      strategy === "build_in_house" && recommendedTemplates.length > 0
        ? "generate_from_template"
        : "author_new_tool_module",
    availableTemplates,
    recommendedTemplates,
    reason:
      strategy === "build_in_house"
        ? recommendedTemplates.length > 0
          ? "A Jasper template exists, so the fastest fallback is to generate a local tool and then harden it."
          : "No Jasper-owned or curated provider path is currently ready, so Jasper should build the tool in-house."
        : "A Jasper-owned, consent-gated, or quarantine candidate path already exists, so custom build is not the first move.",
  };
}

function nextActionForPlan(strategy, quarantineRequired, build) {
  switch (strategy) {
    case "use_existing":
      return "use_existing_tool";
    case "request_consent":
      return "request_connector_consent";
    case "build_in_house":
      return build.strategy === "generate_from_template"
        ? "generate_local_tool"
        : "build_local_tool";
    default:
      return quarantineRequired
        ? "queue_quarantine_review"
        : "search_candidates";
  }
}

export function planToolAcquisition(capability, resolution) {
  const strategy = acquisitionStrategyForResolution(resolution);
  const channels = searchChannelsForCapability(resolution);
  const quarantineCandidates = channels.filter(
    (channel) => channel.quarantineRequired,
  );
  const quarantineRequired =
    strategy === "search_and_quarantine" && quarantineCandidates.length > 0;
  const build = buildPlan(capability, strategy);

  return {
    strategy,
    requirement: {
      capabilityId: capability.id,
      label: capability.label,
      description: capability.description,
    },
    search: {
      querySeeds: querySeedsForCapability(capability),
      channels,
    },
    quarantine: {
      required: quarantineRequired,
      mode: "manual_review",
      candidates: quarantineCandidates,
      checklist: [
        "Confirm the tool scope exactly matches the requested capability.",
        "Review permissions, auth model, and data egress before admission.",
        "Run the tool in isolation before enabling it for normal routing.",
        "Check maintenance quality, ownership, and failure behavior.",
      ],
    },
    build,
    nextAction: nextActionForPlan(strategy, quarantineRequired, build),
  };
}
