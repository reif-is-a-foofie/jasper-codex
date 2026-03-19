import { createEventStore } from "../../jasper-memory/src/event-store.js";

const STRATEGIC_EVENT_TYPES = [
  "memory.commitment",
  "memory.goal",
  "memory.constraint",
];

function defaultEventStore(options = {}) {
  return createEventStore({
    root: options.memoryRoot,
    jasperHome: options.jasperHome,
    source: "jasper-strategic",
  });
}

function normalizeLimit(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.floor(parsed);
}

function mapCommitmentEvent(event) {
  const payload = event.payload || {};
  const subject =
    String(payload.subject || payload.summary || payload.label || "")
      .trim() || "commitment";
  return {
    id: event.id,
    subject,
    summary: String(payload.summary || subject).trim(),
    status: String(payload.status || "open").trim(),
    confidence: Math.min(
      1,
      Math.max(0, Number(payload.confidence ?? 1)),
    ),
    updatedAt: event.ts,
    source: event.source,
    context: payload.context || {},
  };
}

export function createStrategicMemoryManager(options = {}) {
  const memory = options.memory || defaultEventStore(options);

  function listStrategicEvents(listOptions = {}) {
    const limit = normalizeLimit(listOptions.limit, 10);
    return memory
      .listRecentEvents({ limit })
      .filter((event) => STRATEGIC_EVENT_TYPES.includes(event.type))
      .map((event) => ({
        id: event.id,
        type: event.type,
        summary: String(event.payload?.summary || event.type).trim(),
        timestamp: event.ts,
        tags: event.tags,
      }));
  }

  function listCommitments(listOptions = {}) {
    const limit = normalizeLimit(listOptions.limit, 20);
    return memory
      .listRecentEvents({ limit })
      .filter((event) => event.type === "memory.commitment")
      .map(mapCommitmentEvent);
  }

  function recordCommitment(input = {}) {
    const event = memory.appendEvent({
      type: "memory.commitment",
      source: input.source || "jasper-strategic",
      tags: ["memory", "commitment"],
      payload: {
        subject: input.subject || input.summary || "commitment",
        summary: input.summary || "",
        status: input.status || "open",
        confidence: Math.min(
          1,
          Math.max(0, Number(input.confidence ?? 1)),
        ),
        context: input.context || {},
        stage: input.stage || "recorded",
      },
    });

    return mapCommitmentEvent(event);
  }

  function auditCommitments(auditOptions = {}) {
    const limit = Math.max(5, Number(auditOptions.limit || 40));
    const events = memory
      .listRecentEvents({ limit })
      .filter((event) => event.type === "memory.commitment");

    const subjects = new Map();
    for (const event of events) {
      const commitment = mapCommitmentEvent(event);
      const existing = subjects.get(commitment.subject) || {
        statuses: new Set(),
        events: [],
      };
      existing.statuses.add(commitment.status);
      existing.events.push(commitment);
      subjects.set(commitment.subject, existing);
    }

    const contradictions = [];
    for (const [subject, entry] of subjects) {
      if (entry.statuses.size > 1) {
        contradictions.push({
          subject,
          statuses: [...entry.statuses],
          latest: entry.events[0],
          history: entry.events,
        });
      }
    }

    return {
      totalCommitments: events.length,
      contradictions,
      summary: contradictions.length
        ? `${contradictions.length} subject(s) have status drift`
        : "no contradictions detected",
    };
  }

  return {
    listStrategicEvents,
    listCommitments,
    recordCommitment,
    auditCommitments,
  };
}
