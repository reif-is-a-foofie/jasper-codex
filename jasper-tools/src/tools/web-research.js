import { runCodexWebResearch } from "../web-research-runner.js";

export function createWebResearchTool(context) {
  return {
    id: "web-research",
    description: "Run first-party web research through Jasper's Codex bridge.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
      },
      required: ["query"],
      additionalProperties: false,
    },
    async run(input = {}) {
      const query = String(input.query || "").trim();
      if (!query) {
        throw new Error('Tool "web-research" requires a non-empty query');
      }

      const runner =
        context.webResearchRunner ||
        ((request) =>
          runCodexWebResearch(request, {
            executablePath: context.codexExecutablePath,
            workingDirectory: context.codexWorkingDirectory,
          }));

      return await runner(query);
    },
  };
}
