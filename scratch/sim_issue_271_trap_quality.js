// sim-scope: run
// Issue #271: trapBonus/trapSense quality-dependence measurement.

/* global console, process */

import { createHash } from "node:crypto";
import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeSync,
  writeFileSync
} from "node:fs";
import { availableParallelism } from "node:os";
import { performance } from "node:perf_hooks";
import { isMainThread } from "node:worker_threads";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveSimParallelism, runSimTasks } from "./sim_parallel.js";
import {
  getBuildSnapshot,
  inferPairingEligibility,
  resolveDiagnosticMode
} from "./measurement_utils.js";

const ALL_SCENARIO_IDS = Object.freeze([
  "workshop-empty",
  "workshop-stats",
  "workshop-gear",
  "workshop-blood-wand",
  "workshop-blood-wand-spells",
  "workshop-core-pools",
  "workshop-complete"
]);
const BASIC_CLASSES = Object.freeze(["Fighter", "Thief", "Priest", "Mage"]);
const CURE_POLICIES = Object.freeze(["smart", "never"]);
const TRAP_START_FLOOR = 3;
const TARGET_DEPTH = 21;
const B5 = 5;
const R95 = 1.959963984540054;
const MIN_GROUP_N = 30;
const TARGET_GROUP_N = 200;
const PRACTICAL_SURVIVAL_FLOOR = 0.20;
const CALIBRATION_RUNS = 100;
const DEFAULT_RUNS = 2200;
const CELL_BATCH_SIZE = 2;
const SEED = Number(process.env.SIM_SEED || 271) >>> 0;
const RUNS = Math.max(1, Number(process.env.SIM_RUNS || DEFAULT_RUNS));
const DIAGNOSTIC_MODE = resolveDiagnosticMode(process.env.SIM_DIAGNOSTICS);
const RESULT_BASENAME = process.env.SIM_RESULT_BASENAME || "issue-271-trap-quality";

const parseList = (value, fallback) => String(value || fallback)
  .split(",")
  .map(item => item.trim())
  .filter(Boolean);

const currentBonusConditions = [1, 5, 10, 25].map(multiplier => ({
  mode: "trapBonus",
  groupAffixes: ["trapBonus"],
  affixType: "trapBonus",
  multiplier,
  clamp: "current",
  id: `trapBonus-${multiplier}x-current`,
  label: `trapBonus ${multiplier}x / max現行`,
  trapOverride: {
    trapBonus: {
      multiplier,
      maxNonApt: 60,
      maxApt: 90
    }
  }
}));
const raisedBonusConditions = [1, 5, 10, 25].map(multiplier => ({
  mode: "trapBonus",
  groupAffixes: ["trapBonus"],
  affixType: "trapBonus",
  multiplier,
  clamp: "raised",
  id: `trapBonus-${multiplier}x-raised`,
  label: `trapBonus ${multiplier}x / max100`,
  trapOverride: {
    trapBonus: {
      multiplier,
      maxNonApt: 100,
      maxApt: 100
    }
  }
}));
const trapBonusValueConditions = [0, 5, 10, 15, 20, 25].map(increment => {
  const equipment = [5, 10, 15].map(value => value + increment);
  const accessory = [5, 10].map(value => value + increment);
  const suffix = increment === 0 ? "current" : `plus${increment}`;
  return {
    mode: "trapBonus",
    groupAffixes: ["trapBonus"],
    affixType: "trapBonus",
    id: `trapBonus-values-${suffix}`,
    label: `trapBonus値 E=${equipment.join("/")} A=${accessory.join("/")}`,
    trapBonusValues: { equipment, accessory }
  };
});
const trapSenseConditions = [
  { cap: 0.95, startFloor: 16 },
  { cap: 1.00, startFloor: 16 },
  { cap: 0.95, startFloor: 3 },
  { cap: 1.00, startFloor: 3 }
].map(({ cap, startFloor }) => ({
  mode: "trapSense",
  groupAffixes: ["trapSense"],
  affixType: "trapSense",
  cap,
  startFloor,
  id: `trapSense-cap${Math.round(cap * 100)}-start${startFloor}`,
  label: `trapSense cap${Math.round(cap * 100)} / startB${startFloor}`,
  trapOverride: { trapSense: { cap, startFloor, multiplier: 1 } }
}));
const combinedUpperCondition = {
  mode: "combined",
  groupAffixes: ["trapBonus", "trapSense"],
  affixType: "combined",
  id: "combined-upper",
  label: "両方最大上界 (bonus25x/max100 + sense cap100/startB3)",
  trapOverride: {
    trapBonus: { multiplier: 25, maxNonApt: 100, maxApt: 100 },
    trapSense: { cap: 1.00, startFloor: 3, multiplier: 1 }
  }
};
const ALL_CONDITIONS = Object.freeze([
  ...currentBonusConditions,
  ...raisedBonusConditions,
  ...trapSenseConditions,
  combinedUpperCondition
]);
const CONDITION_MAP = new Map(
  [...ALL_CONDITIONS, ...trapBonusValueConditions]
    .map(condition => [condition.id, condition])
);
const REQUESTED_SCENARIOS = parseList(
  process.env.TQ_SCENARIOS,
  ALL_SCENARIO_IDS.join(",")
);
const REQUESTED_CONDITIONS = parseList(
  process.env.TQ_CONDITIONS,
  ALL_CONDITIONS.map(condition => condition.id).join(",")
);
const CONDITIONS = REQUESTED_CONDITIONS.map(id => CONDITION_MAP.get(id));
if (CONDITIONS.some(condition => !condition)) {
  throw new Error(`unknown TQ_CONDITIONS: ${REQUESTED_CONDITIONS.join(",")}`);
}
if (REQUESTED_SCENARIOS.some(id => !ALL_SCENARIO_IDS.includes(id))) {
  throw new Error(`unknown TQ_SCENARIOS: ${REQUESTED_SCENARIOS.join(",")}`);
}
if (process.env.SIM_PARALLEL) {
  throw new Error("SIM_PARALLEL must be omitted for Issue #271 trap measurement");
}
if (process.env.TRAP_BONUS_OVERRIDE || process.env.TRAP_SENSE_OVERRIDE) {
  throw new Error("global trap overrides must be omitted; use scenario trapOverride");
}

process.env.SIM_CALIBRATION_RUNS = String(CALIBRATION_RUNS);
process.env.SIM_SEED = String(SEED);
process.env.SIM_RUNS = String(RUNS);
process.env.DEPARTURE_CRAFT_IDS = process.env.DEPARTURE_CRAFT_IDS ||
  "TOWN_PORTAL,HEAL_POTION,HEAL_POTION,HEAL_POTION,HEAL_POTION,ANTIDOTE,GUARD_POTION";
