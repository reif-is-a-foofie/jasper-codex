import test from "node:test";
import assert from "node:assert/strict";
import { createGuardManager, GuardScenarios } from "./guard.js";

function createFakeMemory() {
  const events = [];
  return {
    appendEvent(event) {
      const stored = {
        ...event,
        id: `evt_${events.length + 1}`,
      };
      events.push(stored);
      return stored;
    },
    listRecentEvents({ limit = 20, type } = {}) {
      const filtered = type
        ? events.filter((event) => event.type === type)
        : [...events];
      const slice = filtered.slice(-limit);
      return slice.reverse();
    },
  };
}

test("guard simulation records high severity anomalies", () => {
  const memory = createFakeMemory();
  const manager = createGuardManager({
    memory,
    quietWindows: [],
  });

  const anomaly = manager.simulateScenario("suspicious-login");

  assert.equal(anomaly.type, "guard.anomaly");
  assert.equal(anomaly.payload.category, "security");
  assert.equal(anomaly.payload.severity, "high");
  assert.ok(anomaly.payload.detail.includes("Simulated"));
  assert.ok(GuardScenarios.includes("suspicious-login"));
});

test("guard detects repeated session snapshots as security risk", () => {
  const memory = createFakeMemory();
  const manager = createGuardManager({
    memory,
    quietWindows: [],
  });

  const firstEvent = {
    type: "listener.session.snapshot",
    ts: new Date(Date.now() - 5000).toISOString(),
    payload: {
      pid: 123,
    },
  };

  const secondEvent = {
    type: "listener.session.snapshot",
    ts: new Date().toISOString(),
    payload: {
      pid: 134,
    },
  };

  memory.appendEvent(firstEvent);
  memory.appendEvent(secondEvent);

  const result = manager.evaluatePendingEvents({ sinceTimestamp: 0, limit: 5 });
  assert.ok(result.anomalies.length >= 1);

  const anomalyRecords = manager.listAnomalies({ limit: 10 });
  assert.ok(anomalyRecords.some((record) => record.payload.id === "security.suspicious-login"));
});
