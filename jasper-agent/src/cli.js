#!/usr/bin/env node

import { loadIdentityConfig } from "../../jasper-core/src/identity.js";
import { createEventStore } from "../../jasper-memory/src/event-store.js";
import { createJasperRuntime } from "./runtime.js";

function printUsage() {
  process.stdout.write(`Usage:
  node jasper-agent/src/cli.js start [--identity PATH] [--interval-ms N] [--max-ticks N] [--memory-root PATH]
  node jasper-agent/src/cli.js identity [--identity PATH]
  node jasper-agent/src/cli.js memory recent [--memory-root PATH] [--limit N] [--type TYPE] [--source SOURCE]
  node jasper-agent/src/cli.js memory search QUERY [--memory-root PATH] [--limit N] [--type TYPE] [--source SOURCE]
  node jasper-agent/src/cli.js memory semantic QUERY [--memory-root PATH] [--limit N] [--type TYPE] [--source SOURCE]
`);
}

function parseArgs(argv) {
  const args = [...argv];
  const options = {
    positionals: [],
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--identity") {
      options.identityPath = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--interval-ms") {
      options.tickIntervalMs = Number(args[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--max-ticks") {
      options.maxTicks = Number(args[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--memory-root") {
      options.memoryRoot = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--memory-context-limit") {
      options.memoryContextLimit = Number(args[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--limit") {
      options.limit = Number(args[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--type") {
      options.type = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--source") {
      options.source = args[index + 1];
      index += 1;
      continue;
    }
    options.positionals.push(arg);
  }

  return options;
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command) {
    printUsage();
    process.exit(1);
  }

  const options = parseArgs(rest);
  const runtime = createJasperRuntime(options);

  if (command === "identity") {
    printJson(loadIdentityConfig({ identityPath: options.identityPath }));
    return;
  }

  if (command === "memory") {
    const [memoryCommand, ...memoryArgs] = rest;
    const memoryOptions = parseArgs(memoryArgs);
    const store = createEventStore({ root: memoryOptions.memoryRoot });

    if (memoryCommand === "recent") {
      printJson(
        store.listRecentEvents({
          limit: memoryOptions.limit,
          type: memoryOptions.type,
          source: memoryOptions.source,
        }),
      );
      return;
    }

    if (memoryCommand === "search") {
      const query = memoryOptions.positionals.join(" ").trim();
      if (!query) {
        throw new Error("Memory search requires a query string");
      }

      printJson(
        store.searchRelevantEvents({
          query,
          limit: memoryOptions.limit,
          type: memoryOptions.type,
          source: memoryOptions.source,
        }),
      );
      return;
    }

    if (memoryCommand === "semantic") {
      const query = memoryOptions.positionals.join(" ").trim();
      if (!query) {
        throw new Error("Memory semantic search requires a query string");
      }

      printJson(
        store.searchSemanticEvents({
          query,
          limit: memoryOptions.limit,
          type: memoryOptions.type,
          source: memoryOptions.source,
        }),
      );
      return;
    }

    printUsage();
    return;
  }

  if (command !== "start") {
    printUsage();
    process.exit(1);
  }

  const stop = (signal) => {
    runtime.stop(signal);
  };

  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));

  await runtime.start();
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`jasper-agent error: ${message}\n`);
  process.exit(1);
});
