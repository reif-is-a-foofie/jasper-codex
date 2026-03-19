import test from "node:test";
import assert from "node:assert/strict";
import { createComputerUseManager } from "./computer-use.js";

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

test("creates and lists computer action plans", () => {
  const memory = createFakeMemory();
  const manager = createComputerUseManager({ memory });

  const plan = manager.createPlan({
    title: "Download statement",
    steps: ["open browser", "download file"],
    requiresApproval: true,
  });

  assert.equal(plan.title, "Download statement");
  assert.equal(plan.status, "approval_required");
  const plans = manager.listPlans({ limit: 5 });
  assert.ok(plans.some((entry) => entry.planId === plan.planId));
});

test("approves plan and runs it", async () => {
  const memory = createFakeMemory();
  const manager = createComputerUseManager({ memory });

  const plan = manager.createPlan({
    title: "Open site",
    steps: ["navigate"],
    requiresApproval: true,
  });

  manager.requireApproval(plan.planId, "Need consent");
  const approved = manager.approvePlan(plan.planId);
  assert.equal(approved.status, "ready");

  const executed = await manager.runPlan({ planId: plan.planId });
  assert.equal(executed.status, "completed");
  assert.ok(executed.executionCount > 0);
});

test("runs browser-backed action plans and records execution details", async () => {
  const memory = createFakeMemory();
  const manager = createComputerUseManager({
    memory,
    browserAutomation: {
      async runPlan() {
        return {
          browser: "chrome",
          status: "completed",
          failure: null,
          debugPort: 9444,
          userDataDir: "/tmp/jasper-browser-profile",
          downloadDir: "/tmp/jasper-browser-downloads",
          finalSnapshot: {
            url: "https://example.com/thanks",
            title: "Thanks",
          },
          actions: [
            {
              index: 0,
              description: "Open https://example.com/newsletter",
              status: "completed",
              result: {
                url: "https://example.com/newsletter",
              },
            },
            {
              index: 1,
              description: "Fill label:Email",
              status: "completed",
              result: {
                value: "news@thegoodproject.net",
              },
            },
          ],
        };
      },
    },
  });

  const plan = manager.createPlan({
    title: "Subscribe to newsletter",
    context: {
      kind: "browser",
      browser: "chrome",
      actions: [
        {
          type: "open",
          url: "https://example.com/newsletter",
        },
        {
          type: "fill",
          label: "Email",
          value: "news@thegoodproject.net",
        },
      ],
    },
    requiresApproval: true,
  });

  assert.deepEqual(
    plan.steps.map((step) => step.description),
    ["Open https://example.com/newsletter", "Fill label:Email"],
  );

  manager.approvePlan(plan.planId);
  const executed = await manager.runPlan({
    planId: plan.planId,
  });

  assert.equal(executed.status, "completed");
  assert.equal(executed.execution.executor, "browser");
  assert.equal(executed.execution.finalSnapshot.title, "Thanks");
  assert.equal(executed.stepEvents.length, 2);
});
