import { createEventStore } from "../../jasper-memory/src/event-store.js";
import { createConnectorStore } from "./connector-store.js";
import { getPreferredConnectorProvider } from "./broker/capability-registry.js";
import { createToolAcquisitionStore } from "./broker/acquisition-store.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function connectorLabel(connectorId) {
  const normalized = normalizeText(connectorId);
  if (!normalized) {
    return "Unknown";
  }

  return normalized
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function connectorProviderDetails(connectorId) {
  const preferredProvider = getPreferredConnectorProvider(connectorId);
  return {
    preferredProviderId:
      preferredProvider?.packageId || preferredProvider?.serverName || null,
    preferredProviderKind: preferredProvider?.providerId || null,
  };
}

function statusForRecord(record) {
  if (record.status === "awaiting_consent") {
    return "consent_required";
  }

  if (record.status === "activation_pending") {
    return "approved_not_active";
  }

  if (
    record.status === "satisfied" ||
    record.primaryProvider?.status === "available"
  ) {
    return "ready";
  }

  return "tracked";
}

function sortByMostRecent(left, right) {
  return String(right.latestRequestAt || "").localeCompare(
    String(left.latestRequestAt || ""),
  );
}

function summarizeConnectors(records) {
  const summaries = new Map();

  for (const record of records) {
    const connectorId = normalizeText(record.primaryProvider?.connectorId);
    if (!connectorId) {
      continue;
    }

    const summary =
      summaries.get(connectorId) ||
      {
        id: connectorId,
        label: connectorLabel(connectorId),
        status: "tracked",
        requestCount: 0,
        latestRequestAt: null,
        requestedCapabilities: new Set(),
        recentRequests: [],
      };

    summary.requestCount += 1;
    summary.latestRequestAt =
      !summary.latestRequestAt ||
      String(record.updatedAt || "") > String(summary.latestRequestAt)
        ? record.updatedAt || null
        : summary.latestRequestAt;
    if (record.primaryCapabilityId) {
      summary.requestedCapabilities.add(record.primaryCapabilityId);
    }
    if (summary.recentRequests.length < 3) {
      summary.recentRequests.push({
        recordId: record.id,
        request: record.request,
        status: record.status,
        updatedAt: record.updatedAt,
      });
    }

    if (statusForRecord(record) === "consent_required") {
      summary.status = "consent_required";
    } else if (summary.status !== "consent_required") {
      summary.status = statusForRecord(record);
    }

    summaries.set(connectorId, summary);
  }

  return [...summaries.values()]
    .map((summary) => ({
      ...connectorProviderDetails(summary.id),
      id: summary.id,
      label: summary.label,
      status: summary.status,
      requestCount: summary.requestCount,
      latestRequestAt: summary.latestRequestAt,
      requestedCapabilities: [...summary.requestedCapabilities].sort(),
      recentRequests: summary.recentRequests,
      needsAttention:
        summary.requestCount > 0 &&
        (summary.status === "consent_required" ||
          summary.status === "approved_not_active"),
      terminalCommand: "jasper apps",
    }))
    .sort(sortByMostRecent);
}

function connectorStatusFromState(state, existing) {
  if (state.runtimeStatus === "active") {
    return "ready";
  }

  if (state.consentStatus === "approved") {
    return "approved_not_active";
  }

  if (state.consentStatus === "revoked") {
    return existing?.requestCount > 0 ? "consent_required" : "revoked";
  }

  return existing?.status || "tracked";
}

