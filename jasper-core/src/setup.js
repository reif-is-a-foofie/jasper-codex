import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { bundledIdentityPath } from "./identity.js";
import { defaultIdentityConfigPath } from "./home.js";
import { defaultManifestoConfigPath } from "./home.js";
import { defaultRuntimeConfigPath } from "./home.js";
import { ensureJasperHomeLayout } from "./home.js";
import { bundledManifestoPath } from "./manifesto.js";
import { createQdrantMemoryIndex } from "../../jasper-memory/src/qdrant.js";
import { DEFAULT_QDRANT_COLLECTION_NAME } from "../../jasper-memory/src/qdrant.js";
import { DEFAULT_QDRANT_DISTANCE } from "../../jasper-memory/src/qdrant.js";

const DEFAULT_QDRANT_URL = "http://127.0.0.1:6333";
const DEFAULT_QDRANT_IMAGE = "qdrant/qdrant:latest";
const DEFAULT_QDRANT_CONTAINER = "jasper-qdrant";
const DEFAULT_QDRANT_PORT = 6333;
const DEFAULT_QDRANT_GRPC_PORT = 6334;
const DEFAULT_EMBEDDING_DIMENSION = 64;
const DEFAULT_OPENAI_API_KEY_ENV = "OPENAI_API_KEY";

function runProcess(command, args, options = {}) {
  const result = (options.processRunner || spawnSync)(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });

  return {
    status: result.status ?? null,
    stdout: String(result.stdout || ""),
    stderr: String(result.stderr || ""),
    error: result.error || null,
  };
}

function runCommand(command, args, options = {}) {
  const result = runProcess(command, args, options);
  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const stderr = result.stderr.trim();
    const stdout = result.stdout.trim();
    throw new Error(
      stderr || stdout || `${command} exited with status ${result.status}`,
    );
  }

  return result.stdout.trim();
}

