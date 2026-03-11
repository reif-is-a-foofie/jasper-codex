import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ensureMemoryLayout } from "./event-store.js";
import { createEventStore } from "./event-store.js";

function normalizeLimit(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.floor(parsed);
}

function appendJsonLine(filePath, value) {
  fs.appendFileSync(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

function readJsonLines(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function buildClusterKey(event) {
  return `${event.source}:${event.type}`;
}

function buildTopicClusters(events) {
  const clusters = new Map();

  for (const event of events) {
    const key = buildClusterKey(event);
    const existing = clusters.get(key) || {
      key,
      label: key,
      eventCount: 0,
      eventIds: [],
      sources: new Set(),
      types: new Set(),
      lastSeenAt: event.ts,
    };

    existing.eventCount += 1;
    existing.eventIds.push(event.id);
    existing.sources.add(event.source);
    existing.types.add(event.type);
    existing.lastSeenAt = String(existing.lastSeenAt) > String(event.ts) ? existing.lastSeenAt : event.ts;
    clusters.set(key, existing);
  }

  return [...clusters.values()]
    .map((cluster) => ({
      key: cluster.key,
      label: cluster.label,
      eventCount: cluster.eventCount,
      eventIds: cluster.eventIds,
      sources: [...cluster.sources],
      types: [...cluster.types],
      lastSeenAt: cluster.lastSeenAt,
    }))
    .sort((left, right) => {
      if (right.eventCount !== left.eventCount) {
        return right.eventCount - left.eventCount;
      }
      return String(right.lastSeenAt).localeCompare(String(left.lastSeenAt));
    });
}

function buildTypeCounts(events) {
  const counts = new Map();
  for (const event of events) {
    counts.set(event.type, (counts.get(event.type) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((left, right) => right.count - left.count);
}

function buildSourceCounts(events) {
  const counts = new Map();
  for (const event of events) {
    counts.set(event.source, (counts.get(event.source) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((left, right) => right.count - left.count);
}

function buildRecommendations(events, clusters) {
  const recommendations = [];
  const filesystemChanges = events.filter((event) => event.type === "listener.filesystem.changed");
  const listenerSnapshots = events.filter((event) => event.type.startsWith("listener."));

  if (filesystemChanges.length > 0) {
    const recentChangeCount = filesystemChanges.reduce(
      (sum, event) => sum + Number(event.payload?.changeCount || 0),
      0,
    );
    recommendations.push(`Review ${recentChangeCount} recent filesystem changes for meaningful updates.`);
  }

  if (listenerSnapshots.length === 0) {
    recommendations.push("Increase environment coverage so dream-state summaries have richer operating context.");
  }

  if (clusters.length > 0 && clusters[0].eventCount >= 3) {
    recommendations.push(`Promote repeated cluster "${clusters[0].label}" into a dedicated Jasper workflow or tool.`);
  }

  if (recommendations.length === 0) {
    recommendations.push("No urgent patterns detected. Continue collecting environment observations.");
  }

  return recommendations;
}

function createReflectionRecord(events, clusters, options = {}) {
  const orderedEvents = [...events].sort((left, right) => String(left.ts).localeCompare(String(right.ts)));
  const firstEventAt = orderedEvents[0]?.ts || null;
  const lastEventAt = orderedEvents[orderedEvents.length - 1]?.ts || null;

  return {
    schemaVersion: 1,
    id: `refl_${randomUUID()}`,
    generatedAt: new Date().toISOString(),
    mode: "dream-state",
    window: {
      eventLimit: orderedEvents.length,
      firstEventAt,
      lastEventAt,
    },
    totals: {
      eventCount: orderedEvents.length,
      typeCounts: buildTypeCounts(orderedEvents),
      sourceCounts: buildSourceCounts(orderedEvents),
    },
    clusters: clusters.slice(0, normalizeLimit(options.clusterLimit, 5)),
    highlights: orderedEvents.slice(-normalizeLimit(options.highlightLimit, 5)).map((event) => ({
      id: event.id,
      ts: event.ts,
      type: event.type,
      source: event.source,
    })),
    recommendations: buildRecommendations(orderedEvents, clusters),
  };
}

export function defaultReflectionLogPath(options = {}) {
  const layout = ensureMemoryLayout({ root: options.root });
  return path.join(layout.reflectionsDir, "reflections.jsonl");
}

export function defaultClusterLogPath(options = {}) {
  const layout = ensureMemoryLayout({ root: options.root });
  return path.join(layout.clustersDir, "clusters.jsonl");
}

export class JasperReflectionStore {
  constructor(options = {}) {
    this.layout = ensureMemoryLayout({ root: options.root });
    this.memory = createEventStore({ root: this.layout.root });
    this.reflectionLogPath = defaultReflectionLogPath({ root: this.layout.root });
    this.clusterLogPath = defaultClusterLogPath({ root: this.layout.root });
  }

  generateReflection(options = {}) {
    const events = this.memory.listRecentEvents({
      limit: normalizeLimit(options.limit, 50),
      type: options.type,
      source: options.source,
    });
    const chronologicalEvents = [...events].reverse();
    const clusters = buildTopicClusters(chronologicalEvents);
    const reflection = createReflectionRecord(chronologicalEvents, clusters, options);
    return {
      reflection,
      clusters,
      events: chronologicalEvents,
    };
  }

  createAndStoreReflection(options = {}) {
    const result = this.generateReflection(options);
    appendJsonLine(this.reflectionLogPath, result.reflection);
    appendJsonLine(this.clusterLogPath, {
      reflectionId: result.reflection.id,
      generatedAt: result.reflection.generatedAt,
      clusters: result.clusters,
    });
    return result;
  }

  listRecentReflections(options = {}) {
    const limit = normalizeLimit(options.limit, 10);
    return readJsonLines(this.reflectionLogPath).slice(-limit).reverse();
  }
}

export function createReflectionStore(options = {}) {
  return new JasperReflectionStore(options);
}