function mergeConnectorStates(records, connectorStates) {
  const summaries = new Map(
    summarizeConnectors(records).map((connector) => [connector.id, connector]),
  );

  for (const state of connectorStates) {
    const existing = summaries.get(state.id);
    const connectorStatus = connectorStatusFromState(state, existing);
    summaries.set(state.id, {
      ...connectorProviderDetails(state.id),
      id: state.id,
      label: existing?.label || connectorLabel(state.id),
      status: connectorStatus,
      consentStatus: state.consentStatus || "unknown",
      runtimeStatus: state.runtimeStatus || "inactive",
      providerId: state.providerId || existing?.providerId || null,
      approvedAt: state.approvedAt || null,
      revokedAt: state.revokedAt || null,
      activatedAt: state.activatedAt || null,
      deactivatedAt: state.deactivatedAt || null,
      latestRequestAt: existing?.latestRequestAt || null,
      requestCount: existing?.requestCount || 0,
      requestedCapabilities: existing?.requestedCapabilities || [],
      recentRequests: existing?.recentRequests || [],
      needsAttention:
        (existing?.requestCount || 0) > 0 &&
        (connectorStatus === "consent_required" ||
          connectorStatus === "approved_not_active"),
      terminalCommand: "jasper apps",
    });
  }

  return [...summaries.values()]
    .map((connector) => ({
      ...connector,
      consentStatus:
        connector.consentStatus ||
        (connector.status === "approved_not_active" ||
        connector.status === "ready"
          ? "approved"
          : "not_approved"),
      runtimeStatus:
        connector.runtimeStatus ||
        (connector.status === "ready" ? "active" : "inactive"),
      preferredProviderId: connector.preferredProviderId || null,
      preferredProviderKind: connector.preferredProviderKind || null,
      providerId: connector.providerId || null,
      approvedAt: connector.approvedAt || null,
      revokedAt: connector.revokedAt || null,
      activatedAt: connector.activatedAt || null,
      deactivatedAt: connector.deactivatedAt || null,
      needsAttention:
        connector.requestCount > 0 &&
        (connector.status === "consent_required" ||
          connector.status === "approved_not_active"),
    }))
    .sort(sortByMostRecent);
}

export function getJasperAppStatus(options = {}) {
  const acquisitionStore =
    options.acquisitionStore ||
    createToolAcquisitionStore({ jasperHome: options.jasperHome });
  const connectorStore =
    options.connectorStore ||
    createConnectorStore({ jasperHome: options.jasperHome });
  const records = acquisitionStore.listAcquisitions({
    limit: Number.MAX_SAFE_INTEGER,
  });
  const connectors = mergeConnectorStates(
    records,
    connectorStore.listConnectorStates(),
  );
  const pendingConnectors = connectors.filter(
    (connector) => connector.needsAttention,
  );
  const blockedForConsent = pendingConnectors.filter(
    (connector) => connector.status === "consent_required",
  );
  const blockedForActivation = pendingConnectors.filter(
    (connector) => connector.status === "approved_not_active",
  );

  const warnings = [];
  const nextSteps = [];
  if (pendingConnectors.length > 0) {
    warnings.push(
      `${pendingConnectors.length} connector request${pendingConnectors.length === 1 ? "" : "s"} ${pendingConnectors.length === 1 ? "is" : "are"} still blocked by consent or activation.`,
    );
    nextSteps.push(
      "Run `jasper apps` to review which connectors Jasper is waiting on and which requests are blocked.",
    );
  }
  if (blockedForConsent.length > 0) {
    nextSteps.push(
      "Use `jasper apps approve CONNECTOR_ID` to approve a blocked connector.",
    );
  }
  if (blockedForActivation.length > 0) {
    nextSteps.push(
      "Use `jasper apps activate CONNECTOR_ID` after approval to make a connector runnable.",
    );
  }

  return {
    status: pendingConnectors.length > 0 ? "needs_attention" : "ready",
    summary:
      pendingConnectors.length > 0
        ? `Jasper is waiting on ${pendingConnectors.length} connector consent or activation path${pendingConnectors.length === 1 ? "" : "s"}.`
        : "No pending connector requests are blocking Jasper.",
    terminalCommand: "jasper apps",
    connectors,
    warnings,
    nextSteps,
  };
}

export function approveConnector(options = {}) {
  const connectorStore =
    options.connectorStore ||
    createConnectorStore({ jasperHome: options.jasperHome });
  const connectorId = normalizeText(options.connectorId);
  if (!connectorId) {
    throw new Error("Connector approval requires a connector id");
  }

  const state = connectorStore.approveConnector(connectorId, options.note);
  const memory =
    options.memory ||
    createEventStore({
      root: options.memoryRoot,
      jasperHome: options.jasperHome,
      source: "jasper-apps",
    });
  const event = memory.appendEvent({
    type: "connector.approved",
    source: "jasper-apps",
    tags: ["connector", "consent", "apps"],
    payload: {
      connectorId,
      approvedAt: state?.approvedAt || null,
      note: options.note ? String(options.note) : null,
    },
  });

  return {
    connector: state,
    event,
    apps: getJasperAppStatus({
      jasperHome: options.jasperHome,
      acquisitionStore: options.acquisitionStore,
      connectorStore,
    }),
  };
}

