import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createToolAcquisitionStore } from "./acquisition-store.js";

function createJasperHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "jasper-tooling-home-"));
}

function buildAcquisitionPlan(overrides = {}) {
  return {
    request: "look up the latest qdrant release notes",
    acknowledgement: "Let me figure out the best way to handle that.",
    publicPlan: {
      summary:
        "Jasper needs a capability path before it can complete this request.",
    },
    internalPlan: {
      primaryCapabilityId: "web.research",
      primaryProvider: {
        providerId: "claw",
        packageId: "claw/web-research",
        status: "provisionable",
      },
      acquisition: {
        strategy: "search_and_quarantine",
        nextAction: "queue_quarantine_review",
        requirement: {
          capabilityId: "web.research",
          label: "Web research",
          description: "Find fresh public information on the web.",
        },
        search: {
          querySeeds: ["web.research", "Web research", "latest"],
          channels: [
            {
              id: "claw/web-research",
              kind: "curated_toolpack",
              trust: "curated",
              quarantineRequired: true,
              reason: "Curated external toolpack candidate.",
            },
            {
              id: "jasper.build",
              kind: "internal_build",
              trust: "jasper_owned",
              quarantineRequired: false,
              reason: "Build a Jasper-owned tool when imports fail.",
            },
          ],
        },
        quarantine: {
          required: true,
          mode: "manual_review",
        },
        build: {
          recommended: false,
          strategy: "author_new_tool_module",
          recommendedTemplates: [],
        },
        ...overrides,
      },
    },
  };
}

test("persists acquisition records and exposes the quarantine queue", () => {
  const store = createToolAcquisitionStore({ jasperHome: createJasperHome() });
  const record = store.acquire(buildAcquisitionPlan(), {
    source: {
      kind: "turn_intake",
      intakeEventId: "evt_intake_1",
      threadId: "thread_1",
      turnId: "turn_1",
      ts: "2026-03-13T00:00:00.000Z",
    },
  });

  assert.equal(record.status, "quarantine_pending");
  assert.equal(record.source?.intakeEventId, "evt_intake_1");
  assert.equal(store.listAcquisitions()[0].id, record.id);
  assert.equal(store.listQuarantineQueue()[0].id, record.id);
});

test("admits and rejects quarantine candidates", () => {
  const store = createToolAcquisitionStore({ jasperHome: createJasperHome() });
  const record = store.acquire(buildAcquisitionPlan());

  const admitted = store.admitCandidate(
    record.id,
    "claw/web-research",
    "Approved after review.",
  );
  assert.equal(
    admitted.candidates.find(
      (candidate) => candidate.id === "claw/web-research",
    )?.status,
    "admitted",
  );

  const rejected = store.rejectCandidate(
    record.id,
    "jasper.build",
    "Hold off for now.",
  );
  assert.equal(
    rejected.candidates.find((candidate) => candidate.id === "jasper.build")
      ?.status,
    "rejected",
  );
});

test("activates admitted external candidates and lists them as providers", () => {
  const store = createToolAcquisitionStore({ jasperHome: createJasperHome() });
  const record = store.acquire(buildAcquisitionPlan());

  store.admitCandidate(
    record.id,
    "claw/web-research",
    "Approved after review.",
  );
  const activated = store.activateCandidate(
    record.id,
    "claw/web-research",
    "Activate for future routing.",
  );

  assert.equal(activated.status, "activated");
  assert.equal(
    activated.candidates.find(
      (candidate) => candidate.id === "claw/web-research",
    )?.status,
    "activated",
  );
  assert.deepEqual(store.listActivatedProviders(), [
    {
      recordId: record.id,
      request: "look up the latest qdrant release notes",
      requirement: {
        capabilityId: "web.research",
        label: "Web research",
        description: "Find fresh public information on the web.",
      },
      primaryCapabilityId: "web.research",
      id: "claw/web-research",
      kind: "curated_toolpack",
      trust: "curated",
      reason: "Curated external toolpack candidate.",
      quarantineRequired: true,
      status: "activated",
      note: "Activate for future routing.",
      updatedAt: activated.updatedAt,
    },
  ]);
});

test("records generated local builds against an acquisition record", () => {
  const store = createToolAcquisitionStore({ jasperHome: createJasperHome() });
  const record = store.acquire(
    buildAcquisitionPlan({
      strategy: "build_in_house",
      build: {
        recommended: true,
        strategy: "generate_from_template",
        recommendedTemplates: [
          {
            id: "semantic-memory-search",
            description: "Search Jasper memory with a saved semantic query.",
          },
        ],
      },
      search: {
        querySeeds: [],
        channels: [],
      },
      quarantine: {
        required: false,
        mode: "manual_review",
      },
    }),
  );

  const updated = store.recordGeneratedBuild(record.id, {
    spec: { id: "web-research-tool" },
  });

  assert.equal(updated.status, "generated");
  assert.equal(updated.build.generatedToolId, "web-research-tool");
});
