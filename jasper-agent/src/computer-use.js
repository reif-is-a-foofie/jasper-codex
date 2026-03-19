import { randomUUID } from "node:crypto";
import { createEventStore } from "../../jasper-memory/src/event-store.js";
import {
  browserPlanSteps,
  createBrowserAutomation,
  isBrowserPlanContext,
} from "./browser.js";

const PLAN_EVENT_TYPE = "computer-use.plan";
const STEP_EVENT_TYPE = "computer-use.step";
const APPROVAL_EVENT_TYPE = "computer-use.approval";
const EXECUTION_EVENT_TYPE = "computer-use.execution";

function defaultEventStore(options = {}) {
  return createEventStore({
    root: options.memoryRoot,
    jasperHome: options.jasperHome,
    source: "jasper-computer-use",
  });
}

function normalizeLimit(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.floor(parsed);
}

function mapPlan(event, relatedEvents) {
  if (!event) {
    return null;
  }

  const payload = event.payload || {};
  const steps = (payload.steps || []).map((step) => ({
    stepId: step.stepId,
    description: step.description,
    requiresApproval: Boolean(step.requiresApproval),
    status: "pending",
    updatedAt: null,
  }));

  let approvedAt = null;
  const approvalEvents = relatedEvents.filter(
    (entry) =>
      entry.type === APPROVAL_EVENT_TYPE &&
      entry.payload?.planId === payload.planId,
  );
  if (approvalEvents.length > 0) {
    approvedAt = approvalEvents[approvalEvents.length - 1].ts;
  }

  const executionEvents = relatedEvents.filter(
    (entry) =>
      entry.type === EXECUTION_EVENT_TYPE &&
      entry.payload?.planId === payload.planId,
  );

  const stepEvents = relatedEvents.filter(
    (entry) =>
      entry.type === STEP_EVENT_TYPE &&
      entry.payload?.planId === payload.planId,
  );

  for (const entry of stepEvents) {
    const match = steps.find((step) => step.stepId === entry.payload.stepId);
    if (match) {
      match.status = entry.payload.status || match.status;
      match.updatedAt = entry.ts;
    }
  }

  let status = "open";
  if (payload.requiresApproval && !approvedAt) {
    status = "approval_required";
  } else if (executionEvents.length === 0) {
    status = status === "approval_required" ? status : "ready";
  } else {
    status =
      executionEvents[executionEvents.length - 1].payload?.status ||
      "completed";
  }

  return {
    planId: payload.planId,
    title: payload.title,
    description: payload.description,
    context: payload.context,
    requiresApproval: Boolean(payload.requiresApproval),
    status,
    createdAt: event.ts,
    approvedAt,
    steps,
    executionCount: executionEvents.length,
    lastExecutionAt:
      executionEvents.length > 0
        ? executionEvents[executionEvents.length - 1].ts
        : null,
    lastExecution:
      executionEvents.length > 0
        ? executionEvents[executionEvents.length - 1].payload
        : null,
    stepEvents,
  };
}

