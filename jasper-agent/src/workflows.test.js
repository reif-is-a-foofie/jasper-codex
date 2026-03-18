import test from "node:test";
import assert from "node:assert/strict";
import { createWorkflowManager, WORKFLOW_LIBRARY } from "./workflows.js";

function createFakeMemory() {
  const events = [];
  return {
    appendEvent(event) {
      const stored = { ...event, id: `evt_${events.length + 1}` };
      events.push(stored);
      return stored;
    },
    readEvents() {
      return events;
    },
  };
}

test("workflow list returns known routines", () => {
  const manager = createWorkflowManager({
    memory: createFakeMemory(),
  });
  const list = manager.listWorkflows();
  assert.ok(list.length >= WORKFLOW_LIBRARY.length);
  assert.ok(list.some((workflow) => workflow.id === "daily-plan"));
});

test("running workflows records steps and approvals", async () => {
  const memory = createFakeMemory();
  const manager = createWorkflowManager({
    memory,
    fetchAppStatus: () => ({
      connectors: [
        {
          id: "calendar",
          status: "ready",
          label: "Calendar",
          needsAttention: false,
        },
        {
          id: "email",
          status: "ready",
          label: "Email",
          needsAttention: false,
        },
      ],
      warnings: [],
      nextSteps: [],
    }),
  });

  const result = await manager.runWorkflow({
    workflowId: "daily-plan",
    autoApprove: true,
  });

  assert.equal(result.status, "completed");
  assert.strictEqual(result.steps.length, 2);
  assert.ok(result.steps.every((step) => step.status === "completed"));
  assert.ok(memory.readEvents().some((event) => event.type === "workflow.execution"));
});

test("workflow pauses when connector needs approval", async () => {
  const memory = createFakeMemory();
  const manager = createWorkflowManager({
    memory,
    fetchAppStatus: () => ({
      connectors: [
        {
          id: "calendar",
          status: "ready",
          label: "Calendar",
          needsAttention: false,
        },
      ],
      warnings: [],
      nextSteps: [],
    }),
  });

  const result = await manager.runWorkflow({
    workflowId: "daily-plan",
    autoApprove: false,
  });

  const approvalStep = result.steps.find(
    (step) => step.stepId === "calendar-review",
  );
  assert.equal(result.status, "awaiting_approval");
  assert.ok(approvalStep);
  assert.equal(approvalStep.status, "approval_required");
});
