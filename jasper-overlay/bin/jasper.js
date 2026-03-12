#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { buildStartupMemoryInstructions } from "../../jasper-core/src/startup-memory.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootCandidates = [
  path.resolve(__dirname, "..", ".."),
  path.resolve(__dirname, ".."),
];
const repoRoot =
  rootCandidates.find((candidate) =>
    fs.existsSync(path.join(candidate, "jasper-agent", "src", "cli.js")),
  ) ?? rootCandidates[0];
const agentCliPath = path.join(repoRoot, "jasper-agent", "src", "cli.js");
const localCodexBin = path.join(
  repoRoot,
  "codex-rs",
  "target",
  "debug",
  "codex",
);
const isDevelopmentCheckout =
  fs.existsSync(path.join(repoRoot, ".git")) &&
  fs.existsSync(path.join(repoRoot, "codex-rs", "Cargo.toml"));
const packagedVendorRoots = [
  path.join(repoRoot, "vendor"),
  path.join(repoRoot, "codex-cli", "vendor"),
];
const semanticModelRoot = path.join(
  repoRoot,
  "jasper-core",
  "resources",
  "semantic-models",
);
const semanticRuntimeRoot = path.join(
  repoRoot,
  "jasper-core",
  "resources",
  "semantic-runtime",
);
const codexHome = path.resolve(
  process.env.CODEX_HOME || path.join(process.env.HOME || "", ".codex"),
);

function resolveTargetTriple() {
  const { platform, arch } = process;

  switch (platform) {
    case "linux":
    case "android":
      if (arch === "x64") {
        return "x86_64-unknown-linux-musl";
      }
      if (arch === "arm64") {
        return "aarch64-unknown-linux-musl";
      }
      break;
    case "darwin":
      if (arch === "x64") {
        return "x86_64-apple-darwin";
      }
      if (arch === "arm64") {
        return "aarch64-apple-darwin";
      }
      break;
    case "win32":
      if (arch === "x64") {
        return "x86_64-pc-windows-msvc";
      }
      if (arch === "arm64") {
        return "aarch64-pc-windows-msvc";
      }
      break;
    default:
      break;
  }

  return null;
}

function prependPath(entries, currentPath) {
  const delimiter = process.platform === "win32" ? ";" : ":";
  const existing = (currentPath || "").split(delimiter).filter(Boolean);
  return [...entries, ...existing].join(delimiter);
}

