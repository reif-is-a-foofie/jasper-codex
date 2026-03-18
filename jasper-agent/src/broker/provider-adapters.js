function normalizeSet(values = []) {
  return new Set(
    (Array.isArray(values) ? values : [values])
      .map((value) => String(value || "").trim())
      .filter(Boolean),
  );
}

function statusRank(status) {
  switch (status) {
    case "available":
      return 5;
    case "activation_required":
      return 4;
    case "consent_required":
      return 3;
    case "provisionable":
      return 2;
    default:
      return 1;
  }
}

function resolveBuiltinCandidate(candidate, context) {
  if (!candidate.toolId) {
    return {
      ...candidate,
      status: "available",
      action: "use",
      reason: "Jasper can handle this with its built-in runtime.",
    };
  }

  const tool = context.toolRegistry?.getTool?.(candidate.toolId) || null;
  if (!tool) {
    return {
      ...candidate,
      status: "unavailable",
      action: "missing_tool",
      reason: `Built-in tool "${candidate.toolId}" is not registered.`,
    };
  }

  return {
    ...candidate,
    status: "available",
    action: "use",
    reason: `Built-in Jasper tool "${candidate.toolId}" is available.`,
  };
}

function resolveConnectorCandidate(candidate, context) {
  const connectorId = String(candidate.connectorId || "").trim();
  const active =
    context.activeConnectors.has(connectorId) ||
    context.installedProviders.has(`connector:${connectorId}`);
  const approved = context.approvedConnectors.has(connectorId) || active;

  if (active) {
    return {
      ...candidate,
      status: "available",
      action: "use",
      reason: `Connector "${connectorId}" is active and ready for Jasper use.`,
    };
  }

  if (approved) {
    return {
      ...candidate,
      status: "activation_required",
      action: "activate",
      reason: `Connector "${connectorId}" is approved, but it is not active yet.`,
    };
  }

  return {
    ...candidate,
    status: "consent_required",
    action: "request_consent",
    reason: `Connector "${connectorId}" requires user consent before use.`,
  };
}

function resolveProvisionableCandidate(candidate, context, providerId) {
  const packageId = String(candidate.packageId || "").trim();
  const serverName = String(candidate.serverName || "").trim();
  const installedKeys = [packageId, serverName]
    .filter(Boolean)
    .flatMap((value) => [value, `${providerId}:${value}`]);
  const isInstalled = installedKeys.some((value) =>
    context.installedProviders.has(value),
  );
  const isActiveConnectorProvider =
    (packageId && context.activeConnectorProviders.has(packageId)) ||
    (serverName && context.activeConnectorProviders.has(serverName));

  if (isInstalled || isActiveConnectorProvider) {
    return {
      ...candidate,
      status: "available",
      action: "use",
      reason:
        providerId === "claw"
          ? `Trusted Claw capability "${packageId}" is active for Jasper use.`
          : `MCP-backed capability "${serverName || packageId}" is active for Jasper use.`,
    };
  }

  const autoProvisionAllowed =
    providerId === "claw" ? context.clawAutoProvision : context.mcpAutoProvision;
  if (candidate.autoProvision && autoProvisionAllowed) {
    return {
      ...candidate,
      status: "provisionable",
      action: "install",
      startup: providerId === "mcp" ? "on_demand" : undefined,
      reason:
        providerId === "claw"
          ? `Trusted Claw capability "${packageId}" can be provisioned automatically.`
          : `Trusted MCP capability "${serverName || packageId}" can be provisioned on demand.`,
    };
  }

  return {
    ...candidate,
    status: "unavailable",
    action: "manual_setup",
    reason:
      providerId === "claw"
        ? `Claw capability "${packageId}" is not installed and auto-provisioning is disabled.`
        : `MCP capability "${serverName || packageId}" is not installed and auto-provisioning is disabled.`,
  };
}

export function createProviderResolver(options = {}) {
  const context = {
    toolRegistry: options.toolRegistry,
    installedProviders: normalizeSet(options.installedProviders),
    approvedConnectors: normalizeSet(options.approvedConnectors),
    activeConnectors: normalizeSet(options.activeConnectors),
    activeConnectorProviders: normalizeSet(options.activeConnectorProviders),
    clawAutoProvision: options.clawAutoProvision !== false,
    mcpAutoProvision: options.mcpAutoProvision !== false,
  };

  return {
    resolveCapability(capability) {
      const candidates = capability.providerCandidates.map((candidate) => {
        switch (candidate.providerId) {
          case "builtin":
            return resolveBuiltinCandidate(candidate, context);
          case "connector":
            return resolveConnectorCandidate(candidate, context);
          case "claw":
            return resolveProvisionableCandidate(candidate, context, "claw");
          case "mcp":
            return resolveProvisionableCandidate(candidate, context, "mcp");
          default:
            return {
              ...candidate,
              status: "unavailable",
              action: "unsupported",
              reason: `Provider "${candidate.providerId}" is not supported by the current broker.`,
            };
        }
      });

      const selected = [...candidates].sort((left, right) => {
        const rankDelta = statusRank(right.status) - statusRank(left.status);
        if (rankDelta !== 0) {
          return rankDelta;
        }

        const preferExecutableOverConnector =
          left.status === "available" &&
          right.status === "available" &&
          left.providerId !== right.providerId &&
          (left.providerId === "connector" || right.providerId === "connector");
        if (preferExecutableOverConnector) {
          return left.providerId === "connector" ? 1 : -1;
        }

        return capability.providerCandidates.findIndex(
          (candidate) => candidate.providerId === left.providerId,
        ) -
          capability.providerCandidates.findIndex(
            (candidate) => candidate.providerId === right.providerId,
          );
      })[0] || null;

      return {
        selected,
        candidates,
      };
    },
  };
}
