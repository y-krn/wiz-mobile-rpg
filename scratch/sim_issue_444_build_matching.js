// sim-scope: run
// Issue #444: build matching ceiling and equipment-selection policy measurement.

/* global console, process */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { performance } from "node:perf_hooks";
import { isMainThread } from "node:worker_threads";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveSimParallelism, runSimTasks } from "./sim_parallel.js";

const SCENARIO_IDS = Object.freeze([
  "workshop-empty",
  "workshop-stats",
  "workshop-gear",
  "workshop-blood-wand",
  "workshop-blood-wand-spells",
  "workshop-core-pools",
  "workshop-complete"
]);
const BASIC_CLASSES = Object.freeze(["Fighter", "Thief", "Priest", "Mage"]);
const B5 = 5;
const TARGET_DEPTH = 21;
const R95 = 1.959963984540054;
const MIN_MATCHING_N = 30;

const ENV_DEFAULTS = Object.freeze({
  SIM_SEED: "444",
  SIM_RUNS: "2200",
  SIM_CALIBRATION_RUNS: "100",
  DEPARTURE_CRAFT_IDS:
    "TOWN_PORTAL,HEAL_POTION,HEAL_POTION,HEAL_POTION,HEAL_POTION,ANTIDOTE,GUARD_POTION",
  TRAP_POLICY: "conservative",
  TRAP_AVOIDANCE_POLICY: "ev",
  TRAP_DAMAGE_MULTIPLIER: "1",
  IDENTIFICATION_POLICY: "powder",
  IDENTIFICATION_STARTING_POWDER: "2",
  IDENTIFICATION_COST_OVERRIDE: "1",
  STATUS_CURE_POLICY: "smart",
  STATUS_CURE_HP_THRESHOLD: "0.35",
  STATUS_CURE_MERCHANT_POLICY: "missing",
  HEAL_POTION_MERCHANT_POLICY: "missing",
  FLEE_POLICY: "threshold",
  FLEE_HP_THRESHOLD: "0.35",
  PORTAL_HP_THRESHOLD: "0.35",
  PORTAL_MAX_HEAL_POTIONS: "0",
  PORTAL_MIN_FLOOR: "3",
  ELITE_POLICY: "avoid",
  BLOOD_WAND_HP_PAYMENT_MIN_RATE: "0.50",
  SIM_CORE_SCORE_DROP_TOLERANCE: "0",
  SIM_440_CONDITION: "current",
  SIM_SCENARIOS: SCENARIO_IDS.join(","),
  SIM_SUPPORT_SUPPLY_CEILING: "none",
  SIM_EQUIPMENT_SLOT_MODE: "standard",
  SIM_EQUIPMENT_POLICY: "individual-score",
  SIM_MATCHING_DEFINITION: "exact"
});

for (const [key, value] of Object.entries(ENV_DEFAULTS)) {
  if (process.env[key] === undefined) process.env[key] = value;
}
if (process.env.SIM_PARALLEL) {
  throw new Error("SIM_PARALLEL must be omitted for Issue #444 measurement");
}
if (process.env.IDENTIFICATION_POLICY !== "powder") {
  throw new Error("IDENTIFICATION_POLICY must be powder for Issue #444");
}
if (!SCENARIO_IDS.every(id => process.env.SIM_SCENARIOS.split(",").includes(id))) {
  throw new Error(`SIM_SCENARIOS must include all seven scenarios: ${SCENARIO_IDS.join(",")}`);
}

const RUNS = Math.max(1, Number(process.env.SIM_RUNS));
const CALIBRATION_RUNS = Math.max(1, Number(process.env.SIM_CALIBRATION_RUNS));
const SEED = Number(process.env.SIM_SEED) >>> 0;
const FLEE_POLICY = process.env.FLEE_POLICY === "never" ? "never" : "threshold";
const FLEE_HP_THRESHOLD = FLEE_POLICY === "never"
  ? null
  : Math.max(0, Math.min(1, Number(process.env.FLEE_HP_THRESHOLD)));
const SUPPORT_SUPPLY_CEILING = String(
  process.env.SIM_SUPPORT_SUPPLY_CEILING
).trim();
const SLOT_MODE = String(process.env.SIM_EQUIPMENT_SLOT_MODE).trim();
const EQUIPMENT_POLICY = String(process.env.SIM_EQUIPMENT_POLICY).trim();
const MATCHING_DEFINITION = String(process.env.SIM_MATCHING_DEFINITION).trim();
const CONDITION_ID = String(
  process.env.SIM_ISSUE444_CONDITION ||
    `${SUPPORT_SUPPLY_CEILING}-${SLOT_MODE}-${EQUIPMENT_POLICY}-${MATCHING_DEFINITION}`
).replace(/[^a-z0-9_-]/gi, "-");