function shouldDisableStartupMcp() {
  const value = String(process.env.JASPER_ENABLE_STARTUP_MCP || "").trim();
  return !["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function resolveSemanticModelDir() {
  if (process.env.JASPER_SEMANTIC_MODEL_DIR) {
    return process.env.JASPER_SEMANTIC_MODEL_DIR;
  }

  return fs.existsSync(semanticModelRoot) ? semanticModelRoot : null;
}

function semanticRuntimeLibraryNames() {
  switch (process.platform) {
    case "darwin":
      return ["libonnxruntime.dylib"];
    case "linux":
    case "android":
      return ["libonnxruntime.so"];
    case "win32":
      return ["onnxruntime.dll"];
    default:
      return [];
  }
}

function resolveSemanticRuntimeLibrary() {
  if (process.env.ORT_DYLIB_PATH && fs.existsSync(process.env.ORT_DYLIB_PATH)) {
    return process.env.ORT_DYLIB_PATH;
  }

  if (
    process.env.JASPER_ORT_DYLIB_PATH &&
    fs.existsSync(process.env.JASPER_ORT_DYLIB_PATH)
  ) {
    return process.env.JASPER_ORT_DYLIB_PATH;
  }

  const runtimeRoot = process.env.JASPER_SEMANTIC_RUNTIME_DIR || semanticRuntimeRoot;
  if (!fs.existsSync(runtimeRoot)) {
    return null;
  }

  const targetTriple = resolveTargetTriple();
  const libraryNames = semanticRuntimeLibraryNames();
  for (const libraryName of libraryNames) {
    const candidates = [
      targetTriple ? path.join(runtimeRoot, targetTriple, libraryName) : null,
      path.join(runtimeRoot, libraryName),
    ].filter(Boolean);

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

function configuredMcpDisableArgs() {
  if (!shouldDisableStartupMcp()) {
    return [];
  }

  const configPath = path.join(codexHome, "config.toml");
  if (!fs.existsSync(configPath)) {
    return [];
  }

  const configText = fs.readFileSync(configPath, "utf8");
  const matches = configText.matchAll(/^\[mcp_servers\.([A-Za-z0-9_-]+)\]\s*$/gm);
  const serverNames = [...new Set([...matches].map((match) => match[1]).filter(Boolean))];

  return serverNames.flatMap((serverName) => [
    "-c",
    `mcp_servers.${serverName}.enabled=false`,
  ]);
}

function commandExists(commandPath) {
  return Boolean(commandPath) && fs.existsSync(commandPath);
}

function findCommandOnPath(commandName) {
  const delimiter = process.platform === "win32" ? ";" : ":";
  const pathEntries = String(process.env.PATH || "")
    .split(delimiter)
    .filter(Boolean);

  const candidateNames =
    process.platform === "win32"
      ? [commandName, `${commandName}.exe`, `${commandName}.cmd`]
      : [commandName];

  for (const entry of pathEntries) {
    for (const candidateName of candidateNames) {
      const candidatePath = path.join(entry, candidateName);
      if (commandExists(candidatePath)) {
        return candidatePath;
      }
    }
  }

  return null;
}

function resolveRustToolchain() {
  const targetTriple = resolveTargetTriple();
  const toolchainCargoCandidates = [
    process.env.JASPER_CARGO_BIN,
    targetTriple
      ? path.join(
          process.env.HOME || "",
          ".rustup",
          "toolchains",
          `stable-${targetTriple}`,
          "bin",
          "cargo",
        )
      : null,
    path.join(
      process.env.HOME || "",
      ".rustup",
      "toolchains",
      "stable-x86_64-apple-darwin",
      "bin",
      "cargo",
    ),
    path.join(
      process.env.HOME || "",
      ".rustup",
      "toolchains",
      "stable-aarch64-apple-darwin",
      "bin",
      "cargo",
    ),
  ].filter(Boolean);

  const toolchainCargoPath = toolchainCargoCandidates.find(commandExists);
  if (toolchainCargoPath) {
    const toolchainBinDir = path.dirname(toolchainCargoPath);
    return {
      cargoPath: toolchainCargoPath,
      binDir: toolchainBinDir,
      env: {
        PATH: prependPath([toolchainBinDir], process.env.PATH),
        RUSTC:
          process.env.JASPER_RUSTC_BIN ||
          path.join(toolchainBinDir, process.platform === "win32" ? "rustc.exe" : "rustc"),
      },
    };
  }

  return null;
}

function resolveRustupCargoCommand() {
  const toolchain = resolveRustToolchain();
  if (toolchain) {
    return {
      command: toolchain.cargoPath,
      args: [],
      env: toolchain.env,
    };
  }

  const rustupPath = findCommandOnPath("rustup") || "/usr/local/bin/rustup";
  if (commandExists(rustupPath)) {
    return {
      command: rustupPath,
      args: ["run", "stable", "cargo"],
      env: {},
    };
  }

  return null;
}

function resolvePackagedCodex() {
  const targetTriple = resolveTargetTriple();
  if (!targetTriple) {
    return null;
  }

  const codexBinaryName = process.platform === "win32" ? "codex.exe" : "codex";

  for (const vendorRoot of packagedVendorRoots) {
    const binaryPath = path.join(
      vendorRoot,
      targetTriple,
      "codex",
      codexBinaryName,
    );
    if (!fs.existsSync(binaryPath)) {
      continue;
    }

    const pathDir = path.join(vendorRoot, targetTriple, "path");
    const extraPathEntries = fs.existsSync(pathDir) ? [pathDir] : [];

    return {
      command: binaryPath,
      args: [],
      env: extraPathEntries.length
        ? { PATH: prependPath(extraPathEntries, process.env.PATH) }
        : {},
    };
  }

  return null;
}

function printBanner() {
  if (!process.stdout.isTTY) {
    return;
  }

  const cyan = "\u001b[36m";
  const dim = "\u001b[2m";
  const reset = "\u001b[0m";
  const lines = [
    `${cyan}      _                           ${reset}`,
    `${cyan}     | | __ _ ___ _ __   ___ _ __ ${reset}`,
    `${cyan}  _  | |/ _\` / __| '_ \\/ _ \\ '__|${reset}`,
    `${cyan} | |_| | (_| \\__ \\ |_) |  __/ |   ${reset}`,
    `${cyan}  \\___/ \\__,_|___/ .__/ \\___|_|   ${reset}`,
    `${cyan}                  |_|             ${reset}`,
    `${dim}Welcome, I am Jasper.${reset}`,
    `${dim}Household intelligence for daily operations.${reset}`,
    "",
  ];

  process.stdout.write(`${lines.join("\n")}\n`);
}

function jasperVersion() {
  const packageJsonPath = path.join(repoRoot, "jasper-overlay", "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    return "0.0.0";
  }

  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    return String(packageJson.version || "0.0.0");
  } catch {
    return "0.0.0";
  }
}

function printTopLevelHelp() {
  process.stdout.write(`Jasper CLI

Usage: jasper [OPTIONS] [PROMPT]
       jasper [OPTIONS] <COMMAND> [ARGS]

Commands:
  exec        Run Jasper non-interactively
  review      Run a code review non-interactively
  login       Manage login
  logout      Remove stored authentication credentials
  app         Launch the desktop app flow on macOS
  identity    Show Jasper identity configuration
  memory      Inspect Jasper memory
  tools       Inspect and run Jasper tools
  broker      Inspect Jasper capability routing
  dream       Inspect Jasper reflections
  setup       Prepare Jasper local runtime state
  help        Print this message

Options:
  -h, --help       Print help
  -V, --version    Print version
  -C, --cd <DIR>   Use the specified directory as the working root
  -m, --model      Select the model
  -p, --profile    Select a config profile
  --search         Enable live web search
  --no-alt-screen  Disable alternate screen mode

Jasper forwards Codex-compatible options to the underlying runtime while keeping Jasper branding and startup policy intact.
`);
}

function spawnProcess(command, commandArgs, env) {
  return spawn(command, commandArgs, {
    cwd: repoRoot,
    stdio: "inherit",
    env,
  });
}

function jasperChildEnv(baseEnv) {
  const env = { ...baseEnv };
  const modelDir = resolveSemanticModelDir();
  const runtimeLibrary = resolveSemanticRuntimeLibrary();
  const rustToolchain = isDevelopmentCheckout ? resolveRustToolchain() : null;

  if (modelDir) {
    env.JASPER_SEMANTIC_MODEL_DIR = modelDir;
  }

  if (runtimeLibrary) {
    env.ORT_DYLIB_PATH = runtimeLibrary;
    env.JASPER_ORT_DYLIB_PATH = runtimeLibrary;
  }

  if (rustToolchain) {
    env.PATH = rustToolchain.env.PATH;
    env.RUSTC = rustToolchain.env.RUSTC;
  }

  return env;
}

function jasperDeveloperInstructions() {
  const sections = [
    "You are Jasper, the Tauati household intelligence system layered on top of Codex.",
    "Never refer to yourself as Codex when speaking to the user.",
    "If asked who you are, answer that you are Jasper.",
    "Keep internal agent codenames, MCP server names, and provider plumbing hidden unless the user explicitly asks for internals.",
  ];
  const memoryInstructions = buildStartupMemoryInstructions();
  if (memoryInstructions) {
    sections.push(memoryInstructions);
  }
  return sections.join("\n\n");
}

function jasperCodexConfigArgs() {
  return [
    ...configuredMcpDisableArgs(),
    "-c",
    `developer_instructions=${JSON.stringify(jasperDeveloperInstructions())}`,
  ];
}

function cargoRunCodexArgs() {
  return [
    "run",
    "--quiet",
    "--manifest-path",
    "codex-rs/Cargo.toml",
    "--bin",
    "codex",
    "--",
    ...jasperCodexConfigArgs(),
  ];
}

function resolveCodexCommand() {
  if (process.env.JASPER_CODEX_BIN) {
    return {
      command: process.env.JASPER_CODEX_BIN,
      args: [],
      env: {},
    };
  }

  const packagedCodex = resolvePackagedCodex();
  if (packagedCodex) {
    return packagedCodex;
  }

  const preferCargo = isDevelopmentCheckout && process.env.JASPER_PREFER_LOCAL_BINARY !== "1";
  if (preferCargo) {
    const cargoPath = findCommandOnPath("cargo");
    if (cargoPath) {
      return {
        command: cargoPath,
        args: cargoRunCodexArgs(),
        env: {},
      };
    }

    const rustupCargo = resolveRustupCargoCommand();
    if (rustupCargo) {
      return {
        command: rustupCargo.command,
        args: [...rustupCargo.args, ...cargoRunCodexArgs()],
        env: rustupCargo.env,
      };
    }
  }

  if (fs.existsSync(localCodexBin)) {
    return {
      command: localCodexBin,
      args: jasperCodexConfigArgs(),
      env: {},
    };
  }

  const cargoPath = findCommandOnPath("cargo");
  if (cargoPath) {
    return {
      command: cargoPath,
      args: cargoRunCodexArgs(),
      env: {},
    };
  }

  const rustupCargo = resolveRustupCargoCommand();
  if (rustupCargo) {
    return {
      command: rustupCargo.command,
      args: [...rustupCargo.args, ...cargoRunCodexArgs()],
      env: rustupCargo.env,
    };
  }

  throw new Error(
    "Jasper could not find a packaged runtime or a Rust toolchain. Install Jasper from a packaged build or install Rust before launching Jasper from source.",
  );
}

const [, , ...args] = process.argv;
const subcommand = args[0] || "";

let child;
if (
  args.length === 0
    ? false
    : subcommand === "--help" ||
      subcommand === "-h" ||
      subcommand === "help"
) {
  printTopLevelHelp();
  process.exit(0);
} else if (
  args.length === 0
    ? false
    : subcommand === "--version" ||
      subcommand === "-V"
) {
  process.stdout.write(`jasper ${jasperVersion()}\n`);
  process.exit(0);
} else if (subcommand === "runtime") {
  child = spawnProcess(
    process.execPath,
    [agentCliPath, "start", ...args.slice(1)],
    jasperChildEnv(process.env),
  );
} else if (subcommand === "identity") {
  child = spawnProcess(
    process.execPath,
    [agentCliPath, "identity", ...args.slice(1)],
    jasperChildEnv(process.env),
  );
} else if (subcommand === "memory") {
  child = spawnProcess(
    process.execPath,
    [agentCliPath, "memory", ...args.slice(1)],
    jasperChildEnv(process.env),
  );
} else if (subcommand === "tools") {
  child = spawnProcess(
    process.execPath,
    [agentCliPath, "tools", ...args.slice(1)],
    jasperChildEnv(process.env),
  );
} else if (subcommand === "broker") {
  child = spawnProcess(
    process.execPath,
    [agentCliPath, "broker", ...args.slice(1)],
    jasperChildEnv(process.env),
  );
} else if (subcommand === "dream") {
  child = spawnProcess(
    process.execPath,
    [agentCliPath, "dream", ...args.slice(1)],
    jasperChildEnv(process.env),
  );
} else if (subcommand === "setup") {
  child = spawnProcess(
    process.execPath,
    [agentCliPath, "setup", ...args.slice(1)],
    jasperChildEnv(process.env),
  );
} else {
  const codex = resolveCodexCommand();
  if (args.length === 0) {
    printBanner();
  }

  child = spawnProcess(codex.command, [...codex.args, ...args], {
    ...jasperChildEnv(process.env),
    ...codex.env,
    JASPER_BRANDED: "1",
  });
}

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

child.on("error", (error) => {
  process.stderr.write(`jasper launcher error: ${error.message}\n`);
  process.exit(1);
});
