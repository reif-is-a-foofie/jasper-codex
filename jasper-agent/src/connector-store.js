import fs from "node:fs";
import path from "node:path";
import { ensureJasperHomeLayout } from "../../jasper-core/src/home.js";

function appendJsonLine(filePath, value) {
  fs.appendFileSync(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

function readJsonLines(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function normalizeConnectorId(value) {
  return String(value || "").trim().toLowerCase();
}

function connectorsLayout(options = {}) {
  const home = ensureJasperHomeLayout({ jasperHome: options.jasperHome });
  const connectorsDir = path.join(home.dataDir, "connectors");
  fs.mkdirSync(connectorsDir, { recursive: true });
  return {
    root: connectorsDir,
    approvalsLogPath: path.join(connectorsDir, "approvals.jsonl"),
  };
}

function deriveConnectorStatus(state) {
  if (state.runtimeStatus === "active") {
    return "ready";
  }

  if (state.consentStatus === "approved") {
    return "approved_not_active";
  }

  if (state.consentStatus === "revoked") {
    return "revoked";
  }

  return "unknown";
}

function withDerivedStatus(state) {
  return {
    ...state,
    status: deriveConnectorStatus(state),
  };
}

function applyConnectorEvent(states, event) {
  const connectorId = normalizeConnectorId(event.connectorId);
  if (!connectorId) {
    return;
  }

  const current =
    states.get(connectorId) || {
      id: connectorId,
      consentStatus: "unknown",
      runtimeStatus: "inactive",
      providerId: null,
      status: "unknown",
      firstApprovedAt: null,
      approvedAt: null,
      revokedAt: null,
      activatedAt: null,
      deactivatedAt: null,
      updatedAt: null,
      note: null,
    };

  if (event.action === "connector_approved") {
    const approvedAt = String(event.ts || "").trim() || null;
    states.set(
      connectorId,
      withDerivedStatus({
        ...current,
        id: connectorId,
        consentStatus: "approved",
        firstApprovedAt: current.firstApprovedAt || approvedAt,
        approvedAt,
        updatedAt: approvedAt,
        note: event.note ? String(event.note) : null,
      }),
    );
    return;
  }

  if (event.action === "connector_revoked") {
    const revokedAt = String(event.ts || "").trim() || null;
    states.set(
      connectorId,
      withDerivedStatus({
        ...current,
        id: connectorId,
        consentStatus: "revoked",
        runtimeStatus: "inactive",
        revokedAt,
        deactivatedAt: revokedAt,
        updatedAt: revokedAt,
        note: event.note ? String(event.note) : null,
      }),
    );
    return;
  }

  if (event.action === "connector_activated") {
    const activatedAt = String(event.ts || "").trim() || null;
    states.set(
      connectorId,
      withDerivedStatus({
        ...current,
        id: connectorId,
        runtimeStatus: "active",
        providerId: event.providerId ? String(event.providerId) : current.providerId,
        activatedAt,
        updatedAt: activatedAt,
        note: event.note ? String(event.note) : null,
      }),
    );
    return;
  }

  if (event.action === "connector_deactivated") {
    const deactivatedAt = String(event.ts || "").trim() || null;
    states.set(
      connectorId,
      withDerivedStatus({
        ...current,
        id: connectorId,
        runtimeStatus: "inactive",
        providerId: event.providerId ? String(event.providerId) : current.providerId,
        deactivatedAt,
        updatedAt: deactivatedAt,
        note: event.note ? String(event.note) : null,
      }),
    );
    return;
  }
}

function currentStateOrThrow(state, connectorId, action) {
  if (state) {
    return state;
  }

  throw new Error(
    `Connector ${action} requires a known connector id: ${connectorId}`,
  );
}

export class JasperConnectorStore {
  constructor(options = {}) {
    this.layout = connectorsLayout(options);
  }

  listConnectorStates() {
    const states = new Map();
    for (const event of readJsonLines(this.layout.approvalsLogPath)) {
      applyConnectorEvent(states, event);
    }

    return [...states.values()].sort((left, right) =>
      String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")),
    );
  }

  getConnectorState(connectorId) {
    const normalized = normalizeConnectorId(connectorId);
    if (!normalized) {
      return null;
    }

    return (
      this.listConnectorStates().find((state) => state.id === normalized) || null
    );
  }

  listApprovedConnectors() {
    return this.listConnectorStates().filter(
      (state) => state.consentStatus === "approved",
    );
  }

  listActiveConnectors() {
    return this.listConnectorStates().filter(
      (state) => state.runtimeStatus === "active",
    );
  }

  approveConnector(connectorId, note = null) {
    const normalized = normalizeConnectorId(connectorId);
    if (!normalized) {
      throw new Error("Connector approval requires a connector id");
    }

    const ts = new Date().toISOString();
    appendJsonLine(this.layout.approvalsLogPath, {
      schemaVersion: 1,
      action: "connector_approved",
      ts,
      connectorId: normalized,
      note: note ? String(note) : null,
    });
    return this.getConnectorState(normalized);
  }

  activateConnector(connectorId, note = null, providerId = null) {
    const normalized = normalizeConnectorId(connectorId);
    if (!normalized) {
      throw new Error("Connector activation requires a connector id");
    }

    const state = currentStateOrThrow(
      this.getConnectorState(normalized),
      normalized,
      "activation",
    );
    if (state.consentStatus !== "approved") {
      throw new Error(
        `Connector activation requires prior approval: ${normalized}`,
      );
    }

    const ts = new Date().toISOString();
    appendJsonLine(this.layout.approvalsLogPath, {
      schemaVersion: 1,
      action: "connector_activated",
      ts,
      connectorId: normalized,
      providerId: providerId ? String(providerId) : null,
      note: note ? String(note) : null,
    });
    return this.getConnectorState(normalized);
  }

  revokeConnector(connectorId, note = null) {
    const normalized = normalizeConnectorId(connectorId);
    if (!normalized) {
      throw new Error("Connector revocation requires a connector id");
    }

    const ts = new Date().toISOString();
    appendJsonLine(this.layout.approvalsLogPath, {
      schemaVersion: 1,
      action: "connector_revoked",
      ts,
      connectorId: normalized,
      note: note ? String(note) : null,
    });
    return this.getConnectorState(normalized);
  }

  deactivateConnector(connectorId, note = null, providerId = null) {
    const normalized = normalizeConnectorId(connectorId);
    if (!normalized) {
      throw new Error("Connector deactivation requires a connector id");
    }

    currentStateOrThrow(
      this.getConnectorState(normalized),
      normalized,
      "deactivation",
    );

    const ts = new Date().toISOString();
    appendJsonLine(this.layout.approvalsLogPath, {
      schemaVersion: 1,
      action: "connector_deactivated",
      ts,
      connectorId: normalized,
      providerId: providerId ? String(providerId) : null,
      note: note ? String(note) : null,
    });
    return this.getConnectorState(normalized);
  }
}

export function createConnectorStore(options = {}) {
  return new JasperConnectorStore(options);
}
