import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function defaultJasperHome(options = {}) {
  return path.resolve(
    options.jasperHome ||
      process.env.JASPER_HOME ||
      path.join(os.homedir(), ".jasper"),
  );
}

export function ensureJasperHomeLayout(options = {}) {
  const root = defaultJasperHome(options);
  const configDir = path.join(root, "config");
  const dataDir = path.join(root, "data");
  const memoryDir = path.join(dataDir, "memory");
  const qdrantDir = path.join(dataDir, "qdrant");
  const qdrantStorageDir = path.join(qdrantDir, "storage");

  for (const dir of [
    root,
    configDir,
    dataDir,
    memoryDir,
    qdrantDir,
    qdrantStorageDir,
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return {
    root,
    configDir,
    dataDir,
    memoryDir,
    qdrantDir,
    qdrantStorageDir,
  };
}

export function defaultIdentityConfigPath(options = {}) {
  return path.join(ensureJasperHomeLayout(options).configDir, "identity.yaml");
}

export function defaultManifestoConfigPath(options = {}) {
  return path.join(
    ensureJasperHomeLayout(options).configDir,
    "companion-manifesto.yaml",
  );
}

export function defaultRuntimeConfigPath(options = {}) {
  return path.join(ensureJasperHomeLayout(options).configDir, "runtime.json");
}
