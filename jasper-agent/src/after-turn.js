#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { ensureJasperHomeLayout } from "../../jasper-core/src/home.js";
import { createEventStore } from "../../jasper-memory/src/event-store.js";
import { createToolRegistry } from "../../jasper-tools/src/registry.js";
import { createCapabilityBroker } from "./broker/index.js";
import { createToolAcquisitionStore } from "./broker/acquisition-store.js";
import { createToolMaintenanceWorker } from "./broker/tool-maintenance.js";

const PENDING_STATUSES = new Set([
  "awaiting_consent",
  "quarantine_pending",
  "build_recommended",
  "planned",
]);

function normalizeText(value) {
  return String(value || "").trim();
}

function latestInputMessage(payload) {
  if (Array.isArray(payload?.["input-messages"])) {
    return normalizeText(
      payload["input-messages"][payload["input-messages"].length - 1],
    );
  }

  if (Array.isArray(payload?.input_messages)) {
    return normalizeText(
      payload.input_messages[payload.input_messages.length - 1],
    );
  }

  return "";
}

function parseNotifyPayload(rawPayload) {
  const payload = JSON.parse(String(rawPayload || "{}"));
  if (!payload || typeof payload !== "object") {
    throw new Error("After-turn hook payload must be a JSON object");
  }

  return payload;
}

function pendingAcquisitionExists(store, plan) {
  const primaryCapabilityId = normalizeText(
    plan?.internalPlan?.primaryCapabilityId || "",
  );
  const nextAction = normalizeText(plan?.internalPlan?.acquisition?.nextAction || "");
  if (!primaryCapabilityId || !nextAction) {
    return false;
  }

  return store
    .listAcquisitions({ limit: Number.MAX_SAFE_INTEGER })
    .some(
      (record) =>
        record.primaryCapabilityId === primaryCapabilityId &&
        record.nextAction === nextAction &&
        PENDING_STATUSES.has(record.status),
    );
}

function latestIntakeSource(memory, store, request) {
  const normalizedRequest = normalizeText(request);
  if (!normalizedRequest) {
    return null;
  }

  const processedIntakeIds = new Set(
    store
      .listAcquisitions({ limit: Number.MAX_SAFE_INTEGER })
      .map((record) => normalizeText(record.source?.intakeEventId || ""))
      .filter(Boolean),
  );
  const intakeEvent = memory
    .queryEvents({
      type: "tooling.intake.requested",
      source: "jasper-tooling",
    })
    .slice()
    .reverse()
    .find(
      (event) =>
        !processedIntakeIds.has(normalizeText(event?.id || "")) &&
        normalizeText(event?.payload?.request || "") === normalizedRequest,
    );
  if (!intakeEvent) {
    return null;
  }

  return {
    kind: "turn_intake",
    intakeEventId: normalizeText(intakeEvent.id),
    threadId: normalizeText(intakeEvent.payload?.threadId || "") || null,
    turnId: normalizeText(intakeEvent.payload?.turnId || "") || null,
    ts: normalizeText(intakeEvent.ts) || null,
  };
}

function summarizeOutcome(result) {
  const capabilityLabel =
    result?.acquisition?.requirement?.label ||
    result?.plan?.internalPlan?.acquisition?.requirement?.label ||
    "requested capability";

  switch (result?.outcome?.status) {
    case "generated":
      return {
        type: "tooling.tool.available",
        summary: `Jasper can now use local tool "${result.outcome.tool?.id || result.outcome.generation?.spec?.id || "jasper-tool"}" for ${capabilityLabel.toLowerCase()}.`,
      };
    case "awaiting_consent":
      return {
        type: "tooling.acquire.pending",
        summary: `Jasper identified a ${capabilityLabel.toLowerCase()} path and is waiting for user consent before using it.`,
      };
    case "quarantine_pending":
      return {
        type: "tooling.acquire.pending",
        summary: `Jasper found candidate tools for ${capabilityLabel.toLowerCase()} and queued them for quarantine review.`,
      };
    case "build_required":
      return {
        type: "tooling.acquire.pending",
        summary: `Jasper needs to author a new local tool for ${capabilityLabel.toLowerCase()}.`,
      };
    default:
      return null;
  }
}

