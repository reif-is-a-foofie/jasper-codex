import fs from "node:fs";
import path from "node:path";
import { ensureJasperHomeLayout } from "../../jasper-core/src/home.js";
import { createEventStore } from "../../jasper-memory/src/event-store.js";

const EXTERNAL_BENCHMARKS = [
  {
    id: "terminal_bench",
    label: "Terminal-Bench",
    weight: 18,
    area: "terminal_execution",
    sourceUrl: "https://github.com/laude-institute/terminal-bench",
    description: "Terminal task execution with verifier-backed outcomes.",
  },
  {
    id: "swe_bench_verified",
    label: "SWE-bench Verified",
    weight: 18,
    area: "software_engineering",
    sourceUrl: "https://github.com/SWE-bench/SWE-bench",
    description:
      "Real software issue resolution against verified SWE-bench tasks.",
  },
  {
    id: "tau3_bench",
    label: "tau-bench",
    weight: 14,
    area: "tool_agent_interaction",
    sourceUrl: "https://github.com/sierra-research/tau-bench",
    description:
      "Tool-agent-user interaction across realistic policy and API tasks.",
  },
  {
    id: "gaia",
    label: "GAIA",
    weight: 12,
    area: "general_assistant",
    sourceUrl: "https://huggingface.co/gaia-benchmark",
    description:
      "General assistant benchmark with multi-step reasoning and tool use.",
  },
  {
    id: "appworld",
    label: "AppWorld",
    weight: 12,
    area: "multi_app_workflows",
    sourceUrl: "https://github.com/StonyBrookNLP/appworld",
    description:
      "Controllable multi-app world for function-calling and coding agents.",
  },
  {
    id: "workarena",
    label: "WorkArena",
    weight: 10,
    area: "browser_knowledge_work",
    sourceUrl: "https://github.com/ServiceNow/WorkArena",
    description: "Browser-based knowledge-work tasks on ServiceNow.",
  },
  {
    id: "osworld",
    label: "OSWorld",
    weight: 8,
    area: "computer_use",
    sourceUrl: "https://github.com/xlang-ai/OSWorld",
    description: "Open-ended multimodal computer-use benchmark.",
  },
  {
    id: "macosworld",
    label: "macOSWorld",
    weight: 4,
    area: "mac_computer_use",
    sourceUrl: "https://github.com/showlab/macosworld",
    description: "macOS-native GUI benchmark for interactive agents.",
  },
  {
    id: "asb",
    label: "Agent Security Bench",
    weight: 4,
    area: "agent_security",
    sourceUrl: "https://github.com/agiresearch/ASB",
    description: "Security benchmark for attacks and defenses in LLM agents.",
  },
];

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

function benchmarkLayout(options = {}) {
  const home = ensureJasperHomeLayout({ jasperHome: options.jasperHome });
  const evalsDir = path.join(home.dataDir, "evals");
  fs.mkdirSync(evalsDir, { recursive: true });
  return {
    root: evalsDir,
    resultsLogPath: path.join(evalsDir, "external-benchmark-results.jsonl"),
  };
}

function normalizeBenchmarkId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function toFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampPercent(value) {
  if (!Number.isFinite(value)) {
    return null;
  }
  return Math.max(0, Math.min(100, Number(value)));
}

function normalizeMaybeFraction(value) {
  if (!Number.isFinite(value)) {
    return null;
  }
  return value <= 1 ? value * 100 : value;
}

function extractScorePercent(input) {
  if (!input || typeof input !== "object") {
    return null;
  }

  const directKeys = [
    "scorePercent",
    "score_percentage",
    "percent",
    "percentage",
  ];
  for (const key of directKeys) {
    const value = toFiniteNumber(input[key]);
    if (value !== null) {
      return clampPercent(value);
    }
  }

  const rateKeys = [
    "score",
    "accuracy",
    "successRate",
    "success_rate",
    "passRate",
    "pass_rate",
    "solveRate",
    "solve_rate",
    "resolvedRate",
    "resolved_rate",
  ];
  for (const key of rateKeys) {
    const value = toFiniteNumber(input[key]);
    if (value !== null) {
      return clampPercent(normalizeMaybeFraction(value));
    }
  }

  const passed = toFiniteNumber(
    input.passed ?? input.solved ?? input.successes,
  );
  const total = toFiniteNumber(input.total ?? input.count ?? input.attempts);
  if (passed !== null && total !== null && total > 0) {
    return clampPercent((passed / total) * 100);
  }

  const rawScore = toFiniteNumber(input.rawScore ?? input.raw_score);
  const maxScore = toFiniteNumber(input.maxScore ?? input.max_score);
  if (rawScore !== null && maxScore !== null && maxScore > 0) {
    return clampPercent((rawScore / maxScore) * 100);
  }

  return null;
}

function parseJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function parseImportFile(filePath) {
  const parsed = parseJsonFile(filePath);
  if (Array.isArray(parsed)) {
    return {
      weights: null,
      results: parsed,
    };
  }

  return {
    weights:
      parsed &&
      typeof parsed.weights === "object" &&
      !Array.isArray(parsed.weights)
        ? parsed.weights
        : null,
    results: Array.isArray(parsed?.results) ? parsed.results : [],
  };
}

