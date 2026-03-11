import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cosineSimilarity } from "./embeddings.js";
import { createEventEmbedding } from "./embeddings.js";
import { embedText } from "./embeddings.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const memoryRoot = path.resolve(__dirname, "..");

const MEMORY_DIRECTORIES = [
  "data/events",
  "data/embeddings",
  "data/clusters",
  "data/reflections",
];

function normalizeLimit(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.floor(parsed);
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) {
    return [];
  }

  return tags
    .map((tag) => String(tag || "").trim())
    .filter(Boolean);
}

function tokenize(value) {
  return String(value || "").toLowerCase().match(/[a-z0-9]+/g) || [];
}

function stableEventText(event) {
  return JSON.stringify({
    type: event.type,
    source: event.source,
    tags: event.tags,
    payload: event.payload,
  }).toLowerCase();
}

function scoreEvent(event, queryTokens) {
  const eventType = String(event.type || "").toLowerCase();
  const source = String(event.source || "").toLowerCase();
  const tags = normalizeTags(event.tags).map((tag) => tag.toLowerCase());
  const text = stableEventText(event);

  let score = 0;
  for (const token of queryTokens) {
    if (eventType === token) {
      score += 5;
    }
    if (source === token) {
      score += 4;
    }
    if (tags.includes(token)) {
      score += 3;
    }
    if (text.includes(token)) {
      score += 1;
    }
  }

  return score;
}