const [
  {
    SIM_CLASSES,
    calibrateCoreScoringProfile,
    getScenarioById,
    resetSimulationRandom,
    simulateRun
  },
  { CORE_AFFIXES, SUPPORT_AFFIXES }
] = await Promise.all([
  import("./sim_depth_material_ev.js"),
  import("../src/data/affixes.js")
]);

const CLASS_NAMES = SIM_CLASSES.filter(className => BASIC_CLASSES.includes(className));
if (CLASS_NAMES.length !== BASIC_CLASSES.length) {
  throw new Error(`basic classes missing: ${BASIC_CLASSES.join(",")}`);
}

// Exact definition retained from PR #443. It is a measurement estimand, not a
// game rule or an equipment-score weight.
const CORE_SUPPORT_SYNERGY = Object.freeze({
  CORE_LAST_STAND: ["hp", "vit", "guardian", "killHeal"],
  CORE_OPENER: ["firstStrike", "firstTurnAttack", "fullHpDamage", "followUp"],
  CORE_BLOOD_WAND: ["hp", "vit", "int", "pie", "arcane", "devotion"],
  CORE_PURIFY_RING: ["antiUndead", "antiDemon", "arcane", "devotion"],
  CORE_TRAP_EATER: ["trapBonus"],
  CORE_CURSE_KEEPER: [],
  CORE_GIANT_SLAYER: ["antiDragon", "antiBeast", "antiSpirit"],
  CORE_THORN_SHIELD: ["guardian", "def", "vit", "hitFlinch"],
  CORE_EXECUTIONER: []
});
const ENABLED_CORE_IDS = new Set(
  CORE_AFFIXES.filter(affix => affix.enabled).map(affix => affix.id)
);
const ENABLED_SUPPORT_IDS = SUPPORT_AFFIXES
  .filter(affix => affix.enabled)
  .map(affix => affix.id);

function hashSeed(text) {
  let seed = 2166136261;
  for (let index = 0; index < text.length; index++) {
    seed ^= text.charCodeAt(index);
    seed = Math.imul(seed, 16777619);
  }
  return seed >>> 0;
}

function mean(values) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

function sampleVariance(values) {
  if (values.length < 2) return 0;
  const average = mean(values);
  return values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
    (values.length - 1);
}

function wilson(successes, trials) {
  if (trials <= 0) return { successes, trials, estimate: null, low: null, high: null };
  const p = successes / trials;
  const denominator = 1 + (R95 ** 2) / trials;
  const center = (p + (R95 ** 2) / (2 * trials)) / denominator;
  const halfWidth = R95 * Math.sqrt(
    (p * (1 - p)) / trials + (R95 ** 2) / (4 * trials ** 2)
  ) / denominator;
  return {
    successes,
    trials,
    estimate: p,
    low: Math.max(0, center - halfWidth),
    high: Math.min(1, center + halfWidth)
  };
}

function meanInterval(values) {
  if (!values.length) return { n: 0, estimate: null, low: null, high: null };
  const estimate = mean(values);
  const standardError = values.length > 1
    ? Math.sqrt(sampleVariance(values) / values.length)
    : null;
  return {
    n: values.length,
    estimate,
    low: standardError === null ? null : estimate - R95 * standardError,
    high: standardError === null ? null : estimate + R95 * standardError
  };
}

function normalDifference(left, right) {
  if (!left.length || !right.length) {
    return { estimate: null, low: null, high: null, leftN: left.length, rightN: right.length };
  }
  const estimate = mean(left) - mean(right);
  const standardError = Math.sqrt(
    sampleVariance(left) / left.length + sampleVariance(right) / right.length
  );
  return {
    estimate,
    low: estimate - R95 * standardError,
    high: estimate + R95 * standardError,
    leftN: left.length,
    rightN: right.length
  };
}

function classCenteredDifference(rows, predicate, outcomeSelector) {
  const byClass = new Map();
  rows.forEach(row => {
    const outcome = Number(outcomeSelector(row));
    if (!Number.isFinite(outcome)) return;
    if (!byClass.has(row.className)) byClass.set(row.className, []);
    byClass.get(row.className).push({ row, outcome });
  });
  const matched = [];
  const unmatched = [];
  const classCounts = {};
  byClass.forEach((classRows, className) => {
    const classMean = mean(classRows.map(item => item.outcome));
    const matchingRows = classRows.filter(item => predicate(item.row));
    const nonMatchingRows = classRows.filter(item => !predicate(item.row));
    classCounts[className] = {
      matched: matchingRows.length,
      unmatched: nonMatchingRows.length
    };
    matched.push(...matchingRows.map(item => item.outcome - classMean));
    unmatched.push(...nonMatchingRows.map(item => item.outcome - classMean));
  });
  return {
    ...normalDifference(matched, unmatched),
    matchedN: matched.length,
    unmatchedN: unmatched.length,
    classCounts
  };
}