process.env.TRAP_POLICY = "conservative";
process.env.TRAP_AVOIDANCE_POLICY = "ev";
process.env.TRAP_DAMAGE_MULTIPLIER = "1";
process.env.IDENTIFICATION_POLICY = "powder";
process.env.IDENTIFICATION_STARTING_POWDER = process.env.IDENTIFICATION_STARTING_POWDER || "2";
process.env.IDENTIFICATION_COST_OVERRIDE = process.env.IDENTIFICATION_COST_OVERRIDE || "1";
process.env.FLEE_POLICY = "threshold";
process.env.FLEE_HP_THRESHOLD = process.env.FLEE_HP_THRESHOLD || "0.35";
process.env.STATUS_CURE_HP_THRESHOLD = process.env.STATUS_CURE_HP_THRESHOLD || "0.35";
process.env.STATUS_CURE_MERCHANT_POLICY = process.env.STATUS_CURE_MERCHANT_POLICY || "missing";
process.env.HEAL_POTION_MERCHANT_POLICY = process.env.HEAL_POTION_MERCHANT_POLICY || "missing";
process.env.PORTAL_HP_THRESHOLD = process.env.PORTAL_HP_THRESHOLD || "0.35";
process.env.PORTAL_MAX_HEAL_POTIONS = process.env.PORTAL_MAX_HEAL_POTIONS || "0";
process.env.PORTAL_MIN_FLOOR = process.env.PORTAL_MIN_FLOOR || "3";
process.env.ELITE_POLICY = process.env.ELITE_POLICY || "avoid";
process.env.BLOOD_WAND_HP_PAYMENT_MIN_RATE =
  process.env.BLOOD_WAND_HP_PAYMENT_MIN_RATE || "0.50";
process.env.SIM_CORE_SCORE_DROP_TOLERANCE = process.env.SIM_CORE_SCORE_DROP_TOLERANCE || "0";
process.env.SIM_440_CONDITION = process.env.SIM_440_CONDITION || "current";
process.env.SIM_SCENARIOS = REQUESTED_SCENARIOS.join(",");
process.env.SIM_DAMAGE_PROBE = DIAGNOSTIC_MODE === "full" ? "1" : "0";

const {
  SIM_CLASSES,
  calibrateCoreScoringProfile,
  getScenarioById,
  resetSimulationRandom,
  simulateRun
} = await import("./sim_depth_material_ev.js");

const CLASS_NAMES = SIM_CLASSES.filter(className => BASIC_CLASSES.includes(className));
if (CLASS_NAMES.length !== BASIC_CLASSES.length) {
  throw new Error(`basic classes missing: ${BASIC_CLASSES.join(",")}`);
}

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
    return {
      estimate: null,
      low: null,
      high: null,
      leftN: left.length,
      rightN: right.length
    };
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

function survivalDifference(left, right) {
  if (!left || !right || left.estimate === null || right.estimate === null) {
    return { estimate: null, low: null, high: null, intervalsOverlap: null };
  }
  const estimate = left.estimate - right.estimate;
  const standardError = Math.sqrt(
    left.estimate * (1 - left.estimate) / left.trials +
    right.estimate * (1 - right.estimate) / right.trials
  );
  return {
    estimate,
    low: estimate - R95 * standardError,
    high: estimate + R95 * standardError,
    intervalsOverlap: left.low <= right.high && right.low <= left.high
  };
}

