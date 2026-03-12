import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultManifestoConfigPath } from "./home.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const coreRoot = path.resolve(__dirname, "..");

function countIndent(rawLine) {
  let count = 0;
  for (const char of rawLine) {
    if (char !== " ") {
      break;
    }
    count += 1;
  }
  return count;
}

function parseScalar(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return "";
  }
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function splitKeyValue(trimmed) {
  const separatorIndex = trimmed.indexOf(":");
  if (separatorIndex < 0) {
    throw new Error(`Invalid manifesto line: ${trimmed}`);
  }

  return [
    trimmed.slice(0, separatorIndex).trim(),
    trimmed.slice(separatorIndex + 1).trim(),
  ];
}

function parseManifestoYaml(sourceText) {
  const lines = String(sourceText || "").split(/\r?\n/);
  const manifesto = { principles: [] };
  let currentPrinciple = null;
  let inScripture = false;

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const indent = countIndent(rawLine);
    if (indent === 0 && trimmed === "manifesto:") {
      continue;
    }

    if (indent === 2 && trimmed.startsWith("description:")) {
      const [, remainder] = splitKeyValue(trimmed);
      if (remainder && remainder !== ">" && remainder !== "|") {
        manifesto.description = String(parseScalar(remainder));
        continue;
      }

      const descriptionLines = [];
      while (index + 1 < lines.length) {
        const nextLine = lines[index + 1];
        const nextTrimmed = nextLine.trim();
        const nextIndent = nextTrimmed ? countIndent(nextLine) : -1;
        if (!nextTrimmed) {
          index += 1;
          continue;
        }
        if (nextIndent <= indent) {
          break;
        }
        descriptionLines.push(nextTrimmed);
        index += 1;
      }
      manifesto.description = descriptionLines.join(" ").trim();
      continue;
    }

    if (indent === 2 && trimmed === "principles:") {
      continue;
    }

    if (indent === 2) {
      const [key, value] = splitKeyValue(trimmed);
      manifesto[key] = parseScalar(value);
      continue;
    }

    if (indent === 4 && trimmed.startsWith("- ")) {
      const [key, value] = splitKeyValue(trimmed.slice(2).trim());
      currentPrinciple = { scripture: {} };
      currentPrinciple[key] = parseScalar(value);
      manifesto.principles.push(currentPrinciple);
      inScripture = false;
      continue;
    }

    if (!currentPrinciple) {
      continue;
    }

    if (indent === 6 && trimmed === "scripture:") {
      inScripture = true;
      continue;
    }

    if (indent === 6) {
      const [key, value] = splitKeyValue(trimmed);
      currentPrinciple[key] = parseScalar(value);
      inScripture = false;
      continue;
    }

    if (indent === 8 && inScripture) {
      const [key, value] = splitKeyValue(trimmed);
      currentPrinciple.scripture[key] = parseScalar(value);
      continue;
    }
  }

  return { manifesto };
}

function assertNonEmptyString(value, fieldName) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Manifesto field "${fieldName}" must be a non-empty string`);
  }
}

function validateManifesto(doc) {
  if (!doc || typeof doc !== "object" || !doc.manifesto) {
    throw new Error("Manifesto file must contain a top-level manifesto object");
  }

  const manifesto = doc.manifesto;
  assertNonEmptyString(manifesto.name, "manifesto.name");
  assertNonEmptyString(String(manifesto.version || ""), "manifesto.version");
  assertNonEmptyString(manifesto.description, "manifesto.description");
  if (!Array.isArray(manifesto.principles) || manifesto.principles.length === 0) {
    throw new Error("Manifesto must include at least one principle");
  }

  return {
    name: manifesto.name.trim(),
    version: String(manifesto.version).trim(),
    description: manifesto.description.trim(),
    principles: manifesto.principles.map((principle, index) => {
      if (!principle || typeof principle !== "object") {
        throw new Error(`Manifesto principle ${index + 1} must be an object`);
      }
      assertNonEmptyString(principle.id, `manifesto.principles[${index}].id`);
      assertNonEmptyString(
        principle.virtue,
        `manifesto.principles[${index}].virtue`,
      );
      if (!principle.scripture || typeof principle.scripture !== "object") {
        throw new Error(
          `Manifesto principle ${index + 1} must include a scripture object`,
        );
      }
      assertNonEmptyString(
        principle.scripture.text,
        `manifesto.principles[${index}].scripture.text`,
      );
      assertNonEmptyString(
        principle.scripture.book,
        `manifesto.principles[${index}].scripture.book`,
      );
      assertNonEmptyString(
        String(principle.scripture.chapter || ""),
        `manifesto.principles[${index}].scripture.chapter`,
      );
      assertNonEmptyString(
        String(principle.scripture.verse || ""),
        `manifesto.principles[${index}].scripture.verse`,
      );
      assertNonEmptyString(
        principle.scripture.canon,
        `manifesto.principles[${index}].scripture.canon`,
      );

      return {
        id: principle.id.trim(),
        virtue: principle.virtue.trim(),
        scripture: {
          text: principle.scripture.text.trim(),
          book: principle.scripture.book.trim(),
          chapter: Number(principle.scripture.chapter),
          verse: Number(principle.scripture.verse),
          canon: principle.scripture.canon.trim(),
        },
      };
    }),
  };
}

export function bundledManifestoPath() {
  return path.join(coreRoot, "config", "companion-manifesto.yaml");
}

export function defaultManifestoPath(options = {}) {
  const installedPath = defaultManifestoConfigPath(options);
  if (fs.existsSync(installedPath)) {
    return installedPath;
  }
  return bundledManifestoPath();
}

export function loadCompanionManifesto(options = {}) {
  const manifestoPath = path.resolve(
    options.manifestoPath || defaultManifestoPath(options),
  );
  const sourceText = fs.readFileSync(manifestoPath, "utf8");
  const rawManifesto = parseManifestoYaml(sourceText);
  const manifesto = validateManifesto(rawManifesto);

  return {
    path: manifestoPath,
    loadedAt: new Date().toISOString(),
    manifesto,
  };
}

export function buildManifestoInstructions(options = {}) {
  const { manifesto } = loadCompanionManifesto(options);
  const principleLines = manifesto.principles.map((principle) => {
    const reference = `${principle.scripture.book} ${principle.scripture.chapter}:${principle.scripture.verse}`;
    return `- ${principle.virtue}: ${principle.scripture.text} (${reference}, ${principle.scripture.canon})`;
  });

  return [
    `Behavioral covenant: ${manifesto.name} v${manifesto.version}.`,
    manifesto.description,
    "Let these principles shape Jasper's behavior as a companion, servant, and steward.",
    "Serve with charity, humility, diligence, preparedness, forgiveness, joy, wisdom, and steadfastness.",
    "Do not preach unless asked; instead embody these principles through calm, useful, faithful action.",
    "Companion principles:",
    ...principleLines,
  ].join("\n");
}
