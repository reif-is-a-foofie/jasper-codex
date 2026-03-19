import { randomUUID } from "node:crypto";
import { loadIdentityConfig } from "../../jasper-core/src/identity.js";
import { createEventStore } from "../../jasper-memory/src/event-store.js";
import { createToolMaintenanceWorker } from "./broker/tool-maintenance.js";
import { createEnvironmentListeners } from "./listeners/index.js";
import { createDigestReporter } from "./digest.js";
import { createWorkflowManager } from "./workflows.js";
import { createGuardManager } from "./guard.js";
import { createStrategicMemoryManager } from "./strategic-memory.js";

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class JasperRuntime {
  constructor(options = {}) {
    this.identityPath = options.identityPath;
    this.tickIntervalMs = Math.max(10, Number(options.tickIntervalMs ?? 5000));
    this.maxTicks =
      options.maxTicks === undefined
        ? null
        : Math.max(1, Number(options.maxTicks));
    this.memoryRoot = options.memoryRoot;
    this.memoryContextLimit = Math.max(
      1,
      Number(options.memoryContextLimit ?? 5),
    );
    this.stdout = options.stdout || process.stdout;
    this.identity = null;
    this.memory = createEventStore({
      root: this.memoryRoot,
      jasperHome: options.jasperHome,
      source: "jasper-runtime",
    });
    this.memoryContext = [];
    this.watchPaths = Array.isArray(options.watchPaths)
      ? options.watchPaths
      : [];
    this.listeners = createEnvironmentListeners({
      cwd: options.cwd || process.cwd(),
      watchPaths: this.watchPaths,
      maxDepth: options.listenerMaxDepth,
      maxFiles: options.listenerMaxFiles,
      maxChanges: options.listenerMaxChanges,
      maxRecentFiles: options.listenerMaxRecentFiles,
    });
    this.toolMaintenanceWorker =
      options.toolMaintenanceWorker ||
      createToolMaintenanceWorker({
        jasperHome: options.jasperHome,
        toolsRoot: options.toolsRoot,
      });
    this.toolMaintenanceLimit = Math.max(
      1,
      Number(options.toolMaintenanceLimit ?? 3),
    );
    this.running = false;
    this.sessionId = options.sessionId || `runtime_${randomUUID()}`;
    this.tickCount = 0;
    this.workflowManager =
      options.workflowManager ||
      createWorkflowManager({
        memory: this.memory,
        jasperHome: options.jasperHome,
      });
    this.workflowSchedules = Array.isArray(options.workflowSchedules)
      ? options.workflowSchedules
      : [
          {
            workflowId: "daily-plan",
            stage: "scheduled",
            intervalMs: 12 * 60 * 60 * 1000,
            autoApprove: false,
          },
        ];
    this.workflowScheduleState = new Map();
    this.digestStages =
      Array.isArray(options.digestStages) && options.digestStages.length > 0
        ? options.digestStages
        : ["morning", "evening"];
    this.digestStageIndex = 0;
    this.digestIntervalMs = Math.max(
      1000,
      Number(options.digestIntervalMs ?? 6 * 60 * 60 * 1000),
    );
    this.digestLookbackHours = Math.max(
      0.25,
      Number(options.digestLookbackHours ?? 6),
    );
    this.digestReporter =
      options.digestReporter ||
      createDigestReporter({
        memory: this.memory,
        jasperHome: options.jasperHome,
      });
    this.lastDigestAt = 0;
    this.guardManager =
      options.guardManager ||
      createGuardManager({
        memory: this.memory,
        jasperHome: options.jasperHome,
      });
    this.guardLastTimestamp = 0;
    this.strategicManager =
      options.strategicManager ||
      createStrategicMemoryManager({
        memory: this.memory,
        jasperHome: options.jasperHome,
      });
    this.strategicAuditIntervalMs = Math.max(
      1000,
      Number(options.strategicAuditIntervalMs ?? 4 * 60 * 60 * 1000),
    );
    this.lastStrategicAuditAt = 0;
  }

  log(event, details = {}) {
    const payload = {
      ts: nowIso(),
      event,
      ...details,
    };
    this.stdout.write(`${JSON.stringify(payload)}\n`);
  }

  record(event, details = {}, options = {}) {
    const payload = {
      sessionId: this.sessionId,
      ...details,
    };

    this.log(event, payload);
    return this.memory.appendEvent({
      type: event,
      source: options.source || "jasper-runtime",
      sessionId: this.sessionId,
      tags: options.tags || ["runtime"],
      payload,
    });
  }

  recordObservation(observation) {
    return this.record(observation.type, observation.payload || {}, {
      source: observation.source,
      tags: observation.tags,
    });
  }

  captureInitialEnvironment() {
    for (const listener of this.listeners) {
      const observations = listener.captureInitialObservations();
      for (const observation of observations) {
        this.recordObservation(observation);
      }
    }
  }

  pollEnvironment() {
    for (const listener of this.listeners) {
      const observations = listener.pollObservations();
      for (const observation of observations) {
        this.recordObservation(observation);
      }
    }
  }

  initialize(options = {}) {
    const identityState = loadIdentityConfig({
      identityPath: this.identityPath,
    });
    this.identity = identityState;
    this.memoryContext = this.memory.listRecentEvents({
      limit: this.memoryContextLimit,
      excludeSessionId: this.sessionId,
    });

    if (options.silent !== true) {
      this.record(
        "runtime.initialized",
        {
          identityPath: identityState.path,
          agentName: identityState.config.identity.name,
          owner: identityState.config.identity.owner,
          memoryRoot: this.memory.root,
          recoveredContextCount: this.memoryContext.length,
        },
        {
          tags: ["runtime", "identity", "startup"],
        },
      );
    } else {
      this.memory.appendEvent({
        type: "runtime.initialized",
        source: "jasper-runtime",
        sessionId: this.sessionId,
        tags: ["runtime", "identity", "startup"],
        payload: {
          sessionId: this.sessionId,
          identityPath: identityState.path,
          agentName: identityState.config.identity.name,
          owner: identityState.config.identity.owner,
          memoryRoot: this.memory.root,
          recoveredContextCount: this.memoryContext.length,
        },
      });
    }
  }

  async loadRelevantMemory() {
    const query = [
      this.identity?.config?.identity?.role,
      ...(this.identity?.config?.mission || []),
      "runtime",
      "household",
    ].join(" ");

    const semantic = await this.memory.searchSemanticEvents({
      query,
      limit: 3,
      excludeSessionId: this.sessionId,
    });

    if (semantic.length > 0) {
      return semantic;
    }

    return this.memory.searchRelevantEvents({
      query,
      limit: 3,
      excludeSessionId: this.sessionId,
    });
  }

  maintainTools() {
    try {
      return this.toolMaintenanceWorker.maintain({
        limit: this.toolMaintenanceLimit,
      });
    } catch (error) {
      return {
        scanned: 0,
        generated: [],
        skipped: [
          {
            reason:
              error instanceof Error
                ? error.message
                : String(error || "unknown"),
          },
        ],
        generatedCount: 0,
        skippedCount: 1,
        failed: true,
      };
    }
  }

  async runScheduledWorkflows() {
    if (!this.workflowManager || this.workflowSchedules.length === 0) {
      return;
    }

    const now = Date.now();
    for (const schedule of this.workflowSchedules) {
      const intervalMs = Math.max(0, Number(schedule.intervalMs || 0));
      if (intervalMs <= 0) {
        continue;
      }

      const state =
        this.workflowScheduleState.get(schedule.workflowId) || {
          lastRun: 0,
        };
      if (now - state.lastRun < intervalMs) {
        continue;
      }

      try {
        const result = await this.workflowManager.runWorkflow({
          workflowId: schedule.workflowId,
          stage: schedule.stage,
          autoApprove: Boolean(schedule.autoApprove),
        });

        this.record(
          "workflow.execution",
          {
            workflowId: result.workflowId,
            stage: result.stage,
            status: result.status,
            steps: result.steps,
          },
          {
            tags: ["workflow", "schedule"],
          },
        );

        this.workflowScheduleState.set(schedule.workflowId, {
          lastRun: now,
          lastStatus: result.status,
        });
      } catch (error) {
        this.record(
          "workflow.execution.failed",
          {
            workflowId: schedule.workflowId,
            reason: error instanceof Error ? error.message : String(error),
          },
          {
            tags: ["workflow", "schedule", "error"],
          },
        );
      }
    }
  }

  async runGuardChecks() {
    if (!this.guardManager) {
      return;
    }

    const result = this.guardManager.evaluatePendingEvents({
      sinceTimestamp: this.guardLastTimestamp,
      limit: 32,
    });

    if (result.latestTimestamp > this.guardLastTimestamp) {
      this.guardLastTimestamp = result.latestTimestamp;
    }

    if (result.anomalies.length > 0) {
      this.record(
        "guard.detected",
        {
          count: result.anomalies.length,
          severity: result.anomalies[0]?.payload.severity || "unknown",
          categories: [
            ...new Set(
              result.anomalies.map((anomaly) => anomaly.payload.category),
            ),
          ],
        },
        {
          tags: ["guard", "monitoring"],
        },
      );
    }
  }

  runStrategicAudit() {
    if (!this.strategicManager) {
      return;
    }

    const now = Date.now();
    if (now - this.lastStrategicAuditAt < this.strategicAuditIntervalMs) {
      return;
    }

    const audit = this.strategicManager.auditCommitments({ limit: 40 });
    this.record(
      "memory.strategic.summary",
      {
        summary: audit.summary,
        totalCommitments: audit.totalCommitments,
        contradictions: audit.contradictions.length,
      },
      {
        tags: ["memory", "strategic"],
      },
    );

    this.lastStrategicAuditAt = now;
  }

  async start() {
    if (this.running) {
      throw new Error("Jasper runtime is already running");
    }

    this.initialize();
    this.running = true;
    this.record(
      "memory.context.loaded",
      {
        recentEventCount: this.memoryContext.length,
        recentEventTypes: this.memoryContext.map((event) => event.type),
      },
      {
        tags: ["memory", "retrieval", "startup"],
      },
    );
    this.record(
      "runtime.started",
      {
        tickIntervalMs: this.tickIntervalMs,
        mode: this.maxTicks === null ? "continuous" : "bounded",
        memoryRoot: this.memory.root,
      },
      {
        tags: ["runtime", "startup"],
      },
    );
    this.captureInitialEnvironment();

    while (this.running) {
      this.tickCount += 1;
      this.pollEnvironment();
      const toolMaintenance = this.maintainTools();
      if (
        toolMaintenance.intakeAcquiredCount > 0 ||
        toolMaintenance.intakeSkippedCount > 0 ||
        toolMaintenance.generatedCount > 0 ||
        toolMaintenance.skippedCount > 0
      ) {
        this.record(
          "tooling.maintenance",
          {
            tick: this.tickCount,
            intake: toolMaintenance.intake,
            scanned: toolMaintenance.scanned,
            generated: toolMaintenance.generated,
            skipped: toolMaintenance.skipped,
          },
          {
            tags: ["runtime", "tooling", "maintenance"],
          },
        );
      }
      const relevantMemory = await this.loadRelevantMemory();
      this.record(
        "runtime.tick",
        {
          tick: this.tickCount,
          role: this.identity.config.identity.role,
          mission: this.identity.config.mission,
          relevantMemoryIds: relevantMemory.map((event) => event.id),
          relevantMemoryTypes: relevantMemory.map((event) => event.type),
          relevantMemoryScores: relevantMemory.map(
            (event) => event.vectorScore ?? event.relevanceScore ?? 0,
          ),
          activeListeners: this.listeners.map((listener) => listener.id),
          queuedAcquisitionCount: toolMaintenance.intakeAcquiredCount,
          generatedToolCount: toolMaintenance.generatedCount,
        },
        {
          tags: ["runtime", "heartbeat"],
        },
      );

      const nowMs = Date.now();
      if (
        this.digestStages.length > 0 &&
        nowMs - this.lastDigestAt >= this.digestIntervalMs
      ) {
        const stage = this.digestStages[this.digestStageIndex];
        const digest = await this.digestReporter.generateDigest({
          stage,
          lookbackHours: this.digestLookbackHours,
        });
        this.record(
          "digest.generated",
          {
            stage,
            timestamp: digest.timestamp,
            summary: digest.summaryText,
            connectorsNeedAttention: digest.connectorsNeedAttention.map(
              (connector) => ({
                id: connector.id,
                status: connector.status,
              }),
            ),
            warnings: digest.warnings,
            nextSteps: digest.nextSteps,
          },
          {
            tags: ["digest", "monitoring"],
          },
        );
        this.lastDigestAt = nowMs;
        this.digestStageIndex =
          (this.digestStageIndex + 1) % this.digestStages.length;
      }

      await this.runScheduledWorkflows();
      await this.runGuardChecks();
      this.runStrategicAudit();

      if (this.maxTicks !== null && this.tickCount >= this.maxTicks) {
        this.stop("max_ticks_reached");
        break;
      }

      await sleep(this.tickIntervalMs);
    }

    return {
      ok: true,
      ticks: this.tickCount,
      stopped: !this.running,
    };
  }

  stop(reason = "requested") {
    if (!this.running) {
      return;
    }
    this.running = false;
    this.record(
      "runtime.stopped",
      {
        reason,
        ticks: this.tickCount,
      },
      {
        tags: ["runtime", "shutdown"],
      },
    );
  }
}

export function createJasperRuntime(options = {}) {
  return new JasperRuntime(options);
}
