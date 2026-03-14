import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const repoCodexLauncher = path.join(repoRoot, "codex-cli", "bin", "codex.js");
const platformTargetTriples = {
  "darwin:arm64": "aarch64-apple-darwin",
  "darwin:x64": "x86_64-apple-darwin",
  "linux:arm64": "aarch64-unknown-linux-musl",
  "linux:x64": "x86_64-unknown-linux-musl",
  "win32:arm64": "aarch64-pc-windows-msvc",
  "win32:x64": "x86_64-pc-windows-msvc",
};

function buildResearchPrompt(query) {
  return [
    "Use web search to answer the user's request.",
    "Return a concise research note with a short summary and a Sources section.",
    "Each source must include a title and URL.",
    "",
    `Request: ${query}`,
  ].join("\n");
}

function resolveCodexCommand(options = {}) {
  const executablePath =
    options.executablePath || process.env.JASPER_CODEX_EXECUTABLE;
  if (executablePath) {
    return {
      command: executablePath,
      args: [],
    };
  }

  const targetTriple =
    platformTargetTriples[`${process.platform}:${process.arch}`];
  const codexBinaryName = process.platform === "win32" ? "codex.exe" : "codex";
  const repoVendoredBinaryPath = targetTriple
    ? path.join(
        repoRoot,
        "codex-cli",
        "vendor",
        targetTriple,
        "codex",
        codexBinaryName,
      )
    : null;

  if (
    fs.existsSync(repoCodexLauncher) &&
    repoVendoredBinaryPath &&
    fs.existsSync(repoVendoredBinaryPath)
  ) {
    return {
      command: process.execPath,
      args: [repoCodexLauncher],
    };
  }

  return {
    command: "codex",
    args: [],
  };
}

export async function runCodexWebResearch(query, options = {}) {
  const request = String(query || "").trim();
  if (!request) {
    throw new Error('Web research requires a non-empty "query"');
  }

  const codexCommand = resolveCodexCommand(options);
  const args = [
    ...codexCommand.args,
    "exec",
    "--experimental-json",
    "--skip-git-repo-check",
    "--ephemeral",
    "--config",
    'approval_policy="never"',
    "--config",
    'web_search="live"',
  ];
  if (options.workingDirectory) {
    args.push("--cd", options.workingDirectory);
  }

  const child = spawn(codexCommand.command, args, {
    cwd: options.cwd || repoRoot,
    env: {
      ...process.env,
      ...options.env,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const stderrChunks = [];
  let spawnError = null;

  child.once("error", (error) => {
    spawnError = error;
  });
  const exitPromise = new Promise((resolve) => {
    child.once("exit", (code) => {
      resolve(code ?? 1);
    });
  });

  if (!child.stdin || !child.stdout) {
    child.kill();
    throw new Error("Codex web research could not start its child process");
  }

  child.stdin.write(buildResearchPrompt(request));
  child.stdin.end();

  if (child.stderr) {
    child.stderr.on("data", (chunk) => {
      stderrChunks.push(chunk);
    });
  }

  const searches = [];
  let answer = "";
  let threadId = null;
  let streamError = null;
  const reader = readline.createInterface({
    input: child.stdout,
    crlfDelay: Infinity,
  });

  try {
    for await (const line of reader) {
      if (!line.trim()) {
        continue;
      }

      let event;
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }

      if (event.type === "thread.started") {
        threadId = event.thread_id || null;
        continue;
      }

      if (event.type === "error") {
        streamError = event.message || "Codex web research stream failed";
        continue;
      }

      if (event.type === "turn.failed") {
        streamError = event.error?.message || "Codex web research turn failed";
        continue;
      }

      if (event.type !== "item.completed") {
        continue;
      }

      if (event.item?.type === "web_search" && event.item.query) {
        searches.push(event.item.query);
      }

      if (event.item?.type === "agent_message" && event.item.text) {
        answer = String(event.item.text).trim();
      }
    }
  } finally {
    reader.close();
  }

  const exitCode = await exitPromise;

  if (spawnError) {
    if (spawnError.code === "ENOENT") {
      throw new Error(
        "Codex web research could not find a Codex runtime. Set JASPER_CODEX_EXECUTABLE, install @openai/codex, or hydrate codex-cli/vendor.",
      );
    }
    throw spawnError;
  }

  if (exitCode !== 0) {
    const detail = Buffer.concat(stderrChunks).toString("utf8").trim();
    throw new Error(
      detail
        ? `Codex web research exited with code ${exitCode}: ${detail}`
        : `Codex web research exited with code ${exitCode}`,
    );
  }

  if (streamError) {
    throw new Error(streamError);
  }

  if (!answer) {
    throw new Error("Codex web research completed without an answer");
  }

  return {
    query: request,
    answer,
    searches,
    threadId,
  };
}