function classCenteredDifference(rows, predicate, selector) {
  const byClass = new Map();
  rows.forEach(row => {
    const outcome = Number(selector(row));
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

function addCounts(target, additions = {}) {
  Object.entries(additions || {}).forEach(([key, value]) => {
    target[key] = (target[key] || 0) + Number(value || 0);
  });
  return target;
}

function formatPercent(value, digits = 1) {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "NA"
    : `${(value * 100).toFixed(digits)}%`;
}

function formatNumber(value, digits = 2) {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "NA"
    : Number(value).toFixed(digits);
}

function formatRate(rate) {
  if (!rate || rate.estimate === null) return "NA";
  const suffix = rate.trials < MIN_GROUP_N ? "; N<30 未確定" : "";
  return `${formatPercent(rate.estimate)} [${formatPercent(rate.low)}, ${formatPercent(rate.high)}${suffix}]`;
}

function formatMean(interval, digits = 2) {
  if (!interval || interval.estimate === null) return "NA";
  return `${formatNumber(interval.estimate, digits)} [${formatNumber(interval.low, digits)}, ${formatNumber(interval.high, digits)}]`;
}

function formatDifference(diff, digits = 2) {
  if (!diff || diff.estimate === null) return "NA";
  const suffix = diff.leftN < MIN_GROUP_N || diff.rightN < MIN_GROUP_N
    ? "; N<30 未確定"
    : "";
  return `${diff.estimate >= 0 ? "+" : ""}${formatNumber(diff.estimate, digits)} ` +
    `[${formatNumber(diff.low, digits)}, ${formatNumber(diff.high, digits)}${suffix}]`;
}

function getSnapshot(result, floor) {
  return getBuildSnapshot(result, floor);
}

function snapshotAffix(snapshot, affixType) {
  return Number(
    snapshot?.effectiveAffixes?.[affixType] ??
    snapshot?.supportAffixes?.[affixType] ??
    0
  );
}

function compactTrapRow(task, result, condition) {
  const b5 = getSnapshot(result, B5);
  const b6 = getSnapshot(result, B5 + 1);
  return {
    conditionId: task.conditionId,
    mode: condition.mode,
    curePolicy: task.curePolicy,
    scenarioId: task.scenarioId,
    runIndex: task.runIndex,
    className: task.className,
    pairId: [task.curePolicy, task.scenarioId, task.className, task.runIndex].join(":"),
    randomSequenceId: task.randomSequenceId || [
      task.conditionId,
      task.curePolicy,
      task.scenarioId,
      task.className,
      task.runIndex
    ].join(":"),
    survived: Boolean(result.survived),
    died: Boolean(result.died),
    reachedFloor: Number(result.reachedFloor),
    deathFloor: result.deathFloor === null ? null : Number(result.deathFloor),
    b5: Boolean(b5),
    b5Breakthrough: Boolean(b5 && b6),
    b5TrapBonus: snapshotAffix(b5, "trapBonus"),
    b5TrapSense: snapshotAffix(b5, "trapSense"),
    trap: {
      encounterCount: Number(result.trapEncounterCount || 0),
      encounterBySource: { ...(result.trapEncounterBySource || {}) },
      activations: Number(result.trapActivations || 0),
      activationsBySource: { ...(result.trapActivationsBySource || {}) },
      disarmAttempts: Number(result.trapDisarmAttempts || 0),
      disarmSuccesses: Number(result.trapDisarmSuccesses || 0),
      detections: Number(result.trapDetections || 0),
      detectionAttempts: Number(result.trapDetectionAttempts || 0),
      detectionCapHits: Number(result.trapDetectionCapHits || 0),
      detectionRateCounts: { ...(result.trapDetectionRateCounts || {}) },
      senseHolderDetectionAttempts: Number(result.trapSenseHolderDetectionAttempts || 0),
      disarmCapHits: Number(result.trapDisarmCapHits || 0),
      disarmRateCounts: { ...(result.trapDisarmRateCounts || {}) },
      planEvaluations: Number(result.trapPlanEvaluations || 0),
      planActionCounts: { ...(result.trapPlanActionCounts || {}) },
      avoided: Number(result.trapAvoided || 0),
      forced: Number(result.trapForced || 0),
      avoidanceCandidates: Number(result.trapAvoidanceCandidates || 0),
      avoidanceRejected: Number(result.trapAvoidanceRejected || 0),
      kitsUsed: Number(result.trapKitsUsed || 0),
      damageHp: Number(result.trapDamageHp || 0)
    },
    chest: {
      opened: Number(result.chestsOpened || 0),
      trapEncounters: Number(result.trapEncounterBySource?.chest || 0),
      trapActivations: Number(result.trapActivationsBySource?.chest || 0),
      trapDamageHp: Number(result.trapDamageHpBySource?.chest || 0),
      disarmAttempts: Number(result.chestDisarmAttempts || 0),
      disarmSuccesses: Number(result.chestDisarmSuccesses || 0),
      materialAcquired: Number(result.materialAcquiredBySource?.chest || 0)
    }
  };
}

function buildScenario(scenarioId, condition, curePolicy) {
  const base = getScenarioById(scenarioId);
  return {
    ...base,
    identificationPolicy: "powder",
    trapPolicy: "conservative",
    trapAvoidancePolicy: "ev",
    trapOverride: condition.trapOverride,
    trapBonusValueOverride: condition.trapBonusValues || null,
    statusCurePolicy: curePolicy,
    statusCureHpThreshold: Number(process.env.STATUS_CURE_HP_THRESHOLD || 0.35),
    statusCureMerchantPolicy: process.env.STATUS_CURE_MERCHANT_POLICY || "missing",
    healPotionMerchantPolicy: process.env.HEAL_POTION_MERCHANT_POLICY || "missing",
    fleeHpThreshold: Number(process.env.FLEE_HP_THRESHOLD || 0.35),
    elitePolicy: process.env.ELITE_POLICY || "avoid",
    simDiagnosticLevel: DIAGNOSTIC_MODE
  };
}

export function runTrapQualityTask(task, context) {
  const condition = context.conditions[task.conditionId];
  const scenario = context.scenarios[`${condition.id}:${task.curePolicy}:${task.scenarioId}`];
  const pairing = inferPairingEligibility(condition);
  const randomSequenceId = pairing.eligible
    ? [task.curePolicy, task.scenarioId, task.className, task.runIndex].join(":")
    : [condition.id, task.curePolicy, task.scenarioId, task.className, task.runIndex].join(":");
  // Pairing shares the initial random sequence; the condition may still
  // branch the later trap/combat trajectory.
  resetSimulationRandom(hashSeed(
    `${context.seed}:${randomSequenceId}`
  ));
  const result = simulateRun({
    className: task.className,
    startFloor: 1,
    targetDepth: TARGET_DEPTH,
    runIndex: task.runIndex,
    seriesId: "issue271-trap-quality",
    scoringProfile: context.scoringProfiles[
      `${condition.id}:${task.curePolicy}:${task.scenarioId}`
    ],
    scenario,
    workshop: scenario.workshop,
    collectDiagnostics: context.diagnosticMode !== "off",
    collectBuildSnapshots: true
  });
  return compactTrapRow({ ...task, randomSequenceId }, result, condition);
}

function createTrapTotals() {
  return {
    encounterCount: 0,
    encounterBySource: { chest: 0, floor: 0 },
    activations: 0,
    activationsBySource: { chest: 0, floor: 0 },
    disarmAttempts: 0,
    disarmSuccesses: 0,
    detections: 0,
    detectionAttempts: 0,
    detectionCapHits: 0,
    detectionRateCounts: {},
    senseHolderDetectionAttempts: 0,
    disarmCapHits: 0,
    disarmRateCounts: {},
    planEvaluations: 0,
    planActionCounts: {},
    avoided: 0,
    forced: 0,
    avoidanceCandidates: 0,
    avoidanceRejected: 0,
    kitsUsed: 0,
    damageHp: 0
  };
}

function addTrapTotals(target, row) {
  const trap = row.trap;
  target.encounterCount += trap.encounterCount;
  target.activations += trap.activations;
  target.disarmAttempts += trap.disarmAttempts;
  target.disarmSuccesses += trap.disarmSuccesses;
  target.detections += trap.detections;
  target.detectionAttempts += trap.detectionAttempts;
  target.detectionCapHits += trap.detectionCapHits;
  target.senseHolderDetectionAttempts += trap.senseHolderDetectionAttempts;
  target.disarmCapHits += trap.disarmCapHits;
  target.planEvaluations += trap.planEvaluations;
  target.avoided += trap.avoided;
  target.forced += trap.forced;
  target.avoidanceCandidates += trap.avoidanceCandidates;
  target.avoidanceRejected += trap.avoidanceRejected;
  target.kitsUsed += trap.kitsUsed;
  target.damageHp += trap.damageHp;
  addCounts(target.encounterBySource, trap.encounterBySource);
  addCounts(target.activationsBySource, trap.activationsBySource);
  addCounts(target.detectionRateCounts, trap.detectionRateCounts);
  addCounts(target.disarmRateCounts, trap.disarmRateCounts);
  addCounts(target.planActionCounts, trap.planActionCounts);
}

function summarizeTrap(rows) {
  const reachedRows = rows.filter(row => row.reachedFloor >= TRAP_START_FLOOR);
  const all = createTrapTotals();
  const reached = createTrapTotals();
  rows.forEach(row => addTrapTotals(all, row));
  reachedRows.forEach(row => addTrapTotals(reached, row));
  const perRun = (totals, denominator) => ({
    denominator,
    encounters: totals.encounterCount / Math.max(1, denominator),
    activations: totals.activations / Math.max(1, denominator),
    disarmAttempts: totals.disarmAttempts / Math.max(1, denominator),
    detections: totals.detections / Math.max(1, denominator),
    damageHp: totals.damageHp / Math.max(1, denominator)
  });
  return {
    all: {
      runs: rows.length,
      totals: all,
      perRun: perRun(all, rows.length)
    },
    reached: {
      runs: reachedRows.length,
      reachedRate: wilson(reachedRows.length, rows.length),
      totals: reached,
      perRun: perRun(reached, reachedRows.length)
    }
  };
}

function summarizeChest(rows) {
  const sum = field => rows.reduce((total, row) => total + Number(row.chest[field] || 0), 0);
  const attempts = sum("disarmAttempts");
  return {
    runs: rows.length,
    opened: meanInterval(rows.map(row => row.chest.opened)),
    trapEncounters: meanInterval(rows.map(row => row.chest.trapEncounters)),
    trapActivations: meanInterval(rows.map(row => row.chest.trapActivations)),
    trapDamageHp: meanInterval(rows.map(row => row.chest.trapDamageHp)),
    materialAcquired: meanInterval(rows.map(row => row.chest.materialAcquired)),
    disarmAttempts: attempts,
    disarmSuccesses: sum("disarmSuccesses"),
    disarmSuccessRate: wilson(sum("disarmSuccesses"), attempts)
  };
}

function summarizeDistribution(rows, field) {
  const values = {};
  rows.forEach(row => {
    const value = Number(row[field] || 0);
    values[value] = (values[value] || 0) + 1;
  });
  return values;
}

function groupSummary(entrants, affixType) {
  const predicate = row => Number(row[`b5${affixType === "trapBonus" ? "TrapBonus" : "TrapSense"}`]) > 0;
  const matched = entrants.filter(predicate);
  const unmatched = entrants.filter(row => !predicate(row));
  const endpoint = selector => classCenteredDifference(entrants, predicate, selector);
  const survival = selected => wilson(selected.filter(row => !row.died).length, selected.length);
  return {
    affixType,
    matchedN: matched.length,
    unmatchedN: unmatched.length,
    dataSufficient: matched.length >= MIN_GROUP_N && unmatched.length >= MIN_GROUP_N,
    matchedSurvival: survival(matched),
    unmatchedSurvival: survival(unmatched),
    endpointEffects: {
      reachedFloor: endpoint(row => row.reachedFloor),
      death: endpoint(row => row.b5 && row.died && row.deathFloor === B5),
      breakthrough: endpoint(row => row.b5Breakthrough)
    }
  };
}

function summarizeCase(rows, condition, curePolicy, scenarioId) {
  const entrants = rows.filter(row => row.b5);
  const groups = Object.fromEntries(condition.groupAffixes.map(affixType => [
    affixType,
    groupSummary(entrants, affixType)
  ]));
  const trap = summarizeTrap(rows);
  return {
    conditionId: condition.id,
    conditionLabel: condition.label,
    mode: condition.mode,
    curePolicy,
    scenarioId,
    runs: rows.length,
    b5: {
      entrantsN: entrants.length,
      entrantsRate: wilson(entrants.length, rows.length),
      breakthroughRate: wilson(entrants.filter(row => row.b5Breakthrough).length, entrants.length),
      deathRate: wilson(entrants.filter(row => row.died && row.deathFloor === B5).length, entrants.length),
      groups
    },
    survivalRate: wilson(rows.filter(row => !row.died).length, rows.length),
    deathRate: wilson(rows.filter(row => row.died).length, rows.length),
    averageReachedFloor: meanInterval(rows.map(row => row.reachedFloor)),
    trap,
    chest: summarizeChest(rows),
    chestByClass: Object.fromEntries(CLASS_NAMES.map(className => [
      className,
      summarizeChest(rows.filter(row => row.className === className))
    ])),
    b5TrapBonusDistribution: summarizeDistribution(entrants, "b5TrapBonus"),
    b5TrapSenseDistribution: summarizeDistribution(entrants, "b5TrapSense")
  };
}

function key(conditionId, curePolicy, scenarioId) {
  return `${conditionId}:${curePolicy}:${scenarioId}`;
}

function getCase(cases, conditionId, curePolicy, scenarioId) {
  return cases[key(conditionId, curePolicy, scenarioId)];
}

function isSeparated(effect) {
  return Boolean(effect && effect.low !== null && (effect.low > 0 || effect.high < 0));
}

function findAForCondition(cases, condition, scenarioId = "workshop-core-pools") {
  const smart = getCase(cases, condition.id, "smart", scenarioId);
  const never = getCase(cases, condition.id, "never", scenarioId);
  if (!smart || !never) return null;
  for (const endpoint of ["reachedFloor", "death", "breakthrough"]) {
    const left = smart.b5.groups[condition.groupAffixes[0]]?.endpointEffects[endpoint];
    const right = never.b5.groups[condition.groupAffixes[0]]?.endpointEffects[endpoint];
    const leftN = smart.b5.groups[condition.groupAffixes[0]];
    const rightN = never.b5.groups[condition.groupAffixes[0]];
    if (leftN?.matchedN >= TARGET_GROUP_N && leftN?.unmatchedN >= TARGET_GROUP_N &&
      rightN?.matchedN >= TARGET_GROUP_N && rightN?.unmatchedN >= TARGET_GROUP_N &&
      isSeparated(left) && isSeparated(right) &&
      Math.sign(left.estimate) === Math.sign(right.estimate)) {
      return {
        endpoint,
        smart: left,
        never: right,
        groupAffix: condition.groupAffixes[0]
      };
    }
  }
  return null;
}

function determineA(cases, conditions, scenarioId) {
  return conditions.map(condition => ({
    conditionId: condition.id,
    label: condition.label,
    A: findAForCondition(cases, condition, scenarioId)
  }));
}

function determineB(cases, conditions, scenarioId) {
  return conditions.map(condition => {
    const byCure = Object.fromEntries(CURE_POLICIES.map(curePolicy => {
      const item = getCase(cases, condition.id, curePolicy, scenarioId);
      const groups = condition.groupAffixes.map(affixType => ({
        affixType,
        survival: item?.b5.groups[affixType]?.unmatchedSurvival || null
      }));
      return [curePolicy, groups];
    }));
    const observed = Object.values(byCure).flat().find(item =>
      item.survival?.trials >= MIN_GROUP_N &&
      item.survival.estimate < PRACTICAL_SURVIVAL_FLOOR
    );
    return {
      conditionId: condition.id,
      label: condition.label,
      byCure,
      B: observed ? { affixType: observed.affixType, curePolicy: Object.entries(byCure)
        .find(([, items]) => items.includes(observed))?.[0] } : null
    };
  });
}

function buildNoAffixStability(cases, conditions, scenarioId, affixType) {
  const relevant = conditions.filter(condition => condition.groupAffixes.includes(affixType));
  const baseline = relevant[0];
  return {
    affixType,
    baseline: baseline?.id || null,
    comparisons: relevant.flatMap(condition => CURE_POLICIES.map(curePolicy => {
      const base = getCase(cases, baseline?.id, curePolicy, scenarioId)
        ?.b5.groups[affixType]?.unmatchedSurvival;
      const current = getCase(cases, condition.id, curePolicy, scenarioId)
        ?.b5.groups[affixType]?.unmatchedSurvival;
      const difference = survivalDifference(current, base);
      return {
        conditionId: condition.id,
        curePolicy,
        base,
        current,
        difference,
        stable: condition.id === baseline?.id ||
          difference.estimate === null || difference.intervalsOverlap
      };
    }))
  };
}

function minObservedGroupRate(cases, conditions, scenarioIds) {
  const rates = [];
  conditions.forEach(condition => scenarioIds.forEach(scenarioId => {
    CURE_POLICIES.forEach(curePolicy => {
      const item = getCase(cases, condition.id, curePolicy, scenarioId);
      condition.groupAffixes.forEach(affixType => {
        const group = item?.b5.groups[affixType];
        if (group?.matchedN !== undefined && item?.b5.entrantsN > 0) {
          rates.push({
            conditionId: condition.id,
            curePolicy,
            scenarioId,
            affixType,
            rate: group.matchedN / item.b5.entrantsN,
            numerator: group.matchedN,
            denominator: item.b5.entrantsN
          });
        }
      });
    });
  }));
  return rates.sort((left, right) => left.rate - right.rate);
}

function minObservedGroupRateForAffix(cases, conditions, scenarioIds, affixType) {
  return minObservedGroupRate(
    cases,
    conditions.filter(condition => condition.groupAffixes.includes(affixType)),
    scenarioIds
  ).filter(item => item.affixType === affixType);
}

function countEndpointTests(conditions, scenarioIds) {
  const groupCount = conditions.reduce((sum, condition) => sum + condition.groupAffixes.length, 0);
  return groupCount * CURE_POLICIES.length * scenarioIds.length * 3;
}

function distributionText(distribution) {
  return Object.entries(distribution || {})
    .sort((left, right) => Number(left[0]) - Number(right[0]))
    .map(([value, count]) => `${value}:${count}`)
    .join(" / ") || "未観測";
}

function exposureLine(item) {
  const all = item.trap.all;
  const reached = item.trap.reached;
  const avg = values => `${values.perRun.encounters.toFixed(3)}/${values.perRun.activations.toFixed(3)}/` +
    `${values.perRun.disarmAttempts.toFixed(3)}/${values.perRun.detections.toFixed(3)}`;
  return `- ${item.conditionLabel} / ${item.curePolicy}: 到達率=${formatRate(reached.reachedRate)}; ` +
    `遭遇/発動/解除試行/探知成功=${avg(all)} 全run、${avg(reached)} 到達run; ` +
    `floor/chest遭遇=${all.totals.encounterBySource.floor}/${all.totals.encounterBySource.chest}`;
}

function primarySweepLine(item, condition) {
  const group = item.b5.groups[condition.groupAffixes[0]];
  return `- ${condition.label} / ${item.curePolicy}: B5 N=${item.b5.entrantsN}, ` +
    `有/なし=${group?.matchedN || 0}/${group?.unmatchedN || 0}, ` +
    `なし生存=${formatRate(group?.unmatchedSurvival)}, ` +
    `Δfloor=${formatDifference(group?.endpointEffects.reachedFloor)}, ` +
    `Δ死亡=${formatDifference(group?.endpointEffects.death)}, ` +
    `Δ突破=${formatDifference(group?.endpointEffects.breakthrough)}, ` +
    `全run生存=${formatRate(item.survivalRate)}, 全run平均floor=${formatMean(item.averageReachedFloor)}`;
}

function chestLine(item, label) {
  const chest = item.chest;
  return `- ${label}: ` +
    `解除成功率=${formatRate(chest.disarmSuccessRate)} ` +
    `(試行=${chest.disarmAttempts}, 成功=${chest.disarmSuccesses}), ` +
    `罠被害HP/run=${formatMean(chest.trapDamageHp)}, ` +
    `素材/run=${formatMean(chest.materialAcquired)}, ` +
    `開封/run=${formatMean(chest.opened)}`;
}

function policyLine(item) {
  const totals = item.trap.all.totals;
  return `- ${item.conditionLabel} / ${item.curePolicy}: ` +
    `plan=${JSON.stringify(totals.planActionCounts)}, ` +
    `avoid=${totals.avoided}/${totals.avoidanceCandidates}, ` +
    `reject=${totals.avoidanceRejected}, disarm=${totals.disarmAttempts}`;
}

function buildReport(summary, summarySha256) {
  const primary = "workshop-core-pools";
  const bonusConditions = summary.conditions.filter(condition => condition.mode === "trapBonus");
  const senseConditions = summary.conditions.filter(condition => condition.mode === "trapSense");
  const combinedConditions = summary.conditions.filter(condition => condition.mode === "combined");
  const primaryItems = condition => CURE_POLICIES.map(curePolicy =>
    getCase(summary.cases, condition.id, curePolicy, primary)
  ).filter(Boolean);
  const primaryExposure = summary.conditions.flatMap(condition =>
    CURE_POLICIES.map(curePolicy => getCase(summary.cases, condition.id, curePolicy, primary))
      .filter(Boolean)
      .map(exposureLine)
  );
  const bonusA = summary.thresholds.trapBonus.A;
  const senseA = summary.thresholds.trapSense.A;
  const bonusB = summary.thresholds.trapBonus.B;
  const senseB = summary.thresholds.trapSense.B;
  const stabilityLines = [summary.stability.trapBonus, summary.stability.trapSense]
    .flatMap(stability => stability.comparisons.map(item =>
      `- ${stability.affixType} ${item.conditionId} / ${item.curePolicy}: ` +
      `base→current ${formatRate(item.base)}→${formatRate(item.current)}, ` +
      `Δ=${formatDifference(item.difference, 3)}, stable=${item.stable ? "yes" : "no"}`
    ));
  const mainSweep = [
    ...bonusConditions.flatMap(condition => primaryItems(condition)
      .map(item => primarySweepLine(item, condition))),
    ...senseConditions.flatMap(condition => primaryItems(condition)
      .map(item => primarySweepLine(item, condition))),
    ...combinedConditions.flatMap(condition => primaryItems(condition)
      .map(item => primarySweepLine(item, condition)))
  ];
  const chestLines = bonusConditions.flatMap(condition =>
    primaryItems(condition).flatMap(item => [
      chestLine(item, `${condition.label} / ${item.curePolicy} / 全職`),
      ...Object.entries(item.chestByClass || {}).map(([className, chest]) =>
        chestLine({ chest }, `${condition.label} / ${item.curePolicy} / ${className}`)
      )
    ])
  );
  const clampLines = summary.clamp.primary;
  const scenarioLines = summary.scenarioHighlights.flatMap(highlight => [
    `- ${highlight.scenarioId}: ${highlight.lines.join(" / ")}`
  ]);
  const endpointTests = countEndpointTests(summary.conditions, summary.measurement.scenarios);
  const lines = [
    "# Issue #271 罠の質依存測定",
    "",
    "## 曝露率（最初）",
    "",
    ...primaryExposure,
    "",
    "全run分母とB3到達run分母を分離。順序は罠遭遇/罠発動/解除試行/探知成功。解除試行は床・宝箱の実解除判定とTRAP_KIT使用を含む。",
    "",
    "## クランプ飽和",
    "",
    ...clampLines,
    `B5 entrant affix分布（主状態・選択条件合算）: trapBonus=${distributionText(summary.supply.primary.trapBonus.values)} / ` +
      `trapSense=${distributionText(summary.supply.primary.trapSense.values)}。`,
    "trapBonus maxは現行=非apt60/apt90、上界=非apt/apt100。trapSense capは現行0.95、上界1.00。",
    "",
    "## sim罠方針",
    "",
    "TRAP_POLICY=conservative / TRAP_AVOIDANCE_POLICY=ev。`calculateFloorDisarmEvThreshold` と `calculateFloorTrapAvoidanceEv` をsrc/rules/trap_rules.jsから呼ぶ実装を確認。",
    "強度変更はscenario trapOverrideのみ。有群の実値にだけ適用し、無群は0のまま。",
    ...summary.policy.primary,
    "方針が追随: trapBonusはdisarm/force比率、trapSenseはdetection/avoidance比率で条件別監査。",
    "",
    "## A / B判定（主状態 workshop-core-pools）",
    "",
    `trapBonus: A=${bonusA ? `${bonusA.conditionId} / ${bonusA.endpoint} / ${bonusA.groupAffix}` : "未観測"}; ` +
      `B=${bonusB ? `${bonusB.conditionId} / ${bonusB.curePolicy} / ${bonusB.affixType}` : "未観測"}; ` +
      `窓=${bonusA && !bonusB ? "A観測・B未観測（下限のみ）" : summary.thresholds.trapBonus.window === true ? "あり" : "未観測/未確定"}。`,
    `trapSense: A=${senseA ? `${senseA.conditionId} / ${senseA.endpoint} / ${senseA.groupAffix}` : "未観測"}; ` +
      `B=${senseB ? `${senseB.conditionId} / ${senseB.curePolicy} / ${senseB.affixType}` : "未観測"}; ` +
      `窓=${senseA && !senseB ? "A観測・B未観測（下限のみ）" : summary.thresholds.trapSense.window === true ? "あり" : "未観測/未確定"}。`,
    "Aはsmart/never双方で同符号・95% CI非0のB5 endpoint。BはB5 entrant内の対策なし群生存率<20%。N<30は未確定。",
    "クランプを上げた上界でA未観測なら、中間強度の掃引は打ち切り。未観測を効果なしと同一視しない。",
    "",
    "## 掃引表（主状態）",
    "",
    ...mainSweep,
    "",
    "## 宝箱副作用（主状態）",
    "",
    "解除成功率は宝箱罠の解除試行を分母とし、罠被害HP/run・宝箱素材/runは全run平均。各値に95% CIを付与。",
    ...chestLines,
    "",
    "## 対策なし群の安定性",
    "",
    ...stabilityLines,
    "CI非重複はoverrideが無群へ作用した可能性として再監査対象。無群の生存率が条件間で安定していることを判定する。",
    "",
    "## 7シナリオ確認",
    "",
    ...scenarioLines,
    "",
    "各シナリオは同じcondition/cure構成で測定。entrant条件付きendpointとは別に、全run生存率・平均到達floorを無条件指標として保持。",
    "",
    "## 多重比較・群偏り・N設計",
    "",
    `endpoint検定数=${endpointTests}、α=0.05期待偽陽性=${(endpointTests * 0.05).toFixed(1)}本。符号不一致・単発CI非交差はsignal扱いしない。`,
    `主状態 B5 entrant率=${summary.nDesign.primaryEntrantRate.toFixed(4)}。` +
      `最小実測有群率 trapBonus=${summary.nDesign.byAffix.trapBonus.rate.toFixed(4)} ` +
      `(${summary.nDesign.byAffix.trapBonus.numerator}/${summary.nDesign.byAffix.trapBonus.denominator}), ` +
      `trapSense=${summary.nDesign.byAffix.trapSense.rate.toFixed(4)} ` +
      `(${summary.nDesign.byAffix.trapSense.numerator}/${summary.nDesign.byAffix.trapSense.denominator})。`,
    `N≥${TARGET_GROUP_N}逆算: trapBonus=${summary.nDesign.byAffix.trapBonus.requiredRuns === null ? "NA" : summary.nDesign.byAffix.trapBonus.requiredRuns.toLocaleString()}, ` +
      `trapSense=${summary.nDesign.byAffix.trapSense.requiredRuns === null ? "NA" : summary.nDesign.byAffix.trapSense.requiredRuns.toLocaleString()} run/cell。` +
      ` 実測RUNS=${summary.measurement.runs}/cell。`,
    "有/なしN比は各掃引行に併記。entrant選別は到達runを条件付けるため因果効果とは解釈せず、全run指標を併記。",
    "",
    "## 実行監査",
    "",
    `seed=${summary.measurement.seed}、基本4職、${summary.measurement.scenarios.length} scenario、SIM_CALIBRATION_RUNS=100、SIM_PARALLEL未指定（解決値=${summary.measurement.resolvedParallelism}）、IDENTIFICATION_POLICY=powder、FLEE_POLICY=threshold。`,
    `trapPolicy=${summary.measurement.trapPolicy} / trapAvoidancePolicy=${summary.measurement.trapAvoidancePolicy}。src変更なし。`,
    `raw JSONL SHA-256: ${summary.measurement.rawSha256}`,
    `summary JSON SHA-256: ${summarySha256}`,
    `calibration wall-clock ${summary.measurement.calibrationWallSeconds.toFixed(3)}s / ` +
      `simulation wall-clock ${summary.measurement.wallClockSeconds.toFixed(3)}s / ` +
      `total CPU ${summary.measurement.totalCpuSeconds.toFixed(3)}s。`
  ];
  return `${lines.join("\n")}\n`;
}

function createRawWriter(path) {
  const file = openSync(path, "w");
  const hash = createHash("sha256");
  let rows = 0;
  return {
    write(batch) {
      const text = batch.map(row => JSON.stringify(row)).join("\n") +
        (batch.length ? "\n" : "");
      writeSync(file, text);
      hash.update(text);
      rows += batch.length;
    },
    close() {
      closeSync(file);
      return { rows, sha256: hash.digest("hex") };
    }
  };
}

async function runMeasurement() {
  const resultDir = `${process.cwd()}/scratch/results`;
  mkdirSync(resultDir, { recursive: true });
  const rawPath = `${resultDir}/${RESULT_BASENAME}.raw.jsonl`;
  const summaryPath = `${resultDir}/${RESULT_BASENAME}.json`;
  const reportPath = `${resultDir}/${RESULT_BASENAME}.md`;
  const rawWriter = createRawWriter(rawPath);
  const conditions = CONDITIONS;
  const conditionMap = Object.fromEntries(conditions.map(condition => [condition.id, condition]));
  const scenarios = {};
  const scoringProfiles = {};
  const calibrationStarted = performance.now();
  const calibrationCpuStarted = process.cpuUsage();
  for (const condition of conditions) {
    for (const curePolicy of CURE_POLICIES) {
      for (const scenarioId of REQUESTED_SCENARIOS) {
        const scenario = buildScenario(scenarioId, condition, curePolicy);
        const scenarioKey = key(condition.id, curePolicy, scenarioId);
        scenarios[scenarioKey] = scenario;
        resetSimulationRandom(SEED);
        scoringProfiles[scenarioKey] = calibrateCoreScoringProfile(
          CALIBRATION_RUNS,
          scenario,
          "powder",
          scenario.workshop
        );
      }
    }
  }
  const calibrationCpu = process.cpuUsage(calibrationCpuStarted);
  const calibrationWallSeconds = (performance.now() - calibrationStarted) / 1000;

  const cases = {};
  const simulationStarted = performance.now();
  const simulationCpuStarted = process.cpuUsage();
  const cells = conditions.flatMap(condition => CURE_POLICIES.flatMap(curePolicy =>
    REQUESTED_SCENARIOS.map(scenarioId => ({ condition, curePolicy, scenarioId }))
  ));
  for (let batchStart = 0; batchStart < cells.length; batchStart += CELL_BATCH_SIZE) {
    const batchCells = cells.slice(batchStart, batchStart + CELL_BATCH_SIZE);
    const tasks = batchCells.flatMap(({ condition, curePolicy, scenarioId }) =>
      Array.from({ length: RUNS }, (_, runIndex) => ({
        conditionId: condition.id,
        curePolicy,
        scenarioId,
        runIndex,
        className: CLASS_NAMES[runIndex % CLASS_NAMES.length]
      }))
    );
    const rows = await runSimTasks({
      moduleUrl: pathToFileURL(fileURLToPath(import.meta.url)).href,
      exportName: "runTrapQualityTask",
      runTask: runTrapQualityTask,
      tasks,
      context: {
        seed: SEED,
        conditions: conditionMap,
        scenarios,
        scoringProfiles,
        diagnosticMode: DIAGNOSTIC_MODE
      }
    });
    if (rows.length !== tasks.length) {
      throw new Error(`row count mismatch: ${batchStart} ${rows.length}/${tasks.length}`);
    }
    rawWriter.write(rows);
    batchCells.forEach(({ condition, curePolicy, scenarioId }) => {
      const selected = rows.filter(row =>
        row.conditionId === condition.id &&
        row.curePolicy === curePolicy &&
        row.scenarioId === scenarioId
      );
      cases[key(condition.id, curePolicy, scenarioId)] =
        summarizeCase(selected, condition, curePolicy, scenarioId);
    });
    console.error(
      `completed cells ${batchStart + 1}-${batchStart + batchCells.length}/${cells.length}: ` +
      `${rows.length} runs`
    );
  }
  const simulationCpu = process.cpuUsage(simulationCpuStarted);
  const wallClockSeconds = (performance.now() - simulationStarted) / 1000;
  const rawAudit = rawWriter.close();
  const measurement = {
    issue: 271,
    phase: "trap-quality",
    seed: SEED,
    runs: RUNS,
    calibrationRuns: CALIBRATION_RUNS,
    SIM_PARALLEL: "未指定",
    resolvedParallelism: resolveSimParallelism(RUNS),
    availableParallelism: availableParallelism(),
    identificationPolicy: "powder",
    fleePolicy: "threshold",
    fleeHpThreshold: Number(process.env.FLEE_HP_THRESHOLD || 0.35),
    trapPolicy: "conservative",
    trapAvoidancePolicy: "ev",
    scenarios: REQUESTED_SCENARIOS,
    conditions: conditions.map(condition => condition.id),
    classes: CLASS_NAMES,
    targetDepth: TARGET_DEPTH,
    diagnosticMode: DIAGNOSTIC_MODE,
    rawRows: rawAudit.rows,
    rawSha256: rawAudit.sha256,
    calibrationWallSeconds,
    wallClockSeconds,
    calibrationCpuSeconds: (calibrationCpu.user + calibrationCpu.system) / 1e6,
    simulationCpuSeconds: (simulationCpu.user + simulationCpu.system) / 1e6,
    totalCpuSeconds: (
      calibrationCpu.user + calibrationCpu.system +
      simulationCpu.user + simulationCpu.system
    ) / 1e6
  };
  const primaryEntrantRates = conditions.flatMap(condition => CURE_POLICIES.map(curePolicy =>
    getCase(cases, condition.id, curePolicy, "workshop-core-pools")?.b5.entrantsRate.estimate
  )).filter(Number.isFinite);
  const primaryEntrantRate = primaryEntrantRates.length ? Math.min(...primaryEntrantRates) : 0;
  const groupRates = minObservedGroupRate(cases, conditions, ["workshop-core-pools"]);
  const groupRatesByAffix = Object.fromEntries(["trapBonus", "trapSense"].map(affixType => {
    const rates = minObservedGroupRateForAffix(
      cases,
      conditions,
      ["workshop-core-pools"],
      affixType
    );
    const minRate = rates[0] || { rate: 0, numerator: 0, denominator: 0 };
    return [affixType, {
      rate: minRate.rate,
      numerator: minRate.numerator,
      denominator: minRate.denominator,
      requiredRuns: primaryEntrantRate > 0 && minRate.rate > 0
        ? Math.ceil(TARGET_GROUP_N / (primaryEntrantRate * minRate.rate))
        : null,
      rates
    }];
  }));
  const minGroup = groupRates[0] || { rate: 0, numerator: 0, denominator: 0 };
  const requiredRuns = Math.max(
    ...Object.values(groupRatesByAffix).map(item => item.requiredRuns || 0),
    0
  ) || null;
  const primaryCases = conditions.flatMap(condition => CURE_POLICIES.map(curePolicy =>
    getCase(cases, condition.id, curePolicy, "workshop-core-pools")
  ).filter(Boolean));
  const primaryClamp = primaryCases.map(item => {
    const totals = item.trap.all.totals;
    return `- ${item.conditionLabel} / ${item.curePolicy}: ` +
      `trapBonus disarm rate cap-hit=${totals.disarmCapHits}/${totals.planEvaluations} ` +
      `(${formatPercent(totals.planEvaluations ? totals.disarmCapHits / totals.planEvaluations : null)}), ` +
      `trapSense detect cap-hit=${totals.detectionCapHits}/${totals.detectionAttempts} ` +
      `(${formatPercent(totals.detectionAttempts ? totals.detectionCapHits / totals.detectionAttempts : null)})`;
  });
  const primaryPolicy = primaryCases.map(policyLine);
  const summary = {
    measurement,
    conditions,
    cases,
    nDesign: {
      targetGroupN: TARGET_GROUP_N,
      primaryEntrantRate,
      minObservedGroupRate: minGroup.rate,
      minObservedGroupNumerator: minGroup.numerator,
      minObservedGroupDenominator: minGroup.denominator,
      requiredRuns,
      groupRates,
      byAffix: groupRatesByAffix
    },
    thresholds: {
      trapBonus: {
        A: null,
        B: null,
        window: false,
        conditionA: determineA(cases, conditions.filter(condition => condition.mode === "trapBonus"), "workshop-core-pools"),
        conditionB: determineB(cases, conditions.filter(condition => condition.mode === "trapBonus"), "workshop-core-pools")
      },
      trapSense: {
        A: null,
        B: null,
        window: false,
        conditionA: determineA(cases, conditions.filter(condition => condition.mode === "trapSense"), "workshop-core-pools"),
        conditionB: determineB(cases, conditions.filter(condition => condition.mode === "trapSense"), "workshop-core-pools")
      }
    },
    clamp: { primary: primaryClamp },
    policy: { primary: primaryPolicy },
    stability: {
      trapBonus: buildNoAffixStability(
        cases,
        conditions.filter(condition => condition.mode === "trapBonus"),
        "workshop-core-pools",
        "trapBonus"
      ),
      trapSense: buildNoAffixStability(
        cases,
        conditions.filter(condition => condition.mode === "trapSense"),
        "workshop-core-pools",
        "trapSense"
      )
    },
    supply: {
      primary: {
        trapBonus: {
          values: Object.fromEntries(primaryCases.flatMap(item =>
            Object.entries(item.b5TrapBonusDistribution)
          ).reduce((entries, [value, count]) => {
            const found = entries.find(entry => entry[0] === value);
            if (found) found[1] += count;
            else entries.push([value, count]);
            return entries;
          }, []))
        },
        trapSense: {
          values: Object.fromEntries(primaryCases.flatMap(item =>
            Object.entries(item.b5TrapSenseDistribution)
          ).reduce((entries, [value, count]) => {
            const found = entries.find(entry => entry[0] === value);
            if (found) found[1] += count;
            else entries.push([value, count]);
            return entries;
          }, []))
        }
      }
    },
    scenarioHighlights: REQUESTED_SCENARIOS.map(scenarioId => {
      const selected = conditions;
      return {
        scenarioId,
        lines: selected.flatMap(condition => CURE_POLICIES.map(curePolicy => {
          const item = getCase(cases, condition.id, curePolicy, scenarioId);
          if (!item) return null;
          const group = item.b5.groups[condition.groupAffixes[0]];
          return `${condition.id}/${curePolicy}有/なし=${group?.matchedN || 0}/${group?.unmatchedN || 0}, ` +
            `なし生存=${formatRate(group?.unmatchedSurvival)}, 全run生存=${formatRate(item.survivalRate)}, ` +
            `平均floor=${formatMean(item.averageReachedFloor)}`;
        }).filter(Boolean))
      };
    })
  };
  summary.thresholds.trapBonus.A = summary.thresholds.trapBonus.conditionA
    .find(item => item.A)?.A ? summary.thresholds.trapBonus.conditionA.find(item => item.A) : null;
  if (summary.thresholds.trapBonus.A) {
    const condition = summary.thresholds.trapBonus.conditionA.find(item => item.A);
    summary.thresholds.trapBonus.A = {
      ...condition.A,
      conditionId: condition.conditionId
    };
  }
  summary.thresholds.trapBonus.B = summary.thresholds.trapBonus.conditionB.find(item => item.B)?.B
    ? {
        ...summary.thresholds.trapBonus.conditionB.find(item => item.B).B,
        conditionId: summary.thresholds.trapBonus.conditionB.find(item => item.B).conditionId
      }
    : null;
  summary.thresholds.trapSense.A = summary.thresholds.trapSense.conditionA
    .find(item => item.A)?.A ? summary.thresholds.trapSense.conditionA.find(item => item.A) : null;
  if (summary.thresholds.trapSense.A) {
    const condition = summary.thresholds.trapSense.conditionA.find(item => item.A);
    summary.thresholds.trapSense.A = {
      ...condition.A,
      conditionId: condition.conditionId
    };
  }
  summary.thresholds.trapSense.B = summary.thresholds.trapSense.conditionB.find(item => item.B)?.B
    ? {
        ...summary.thresholds.trapSense.conditionB.find(item => item.B).B,
        conditionId: summary.thresholds.trapSense.conditionB.find(item => item.B).conditionId
      }
    : null;
  const bonusAId = summary.thresholds.trapBonus.A?.conditionId;
  const bonusBId = summary.thresholds.trapBonus.B?.conditionId;
  const senseAId = summary.thresholds.trapSense.A?.conditionId;
  const senseBId = summary.thresholds.trapSense.B?.conditionId;
  summary.thresholds.trapBonus.window = Boolean(bonusAId && bonusBId &&
    conditions.findIndex(condition => condition.id === bonusAId) <
    conditions.findIndex(condition => condition.id === bonusBId));
  summary.thresholds.trapSense.window = Boolean(senseAId && senseBId &&
    senseAId !== senseBId);
  const summaryText = `${JSON.stringify(summary, null, 2)}\n`;
  writeFileSync(summaryPath, summaryText);
  const summarySha256 = createHash("sha256").update(summaryText).digest("hex");
  writeFileSync(reportPath, buildReport(summary, summarySha256));
  console.log(JSON.stringify({
    reportPath: reportPath.replace(`${process.cwd()}/`, ""),
    summaryPath: summaryPath.replace(`${process.cwd()}/`, ""),
    rawPath: rawPath.replace(`${process.cwd()}/`, ""),
    rawSha256: measurement.rawSha256,
    summarySha256,
    measurement,
    nDesign: summary.nDesign,
    A: {
      trapBonus: summary.thresholds.trapBonus.A,
      trapSense: summary.thresholds.trapSense.A
    },
    B: {
      trapBonus: summary.thresholds.trapBonus.B,
      trapSense: summary.thresholds.trapSense.B
    }
  }, null, 2));
}

if (isMainThread && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.env.TQ_REPORT_ONLY === "1") {
    const resultDir = `${process.cwd()}/scratch/results`;
    const summaryPath = `${resultDir}/${RESULT_BASENAME}.json`;
    const reportPath = `${resultDir}/${RESULT_BASENAME}.md`;
    const summaryText = readFileSync(summaryPath, "utf8");
    const summary = JSON.parse(summaryText);
    const summarySha256 = createHash("sha256").update(summaryText).digest("hex");
    writeFileSync(reportPath, buildReport(summary, summarySha256));
    console.log(JSON.stringify({ reportPath, summarySha256 }, null, 2));
  } else {
    await runMeasurement();
  }
}
