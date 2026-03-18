import { createEventStore } from "../../../jasper-memory/src/event-store.js";
import { generateToolFromTemplate } from "../../../jasper-tools/src/generator.js";
import { createToolAcquisitionStore } from "./acquisition-store.js";
import { createCapabilityBroker } from "./index.js";

const PENDING_STATUSES = new Set([
  "awaiting_consent",
  "activation_pending",
  "quarantine_pending",
  "build_recommended",
  "planned",
]);

function defaultGeneratedToolId(record) {
  return String(
    record.primaryCapabilityId || record.requirement?.label || "jasper-tool",
  )
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildGenerationRequest(record, toolsRoot) {
  const template = record.build?.recommendedTemplates?.[0]?.id || null;
  if (!template || record.build?.strategy !== "generate_from_template") {
    return null;
  }

  return {
    id: defaultGeneratedToolId(record),
    template,
    description: `${record.requirement?.label || "Jasper"} tool`,
    toolsRoot,
    query: record.request,
  };
}

function buildIntakeSource(event) {
  return {
    kind: "turn_intake",
    intakeEventId: String(event?.id || "").trim() || null,
    threadId: String(event?.payload?.threadId || "").trim() || null,
    turnId: String(event?.payload?.turnId || "").trim() || null,
    ts: String(event?.ts || "").trim() || null,
  };
}

function summarizeIntakeSkip(event, reason) {
  return {
    intakeEventId: String(event?.id || "").trim() || null,
    turnId: String(event?.payload?.turnId || "").trim() || null,
    reason,
  };
}

function pendingAcquisitionExists(store, plan) {
  const primaryCapabilityId = String(
    plan?.internalPlan?.primaryCapabilityId || "",
  ).trim();
  const nextAction = String(
    plan?.internalPlan?.acquisition?.nextAction || "",
  ).trim();
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

export class JasperToolMaintenanceWorker {
  constructor(options = {}) {
    this.toolsRoot = options.toolsRoot;
    this.eventStore =
      options.eventStore ||
      createEventStore({
        root: options.memoryRoot,
        jasperHome: options.jasperHome,
      });
    this.acquisitionStore =
      options.acquisitionStore ||
      createToolAcquisitionStore({
        jasperHome: options.jasperHome,
      });
    this.broker =
      options.broker ||
      createCapabilityBroker({
        identityPath: options.identityPath,
        memoryRoot: options.memoryRoot,
        jasperHome: options.jasperHome,
        toolsRoot: options.toolsRoot,
        acquisitionStore: this.acquisitionStore,
      });
  }

  processPendingIntake(options = {}) {
    const limit = Math.max(1, Number(options.limit ?? 5));
    const processedIntakeIds = new Set(
      this.acquisitionStore
        .listAcquisitions({ limit: Number.MAX_SAFE_INTEGER })
        .map((record) => String(record.source?.intakeEventId || "").trim())
        .filter(Boolean),
    );
    const backlog = this.eventStore
      .queryEvents({
        type: "tooling.intake.requested",
        source: "jasper-tooling",
      })
      .filter((event) => !processedIntakeIds.has(String(event.id || "").trim()))
      .slice(0, limit);
    const acquired = [];
    const skipped = [];

    for (const event of backlog) {
      const request = String(event?.payload?.request || "").trim();
      if (!request) {
        skipped.push(summarizeIntakeSkip(event, "Missing request text."));
        continue;
      }

      const plan = this.broker.inspectRequest(request);
      const nextAction = plan.internalPlan?.acquisition?.nextAction || null;
      if (
        !plan.internalPlan?.primaryCapabilityId ||
        nextAction === "use_existing_tool"
      ) {
        skipped.push(
          summarizeIntakeSkip(
            event,
            "Request is already satisfied by Jasper's current runtime.",
          ),
        );
        continue;
      }
      if (pendingAcquisitionExists(this.acquisitionStore, plan)) {
        skipped.push(
          summarizeIntakeSkip(
            event,
            "Matching acquisition work is already pending for this capability.",
          ),
        );
        continue;
      }

      const record = this.acquisitionStore.acquire(plan, {
        source: buildIntakeSource(event),
      });
      acquired.push({
        intakeEventId: event.id,
        recordId: record.id,
        capabilityId: record.primaryCapabilityId,
        status: record.status,
        nextAction: record.nextAction,
      });
    }

    return {
      scanned: backlog.length,
      acquired,
      skipped,
      acquiredCount: acquired.length,
      skippedCount: skipped.length,
    };
  }

  maintain(options = {}) {
    const limit = Math.max(1, Number(options.limit ?? 5));
    const intake = this.processPendingIntake({
      limit: options.intakeLimit ?? limit,
    });
    const backlog = this.acquisitionStore
      .listAcquisitions({ limit: Number.MAX_SAFE_INTEGER })
      .filter(
        (record) =>
          record.status === "build_recommended" &&
          record.build?.status === "pending",
      )
      .slice(0, limit);

    const generated = [];
    const skipped = [];

    for (const record of backlog) {
      const request = buildGenerationRequest(record, this.toolsRoot);
      if (!request) {
        skipped.push({
          recordId: record.id,
          reason: "No Jasper template is available for this build request.",
        });
        continue;
      }

      const generation = generateToolFromTemplate(request);
      const acquisition = this.acquisitionStore.recordGeneratedBuild(
        record.id,
        generation,
      );
      generated.push({
        recordId: record.id,
        toolId: generation.spec.id,
        template: generation.spec.template,
        acquisitionStatus: acquisition.status,
      });
    }

    return {
      intake,
      scanned: backlog.length,
      generated,
      skipped,
      intakeAcquiredCount: intake.acquiredCount,
      intakeSkippedCount: intake.skippedCount,
      generatedCount: generated.length,
      skippedCount: skipped.length,
    };
  }
}

export function createToolMaintenanceWorker(options = {}) {
  return new JasperToolMaintenanceWorker(options);
}
