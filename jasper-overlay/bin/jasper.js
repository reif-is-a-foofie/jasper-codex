#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { buildStartupMemoryInstructions } from "../../jasper-core/src/startup-memory.js";
import { buildStartupToolInstructions } from "../../jasper-core/src/startup-tools.js";
import { loadIdentityConfig } from "../../jasper-core/src/identity.js";
import { buildManifestoInstructions } from "../../jasper-core/src/manifesto.js";
import { readRuntimeConfig } from "../../jasper-core/src/setup.js";

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
const afterTurnHookPath = path.join(
  repoRoot,
  "jasper-agent",
  "src",
  "after-turn.js",
);
const terminalBenchRunnerPath = path.join(
  repoRoot,
  "scripts",
  "run_terminal_bench_with_jasper.py",
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

  const runtimeRoot =
    process.env.JASPER_SEMANTIC_RUNTIME_DIR || semanticRuntimeRoot;
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
  const matches = configText.matchAll(
    /^\[mcp_servers\.([A-Za-z0-9_-]+)\]\s*$/gm,
  );
  const serverNames = [
    ...new Set([...matches].map((match) => match[1]).filter(Boolean)),
  ];

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

function resolvePythonCommand() {
  const configuredPython =
    process.env.JASPER_PYTHON_BIN || process.env.PYTHON_BIN || null;
  if (configuredPython) {
    return configuredPython;
  }

  return (
    findCommandOnPath("python3") ||
    findCommandOnPath("python") ||
    (process.platform !== "win32" && fs.existsSync("/usr/bin/python3")
      ? "/usr/bin/python3"
      : null)
  );
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
          path.join(
            toolchainBinDir,
            process.platform === "win32" ? "rustc.exe" : "rustc",
          ),
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
      source: "packaged",
    };
  }

  return null;
}

function baseCodexArgs(codex) {
  const args = Array.isArray(codex?.args) ? codex.args : [];
  if (codex?.source === "cargo_on_path" || codex?.source === "rustup_cargo") {
    const separatorIndex = args.indexOf("--");
    return separatorIndex === -1 ? args : args.slice(0, separatorIndex);
  }

  return args;
}

function launchArgsForStoredCodex(codex) {
  const baseArgs = Array.isArray(codex?.args) ? codex.args : [];
  if (codex?.source === "cargo_on_path" || codex?.source === "rustup_cargo") {
    return [...baseArgs, "--", ...jasperCodexConfigArgs()];
  }

  return [...baseArgs, ...jasperCodexConfigArgs()];
}

