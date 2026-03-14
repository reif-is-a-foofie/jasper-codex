import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createToolAcquisitionStore } from "./acquisition-store.js";
import { createToolMaintenanceWorker } from "./tool-maintenance.js";

function createJasperHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "jasper-maintenance-home-"));
}

function createToolsRoot() {
  const toolsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jasper-tools-"));
  fs.mkdirSync(path.join(toolsRoot, "generated", "tools"), { recursive: true });
  fs.writeFileSync(
    path.join(toolsRoot, "generated", "registry.json"),
    "[]\n",
    "utf8",
  );
  return toolsRoot;
}

function buildPlan() {
  return {
    request: "remember what we said about qdrant",
    acknowledgement: "Let me figure out the best way to handle that.",
    publicPlan: {
      summary:
        "Jasper needs a capability path before it can complete this request.",
    },
    internalPlan: {
      primaryCapabilityId: "memory.semantic",
      primaryProvider: null,
      acquisition: {
        strategy: "build_in_house",
        nextAction: "generate_local_tool",
        requirement: {
          capabilityId: "memory.semantic",
          label: "Semantic memory",
          description: "Recall related prior context from Jasper memory.",
        },
        search: {
          querySeeds: [],
          channels: [],
        },
        quarantine: {
          required: false,
          mode: "manual_review",
          candidates: [],
          checklist: [],
        },
        build: {
          recommended: true,
          strategy: "generate_from_template",
          availableTemplates: [
            {
              id: "semantic-memory-search",
              description:
                "Search Jasper memory with a saved semantic query and optional filters.",
            },
          ],
          recommendedTemplates: [
            {
              id: "semantic-memory-search",
              description:
                "Search Jasper memory with a saved semantic query and optional filters.",
            },
          ],
          reason: "Generate a Jasper-owned tool from a known template.",
        },
      },
    },
  };
}

test("tool maintenance generates tools for build-ready acquisitions", () => {
  const jasperHome = createJasperHome();
  const toolsRoot = createToolsRoot();
  const acquisitionStore = createToolAcquisitionStore({ jasperHome });
  const record = acquisitionStore.acquire(buildPlan());
  const worker = createToolMaintenanceWorker({
    jasperHome,
    toolsRoot,
    acquisitionStore,
  });

  const result = worker.maintain();

  assert.equal(result.scanned, 1);
  assert.equal(result.generatedCount, 1);
  assert.equal(result.generated[0].recordId, record.id);
  assert.equal(result.generated[0].toolId, "memory-semantic");
  assert.ok(
    fs.existsSync(
      path.join(toolsRoot, "generated", "tools", "memory-semantic.js"),
    ),
  );
  assert.equal(acquisitionStore.getAcquisition(record.id)?.status, "generated");
});

test("tool maintenance turns pending intake events into acquisition records once", () => {
  const jasperHome = createJasperHome();
  const toolsRoot = createToolsRoot();
  const acquisitionStore = createToolAcquisitionStore({ jasperHome });
  const intakeEvent = {
    id: "evt_intake_1",
    ts: "2026-03-13T00:00:00.000Z",
    payload: {
      threadId: "thread_1",
      turnId: "turn_1",
      request: "check my calendar tomorrow morning",
    },
  };
  const worker = createToolMaintenanceWorker({
    jasperHome,
    toolsRoot,
    acquisitionStore,
    eventStore: {
      queryEvents() {
        return [intakeEvent];
      },
    },
    broker: {
      inspectRequest(query) {
        assert.equal(query, "check my calendar tomorrow morning");
        return {
          request: query,
          acknowledgement: "I can check that once you approve the connection.",
          publicPlan: {
            summary:
              "Jasper needs user consent before accessing the requested data source.",
          },
          internalPlan: {
            primaryCapabilityId: "calendar.read",
            primaryProvider: {
              providerId: "connector",
              connectorId: "calendar",
              status: "consent_required",
            },
            acquisition: {
              strategy: "request_consent",
              nextAction: "request_connector_consent",
              requirement: {
                capabilityId: "calendar.read",
                label: "Calendar access",
                description: "Read calendar availability and upcoming events.",
              },
              search: {
                querySeeds: ["calendar"],
                channels: [],
              },
              quarantine: {
                required: false,
                mode: "manual_review",
                candidates: [],
                checklist: [],
              },
              build: {
                recommended: false,
                strategy: "author_new_tool_module",
                availableTemplates: [],
                recommendedTemplates: [],
                reason: "Connector consent comes first.",
              },
            },
          },
        };
      },
    },
  });

  const first = worker.maintain();
  const second = worker.maintain();
  const acquisitions = acquisitionStore.listAcquisitions({
    limit: Number.MAX_SAFE_INTEGER,
  });

  assert.equal(first.intakeAcquiredCount, 1);
  assert.equal(first.intake.acquired[0].capabilityId, "calendar.read");
  assert.equal(second.intakeAcquiredCount, 0);
  assert.equal(acquisitions.length, 1);
  assert.equal(acquisitions[0].status, "awaiting_consent");
  assert.deepEqual(acquisitions[0].source, {
    kind: "turn_intake",
    intakeEventId: "evt_intake_1",
    threadId: "thread_1",
    turnId: "turn_1",
    ts: "2026-03-13T00:00:00.000Z",
  });
});

test("tool maintenance does not duplicate already-pending acquisition work", () => {
  const jasperHome = createJasperHome();
  const toolsRoot = createToolsRoot();
  const acquisitionStore = createToolAcquisitionStore({ jasperHome });
  const plan = {
    request: "check my calendar tomorrow morning",
    acknowledgement: "I can check that once you approve the connection.",
    publicPlan: {
      summary:
        "Jasper needs user consent before accessing the requested data source.",
    },
    internalPlan: {
      primaryCapabilityId: "calendar.read",
      primaryProvider: {
        providerId: "connector",
        connectorId: "calendar",
        status: "consent_required",
      },
      acquisition: {
        strategy: "request_consent",
        nextAction: "request_connector_consent",
        requirement: {
          capabilityId: "calendar.read",
          label: "Calendar access",
          description: "Read calendar availability and upcoming events.",
        },
        search: {
          querySeeds: ["calendar"],
          channels: [],
        },
        quarantine: {
          required: false,
          mode: "manual_review",
          candidates: [],
          checklist: [],
        },
        build: {
          recommended: false,
          strategy: "author_new_tool_module",
          availableTemplates: [],
          recommendedTemplates: [],
          reason: "Connector consent comes first.",
        },
      },
    },
  };
  acquisitionStore.acquire(plan);
  const worker = createToolMaintenanceWorker({
    jasperHome,
    toolsRoot,
    acquisitionStore,
    eventStore: {
      queryEvents() {
        return [
          {
            id: "evt_intake_1",
            ts: "2026-03-13T00:00:00.000Z",
            payload: {
              threadId: "thread_1",
              turnId: "turn_1",
              request: "check my calendar tomorrow morning",
            },
          },
        ];
      },
    },
    broker: {
      inspectRequest() {
        return plan;
      },
    },
  });

  const result = worker.maintain();

  assert.equal(result.intakeAcquiredCount, 0);
  assert.equal(result.intakeSkippedCount, 1);
  assert.equal(
    acquisitionStore.listAcquisitions({ limit: Number.MAX_SAFE_INTEGER }).length,
    1,
  );
});
