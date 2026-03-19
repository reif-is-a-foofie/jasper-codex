import { loadIdentityConfig } from "../../jasper-core/src/identity.js";
import { getJasperSetupStatus } from "../../jasper-core/src/setup.js";
import { createEventStore } from "../../jasper-memory/src/event-store.js";
import {
  listGeneratorTemplates,
  loadGeneratedRegistry,
} from "../../jasper-tools/src/generator.js";
import { createToolRegistry } from "../../jasper-tools/src/registry.js";
import { getJasperAppStatus, mergeDoctorStatus } from "./apps.js";
import { createCapabilityBroker } from "./broker/index.js";
import { createCommsManager } from "./comms.js";
import { createComputerUseManager } from "./computer-use.js";
import { GuardScenarios, createGuardManager } from "./guard.js";
import { createStrategicMemoryManager } from "./strategic-memory.js";
import { createWorkflowManager } from "./workflows.js";

const SAMPLE_REQUESTS = {
  identity: "who are you",
  memory: "show recent memory",
  calendar: "check my calendar tomorrow",
  email: "check my email",
  filesystem: "search my files for project notes",
  web: "look up the latest weather in Chicago",
};

const MANUAL_AUDIT_GAPS = [
  "Cross-session continuity still needs a real multi-session operator run, not just stored logs.",
  "Failure injection was not performed automatically in baseline mode.",
  "Trust-boundary penetration testing still needs an operator-driven audit.",
  "Self-upgrade was inspected through capability paths, not executed end-to-end.",
];

function uniqueNonEmpty(values) {
  return [
    ...new Set(
      values.map((value) => String(value || "").trim()).filter(Boolean),
    ),
  ];
}

function parseTimestamp(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function spanHours(timestamps) {
  const parsed = timestamps.map(parseTimestamp).filter(Number.isFinite);
  if (parsed.length < 2) {
    return 0;
  }
  const earliest = Math.min(...parsed);
  const latest = Math.max(...parsed);
  return Number(((latest - earliest) / (1000 * 60 * 60)).toFixed(2));
}

function countEvents(events, predicate) {
  return events.filter(predicate).length;
}

function summarizeToolExercise(result) {
  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
    };
  }

  const output = result.output;
  return {
    ok: true,
    outputCount: Array.isArray(output) ? output.length : null,
    outputKeys:
      output && typeof output === "object" && !Array.isArray(output)
        ? Object.keys(output)
        : [],
  };
}

