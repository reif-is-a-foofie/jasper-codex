import test from "node:test";
import assert from "node:assert/strict";
import { scoreBrainInABoxEvidence } from "./brain-in-a-box.js";

function strongEvidence() {
  return {
    collectedAt: "2026-03-19T00:00:00.000Z",
    mode: "automated_baseline",
    limitations: [],
    identity: {
      exists: true,
      name: "Jasper",
      owner: "Reif Tauati",
      role: "personal intelligence system",
      missionCount: 3,
      manifestoExists: true,
    },
    doctor: {
      status: "needs_attention",
      warnings: ["Qdrant is not configured."],
      nextSteps: ["Run jasper setup."],
      identityExists: true,
      runtimeConfigExists: true,
      codexReady: true,
      authReady: true,
      qdrantConfigured: false,
      qdrantStatus: "missing",
      appsStatus: "ready",
    },
    apps: {
      status: "ready",
      connectorCount: 2,
      readyConnectorCount: 2,
      pendingAttentionCount: 0,
      warnings: [],
      nextSteps: [],
    },
    memory: {
      eventCount: 120,
      recentEventCount: 10,
      distinctSessionCount: 3,
      sourceCount: 5,
      typeCount: 8,
      spanHours: 72,
      conversationTurnCount: 24,
      execCommandCount: 10,
      listenerEventCount: 2,
      strategicEventCount: 4,
      commitmentCount: 3,
      contradictionCount: 0,
    },
    tools: {
      count: 5,
      ids: [
        "apps-status",
        "identity-summary",
        "recent-memory",
        "semantic-memory-search",
        "web-research",
      ],
      exercises: {
        identitySummary: { ok: true, outputKeys: ["identity", "mission"] },
        appsStatus: { ok: true, outputKeys: ["status", "connectors"] },
        recentMemory: { ok: true, outputCount: 3 },
        semanticMemory: { ok: true, outputCount: 2 },
      },
      successfulExerciseCount: 4,
    },
    broker: {
      capabilityCount: 8,
      samplePlans: {
        identity: {
          primaryCapabilityId: "identity.summary",
          consentRequired: false,
          activationRequired: false,
          activeAgentCount: 3,
        },
        memory: {
          primaryCapabilityId: "memory.recent",
          consentRequired: false,
          activationRequired: false,
          activeAgentCount: 3,
        },
        calendar: {
          primaryCapabilityId: "calendar.read",
          consentRequired: false,
          activationRequired: false,
          activeAgentCount: 4,
        },
        email: {
          primaryCapabilityId: "email.read",
          consentRequired: false,
          activationRequired: false,
          activeAgentCount: 4,
        },
        filesystem: {
          primaryCapabilityId: "filesystem.search",
          consentRequired: false,
          activationRequired: false,
          toolingStrategy: "search_and_quarantine",
          autoProvision: true,
          buildRecommended: false,
          activeAgentCount: 4,
        },
        web: {
          primaryCapabilityId: "web.research",
          consentRequired: false,
          activationRequired: false,
          activeAgentCount: 4,
        },
      },
    },
    workflows: {
      count: 2,
      ids: ["daily-plan", "inbox-triage"],
      recentExecutionCount: 2,
    },
    guard: {
      scenarioCount: 3,
      anomalyCount: 1,
    },
    action: {
      planCount: 2,
      pendingApprovalCount: 0,
      completedCount: 1,
    },
    comms: {
      threadCount: 3,
      urgentCount: 1,
      followUpCount: 2,
    },
    growth: {
      templateCount: 2,
      generatedToolCount: 1,
      hasImprovementPath: true,
    },
  };
}

test("brain-in-a-box scoring produces a strong baseline without ceilings", () => {
  const result = scoreBrainInABoxEvidence(strongEvidence());

  assert.equal(result.automaticCeilings.length, 0);
  assert.ok(result.totalScore >= 60);
  assert.equal(result.band, "persistent_operator_grade_candidate");
  assert.equal(result.regions.length, 5);
});

test("brain-in-a-box scoring enforces the continuity ceiling", () => {
  const evidence = strongEvidence();
  evidence.memory.distinctSessionCount = 1;

  const result = scoreBrainInABoxEvidence(evidence);

  assert.ok(
    result.automaticCeilings.some((ceiling) => ceiling.maxScore === 39),
  );
  assert.equal(result.appliedCeiling, 39);
  assert.equal(result.totalScore, 39);
});