export function createComputerUseManager(options = {}) {
  const memory = options.memory || defaultEventStore(options);
  const browserAutomation =
    options.browserAutomation ||
    createBrowserAutomation({
      browserPath: options.browserPath,
    });

  function buildPlanEvent(input = {}) {
    const inferredSteps =
      (!Array.isArray(input.steps) || input.steps.length === 0) &&
      isBrowserPlanContext(input.context)
        ? browserPlanSteps(input.context)
        : input.steps || [];
    const steps = inferredSteps.map((entry, index) => {
      if (entry && typeof entry === "object" && !Array.isArray(entry)) {
        return {
          stepId: entry.stepId || entry.id || `step_${index + 1}`,
          description: entry.description || entry.title || `Step ${index + 1}`,
          requiresApproval: entry.requiresApproval ?? false,
        };
      }

      return {
        stepId: `step_${index + 1}`,
        description: String(entry || `Step ${index + 1}`).trim(),
        requiresApproval: false,
      };
    });
    const planId = input.planId || `plan_${randomUUID()}`;
    return memory.appendEvent({
      type: PLAN_EVENT_TYPE,
      source: input.source || "jasper-computer-use",
      tags: ["computer-use", "plan"],
      payload: {
        planId,
        title: String(input.title || "computer action plan").trim(),
        description: input.description || "",
        context: input.context || {},
        requiresApproval: Boolean(input.requiresApproval),
        steps,
      },
    });
  }

  function listPlans(listOptions = {}) {
    const limit = normalizeLimit(listOptions.limit, 20);
    const events = memory
      .listRecentEvents({ limit: Math.max(200, limit) })
      .filter((event) => event.type === PLAN_EVENT_TYPE);
    return events.map((event) =>
      mapPlan(event, memory.listRecentEvents({ limit: 200 })),
    );
  }

  function getPlan(planId) {
    const limit = 200;
    const events = memory
      .listRecentEvents({ limit })
      .filter(
        (event) =>
          event.payload?.planId === planId || event.payload?.planId === planId,
      );
    const planEvent = events.find((event) => event.type === PLAN_EVENT_TYPE);
    if (!planEvent) {
      return null;
    }
    return mapPlan(planEvent, events);
  }

  function requireApproval(planId, note) {
    memory.appendEvent({
      type: APPROVAL_EVENT_TYPE,
      source: "jasper-computer-use",
      tags: ["computer-use", "approval"],
      payload: {
        planId,
        approved: false,
        note: note || null,
      },
    });
    return getPlan(planId);
  }

  function approvePlan(planId, note) {
    const plan = getPlan(planId);
    if (!plan) {
      throw new Error(`Unknown plan: ${planId}`);
    }
    memory.appendEvent({
      type: APPROVAL_EVENT_TYPE,
      source: "jasper-computer-use",
      tags: ["computer-use", "approval"],
      payload: {
        planId,
        approved: true,
        note: note || null,
      },
    });
    return getPlan(planId);
  }

  function runRecordedPlan(runOptions = {}) {
    const plan = getPlan(runOptions.planId);
    if (!plan) {
      throw new Error(`Unknown plan: ${runOptions.planId}`);
    }
    if (plan.requiresApproval && !plan.approvedAt) {
      return {
        status: "approval_required",
        planId: plan.planId,
        steps: plan.steps,
      };
    }
    const stepEvents = [];
    for (const step of plan.steps) {
      const stepEvent = memory.appendEvent({
        type: STEP_EVENT_TYPE,
        source: "jasper-computer-use",
        tags: ["computer-use", "step"],
        payload: {
          planId: plan.planId,
          stepId: step.stepId,
          description: step.description,
          status: "completed",
        },
      });
      stepEvents.push(stepEvent);
    }

    memory.appendEvent({
      type: EXECUTION_EVENT_TYPE,
      source: "jasper-computer-use",
      tags: ["computer-use", "execution"],
      payload: {
        planId: plan.planId,
        stage: runOptions.stage || "manual",
        status: "completed",
        steps: stepEvents.map((event) => ({
          stepId: event.payload.stepId,
          status: event.payload.status,
        })),
      },
    });

    return {
      ...getPlan(plan.planId),
      execution: {
        executor: "manual",
        status: "completed",
        steps: stepEvents.map((event) => ({
          stepId: event.payload.stepId,
          status: event.payload.status,
        })),
      },
    };
  }

  function listPendingApprovals(listOptions = {}) {
    const limit = normalizeLimit(listOptions.limit, 20);
    return listPlans({ limit }).filter(
      (plan) => plan.status === "approval_required",
    );
  }

  return {
    createPlan(planOptions = {}) {
      const planEvent = buildPlanEvent(planOptions);
      return mapPlan(planEvent, [planEvent]);
    },
    listPlans,
    getPlan,
    requireApproval,
    approvePlan,
    async runPlan(runOptions = {}) {
      const plan = getPlan(runOptions.planId);
      if (!plan) {
        throw new Error(`Unknown plan: ${runOptions.planId}`);
      }
      if (plan.requiresApproval && !plan.approvedAt) {
        return {
          status: "approval_required",
          planId: plan.planId,
          steps: plan.steps,
        };
      }

      if (isBrowserPlanContext(plan.context)) {
        const browserRun = await browserAutomation.runPlan({
          ...plan.context,
          ...(runOptions.browserOverrides || {}),
        });

        const browserStepEvents = [];
        for (const action of browserRun.actions || []) {
          const stepEvent = memory.appendEvent({
            type: STEP_EVENT_TYPE,
            source: "jasper-computer-use",
            tags: ["computer-use", "step", "browser"],
            payload: {
              planId: plan.planId,
              stepId:
                plan.steps[action.index]?.stepId || `step_${action.index + 1}`,
              description: action.description,
              status: action.status,
              browser: browserRun.browser,
              result: action.result || null,
              error: action.error || null,
            },
          });
          browserStepEvents.push(stepEvent);
        }

        const executionEvent = memory.appendEvent({
          type: EXECUTION_EVENT_TYPE,
          source: "jasper-computer-use",
          tags: ["computer-use", "execution", "browser"],
          payload: {
            planId: plan.planId,
            stage: runOptions.stage || "manual",
            executor: "browser",
            browser: browserRun.browser,
            status: browserRun.status,
            failure: browserRun.failure,
            debugPort: browserRun.debugPort,
            userDataDir: browserRun.userDataDir,
            downloadDir: browserRun.downloadDir,
            finalSnapshot: browserRun.finalSnapshot,
            steps: browserStepEvents.map((event) => ({
              stepId: event.payload.stepId,
              status: event.payload.status,
            })),
          },
        });

        return {
          ...getPlan(plan.planId),
          execution: {
            ...executionEvent.payload,
            eventId: executionEvent.id,
            actions: browserRun.actions,
          },
        };
      }

      return runRecordedPlan(runOptions);
    },
    listPendingApprovals,
  };
}