function parseEventLine(line) {
  if (!line.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(line);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function parseEmbeddingLine(line) {
  if (!line.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(line);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function defaultMemoryRoot() {
  return memoryRoot;
}

export function ensureMemoryLayout(options = {}) {
  const root = path.resolve(options.root || defaultMemoryRoot());
  for (const relativeDir of MEMORY_DIRECTORIES) {
    fs.mkdirSync(path.join(root, relativeDir), { recursive: true });
  }

  return {
    root,
    dataDir: path.join(root, "data"),
    eventsDir: path.join(root, "data", "events"),
    embeddingsDir: path.join(root, "data", "embeddings"),
    clustersDir: path.join(root, "data", "clusters"),
    reflectionsDir: path.join(root, "data", "reflections"),
  };
}

export function defaultEventLogPath(options = {}) {
  const layout = ensureMemoryLayout(options);
  return path.join(layout.eventsDir, "events.jsonl");
}

export function defaultEmbeddingLogPath(options = {}) {
  const layout = ensureMemoryLayout(options);
  return path.join(layout.embeddingsDir, "events.jsonl");
}

export function createMemoryEvent(input = {}) {
  const type = String(input.type || "").trim();
  const source = String(input.source || "jasper").trim();
  if (!type) {
    throw new Error('Memory event "type" must be a non-empty string');
  }
  if (!source) {
    throw new Error('Memory event "source" must be a non-empty string');
  }

  const payload =
    input.payload && typeof input.payload === "object" && !Array.isArray(input.payload)
      ? input.payload
      : { value: input.payload ?? null };

  const sessionId = input.sessionId ? String(input.sessionId) : null;

  return {
    schemaVersion: 1,
    id: input.id || `evt_${randomUUID()}`,
    ts: input.ts || new Date().toISOString(),
    type,
    source,
    tags: normalizeTags(input.tags),
    session: sessionId ? { id: sessionId } : null,
    payload,
  };
}

export class JasperEventStore {
  constructor(options = {}) {
    this.layout = ensureMemoryLayout({ root: options.root });
    this.root = this.layout.root;
    this.defaultSource = String(options.source || "jasper").trim() || "jasper";
    this.eventLogPath = defaultEventLogPath({ root: this.root });
    this.embeddingLogPath = defaultEmbeddingLogPath({ root: this.root });
    this.embeddingDimension = Math.max(8, Number(options.embeddingDimension ?? 64));
  }

  appendEvent(input = {}) {
    const event = createMemoryEvent({
      ...input,
      source: input.source || this.defaultSource,
    });
    fs.appendFileSync(this.eventLogPath, `${JSON.stringify(event)}\n`, "utf8");
    const embedding = createEventEmbedding(event, {
      dimension: this.embeddingDimension,
    });
    fs.appendFileSync(this.embeddingLogPath, `${JSON.stringify(embedding)}\n`, "utf8");
    return event;
  }

  readEvents() {
    if (!fs.existsSync(this.eventLogPath)) {
      return [];
    }

    return fs
      .readFileSync(this.eventLogPath, "utf8")
      .split(/\r?\n/)
      .map(parseEventLine)
      .filter(Boolean);
  }

  queryEvents(options = {}) {
    const expectedType = options.type ? String(options.type).trim() : "";
    const expectedSource = options.source ? String(options.source).trim() : "";
    const requiredTags = normalizeTags(options.tags);
    const excludeSessionId = options.excludeSessionId ? String(options.excludeSessionId) : "";

    return this.readEvents().filter((event) => {
      if (expectedType && event.type !== expectedType) {
        return false;
      }
      if (expectedSource && event.source !== expectedSource) {
        return false;
      }
      if (excludeSessionId && event.session?.id === excludeSessionId) {
        return false;
      }
      if (requiredTags.length > 0) {
        const eventTags = normalizeTags(event.tags);
        if (!requiredTags.every((tag) => eventTags.includes(tag))) {
          return false;
        }
      }
      return true;
    });
  }

  readEmbeddings() {
    if (!fs.existsSync(this.embeddingLogPath)) {
      return [];
    }

    return fs
      .readFileSync(this.embeddingLogPath, "utf8")
      .split(/\r?\n/)
      .map(parseEmbeddingLine)
      .filter(Boolean);
  }

  listRecentEvents(options = {}) {
    const limit = normalizeLimit(options.limit, 20);
    return this.queryEvents(options).slice(-limit).reverse();
  }

  searchRelevantEvents(options = {}) {
    const queryTokens = [...new Set(tokenize(options.query))];
    if (queryTokens.length === 0) {
      return [];
    }

    const limit = normalizeLimit(options.limit, 10);
    return this.queryEvents(options)
      .map((event) => ({
        event,
        relevanceScore: scoreEvent(event, queryTokens),
      }))
      .filter((item) => item.relevanceScore > 0)
      .sort((left, right) => {
        if (right.relevanceScore !== left.relevanceScore) {
          return right.relevanceScore - left.relevanceScore;
        }
        return String(right.event.ts || "").localeCompare(String(left.event.ts || ""));
      })
      .slice(0, limit)
      .map((item) => ({
        ...item.event,
        relevanceScore: item.relevanceScore,
      }));
  }

  searchSemanticEvents(options = {}) {
    const query = String(options.query || "").trim();
    if (!query) {
      return [];
    }

    const limit = normalizeLimit(options.limit, 10);
    const queryVector = embedText(query, {
      dimension: this.embeddingDimension,
    });
    const eventMap = new Map(this.queryEvents(options).map((event) => [event.id, event]));

    return this.readEmbeddings()
      .filter((embedding) => eventMap.has(embedding.eventId))
      .map((embedding) => {
        const event = eventMap.get(embedding.eventId);
        return {
          event,
          vectorScore: cosineSimilarity(queryVector, embedding.vector),
        };
      })
      .filter((item) => item.event && item.vectorScore > 0)
      .sort((left, right) => {
        if (right.vectorScore !== left.vectorScore) {
          return right.vectorScore - left.vectorScore;
        }
        return String(right.event.ts || "").localeCompare(String(left.event.ts || ""));
      })
      .slice(0, limit)
      .map((item) => ({
        ...item.event,
        vectorScore: item.vectorScore,
      }));
  }
}

export function createEventStore(options = {}) {
  return new JasperEventStore(options);
}