function compactSnapshot(snapshot) {
  if (!snapshot) return null;
  return {
    floor: snapshot.floor,
    point: snapshot.point,
    level: snapshot.level,
    equipmentStatScore: snapshot.equipmentStatScore,
    combatCoreScore: snapshot.combatCoreScore,
    combatBuildScore: snapshot.combatBuildScore,
    coreIds: [...(snapshot.coreIds || [])],
    supportAffixes: { ...(snapshot.supportAffixes || {}) }
  };
}

function getB5Snapshot(result) {
  return compactSnapshot(
    result.diagnostics?.buildSnapshots?.find(
      snapshot => snapshot.floor === B5 && snapshot.point === "floor-start"
    ) || null
  );
}

function compactRow(task, result) {
  const b5 = getB5Snapshot(result);
  const b6 = result.diagnostics?.buildSnapshots?.some(
    snapshot => snapshot.floor === B5 + 1 && snapshot.point === "floor-start"
  );
  return {
    scenarioId: task.scenarioId,
    runIndex: task.runIndex,
    className: task.className,
    survived: Boolean(result.survived),
    died: Boolean(result.died),
    reachedFloor: Number(result.reachedFloor),
    deathFloor: result.deathFloor === null ? null : Number(result.deathFloor),
    bankedMaterials: Number(result.bankedMaterials || 0),
    timeCost: Number(result.timeCost || 0),
    b5,
    b5Death: Boolean(b5 && result.died && result.deathFloor === B5),
    b5Breakthrough: Boolean(b5 && b6),
    finalCoreIds: [...(result.finalCoreIds || [])]
  };
}

function buildScenario(scenarioId) {
  const base = getScenarioById(scenarioId);
  return {
    ...base,
    identificationPolicy: "powder",
    trapPolicy: process.env.TRAP_POLICY,
    trapAvoidancePolicy: process.env.TRAP_AVOIDANCE_POLICY,
    statusCurePolicy: process.env.STATUS_CURE_POLICY,
    statusCureHpThreshold: Number(process.env.STATUS_CURE_HP_THRESHOLD),
    statusCureMerchantPolicy: process.env.STATUS_CURE_MERCHANT_POLICY,
    fleeHpThreshold: FLEE_HP_THRESHOLD,
    elitePolicy: process.env.ELITE_POLICY
  };
}

function getMatchingSupportIds(coreId, definition = MATCHING_DEFINITION) {
  return definition === "broad"
    ? ENABLED_SUPPORT_IDS
    : CORE_SUPPORT_SYNERGY[coreId] || [];
}

function hasMatchingSupport(snapshot, definition = MATCHING_DEFINITION) {
  return Boolean(snapshot?.coreIds?.some(coreId =>
    ENABLED_CORE_IDS.has(coreId) &&
    getMatchingSupportIds(coreId, definition).some(supportId =>
      Number(snapshot.supportAffixes?.[supportId] || 0) > 0
    )
  ));
}

function incrementDistribution(distribution, value) {
  const bucket = value >= 3 ? "3+" : String(value);
  distribution[bucket] = (distribution[bucket] || 0) + 1;
}

function summarizeDistribution(rows, selector) {
  const distribution = { "0": 0, "1": 0, "2": 0, "3+": 0 };
  rows.forEach(row => incrementDistribution(distribution, selector(row)));
  return distribution;
}

