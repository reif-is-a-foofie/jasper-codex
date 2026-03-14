import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createEventStore } from "../../jasper-memory/src/event-store.js";
import { createJasperRuntime } from "./runtime.js";

function createIdentityPath() {
  const identityDir = fs.mkdtempSync(path.join(os.tmpdir(), "jasper-runtime-"));
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

test("runtime records tool maintenance activity during ticks", async () => {
  const memoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jasper-memory-"));
  const runtime = createJasperRuntime({
    identityPath: createIdentityPath(),
    memoryRoot,
    maxTicks: 1,
    tickIntervalMs: 10,
    toolMaintenanceWorker: {
      maintain() {
        return {
          intake: {
            scanned: 1,
            acquired: [
              {
                intakeEventId: "evt_intake_1",
                recordId: "acq_0",
                capabilityId: "calendar.read",
                status: "awaiting_consent",
                nextAction: "request_connector_consent",
              },
            ],
            skipped: [],
            acquiredCount: 1,
            skippedCount: 0,
          },
          scanned: 1,
          generated: [
            {
              recordId: "acq_1",
              toolId: "memory-semantic",
              template: "semantic-memory-search",
              acquisitionStatus: "generated",
            },
          ],
          skipped: [],
          intakeAcquiredCount: 1,
          intakeSkippedCount: 0,
          generatedCount: 1,
          skippedCount: 0,
        };
      },
    },
  });

  const result = await runtime.start();
  const store = createEventStore({ root: memoryRoot });
  const events = store.listRecentEvents({ limit: 20 });

  assert.equal(result.ok, true);
  assert.ok(events.some((event) => event.type === "tooling.maintenance"));
  assert.ok(
    events.some(
      (event) =>
        event.type === "runtime.tick" &&
        event.payload.generatedToolCount === 1 &&
        event.payload.queuedAcquisitionCount === 1,
    ),
  );
});
