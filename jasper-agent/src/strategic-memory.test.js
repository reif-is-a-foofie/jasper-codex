import test from "node:test";
import assert from "node:assert/strict";
import { createStrategicMemoryManager } from "./strategic-memory.js";

function createFakeMemory() {
  const events = [];

  return {
    appendEvent(event) {
      const stored = {
        ...event,
        id: `evt_${events.length + 1}`,
        ts: event.ts || new Date().toISOString(),
      };
      events.push(stored);
      return stored;
    },
    listRecentEvents({ limit = 20 } = {}) {
      return [...events].slice(-limit).reverse();
    },
  };
}

test("strategic list returns strategic events", async () => {
  const memory = createFakeMemory();
  const manager = createStrategicMemoryManager({ memory });

  memory.appendEvent({
    type: "memory.goal",
    payload: { summary: "Reach profitability" },
  });

  memory.appendEvent({
    type: "memory.constraint",
    payload: { summary: "No call Fridays" },
  });

  const events = manager.listStrategicEvents({ limit: 5 });
  assert.ok(events.length >= 2);
  assert.ok(events.some((item) => item.type === "memory.goal"));
});

test("recordcommitment and listcommitments work", () => {
  const memory = createFakeMemory();
  const manager = createStrategicMemoryManager({ memory });

  const recorded = manager.recordCommitment({
    subject: "alpha project",
    summary: "Deliver phase 1",
    status: "open",
    confidence: 0.9,
  });

  assert.equal(recorded.subject, "alpha project");
  const list = manager.listCommitments({ limit: 5 });
  assert.equal(list.length, 1);
  assert.equal(list[0].status, "open");
});

test("audit detects contradictions when statuses drift", () => {
  const memory = createFakeMemory();
  const manager = createStrategicMemoryManager({ memory });

  manager.recordCommitment({
    subject: "alpha project",
    summary: "Deliver phase 1",
    status: "open",
  });

  manager.recordCommitment({
    subject: "alpha project",
    summary: "Deliver phase 1",
    status: "closed",
  });

  const audit = manager.auditCommitments();
  assert.equal(audit.contradictions.length, 1);
  assert.equal(audit.totalCommitments, 2);
});