function parseWeightOverrides(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  const overrides = {};
  for (const [key, value] of Object.entries(input)) {
    const benchmarkId = normalizeBenchmarkId(key);
    const weight = toFiniteNumber(value);
    if (benchmarkId && weight !== null && weight >= 0) {
      overrides[benchmarkId] = weight;
    }
  }
  return overrides;
}

function loadWeightOverrides(filePath) {
  if (!filePath) {
    return {};
  }

  const parsed = parseJsonFile(filePath);
  if (Array.isArray(parsed)) {
    throw new Error(
      "Weight override file must be an object keyed by benchmark id",
    );
  }

  return parseWeightOverrides(parsed.weights || parsed);
}

function effectiveBenchmarks(weightOverrides = {}) {
  return EXTERNAL_BENCHMARKS.map((benchmark) => ({
    ...benchmark,
    weight: toFiniteNumber(weightOverrides[benchmark.id]) ?? benchmark.weight,
  }));
}

function recordSortKey(record) {
  return String(record.runAt || record.importedAt || "");
}

function latestResultsByBenchmark(records) {
  const latest = new Map();
  for (const record of records) {
    const current = latest.get(record.benchmarkId);
    if (!current || recordSortKey(record) > recordSortKey(current)) {
      latest.set(record.benchmarkId, record);
    }
  }
  return latest;
}

function createTemplateResult(benchmark) {
  return {
    benchmarkId: benchmark.id,
    label: benchmark.label,
    scorePercent: null,
    passed: null,
    total: null,
    runAt: null,
    sourceName: null,
    sourceUrl: benchmark.sourceUrl,
    notes: "",
  };
}

export function listExternalBenchmarks(weightOverrides = {}) {
  return effectiveBenchmarks(weightOverrides).map((benchmark) => ({
    id: benchmark.id,
    label: benchmark.label,
    area: benchmark.area,
    weight: benchmark.weight,
    sourceUrl: benchmark.sourceUrl,
    description: benchmark.description,
  }));
}

export function buildExternalBenchmarkTemplate(weightOverrides = {}) {
  const benchmarks = effectiveBenchmarks(weightOverrides);
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    description:
      "Fill in benchmark results from public suites, then import with `jasper audit benchmark-index import FILE`.",
    weights: Object.fromEntries(
      benchmarks.map((benchmark) => [benchmark.id, benchmark.weight]),
    ),
    results: benchmarks.map(createTemplateResult),
  };
}

export class JasperExternalBenchmarkStore {
  constructor(options = {}) {
    this.layout = benchmarkLayout(options);
    this.memory =
      options.memory ||
      createEventStore({
        root: options.memoryRoot,
        jasperHome: options.jasperHome,
        source: "jasper-external-benchmarks",
      });
  }

  listResults(options = {}) {
    const records = readJsonLines(this.layout.resultsLogPath)
      .filter((record) =>
        options.benchmarkId
          ? record.benchmarkId === normalizeBenchmarkId(options.benchmarkId)
          : true,
      )
      .sort((left, right) =>
        recordSortKey(right).localeCompare(recordSortKey(left)),
      );

    return records.slice(0, Number(options.limit || 200));
  }

  recordResult(input = {}) {
    const benchmarkId = normalizeBenchmarkId(
      input.benchmarkId || input.id || input.benchmark,
    );
    const benchmark = EXTERNAL_BENCHMARKS.find(
      (entry) => entry.id === benchmarkId,
    );
    if (!benchmark) {
      throw new Error(
        `Unknown external benchmark: ${benchmarkId || "missing"}`,
      );
    }

    const scorePercent = extractScorePercent(input);
    if (scorePercent === null) {
      throw new Error(`Missing score for benchmark: ${benchmarkId}`);
    }

    const record = {
      schemaVersion: 1,
      benchmarkId,
      label: benchmark.label,
      area: benchmark.area,
      scorePercent,
      runAt: input.runAt ? String(input.runAt) : new Date().toISOString(),
      importedAt: new Date().toISOString(),
      sourceName: input.sourceName ? String(input.sourceName) : null,
      sourceUrl: input.sourceUrl
        ? String(input.sourceUrl)
        : benchmark.sourceUrl,
      notes: input.notes ? String(input.notes) : null,
      sampleCount:
        toFiniteNumber(input.total ?? input.count ?? input.attempts) ?? null,
      raw: {
        passed: toFiniteNumber(input.passed ?? input.solved ?? input.successes),
        total: toFiniteNumber(input.total ?? input.count ?? input.attempts),
        rawScore: toFiniteNumber(input.rawScore ?? input.raw_score),
        maxScore: toFiniteNumber(input.maxScore ?? input.max_score),
      },
    };

    appendJsonLine(this.layout.resultsLogPath, record);
    this.memory.appendEvent({
      type: "evaluation.external.result",
      tags: ["evaluation", "external", "benchmark"],
      payload: {
        benchmarkId: record.benchmarkId,
        label: record.label,
        scorePercent: record.scorePercent,
        runAt: record.runAt,
        sourceName: record.sourceName,
        sourceUrl: record.sourceUrl,
      },
    });
    return record;
  }

