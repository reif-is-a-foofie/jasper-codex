import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { approveConnector } from "./apps.js";
import { activateConnector } from "./apps.js";
import { createCapabilityBroker } from "./broker/index.js";
import { deactivateConnector } from "./apps.js";
import { getJasperAppStatus } from "./apps.js";
import { mergeDoctorStatus } from "./apps.js";
import { revokeConnector } from "./apps.js";
import { createAppsStatusTool } from "../../jasper-tools/src/tools/apps-status.js";

function createJasperHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "jasper-apps-"));
}

test("apps status is ready when no connector requests are pending", () => {
  const status = getJasperAppStatus({
    jasperHome: createJasperHome(),
  });

  assert.equal(status.status, "ready");
  assert.equal(status.connectors.length, 0);
  assert.equal(status.warnings.length, 0);
});

test("apps status summarizes pending connector requests", () => {
  const jasperHome = createJasperHome();
  const broker = createCapabilityBroker({ jasperHome });

  broker.acquireRequest("check my calendar tomorrow", {
    source: { kind: "test" },
  });
  broker.acquireRequest("summarize important unread email", {
    source: { kind: "test" },
  });
  broker.acquireRequest("check my calendar next week", {
    source: { kind: "test" },
  });

  const status = getJasperAppStatus({ jasperHome });

  assert.equal(status.status, "needs_attention");
  assert.equal(status.connectors.length, 2);
  assert.deepEqual(
    status.connectors
      .map((connector) => ({
        id: connector.id,
        status: connector.status,
        requestCount: connector.requestCount,
        requestedCapabilities: connector.requestedCapabilities,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    [
      {
        id: "calendar",
        status: "consent_required",
        requestCount: 2,
        requestedCapabilities: ["calendar.read"],
      },
      {
        id: "email",
        status: "consent_required",
        requestCount: 1,
        requestedCapabilities: ["email.read"],
      },
    ],
  );
  assert.match(status.nextSteps[0], /jasper apps/i);
});

test("approved connectors are remembered but still require activation", () => {
  const jasperHome = createJasperHome();

  approveConnector({
    jasperHome,
    connectorId: "calendar",
  });

  const status = getJasperAppStatus({ jasperHome });
  const broker = createCapabilityBroker({ jasperHome });
  const plan = broker.inspectRequest("check my calendar tomorrow");

  assert.equal(status.status, "ready");
  assert.equal(status.connectors[0].id, "calendar");
  assert.equal(status.connectors[0].status, "approved_not_active");
  assert.equal(status.connectors[0].consentStatus, "approved");
  assert.equal(status.connectors[0].runtimeStatus, "inactive");
  assert.equal(plan.internalPlan.primaryProvider.status, "activation_required");
  assert.equal(plan.publicPlan.activationRequired, true);
  assert.match(
    plan.internalPlan.primaryProvider.reason,
    /not active yet/i,
  );
});

test("activating an approved connector makes it available to the broker", () => {
  const jasperHome = createJasperHome();

  approveConnector({
    jasperHome,
    connectorId: "calendar",
  });
  activateConnector({
    jasperHome,
    connectorId: "calendar",
  });

  const status = getJasperAppStatus({ jasperHome });
  const plan = createCapabilityBroker({ jasperHome }).inspectRequest(
    "check my calendar tomorrow",
  );

  assert.equal(status.status, "ready");
  assert.equal(status.connectors[0].status, "ready");
  assert.equal(status.connectors[0].runtimeStatus, "active");
  assert.equal(plan.internalPlan.primaryProvider.status, "available");
  assert.match(plan.internalPlan.primaryProvider.reason, /active and ready/i);
});

test("deactivating a connector returns matching requests to approved-not-active", () => {
  const jasperHome = createJasperHome();
  const broker = createCapabilityBroker({ jasperHome });
  broker.acquireRequest("check my calendar tomorrow", {
    source: { kind: "test" },
  });

  approveConnector({
    jasperHome,
    connectorId: "calendar",
  });
  activateConnector({
    jasperHome,
    connectorId: "calendar",
  });
  deactivateConnector({
    jasperHome,
    connectorId: "calendar",
  });

  const status = getJasperAppStatus({ jasperHome });
  const updatedPlan = createCapabilityBroker({ jasperHome }).inspectRequest(
    "check my calendar tomorrow",
  );

  assert.equal(status.status, "needs_attention");
  assert.equal(status.connectors[0].id, "calendar");
  assert.equal(status.connectors[0].status, "approved_not_active");
  assert.equal(status.connectors[0].consentStatus, "approved");
  assert.equal(status.connectors[0].runtimeStatus, "inactive");
  assert.equal(updatedPlan.internalPlan.primaryProvider.status, "activation_required");
});

test("revoking a connector returns matching requests to consent-required", () => {
  const jasperHome = createJasperHome();
  const broker = createCapabilityBroker({ jasperHome });
  broker.acquireRequest("check my calendar tomorrow", {
    source: { kind: "test" },
  });

  approveConnector({
    jasperHome,
    connectorId: "calendar",
  });
  activateConnector({
    jasperHome,
    connectorId: "calendar",
  });
  revokeConnector({
    jasperHome,
    connectorId: "calendar",
  });

  const status = getJasperAppStatus({ jasperHome });
  const updatedPlan = createCapabilityBroker({ jasperHome }).inspectRequest(
    "check my calendar tomorrow",
  );

  assert.equal(status.status, "needs_attention");
  assert.equal(status.connectors[0].id, "calendar");
  assert.equal(status.connectors[0].status, "consent_required");
  assert.equal(status.connectors[0].consentStatus, "revoked");
  assert.equal(status.connectors[0].runtimeStatus, "inactive");
  assert.equal(updatedPlan.internalPlan.primaryProvider.status, "consent_required");
});

test("doctor status includes app remediation when connectors are pending", () => {
  const merged = mergeDoctorStatus(
    {
      status: "ready",
      warnings: [],
      nextSteps: [],
    },
    {
      status: "needs_attention",
      warnings: ["1 connector request is waiting on consent or setup."],
      nextSteps: ["Run `jasper apps` to review blocked connector requests."],
      connectors: [
        {
          id: "calendar",
          status: "consent_required",
        },
      ],
    },
  );

  assert.equal(merged.status, "needs_attention");
  assert.equal(merged.apps.connectors.length, 1);
  assert.match(merged.warnings[0], /connector request/i);
  assert.match(merged.nextSteps[0], /jasper apps/i);
});

test("apps-status tool exposes pending connector requests", async () => {
  const jasperHome = createJasperHome();
  const broker = createCapabilityBroker({ jasperHome });
  broker.acquireRequest("check my calendar tomorrow", {
    source: { kind: "test" },
  });

  const tool = createAppsStatusTool({ jasperHome });
  const output = await tool.run();

  assert.equal(output.status, "needs_attention");
  assert.equal(output.connectors[0].id, "calendar");
});
