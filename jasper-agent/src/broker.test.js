import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createToolAcquisitionStore } from "./broker/acquisition-store.js";
import { createCapabilityBroker } from "./broker/index.js";

function createJasperHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "jasper-broker-home-"));
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

test("routes semantic memory requests to the built-in memory tool", () => {
  const broker = createCapabilityBroker();
  const plan = broker.inspectRequest(
    "what have we talked about regarding qdrant",
  );

  assert.equal(plan.internalPlan.primaryCapabilityId, "memory.semantic");
  assert.equal(plan.internalPlan.primaryProvider.providerId, "builtin");
  assert.equal(
    plan.internalPlan.primaryProvider.toolId,
    "semantic-memory-search",
  );
  assert.equal(plan.internalPlan.primaryProvider.status, "available");
  assert.equal(plan.internalPlan.acquisition.strategy, "use_existing");
  assert.equal(plan.publicPlan.tooling.quarantineRequired, false);
});

test("routes calendar questions to a consent-gated connector first", () => {
  const broker = createCapabilityBroker();
  const plan = broker.inspectRequest("check my calendar for tomorrow morning");

  assert.equal(plan.internalPlan.primaryCapabilityId, "calendar.read");
  assert.equal(plan.internalPlan.primaryProvider.providerId, "connector");
  assert.equal(plan.internalPlan.primaryProvider.status, "consent_required");
  assert.equal(plan.publicPlan.consentRequired, true);
  assert.equal(plan.internalPlan.acquisition.strategy, "request_consent");
  assert.equal(plan.internalPlan.acquisition.build.recommended, false);
});

test("routes web research into the built-in web tool", () => {
  const broker = createCapabilityBroker();
  const plan = broker.inspectRequest("look up the latest qdrant release notes");

  assert.equal(plan.internalPlan.primaryCapabilityId, "web.research");
  assert.equal(plan.internalPlan.primaryProvider.providerId, "builtin");
  assert.equal(plan.internalPlan.primaryProvider.toolId, "web-research");
  assert.equal(plan.internalPlan.primaryProvider.status, "available");
  assert.equal(plan.publicPlan.autoProvision, false);
  assert.equal(plan.internalPlan.acquisition.strategy, "use_existing");
  assert.equal(plan.publicPlan.tooling.quarantineRequired, false);
});

test("acquireRequest materializes an available built-in tool", () => {
  const jasperHome = createJasperHome();
  const store = createToolAcquisitionStore({ jasperHome });
  const broker = createCapabilityBroker({
    jasperHome,
    acquisitionStore: store,
  });

  const result = broker.acquireRequest(
    "what have we talked about regarding qdrant",
  );

  assert.equal(result.acquisition.status, "satisfied");
  assert.equal(result.outcome.status, "ready");
  assert.equal(result.outcome.tool.id, "semantic-memory-search");
  assert.equal(store.listAcquisitions()[0].id, result.acquisition.id);
});

test("acquireRequest persists consent-gated requests without forcing execution", () => {
  const jasperHome = createJasperHome();
  const broker = createCapabilityBroker({ jasperHome });

  const result = broker.acquireRequest(
    "check my calendar for tomorrow morning",
  );

  assert.equal(result.acquisition.status, "awaiting_consent");
  assert.equal(result.outcome.status, "awaiting_consent");
  assert.equal(result.outcome.connectorId, "calendar");
});

test("acquireRequest persists quarantine work for external candidates", () => {
  const jasperHome = createJasperHome();
  const broker = createCapabilityBroker({ jasperHome });

  const result = broker.acquireRequest("search my files for qdrant notes");

  assert.equal(result.acquisition.status, "quarantine_pending");
  assert.equal(result.outcome.status, "quarantine_pending");
  assert.equal(result.outcome.candidates[0].id, "claw/filesystem");
});

test("activated external candidates become available to the broker", () => {
  const jasperHome = createJasperHome();
  const acquisitionStore = createToolAcquisitionStore({ jasperHome });
  const broker = createCapabilityBroker({
    jasperHome,
    acquisitionStore,
  });

  const initial = broker.acquireRequest("search my files for qdrant notes");
  acquisitionStore.admitCandidate(
    initial.acquisition.id,
    "claw/filesystem",
    "Approved after review.",
  );
  acquisitionStore.activateCandidate(
    initial.acquisition.id,
    "claw/filesystem",
    "Activate for future routing.",
  );

  const activatedBroker = createCapabilityBroker({
    jasperHome,
    acquisitionStore,
  });
  const result = activatedBroker.acquireRequest(
    "search my files for qdrant notes",
  );

  assert.equal(result.plan.internalPlan.primaryProvider.status, "available");
  assert.equal(result.plan.internalPlan.acquisition.strategy, "use_existing");
  assert.equal(result.acquisition.status, "satisfied");
  assert.equal(result.outcome.status, "ready");
  assert.equal(result.outcome.provider.packageId, "claw/filesystem");
});

test("acquireRequest generates a local Jasper tool when build-in-house is recommended", () => {
  const jasperHome = createJasperHome();
  const toolsRoot = createToolsRoot();
  const broker = createCapabilityBroker({
    jasperHome,
    toolsRoot,
    capabilityRegistry: {
      listCapabilities() {
        return [];
      },
      getCapability(capabilityId) {
        if (capabilityId === "memory.semantic") {
          return {
            id: "memory.semantic",
            label: "Semantic memory",
            description: "Recall related prior context from Jasper memory.",
            keywords: ["remember", "recall"],
            phrases: ["remind me about"],
          };
        }
        return null;
      },
      matchRequest() {
        return [
          {
            capability: {
              id: "memory.semantic",
              label: "Semantic memory",
              description: "Recall related prior context from Jasper memory.",
              keywords: ["remember", "recall"],
              phrases: ["remind me about"],
            },
            score: 4,
            matchedKeywords: ["remember"],
            matchedPhrases: [],
          },
        ];
      },
    },
    providerResolver: {
      resolveCapability() {
        return {
          selected: null,
          candidates: [],
        };
      },
    },
  });

  const result = broker.acquireRequest("remember what we said about qdrant", {
    id: "semantic-recall",
    description: "Saved semantic recall",
  });

  assert.equal(result.acquisition.status, "generated");
  assert.equal(result.outcome.status, "generated");
  assert.equal(result.outcome.generation.spec.id, "semantic-recall");
  assert.equal(result.outcome.tool.id, "semantic-recall");
});
