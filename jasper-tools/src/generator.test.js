import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createGeneratedToolSpec } from "./generator.js";
import { generateToolFromTemplate } from "./generator.js";
import { listGeneratorTemplates } from "./generator.js";
import { loadGeneratedRegistry } from "./generator.js";

function createToolsRoot() {
  const toolsRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "jasper-tools-generator-"),
  );
  fs.mkdirSync(path.join(toolsRoot, "generated", "tools"), { recursive: true });
  fs.writeFileSync(
    path.join(toolsRoot, "generated", "registry.json"),
    "[]\n",
    "utf8",
  );
  return toolsRoot;
}

test("lists supported Jasper generator templates", () => {
  assert.deepStrictEqual(listGeneratorTemplates(), [
    {
      id: "recent-memory",
      description:
        "Return recent Jasper memory events with optional source/type filters.",
    },
    {
      id: "semantic-memory-search",
      description:
        "Search Jasper memory with a saved semantic query and optional filters.",
    },
  ]);
});

test("creates a generated tool spec with normalized defaults", () => {
  const spec = createGeneratedToolSpec({
    id: " Ops Focus ",
    template: "semantic-memory-search",
    description: "Operational focus search",
    limit: "8",
    query: "household operations",
    type: "note",
    source: "runtime",
  });

  assert.deepStrictEqual(
    {
      ...spec,
      createdAt: "<dynamic>",
    },
    {
      schemaVersion: 1,
      id: "ops-focus",
      template: "semantic-memory-search",
      description: "Operational focus search",
      createdAt: "<dynamic>",
      defaults: {
        limit: 8,
        query: "household operations",
        type: "note",
        source: "runtime",
      },
    },
  );
  assert.match(spec.createdAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("rejects unsupported generated tool templates before writing files", () => {
  assert.throws(
    () =>
      createGeneratedToolSpec({
        id: "bad-tool",
        template: "bogus",
        description: "Bad tool",
      }),
    {
      message:
        "Unsupported Jasper tool template: bogus. Valid templates: recent-memory, semantic-memory-search",
    },
  );
});

test("generates registry metadata and a module file for a supported template", () => {
  const toolsRoot = createToolsRoot();
  const generated = generateToolFromTemplate({
    toolsRoot,
    id: "ops-focus",
    template: "semantic-memory-search",
    description: "Operational focus search",
    query: "household operations",
  });

  assert.deepStrictEqual(
    {
      ...generated.spec,
      createdAt: "<dynamic>",
    },
    {
      schemaVersion: 1,
      id: "ops-focus",
      template: "semantic-memory-search",
      description: "Operational focus search",
      createdAt: "<dynamic>",
      defaults: {
        limit: 5,
        query: "household operations",
        type: undefined,
        source: undefined,
      },
    },
  );
  assert.ok(fs.existsSync(generated.modulePath));
  assert.equal(
    fs.readFileSync(generated.modulePath, "utf8"),
    `export default ${JSON.stringify(generated.spec, null, 2)};\n`,
  );
  assert.deepStrictEqual(
    loadGeneratedRegistry(toolsRoot).map((entry) => ({
      ...entry,
      createdAt: "<dynamic>",
    })),
    [
      {
        id: "ops-focus",
        description: "Operational focus search",
        template: "semantic-memory-search",
        createdAt: "<dynamic>",
        modulePath: "generated/tools/ops-focus.js",
        defaults: {
          limit: 5,
          query: "household operations",
        },
      },
    ],
  );
});