function summarizeScenario(rows) {
  const entrants = rows.filter(row => row.b5);
  const totalTime = rows.reduce((sum, row) => sum + row.timeCost, 0);
  const totalBanked = rows.reduce((sum, row) => sum + row.bankedMaterials, 0);
  const coreCount = row => row.b5?.coreIds.length || 0;
  const combatCoreIds = new Set(
    CORE_AFFIXES
      .filter(affix => affix.enabled && affix.poolGroup === "combat")
      .map(affix => affix.id)
  );
  const combatCoreCount = row =>
    (row.b5?.coreIds || []).filter(coreId => combatCoreIds.has(coreId)).length;
  const b5Reached = entrants.map(row => row.reachedFloor);
  const endpoints = {
    breakthroughRate: wilson(
      entrants.filter(row => row.b5Breakthrough).length,
      entrants.length
    ),
    deathRate: wilson(
      entrants.filter(row => row.b5Death).length,
      entrants.length
    ),
    reachedFloor: meanInterval(b5Reached),
    matchingSupport: wilson(
      entrants.filter(row => hasMatchingSupport(row.b5)).length,
      entrants.length
    )
  };
  const matchingDefinitions = Object.fromEntries(
    ["exact", "broad"].map(definition => {
      const predicate = row => hasMatchingSupport(row.b5, definition);
      const matching = entrants.filter(predicate);
      return [definition, {
        endpoints: {
          matchingSupport: wilson(matching.length, entrants.length)
        },
        centeredEndpointEffects: {
          breakthrough: classCenteredDifference(
            entrants,
            predicate,
            row => row.b5Breakthrough
          ),
          death: classCenteredDifference(
            entrants,
            predicate,
            row => row.b5Death
          ),
          reachedFloor: classCenteredDifference(
            entrants,
            predicate,
            row => row.reachedFloor
          )
        },
        matchingN: matching.length,
        unmatchedN: entrants.length - matching.length,
        dataSufficient: matching.length >= MIN_MATCHING_N &&
          entrants.length - matching.length >= MIN_MATCHING_N,
        status: matching.length >= MIN_MATCHING_N &&
          entrants.length - matching.length >= MIN_MATCHING_N
          ? "確定"
          : "未確定（N<30）"
      }];
    })
  );
  const selectedMatching = matchingDefinitions[MATCHING_DEFINITION];
  return {
    runs: rows.length,
    b5: {
      entrantsN: entrants.length,
      matchingN: selectedMatching.matchingN,
      unmatchedN: selectedMatching.unmatchedN,
      endpoints,
      centeredEndpointEffects: selectedMatching.centeredEndpointEffects,
      matchingDataSufficient: selectedMatching.dataSufficient,
      matchingStatus: selectedMatching.status,
      matchingDefinitions,
      coreCountDistribution: summarizeDistribution(entrants, coreCount),
      combatCoreCountDistribution: summarizeDistribution(entrants, combatCoreCount),
      finalCoreCountDistribution: summarizeDistribution(rows, row => row.finalCoreIds.length)
    },
    averageReachedFloor: meanInterval(rows.map(row => row.reachedFloor)),
    materialEvPerTime: totalTime > 0 ? totalBanked / totalTime : null,
    bankedMaterialsPerRun: meanInterval(rows.map(row => row.bankedMaterials)),
    bankedMaterialsPerTime: totalTime > 0 ? totalBanked / totalTime : null
  };
}

function formatPercent(value) {
  return value === null || value === undefined ? "NA" : `${(value * 100).toFixed(1)}%`;
}

function formatRate(rate) {
  return rate.estimate === null
    ? "NA"
    : `${formatPercent(rate.estimate)} [${formatPercent(rate.low)},${formatPercent(rate.high)}]`;
}

