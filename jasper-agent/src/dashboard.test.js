import test from "node:test";
import assert from "node:assert/strict";
import { createDashboard } from "./dashboard.js";

function createFakeMemory() {
  const events = [];
  return {
    listRecentEvents({ limit = 20 } = {}) {
      if (limit <= 0) {
        return [];
      }
      return [...events].slice(-limit).reverse();
    },
    appendEvent(event) {
      const stored = {
        ...event,
        id: `evt_${events.length + 1}`,
        ts: event.ts || new Date().toISOString(),
      };
      events.push(stored);
      return stored;
    },
  };
}

test("dashboard render aggregates digest, guard, connectors, workflows, strategic audit", async () => {
  const memory = createFakeMemory();
  memory.appendEvent({
    type: "workflow.execution",
    payload: {
      workflowId: "daily-plan",
    },
  });
  const dashboard = createDashboard({
    memory,
    digestReporter: {
      generateDigest: async () => ({
        summaryText: "digest summary",
        summaryLines: ["line1", "line2"],
      }),
    },
    guardManager: {
      evaluatePendingEvents: () => ({ anomalies: [], latestTimestamp: 0 }),
      listAnomalies: () => [
        {
          payload: { id: "alert-1", detail: "alert detail" },
        },
      ],
    },
    workflowManager: {
      listWorkflows: () => [
        { id: "daily-plan", name: "Daily Plan" },
      ],
    },
    strategicManager: {
      auditCommitments: () => ({
        summary: "ok",
        totalCommitments: 1,
        contradictions: [],
      }),
    },
    fetchAppStatus: () => ({
      connectors: [
        { id: "calendar", needsAttention: true },
        { id: "email", needsAttention: false },
      ],
    }),
  });

  const view = await dashboard.render();
  assert.equal(view.digest.summaryText, "digest summary");
  assert.strictEqual(view.guardAlerts.length, 1);
  assert.strictEqual(view.activeWorkflows.length, 1);
  assert.strictEqual(view.pendingApprovals.length, 1);
  assert.equal(view.strategicAudit.summary, "ok");
  assert.strictEqual(view.workflowHistory.length, 1);
});
