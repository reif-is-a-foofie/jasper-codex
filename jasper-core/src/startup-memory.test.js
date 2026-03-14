import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createEventStore } from "../../jasper-memory/src/event-store.js";
import { buildStartupMemoryInstructions } from "./startup-memory.js";

test("startup memory instructions include tooling summary events", () => {
  const memoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jasper-startup-memory-"));
  const store = createEventStore({ root: memoryRoot });
  store.appendEvent({
    type: "tooling.tool.available",
    source: "jasper-auto-intake",
    tags: ["tooling"],
    payload: {
      summary: 'Jasper can now use local tool "memory-semantic" for semantic recall.',
    },
  });

  const instructions = buildStartupMemoryInstructions({ memoryRoot });

  assert.match(instructions, /memory-semantic/);
  assert.match(instructions, /semantic recall/);
});
