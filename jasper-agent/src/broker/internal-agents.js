const INTERNAL_AGENTS = [
  {
    id: "harbor",
    codename: "Harbor",
    responsibility: "Translate user requests into capability plans.",
    visibility: "internal-only",
  },
  {
    id: "sounding",
    codename: "Sounding",
    responsibility: "Match requests to capabilities and provider candidates.",
    visibility: "internal-only",
  },
  {
    id: "dockyard",
    codename: "Dockyard",
    responsibility: "Provision trusted toolpacks and provider dependencies.",
    visibility: "internal-only",
  },
  {
    id: "breakwater",
    codename: "Breakwater",
    responsibility: "Enforce consent, trust, and safety policy.",
    visibility: "internal-only",
  },
  {
    id: "helm",
    codename: "Helm",
    responsibility: "Execute the selected tool or provider path.",
    visibility: "internal-only",
  },
  {
    id: "logbook",
    codename: "Logbook",
    responsibility: "Record user actions, system actions, and outcomes.",
    visibility: "internal-only",
  },
  {
    id: "wake",
    codename: "Wake",
    responsibility: "Reflect on outcomes and improve future routing.",
    visibility: "internal-only",
  },
];

export function listInternalAgents() {
  return INTERNAL_AGENTS.map((agent) => ({ ...agent }));
}

export function getInternalAgent(agentId) {
  return (
    INTERNAL_AGENTS.find((agent) => agent.id === String(agentId || "").trim()) ||
    null
  );
}
