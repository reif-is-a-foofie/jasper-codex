import { loadIdentityConfig } from "../../jasper-core/src/identity.js";
import { createEventStore } from "../../jasper-memory/src/event-store.js";
import { createConnectorStore } from "../../jasper-agent/src/connector-store.js";
import { materializeGeneratedTool } from "./generated-tool.js";
import { loadGeneratedRegistry } from "./generator.js";
import { createAppsStatusTool } from "./tools/apps-status.js";
import { createCalendarReadTool } from "./tools/calendar-read.js";
import { createIdentitySummaryTool } from "./tools/identity-summary.js";
import { createRecentMemoryTool } from "./tools/recent-memory.js";
import { createSemanticMemorySearchTool } from "./tools/semantic-memory-search.js";
import { createWebResearchTool } from "./tools/web-research.js";

export function createToolContext(options = {}) {
  return {
    jasperHome: options.jasperHome,
    identity: loadIdentityConfig({ identityPath: options.identityPath }),
    memory: createEventStore({
      root: options.memoryRoot,
      jasperHome: options.jasperHome,
    }),
    webResearchRunner: options.webResearchRunner,
    calendarReadRunner: options.calendarReadRunner,
    codexExecutablePath: options.codexExecutablePath,
    codexWorkingDirectory: options.codexWorkingDirectory,
  };
}

export function createToolRegistry(options = {}) {
  const context = createToolContext(options);
  const activeConnectors = new Set(
    (
      options.activeConnectors ||
      createConnectorStore({ jasperHome: options.jasperHome })
        .listActiveConnectors()
        .map((connector) => connector.id)
    ).map((connectorId) => String(connectorId || "").trim()),
  );
  const generatedTools = loadGeneratedRegistry(options.toolsRoot).map((entry) =>
    materializeGeneratedTool(
      {
        id: entry.id,
        template: entry.template,
        description: entry.description,
        defaults: entry.defaults,
      },
      context,
    ),
  );
  const tools = [
    createAppsStatusTool(context),
    createIdentitySummaryTool(context),
    createRecentMemoryTool(context),
    createSemanticMemorySearchTool(context),
    createWebResearchTool(context),
    ...generatedTools,
  ];
  if (activeConnectors.has("calendar")) {
    tools.splice(1, 0, createCalendarReadTool(context));
  }

  return {
    listTools() {
      return tools.map((tool) => ({
        id: tool.id,
        description: tool.description,
        inputSchema: tool.inputSchema,
      }));
    },
    getTool(toolId) {
      return tools.find((tool) => tool.id === toolId) || null;
    },
    async runTool(toolId, input = {}) {
      const tool = this.getTool(toolId);
      if (!tool) {
        throw new Error(`Unknown Jasper tool: ${toolId}`);
      }

      return {
        tool: {
          id: tool.id,
          description: tool.description,
        },
        input,
        output: await tool.run(input),
      };
    },
  };
}
