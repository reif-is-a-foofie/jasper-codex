import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultToolsRoot = path.resolve(__dirname, "..");

function toKebabCase(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeLimit(value, fallback = 5) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.floor(parsed);
}

export function resolveToolsRoot(inputRoot) {
  return path.resolve(inputRoot || defaultToolsRoot);
}

export function generatedRegistryPath(inputRoot) {
  return path.join(resolveToolsRoot(inputRoot), "generated", "registry.json");
}

export function generatedToolsDir(inputRoot) {
  return path.join(resolveToolsRoot(inputRoot), "generated", "tools");
}

export function ensureGeneratedLayout(inputRoot) {
  const toolsRoot = resolveToolsRoot(inputRoot);
  const registryPath = generatedRegistryPath(toolsRoot);
  const toolsDir = generatedToolsDir(toolsRoot);
  fs.mkdirSync(toolsDir, { recursive: true });
  if (!fs.existsSync(registryPath)) {
    fs.writeFileSync(registryPath, "[]\n", "utf8");
  }
  return {
    toolsRoot,
    registryPath,
    toolsDir,
  };
}

export function loadGeneratedRegistry(inputRoot) {
  const layout = ensureGeneratedLayout(inputRoot);
  return JSON.parse(fs.readFileSync(layout.registryPath, "utf8"));
}

export function saveGeneratedRegistry(entries, inputRoot) {
  const layout = ensureGeneratedLayout(inputRoot);
  fs.writeFileSync(layout.registryPath, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
  return layout.registryPath;
}

export function listGeneratorTemplates() {
  return [
    {
      id: "recent-memory",
      description: "Return recent Jasper memory events with optional source/type filters.",
    },
    {
      id: "semantic-memory-search",
      description: "Search Jasper memory with a saved semantic query and optional filters.",
    },
  ];
}

export function createGeneratedToolSpec(options = {}) {
  const id = toKebabCase(options.id);
  const template = String(options.template || "").trim();
  const description = String(options.description || "").trim();

  if (!id) {
    throw new Error("Generated tool requires a non-empty id");
  }
  if (!template) {
    throw new Error("Generated tool requires a template");
  }
  if (!description) {
    throw new Error("Generated tool requires a description");
  }

  return {
    schemaVersion: 1,
    id,
    template,
    description,
    createdAt: new Date().toISOString(),
    defaults: {
      limit: normalizeLimit(options.limit, 5),
      query: options.query ? String(options.query) : undefined,
      type: options.type ? String(options.type) : undefined,
      source: options.source ? String(options.source) : undefined,
    },
  };
}

export function renderGeneratedToolModule(spec) {
  return `export default ${JSON.stringify(spec, null, 2)};\n`;
}

export function generateToolFromTemplate(options = {}) {
  const layout = ensureGeneratedLayout(options.toolsRoot);
  const spec = createGeneratedToolSpec(options);
  const moduleFilename = `${spec.id}.js`;
  const modulePath = path.join(layout.toolsDir, moduleFilename);
  fs.writeFileSync(modulePath, renderGeneratedToolModule(spec), "utf8");

  const registry = loadGeneratedRegistry(layout.toolsRoot).filter((entry) => entry.id !== spec.id);
  const metadata = {
    id: spec.id,
    description: spec.description,
    template: spec.template,
    createdAt: spec.createdAt,
    modulePath: `generated/tools/${moduleFilename}`,
    defaults: spec.defaults,
  };
  registry.push(metadata);
  registry.sort((left, right) => left.id.localeCompare(right.id));
  saveGeneratedRegistry(registry, layout.toolsRoot);

  return {
    spec,
    metadata,
    modulePath,
    registryPath: layout.registryPath,
  };
}
