// sim-scope: infra — aggregate exported production chest telemetry without mixing chest sources
/* global process */

import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { basename } from "node:path";

export const CHEST_SOURCES = Object.freeze(["ordinary", "fromDrop"]);
export const CHEST_ACTIONS = Object.freeze(["open", "disarm", "trap_kit", "smash", "leave"]);
export const CHEST_REWARD_CATEGORIES = Object.freeze([
  "weapon", "armor", "shield", "accessory", "usable", "special", "quest", "progression"
]);
export const MIN_CONFIDENT_N = 30;
export const MIN_DECISION_N = 500;

const SOURCE_SET = new Set(CHEST_SOURCES);
const ACTION_SET = new Set(CHEST_ACTIONS);
const CATEGORY_SET = new Set(CHEST_REWARD_CATEGORIES);
const DIMENSIONS = Object.freeze(["floor", "trap", "rewardCategory", "hpBand", "hasTrapKit"]);

function emptyCounts(keys) {
  return Object.fromEntries(keys.map(key => [key, 0]));
}

export function wilsonInterval(successes, trials, z = 1.96) {
  if (!Number.isFinite(successes) || !Number.isFinite(trials) || trials <= 0) return null;
  const p = successes / trials;
  const z2 = z * z;
  const denominator = 1 + z2 / trials;
  const center = (p + z2 / (2 * trials)) / denominator;
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * trials)) / trials) / denominator;
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

export function rateMetric(successes, trials) {
  const validTrials = Number.isFinite(trials) ? trials : 0;
  return {
    successes,
    trials: validTrials,
    estimate: validTrials > 0 ? successes / validTrials : null,
    ci95: wilsonInterval(successes, validTrials),
    confidence: validTrials >= MIN_CONFIDENT_N ? "sufficient" : validTrials > 0 ? "low-n" : "unobserved"
  };
}

function parseProperties(record) {
  const properties = record?.properties ?? record?.props ?? {};
  if (typeof properties === "string") {
    try { return JSON.parse(properties); } catch { return null; }
  }
  return properties && typeof properties === "object" ? properties : null;
}

function eventName(record) {
  return record?.event ?? record?.name ?? parseProperties(record)?.event ?? null;
}

function recordId(record, properties) {
  return record?.uuid ?? record?.id ?? record?.$insert_id ?? properties?.$insert_id ?? null;
}

function normalizeSource(properties) {
  if (SOURCE_SET.has(properties?.chestSource)) return properties.chestSource;
  if (typeof properties?.fromDrop === "boolean") return properties.fromDrop ? "fromDrop" : "ordinary";
  return "unknown";
}

function dimensionValue(properties, dimension) {
  if (dimension === "floor") {
    return Number.isInteger(properties?.floor) && properties.floor > 0 ? `B${properties.floor}` : "unknown";
  }
  if (dimension === "trap") return typeof properties?.trap === "string" ? properties.trap : "unknown";
  if (dimension === "hpBand") {
    const hpRate = Number(properties?.hpRate);
    if (!Number.isFinite(hpRate) || hpRate < 0 || hpRate > 1) return "unknown";
    if (hpRate <= 0.20) return "0-20%";
    if (hpRate <= 0.35) return "21-35%";
    if (hpRate <= 0.55) return "36-55%";
    return "56%+";
  }
  if (dimension === "hasTrapKit") {
    return typeof properties?.hasTrapKit === "boolean" ? String(properties.hasTrapKit) : "unknown";
  }
  return "unknown";
}

function createChoiceBucket() {
  return {
    choices: 0,
    actions: emptyCounts(CHEST_ACTIONS),
    dimensions: Object.fromEntries(DIMENSIONS.map(dimension => [dimension, {}])),
    rewardCategoryMissing: 0
  };
}

function recordChoice(bucket, properties) {
  const action = ACTION_SET.has(properties.action) ? properties.action : null;
  if (!action) return false;
  bucket.choices++;
  bucket.actions[action]++;
  DIMENSIONS.filter(dimension => dimension !== "rewardCategory").forEach(dimension => {
    const key = dimensionValue(properties, dimension);
    bucket.dimensions[dimension][key] ||= { choices: 0, smash: 0 };
    bucket.dimensions[dimension][key].choices++;
    bucket.dimensions[dimension][key].smash += Number(action === "smash");
  });
  const categories = Array.isArray(properties.rewardCategories)
    ? [...new Set(properties.rewardCategories.filter(category => CATEGORY_SET.has(category)))]
    : [];
  if (categories.length === 0) bucket.rewardCategoryMissing++;
  categories.forEach(category => {
    bucket.dimensions.rewardCategory[category] ||= { choices: 0, smash: 0 };
    bucket.dimensions.rewardCategory[category].choices++;
    bucket.dimensions.rewardCategory[category].smash += Number(action === "smash");
  });
  return true;
}