export function activateConnector(options = {}) {
  const connectorStore =
    options.connectorStore ||
    createConnectorStore({ jasperHome: options.jasperHome });
  const connectorId = normalizeText(options.connectorId);
  if (!connectorId) {
    throw new Error("Connector activation requires a connector id");
  }

  const preferredProvider = getPreferredConnectorProvider(connectorId);
  const providerId =
    options.providerId ||
    preferredProvider?.packageId ||
    preferredProvider?.serverName ||
    null;
  const state = connectorStore.activateConnector(
    connectorId,
    options.note,
    providerId,
  );
  const memory =
    options.memory ||
    createEventStore({
      root: options.memoryRoot,
      jasperHome: options.jasperHome,
      source: "jasper-apps",
    });
  const event = memory.appendEvent({
    type: "connector.activated",
    source: "jasper-apps",
    tags: ["connector", "activation", "apps"],
    payload: {
      connectorId,
      providerId,
      activatedAt: state?.activatedAt || null,
      note: options.note ? String(options.note) : null,
    },
  });

  return {
    connector: state,
    event,
    apps: getJasperAppStatus({
      jasperHome: options.jasperHome,
      acquisitionStore: options.acquisitionStore,
      connectorStore,
    }),
  };
}

export function revokeConnector(options = {}) {
  const connectorStore =
    options.connectorStore ||
    createConnectorStore({ jasperHome: options.jasperHome });
  const connectorId = normalizeText(options.connectorId);
  if (!connectorId) {
    throw new Error("Connector revocation requires a connector id");
  }

  const state = connectorStore.revokeConnector(connectorId, options.note);
  const memory =
    options.memory ||
    createEventStore({
      root: options.memoryRoot,
      jasperHome: options.jasperHome,
      source: "jasper-apps",
    });
  const event = memory.appendEvent({
    type: "connector.revoked",
    source: "jasper-apps",
    tags: ["connector", "consent", "apps"],
    payload: {
      connectorId,
      providerId: state?.providerId || null,
      revokedAt: state?.revokedAt || null,
      note: options.note ? String(options.note) : null,
    },
  });

  return {
    connector: state,
    event,
    apps: getJasperAppStatus({
      jasperHome: options.jasperHome,
      acquisitionStore: options.acquisitionStore,
      connectorStore,
    }),
  };
}

export function deactivateConnector(options = {}) {
  const connectorStore =
    options.connectorStore ||
    createConnectorStore({ jasperHome: options.jasperHome });
  const connectorId = normalizeText(options.connectorId);
  if (!connectorId) {
    throw new Error("Connector deactivation requires a connector id");
  }

  const state = connectorStore.deactivateConnector(
    connectorId,
    options.note,
    options.providerId,
  );
  const memory =
    options.memory ||
    createEventStore({
      root: options.memoryRoot,
      jasperHome: options.jasperHome,
      source: "jasper-apps",
    });
  const event = memory.appendEvent({
    type: "connector.deactivated",
    source: "jasper-apps",
    tags: ["connector", "activation", "apps"],
    payload: {
      connectorId,
      providerId: state?.providerId || options.providerId || null,
      deactivatedAt: state?.deactivatedAt || null,
      note: options.note ? String(options.note) : null,
    },
  });

  return {
    connector: state,
    event,
    apps: getJasperAppStatus({
      jasperHome: options.jasperHome,
      acquisitionStore: options.acquisitionStore,
      connectorStore,
    }),
  };
}

export function mergeDoctorStatus(setupStatus, appStatus) {
  const warnings = [
    ...(Array.isArray(setupStatus?.warnings) ? setupStatus.warnings : []),
    ...(Array.isArray(appStatus?.warnings) ? appStatus.warnings : []),
  ];
  const nextSteps = [
    ...(Array.isArray(setupStatus?.nextSteps) ? setupStatus.nextSteps : []),
    ...(Array.isArray(appStatus?.nextSteps) ? appStatus.nextSteps : []),
  ];

  return {
    ...setupStatus,
    status:
      setupStatus?.status === "needs_attention" ||
      appStatus?.status === "needs_attention"
        ? "needs_attention"
        : "ready",
    warnings,
    nextSteps,
    apps: appStatus,
  };
}
