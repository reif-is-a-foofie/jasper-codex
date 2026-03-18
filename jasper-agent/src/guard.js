import { createEventStore } from "../../jasper-memory/src/event-store.js";

const DEFAULT_SENSITIVITY = {
  financial: 1,
  schedule: 1,
  mailbox: 1,
  security: 1,
  household: 1,
};

const DEFAULT_QUIET_WINDOWS = [
  {
    startHour: 22,
    endHour: 6,
  },
];

const DETECTION_KEYWORDS = [
  {
    category: "schedule",
    keywords: ["calendar", "schedule", "meeting", "agenda", "event"],
  },
  {
    category: "mailbox",
    keywords: ["email", "inbox", "mail", "message"],
  },
];

const SIMULATED_SCENARIOS = {
  "suspicious-login": {
    category: "security",
    severityScore: 90,
    detail: "Simulated suspicious login detected from an unfamiliar session.",
    escalationChannel: "security-team",
  },
  "unexpected-calendar-change": {
    category: "schedule",
    severityScore: 65,
    detail:
      "Simulated unexpected calendar change. Meetings shifted or new events appeared without notice.",
    escalationChannel: "calendar-ops",
  },
};

function normalizeHour(value) {
  const candidate = Number(value);
  if (!Number.isFinite(candidate)) {
    return 0;
  }
  return ((Math.floor(candidate) % 24) + 24) % 24;
}

function severityFromScore(score) {
  if (score >= 80) {
    return "high";
  }
  if (score >= 40) {
    return "medium";
  }
  return "low";
}

function escalationChannelForSeverity(severity) {
  if (severity === "high") {
    return "critical";
  }
  if (severity === "medium") {
    return "alert";
  }
  return "notice";
}

function describeEventPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  const priorityFields = ["summary", "note", "detail", "description", "value"];
  for (const field of priorityFields) {
    if (payload[field]) {
      return String(payload[field]).trim();
    }
  }
  const keys = Object.keys(payload);
  if (keys.length === 0) {
    return "";
  }
  return JSON.stringify(payload).slice(0, 160);
}

function defaultEventStore(options = {}) {
  return createEventStore({
    root: options.memoryRoot,
    jasperHome: options.jasperHome,
    source: "jasper-guard",
  });
}

