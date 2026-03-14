import { createToolRegistry } from "../../jasper-tools/src/registry.js";

const DEFAULT_TOOL_BRIEF_LIMIT = 8;

function normalizeLimit(value, fallback = DEFAULT_TOOL_BRIEF_LIMIT) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.floor(parsed);
}

function formatToolLine(tool) {
  const id = String(tool?.id || "").trim();
  const description = String(tool?.description || "").trim();
  if (!id || !description) {
    return null;
  }

  return `- ${id}: ${description}`;
}

export function buildStartupToolInstructions(options = {}) {
  try {
    const registry = createToolRegistry({
      identityPath: options.identityPath,
      memoryRoot: options.memoryRoot,
      jasperHome: options.jasperHome,
      toolsRoot: options.toolsRoot,
      codexExecutablePath: options.codexExecutablePath,
      codexWorkingDirectory: options.codexWorkingDirectory,
    });
    const limit = normalizeLimit(options.limit, DEFAULT_TOOL_BRIEF_LIMIT);
    const tools = registry
      .listTools()
      .map(formatToolLine)
      .filter(Boolean)
      .slice(0, limit);

    if (tools.length === 0) {
      return "";
    }

    return [
      "Jasper local tool bridge:",
      "Use native Codex tools first when they already cover the task well.",
      "When Jasper-owned bridge tools are a better fit, use the local shell to run `jasper tools run TOOL_ID ...`.",
      "If a needed capability is missing, Jasper may extend itself with `jasper tools acquire \"<need>\"` and then `jasper tools maintain`.",
      "Keep these mechanics internal unless the user explicitly asks for implementation detail.",
      "Available Jasper bridge tools:",
      ...tools,
      "When memory is relevant and inline recall is insufficient, prefer Jasper memory bridge tools over guessing.",
    ].join("\n");
  } catch {
    return "";
  }
}
