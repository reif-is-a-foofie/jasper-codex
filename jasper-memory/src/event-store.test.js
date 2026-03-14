import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createEventStore } from "./event-store.js";

test("event store honors jasperHome when no explicit root is provided", () => {
  const jasperHome = fs.mkdtempSync(path.join(os.tmpdir(), "jasper-home-store-"));
  const store = createEventStore({ jasperHome });

  store.appendEvent({
    type: "tooling.acquire.pending",
    payload: {
      summary: "Jasper is waiting for connector consent.",
    },
  });

  assert.match(store.root, new RegExp(`${path.basename(jasperHome)}`));
  assert.ok(
    fs.existsSync(path.join(jasperHome, "data", "memory", "data", "events", "events.jsonl")),
  );
});
