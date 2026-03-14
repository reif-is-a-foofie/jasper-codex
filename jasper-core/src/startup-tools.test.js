import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildStartupToolInstructions } from "./startup-tools.js";

function createIdentityPath() {
  const identityDir = fs.mkdtempSync(path.join(os.tmpdir(), "jasper-tools-id-"));
  const identityPath = path.join(identityDir, "identity.yaml");
  fs.writeFileSync(
    identityPath,
    `identity:
  name: Jasper
  owner: Reif Tauati
  role: household intelligence
mission:
  - increase clarity
  - protect the household
personality:
  tone: calm
  style: concise
  traits:
    - loyal
    - analytical
`,
    "utf8",
  );
  return identityPath;
}

function createToolsRoot() {
  const toolsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jasper-tools-root-"));
  fs.mkdirSync(path.join(toolsRoot, "generated", "tools"), { recursive: true });
  fs.writeFileSync(
    path.join(toolsRoot, "generated", "registry.json"),
    JSON.stringify(
      [
        {
          id: "memory-semantic",
          description: "Search prior Jasper memory for related context.",
          template: "semantic-memory-search",
          createdAt: new Date().toISOString(),
          modulePath: "generated/tools/memory-semantic.js",
          defaults: {
            query: "remember qdrant notes",
          },
        },
      ],
      null,
      2,
    ),
    "utf8",
  );
  fs.writeFileSync(
    path.join(toolsRoot, "generated", "tools", "memory-semantic.js"),
    "export default {};\n",
    "utf8",
  );
  return toolsRoot;
}

test("startup tool instructions advertise the Jasper bridge and available tools", () => {
  const instructions = buildStartupToolInstructions({
    identityPath: createIdentityPath(),
    toolsRoot: createToolsRoot(),
  });

  assert.match(instructions, /Jasper local tool bridge:/);
  assert.match(instructions, /jasper tools run TOOL_ID/);
  assert.match(instructions, /web-research/);
  assert.match(instructions, /memory-semantic/);
});