function createResultBucket() {
  return {
    results: 0,
    trapFired: 0,
    partyDied: 0,
    anyRewardLost: 0,
    lostRewardCount: 0,
    remainingRewardCount: 0,
    awardedRewardCount: 0,
    unawardedRewardCount: 0,
    lostCategories: Object.fromEntries(CHEST_REWARD_CATEGORIES.map(category => [category, { occurrences: 0, results: 0 }])),
    runIds: new Set()
  };
}

function resultSnapshot(bucket) {
  const result = { ...bucket };
  delete result.runIds;
  result.trapRate = rateMetric(result.trapFired, result.results);
  result.partyDeathRate = rateMetric(result.partyDied, result.results);
  result.rewardLossRate = rateMetric(result.anyRewardLost, result.results);
  result.lostCategories = Object.fromEntries(
    Object.entries(result.lostCategories).map(([category, value]) => [category, {
      ...value,
      rate: rateMetric(value.results, result.results)
    }])
  );
  return result;
}

function createSourceSummary() {
  return Object.fromEntries(CHEST_SOURCES.map(source => [source, {
    choices: 0,
    actions: emptyCounts(CHEST_ACTIONS),
    smashRate: rateMetric(0, 0),
    dimensions: Object.fromEntries(DIMENSIONS.map(dimension => [dimension, {}])),
    rewardCategoryMissing: 0,
    rewardCategoryCoverage: null,
    smashResults: createResultBucket(),
    smashRunOutcomes: null
  }]));
}

function addRunOutcomeSummary(sourceSummary, resultBucket, runEnds) {
  const runIds = [...resultBucket.runIds].filter(Boolean);
  const outcomes = { death: 0, retreat: 0, abandon: 0, ended: 0 };
  const runsWithEnd = new Set();
  runIds.forEach(runId => {
    const outcome = runEnds.get(runId);
    if (!outcome) return;
    runsWithEnd.add(runId);
    if (Object.hasOwn(outcomes, outcome)) outcomes[outcome]++;
  });
  outcomes.ended = runsWithEnd.size;
  sourceSummary.smashRunOutcomes = {
    runsWithSmashResult: runIds.length,
    runsWithRunEnd: outcomes.ended,
    death: rateMetric(outcomes.death, runIds.length),
    retreat: rateMetric(outcomes.retreat, runIds.length),
    abandon: rateMetric(outcomes.abandon, runIds.length),
    unresolved: rateMetric(Math.max(0, runIds.length - outcomes.ended), runIds.length)
  };
}

function normalizeInputRecords(input) {
  if (Array.isArray(input)) return input;
  if (input && typeof input === "object") {
    if (Array.isArray(input.results)) return input.results;
    if (Array.isArray(input.events)) return input.events;
    return [input];
  }
  throw new Error("telemetry input must be a JSON object, array, or JSONL document");
}

export function parseTelemetryDocument(text) {
  const trimmed = String(text).trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed) || parsed?.events || parsed?.results) return normalizeInputRecords(parsed);
    } catch {
      // Fall through to JSONL so a first line beginning with a brace is handled correctly.
    }
  }
  return trimmed.split(/\r?\n/).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); } catch { throw new Error(`invalid JSONL at line ${index + 1}`); }
  });
}

