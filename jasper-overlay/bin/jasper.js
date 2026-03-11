#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import fs from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const agentCliPath = path.join(repoRoot, "jasper-agent", "src", "cli.js");
const localCodexBin = path.join(repoRoot, "codex-rs", "target", "debug", "codex");

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
    `${dim}Household intelligence layered onto Codex.${reset}`,
    "",
  ];

  process.stdout.write(`${lines.join("\n")}\n`);
}

function spawnProcess(command, commandArgs, env) {
  return spawn(command, commandArgs, {
    cwd: repoRoot,
    stdio: "inherit",
    env,
  });
}

function resolveCodexCommand() {
  if (process.env.JASPER_CODEX_BIN) {
    return {
      command: process.env.JASPER_CODEX_BIN,
      args: [],
    };
  }

  if (fs.existsSync(localCodexBin)) {
    return {
      command: localCodexBin,
      args: [],
    };
  }

  return {
    command: "cargo",
    args: ["run", "--manifest-path", "codex-rs/Cargo.toml", "--bin", "codex", "--"],
  };
}

const [, , ...args] = process.argv;
const subcommand = args[0] || "";

let child;
if (subcommand === "runtime") {
  child = spawnProcess(process.execPath, [agentCliPath, "start", ...args.slice(1)], process.env);
} else if (subcommand === "identity") {
  child = spawnProcess(process.execPath, [agentCliPath, "identity", ...args.slice(1)], process.env);
} else if (subcommand === "memory") {
  child = spawnProcess(process.execPath, [agentCliPath, "memory", ...args.slice(1)], process.env);
} else if (subcommand === "tools") {
  child = spawnProcess(process.execPath, [agentCliPath, "tools", ...args.slice(1)], process.env);
} else if (subcommand === "dream") {
  child = spawnProcess(process.execPath, [agentCliPath, "dream", ...args.slice(1)], process.env);
} else {
  if (args.length === 0) {
    printBanner();
  }

  const codex = resolveCodexCommand();
  child = spawnProcess(codex.command, [...codex.args, ...args], {
    ...process.env,
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
