import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ensureJasperHomeLayout } from "../../../jasper-core/src/home.js";

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

function toolingLayout(options = {}) {
  const home = ensureJasperHomeLayout({ jasperHome: options.jasperHome });
  const toolingDir = path.join(home.dataDir, "tooling");
  fs.mkdirSync(toolingDir, { recursive: true });
  return {
    root: toolingDir,
    acquisitionsLogPath: path.join(toolingDir, "acquisitions.jsonl"),
    quarantineLogPath: path.join(toolingDir, "quarantine.jsonl"),
  };
}

function deriveRecordStatus(record) {
  if (record.build?.status === "generated") {
    return "generated";
  }

  if (record.candidates.some((candidate) => candidate.status === "activated")) {
    return "activated";
  }

  if (record.strategy === "use_existing") {
    return "satisfied";
  }

  if (record.strategy === "request_consent") {
    return "awaiting_consent";
  }

  if (record.strategy === "activate_connector") {
    return "activation_pending";
  }

  const pendingCandidates = record.candidates.filter(
    (candidate) => candidate.status === "pending_quarantine",
  );
  if (pendingCandidates.length > 0) {
    return "quarantine_pending";
  }

  if (record.build?.recommended) {
    return "build_recommended";
  }

  return "planned";
}

function buildRecordFromPlan(plan, options = {}) {
  const acquisition = plan.internalPlan?.acquisition || {};
  const now = new Date().toISOString();

  return {
    schemaVersion: 1,
    id: `acq_${randomUUID()}`,
    createdAt: now,
    updatedAt: now,
    request: plan.request,
    acknowledgement: plan.acknowledgement,
    publicPlan: plan.publicPlan,
    primaryCapabilityId: plan.internalPlan?.primaryCapabilityId || null,
    primaryProvider: plan.internalPlan?.primaryProvider || null,
    source:
      options.source &&
      typeof options.source === "object" &&
      !Array.isArray(options.source)
        ? options.source
        : null,
    strategy: acquisition.strategy || null,
    nextAction: acquisition.nextAction || null,
    requirement: acquisition.requirement || null,
    search: acquisition.search || null,
    quarantine: acquisition.quarantine || null,
    candidates: (acquisition.search?.channels || []).map((channel) => ({
      id: String(channel.id || "").trim(),
      kind: channel.kind || null,
      trust: channel.trust || null,
      reason: channel.reason || null,
      quarantineRequired: Boolean(channel.quarantineRequired),
      status: channel.quarantineRequired ? "pending_quarantine" : "ready",
    })),
    build: {
      ...(acquisition.build || {}),
      status: acquisition.build?.recommended ? "pending" : "not_needed",
    },
  };
}

function applyQuarantineEvent(record, event) {
  const candidate = record.candidates.find(
    (entry) => entry.id === String(event.candidateId || "").trim(),
  );
  if (!candidate) {
    return record;
  }

  if (event.action === "candidate_admitted") {
    candidate.status = "admitted";
    candidate.note = event.note || null;
    candidate.updatedAt = event.ts;
  } else if (event.action === "candidate_rejected") {
    candidate.status = "rejected";
    candidate.note = event.note || null;
    candidate.updatedAt = event.ts;
  } else if (event.action === "candidate_activated") {
    candidate.status = "activated";
    candidate.note = event.note || null;
    candidate.updatedAt = event.ts;
  }

  record.updatedAt = event.ts;
  record.status = deriveRecordStatus(record);
  return record;
}

function applyAcquisitionEvent(records, event) {
  if (event.action === "acquired") {
    const record = {
      ...event.record,
      status: deriveRecordStatus(event.record),
    };
    records.set(record.id, record);
    return;
  }

  const record = records.get(String(event.recordId || "").trim());
  if (!record) {
    return;
  }

  if (event.action === "build_generated") {
    record.build = {
      ...record.build,
      status: "generated",
      generatedToolId: event.generatedToolId || null,
      generatedAt: event.ts,
      generation: event.generation || null,
    };
    record.updatedAt = event.ts;
    record.status = deriveRecordStatus(record);
  }
}

export class JasperToolAcquisitionStore {
  constructor(options = {}) {
    this.layout = toolingLayout(options);
  }

  listAcquisitions(options = {}) {
    const acquisitions = new Map();
    for (const event of readJsonLines(this.layout.acquisitionsLogPath)) {
      applyAcquisitionEvent(acquisitions, event);
    }
    for (const event of readJsonLines(this.layout.quarantineLogPath)) {
      const record = acquisitions.get(String(event.recordId || "").trim());
      if (record) {
        applyQuarantineEvent(record, event);
      }
    }

    return [...acquisitions.values()]
      .filter((record) =>
        options.status ? record.status === String(options.status) : true,
      )
      .sort((left, right) =>
        String(right.updatedAt).localeCompare(String(left.updatedAt)),
      )
      .slice(0, Number(options.limit || 20));
  }