export function aggregateChestTelemetry(records) {
  const summary = createSourceSummary();
  const runEnds = new Map();
  const seenIds = new Set();
  const counters = { inputRecords: 0, relevantRecords: 0, duplicateRecords: 0, invalidRecords: 0, ignoredRecords: 0 };
  for (const record of records) {
    counters.inputRecords++;
    const properties = parseProperties(record);
    const name = eventName(record);
    if (!properties || !name) { counters.invalidRecords++; continue; }
    const id = recordId(record, properties);
    if (id && seenIds.has(id)) { counters.duplicateRecords++; continue; }
    if (id) seenIds.add(id);
    if (name === "run_end") {
      if (typeof properties.runId === "string" && typeof properties.outcome === "string") {
        runEnds.set(properties.runId, properties.outcome);
      }
      counters.relevantRecords++;
      continue;
    }
    if (name !== "chest_action" && name !== "chest_smash_result") {
      counters.ignoredRecords++;
      continue;
    }
    const source = normalizeSource(properties);
    if (!SOURCE_SET.has(source)) { counters.invalidRecords++; continue; }
    counters.relevantRecords++;
    const sourceSummary = summary[source];
    if (name === "chest_action") {
      if (!recordChoice(sourceSummary, properties)) { counters.invalidRecords++; continue; }
      continue;
    }
    const result = sourceSummary.smashResults;
    // `smashResults` is still a mutable internal bucket until finalization.
    result.results++;
    result.trapFired += Number(properties.trapFired === true);
    result.partyDied += Number(properties.partyDied === true);
    const lostCount = Number.isFinite(Number(properties.lostRewardCount)) ? Number(properties.lostRewardCount) : 0;
    result.lostRewardCount += lostCount;
    result.anyRewardLost += Number(lostCount > 0);
    result.remainingRewardCount += Number(properties.remainingRewardCount) || 0;
    result.awardedRewardCount += Number(properties.awardedRewardCount) || 0;
    result.unawardedRewardCount += Number(properties.unawardedRewardCount) || 0;
    const categories = Array.isArray(properties.lostRewardCategories)
      ? [...new Set(properties.lostRewardCategories.filter(category => CATEGORY_SET.has(category)))]
      : [];
    categories.forEach(category => {
      result.lostCategories[category].occurrences++;
      result.lostCategories[category].results++;
    });
    if (typeof properties.runId === "string") result.runIds.add(properties.runId);
  }
  CHEST_SOURCES.forEach(source => {
    const sourceSummary = summary[source];
    sourceSummary.smashRate = rateMetric(sourceSummary.actions.smash, sourceSummary.choices);
    sourceSummary.rewardCategoryCoverage = rateMetric(
      sourceSummary.choices - sourceSummary.rewardCategoryMissing,
      sourceSummary.choices
    );
    const resultBucket = sourceSummary.smashResults;
    addRunOutcomeSummary(sourceSummary, resultBucket, runEnds);
    sourceSummary.smashResults = resultSnapshot(resultBucket);
  });
  return { sources: summary, counters };
}

function confidenceStatus(trials) {
  if (trials >= MIN_DECISION_N) return "decision-ready";
  if (trials >= MIN_CONFIDENT_N) return "measured-low-n";
  if (trials > 0) return "measured-insufficient-n";
  return "unexecuted";
}

export function buildReport({ records, provenance = {}, inputPath = null } = {}) {
  const aggregate = aggregateChestTelemetry(records || []);
  const totalChoices = CHEST_SOURCES.reduce((sum, source) => sum + aggregate.sources[source].choices, 0);
  const totalResults = CHEST_SOURCES.reduce((sum, source) => sum + aggregate.sources[source].smashResults.results, 0);
  return {
    schemaVersion: 1,
    issue: 816,
    measurement: {
      runner: "scratch/measurements/issue816_chest_telemetry.js",
      inputPath,
      productionSourceSha: provenance.productionSourceSha || null,
      aggregationRunnerSha: provenance.aggregationRunnerSha || null,
      seed: null,
      seedPolicy: "not-applicable: production telemetry is observational and has no simulator seed",
      configuration: {
        eventNames: ["chest_action", "chest_smash_result", "run_end"],
        dimensions: [...DIMENSIONS],
        minConfidentN: MIN_CONFIDENT_N,
        minDecisionN: MIN_DECISION_N,
        inputFormat: "PostHog JSON export or JSONL"
      },
      capturedAt: provenance.capturedAt || null
    },
    counters: aggregate.counters,
    status: {
      liveTelemetry: confidenceStatus(totalChoices),
      smashResults: confidenceStatus(totalResults),
      decisionReady: totalChoices >= MIN_DECISION_N && totalResults >= MIN_DECISION_N
    },
    sources: aggregate.sources,
    classification: {
      productionTelemetry: totalChoices > 0 ? "measured" : "unexecuted",
      simulatorFromDropManualSmash: "measured-by-canonical-run-sim",
      liveUiTiming: "structurally-omitted-from-simulator"
    },
    decision: totalChoices >= MIN_DECISION_N && totalResults >= MIN_DECISION_N
      ? "measurement-ready; compare against #808 acceptance criteria before changing rules"
      : "needs-more-measurement; do not change #808 rules from this sample"
  };
}

