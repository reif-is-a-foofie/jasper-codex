import test from "node:test";
import assert from "node:assert/strict";
import { createCommsManager } from "./comms.js";

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
    listRecentEvents({ limit = 200 } = {}) {
      return [...events].slice(-limit).reverse();
    },
  };
}

test("records and lists threads sorted by urgency", () => {
  const memory = createFakeMemory();
  const manager = createCommsManager({ memory });

  manager.recordThread({
    summary: "Low urgency note",
    urgency: 3,
    actor: "Alice",
  });

  manager.recordThread({
    summary: "High urgency issue",
    urgency: 9,
    actor: "Bob",
  });

  const threads = manager.listThreads({ limit: 5 });
  assert.strictEqual(threads[0].actor, "Bob");
  assert.strictEqual(threads[1].actor, "Alice");
});

test("generates briefs and drafts", () => {
  const memory = createFakeMemory();
  const manager = createCommsManager({ memory });

  const thread = manager.recordThread({
    summary: "Need reply on proposal",
    actor: "Carol",
    urgency: 8,
  });
  manager.recordFollowUp({
    threadId: thread.threadId,
    note: "Follow up tomorrow",
    due: "2026-04-01",
  });

  const brief = manager.generateBrief();
  assert.equal(brief.urgent, 1);
  assert.ok(brief.summary.some((item) => item.threadId === thread.threadId));

  const drafts = manager.draftReplies({ limit: 2, voice: "professional" });
  assert.ok(drafts[0].draft.includes("Carol"));
});