  importResults(filePath) {
    const parsed = parseImportFile(filePath);
    const imported = [];
    const skipped = [];

    for (const result of parsed.results) {
      const scorePercent = extractScorePercent(result);
      const benchmarkId = normalizeBenchmarkId(
        result?.benchmarkId || result?.id || result?.benchmark,
      );
      if (!benchmarkId) {
        skipped.push({
          reason: "missing_benchmark_id",
          input: result,
        });
        continue;
      }

      if (scorePercent === null) {
        skipped.push({
          benchmarkId,
          reason: "missing_score",
        });
        continue;
      }

      imported.push(this.recordResult(result));
    }

    return {
      importedCount: imported.length,
      skippedCount: skipped.length,
      imported,
      skipped,
      weightOverrides: parseWeightOverrides(parsed.weights),
    };
  }
}

export function computeExternalBenchmarkIndex(options = {}) {
  const store =
    options.store ||
    new JasperExternalBenchmarkStore({
      jasperHome: options.jasperHome,
      memoryRoot: options.memoryRoot,
      memory: options.memory,
    });
  const persistedResults =
    options.results || store.listResults({ limit: 1000 });
  const latest = latestResultsByBenchmark(persistedResults);
  const weightOverrides =
    options.weightOverrides ||
    (options.weightsFile ? loadWeightOverrides(options.weightsFile) : {});
  const benchmarks = effectiveBenchmarks(weightOverrides);
  const totalWeight = benchmarks.reduce(
    (sum, benchmark) => sum + benchmark.weight,
    0,
  );
  const coveredWeight = benchmarks.reduce(
    (sum, benchmark) =>
      latest.has(benchmark.id) ? sum + benchmark.weight : sum,
    0,
  );

  const items = benchmarks.map((benchmark) => {
    const result = latest.get(benchmark.id) || null;
    const contribution = result
      ? (result.scorePercent * benchmark.weight) / totalWeight
      : 0;
    return {
      id: benchmark.id,
      label: benchmark.label,
      area: benchmark.area,
      weight: benchmark.weight,
      sourceUrl: benchmark.sourceUrl,
      description: benchmark.description,
      status: result ? "recorded" : "missing",
      scorePercent: result?.scorePercent ?? null,
      coveredWeight: result ? benchmark.weight : 0,
      contribution,
      lastRunAt: result?.runAt ?? null,
      lastImportedAt: result?.importedAt ?? null,
      sourceName: result?.sourceName ?? null,
      resultSourceUrl: result?.sourceUrl ?? null,
      notes: result?.notes ?? null,
    };
  });

  const weightedSum = items.reduce((sum, item) => sum + item.contribution, 0);
  const coveredWeightedSum = items.reduce(
    (sum, item) =>
      sum + (item.scorePercent !== null ? item.scorePercent * item.weight : 0),
    0,
  );
  const missing = items.filter((item) => item.status === "missing");
  const coveredScore =
    coveredWeight > 0 ? coveredWeightedSum / coveredWeight : null;
  const coveragePercent =
    totalWeight > 0 ? (coveredWeight / totalWeight) * 100 : 0;

  return {
    audit: "external_benchmark_index",
    computedAt: new Date().toISOString(),
    weightMode:
      Object.keys(weightOverrides).length > 0 ? "override_file" : "default",
    totalBenchmarks: items.length,
    coveredBenchmarks: items.length - missing.length,
    coveragePercent: Number(coveragePercent.toFixed(2)),
    indexScore: Number(weightedSum.toFixed(2)),
    coveredScore:
      coveredScore === null ? null : Number(coveredScore.toFixed(2)),
    methodology: {
      interpretation:
        "indexScore is the full weighted basket score with missing benchmarks counted as zero evidence; coveredScore is the weighted average across only the benchmarks that have recorded results.",
      totalWeight,
      coveredWeight,
    },
    benchmarks: items,
    summary: [
      `External benchmark index: ${Number(weightedSum.toFixed(2))}/100.`,
      `Coverage: ${Number(coveragePercent.toFixed(2))}% of the benchmark basket.`,
      coveredScore === null
        ? "No external benchmark results have been imported yet."
        : `Covered-benchmark average: ${Number(coveredScore.toFixed(2))}/100.`,
      missing.length > 0
        ? `Missing benchmarks: ${missing.map((item) => item.label).join(", ")}.`
        : "All configured benchmarks have at least one recorded result.",
    ],
    nextSteps:
      missing.length > 0
        ? [
            "Run more public benchmarks and import their results to increase coverage.",
            "Use `jasper audit benchmark-index scaffold` to generate a template file for missing suites.",
          ]
        : ["Refresh stale benchmark runs as Jasper changes."],
  };
}
