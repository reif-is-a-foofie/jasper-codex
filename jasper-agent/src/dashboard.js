import { createEventStore } from "../../jasper-memory/src/event-store.js";
import { getJasperAppStatus } from "./apps.js";
import { createDigestReporter } from "./digest.js";
import { createWorkflowManager } from "./workflows.js";
import { createGuardManager } from "./guard.js";
import { createStrategicMemoryManager } from "./strategic-memory.js";

function defaultEventStore(options = {}) {
  return createEventStore({
    root: options.memoryRoot,
    jasperHome: options.jasperHome,
    source: "jasper-dashboard",
  });
}

function defaultFetchAppStatus(options = {}) {
  return getJasperAppStatus({
    jasperHome: options.jasperHome,
    acquisitionStore: options.acquisitionStore,
    connectorStore: options.connectorStore,
    memoryRoot: options.memoryRoot,
  });
}

export function createDashboard(options = {}) {
  const memory = options.memory || defaultEventStore(options);
  const digestReporter =
    options.digestReporter ||
    createDigestReporter({
      memory,
      jasperHome: options.jasperHome,
    });
  const workflowManager =
    options.workflowManager ||
    createWorkflowManager({
      memory,
      jasperHome: options.jasperHome,
    });
  const guardManager =
    options.guardManager ||
    createGuardManager({
      memory,
      jasperHome: options.jasperHome,
    });
  const strategicManager =
    options.strategicManager ||
    createStrategicMemoryManager({
      memory,
      jasperHome: options.jasperHome,
    });
  const fetchAppStatus = options.fetchAppStatus || defaultFetchAppStatus;

  return {
    async render(viewOptions = {}) {
      const digest = await digestReporter.generateDigest({
        stage: viewOptions.stage || "today",
        lookbackHours: viewOptions.lookbackHours ?? 6,
        eventLimit: viewOptions.eventLimit ?? 6,
      });

      guardManager.evaluatePendingEvents({
        limit: viewOptions.guardLimit ?? 16,
      });
      const anomalies = guardManager.listAnomalies({
        limit: viewOptions.alertLimit ?? 4,
      });

      const appStatus = fetchAppStatus({
        jasperHome: options.jasperHome,
        acquisitionStore: options.acquisitionStore,
        connectorStore: options.connectorStore,
        memoryRoot: options.memoryRoot,
      });
      const pendingApprovals = (appStatus?.connectors || []).filter(
        (connector) => connector.needsAttention,
      );

      const workflowHistory = memory
        .listRecentEvents({
          limit: viewOptions.historyLimit ?? 5,
        })
        .filter((event) => event.type === "workflow.execution");

      const strategicAudit = strategicManager.auditCommitments({
        limit: viewOptions.strategicLimit ?? 40,
      });

      return {
        timestamp: new Date().toISOString(),
        digest: {
          summaryText: digest.summaryText,
          summaryLines: digest.summaryLines,
        },
        connectors: appStatus.connectors,
        pendingApprovals,
        guardAlerts: anomalies.map((event) => event.payload),
        activeWorkflows: workflowManager.listWorkflows(),
        workflowHistory,
        strategicAudit,
      };
    },
  };
}
