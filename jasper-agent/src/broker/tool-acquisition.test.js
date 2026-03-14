import test from "node:test";
import assert from "node:assert/strict";
import { planToolAcquisition } from "./tool-acquisition-plan.js";

test("sends external provider candidates into quarantine review", () => {
  const plan = planToolAcquisition(
    {
      id: "web.research",
      label: "Web research",
      description: "Find fresh public information on the web.",
      keywords: ["latest", "research"],
      phrases: ["look this up"],
    },
    {
      selected: {
        providerId: "claw",
        packageId: "claw/web-research",
        status: "provisionable",
        trust: "curated",
      },
      candidates: [
        {
          providerId: "claw",
          packageId: "claw/web-research",
          status: "provisionable",
          trust: "curated",
        },
        {
          providerId: "mcp",
          packageId: "jasper/web-research",
          serverName: "web-research",
          status: "provisionable",
          trust: "curated",
        },
      ],
    },
  );

  assert.equal(plan.strategy, "search_and_quarantine");
  assert.equal(plan.quarantine.required, true);
  assert.equal(plan.nextAction, "queue_quarantine_review");
  assert.equal(plan.search.channels[0].id, "claw/web-research");
});

test("recommends an in-house build when no provider path is ready", () => {
  const plan = planToolAcquisition(
    {
      id: "memory.semantic",
      label: "Semantic memory",
      description: "Recall related prior context from Jasper memory.",
      keywords: ["remember", "recall"],
      phrases: ["remind me about"],
    },
    {
      selected: null,
      candidates: [],
    },
  );

  assert.equal(plan.strategy, "build_in_house");
  assert.equal(plan.build.recommended, true);
  assert.equal(plan.build.strategy, "generate_from_template");
  assert.deepEqual(plan.build.recommendedTemplates, [
    {
      id: "semantic-memory-search",
      description:
        "Search Jasper memory with a saved semantic query and optional filters.",
    },
  ]);
  assert.equal(plan.nextAction, "generate_local_tool");
});

test("treats activated external providers as existing capability paths", () => {
  const plan = planToolAcquisition(
    {
      id: "web.research",
      label: "Web research",
      description: "Find fresh public information on the web.",
      keywords: ["latest", "research"],
      phrases: ["look this up"],
    },
    {
      selected: {
        providerId: "claw",
        packageId: "claw/web-research",
        status: "available",
        trust: "curated",
      },
      candidates: [
        {
          providerId: "claw",
          packageId: "claw/web-research",
          status: "available",
          trust: "curated",
        },
      ],
    },
  );

  assert.equal(plan.strategy, "use_existing");
  assert.equal(plan.quarantine.required, false);
  assert.equal(plan.nextAction, "use_existing_tool");
});
