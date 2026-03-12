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

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const stderr = String(result.stderr || "").trim();
    const stdout = String(result.stdout || "").trim();
    throw new Error(
      stderr || stdout || `${command} exited with status ${result.status}`,
    );
  }

  return String(result.stdout || "").trim();
}

function copyFileIfMissing(sourcePath, destinationPath) {
  if (!fs.existsSync(destinationPath)) {
    fs.copyFileSync(sourcePath, destinationPath);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function dockerExists() {
  const result = spawnSync("docker", ["--version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return result.status === 0;
}

function inspectDockerContainer(containerName) {
  const result = spawnSync(
    "docker",
    ["inspect", containerName, "--format", "{{json .State}}"],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  if (result.status !== 0) {
    return null;
  }

  try {
    return JSON.parse(String(result.stdout || "").trim());
  } catch {
    return null;
  }
}

async function ensureDockerQdrant(options = {}) {
  if (!dockerExists()) {
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
  const state = inspectDockerContainer(containerName);
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
    ]);
    action = "created";
  } else if (!state.Running) {
    runCommand("docker", ["start", containerName]);
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
  }

  return ensureDockerQdrant({
    storagePath: layout.qdrantStorageDir,
    containerName: options.qdrantContainerName,
    image: options.qdrantImage,
    url: options.qdrantProvisionUrl,
    port: options.qdrantPort,
    grpcPort: options.qdrantGrpcPort,
  });
}

function writeRuntimeConfig(filePath, config) {
  fs.writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
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
  copyFileIfMissing(bundledIdentityPath(), identityPath);
  copyFileIfMissing(bundledManifestoPath(), manifestoPath);

  const qdrant = await resolveQdrantConfig(layout, options);
  const qdrantCollection =
    qdrant.enabled && qdrant.url
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
  const runtimeConfigPath = defaultRuntimeConfigPath({
    jasperHome: layout.root,
  });

  const runtimeConfig = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    jasperHome: layout.root,
    identityPath,
    manifestoPath,
    memoryRoot: layout.memoryDir,
    services: {
      qdrant: qdrantCollection
        ? {
            ...qdrant,
            collection: qdrantCollection,
          }
        : qdrant,
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
  };

  writeRuntimeConfig(runtimeConfigPath, runtimeConfig);

  return {
    status: "ready",
    runtimeConfigPath,
    config: runtimeConfig,
  };
}

export async function getJasperSetupStatus(options = {}) {
  const layout = ensureJasperHomeLayout({ jasperHome: options.jasperHome });
  const identityPath = defaultIdentityConfigPath({ jasperHome: layout.root });
  const manifestoPath = defaultManifestoConfigPath({ jasperHome: layout.root });
  const runtimeConfigPath = defaultRuntimeConfigPath({
    jasperHome: layout.root,
  });
  const runtimeConfig = readRuntimeConfig({ jasperHome: layout.root });

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

  return {
    jasperHome: layout.root,
    identityPath,
    identityExists: fs.existsSync(identityPath),
    manifestoPath,
    manifestoExists: fs.existsSync(manifestoPath),
    runtimeConfigPath,
    runtimeConfigExists: fs.existsSync(runtimeConfigPath),
    memoryRoot: layout.memoryDir,
    qdrant,
    onboarding: runtimeConfig?.onboarding || {
      openaiAuth: { status: "pending", mode: "manual" },
      connectors: { status: "pending", mode: "manual" },
    },
  };
}
