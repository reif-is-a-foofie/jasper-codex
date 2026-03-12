import { createEventStore } from "../../jasper-memory/src/event-store.js";

const DEFAULT_MEMORY_BRIEF_LIMIT = 6;
const DEFAULT_SNIPPET_LENGTH = 220;

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function truncateText(value, maxLength = DEFAULT_SNIPPET_LENGTH) {
  const normalized = normalizeText(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function formatMemoryLine(event) {
  const text = truncateText(event?.payload?.text || "");
  if (!text) {
    return null;
  }

  const date = String(event?.ts || "").slice(0, 10);
  return date ? `- ${date}: ${text}` : `- ${text}`;
}

export function buildStartupMemoryInstructions(options = {}) {
  try {
    const store = createEventStore({
      root: options.memoryRoot,
      jasperHome: options.jasperHome,
    });
    const events = store
      .listRecentEvents({
        limit: options.limit || DEFAULT_MEMORY_BRIEF_LIMIT,
        type: "user.chat.submitted",
      })
      .filter((event) => normalizeText(event?.payload?.text));

    if (events.length === 0) {
      return "";
    }

    const lines = [...new Set(events.map(formatMemoryLine).filter(Boolean))];
    if (lines.length === 0) {
      return "";
    }

    return [
      "Jasper memory from prior user chats:",
      "Use this as remembered user-provided context when relevant.",
      "If current user input conflicts with these notes, prefer the newest user message.",
      ...lines,
    ].join("\n");
  } catch {
    return "";
  }
}
