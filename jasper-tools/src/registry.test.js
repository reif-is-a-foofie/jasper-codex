import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createEventStore } from "../../jasper-memory/src/event-store.js";
import { generateToolFromTemplate } from "./generator.js";
import { createToolRegistry } from "./registry.js";

function createIdentityPath() {
  const identityDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "jasper-tools-identity-"),
  );
  const identityPath = path.join(identityDir, "identity.yaml");
  fs.writeFileSync(
    identityPath,
    `identity:
  name: Jasper
  owner: Reif Tauati
  role: personal intelligence system
mission:
  - increase clarity
  - protect the household
  - improve daily operations
personality:
  tone: calm
  style: concise
  traits:
    - loyal
    - analytical
    - proactive
`,
    "utf8",
  );
  return identityPath;
}

function createToolsRoot() {
  const toolsRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "jasper-tools-registry-"),
  );
  fs.mkdirSync(path.join(toolsRoot, "generated", "tools"), { recursive: true });
  fs.writeFileSync(
    path.join(toolsRoot, "generated", "registry.json"),
    "[]\n",
    "utf8",
  );
  return toolsRoot;
}

test("lists built-in Jasper tools when no generated tools exist", () => {
  const registry = createToolRegistry({
    identityPath: createIdentityPath(),
    memoryRoot: fs.mkdtempSync(path.join(os.tmpdir(), "jasper-tools-memory-")),
    toolsRoot: createToolsRoot(),
  });

  assert.deepStrictEqual(registry.listTools(), [
    {
      id: "identity-summary",
      description: "Return Jasper identity, mission, and personality details.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    {
      id: "recent-memory",
      description: "Return the most recent Jasper memory events.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number" },
          type: { type: "string" },
          source: { type: "string" },
        },
        additionalProperties: false,
      },
    },
    {
      id: "semantic-memory-search",
      description:
        "Search Jasper memory using deterministic semantic retrieval.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
          limit: { type: "number" },
          type: { type: "string" },
          source: { type: "string" },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
    {
      id: "web-research",
      description:
        "Run first-party web research through Jasper's Codex bridge.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  ]);
});

test("runs built-in identity-summary tool through the Jasper registry", async () => {
  const identityPath = createIdentityPath();
  const registry = createToolRegistry({
    identityPath,
    memoryRoot: fs.mkdtempSync(path.join(os.tmpdir(), "jasper-tools-memory-")),
    toolsRoot: createToolsRoot(),
  });

  assert.deepStrictEqual(await registry.runTool("identity-summary"), {
    tool: {
      id: "identity-summary",
      description: "Return Jasper identity, mission, and personality details.",
    },
    input: {},
    output: {
      path: identityPath,
      identity: {
        name: "Jasper",
        owner: "Reif Tauati",
        role: "personal intelligence system",
      },
      mission: [
        "increase clarity",
        "protect the household",
        "improve daily operations",
      ],
      personality: {
        tone: "calm",
        style: "concise",
        traits: ["loyal", "analytical", "proactive"],
      },
    },
  });
});

test("runs a generated semantic-memory-search tool through the same registry", async () => {
  const toolsRoot = createToolsRoot();
  const memoryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "jasper-tools-memory-"),
  );
  const store = createEventStore({ root: memoryRoot });
  store.appendEvent({
    id: "evt_1",
    ts: "2026-03-12T18:00:00.000Z",
    type: "note",
    source: "runtime",
    payload: {
      summary: "Household operations focus on dinner and grocery planning.",
    },
  });

  generateToolFromTemplate({
    toolsRoot,
    id: "ops-focus",
    template: "semantic-memory-search",
    description: "Operational focus search",
    query: "household operations",
    type: "note",
    source: "runtime",
  });

  const registry = createToolRegistry({
    identityPath: createIdentityPath(),
    memoryRoot,
    toolsRoot,
  });

  const expectedOutput = await store.searchSemanticEvents({
    query: "household operations",
    limit: 5,
    type: "note",
    source: "runtime",
  });

  assert.deepStrictEqual(await registry.runTool("ops-focus"), {
    tool: {
      id: "ops-focus",
      description: "Operational focus search",
    },
    input: {},
    output: expectedOutput,
  });
});

test("runs the built-in web-research tool through the Jasper registry", async () => {
  const registry = createToolRegistry({
    identityPath: createIdentityPath(),
    memoryRoot: fs.mkdtempSync(path.join(os.tmpdir(), "jasper-tools-memory-")),
    toolsRoot: createToolsRoot(),
    webResearchRunner: async (query) => ({
      query,
      answer: "Qdrant 2.0 was announced with a migration guide.",
      searches: ["qdrant release notes"],
      threadId: "thread_123",
    }),
  });

  assert.deepStrictEqual(
    await registry.runTool("web-research", {
      query: "latest qdrant release notes",
    }),
    {
      tool: {
        id: "web-research",
        description:
          "Run first-party web research through Jasper's Codex bridge.",
      },
      input: {
        query: "latest qdrant release notes",
      },
      output: {
        query: "latest qdrant release notes",
        answer: "Qdrant 2.0 was announced with a migration guide.",
        searches: ["qdrant release notes"],
        threadId: "thread_123",
      },
    },
  );
});

test("rejects generated semantic-memory-search runs without a query", async () => {
  const toolsRoot = createToolsRoot();
  generateToolFromTemplate({
    toolsRoot,
    id: "ops-focus",
    template: "semantic-memory-search",
    description: "Operational focus search",
  });

  const registry = createToolRegistry({
    identityPath: createIdentityPath(),
    memoryRoot: fs.mkdtempSync(path.join(os.tmpdir(), "jasper-tools-memory-")),
    toolsRoot,
  });

  await assert.rejects(
    () => registry.runTool("ops-focus"),
    new Error('Generated tool "ops-focus" requires a query'),
  );
});

test("rejects built-in web-research runs without a query", async () => {
  const registry = createToolRegistry({
    identityPath: createIdentityPath(),
    memoryRoot: fs.mkdtempSync(path.join(os.tmpdir(), "jasper-tools-memory-")),
    toolsRoot: createToolsRoot(),
    webResearchRunner: async () => {
      throw new Error("runner should not be called");
    },
  });

  await assert.rejects(
    () => registry.runTool("web-research"),
    new Error('Tool "web-research" requires a non-empty query'),
  );
});