function recordSummaryEvent(memory, summary, payload = {}) {
  if (!summary?.type || !summary?.summary) {
    return null;
  }

  return memory.appendEvent({
    type: summary.type,
    source: "jasper-auto-intake",
    tags: ["tooling", "intake"],
    payload: {
      summary: summary.summary,
      ...payload,
    },
  });
}

function recordMaintenanceSummary(memory, generatedItems) {
  const events = [];
  for (const item of generatedItems) {
    const toolId = normalizeText(item?.toolId || "");
    if (!toolId) {
      continue;
    }

    events.push(
      memory.appendEvent({
        type: "tooling.tool.available",
        source: "jasper-auto-intake",
        tags: ["tooling", "maintenance"],
        payload: {
          summary: `Jasper can now use local tool "${toolId}" after background tool maintenance.`,
          toolId,
          recordId: item.recordId || null,
          template: item.template || null,
        },
      }),
    );
  }

  return events;
}

export function processAfterTurn(payload, options = {}) {
  const request = latestInputMessage(payload);
  if (!request) {
    return {
      ok: true,
      skipped: true,
      reason: "missing_input",
    };
  }

  const brokerOptions = {
    identityPath: options.identityPath,
    memoryRoot: options.memoryRoot,
    jasperHome: options.jasperHome,
    toolsRoot: options.toolsRoot,
  };
  const memoryRoot =
    options.memoryRoot ||
    ensureJasperHomeLayout({ jasperHome: options.jasperHome }).memoryDir;
  const broker = createCapabilityBroker(brokerOptions);
  const acquisitionStore =
    options.acquisitionStore ||
    createToolAcquisitionStore({ jasperHome: options.jasperHome });
  const memory =
    options.memory ||
    createEventStore({
      root: memoryRoot,
      jasperHome: options.jasperHome,
      source: "jasper-auto-intake",
    });
  const plan = broker.inspectRequest(request, {
    limit: options.limit,
  });
  const nextAction = normalizeText(plan.internalPlan?.acquisition?.nextAction || "");
  const source = latestIntakeSource(memory, acquisitionStore, request);

  let acquisitionResult = null;
  if (
    nextAction &&
    nextAction !== "use_existing_tool" &&
    !pendingAcquisitionExists(acquisitionStore, plan)
  ) {
    acquisitionResult = broker.acquireRequest(request, {
      limit: options.limit,
      source,
    });
    const summary = summarizeOutcome(acquisitionResult);
    if (summary) {
      recordSummaryEvent(memory, summary, {
        request,
        primaryCapabilityId:
          acquisitionResult.plan.internalPlan?.primaryCapabilityId || null,
        outcomeStatus: acquisitionResult.outcome?.status || null,
      });
    }
  }

  const maintenanceWorker =
    options.toolMaintenanceWorker ||
    createToolMaintenanceWorker({
      jasperHome: options.jasperHome,
      toolsRoot: options.toolsRoot,
      acquisitionStore,
    });
  const maintenance = maintenanceWorker.maintain({
    limit: options.maintenanceLimit,
  });
  const maintenanceEvents =
    maintenance.generatedCount > 0
      ? recordMaintenanceSummary(memory, maintenance.generated)
      : [];
  const registry =
    options.toolRegistry || createToolRegistry({ ...brokerOptions, toolsRoot: options.toolsRoot });

  return {
    ok: true,
    skipped: false,
    request,
    plan,
    acquisitionResult,
    maintenance,
    maintenanceEvents,
    availableTools: registry.listTools(),
  };
}

export function runAfterTurnHook(argv = process.argv.slice(2), options = {}) {
  const payload = parseNotifyPayload(argv[0]);
  return processAfterTurn(payload, options);
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;

if (entryUrl && import.meta.url === entryUrl) {
  try {
    runAfterTurnHook();
    process.exit(0);
  } catch {
    process.exit(0);
  }
}
