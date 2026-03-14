import { randomUUID } from "node:crypto";
import { loadIdentityConfig } from "../../jasper-core/src/identity.js";
import { createEventStore } from "../../jasper-memory/src/event-store.js";
import { createToolMaintenanceWorker } from "./broker/tool-maintenance.js";
import { createEnvironmentListeners } from "./listeners/index.js";

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
