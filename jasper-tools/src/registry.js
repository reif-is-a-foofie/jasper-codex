import { loadIdentityConfig } from "../../jasper-core/src/identity.js";
import { createEventStore } from "../../jasper-memory/src/event-store.js";
import { materializeGeneratedTool } from "./generated-tool.js";
import { loadGeneratedRegistry } from "./generator.js";
import { createIdentitySummaryTool } from "./tools/identity-summary.js";
import { createRecentMemoryTool } from "./tools/recent-memory.js";
import { createSemanticMemorySearchTool } from "./tools/semantic-memory-search.js";

export function createToolContext(options = {}) {
  return {
    identity: loadIdentityConfig({ identityPath: options.identityPath }),
    memory: createEventStore({ root: options.memoryRoot }),
  };
}

export function createToolRegistry(options = {}) {
  const context = createToolContext(options);
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
    createIdentitySummaryTool(context),
    createRecentMemoryTool(context),
    createSemanticMemorySearchTool(context),
    ...generatedTools,
  ];

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
