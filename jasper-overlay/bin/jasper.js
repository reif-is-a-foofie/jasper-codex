#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const overlayRoot = path.resolve(__dirname, "..");

function expandHome(inputPath) {
  if (!inputPath) {
    return inputPath;
  }
  if (inputPath.startsWith("~/")) {
    return path.join(os.homedir(), inputPath.slice(2));
  }
  return inputPath;
}

function readTextIfExists(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8").trim();
  } catch {
    return "";
  }
}

function readJsonIfExists(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function dedupe(values) {
  return [...new Set(values.filter(Boolean))];
}

function loadOverlayConfig() {
  const repoConfigPath = path.join(overlayRoot, "config.json");
  const userConfigPath = path.join(os.homedir(), ".jasper", "config.json");

  const repoConfig = readJsonIfExists(repoConfigPath, {});
  const userConfig = readJsonIfExists(userConfigPath, {});

  return {
    codexBin:
      process.env.JASPER_CODEX_BIN ||
      userConfig.codexBin ||
      repoConfig.codexBin ||
      "codex",
    enabledExtensions: dedupe([
      ...(repoConfig.enabledExtensions || []),
      ...(userConfig.enabledExtensions || []),
    ]),
    extensionPaths: dedupe([
      path.join(overlayRoot, "extensions"),
      ...((repoConfig.extensionPaths || []).map(expandHome)),
      ...((userConfig.extensionPaths || []).map(expandHome)),
      path.join(os.homedir(), ".jasper", "extensions"),
    ]),
  };
}

function findExtensionRoot(id, roots) {
  for (const root of roots) {
    const extRoot = path.join(root, id);
    if (fs.existsSync(path.join(extRoot, "manifest.json"))) {
      return extRoot;
    }
  }
  return null;
}

function loadExtensions(config) {
  const sections = [];
  const env = {};

  for (const id of config.enabledExtensions) {
    const extRoot = findExtensionRoot(id, config.extensionPaths);
    if (!extRoot) {
      continue;
    }

    const manifest = readJsonIfExists(path.join(extRoot, "manifest.json"), null);
    if (!manifest || !Array.isArray(manifest.instructions)) {
      continue;
    }

    const promptChunks = manifest.instructions
      .map((relPath) => readTextIfExists(path.join(extRoot, relPath)))
      .filter(Boolean);

    if (promptChunks.length > 0) {
      const title = manifest.name || manifest.id || id;
      sections.push(`## Extension: ${title}\n${promptChunks.join("\n\n")}`);
    }

    if (manifest.env && typeof manifest.env === "object") {
      Object.assign(env, manifest.env);
    }
  }

  return { sections, env };
}

function buildStartupPrompt(config) {
  if (process.env.JASPER_START_PROMPT !== undefined) {
    return process.env.JASPER_START_PROMPT;
  }

  const baseProfile = readTextIfExists(path.join(overlayRoot, "profiles", "default.md"));
  const userProfile = readTextIfExists(path.join(os.homedir(), ".jasper", "profile.md"));
  const { sections } = loadExtensions(config);

  return [baseProfile, userProfile, ...sections].filter(Boolean).join("\n\n");
}

function isCodexSubcommand(arg) {
  const commands = new Set([
    "exec",
    "review",
    "login",
    "logout",
    "mcp",
    "mcp-server",
    "app-server",
    "app",
    "completion",
    "sandbox",
    "debug",
    "apply",
    "resume",
    "fork",
    "cloud",
    "features",
    "help",
  ]);
  return commands.has(arg);
}

function main() {
  const config = loadOverlayConfig();
  const { env: extEnv } = loadExtensions(config);
  const argv = process.argv.slice(2);

  const passthroughEnv = { ...process.env };
  for (const [key, value] of Object.entries(extEnv)) {
    if (passthroughEnv[key] === undefined) {
      passthroughEnv[key] = String(value);
    }
  }

  const args = [...argv];
  const hasArgs = args.length > 0;
  const first = args[0] || "";
  const shouldInjectPrompt = !hasArgs;

  if (shouldInjectPrompt) {
    const startupPrompt = buildStartupPrompt(config);
    if (startupPrompt) {
      args.push(startupPrompt);
    }
  } else if (!first.startsWith("-") && !isCodexSubcommand(first)) {
    // Plain prompt mode (`jasper "..."`) remains a direct pass-through.
  }

  const child = spawn(config.codexBin, args, {
    stdio: "inherit",
    env: passthroughEnv,
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });

  child.on("error", (err) => {
    console.error(`jasper launcher error: ${err.message}`);
    process.exit(127);
  });
}

main();