async function runToolExercise(toolRegistry, toolId, input = {}) {
  try {
    const result = await toolRegistry.runTool(toolId, input);
    return {
      ok: true,
      output: result.output,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function samplePlanSummary(plan) {
  const provider = plan?.internalPlan?.primaryProvider || null;
  const tooling = plan?.publicPlan?.tooling || {};
  return {
    acknowledgement: plan?.acknowledgement || null,
    summary: plan?.publicPlan?.summary || null,
    primaryCapabilityId: plan?.internalPlan?.primaryCapabilityId || null,
    providerStatus: provider?.status || null,
    providerId: provider?.providerId || null,
    connectorId: provider?.connectorId || null,
    toolId: provider?.toolId || null,
    consentRequired: Boolean(plan?.publicPlan?.consentRequired),
    activationRequired: Boolean(plan?.publicPlan?.activationRequired),
    autoProvision: Boolean(plan?.publicPlan?.autoProvision),
    toolingStrategy: tooling.strategy || null,
    quarantineRequired: Boolean(tooling.quarantineRequired),
    buildRecommended: Boolean(tooling.buildRecommended),
    activeAgentCount: Array.isArray(plan?.internalPlan?.activeAgents)
      ? plan.internalPlan.activeAgents.length
      : 0,
  };
}

function scoreBand(score) {
  if (score <= 19) {
    return "imitation_only";
  }
  if (score <= 39) {
    return "useful_assistant";
  }
  if (score <= 59) {
    return "agentic_system_with_real_seams";
  }
  if (score <= 79) {
    return "persistent_operator_grade_candidate";
  }
  if (score <= 89) {
    return "rare_and_exceptional";
  }
  if (score <= 98) {
    return "world_class_contender";
  }
  if (score === 99) {
    return "jarvis_class";
  }
  return "effectively_unattainable";
}

function makeCategory(id, label, score, evidence) {
  return {
    id,
    label,
    score,
    maxScore: 5,
    evidence,
  };
}

function makeRegion(id, label, categories) {
  return {
    id,
    label,
    score: categories.reduce((total, category) => total + category.score, 0),
    maxScore: 20,
    categories,
  };
}

export async function collectBrainInABoxEvidence(options = {}) {
  let identity = null;
  try {
    identity =
      options.identity ||
      loadIdentityConfig({ identityPath: options.identityPath });
  } catch {
    identity = null;
  }

  const validateAuth =
    options.validateAuth ??
    Boolean(
      process.env.JASPER_SETUP_CODEX_COMMAND || process.env.JASPER_CODEX_BIN,
    );
  const setupStatus =
    options.setupStatus ||
    (await getJasperSetupStatus({
      jasperHome: options.jasperHome,
      validateAuth,
    }));
  const appStatus =
    options.appStatus || getJasperAppStatus({ jasperHome: options.jasperHome });
  const doctorStatus =
    options.doctorStatus || mergeDoctorStatus(setupStatus, appStatus);
  const memory =
    options.memory ||
    createEventStore({
      root: options.memoryRoot,
      jasperHome: options.jasperHome,
      source: "jasper-brain-audit",
    });
  const allEvents =
    typeof memory.readEvents === "function" ? memory.readEvents() : [];
  const recentEvents = memory.listRecentEvents({
    limit: options.eventLimit ?? 10,
  });
  const toolRegistry =
    options.toolRegistry ||
    createToolRegistry({
      identityPath: options.identityPath,
      memoryRoot: options.memoryRoot,
      jasperHome: options.jasperHome,
      toolsRoot: options.toolsRoot,
    });
  const broker =
    options.broker ||
    createCapabilityBroker({
      identityPath: options.identityPath,
      memoryRoot: options.memoryRoot,
      jasperHome: options.jasperHome,
      toolsRoot: options.toolsRoot,
    });
  const workflows =
    options.workflowManager ||
    createWorkflowManager({
      memory,
      jasperHome: options.jasperHome,
    });
  const strategic =
    options.strategicManager ||
    createStrategicMemoryManager({
      memory,
      jasperHome: options.jasperHome,
    });
  const guard =
    options.guardManager ||
    createGuardManager({
      memory,
      jasperHome: options.jasperHome,
    });
  const computerUse =
    options.computerUseManager ||
    createComputerUseManager({
      memory,
      jasperHome: options.jasperHome,
    });
  const comms =
    options.commsManager ||
    createCommsManager({
      memory,
      jasperHome: options.jasperHome,
    });

  const toolExercises = {
    identitySummary: summarizeToolExercise(
      await runToolExercise(toolRegistry, "identity-summary"),
    ),
    appsStatus: summarizeToolExercise(
      await runToolExercise(toolRegistry, "apps-status"),
    ),
    recentMemory: summarizeToolExercise(
      await runToolExercise(toolRegistry, "recent-memory", { limit: 3 }),
    ),
    semanticMemory: summarizeToolExercise(
      await runToolExercise(toolRegistry, "semantic-memory-search", {
        query: "Jasper mission memory",
        limit: 3,
      }),
    ),
  };

  const samplePlans = Object.fromEntries(
    Object.entries(SAMPLE_REQUESTS).map(([key, query]) => [
      key,
      samplePlanSummary(broker.inspectRequest(query)),
    ]),
  );

  const workflowList = workflows.listWorkflows();
  const strategicEvents = strategic.listStrategicEvents({ limit: 20 });
  const commitmentAudit = strategic.auditCommitments({ limit: 80 });
  const actionPlans = computerUse.listPlans({ limit: 20 });
  const commsBrief = comms.generateBrief({ limit: 10, summaryCount: 3 });
  const anomalies = guard.listAnomalies({ limit: 20 });
  const generatedTools = loadGeneratedRegistry(options.toolsRoot);
  const generatorTemplates = listGeneratorTemplates();

  return {
    collectedAt: new Date().toISOString(),
    mode: "automated_baseline",
    limitations: MANUAL_AUDIT_GAPS,
    identity: {
      exists: Boolean(identity),
      name: identity?.config?.identity?.name || null,
      owner: identity?.config?.identity?.owner || null,
      role: identity?.config?.identity?.role || null,
      missionCount: Array.isArray(identity?.config?.mission)
        ? identity.config.mission.length
        : 0,
      manifestoExists: Boolean(doctorStatus?.manifestoExists),
    },
    doctor: {
      status: doctorStatus?.status || "unknown",
      warnings: Array.isArray(doctorStatus?.warnings)
        ? doctorStatus.warnings
        : [],
      nextSteps: Array.isArray(doctorStatus?.nextSteps)
        ? doctorStatus.nextSteps
        : [],
      identityExists: Boolean(doctorStatus?.identityExists),
      runtimeConfigExists: Boolean(doctorStatus?.runtimeConfigExists),
      codexReady: doctorStatus?.codex?.status === "ready",
      authReady: doctorStatus?.onboarding?.openaiAuth?.status === "ready",
      qdrantConfigured: doctorStatus?.qdrant?.configured === true,
      qdrantStatus: doctorStatus?.qdrant?.status || "unknown",
      appsStatus: doctorStatus?.apps?.status || appStatus?.status || "unknown",
    },
    apps: {
      status: appStatus?.status || "unknown",
      connectorCount: Array.isArray(appStatus?.connectors)
        ? appStatus.connectors.length
        : 0,
      readyConnectorCount: Array.isArray(appStatus?.connectors)
        ? appStatus.connectors.filter(
            (connector) => connector.status === "ready",
          ).length
        : 0,
      pendingAttentionCount: Array.isArray(appStatus?.connectors)
        ? appStatus.connectors.filter((connector) => connector.needsAttention)
            .length
        : 0,
      warnings: Array.isArray(appStatus?.warnings) ? appStatus.warnings : [],
      nextSteps: Array.isArray(appStatus?.nextSteps) ? appStatus.nextSteps : [],
    },
    memory: {
      eventCount: allEvents.length,
      recentEventCount: recentEvents.length,
      distinctSessionCount: uniqueNonEmpty(
        allEvents.map((event) => event.session?.id),
      ).length,
      sourceCount: uniqueNonEmpty(allEvents.map((event) => event.source))
        .length,
      typeCount: uniqueNonEmpty(allEvents.map((event) => event.type)).length,
      spanHours: spanHours(allEvents.map((event) => event.ts)),
      conversationTurnCount: countEvents(
        allEvents,
        (event) => event.type === "conversation.turn.completed",
      ),
      execCommandCount: countEvents(
        allEvents,
        (event) => event.type === "exec.command.completed",
      ),
      listenerEventCount: countEvents(allEvents, (event) =>
        String(event.type || "").startsWith("listener."),
      ),
      strategicEventCount: strategicEvents.length,
      commitmentCount: commitmentAudit.totalCommitments,
      contradictionCount: commitmentAudit.contradictions.length,
    },
    tools: {
      count: toolRegistry.listTools().length,
      ids: toolRegistry.listTools().map((tool) => tool.id),
      exercises: toolExercises,
      successfulExerciseCount: Object.values(toolExercises).filter(
        (exercise) => exercise.ok,
      ).length,
    },
    broker: {
      capabilityCount: broker.listCapabilities().length,
      samplePlans,
    },
    workflows: {
      count: workflowList.length,
      ids: workflowList.map((workflow) => workflow.id),
      recentExecutionCount: countEvents(
        allEvents,
        (event) => event.type === "workflow.execution",
      ),
    },
    guard: {
      scenarioCount: GuardScenarios.length,
      anomalyCount: anomalies.length,
    },
    action: {
      planCount: actionPlans.length,
      pendingApprovalCount: actionPlans.filter(
        (plan) => plan.status === "approval_required",
      ).length,
      completedCount: actionPlans.filter((plan) => plan.status === "completed")
        .length,
    },
    comms: {
      threadCount: commsBrief.totalThreads,
      urgentCount: commsBrief.urgent,
      followUpCount: Array.isArray(commsBrief.followUps)
        ? commsBrief.followUps.length
        : 0,
    },
    growth: {
      templateCount: generatorTemplates.length,
      generatedToolCount: generatedTools.length,
      hasImprovementPath:
        generatorTemplates.length > 0 &&
        Boolean(
          samplePlans.filesystem.toolingStrategy ||
            samplePlans.filesystem.autoProvision ||
            samplePlans.filesystem.buildRecommended,
        ),
    },
  };
}

export function scoreBrainInABoxEvidence(evidence) {
  const selfModel = makeRegion("self_model", "Self Model", [
    makeCategory(
      "identity_continuity",
      "Identity Continuity",
      !evidence.identity.exists
        ? 0
        : evidence.memory.distinctSessionCount >= 3 &&
            evidence.tools.exercises.identitySummary.ok &&
            evidence.identity.manifestoExists
          ? 5
          : evidence.memory.distinctSessionCount >= 2 &&
              evidence.tools.exercises.identitySummary.ok
            ? 4
            : evidence.tools.exercises.identitySummary.ok
              ? 3
              : evidence.identity.name &&
                  evidence.identity.owner &&
                  evidence.identity.role
                ? 2
                : 1,
      [
        `identity loaded: ${evidence.identity.exists}`,
        `distinct sessions: ${evidence.memory.distinctSessionCount}`,
        `identity tool runnable: ${evidence.tools.exercises.identitySummary.ok}`,
      ],
    ),
    makeCategory(
      "mission_values_orientation",
      "Mission And Values Orientation",
      evidence.identity.missionCount >= 3 && evidence.memory.commitmentCount > 0
        ? 4
        : evidence.identity.missionCount >= 3 &&
            evidence.tools.exercises.identitySummary.ok
          ? 3
          : evidence.identity.missionCount > 0
            ? 2
            : 0,
      [
        `mission items: ${evidence.identity.missionCount}`,
        `commitments recorded: ${evidence.memory.commitmentCount}`,
      ],
    ),
    makeCategory(
      "state_awareness",
      "State Awareness",
      evidence.doctor.status === "unknown"
        ? 0
        : evidence.doctor.codexReady &&
            evidence.doctor.authReady &&
            evidence.doctor.appsStatus !== "unknown" &&
            evidence.doctor.qdrantStatus !== "unknown" &&
            (evidence.doctor.warnings.length > 0 ||
              evidence.doctor.nextSteps.length > 0)
          ? 5
          : evidence.doctor.codexReady &&
              evidence.doctor.authReady &&
              evidence.doctor.appsStatus !== "unknown"
            ? 4
            : evidence.doctor.codexReady || evidence.doctor.authReady
              ? 3
              : 2,
      [
        `doctor status: ${evidence.doctor.status}`,
        `codex ready: ${evidence.doctor.codexReady}`,
        `auth ready: ${evidence.doctor.authReady}`,
        `qdrant status: ${evidence.doctor.qdrantStatus}`,
      ],
    ),
    makeCategory(
      "gap_awareness",
      "Gap Awareness",
      evidence.doctor.warnings.length > 0 &&
        evidence.apps.nextSteps.length > 0 &&
        evidence.growth.hasImprovementPath
        ? 5
        : evidence.doctor.warnings.length > 0 &&
            (evidence.broker.samplePlans.calendar.consentRequired ||
              evidence.broker.samplePlans.email.consentRequired)
          ? 4
          : evidence.doctor.warnings.length > 0 ||
              evidence.apps.nextSteps.length > 0
            ? 3
            : evidence.growth.hasImprovementPath
              ? 2
              : 0,
      [
        `doctor warnings: ${evidence.doctor.warnings.length}`,
        `app next steps: ${evidence.apps.nextSteps.length}`,
        `improvement path: ${evidence.growth.hasImprovementPath}`,
      ],
    ),
  ]);

  const perception = makeRegion(
    "perception_attention",
    "Perception & Attention",
    [
      makeCategory(
        "environmental_sensing",
        "Environmental Sensing",
        evidence.memory.eventCount === 0
          ? 0
          : evidence.memory.sourceCount >= 4 && evidence.memory.typeCount >= 6
            ? 4
            : evidence.memory.sourceCount >= 3 && evidence.memory.typeCount >= 4
              ? 3
              : evidence.memory.sourceCount >= 2
                ? 2
                : 1,
        [
          `event count: ${evidence.memory.eventCount}`,
          `source count: ${evidence.memory.sourceCount}`,
          `type count: ${evidence.memory.typeCount}`,
        ],
      ),
      makeCategory(
        "attention_control",
        "Attention Control",
        evidence.workflows.count > 0 &&
          evidence.guard.scenarioCount > 0 &&
          evidence.apps.connectorCount >= 0
          ? 3
          : evidence.workflows.count > 0 || evidence.guard.scenarioCount > 0
            ? 2
            : evidence.memory.eventCount > 0
              ? 1
              : 0,
        [
          `workflow count: ${evidence.workflows.count}`,
          `guard scenarios: ${evidence.guard.scenarioCount}`,
          `urgent comms tracked: ${evidence.comms.urgentCount}`,
        ],
      ),
      makeCategory(
        "change_detection",
        "Change Detection",
        evidence.guard.anomalyCount > 0
          ? 4
          : evidence.guard.scenarioCount > 0 &&
              evidence.doctor.warnings.length > 0
            ? 3
            : evidence.guard.scenarioCount > 0
              ? 2
              : evidence.doctor.warnings.length > 0
                ? 1
                : 0,
        [
          `guard anomalies: ${evidence.guard.anomalyCount}`,
          `doctor warnings: ${evidence.doctor.warnings.length}`,
        ],
      ),
      makeCategory(
        "interruption_judgment",
        "Interruption Judgment",
        evidence.comms.urgentCount > 0 ||
          evidence.action.pendingApprovalCount > 0
          ? 3
          : evidence.guard.scenarioCount > 0 ||
              evidence.apps.pendingAttentionCount > 0
            ? 2
            : evidence.memory.eventCount > 0
              ? 1
              : 0,
        [
          `urgent comms: ${evidence.comms.urgentCount}`,
          `pending approvals: ${evidence.action.pendingApprovalCount}`,
          `connector attention items: ${evidence.apps.pendingAttentionCount}`,
        ],
      ),
    ],
  );

  const memoryWorldModel = makeRegion(
    "memory_world_model",
    "Memory & World Model",
    [
      makeCategory(
        "working_episodic_memory",
        "Working And Episodic Memory",
        evidence.memory.eventCount === 0
          ? 0
          : evidence.memory.distinctSessionCount >= 2 &&
              evidence.memory.eventCount >= 20
            ? 4
            : evidence.memory.distinctSessionCount >= 2 ||
                evidence.memory.eventCount >= 10
              ? 3
              : evidence.memory.eventCount >= 3
                ? 2
                : 1,
        [
          `event count: ${evidence.memory.eventCount}`,
          `distinct sessions: ${evidence.memory.distinctSessionCount}`,
        ],
      ),
      makeCategory(
        "semantic_strategic_memory",
        "Semantic And Strategic Memory",
        evidence.tools.exercises.semanticMemory.ok &&
          evidence.memory.commitmentCount > 0
          ? 3
          : evidence.tools.exercises.semanticMemory.ok
            ? 2
            : evidence.tools.ids.includes("semantic-memory-search")
              ? 1
              : 0,
        [
          `semantic tool runnable: ${evidence.tools.exercises.semanticMemory.ok}`,
          `commitments: ${evidence.memory.commitmentCount}`,
          `strategic events: ${evidence.memory.strategicEventCount}`,
        ],
      ),
      makeCategory(
        "grounding",
        "Grounding",
        evidence.tools.exercises.recentMemory.ok &&
          evidence.tools.exercises.appsStatus.ok &&
          evidence.tools.exercises.semanticMemory.ok
          ? 4
          : evidence.tools.exercises.recentMemory.ok &&
              evidence.tools.exercises.appsStatus.ok
            ? 3
            : evidence.tools.exercises.recentMemory.ok
              ? 2
              : 0,
        [
          `recent-memory runnable: ${evidence.tools.exercises.recentMemory.ok}`,
          `apps-status runnable: ${evidence.tools.exercises.appsStatus.ok}`,
          `semantic-memory runnable: ${evidence.tools.exercises.semanticMemory.ok}`,
        ],
      ),
      makeCategory(
        "world_model_coherence",
        "World Model Coherence",
        evidence.memory.commitmentCount > 0 &&
          evidence.memory.contradictionCount === 0
          ? 3
          : evidence.memory.distinctSessionCount >= 2
            ? 2
            : evidence.memory.eventCount > 0
              ? 1
              : 0,
        [
          `commitments: ${evidence.memory.commitmentCount}`,
          `contradictions: ${evidence.memory.contradictionCount}`,
          `session span hours: ${evidence.memory.spanHours}`,
        ],
      ),
    ],
  );

  const executiveAction = makeRegion("executive_action", "Executive & Action", [
    makeCategory(
      "planning_routing",
      "Planning And Routing",
      evidence.broker.capabilityCount >= 6 &&
        evidence.broker.samplePlans.calendar.consentRequired &&
        evidence.broker.samplePlans.memory.primaryCapabilityId &&
        evidence.broker.samplePlans.web.primaryCapabilityId
        ? 4
        : evidence.broker.capabilityCount >= 4
          ? 3
          : evidence.broker.capabilityCount > 0
            ? 2
            : 0,
      [
        `capability count: ${evidence.broker.capabilityCount}`,
        `calendar consent gate: ${evidence.broker.samplePlans.calendar.consentRequired}`,
        `filesystem strategy: ${evidence.broker.samplePlans.filesystem.toolingStrategy || "none"}`,
      ],
    ),
    makeCategory(
      "tool_workflow_execution",
      "Tool And Workflow Execution",
      evidence.tools.successfulExerciseCount >= 4 &&
        evidence.memory.execCommandCount > 0
        ? 4
        : evidence.tools.successfulExerciseCount >= 3
          ? 3
          : evidence.tools.successfulExerciseCount >= 1
            ? 2
            : evidence.tools.count > 0
              ? 1
              : 0,
      [
        `successful tool exercises: ${evidence.tools.successfulExerciseCount}`,
        `historical exec commands: ${evidence.memory.execCommandCount}`,
        `workflow executions: ${evidence.workflows.recentExecutionCount}`,
      ],
    ),
    makeCategory(
      "delegation_composition",
      "Delegation And Composition",
      evidence.broker.samplePlans.filesystem.activeAgentCount >= 4 &&
        evidence.workflows.count >= 2
        ? 4
        : evidence.broker.samplePlans.filesystem.activeAgentCount >= 3 &&
            evidence.workflows.count >= 1
          ? 3
          : evidence.workflows.count > 0
            ? 2
            : 0,
      [
        `filesystem active agents: ${evidence.broker.samplePlans.filesystem.activeAgentCount}`,
        `workflow count: ${evidence.workflows.count}`,
      ],
    ),
    makeCategory(
      "outcome_orientation",
      "Outcome Orientation",
      evidence.workflows.recentExecutionCount > 0 &&
        (evidence.action.completedCount > 0 ||
          evidence.memory.execCommandCount > 0)
        ? 4
        : evidence.memory.execCommandCount > 0 || evidence.action.planCount > 0
          ? 3
          : evidence.workflows.count > 0
            ? 2
            : 0,
      [
        `workflow executions: ${evidence.workflows.recentExecutionCount}`,
        `action plans: ${evidence.action.planCount}`,
        `completed action plans: ${evidence.action.completedCount}`,
      ],
    ),
  ]);

  const regulationGrowth = makeRegion(
    "regulation_growth",
    "Regulation & Growth",
    [
      makeCategory(
        "trust_permission_boundaries",
        "Trust And Permission Boundaries",
        (evidence.broker.samplePlans.calendar.consentRequired ||
          evidence.broker.samplePlans.calendar.activationRequired ||
          evidence.apps.connectorCount > 0) &&
          (evidence.broker.samplePlans.email.consentRequired ||
            evidence.broker.samplePlans.email.activationRequired ||
            evidence.apps.connectorCount > 0)
          ? 4
          : evidence.broker.samplePlans.calendar.consentRequired ||
              evidence.broker.samplePlans.email.consentRequired ||
              evidence.broker.samplePlans.calendar.activationRequired ||
              evidence.broker.samplePlans.email.activationRequired
            ? 3
            : evidence.apps.status !== "unknown"
              ? 2
              : 0,
        [
          `calendar consent gate: ${evidence.broker.samplePlans.calendar.consentRequired}`,
          `email consent gate: ${evidence.broker.samplePlans.email.consentRequired}`,
          `apps status: ${evidence.apps.status}`,
        ],
      ),
      makeCategory(
        "self_evaluation",
        "Self-Evaluation",
        evidence.doctor.status !== "unknown" &&
          evidence.memory.contradictionCount >= 0 &&
          evidence.tools.successfulExerciseCount >= 3
          ? 3
          : evidence.doctor.status !== "unknown"
            ? 2
            : 0,
        [
          `doctor status: ${evidence.doctor.status}`,
          `strategic contradictions checked: ${evidence.memory.contradictionCount}`,
          `successful tool exercises: ${evidence.tools.successfulExerciseCount}`,
        ],
      ),
      makeCategory(
        "self_healing",
        "Self-Healing",
        evidence.doctor.warnings.length > 0 &&
          evidence.doctor.nextSteps.length > 0
          ? 2
          : evidence.doctor.warnings.length > 0
            ? 1
            : 0,
        [
          `doctor warnings: ${evidence.doctor.warnings.length}`,
          `doctor next steps: ${evidence.doctor.nextSteps.length}`,
        ],
      ),
      makeCategory(
        "self_building_upgrade",
        "Self-Building And Self-Upgrade",
        evidence.growth.hasImprovementPath && evidence.growth.templateCount >= 2
          ? 3
          : evidence.growth.templateCount > 0
            ? 2
            : 0,
        [
          `generator templates: ${evidence.growth.templateCount}`,
          `generated tools: ${evidence.growth.generatedToolCount}`,
          `improvement path: ${evidence.growth.hasImprovementPath}`,
        ],
      ),
    ],
  );

  const regions = [
    selfModel,
    perception,
    memoryWorldModel,
    executiveAction,
    regulationGrowth,
  ];
  const rawScore = regions.reduce((total, region) => total + region.score, 0);

  const ceilings = [];
  const hasCrossSessionContinuity =
    evidence.identity.exists &&
    evidence.tools.exercises.recentMemory.ok &&
    evidence.memory.distinctSessionCount >= 2;
  if (!hasCrossSessionContinuity) {
    ceilings.push({
      maxScore: 39,
      reason:
        "identity and memory continuity have not been demonstrated across multiple sessions",
    });
  }

  const canTakeRealAction =
    evidence.tools.successfulExerciseCount >= 3 &&
    (evidence.memory.execCommandCount > 0 ||
      evidence.workflows.recentExecutionCount > 0 ||
      evidence.action.completedCount > 0);
  if (!canTakeRealAction) {
    ceilings.push({
      maxScore: 49,
      reason: "reliable real action is not yet demonstrated",
    });
  }

  const canExplainCurrentState =
    evidence.doctor.status !== "unknown" &&
    (evidence.doctor.warnings.length > 0 ||
      evidence.doctor.nextSteps.length > 0);
  if (!canExplainCurrentState) {
    ceilings.push({
      maxScore: 59,
      reason: "current state, blockers, and next steps are not legible enough",
    });
  }

  const canDetectFailures =
    evidence.doctor.warnings.length > 0 || evidence.guard.anomalyCount > 0;
  if (!canDetectFailures) {
    ceilings.push({
      maxScore: 69,
      reason:
        "the system is not yet showing enough self-detection of failures or degradation",
    });
  }

  const hasTrustBoundaries =
    evidence.broker.samplePlans.calendar.consentRequired ||
    evidence.broker.samplePlans.email.consentRequired ||
    evidence.broker.samplePlans.calendar.activationRequired ||
    evidence.broker.samplePlans.email.activationRequired ||
    evidence.apps.connectorCount > 0;
  if (!hasTrustBoundaries) {
    ceilings.push({
      maxScore: 79,
      reason: "serious approval and permission boundaries are not evident",
    });
  }

  const canSafelyImprove = evidence.growth.hasImprovementPath;
  if (!canSafelyImprove) {
    ceilings.push({
      maxScore: 89,
      reason: "safe self-improvement or self-upgrade paths are not yet evident",
    });
  }

  const appliedCeiling = ceilings.reduce(
    (lowest, ceiling) => Math.min(lowest, ceiling.maxScore),
    rawScore,
  );
  const totalScore = Math.min(rawScore, appliedCeiling);

  const nextSteps = [];
  if (!evidence.doctor.runtimeConfigExists) {
    nextSteps.push(
      "Run `jasper setup` so Jasper has a generated runtime config.",
    );
  }
  if (!evidence.doctor.qdrantConfigured) {
    nextSteps.push(
      "Configure Qdrant or another semantic index so Jasper's memory stops running in degraded mode.",
    );
  }
  if (
    evidence.broker.samplePlans.calendar.consentRequired ||
    evidence.broker.samplePlans.email.consentRequired
  ) {
    nextSteps.push(
      "Approve and activate real household connectors so calendar and email move from planned to runnable.",
    );
  }
  if (evidence.memory.commitmentCount === 0) {
    nextSteps.push(
      "Record strategic commitments so Jasper can prove durable long-horizon memory instead of only episodic recall.",
    );
  }
  if (evidence.memory.distinctSessionCount < 2) {
    nextSteps.push(
      "Run the audit again after a real second session so continuity can be scored without a ceiling.",
    );
  }

  return {
    audit: "brain_in_a_box",
    mode: evidence.mode,
    collectedAt: evidence.collectedAt,
    rawScore,
    totalScore,
    maxScore: 100,
    band: scoreBand(totalScore),
    automaticCeilings: ceilings,
    appliedCeiling,
    regions,
    evidence,
    manualAuditGaps: evidence.limitations,
    summary: [
      `Score ${totalScore}/100 (${scoreBand(totalScore)}).`,
      `Raw score before ceilings: ${rawScore}.`,
      ceilings.length > 0
        ? `Lowest automatic ceiling: ${appliedCeiling}.`
        : "No automatic ceiling was triggered.",
      `Strongest region: ${regions.slice().sort((left, right) => right.score - left.score)[0].label}.`,
      `Weakest region: ${regions.slice().sort((left, right) => left.score - right.score)[0].label}.`,
    ],
    nextSteps,
  };
}

export async function runBrainInABoxAudit(options = {}) {
  const evidence = await collectBrainInABoxEvidence(options);
  return scoreBrainInABoxEvidence(evidence);
}