export function createGuardManager(options = {}) {
  const memory = options.memory || defaultEventStore(options);
  const sensitivity = {
    ...DEFAULT_SENSITIVITY,
    ...(options.sensitivity || {}),
  };
  const quietWindows =
    Array.isArray(options.quietWindows) && options.quietWindows.length > 0
      ? options.quietWindows
      : DEFAULT_QUIET_WINDOWS;

  const state = {
    lastSessionSnapshotAt: 0,
    lastObservedFileCount: 0,
  };

  function isWithinQuietWindow(date) {
    const hour = date.getHours();
    return quietWindows.some((window) => {
      const start = normalizeHour(window.startHour);
      const end = normalizeHour(window.endHour);
      if (start < end) {
        return hour >= start && hour < end;
      }
      return hour >= start || hour < end;
    });
  }

  function adjustScoreForQuietWindow(score, timestamp) {
    const date = new Date(timestamp);
    if (isWithinQuietWindow(date)) {
      return Math.max(0, score - 20);
    }
    return score;
  }

  function recordAnomaly(anomaly) {
    const severity = severityFromScore(anomaly.severityScore);
    const tags = ["guard", severity];
    const event = memory.appendEvent({
      type: "guard.anomaly",
      source: "jasper-guard",
      tags,
      payload: {
        id: anomaly.id,
        category: anomaly.category,
        detail: anomaly.detail,
        severityScore: anomaly.severityScore,
        severity,
        escalationChannel:
          anomaly.escalationChannel || escalationChannelForSeverity(severity),
        sourceEventId: anomaly.sourceEventId || null,
        timestamp: anomaly.timestamp || new Date().toISOString(),
        context: anomaly.context || {},
        stage: anomaly.stage || "detected",
      },
    });
    return event;
  }

  function evaluateDetector(event, detector) {
    const detection = detector.detect(event, state);
    if (!detection) {
      return null;
    }
    const category = detector.category;
    const sensitivityFactor = Math.max(0, Number(sensitivity[category] ?? 1));
    let score = detection.severityScore * sensitivityFactor;
    score = Math.min(100, adjustScoreForQuietWindow(score, event.ts));
    if (score <= 0) {
      return null;
    }
    return recordAnomaly({
      id: detection.id || detector.id,
      category,
      detail: detection.detail,
      severityScore: score,
      escalationChannel: detection.escalationChannel,
      sourceEventId: event.id || null,
      timestamp: event.ts,
      context: {
        eventType: event.type,
        eventSummary: describeEventPayload(event.payload),
      },
    });
  }

  const detectors = [
    {
      id: "security.suspicious-login",
      category: "security",
      detect(event, state) {
        if (event.type !== "listener.session.snapshot") {
          return null;
        }
        const now = Date.parse(event.ts || "");
        if (!now) {
          return null;
        }
        const previous = state.lastSessionSnapshotAt;
        state.lastSessionSnapshotAt = now;
        if (!previous) {
          return null;
        }
        const delta = now - previous;
        if (delta < 10000) {
          return {
            severityScore: 85,
            detail: "Multiple session snapshots in quick succession suggest an unfamiliar login.",
          };
        }
        return null;
      },
    },
    {
      id: "system.security-configuration",
      category: "security",
      detect(event) {
        if (!event.type.includes("security")) {
          return null;
        }
        return {
          severityScore: 55,
          detail: "Security-related event logged; verify the configuration and context.",
        };
      },
    },
    {
      id: "schedule.unexpected-change",
      category: "schedule",
      detect(event) {
        const target = JSON.stringify(event.payload || "");
        const text = `${event.type} ${target}`.toLowerCase();
        if (
          DETECTION_KEYWORDS.find(
            (entry) =>
              entry.category === "schedule" &&
              entry.keywords.some((keyword) => text.includes(keyword)),
          )
        ) {
          return {
            severityScore: 55,
            detail: "Calendar or schedule signals changed unexpectedly.",
          };
        }
        return null;
      },
    },
    {
      id: "mailbox.spike",
      category: "mailbox",
      detect(event) {
        const target = JSON.stringify(event.payload || "");
        if (
          DETECTION_KEYWORDS.find(
            (entry) =>
              entry.category === "mailbox" &&
              entry.keywords.some((keyword) => target.includes(keyword)),
          )
        ) {
          return {
            severityScore: 45,
            detail: "Email or mailbox activity spiked; watch for credential issues.",
          };
        }
        return null;
      },
    },
    {
      id: "financial.large-transaction",
      category: "financial",
      detect(event) {
        const payload = event.payload || {};
        const amount = Number(payload.amount);
        if (Number.isFinite(amount) && Math.abs(amount) >= 500) {
          const score = Math.min(100, 60 + Math.min(40, Math.abs(amount) / 10));
          return {
            severityScore: score,
            detail: `Large financial transaction detected (${amount}).`,
          };
        }
        const summary = describeEventPayload(payload).toLowerCase();
        if (summary.includes("payment") || summary.includes("invoice")) {
          return {
            severityScore: 40,
            detail: "Financial action referenced in the latest activity.",
          };
        }
        return null;
      },
    },
    {
      id: "household.filesystem-shift",
      category: "household",
      detect(event, state) {
        if (!event.type.includes("filesystem")) {
          return null;
        }
        const payload = event.payload || {};
        const currentCount = Number(payload.observedFileCount || 0);
        const previous = state.lastObservedFileCount || 0;
        state.lastObservedFileCount = currentCount;
        if (currentCount && Math.abs(currentCount - previous) >= 100) {
          return {
            severityScore: 50,
            detail: "Household filesystem recorded a large change in observed files.",
          };
        }
        return null;
      },
    },
  ];

  function evaluatePendingEvents(options = {}) {
    const limit = Math.max(5, Number(options.limit || 25));
    const events = memory.listRecentEvents({ limit }).reverse();
    const since = options.sinceTimestamp || 0;
    const newEvents = events.filter((event) => {
      const timestamp = Date.parse(event.ts || "");
      return timestamp && timestamp > since && !event.type.startsWith("guard.");
    });
    let latestTimestamp = since;
    const anomalies = [];
    for (const event of newEvents) {
      const timestamp = Date.parse(event.ts || "");
      latestTimestamp = Math.max(latestTimestamp, timestamp || 0);
      for (const detector of detectors) {
        const recorded = evaluateDetector(event, detector);
        if (recorded) {
          anomalies.push(recorded);
        }
      }
    }
    return {
      anomalies,
      latestTimestamp,
    };
  }

  function listAnomalies(options = {}) {
    const limit = Math.max(1, Number(options.limit || 20));
    return memory.listRecentEvents({
      limit,
      type: "guard.anomaly",
    });
  }

  function simulateScenario(scenarioId, extras = {}) {
    const scenario = SIMULATED_SCENARIOS[scenarioId];
    if (!scenario) {
      throw new Error(`Unknown guard simulation: ${scenarioId}`);
    }
    const now = new Date();
    return recordAnomaly({
      id: scenarioId,
      category: scenario.category,
      detail: scenario.detail,
      severityScore: scenario.severityScore,
      escalationChannel:
        scenario.escalationChannel || escalationChannelForSeverity("medium"),
      sourceEventId: extras.sourceEventId || null,
      timestamp: now.toISOString(),
      stage: "simulation",
      context: extras.context || {},
    });
  }

  return {
    evaluatePendingEvents,
    listAnomalies,
    simulateScenario,
    getSensitivity() {
      return { ...sensitivity };
    },
    getQuietWindows() {
      return [...quietWindows];
    },
  };
}

export const GuardScenarios = Object.keys(SIMULATED_SCENARIOS);
