#!/usr/bin/env node

import { loadIdentityConfig } from "../../jasper-core/src/identity.js";
import { getJasperSetupStatus } from "../../jasper-core/src/setup.js";
import { setupJasper } from "../../jasper-core/src/setup.js";
import { createEventStore } from "../../jasper-memory/src/event-store.js";
import { createReflectionStore } from "../../jasper-memory/src/reflections.js";
import { generateToolFromTemplate } from "../../jasper-tools/src/generator.js";
import { listGeneratorTemplates } from "../../jasper-tools/src/generator.js";
import { createToolRegistry } from "../../jasper-tools/src/registry.js";
import { createToolAcquisitionStore } from "./broker/acquisition-store.js";
import { createCapabilityBroker } from "./broker/index.js";
import { createToolMaintenanceWorker } from "./broker/tool-maintenance.js";
import { createJasperRuntime } from "./runtime.js";

function printUsage() {
  process.stdout.write(`Usage:
  node jasper-agent/src/cli.js start [--identity PATH] [--interval-ms N] [--max-ticks N] [--memory-root PATH] [--tools-root PATH] [--watch-path PATH]
  node jasper-agent/src/cli.js setup [--jasper-home PATH] [--skip-qdrant] [--skip-auth] [--device-auth] [--qdrant-url URL] [--qdrant-container-name NAME] [--qdrant-image IMAGE]
  node jasper-agent/src/cli.js setup status [--jasper-home PATH]
  node jasper-agent/src/cli.js doctor [--jasper-home PATH]
  node jasper-agent/src/cli.js identity [--identity PATH]
  node jasper-agent/src/cli.js memory recent [--memory-root PATH] [--limit N] [--type TYPE] [--source SOURCE]
  node jasper-agent/src/cli.js memory search QUERY [--memory-root PATH] [--limit N] [--type TYPE] [--source SOURCE]
  node jasper-agent/src/cli.js memory semantic QUERY [--memory-root PATH] [--limit N] [--type TYPE] [--source SOURCE]
  node jasper-agent/src/cli.js memory materialize [--memory-root PATH] [--jasper-home PATH]
  node jasper-agent/src/cli.js dream reflect [--memory-root PATH] [--limit N] [--type TYPE] [--source SOURCE]
  node jasper-agent/src/cli.js dream recent [--memory-root PATH] [--limit N]
  node jasper-agent/src/cli.js tools list [--identity PATH] [--memory-root PATH]
  node jasper-agent/src/cli.js tools scout QUERY [--identity PATH] [--memory-root PATH] [--tools-root PATH]
  node jasper-agent/src/cli.js tools needs QUERY [--identity PATH] [--memory-root PATH] [--tools-root PATH]
  node jasper-agent/src/cli.js tools search QUERY [--identity PATH] [--memory-root PATH] [--tools-root PATH]
  node jasper-agent/src/cli.js tools quarantine QUERY [--identity PATH] [--memory-root PATH] [--tools-root PATH]
  node jasper-agent/src/cli.js tools build QUERY [--identity PATH] [--memory-root PATH] [--tools-root PATH]
  node jasper-agent/src/cli.js tools plan QUERY [--identity PATH] [--memory-root PATH] [--tools-root PATH]
  node jasper-agent/src/cli.js tools acquire QUERY [--identity PATH] [--memory-root PATH] [--tools-root PATH] [--jasper-home PATH]
  node jasper-agent/src/cli.js tools acquisitions [--limit N] [--type STATUS] [--jasper-home PATH]
  node jasper-agent/src/cli.js tools maintain [--limit N] [--jasper-home PATH] [--tools-root PATH]
  node jasper-agent/src/cli.js tools providers [--limit N] [--jasper-home PATH]
  node jasper-agent/src/cli.js tools quarantine list [--limit N] [--jasper-home PATH]
  node jasper-agent/src/cli.js tools quarantine admit RECORD_ID CANDIDATE_ID [--description TEXT] [--jasper-home PATH]
  node jasper-agent/src/cli.js tools quarantine reject RECORD_ID CANDIDATE_ID [--description TEXT] [--jasper-home PATH]
  node jasper-agent/src/cli.js tools activate RECORD_ID CANDIDATE_ID [--description TEXT] [--jasper-home PATH]
  node jasper-agent/src/cli.js tools build-local RECORD_ID [--id TOOL_ID] [--template TEMPLATE] [--description TEXT] [--tools-root PATH] [--query TEXT] [--limit N] [--type TYPE] [--source SOURCE]
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
    if (arg === "--skip-auth") {
      options.skipAuth = true;
      continue;
    }
    if (arg === "--device-auth") {
      options.deviceAuth = true;
      continue;
    }
    options.positionals.push(arg);
  }

  return options;
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function inspectToolPlan(toolOptions) {
  const query = toolOptions.positionals.join(" ").trim();
  if (!query) {
    throw new Error("Tool planning requires a query string");
  }

  const broker = createCapabilityBroker({
    identityPath: toolOptions.identityPath,
    memoryRoot: toolOptions.memoryRoot,
    jasperHome: toolOptions.jasperHome,
    toolsRoot: toolOptions.toolsRoot,
  });

  return broker.inspectRequest(query, {
    limit: toolOptions.limit,
  });
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
        skipAuth: options.skipAuth,
        deviceAuth: options.deviceAuth,
        qdrantUrl: options.qdrantUrl,
        qdrantContainerName: options.qdrantContainerName,
        qdrantImage: options.qdrantImage,
      }),
    );
    return;
  }

  if (command === "doctor") {
    printJson(
      await getJasperSetupStatus({
        jasperHome: options.jasperHome,
        validateAuth: true,
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
    const registryOptions = {
      identityPath: toolOptions.identityPath,
      memoryRoot: toolOptions.memoryRoot,
      jasperHome: toolOptions.jasperHome,
      toolsRoot: toolOptions.toolsRoot,
    };
    const registry = createToolRegistry(registryOptions);
    const broker = createCapabilityBroker(registryOptions);
    const acquisitionStore = createToolAcquisitionStore({
      jasperHome: toolOptions.jasperHome,
    });
    const toolMaintenanceWorker = createToolMaintenanceWorker({
      jasperHome: toolOptions.jasperHome,
      toolsRoot: toolOptions.toolsRoot,
      acquisitionStore,
    });

    if (toolCommand === "list") {
      printJson(registry.listTools());
      return;
    }

    if (toolCommand === "acquisitions") {
      printJson(
        acquisitionStore.listAcquisitions({
          limit: toolOptions.limit,
          status: toolOptions.type,
        }),
      );
      return;
    }

    if (toolCommand === "providers") {
      printJson(
        acquisitionStore.listActivatedProviders({ limit: toolOptions.limit }),
      );
      return;
    }

    if (toolCommand === "maintain") {
      printJson(toolMaintenanceWorker.maintain({ limit: toolOptions.limit }));
      return;
    }

    if (toolCommand === "acquire") {
      const query = toolOptions.positionals.join(" ").trim();
      if (!query) {
        throw new Error("Tool acquisition requires a query string");
      }

      printJson(
        broker.acquireRequest(query, {
          limit: toolOptions.limit,
          id: toolOptions.id,
          description: toolOptions.description,
          template: toolOptions.template,
          query: toolOptions.query,
          type: toolOptions.type,
          source: toolOptions.source,
        }),
      );
      return;
    }

    if (
      toolCommand === "scout" ||
      toolCommand === "needs" ||
      toolCommand === "search" ||
      toolCommand === "build" ||
      toolCommand === "plan"
    ) {
      const plan = inspectToolPlan(toolOptions);

      if (toolCommand === "needs") {
        printJson({
          request: plan.request,
          acknowledgement: plan.acknowledgement,
          requirement: plan.internalPlan.acquisition?.requirement || null,
          primaryCapabilityId: plan.internalPlan.primaryCapabilityId,
          primaryProvider: plan.internalPlan.primaryProvider,
        });
        return;
      }

      if (toolCommand === "search") {
        printJson(plan.internalPlan.acquisition?.search || null);
        return;
      }

      if (toolCommand === "build") {
        printJson(plan.internalPlan.acquisition?.build || null);
        return;
      }

      printJson({
        request: plan.request,
        acknowledgement: plan.acknowledgement,
        publicPlan: plan.publicPlan,
        toolAcquisition: plan.internalPlan.acquisition,
        primaryCapabilityId: plan.internalPlan.primaryCapabilityId,
        primaryProvider: plan.internalPlan.primaryProvider,
      });
      return;
    }

    if (toolCommand === "quarantine") {
      const [subcommand, recordId, candidateId, ...queryParts] =
        toolOptions.positionals;

      if (subcommand === "list") {
        printJson(
          acquisitionStore.listQuarantineQueue({ limit: toolOptions.limit }),
        );
        return;
      }

      if (subcommand === "admit") {
        if (!recordId || !candidateId) {
          throw new Error(
            "Tools quarantine admit requires a RECORD_ID and CANDIDATE_ID",
          );
        }
        printJson(
          acquisitionStore.admitCandidate(
            recordId,
            candidateId,
            toolOptions.description,
          ),
        );
        return;
      }

      if (subcommand === "reject") {
        if (!recordId || !candidateId) {
          throw new Error(
            "Tools quarantine reject requires a RECORD_ID and CANDIDATE_ID",
          );
        }
        printJson(
          acquisitionStore.rejectCandidate(
            recordId,
            candidateId,
            toolOptions.description,
          ),
        );
        return;
      }

      printJson(
        inspectToolPlan({
          ...toolOptions,
          positionals: [
            subcommand,
            recordId,
            candidateId,
            ...queryParts,
          ].filter(Boolean),
        }).internalPlan.acquisition?.quarantine || null,
      );
      return;
    }

    if (toolCommand === "build-local") {
      const [recordId] = toolOptions.positionals;
      if (!recordId) {
        throw new Error("Tools build-local requires a RECORD_ID");
      }

      const record = acquisitionStore.getAcquisition(recordId);
      if (!record) {
        throw new Error(`Unknown acquisition record: ${recordId}`);
      }

      const template =
        toolOptions.template || record.build?.recommendedTemplates?.[0]?.id;
      if (!template) {
        throw new Error(
          "Tools build-local requires a template or a record with a recommended template",
        );
      }

      const fallbackId = String(
        record.primaryCapabilityId ||
          record.requirement?.label ||
          "jasper-tool",
      )
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      const generation = generateToolFromTemplate({
        id: toolOptions.id || fallbackId,
        template,
        description:
          toolOptions.description ||
          `${record.requirement?.label || "Jasper"} tool`,
        toolsRoot: toolOptions.toolsRoot,
        query: toolOptions.query || record.request,
        limit: toolOptions.limit,
        type: toolOptions.type,
        source: toolOptions.source,
      });

      printJson({
        generation,
        acquisition: acquisitionStore.recordGeneratedBuild(
          recordId,
          generation,
        ),
      });
      return;
    }

    if (toolCommand === "activate") {
      const [recordId, candidateId] = toolOptions.positionals;
      if (!recordId || !candidateId) {
        throw new Error("Tools activate requires a RECORD_ID and CANDIDATE_ID");
      }

      printJson(
        acquisitionStore.activateCandidate(
          recordId,
          candidateId,
          toolOptions.description,
        ),
      );
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