function formatRate(metric) {
  if (!metric || metric.estimate === null) return "unobserved";
  const ci = metric.ci95?.map(value => `${(value * 100).toFixed(1)}%`).join("–") || "—";
  return `${(metric.estimate * 100).toFixed(1)}% [${ci}; N=${metric.trials}]`;
}

export function renderMarkdown(report) {
  const lines = [
    "# Issue #816 chest smash telemetry measurement",
    "",
    `- production source SHA: \`${report.measurement.productionSourceSha || "not supplied"}\``,
    `- aggregation runner SHA: \`${report.measurement.aggregationRunnerSha || "not supplied"}\``,
    `- seed: ${report.measurement.seed ?? "N/A (observational telemetry)"}`,
    `- input records: ${report.counters.inputRecords}; relevant records: ${report.counters.relevantRecords}`,
    `- decision: **${report.decision}**`,
    "",
    "## Source-separated action results",
    "",
    "| source | choices | smash rate (Wilson 95%) | open | disarm | trap kit | leave | smash results | reward-loss rate | trap-fired rate | party-death rate |",
    "| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |"
  ];
  for (const source of CHEST_SOURCES) {
    const row = report.sources[source];
    lines.push(`| ${source} | ${row.choices} | ${formatRate(row.smashRate)} | ${row.actions.open} | ${row.actions.disarm} | ${row.actions.trap_kit} | ${row.actions.leave} | ${row.smashResults.results} | ${formatRate(row.smashResults.rewardLossRate)} | ${formatRate(row.smashResults.trapRate)} | ${formatRate(row.smashResults.partyDeathRate)} |`);
  }
  lines.push(
    "",
    "## Required dimension cuts",
    "",
    "Action smash rates are calculated against all five accepted chest actions. Reward-category rows are overlapping cohorts because one chest may contain multiple roles. `unknown` means the export predates the category field or the field was unavailable; it is never treated as a measured zero.",
    "",
    ...CHEST_SOURCES.flatMap(source => {
      const rows = [`### ${source}`, "", "| dimension | bucket | smash rate (Wilson 95%) | N |", "| --- | --- | --- | ---: |"];
      for (const dimension of DIMENSIONS) {
        for (const [bucket, value] of Object.entries(report.sources[source].dimensions[dimension])) {
          rows.push(`| ${dimension} | ${bucket} | ${formatRate(rateMetric(value.smash, value.choices))} | ${value.choices} |`);
        }
      }
      return rows.concat("");
    }),
    "## Classification",
    "",
    `- live production telemetry: **${report.classification.productionTelemetry}** (${report.status.liveTelemetry})`,
    "- canonical run simulator `fromDrop` manual-smash path: **measured** by the existing source-backed path; live UI timing and analytics transport remain omitted",
    "- #808 rule decision: keep the existing acceptance criteria separate; this report does not authorize a rule/UI change unless the live sample is decision-ready",
    "",
    "Reproduce with:",
    "",
    "```sh",
    "node scratch/measurements/issue816_chest_telemetry.js --input <posthog-export.jsonl> --production-sha <40-char-release-sha> --runner-sha <40-char-runner-sha> --output /private/tmp/issue-816-chest-telemetry.json --summary evidence/results/issue-816-chest-telemetry.md",
    "```",
    ""
  );
  return lines.join("\n");
}

function option(name, args) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function currentSha() {
  try { return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(); } catch { return null; }
}

if (basename(process.argv[1] || "") === "issue816_chest_telemetry.js") {
  const args = process.argv.slice(2);
  const inputPath = option("--input", args);
  const outputPath = option("--output", args);
  const summaryPath = option("--summary", args);
  if (!inputPath) throw new Error("--input is required");
  if (!outputPath && !summaryPath) throw new Error("--output or --summary is required");
  const productionSourceSha = option("--production-sha", args);
  if (!/^[0-9a-f]{40}$/.test(productionSourceSha || "")) {
    throw new Error("--production-sha must be a 40-character commit SHA");
  }
  const records = parseTelemetryDocument(readFileSync(inputPath, "utf8"));
  const report = buildReport({
    records,
    inputPath,
    provenance: {
      productionSourceSha,
      aggregationRunnerSha: option("--runner-sha", args) || currentSha(),
      capturedAt: new Date().toISOString()
    }
  });
  if (outputPath) writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  if (summaryPath) writeFileSync(summaryPath, renderMarkdown(report));
  if (!outputPath) process.stdout.write(JSON.stringify(report, null, 2) + "\n");
}
