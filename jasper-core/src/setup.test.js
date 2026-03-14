import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getJasperSetupStatus } from "./setup.js";
import { readRuntimeConfig } from "./setup.js";
import { setupJasper } from "./setup.js";
import { defaultRuntimeConfigPath } from "./home.js";

function createJasperHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "jasper-setup-"));
}

test("setup records Codex runtime details and surfaces skipped auth as follow-up work", async () => {
  const jasperHome = createJasperHome();
  const processRunner = (_command, args) => {
    if (args.at(-2) === "login" && args.at(-1) === "status") {
      return {
        status: 1,
        stdout: "",
        stderr: "Not logged in",
      };
    }

    throw new Error(`Unexpected command: ${args.join(" ")}`);
  };

  const result = await setupJasper({
    jasperHome,
    skipQdrant: true,
    skipAuth: true,
    codexCommand: "/bin/echo",
    codexArgs: ["codex"],
    codexEnv: { EXAMPLE_ENV: "1" },
    codexSource: "test",
    processRunner,
  });
  const runtimeConfig = readRuntimeConfig({ jasperHome });

  assert.equal(result.codex.status, "ready");
  assert.equal(result.onboarding.openaiAuth.status, "pending");
  assert.equal(result.status, "needs_attention");
  assert.ok(
    result.nextSteps.some((step) => step.includes("Complete OpenAI auth")),
  );
  assert.deepEqual(runtimeConfig.runtime.codex, {
    configured: true,
    status: "ready",
    command: "/bin/echo",
    args: ["codex"],
    env: { EXAMPLE_ENV: "1" },
    source: "test",
  });
});

test("setup can validate auth by logging in with an API key and live exec", async () => {
  const jasperHome = createJasperHome();
  let loggedIn = false;
  const processRunner = (_command, args, options) => {
    if (args.at(-2) === "login" && args.at(-1) === "status") {
      return loggedIn
        ? {
            status: 0,
            stdout: "",
            stderr: "Logged in using an API key - sk-proj-***ABCDE",
          }
        : {
            status: 1,
            stdout: "",
            stderr: "Not logged in",
          };
    }

    if (args.at(-2) === "login" && args.at(-1) === "--with-api-key") {
      assert.equal(options.input, "sk-test-key\n");
      loggedIn = true;
      return {
        status: 0,
        stdout: "",
        stderr: "Successfully logged in",
      };
    }

    if (args.includes("exec") && args.includes("--json")) {
      assert.equal(args.at(-1), "Reply with exactly OK.");
      return {
        status: 0,
        stdout: [
          JSON.stringify({ type: "thread.started", thread_id: "thread-1" }),
          JSON.stringify({ type: "turn.started" }),
          JSON.stringify({
            type: "item.completed",
            item: {
              id: "msg-1",
              type: "agent_message",
              text: "OK",
            },
          }),
          JSON.stringify({
            type: "turn.completed",
            usage: {
              input_tokens: 1,
              cached_input_tokens: 0,
              output_tokens: 1,
            },
          }),
        ].join("\n"),
        stderr: "",
      };
    }

    throw new Error(`Unexpected command: ${args.join(" ")}`);
  };

  const result = await setupJasper({
    jasperHome,
    skipQdrant: true,
    codexCommand: "/bin/echo",
    codexArgs: ["codex"],
    openAiApiKey: "sk-test-key",
    processRunner,
  });
  const doctor = await getJasperSetupStatus({
    jasperHome,
    processRunner,
  });

  assert.equal(result.onboarding.openaiAuth.status, "ready");
  assert.equal(result.onboarding.openaiAuth.mode, "api_key");
  assert.equal(result.onboarding.openaiAuth.validated, true);
  assert.equal(result.status, "ready");
  assert.equal(doctor.onboarding.openaiAuth.status, "ready");
  assert.equal(doctor.status, "ready");
});

test("setup keeps going when docker fallback is unavailable", async () => {
  const jasperHome = createJasperHome();
  const processRunner = (command, args) => {
    if (command === "docker" && args.at(0) === "--version") {
      return {
        status: 1,
        stdout: "",
        stderr: "docker: command not found",
      };
    }

    if (args.at(-2) === "login" && args.at(-1) === "status") {
      return {
        status: 1,
        stdout: "",
        stderr: "Not logged in",
      };
    }

    throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
  };

  const result = await setupJasper({
    jasperHome,
    skipAuth: true,
    codexCommand: "/bin/echo",
    codexArgs: ["codex"],
    processRunner,
  });

  assert.equal(result.runtimeConfigExists, true);
  assert.equal(result.qdrant.status, "missing");
  assert.match(result.qdrant.reason, /Docker is only the current developer fallback/i);
  assert.equal(result.status, "needs_attention");
});

test("doctor honors a stored broken runtime instead of launcher overrides", async () => {
  const jasperHome = createJasperHome();
  const runtimeConfigPath = defaultRuntimeConfigPath({ jasperHome });
  fs.mkdirSync(path.dirname(runtimeConfigPath), { recursive: true });
  fs.writeFileSync(
    runtimeConfigPath,
    `${JSON.stringify(
      {
        schemaVersion: 2,
        generatedAt: new Date().toISOString(),
        jasperHome,
        identityPath: path.join(jasperHome, "config", "identity.yaml"),
        manifestoPath: path.join(jasperHome, "config", "companion-manifesto.yaml"),
        memoryRoot: path.join(jasperHome, "data", "memory"),
        runtime: {
          codex: {
            configured: true,
            status: "ready",
            command: "/definitely/missing/codex",
            args: [],
            env: {},
            source: "runtime_config",
          },
        },
        services: {
          qdrant: {
            enabled: false,
            mode: "skipped",
            status: "skipped",
            reason: "setup invoked with --skip-qdrant",
          },
        },
        onboarding: {
          openaiAuth: {
            status: "pending",
            mode: "manual",
          },
          connectors: {
            status: "pending",
            mode: "manual",
          },
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const doctor = await getJasperSetupStatus({
    jasperHome,
    validateAuth: true,
    env: {
      ...process.env,
      JASPER_SETUP_CODEX_COMMAND: "/bin/echo",
      JASPER_SETUP_CODEX_ARGS_JSON: JSON.stringify(["codex"]),
      JASPER_SETUP_CODEX_ENV_JSON: JSON.stringify({}),
      JASPER_SETUP_CODEX_SOURCE: "launcher",
    },
  });

  assert.equal(doctor.codex.status, "missing");
  assert.equal(doctor.codex.command, "/definitely/missing/codex");
  assert.match(doctor.codex.reason, /does not exist/i);
});
