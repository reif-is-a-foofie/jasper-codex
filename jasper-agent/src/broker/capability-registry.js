const CAPABILITIES = [
  {
    id: "general.reasoning",
    label: "General reasoning",
    description:
      "Handle a general request with Jasper's built-in reasoning layer.",
    keywords: ["question", "help", "think", "figure out", "explain"],
    phrases: [],
    providerCandidates: [
      {
        providerId: "builtin",
        executionMode: "native",
      },
    ],
  },
  {
    id: "identity.summary",
    label: "Identity summary",
    description: "Return Jasper identity and mission details.",
    keywords: ["who are you", "identity", "mission", "personality"],
    phrases: ["who are you", "what is your mission"],
    providerCandidates: [
      {
        providerId: "builtin",
        toolId: "identity-summary",
      },
    ],
  },
  {
    id: "memory.recent",
    label: "Recent memory",
    description: "Read the most recent Jasper memory entries.",
    keywords: ["recent", "memory", "last", "what happened"],
    phrases: ["what happened recently", "show recent memory"],
    providerCandidates: [
      {
        providerId: "builtin",
        toolId: "recent-memory",
      },
    ],
  },
  {
    id: "memory.semantic",
    label: "Semantic memory",
    description: "Recall related prior context from Jasper memory.",
    keywords: [
      "remember",
      "recall",
      "context",
      "history",
      "discussed",
      "before",
    ],
    phrases: [
      "what have we talked about",
      "did we talk about",
      "remind me about",
    ],
    providerCandidates: [
      {
        providerId: "builtin",
        toolId: "semantic-memory-search",
      },
    ],
  },
  {
    id: "web.research",
    label: "Web research",
    description: "Find fresh public information on the web.",
    keywords: [
      "latest",
      "news",
      "look up",
      "lookup",
      "research",
      "search",
      "check on",
      "release",
    ],
    phrases: [
      "look this up",
      "check on this",
      "what is the latest",
      "search the web",
    ],
    providerCandidates: [
      {
        providerId: "builtin",
        toolId: "web-research",
      },
      {
        providerId: "claw",
        packageId: "claw/web-research",
        autoProvision: true,
        trust: "curated",
      },
      {
        providerId: "mcp",
        serverName: "web-research",
        packageId: "jasper/web-research",
        autoProvision: true,
        trust: "curated",
      },
    ],
  },
  {
    id: "calendar.read",
    label: "Calendar access",
    description: "Read calendar availability and upcoming events.",
    keywords: [
      "calendar",
      "schedule",
      "meeting",
      "tomorrow",
      "appointment",
      "free",
    ],
    phrases: ["check my calendar", "what is on my calendar", "am i free"],
    providerCandidates: [
      {
        providerId: "connector",
        connectorId: "calendar",
        requiresConsent: true,
      },
      {
        providerId: "claw",
        packageId: "claw/calendar",
        autoProvision: true,
        trust: "curated",
      },
      {
        providerId: "mcp",
        serverName: "calendar",
        packageId: "jasper/calendar",
        autoProvision: true,
        trust: "curated",
      },
    ],
  },
  {
    id: "email.read",
    label: "Email access",
    description: "Read inbox and message state.",
    keywords: ["email", "mail", "inbox", "message", "reply"],
    phrases: ["check my email", "what is in my inbox"],
    providerCandidates: [
      {
        providerId: "connector",
        connectorId: "email",
        requiresConsent: true,
      },
      {
        providerId: "claw",
        packageId: "claw/email",
        autoProvision: true,
        trust: "curated",
      },
      {
        providerId: "mcp",
        serverName: "email",
        packageId: "jasper/email",
        autoProvision: true,
        trust: "curated",
      },
    ],
  },
  {
    id: "filesystem.search",
    label: "Filesystem search",
    description: "Search local files and project content.",
    keywords: ["file", "folder", "document", "pdf", "find", "search files"],
    phrases: ["find this file", "search my files", "look in my files"],
    providerCandidates: [
      {
        providerId: "claw",
        packageId: "claw/filesystem",
        autoProvision: true,
        trust: "curated",
      },
      {
        providerId: "mcp",
        serverName: "filesystem",
        packageId: "jasper/filesystem",
        autoProvision: true,
        trust: "curated",
      },
    ],
  },
];

function normalizeText(value) {
  return String(value || "").toLowerCase();
}

function normalizeLimit(value, fallback = 3) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.floor(parsed);
}

function summarizeBuiltins(toolRegistry) {
  return new Set(
    (toolRegistry?.listTools?.() || []).map((tool) =>
      String(tool.id || "").trim(),
    ),
  );
}

function scoreCapability(queryText, capability) {
  const matchedKeywords = capability.keywords.filter((keyword) =>
    queryText.includes(keyword),
  );
  const matchedPhrases = capability.phrases.filter((phrase) =>
    queryText.includes(phrase),
  );

  const score = matchedKeywords.length * 2 + matchedPhrases.length * 4;
  return {
    score,
    matchedKeywords,
    matchedPhrases,
  };
}

export function createCapabilityRegistry(options = {}) {
  const builtinToolIds = summarizeBuiltins(options.toolRegistry);

  return {
    listCapabilities() {
      return CAPABILITIES.map((capability) => ({
        id: capability.id,
        label: capability.label,
        description: capability.description,
        providerCandidates: capability.providerCandidates.map((candidate) => ({
          ...candidate,
          availableBuiltin:
            candidate.providerId === "builtin" && candidate.toolId
              ? builtinToolIds.has(candidate.toolId)
              : candidate.providerId === "builtin",
        })),
      }));
    },
    getCapability(capabilityId) {
      return (
        CAPABILITIES.find(
          (capability) => capability.id === String(capabilityId || "").trim(),
        ) || null
      );
    },
    matchRequest(query, options = {}) {
      const limit = normalizeLimit(options.limit, 3);
      const queryText = normalizeText(query);
      const ranked = CAPABILITIES.filter(
        (capability) => capability.id !== "general.reasoning",
      )
        .map((capability) => {
          const match = scoreCapability(queryText, capability);
          return {
            capability,
            ...match,
          };
        })
        .filter((entry) => entry.score > 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, limit);

      if (ranked.length > 0) {
        return ranked;
      }

      const fallback = this.getCapability("general.reasoning");
      return fallback
        ? [
            {
              capability: fallback,
              score: 0,
              matchedKeywords: [],
              matchedPhrases: [],
            },
          ]
        : [];
    },
  };
}