function resolveRuntimeConfiguredCodex() {
  const runtimeConfig = readRuntimeConfig();
  const codex = runtimeConfig?.runtime?.codex;
  if (!codex?.command) {
    return null;
  }

  if (
    (path.isAbsolute(codex.command) || codex.command.includes(path.sep)) &&
    !fs.existsSync(codex.command)
  ) {
    return null;
  }

  return {
    command: codex.command,
    args: launchArgsForStoredCodex(codex),
    env: codex.env && typeof codex.env === "object" ? codex.env : {},
    source: codex.source || "runtime_config",
  };
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
  doctor      Check Jasper setup, runtime, and auth health
  apps        Review connector and app requests Jasper is waiting on
  audit       Run Jasper self-audits and evaluation baselines
  browser     Run Jasper browser automation plans
  action      Inspect and run Jasper computer-use action plans
  benchmark   Inspect and run Jasper external benchmarks
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

function jasperSetupEnv(baseEnv) {
  const env = jasperChildEnv(baseEnv);

  try {
    const codex = resolveCodexCommand();
    env.JASPER_SETUP_CODEX_COMMAND = codex.command;
    env.JASPER_SETUP_CODEX_ARGS_JSON = JSON.stringify(baseCodexArgs(codex));
    env.JASPER_SETUP_CODEX_ENV_JSON = JSON.stringify(codex.env || {});
    env.JASPER_SETUP_CODEX_SOURCE = codex.source || "launcher";
  } catch {
    // Leave setup health checks to report the missing runtime cleanly.
  }

  return env;
}

function jasperDeveloperInstructions() {
  const sections = [];

  try {
    const identity = loadIdentityConfig().config;
    sections.push(
      `You are ${identity.identity.name}, the ${identity.identity.role} for ${identity.identity.owner}.`,
      `Mission: ${identity.mission.join("; ")}.`,
      `Tone: ${identity.personality.tone}. Style: ${identity.personality.style}. Traits: ${identity.personality.traits.join(", ")}.`,
    );
  } catch {
    sections.push(
      "You are Jasper, the Tauati household intelligence system layered on top of Codex.",
    );
  }

  sections.push(
    "Never refer to yourself as Codex when speaking to the user.",
    "If asked who you are, answer that you are Jasper.",
    "Keep internal agent codenames, MCP server names, and provider plumbing hidden unless the user explicitly asks for internals.",
    "For current-information questions, use available web research/search tools instead of relying on stale memory.",
    "If the task requires a long-running server, worker, or watcher to stay available for later verification, start it as a detached background process that survives after your turn, capture its logs or PID when practical, and verify the service is still reachable before you finish.",
    "Match the task's exact output contract, including required keys, formats, and JSON primitive types. Do not stringify numbers or booleans unless the task explicitly requires strings.",
    "Assume verifiers may check reasonable hidden edge cases. Before you finish, test and harden likely boundary conditions and invalid inputs implied by the task, not just the examples explicitly listed.",
    "For calendar, schedule, meetings, email, inbox, or mailbox work, use relevant available tools automatically when they are present.",
    "If an apps search or discovery tool is available and you need app tools that are not already visible, use it before asking the user to restate the request with a connector mention.",
    "If the user asks for calendar, email, or mailbox work and the needed app tools are unavailable, explain that Jasper needs that app connected and direct the user to run `jasper apps` in the terminal.",
  );

  try {
    sections.push(buildManifestoInstructions());
  } catch {
    // Ignore manifesto loading failures and keep Jasper bootable.
  }

  const memoryInstructions = buildStartupMemoryInstructions();
  if (memoryInstructions) {
    sections.push(memoryInstructions);
  }
  const toolInstructions = buildStartupToolInstructions();
  if (toolInstructions) {
    sections.push(toolInstructions);
  }
  return sections.join("\n\n");
}

function jasperAfterTurnHookConfig() {
  if (!fs.existsSync(afterTurnHookPath)) {
    return [];
  }

  const enabled = String(process.env.JASPER_ENABLE_AFTER_TURN_INTAKE || "1")
    .trim()
    .toLowerCase();
  if (["0", "false", "no", "off"].includes(enabled)) {
    return [];
  }

  const argv = [process.execPath, afterTurnHookPath]
    .map((value) => JSON.stringify(value))
    .join(", ");
  return ["-c", `notify=[${argv}]`];
}

function jasperCodexConfigArgs() {
  return [
    ...configuredMcpDisableArgs(),
    ...jasperAfterTurnHookConfig(),
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
      source: "env",
    };
  }

  const runtimeConfiguredCodex = resolveRuntimeConfiguredCodex();
  if (runtimeConfiguredCodex) {
    return runtimeConfiguredCodex;
  }

  const packagedCodex = resolvePackagedCodex();
  if (packagedCodex) {
    return packagedCodex;
  }

  const preferCargo =
    isDevelopmentCheckout && process.env.JASPER_PREFER_LOCAL_BINARY !== "1";
  if (preferCargo) {
    const cargoPath = findCommandOnPath("cargo");
    if (cargoPath) {
      return {
        command: cargoPath,
        args: cargoRunCodexArgs(),
        env: {},
        source: "cargo_on_path",
      };
    }

    const rustupCargo = resolveRustupCargoCommand();
    if (rustupCargo) {
      return {
        command: rustupCargo.command,
        args: [...rustupCargo.args, ...cargoRunCodexArgs()],
        env: rustupCargo.env,
        source: "rustup_cargo",
      };
    }
  }

  if (fs.existsSync(localCodexBin)) {
    return {
      command: localCodexBin,
      args: jasperCodexConfigArgs(),
      env: {},
      source: "local_binary",
    };
  }

  const cargoPath = findCommandOnPath("cargo");
  if (cargoPath) {
    return {
      command: cargoPath,
      args: cargoRunCodexArgs(),
      env: {},
      source: "cargo_on_path",
    };
  }

  const rustupCargo = resolveRustupCargoCommand();
  if (rustupCargo) {
    return {
      command: rustupCargo.command,
      args: [...rustupCargo.args, ...cargoRunCodexArgs()],
      env: rustupCargo.env,
      source: "rustup_cargo",
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
    : subcommand === "--help" || subcommand === "-h" || subcommand === "help"
) {
  printTopLevelHelp();
  process.exit(0);
} else if (
  args.length === 0 ? false : subcommand === "--version" || subcommand === "-V"
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
    jasperSetupEnv(process.env),
  );
} else if (subcommand === "doctor") {
  child = spawnProcess(
    process.execPath,
    [agentCliPath, "doctor", ...args.slice(1)],
    jasperSetupEnv(process.env),
  );
} else if (subcommand === "apps") {
  child = spawnProcess(
    process.execPath,
    [agentCliPath, "apps", ...args.slice(1)],
    jasperChildEnv(process.env),
  );
} else if (subcommand === "audit") {
  child = spawnProcess(
    process.execPath,
    [agentCliPath, "audit", ...args.slice(1)],
    jasperSetupEnv(process.env),
  );
} else if (subcommand === "browser") {
  child = spawnProcess(
    process.execPath,
    [agentCliPath, "browser", ...args.slice(1)],
    jasperSetupEnv(process.env),
  );
} else if (subcommand === "action") {
  child = spawnProcess(
    process.execPath,
    [agentCliPath, "action", ...args.slice(1)],
    jasperSetupEnv(process.env),
  );
} else if (subcommand === "benchmark") {
  const benchmarkCommand = args[1] || "";
  const benchmarkArgs = args.slice(2);

  if (!benchmarkCommand || benchmarkCommand === "help") {
    process.stdout.write(`Jasper Benchmark Commands

Usage:
  jasper benchmark list
  jasper benchmark queue
  jasper benchmark score
  jasper benchmark run terminal-bench [RUNNER_ARGS]

Examples:
  jasper benchmark list
  jasper benchmark queue
  jasper benchmark score
  jasper benchmark run terminal-bench --task-id hello-world --dry-run
  jasper benchmark run terminal-bench --task-id hello-world --import-benchmark-index
`);
    process.exit(0);
  }

  if (benchmarkCommand === "list") {
    child = spawnProcess(
      process.execPath,
      [agentCliPath, "audit", "benchmark-index", "list"],
      jasperSetupEnv(process.env),
    );
  } else if (benchmarkCommand === "queue" || benchmarkCommand === "plan") {
    child = spawnProcess(
      process.execPath,
      [agentCliPath, "audit", "benchmark-index", "queue"],
      jasperSetupEnv(process.env),
    );
  } else if (
    benchmarkCommand === "score" ||
    benchmarkCommand === "index" ||
    benchmarkCommand === "status"
  ) {
    child = spawnProcess(
      process.execPath,
      [agentCliPath, "audit", "benchmark-index"],
      jasperSetupEnv(process.env),
    );
  } else if (benchmarkCommand === "run") {
    const benchmarkId = benchmarkArgs[0] || "";
    const runnerArgs = benchmarkArgs.slice(1);

    if (benchmarkId !== "terminal-bench" && benchmarkId !== "terminal_bench") {
      process.stderr.write(
        "jasper benchmark run currently supports only 'terminal-bench'.\n",
      );
      process.exit(1);
    }

    if (!fs.existsSync(terminalBenchRunnerPath)) {
      process.stderr.write(
        `jasper benchmark runner not found at ${terminalBenchRunnerPath}\n`,
      );
      process.exit(1);
    }

    const pythonCommand = resolvePythonCommand();
    if (!pythonCommand) {
      process.stderr.write(
        "jasper benchmark run requires python3 or python on PATH.\n",
      );
      process.exit(1);
    }

    child = spawnProcess(
      pythonCommand,
      [terminalBenchRunnerPath, ...runnerArgs],
      jasperSetupEnv(process.env),
    );
  } else {
    process.stderr.write(
      `Unknown benchmark command '${benchmarkCommand}'. Run 'jasper benchmark help'.\n`,
    );
    process.exit(1);
  }
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