  getAcquisition(recordId) {
    return (
      this.listAcquisitions({ limit: Number.MAX_SAFE_INTEGER }).find(
        (record) => record.id === String(recordId || "").trim(),
      ) || null
    );
  }

  listQuarantineQueue(options = {}) {
    return this.listAcquisitions({
      limit: options.limit,
      status: "quarantine_pending",
    });
  }

  listActivatedProviders(options = {}) {
    return this.listAcquisitions({ limit: Number.MAX_SAFE_INTEGER })
      .flatMap((record) =>
        record.candidates
          .filter((candidate) => candidate.status === "activated")
          .map((candidate) => ({
            recordId: record.id,
            request: record.request,
            requirement: record.requirement,
            primaryCapabilityId: record.primaryCapabilityId,
            ...candidate,
          })),
      )
      .slice(0, Number(options.limit || 20));
  }

  acquire(plan, options = {}) {
    const record = buildRecordFromPlan(plan, options);
    appendJsonLine(this.layout.acquisitionsLogPath, {
      schemaVersion: 1,
      action: "acquired",
      ts: record.createdAt,
      record,
    });
    return {
      ...record,
      status: deriveRecordStatus(record),
    };
  }

  admitCandidate(recordId, candidateId, note) {
    const record = this.getAcquisition(recordId);
    if (!record) {
      throw new Error(`Unknown acquisition record: ${recordId}`);
    }
    if (!record.candidates.some((candidate) => candidate.id === candidateId)) {
      throw new Error(`Unknown acquisition candidate: ${candidateId}`);
    }

    const ts = new Date().toISOString();
    appendJsonLine(this.layout.quarantineLogPath, {
      schemaVersion: 1,
      action: "candidate_admitted",
      ts,
      recordId,
      candidateId,
      note: note ? String(note) : null,
    });
    return this.getAcquisition(recordId);
  }

  rejectCandidate(recordId, candidateId, note) {
    const record = this.getAcquisition(recordId);
    if (!record) {
      throw new Error(`Unknown acquisition record: ${recordId}`);
    }
    if (!record.candidates.some((candidate) => candidate.id === candidateId)) {
      throw new Error(`Unknown acquisition candidate: ${candidateId}`);
    }

    const ts = new Date().toISOString();
    appendJsonLine(this.layout.quarantineLogPath, {
      schemaVersion: 1,
      action: "candidate_rejected",
      ts,
      recordId,
      candidateId,
      note: note ? String(note) : null,
    });
    return this.getAcquisition(recordId);
  }

  activateCandidate(recordId, candidateId, note) {
    const record = this.getAcquisition(recordId);
    if (!record) {
      throw new Error(`Unknown acquisition record: ${recordId}`);
    }

    const candidate = record.candidates.find(
      (entry) => entry.id === String(candidateId || "").trim(),
    );
    if (!candidate) {
      throw new Error(`Unknown acquisition candidate: ${candidateId}`);
    }
    if (candidate.status !== "admitted") {
      throw new Error(
        `Acquisition candidate must be admitted before activation: ${candidateId}`,
      );
    }
    if (
      candidate.kind !== "curated_toolpack" &&
      candidate.kind !== "mcp_capability"
    ) {
      throw new Error(
        `Acquisition candidate cannot be activated by Jasper: ${candidateId}`,
      );
    }

    const ts = new Date().toISOString();
    appendJsonLine(this.layout.quarantineLogPath, {
      schemaVersion: 1,
      action: "candidate_activated",
      ts,
      recordId,
      candidateId,
      note: note ? String(note) : null,
    });
    return this.getAcquisition(recordId);
  }

  recordGeneratedBuild(recordId, generation) {
    const record = this.getAcquisition(recordId);
    if (!record) {
      throw new Error(`Unknown acquisition record: ${recordId}`);
    }

    const ts = new Date().toISOString();
    appendJsonLine(this.layout.acquisitionsLogPath, {
      schemaVersion: 1,
      action: "build_generated",
      ts,
      recordId,
      generatedToolId: generation?.spec?.id || generation?.metadata?.id || null,
      generation,
    });
    return this.getAcquisition(recordId);
  }
}

export function createToolAcquisitionStore(options = {}) {
  return new JasperToolAcquisitionStore(options);
}
