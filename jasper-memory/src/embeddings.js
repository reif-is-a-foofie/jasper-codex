function tokenize(value) {
  return String(value || "").toLowerCase().match(/[a-z0-9]+/g) || [];
}

function hashToken(token, dimension) {
  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % dimension;
}

function normalizeVector(vector) {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (magnitude === 0) {
    return vector;
  }
  return vector.map((value) => Number((value / magnitude).toFixed(6)));
}

export function eventToEmbeddingText(event) {
  return [
    event.type,
    event.source,
    ...(Array.isArray(event.tags) ? event.tags : []),
    JSON.stringify(event.payload || {}),
  ]
    .join(" ")
    .trim();
}

export function embedText(value, options = {}) {
  const dimension = Math.max(8, Number(options.dimension ?? 64));
  const vector = new Array(dimension).fill(0);
  const tokens = tokenize(value);

  for (const token of tokens) {
    vector[hashToken(token, dimension)] += 1;
  }

  return normalizeVector(vector);
}

export function createEventEmbedding(event, options = {}) {
  const dimension = Math.max(8, Number(options.dimension ?? 64));
  const text = eventToEmbeddingText(event);
  return {
    schemaVersion: 1,
    eventId: event.id,
    ts: event.ts,
    dimension,
    text,
    vector: embedText(text, { dimension }),
  };
}

export function cosineSimilarity(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return 0;
  }

  let total = 0;
  for (let index = 0; index < left.length; index += 1) {
    total += left[index] * right[index];
  }
  return Number(total.toFixed(6));
}
