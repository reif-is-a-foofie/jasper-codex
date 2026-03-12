import test from "node:test";
import assert from "node:assert/strict";
import { createCapabilityBroker } from "./broker/index.js";

test("routes semantic memory requests to the built-in memory tool", () => {
  const broker = createCapabilityBroker();
  const plan = broker.inspectRequest("what have we talked about regarding qdrant");

  assert.equal(plan.internalPlan.primaryCapabilityId, "memory.semantic");
  assert.equal(plan.internalPlan.primaryProvider.providerId, "builtin");
  assert.equal(plan.internalPlan.primaryProvider.toolId, "semantic-memory-search");
  assert.equal(plan.internalPlan.primaryProvider.status, "available");
});

test("routes calendar questions to a consent-gated connector first", () => {
  const broker = createCapabilityBroker();
  const plan = broker.inspectRequest("check my calendar for tomorrow morning");

  assert.equal(plan.internalPlan.primaryCapabilityId, "calendar.read");
  assert.equal(plan.internalPlan.primaryProvider.providerId, "connector");
  assert.equal(plan.internalPlan.primaryProvider.status, "consent_required");
  assert.equal(plan.publicPlan.consentRequired, true);
});

test("routes fresh research to an auto-provisionable provider", () => {
  const broker = createCapabilityBroker();
  const plan = broker.inspectRequest("look up the latest qdrant release notes");

  assert.equal(plan.internalPlan.primaryCapabilityId, "web.research");
  assert.equal(plan.internalPlan.primaryProvider.providerId, "claw");
  assert.equal(plan.internalPlan.primaryProvider.status, "provisionable");
  assert.equal(plan.publicPlan.autoProvision, true);
});