export function runBuildMatchingTask(task, context) {
  const scenario = context.scenarios[task.scenarioId];
  resetSimulationRandom(hashSeed(`${context.seed}:${task.scenarioId}:${task.runIndex}`));
  const result = simulateRun({
    className: task.className,
    startFloor: 1,
    targetDepth: TARGET_DEPTH,
    runIndex: task.runIndex,
    seriesId: "issue444-build-matching",
    scoringProfile: context.scoringProfiles[task.scenarioId],
    scenario,
    workshop: scenario.workshop,
    collectDiagnostics: true
  });
  return compactRow(task, result);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function main() {
  const scenarios = Object.fromEntries(SCENARIO_IDS.map(id => [id, buildScenario(id)]));
  const scoringProfiles = {};
  const calibrationStarted = performance.now();
  for (const scenarioId of SCENARIO_IDS) {
    const scenario = scenarios[scenarioId];
    resetSimulationRandom(SEED);
    scoringProfiles[scenarioId] = calibrateCoreScoringProfile(
      CALIBRATION_RUNS,
      scenario,
      "powder",
      scenario.workshop
    );
  }
  const calibrationWallSeconds = (performance.now() - calibrationStarted) / 1000;

  const tasks = SCENARIO_IDS.flatMap(scenarioId =>
    Array.from({ length: RUNS }, (_, runIndex) => ({
      scenarioId,
      runIndex,
      className: CLASS_NAMES[runIndex % CLASS_NAMES.length]
    }))
  );
  const resolvedParallelism = resolveSimParallelism(tasks.length);
  const startedWall = performance.now();
  const startedCpu = process.cpuUsage();
  const rows = await runSimTasks({
    moduleUrl: pathToFileURL(fileURLToPath(import.meta.url)).href,
    exportName: "runBuildMatchingTask",
    runTask: runBuildMatchingTask,
    tasks,
    context: {
      seed: SEED,
      scenarios,
      scoringProfiles
    }
  });
  const cpuUsage = process.cpuUsage(startedCpu);
  const wallClockSeconds = (performance.now() - startedWall) / 1000;
  const caseRows = Object.fromEntries(SCENARIO_IDS.map(id => [
    id,
    rows.filter(row => row.scenarioId === id)
  ]));
  const caseSummaries = Object.fromEntries(SCENARIO_IDS.map(id => [
    id,
    summarizeScenario(caseRows[id])
  ]));
  const duplicateKeys = rows.length - new Set(
    rows.map(row => `${row.scenarioId}:${row.runIndex}:${row.className}`)
  ).size;
  if (rows.length !== tasks.length || duplicateKeys !== 0) {
    throw new Error(
      `raw result audit failed: rows=${rows.length}/${tasks.length}, duplicates=${duplicateKeys}`
    );
  }

  const resultDir = join(process.cwd(), "scratch", "results");
  mkdirSync(resultDir, { recursive: true });
  const rawPath = join(resultDir, `issue-444-build-matching-${CONDITION_ID}.jsonl`);
  const summaryPath = join(resultDir, `issue-444-build-matching-${CONDITION_ID}.json`);
  const rawText = rows.map(row => JSON.stringify(row)).join("\n") + "\n";
  const rawSha256 = sha256(rawText);
  writeFileSync(rawPath, rawText);
  const measurement = {
    issue: 444,
    condition: CONDITION_ID,
    seed: SEED,
    SIM_RUNS: RUNS,
    SIM_CALIBRATION_RUNS: CALIBRATION_RUNS,
    SIM_PARALLEL: "未指定",
    resolvedParallelism,
    availableParallelism: availableParallelism(),
    identificationPolicy: process.env.IDENTIFICATION_POLICY,
    fleePolicy: FLEE_POLICY,
    fleeHpThreshold: FLEE_HP_THRESHOLD,
    supportSupplyCeiling: SUPPORT_SUPPLY_CEILING,
    equipmentSlotMode: SLOT_MODE,
    equipmentPolicy: EQUIPMENT_POLICY,
    matchingDefinition: MATCHING_DEFINITION,
    scenarios: SCENARIO_IDS,
    classes: CLASS_NAMES,
    targetDepth: TARGET_DEPTH,
    calibrationWallSeconds,
    wallClockSeconds,
    cpuUserSeconds: cpuUsage.user / 1e6,
    cpuSystemSeconds: cpuUsage.system / 1e6,
    cpuTotalSeconds: (cpuUsage.user + cpuUsage.system) / 1e6,
    rawSha256,
    rawPath: rawPath.replace(`${process.cwd()}/`, "")
  };
  const fullSummary = { measurement, cases: caseSummaries };
  writeFileSync(summaryPath, `${JSON.stringify(fullSummary, null, 2)}\n`);
  const summarySha256 = sha256(readFileSync(summaryPath));
  console.log(JSON.stringify({
    summaryPath: summaryPath.replace(`${process.cwd()}/`, ""),
    rawPath: rawPath.replace(`${process.cwd()}/`, ""),
    rawSha256,
    summarySha256,
    measurement,
    cases: Object.fromEntries(SCENARIO_IDS.map(id => {
      const summary = caseSummaries[id];
      return [id, {
        b5Entrants: summary.b5.entrantsN,
        matching: formatRate(summary.b5.endpoints.matchingSupport),
        matchingExact: formatRate(
          summary.b5.matchingDefinitions.exact.endpoints.matchingSupport
        ),
        matchingBroad: formatRate(
          summary.b5.matchingDefinitions.broad.endpoints.matchingSupport
        ),
        b5Death: formatRate(summary.b5.endpoints.deathRate),
        b5Breakthrough: formatRate(summary.b5.endpoints.breakthroughRate),
        averageReachedFloor: summary.averageReachedFloor,
        materialEvPerTime: summary.materialEvPerTime,
        bankedMaterialsPerRun: summary.bankedMaterialsPerRun,
        coreCountDistribution: summary.b5.coreCountDistribution,
        combatCoreCountDistribution: summary.b5.combatCoreCountDistribution,
        matchingStatus: summary.b5.matchingStatus
      }];
    }))
  }, null, 2));
}

if (isMainThread) await main();
