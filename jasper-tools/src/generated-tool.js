function normalizeLimit(value, fallback = 5) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.floor(parsed);
}

export function materializeGeneratedTool(spec, context) {
  if (!spec || typeof spec !== "object") {
    throw new Error("Generated tool spec must be an object");
  }

  const inputSchema = {
    type: "object",
    properties: {
      limit: { type: "number" },
      type: { type: "string" },
      source: { type: "string" },
      query: { type: "string" },
    },
    additionalProperties: false,
  };

  if (spec.template === "recent-memory") {
    return {
      id: spec.id,
      description: spec.description,
      inputSchema,
      async run(input = {}) {
        return context.memory.listRecentEvents({
          limit: normalizeLimit(input.limit ?? spec.defaults?.limit, 5),
          type: input.type ?? spec.defaults?.type,
          source: input.source ?? spec.defaults?.source,
        });
      },
    };
  }

  if (spec.template === "semantic-memory-search") {
    return {
      id: spec.id,
      description: spec.description,
      inputSchema: {
        ...inputSchema,
        required: spec.defaults?.query ? [] : ["query"],
      },
      async run(input = {}) {
        const query = String(input.query ?? spec.defaults?.query ?? "").trim();
        if (!query) {
          throw new Error(`Generated tool "${spec.id}" requires a query`);
        }

        return context.memory.searchSemanticEvents({
          query,
          limit: normalizeLimit(input.limit ?? spec.defaults?.limit, 5),
          type: input.type ?? spec.defaults?.type,
          source: input.source ?? spec.defaults?.source,
        });
      },
    };
  }

  throw new Error(`Unsupported generated tool template: ${spec.template}`);
}
