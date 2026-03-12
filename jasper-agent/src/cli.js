#!/usr/bin/env node

import { loadIdentityConfig } from "../../jasper-core/src/identity.js";
import { getJasperSetupStatus } from "../../jasper-core/src/setup.js";
import { setupJasper } from "../../jasper-core/src/setup.js";
import { createEventStore } from "../../jasper-memory/src/event-store.js";
import { createReflectionStore } from "../../jasper-memory/src/reflections.js";
import { generateToolFromTemplate } from "../../jasper-tools/src/generator.js";
import { listGeneratorTemplates } from "../../jasper-tools/src/generator.js";
import { createToolRegistry } from "../../jasper-tools/src/registry.js";
import { createCapabilityBroker } from "./broker/index.js";
import { createJasperRuntime } from "./runtime.js";

function printUsage() {
  process.stdout.write(`Usage:
  node jasper-agent/src/cli.js start [--identity PATH] [--interval-ms N] [--max-ticks N] [--memory-root PATH] [--watch-path PATH]
  node jasper-agent/src/cli.js setup [--jasper-home PATH] [--skip-qdrant] [--qdrant-url URL] [--qdrant-container-name NAME] [--qdrant-image IMAGE]
  node jasper-agent/src/cli.js setup status [--jasper-home PATH]
  node jasper-agent/src/cli.js identity [--identity PATH]
  node jasper-agent/src/cli.js memory recent [--memory-root PATH] [--limit N] [--type TYPE] [--source SOURCE]
  node jasper-agent/src/cli.js memory search QUERY [--memory-root PATH] [--limit N] [--type TYPE] [--source SOURCE]
  node jasper-agent/src/cli.js memory semantic QUERY [--memory-root PATH] [--limit N] [--type TYPE] [--source SOURCE]
  node jasper-agent/src/cli.js memory materialize [--memory-root PATH] [--jasper-home PATH]
  node jasper-agent/src/cli.js dream reflect [--memory-root PATH] [--limit N] [--type TYPE] [--source SOURCE]
  node jasper-agent/src/cli.js dream recent [--memory-root PATH] [--limit N]
  node jasper-agent/src/cli.js tools list [--identity PATH] [--memory-root PATH]
  node jasper-agent/src/cli.js tools templates
  node jasper-agent/src/cli.js tools generate --id TOOL_ID --template TEMPLATE --description TEXT [--tools-root PATH] [--query TEXT] [--limit N] [--type TYPE] [--source SOURCE]
  node jasper-agent/src/cli.js tools run TOOL_ID [--identity PATH] [--memory-root PATH] [--limit N] [--type TYPE] [--source SOURCE] [--query TEXT]
  node jasper-agent/src/cli.js broker agents
  node jasper-agent/src/cli.js broker capabilities
  node jasper-agent/src/cli.js broker inspect QUERY [--identity PATH] [--memory-root PATH] [--tools-root PATH]
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
    if (arg === "--jasper-home") {
      options.jasperHome = args[index + 1];
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
    if (arg === "--query") {
      options.query = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--watch-path") {
      options.watchPaths = options.watchPaths || [];
      options.watchPaths.push(args[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--listener-max-depth") {
      options.listenerMaxDepth = Number(args[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--listener-max-files") {
      options.listenerMaxFiles = Number(args[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--listener-max-changes") {
      options.listenerMaxChanges = Number(args[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--listener-max-recent-files") {
      options.listenerMaxRecentFiles = Number(args[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--tools-root") {
      options.toolsRoot = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--id") {
      options.id = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--description") {
      options.description = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--template") {
      options.template = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--qdrant-url") {
      options.qdrantUrl = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--qdrant-container-name") {
      options.qdrantContainerName = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--qdrant-image") {
      options.qdrantImage = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--skip-qdrant") {
      options.skipQdrant = true;
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

  if (command === "setup") {
    const [setupCommand, ...setupArgs] = rest;
    const setupOptions = parseArgs(setupArgs);

    if (setupCommand === "status") {
      printJson(
        await getJasperSetupStatus({ jasperHome: setupOptions.jasperHome }),
      );
      return;
    }

    printJson(
      await setupJasper({
        jasperHome: options.jasperHome,
        skipQdrant: options.skipQdrant,
        qdrantUrl: options.qdrantUrl,
        qdrantContainerName: options.qdrantContainerName,
        qdrantImage: options.qdrantImage,
      }),
    );
    return;
  }

  if (command === "memory") {
    const [memoryCommand, ...memoryArgs] = rest;
    const memoryOptions = parseArgs(memoryArgs);
    const store = createEventStore({
      root: memoryOptions.memoryRoot,
      jasperHome: memoryOptions.jasperHome,
    });

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
        await store.searchSemanticEvents({
          query,
          limit: memoryOptions.limit,
          type: memoryOptions.type,
          source: memoryOptions.source,
        }),
      );
      return;
    }

    if (memoryCommand === "materialize") {
      printJson(await store.materializeSemanticIndex());
      return;
    }

    printUsage();
    return;
  }

  if (command === "tools") {
    const [toolCommand, ...toolArgs] = rest;
    const toolOptions = parseArgs(toolArgs);
    const registry = createToolRegistry({
      identityPath: toolOptions.identityPath,
      memoryRoot: toolOptions.memoryRoot,
      jasperHome: toolOptions.jasperHome,
      toolsRoot: toolOptions.toolsRoot,
    });

    if (toolCommand === "list") {
      printJson(registry.listTools());
      return;
    }

    if (toolCommand === "templates") {
      printJson(listGeneratorTemplates());
      return;
    }

    if (toolCommand === "generate") {
      printJson(
        generateToolFromTemplate({
          id: toolOptions.id,
          template: toolOptions.template,
          description: toolOptions.description,
          toolsRoot: toolOptions.toolsRoot,
          query: toolOptions.query,
          limit: toolOptions.limit,
          type: toolOptions.type,
          source: toolOptions.source,
        }),
      );
      return;
    }

    if (toolCommand === "run") {
      const [toolId] = toolOptions.positionals;
      if (!toolId) {
        throw new Error("Tool run requires a TOOL_ID");
      }

      const input = {
        limit: toolOptions.limit,
        type: toolOptions.type,
        source: toolOptions.source,
        query: toolOptions.query,
      };

      printJson(await registry.runTool(toolId, input));
      return;
    }

    printUsage();
    return;
  }

  if (command === "broker") {
    const [brokerCommand, ...brokerArgs] = rest;
    const brokerOptions = parseArgs(brokerArgs);
    const broker = createCapabilityBroker({
      identityPath: brokerOptions.identityPath,
      memoryRoot: brokerOptions.memoryRoot,
      jasperHome: brokerOptions.jasperHome,
      toolsRoot: brokerOptions.toolsRoot,
    });

    if (brokerCommand === "agents") {
      printJson(broker.listInternalAgents());
      return;
    }

    if (brokerCommand === "capabilities") {
      printJson(broker.listCapabilities());
      return;
    }

    if (brokerCommand === "inspect") {
      const query = brokerOptions.positionals.join(" ").trim();
      if (!query) {
        throw new Error("Broker inspect requires a query string");
      }

      printJson(
        broker.inspectRequest(query, {
          limit: brokerOptions.limit,
        }),
      );
      return;
    }

    printUsage();
    return;
  }

  if (command === "dream") {
    const [dreamCommand, ...dreamArgs] = rest;
    const dreamOptions = parseArgs(dreamArgs);
    const store = createReflectionStore({ root: dreamOptions.memoryRoot });

    if (dreamCommand === "reflect") {
      printJson(
        store.createAndStoreReflection({
          limit: dreamOptions.limit,
          type: dreamOptions.type,
          source: dreamOptions.source,
        }),
      );
      return;
    }

    if (dreamCommand === "recent") {
      printJson(
        store.listRecentReflections({
          limit: dreamOptions.limit,
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
