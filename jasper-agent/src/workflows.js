import { createEventStore } from "../../jasper-memory/src/event-store.js";
import { getJasperAppStatus } from "./apps.js";

const DEFAULT_WORKFLOW_LIBRARY = [
  {
    id: "daily-plan",
    name: "Daily Planning",
    description:
      "Review the calendar, decide priorities, and capture the plan for the day.",
    steps: [
      {
        id: "calendar-review",
        description: "Summarize tomorrow's calendar across connectors.",
        connector: "calendar",
        requiresApproval: true,
      },
      {
        id: "prioritize-tasks",
        description: "Pick the top three priorities and capture them for follow-up.",
      },
    ],
  },
  {
    id: "inbox-triage",
    name: "Inbox Triage",
    description: "Review unread email, triage touch points, and schedule responses.",
    steps: [
      {
        id: "email-review",
        description: "Collect unread high-priority email summaries.",
        connector: "email",
        requiresApproval: true,
      },
      {
        id: "triage-plan",
        description: "Generate follow-up commitments and mark quiet-hours actions.",
      },
    ],
  },
];

function normalizeId(value) {
  return String(value || "").trim().toLowerCase();
}

function describeStep(step) {
  return `${step.description || step.id}`;
}

function defaultEventStore(options = {}) {
  return createEventStore({
    root: options.memoryRoot,
    jasperHome: options.jasperHome,
    source: "jasper-workflow",
  });
}

function defaultFetchAppStatus(options = {}) {
  return getJasperAppStatus({
    jasperHome: options.jasperHome,
    acquisitionStore: options.acquisitionStore,
    connectorStore: options.connectorStore,
  });
}

export function createWorkflowManager(options = {}) {
  const memory = options.memory || defaultEventStore(options);
  const workflows = Array.isArray(options.workflows)
    ? options.workflows
    : DEFAULT_WORKFLOW_LIBRARY;
  const fetchAppStatus =
    options.fetchAppStatus ||
    ((extra = {}) =>
      defaultFetchAppStatus({
        jasperHome: options.jasperHome,
        acquisitionStore: options.acquisitionStore,
        connectorStore: options.connectorStore,
        ...extra,
      }));

  return {
    listWorkflows() {
      return workflows.map((workflow) => ({
        id: workflow.id,
        name: workflow.name,
        description: workflow.description,
        stepCount: workflow.steps.length,
      }));
    },

    async runWorkflow(runOptions = {}) {
      const workflowId = normalizeId(runOptions.workflowId);
      const workflow = workflows.find((entry) => entry.id === workflowId);
      if (!workflow) {
        throw new Error(`Unknown workflow: ${runOptions.workflowId}`);
      }

      const stage = String(runOptions.stage || "manual").trim();
      const autoApprove = Boolean(runOptions.autoApprove);
      const appStatus = await Promise.resolve(
        fetchAppStatus(runOptions.appStatusOptions || {}),
      );
      const connectors = Array.isArray(appStatus?.connectors)
        ? appStatus.connectors
        : [];

      const steps = [];
      let overallStatus = "completed";

      for (const step of workflow.steps) {
        const connector =
          step.connector &&
          connectors.find((candidate) => normalizeId(candidate.id) === normalizeId(step.connector));
        if (step.connector && (!connector || connector.status !== "ready")) {
          steps.push({
            stepId: step.id,
            status: "blocked_connector",
            detail: describeStep(step),
            connector: step.connector,
          });
          overallStatus = "blocked_connector";
          break;
        }

        const approvalRequired = step.requiresApproval && !autoApprove;
        const stepStatus = approvalRequired
          ? "approval_required"
          : "completed";

        steps.push({
          stepId: step.id,
          status: stepStatus,
          detail: describeStep(step),
          connector: step.connector || null,
        });

        if (approvalRequired) {
          overallStatus = "awaiting_approval";
          break;
        }
      }

      const executionEvent = memory.appendEvent({
        type: "workflow.execution",
        source: "jasper-workflow",
        tags: ["workflow", "execution"],
        payload: {
          workflowId: workflow.id,
          workflowName: workflow.name,
          stage,
          status: overallStatus,
          steps,
        },
      });

      return {
        workflowId: workflow.id,
        workflowName: workflow.name,
        stage,
        status: overallStatus,
        steps,
        executionEventId: executionEvent.id,
      };
    },
  };
}

export const WORKFLOW_LIBRARY = DEFAULT_WORKFLOW_LIBRARY;
