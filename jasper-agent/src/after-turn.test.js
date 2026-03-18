import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { approveConnector } from "./apps.js";
import { createEventStore } from "../../jasper-memory/src/event-store.js";
import { createToolAcquisitionStore } from "./broker/acquisition-store.js";
import { processAfterTurn } from "./after-turn.js";

function createIdentityPath() {
  const identityDir = fs.mkdtempSync(path.join(os.tmpdir(), "jasper-after-turn-id-"));
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

test("after-turn intake queues connector consent work and records a tooling event", () => {
  const jasperHome = fs.mkdtempSync(path.join(os.tmpdir(), "jasper-after-turn-home-"));
  const identityPath = createIdentityPath();
  const memory = createEventStore({ jasperHome });
  memory.appendEvent({
    id: "evt_intake_1",
    type: "tooling.intake.requested",
    source: "jasper-tooling",
    sessionId: "thread_1",
    payload: {
      threadId: "thread_1",
      turnId: "turn_1",
      request: "check my calendar tomorrow",
    },
  });

  const result = processAfterTurn(
    {
      type: "agent-turn-complete",
      "input-messages": ["check my calendar tomorrow"],
    },
    {
      jasperHome,
      identityPath,
      maintenanceLimit: 1,
    },
  );

  const acquisitionStore = createToolAcquisitionStore({ jasperHome });
  const records = acquisitionStore.listAcquisitions({
    limit: Number.MAX_SAFE_INTEGER,
  });
  const events = createEventStore({ jasperHome }).listRecentEvents({
    limit: 20,
  });

  assert.equal(result.ok, true);
  assert.equal(records.length, 1);
  assert.equal(records[0].status, "awaiting_consent");
  assert.equal(records[0].source?.intakeEventId, "evt_intake_1");
  assert.ok(
    events.some(
      (event) =>
        event.type === "tooling.acquire.pending" &&
        String(event.payload.summary).includes("waiting for user consent"),
    ),
  );
});

test("after-turn intake avoids duplicating the same pending acquisition", () => {
  const jasperHome = fs.mkdtempSync(path.join(os.tmpdir(), "jasper-after-turn-dupe-"));
  const identityPath = createIdentityPath();
  const payload = {
    type: "agent-turn-complete",
    "input-messages": ["search my files for qdrant notes"],
  };

  processAfterTurn(payload, {
    jasperHome,
    identityPath,
    maintenanceLimit: 1,
  });
  processAfterTurn(payload, {
    jasperHome,
    identityPath,
    maintenanceLimit: 1,
  });

  const acquisitionStore = createToolAcquisitionStore({ jasperHome });
  const records = acquisitionStore.listAcquisitions({
    limit: Number.MAX_SAFE_INTEGER,
  });

  assert.equal(records.length, 1);
  assert.equal(records[0].status, "quarantine_pending");
});

test("after-turn intake records activation work for approved connectors", () => {
  const jasperHome = fs.mkdtempSync(path.join(os.tmpdir(), "jasper-after-turn-active-"));
  const identityPath = createIdentityPath();
  approveConnector({
    jasperHome,
    connectorId: "calendar",
  });

  const result = processAfterTurn(
    {
      type: "agent-turn-complete",
      "input-messages": ["check my calendar tomorrow"],
    },
    {
      jasperHome,
      identityPath,
      maintenanceLimit: 1,
    },
  );

  const acquisitionStore = createToolAcquisitionStore({ jasperHome });
  const records = acquisitionStore.listAcquisitions({
    limit: Number.MAX_SAFE_INTEGER,
  });
  const events = createEventStore({ jasperHome }).listRecentEvents({
    limit: 20,
  });

  assert.equal(result.ok, true);
  assert.equal(records.length, 1);
  assert.equal(records[0].status, "activation_pending");
  assert.ok(
    events.some(
      (event) =>
        event.type === "tooling.acquire.pending" &&
        String(event.payload.summary).includes("needs the connector activated"),
    ),
  );
});