function copyFileIfMissing(sourcePath, destinationPath) {
  if (!fs.existsSync(destinationPath)) {
    fs.copyFileSync(sourcePath, destinationPath);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseJsonValue(value, fallback) {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function commandOutput(result) {
  return `${result.stdout}\n${result.stderr}`.trim();
}

async function waitForHttpReady(url, options = {}) {
  const timeoutMs = Math.max(1_000, Number(options.timeoutMs ?? 30_000));
  const deadline = Date.now() + timeoutMs;
  let lastError = "Qdrant did not respond";

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { method: "GET" });
      if (response.ok) {
        return {
          ok: true,
          status: response.status,
          url,
        };
      }
      lastError = `Qdrant returned HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await sleep(1_000);
  }

  throw new Error(`Timed out waiting for Qdrant at ${url}: ${lastError}`);
}

function dockerExists(options = {}) {
  const result = runProcess("docker", ["--version"], options);
  return result.status === 0;
}

function inspectDockerContainer(containerName, options = {}) {
  const result = runProcess("docker", [
    "inspect",
    containerName,
    "--format",
    "{{json .State}}",
  ], options);

  if (result.status !== 0) {
    return null;
  }

  try {
    return JSON.parse(result.stdout.trim());
  } catch {
    return null;
  }
}

async function ensureDockerQdrant(options = {}) {
  if (!dockerExists(options)) {
    throw new Error(
      "Docker is only the current developer fallback for Qdrant provisioning. Jasper's packaged app should manage local services internally. For now, install Docker, use --qdrant-url, or rerun with --skip-qdrant.",
    );
  }

  const containerName = String(
    options.containerName || DEFAULT_QDRANT_CONTAINER,
  );
  const image = String(options.image || DEFAULT_QDRANT_IMAGE);
  const url = String(options.url || DEFAULT_QDRANT_URL);
  const port = Number(options.port ?? DEFAULT_QDRANT_PORT);
  const grpcPort = Number(options.grpcPort ?? DEFAULT_QDRANT_GRPC_PORT);
  const storagePath = path.resolve(options.storagePath);

  let action = "reused";
  const state = inspectDockerContainer(containerName, options);
  if (!state) {
    runCommand("docker", [
      "run",
      "-d",
      "--name",
      containerName,
      "-p",
      `${port}:6333`,
      "-p",
      `${grpcPort}:6334`,
      "-v",
      `${storagePath}:/qdrant/storage`,
      image,
    ], options);
    action = "created";
  } else if (!state.Running) {
    runCommand("docker", ["start", containerName], options);
    action = "started";
  }

  const health = await waitForHttpReady(url);
  return {
    enabled: true,
    mode: "docker",
    action,
    status: "ready",
    url,
    image,
    containerName,
    port,
    grpcPort,
    storagePath,
    health,
  };
}

async function resolveQdrantConfig(layout, options = {}) {
  if (options.skipQdrant) {
    return {
      enabled: false,
      mode: "skipped",
      status: "skipped",
      reason: "setup invoked with --skip-qdrant",
    };
  }

  if (options.qdrantUrl) {
    const url = String(options.qdrantUrl);
    try {
      const health = await waitForHttpReady(url, {
        timeoutMs: options.qdrantTimeoutMs,
      });
      return {
        enabled: true,
        mode: "external",
        action: "connected",
        status: "ready",
        url,
        health,
      };
    } catch (error) {
      return {
        enabled: true,
        mode: "external",
        action: "configured",
        status: "unreachable",
        url,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  try {
    return await ensureDockerQdrant({
      storagePath: layout.qdrantStorageDir,
      containerName: options.qdrantContainerName,
      image: options.qdrantImage,
      url: options.qdrantProvisionUrl,
      port: options.qdrantPort,
      grpcPort: options.qdrantGrpcPort,
      processRunner: options.processRunner,
    });
  } catch (error) {
    return {
      enabled: false,
      mode: "docker",
      status: "missing",
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

function writeRuntimeConfig(filePath, config) {
  fs.writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function looksLikeFilePath(command) {
  return (
    path.isAbsolute(command) ||
    command.includes(path.sep) ||
    (path.sep !== "/" && command.includes("/"))
  );
}

function resolveConfiguredCodex(options = {}, runtimeConfig = null) {
  const env = options.env || process.env;
  const runtimeCodex = runtimeConfig?.runtime?.codex || null;
  const preferStoredRuntime = options.preferStoredRuntime !== false;
  const command =
    options.codexCommand ||
    (preferStoredRuntime
      ? runtimeCodex?.command || env.JASPER_SETUP_CODEX_COMMAND
      : env.JASPER_SETUP_CODEX_COMMAND || runtimeCodex?.command) ||
    null;

  if (!command) {
    return null;
  }

  const args = Array.isArray(options.codexArgs)
    ? [...options.codexArgs]
    : preferStoredRuntime
      ? Array.isArray(runtimeCodex?.args)
        ? [...runtimeCodex.args]
        : parseJsonValue(env.JASPER_SETUP_CODEX_ARGS_JSON, [])
      : parseJsonValue(
          env.JASPER_SETUP_CODEX_ARGS_JSON,
          Array.isArray(runtimeCodex?.args) ? [...runtimeCodex.args] : [],
        );
  const extraEnv = {
    ...(preferStoredRuntime
      ? runtimeCodex?.env && typeof runtimeCodex.env === "object"
        ? runtimeCodex.env
        : parseJsonValue(env.JASPER_SETUP_CODEX_ENV_JSON, {})
      : parseJsonValue(
          env.JASPER_SETUP_CODEX_ENV_JSON,
          runtimeCodex?.env && typeof runtimeCodex.env === "object"
            ? runtimeCodex.env
            : {},
        )),
    ...(options.codexEnv && typeof options.codexEnv === "object"
      ? options.codexEnv
      : {}),
  };

  return {
    command,
    args,
    env: {
      ...env,
      ...extraEnv,
    },
    extraEnv,
    source:
      options.codexSource ||
      (preferStoredRuntime
        ? runtimeCodex?.source || env.JASPER_SETUP_CODEX_SOURCE
        : env.JASPER_SETUP_CODEX_SOURCE || runtimeCodex?.source) ||
      "launcher",
  };
}

function describeCodexRuntime(codex) {
  if (!codex) {
    return {
      configured: false,
      status: "missing",
      reason:
        "Jasper could not resolve a Codex runtime command for launch or web research.",
    };
  }

  if (looksLikeFilePath(codex.command) && !fs.existsSync(codex.command)) {
    return {
      configured: true,
      status: "missing",
      command: codex.command,
      args: codex.args,
      env: codex.extraEnv,
      source: codex.source,
      reason: `Configured Codex command does not exist: ${codex.command}`,
    };
  }

  return {
    configured: true,
    status: "ready",
    command: codex.command,
    args: codex.args,
    env: codex.extraEnv,
    source: codex.source,
  };
}

function detectAuthMode(text) {
  if (/api key/i.test(text)) {
    return "api_key";
  }
  if (/chatgpt/i.test(text)) {
    return "chatgpt";
  }
  return "unknown";
}

function probeOpenAiAuth(codex, options = {}) {
  if (!codex) {
    return {
      status: "pending",
      mode: "manual",
      detail:
        "Jasper could not validate OpenAI auth because no Codex runtime command was available.",
    };
  }

  const runtime = describeCodexRuntime(codex);
  if (runtime.status !== "ready") {
    return {
      status: "pending",
      mode: "manual",
      detail: runtime.reason,
    };
  }

  const result = runProcess(codex.command, [...codex.args, "login", "status"], {
    env: codex.env,
    processRunner: options.processRunner,
  });
  const output = commandOutput(result);

  if (result.error) {
    return {
      status: "failed",
      mode: "manual",
      detail: result.error.message,
    };
  }

  if (result.status === 0) {
    return {
      status: "ready",
      mode: detectAuthMode(output),
      detail: output || "Codex auth is configured.",
    };
  }

  if (/not logged in/i.test(output)) {
    return {
      status: "pending",
      mode: "manual",
      detail: "Codex is not logged in yet.",
    };
  }

  return {
    status: "failed",
    mode: "manual",
    detail:
      output ||
      `Codex auth check exited with status ${result.status ?? "unknown"}.`,
  };
}

function parseJsonLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function validateAuthWithExecProbe(codex, authStatus, options = {}) {
  if (!codex || authStatus.status !== "ready") {
    return authStatus;
  }

  const result = runProcess(
    codex.command,
    [
      ...codex.args,
      "exec",
      "--json",
      "--ephemeral",
      "--skip-git-repo-check",
      "Reply with exactly OK.",
    ],
    {
      env: codex.env,
      processRunner: options.processRunner,
    },
  );
  if (result.error) {
    return {
      status: "failed",
      mode: authStatus.mode,
      detail: result.error.message,
    };
  }

  const events = parseJsonLines(commandOutput(result));
  const sawCompleted = events.some((event) => event.type === "turn.completed");
  const failedEvent = events.find(
    (event) => event.type === "turn.failed" || event.type === "error",
  );
  if (sawCompleted && !failedEvent) {
    return {
      ...authStatus,
      validated: true,
      validation: "exec",
      detail: `${authStatus.detail} Validated with a live Codex exec turn.`,
    };
  }

  if (failedEvent?.type === "turn.failed" && failedEvent.error?.message) {
    return {
      status: "failed",
      mode: authStatus.mode,
      detail: failedEvent.error.message,
    };
  }

  if (failedEvent?.type === "error" && failedEvent.message) {
    return {
      status: "failed",
      mode: authStatus.mode,
      detail: failedEvent.message,
    };
  }

  return {
    status: "failed",
    mode: authStatus.mode,
    detail:
      commandOutput(result) ||
      "Codex exec auth validation did not complete successfully.",
  };
}

function resolveApiKey(options = {}) {
  if (typeof options.openAiApiKey === "string" && options.openAiApiKey.trim()) {
    return options.openAiApiKey.trim();
  }

  const env = options.env || process.env;
  const envName = String(
    options.openAiApiKeyEnv ||
      env.JASPER_OPENAI_API_KEY_ENV ||
      DEFAULT_OPENAI_API_KEY_ENV,
  ).trim();

  return typeof env[envName] === "string" ? env[envName].trim() : "";
}

function loginWithApiKey(codex, apiKey, options = {}) {
  const result = runProcess(
    codex.command,
    [...codex.args, "login", "--with-api-key"],
    {
      env: codex.env,
      input: `${apiKey}\n`,
      processRunner: options.processRunner,
    },
  );

  if (result.error) {
    return {
      ok: false,
      detail: result.error.message,
    };
  }

  if (result.status === 0) {
    return {
      ok: true,
      detail: commandOutput(result) || "Successfully logged in with an API key.",
    };
  }

  return {
    ok: false,
    detail:
      commandOutput(result) ||
      `Codex API-key login exited with status ${result.status ?? "unknown"}.`,
  };
}

function shouldUseDeviceAuth(options = {}) {
  if (options.deviceAuth === true) {
    return true;
  }
  if (options.deviceAuth === false) {
    return false;
  }

  const env = options.env || process.env;
  if (["1", "true", "yes", "on"].includes(String(env.JASPER_SETUP_DEVICE_AUTH || "").toLowerCase())) {
    return true;
  }

  const hasDesktopDisplay = Boolean(env.DISPLAY || env.WAYLAND_DISPLAY || env.TERM_PROGRAM);
  return Boolean(env.SSH_TTY) && !hasDesktopDisplay;
}

function runInteractiveLogin(codex, options = {}) {
  const loginArgs = [
    ...codex.args,
    "login",
    ...(shouldUseDeviceAuth(options) ? ["--device-auth"] : []),
  ];
  const result = runProcess(codex.command, loginArgs, {
    env: codex.env,
    stdio: "inherit",
    processRunner: options.processRunner,
  });

  if (result.error) {
    return {
      ok: false,
      detail: result.error.message,
    };
  }

  if (result.status === 0) {
    return {
      ok: true,
      detail: "Interactive Codex login completed.",
    };
  }

  return {
    ok: false,
    detail: `Interactive Codex login exited with status ${result.status ?? "unknown"}.`,
  };
}

async function ensureOpenAiAuth(codex, options = {}) {
  const current = probeOpenAiAuth(codex, options);
  if (current.status === "ready") {
    return validateAuthWithExecProbe(codex, current, options);
  }

  if (options.skipAuth) {
    return {
      ...current,
      detail: "OpenAI auth validation was skipped for this setup run.",
    };
  }

  const apiKey = resolveApiKey(options);
  if (apiKey) {
    const login = loginWithApiKey(codex, apiKey, options);
    if (!login.ok) {
      return {
        status: "failed",
        mode: "api_key",
        detail: login.detail,
      };
    }

    return validateAuthWithExecProbe(
      codex,
      probeOpenAiAuth(codex, options),
      options,
    );
  }

  if (!(process.stdin.isTTY && process.stdout.isTTY)) {
    return {
      status: "pending",
      mode: "manual",
      detail:
        "OpenAI auth still needs setup. Rerun `jasper setup` interactively or provide OPENAI_API_KEY before setup.",
    };
  }

  const login = runInteractiveLogin(codex, options);
  if (!login.ok) {
    return {
      status: "failed",
      mode: "manual",
      detail: login.detail,
    };
  }

  return validateAuthWithExecProbe(
    codex,
    probeOpenAiAuth(codex, options),
    options,
  );
}

function defaultConnectorOnboarding(runtimeConfig) {
  return (
    runtimeConfig?.onboarding?.connectors || {
      status: "pending",
      mode: "manual",
    }
  );
}

function attachHealthSummary(snapshot) {
  const warnings = [];
  const nextSteps = [];

  if (!snapshot.identityExists) {
    nextSteps.push("Run `jasper setup` to install Jasper's default identity config.");
  }
  if (!snapshot.manifestoExists) {
    nextSteps.push("Run `jasper setup` to install Jasper's companion manifesto.");
  }
  if (!snapshot.runtimeConfigExists) {
    nextSteps.push("Run `jasper setup` to generate Jasper runtime configuration.");
  }
  if (snapshot.codex.status !== "ready") {
    nextSteps.push(
      "Install or bundle a Codex runtime so Jasper can launch reliably and use first-party web research.",
    );
  }
  if (snapshot.qdrant.status === "unreachable") {
    nextSteps.push(
      "Repair local Qdrant provisioning or point Jasper at a reachable Qdrant instance.",
    );
  }
  if (snapshot.qdrant.status === "missing" && snapshot.qdrant.reason) {
    nextSteps.push(
      "Rerun `jasper setup --skip-qdrant`, provide `--qdrant-url`, or install Docker for the current developer fallback.",
    );
  }
  if (snapshot.onboarding.openaiAuth.status !== "ready") {
    nextSteps.push(
      "Complete OpenAI auth during `jasper setup`, or provide OPENAI_API_KEY before rerunning setup.",
    );
  }
  if (snapshot.qdrant.status === "skipped") {
    warnings.push(
      "Qdrant provisioning was skipped, so Jasper will run without a ready local semantic index.",
    );
  }
  if (snapshot.qdrant.status === "missing") {
    warnings.push(
      snapshot.qdrant.reason ||
        "Qdrant is not configured yet. Jasper can still start, but semantic indexing will stay incomplete.",
    );
  }

  return {
    ...snapshot,
    status: nextSteps.length === 0 ? "ready" : "needs_attention",
    warnings,
    nextSteps,
  };
}

export function readRuntimeConfig(options = {}) {
  const runtimeConfigPath = defaultRuntimeConfigPath(options);
  if (!fs.existsSync(runtimeConfigPath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(runtimeConfigPath, "utf8"));
}

export async function setupJasper(options = {}) {
  const layout = ensureJasperHomeLayout({ jasperHome: options.jasperHome });
  const identityPath = defaultIdentityConfigPath({ jasperHome: layout.root });
  const manifestoPath = defaultManifestoConfigPath({ jasperHome: layout.root });
  const existingRuntimeConfig = readRuntimeConfig({ jasperHome: layout.root });
  copyFileIfMissing(bundledIdentityPath(), identityPath);
  copyFileIfMissing(bundledManifestoPath(), manifestoPath);

  const qdrant = await resolveQdrantConfig(layout, options);
  const qdrantCollection =
    qdrant.status === "ready" && qdrant.enabled && qdrant.url
      ? await createQdrantMemoryIndex({
          url: qdrant.url,
          collectionName: DEFAULT_QDRANT_COLLECTION_NAME,
          embeddingDimension: DEFAULT_EMBEDDING_DIMENSION,
          distance: DEFAULT_QDRANT_DISTANCE,
          syncStatePath: path.join(
            layout.memoryDir,
            "data",
            "embeddings",
            "qdrant-sync.json",
          ),
        }).ensureCollection()
      : null;

  const configuredCodex = resolveConfiguredCodex(
    { ...options, preferStoredRuntime: false },
    existingRuntimeConfig,
  );
  const codex = describeCodexRuntime(configuredCodex);
  const openaiAuth = await ensureOpenAiAuth(configuredCodex, options);
  const runtimeConfigPath = defaultRuntimeConfigPath({
    jasperHome: layout.root,
  });

  const runtimeConfig = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    jasperHome: layout.root,
    identityPath,
    manifestoPath,
    memoryRoot: layout.memoryDir,
    runtime: {
      codex,
    },
    services: {
      qdrant: qdrantCollection
        ? {
            ...qdrant,
            collection: qdrantCollection,
          }
        : qdrant,
    },
    onboarding: {
      openaiAuth,
      connectors: defaultConnectorOnboarding(existingRuntimeConfig),
    },
  };

  writeRuntimeConfig(runtimeConfigPath, runtimeConfig);
  return getJasperSetupStatus({
    ...options,
    jasperHome: layout.root,
    runtimeConfigOverride: runtimeConfig,
  });
}

export async function getJasperSetupStatus(options = {}) {
  const layout = ensureJasperHomeLayout({ jasperHome: options.jasperHome });
  const identityPath = defaultIdentityConfigPath({ jasperHome: layout.root });
  const manifestoPath = defaultManifestoConfigPath({ jasperHome: layout.root });
  const runtimeConfigPath = defaultRuntimeConfigPath({
    jasperHome: layout.root,
  });
  const runtimeConfig =
    options.runtimeConfigOverride || readRuntimeConfig({ jasperHome: layout.root });
  const configuredCodex = resolveConfiguredCodex(
    { ...options, preferStoredRuntime: true },
    runtimeConfig,
  );

  let qdrant = {
    configured: false,
    status: "missing",
  };

  if (
    runtimeConfig?.services?.qdrant?.enabled &&
    runtimeConfig.services.qdrant.url
  ) {
    try {
      const health = await waitForHttpReady(runtimeConfig.services.qdrant.url, {
        timeoutMs: 3_000,
      });
      qdrant = {
        configured: true,
        status: "ready",
        mode: runtimeConfig.services.qdrant.mode,
        url: runtimeConfig.services.qdrant.url,
        collection: runtimeConfig.services.qdrant.collection || null,
        health,
      };
    } catch (error) {
      qdrant = {
        configured: true,
        status: "unreachable",
        mode: runtimeConfig.services.qdrant.mode,
        url: runtimeConfig.services.qdrant.url,
        collection: runtimeConfig.services.qdrant.collection || null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  } else if (runtimeConfig?.services?.qdrant) {
    qdrant = {
      configured: false,
      ...runtimeConfig.services.qdrant,
    };
  }

  const storedOnboarding = runtimeConfig?.onboarding || {};
  let openaiAuth = storedOnboarding.openaiAuth || {
    status: "pending",
    mode: "manual",
  };

  if (configuredCodex && describeCodexRuntime(configuredCodex).status === "ready") {
    openaiAuth = options.validateAuth
      ? validateAuthWithExecProbe(
          configuredCodex,
          probeOpenAiAuth(configuredCodex, options),
          options,
        )
      : openaiAuth;
  }

  return attachHealthSummary({
    jasperHome: layout.root,
    identityPath,
    identityExists: fs.existsSync(identityPath),
    manifestoPath,
    manifestoExists: fs.existsSync(manifestoPath),
    runtimeConfigPath,
    runtimeConfigExists: fs.existsSync(runtimeConfigPath),
    memoryRoot: layout.memoryDir,
    runtimeConfigSchemaVersion: runtimeConfig?.schemaVersion || null,
    codex:
      runtimeConfig?.runtime?.codex && !configuredCodex
        ? runtimeConfig.runtime.codex
        : describeCodexRuntime(configuredCodex),
    qdrant,
    onboarding: {
      openaiAuth,
      connectors: storedOnboarding.connectors || {
        status: "pending",
        mode: "manual",
      },
    },
  });
}
