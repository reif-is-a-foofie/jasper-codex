import { randomUUID } from "node:crypto";
import { createEventStore } from "../../jasper-memory/src/event-store.js";

const THREAD_EVENT = "comms.thread";
const FOLLOWUP_EVENT = "comms.followup";
const DRAFT_EVENT = "comms.draft";

function defaultEventStore(options = {}) {
  return createEventStore({
    root: options.memoryRoot,
    jasperHome: options.jasperHome,
    source: "jasper-comms",
  });
}

function normalizeLimit(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.floor(parsed);
}

function mapThread(threadEvent, followups = []) {
  const payload = threadEvent.payload || {};
  const threadId = payload.threadId || threadEvent.id;
  const urgency = Math.min(10, Math.max(1, Number(payload.urgency || 5)));
  const priority = payload.priority || (urgency >= 8 ? "high" : urgency >= 5 ? "medium" : "low");
  const followUp = followups
    .filter((entry) => entry.payload?.threadId === threadId)
    .map((entry) => ({
      id: entry.id,
      note: entry.payload.note,
      due: entry.payload.due,
      createdAt: entry.ts,
    }));

  return {
    threadId,
    summary: payload.summary || `Thread ${threadId}`,
    status: payload.status || "open",
    urgency,
    priority,
    updatedAt: threadEvent.ts,
    followUp,
    channel: payload.channel || "email",
    context: payload.context || {},
    actor: payload.actor || payload.participant || "unknown",
  };
}

export function createCommsManager(options = {}) {
  const memory = options.memory || defaultEventStore(options);

  function listThreads(listOptions = {}) {
    const limit = normalizeLimit(listOptions.limit, 20);
    const followUpEvents = memory
      .listRecentEvents({ limit: Math.max(200, limit) })
      .filter((event) => event.type === FOLLOWUP_EVENT);

    return memory
      .listRecentEvents({ limit: Math.max(200, limit) })
      .filter((event) => event.type === THREAD_EVENT)
      .map((event) => mapThread(event, followUpEvents))
      .sort((left, right) => right.urgency - left.urgency);
  }

  function recordThread(input = {}) {
    const threadId = input.threadId || `thread_${randomUUID()}`;
    const urgency = Number(input.urgency ?? 5);
    const computedPriority =
      input.priority ||
      (urgency >= 8 ? "high" : urgency >= 5 ? "medium" : "low");
    const payload = {
      threadId,
      summary: input.summary || "",
      status: input.status || "open",
      urgency,
      priority: computedPriority,
      channel: input.channel || "email",
      actor: input.actor || "unknown",
      context: input.context || {},
    };

    const event = memory.appendEvent({
      type: THREAD_EVENT,
      source: "jasper-comms",
      tags: ["comms", "thread"],
      payload,
    });

    return mapThread(event, []);
  }

  function recordFollowUp(input = {}) {
    if (!input.threadId) {
      throw new Error("Follow-up recording requires a threadId");
    }
    const event = memory.appendEvent({
      type: FOLLOWUP_EVENT,
      source: "jasper-comms",
      tags: ["comms", "followup"],
      payload: {
        threadId: input.threadId,
        note: input.note || "",
        due: input.due || null,
      },
    });
    return event;
  }

  function generateBrief(options = {}) {
    const threads = listThreads({
      limit: options.limit,
    });

    const high = threads.filter((thread) => thread.priority === "high");
    const summary = threads.slice(0, options.summaryCount || 3);
    return {
      timestamp: new Date().toISOString(),
      totalThreads: threads.length,
      urgent: high.length,
      summary: summary.map((thread) => ({
        threadId: thread.threadId,
        summary: thread.summary,
        urgency: thread.urgency,
        channel: thread.channel,
        actor: thread.actor,
      })),
      followUps: threads.flatMap((thread) =>
        thread.followUp.map((followUp) => ({
          threadId: thread.threadId,
          due: followUp.due,
          note: followUp.note,
        })),
      ),
    };
  }

  function draftReplies(options = {}) {
    const threads = listThreads({
      limit: options.limit,
    });

    return threads.slice(0, options.limit || 3).map((thread) => ({
      threadId: thread.threadId,
      draft: `Hi ${thread.actor},\n\nThanks for the update on ${thread.summary}. I’ll take care of the next steps and circle back by ${thread.followUp?.[0]?.due || "EOD"}.\n\nBest,\nJasper`,
      tone: options.voice || "calm",
    }));
  }

  function listPendingFollowUps(options = {}) {
    const threads = listThreads({
      limit: options.limit,
    });
    return threads.filter((thread) => thread.followUp.length > 0 && thread.status !== "closed");
  }

  return {
    listThreads,
    recordThread,
    recordFollowUp,
    generateBrief,
    draftReplies,
    listPendingFollowUps,
  };
}
