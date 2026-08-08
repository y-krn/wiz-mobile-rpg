// sim-scope: run
// Issue #271 Phase 1: current-run quality measurement only. No game rule changes.

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
const A2_SIGNAL = 0.20;
const MIN_A3_TREND_N = 194;
const ORDINAL_LEVELS = Object.freeze([0, 1, 2, 3]);

const ENV_DEFAULTS = Object.freeze({
  SIM_SEED: "271",
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
  SIM_SCENARIOS: SCENARIO_IDS.join(",")
});

for (const [key, value] of Object.entries(ENV_DEFAULTS)) {
  if (process.env[key] === undefined) process.env[key] = value;
}
if (process.env.SIM_PARALLEL) {
  throw new Error("SIM_PARALLEL must be omitted for Issue #271 measurement");
}
if (process.env.IDENTIFICATION_POLICY !== "powder") {
  throw new Error("IDENTIFICATION_POLICY must be powder for Issue #271 Phase 1");
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
const RESULT_SUFFIX = String(
  process.env.ISSUE271_RESULT_SUFFIX || FLEE_POLICY
).replace(/[^a-z0-9_-]/gi, "-");

const [
  {
    SIM_CLASSES,
    calibrateCoreScoringProfile,
    getScenarioById,
    resetSimulationRandom,
    simulateRun
  },
  { CORE_AFFIXES }
] = await Promise.all([
  import("./sim_depth_material_ev.js"),
  import("../src/data/affixes.js")
]);

const CLASS_NAMES = SIM_CLASSES.filter(className => BASIC_CLASSES.includes(className));
if (CLASS_NAMES.length !== BASIC_CLASSES.length) {
  throw new Error(`basic classes missing: ${BASIC_CLASSES.join(",")}`);
}

// Corresponding support is a measurement definition, retained from the approved
// #271 estimand. It is not a new game rule or a score weight.
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
const COMBAT_CORE_IDS = new Set(
  CORE_AFFIXES
    .filter(affix => affix.enabled && affix.poolGroup === "combat")
    .map(affix => affix.id)
);
const ECONOMY_CORE_IDS = new Set(
  CORE_AFFIXES
    .filter(affix => affix.enabled && affix.poolGroup === "economy")
    .map(affix => affix.id)
);

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

function normalDifference(left, right) {
  if (!left.length || !right.length) {
    return { estimate: null, low: null, high: null };
  }
  const leftMean = mean(left);
  const rightMean = mean(right);
  const estimate = leftMean - rightMean;
  const standardError = Math.sqrt(
    sampleVariance(left) / left.length + sampleVariance(right) / right.length
  );
  return {
    estimate,
    low: estimate - R95 * standardError,
    high: estimate + R95 * standardError
  };
}

function fisherCorrelation(rows, valueSelector, outcomeSelector) {
  const byClass = new Map();
  rows.forEach(row => {
    const value = valueSelector(row);
    const outcome = outcomeSelector(row);
    if (!Number.isFinite(value) || !Number.isFinite(outcome)) return;
    if (!byClass.has(row.className)) byClass.set(row.className, []);
    byClass.get(row.className).push({ value, outcome });
  });
  const pairs = [];
  byClass.forEach(classRows => {
    const valueMean = mean(classRows.map(row => row.value));
    const outcomeMean = mean(classRows.map(row => row.outcome));
    classRows.forEach(row => {
      pairs.push({
        value: row.value - valueMean,
        outcome: row.outcome - outcomeMean
      });
    });
  });
  const valueSquare = pairs.reduce((sum, row) => sum + row.value ** 2, 0);
  const outcomeSquare = pairs.reduce((sum, row) => sum + row.outcome ** 2, 0);
  const cross = pairs.reduce((sum, row) => sum + row.value * row.outcome, 0);
  const denominator = Math.sqrt(valueSquare * outcomeSquare);
  if (pairs.length < 4 || denominator === 0) {
    return { r: null, low: null, high: null, n: pairs.length };
  }
  const r = cross / denominator;
  const clipped = Math.max(-0.999999, Math.min(0.999999, r));
  const z = Math.atanh(clipped);
  const standardError = 1 / Math.sqrt(pairs.length - 3);
  return {
    r,
    low: Math.tanh(z - R95 * standardError),
    high: Math.tanh(z + R95 * standardError),
    n: pairs.length
  };
}

function toNumber(value) {
  return typeof value === "boolean" ? Number(value) : value;
}

function classCenteredEffect(rows, predicate, outcomeSelector) {
  const byClass = new Map();
  rows.forEach(row => {
    const outcome = toNumber(outcomeSelector(row));
    if (!Number.isFinite(outcome)) return;
    if (!byClass.has(row.className)) byClass.set(row.className, []);
    byClass.get(row.className).push({ row, outcome });
  });
  const withValues = [];
  const withoutValues = [];
  const classCounts = {};
  byClass.forEach((classRows, className) => {
    const classMean = mean(classRows.map(item => item.outcome));
    const withRows = classRows.filter(item => predicate(item.row));
    const withoutRows = classRows.filter(item => !predicate(item.row));
    classCounts[className] = {
      with: withRows.length,
      without: withoutRows.length
    };
    withValues.push(...withRows.map(item => item.outcome - classMean));
    withoutValues.push(...withoutRows.map(item => item.outcome - classMean));
  });
  return {
    ...normalDifference(withValues, withoutValues),
    withN: withValues.length,
    withoutN: withoutValues.length,
    classCounts
  };
}

function classCenteredOrdinalEffect(rows, valueSelector, outcomeSelector) {
  const byClass = new Map();
  rows.forEach(row => {
    const value = toNumber(valueSelector(row));
    const outcome = toNumber(outcomeSelector(row));
    if (!Number.isFinite(value) || !Number.isFinite(outcome)) return;
    if (!byClass.has(row.className)) byClass.set(row.className, []);
    byClass.get(row.className).push({ value, outcome });
  });
  const pairs = [];
  byClass.forEach(classRows => {
    const valueMean = mean(classRows.map(item => item.value));
    const outcomeMean = mean(classRows.map(item => item.outcome));
    classRows.forEach(item => {
      pairs.push({
        value: item.value - valueMean,
        outcome: item.outcome - outcomeMean
      });
    });
  });
  const valueSquare = pairs.reduce((sum, pair) => sum + pair.value ** 2, 0);
  const cross = pairs.reduce((sum, pair) => sum + pair.value * pair.outcome, 0);
  const degreesOfFreedom = pairs.length - byClass.size - 1;
  if (pairs.length < 4 || valueSquare === 0 || degreesOfFreedom <= 0) {
    return { estimate: null, low: null, high: null, n: pairs.length };
  }
  const estimate = cross / valueSquare;
  const residualSquare = pairs.reduce(
    (sum, pair) => sum + (pair.outcome - estimate * pair.value) ** 2,
    0
  );
  const standardError = Math.sqrt(
    (residualSquare / degreesOfFreedom) / valueSquare
  );
  return {
    estimate,
    low: estimate - R95 * standardError,
    high: estimate + R95 * standardError,
    n: pairs.length,
    degreesOfFreedom
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
    supportAffixes: { ...(snapshot.supportAffixes || {}) },
    effectiveAffixes: { ...(snapshot.effectiveAffixes || {}) },
    resistanceScore: snapshot.resistanceScore || 0
  };
}

function getB5Snapshot(result) {
  return compactSnapshot(
    result.diagnostics?.buildSnapshots?.find(
      snapshot => snapshot.floor === B5 && snapshot.point === "floor-start"
    ) || null
  );
}

function compactDeathLog(result) {
  const deathLog = result.diagnostics?.deathLogs?.at(-1);
  if (!deathLog) return null;
  return Object.fromEntries(
    ["floor", "cause", "message", "type"]
      .filter(key => deathLog[key] !== undefined)
      .map(key => [key, deathLog[key]])
  );
}

function deathSource(result) {
  if (!result.died) return null;
  if (["floor-trap", "chest-trap"].includes(result.deathEncounterType)) return "trap";
  if (["normal", "midboss", "boss", "elite"].includes(result.deathEncounterType)) {
    return result.deathEncounterType;
  }
  return "other";
}

function compactB5BossBattles(result) {
  return (result.specialBattles || [])
    .filter(battle => battle.floor === B5 && battle.type === "boss")
    .map(battle => ({
      finalResult: battle.finalResult,
      attempts: (battle.attempts || []).map(attempt => ({
        result: attempt.result,
        bloodWandObservations: attempt.bloodWandObservations
      }))
    }));
}

function compactCoreObservations(observations) {
  return {
    bloodWandSpellOpportunities: observations.bloodWandSpellOpportunities,
    bloodWandHealOpportunities: observations.bloodWandHealOpportunities,
    bloodWandSpellActivations: observations.bloodWandSpellActivations,
    bloodWandHealActivations: observations.bloodWandHealActivations,
    purifyTagKills: observations.purifyTagKills,
    purifyKillsWithMpRoom: observations.purifyKillsWithMpRoom,
    coreOpportunityCounts: { ...(observations.coreOpportunityCounts || {}) },
    coreActivationCounts: { ...(observations.coreActivationCounts || {}) }
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
    deathEncounterType: result.deathEncounterType || null,
    deathSource: deathSource(result),
    deathLog: compactDeathLog(result),
    bankedMaterials: Number(result.bankedMaterials || 0),
    carriedMaterials: Number(result.carriedMaterials || 0),
    timeCost: Number(result.timeCost || 0),
    materialAcquired: Number(result.materialAcquired || 0),
    b5,
    b5Death: Boolean(b5 && result.died && result.deathFloor === B5),
    b5Breakthrough: Boolean(b5 && b6),
    b5BossBattles: compactB5BossBattles(result),
    coreObservations: compactCoreObservations(result.coreObservations),
    equipmentFound: Number(result.equipmentFound || 0),
    coreEquipmentFound: Number(result.coreEquipmentFound || 0),
    coreEquipmentFoundById: { ...(result.coreEquipmentFoundById || {}) },
    supportAffixFoundById: { ...(result.supportAffixFoundById || {}) },
    coreEverEquippedIds: [...(result.coreEverEquippedIds || [])],
    finalCoreIds: [...(result.finalCoreIds || [])],
    coreEncounteredIds: [...(result.coreEncounteredIds || [])],
    coreDecisionReasons: { ...(result.coreDecisionReasons || {}) },
    identificationPowderAcquired: Number(result.identificationPowderAcquired || 0),
    identificationPowderUsed: Number(result.identificationPowderUsed || 0),
    identificationPowderRemaining: Number(result.identificationPowderRemaining || 0)
  };
}

export function runQualityRemeasureTask(task, context) {
  const scenario = context.scenarios[task.scenarioId];
  resetSimulationRandom(hashSeed(`${context.seed}:${task.scenarioId}:${task.runIndex}`));
  const result = simulateRun({
    className: task.className,
    startFloor: 1,
    targetDepth: TARGET_DEPTH,
    runIndex: task.runIndex,
    seriesId: "issue271-quality-remeasure",
    scoringProfile: context.scoringProfiles[task.scenarioId],
    scenario,
    workshop: scenario.workshop,
    collectDiagnostics: true
  });
  return compactRow(task, result);
}

function assignQuartiles(rows) {
  const byClass = new Map();
  rows.forEach(row => {
    if (!byClass.has(row.className)) byClass.set(row.className, []);
    byClass.get(row.className).push(row);
  });
  const quartiles = new Map();
  byClass.forEach(classRows => {
    const sorted = [...classRows].sort((left, right) =>
      left.b5.combatBuildScore - right.b5.combatBuildScore || left.runIndex - right.runIndex
    );
    sorted.forEach((row, index) => {
      quartiles.set(`${row.className}:${row.runIndex}`, Math.floor(index * 4 / sorted.length) + 1);
    });
  });
  return rows.map(row => ({
    ...row,
    qualityQuartile: quartiles.get(`${row.className}:${row.runIndex}`)
  }));
}

function hasSupport(snapshot, supportId) {
  return Number(snapshot?.supportAffixes?.[supportId] || 0) > 0;
}

function hasMatchedSupport(snapshot) {
  return Boolean(snapshot?.coreIds?.some(coreId =>
    (CORE_SUPPORT_SYNERGY[coreId] || []).some(supportId => hasSupport(snapshot, supportId))
  ));
}

function quartileStats(rows) {
  return [1, 2, 3, 4].map(quartile => {
    const group = rows.filter(row => row.qualityQuartile === quartile);
    const deaths = group.filter(row => row.b5Death).length;
    const breakthroughs = group.filter(row => row.b5Breakthrough).length;
    return {
      quartile,
      n: group.length,
      scoreMean: mean(group.map(row => row.b5.combatBuildScore)),
      scoreMin: Math.min(...group.map(row => row.b5.combatBuildScore)),
      scoreMax: Math.max(...group.map(row => row.b5.combatBuildScore)),
      b5Death: wilson(deaths, group.length),
      b5Breakthrough: wilson(breakthroughs, group.length)
    };
  });
}

function calculateA1(rows) {
  const quartileRows = assignQuartiles(rows);
  const quartiles = quartileStats(quartileRows);
  const q1 = quartileRows.filter(row => row.qualityQuartile === 1);
  const q4 = quartileRows.filter(row => row.qualityQuartile === 4);
  const q4q1Death = normalDifference(
    q4.map(row => Number(row.b5Death)),
    q1.map(row => Number(row.b5Death))
  );
  const adjacent = quartiles.slice(0, -1).map((left, index) => {
    const right = quartiles[index + 1];
    const pointDrop = left.b5Death.estimate - right.b5Death.estimate;
    const nonOverlapping = left.b5Death.low > right.b5Death.high ||
      right.b5Death.low > left.b5Death.high;
    return {
      from: left.quartile,
      to: right.quartile,
      pointDrop,
      ciOverlap: !nonOverlapping,
      favorableDirection: pointDrop > 0,
      significantFavorableDrop: pointDrop > 0 && nonOverlapping &&
        left.b5Death.low > right.b5Death.high
    };
  });
  const kneeCandidates = adjacent.filter(row => row.significantFavorableDrop);
  const largestPointDrop = [...adjacent].sort((left, right) => right.pointDrop - left.pointDrop)[0] || null;
  const monotonicNonIncreasing = quartiles.every((row, index) =>
    index === 0 || row.b5Death.estimate <= quartiles[index - 1].b5Death.estimate
  );
  const conditions = {
    q4MinusQ1UpperBelowZero: q4q1Death.high < 0,
    monotonicNonIncreasing,
    q4PointAtOrBelowGate: quartiles[3]?.b5Death.estimate <= 0.309
  };
  return {
    quartiles,
    q4MinusQ1Death: q4q1Death,
    adjacent,
    largestPointDrop,
    knee: kneeCandidates.length
      ? kneeCandidates[0]
      : monotonicNonIncreasing
        ? "有意差なし"
        : "非単調（kneeと呼ばない）",
    conditions,
    pass: Object.values(conditions).every(Boolean)
  };
}

function calculateA2(rows) {
  const depth = fisherCorrelation(
    rows,
    row => row.b5.combatBuildScore,
    row => row.reachedFloor
  );
  const breakthrough = fisherCorrelation(
    rows,
    row => row.b5.combatBuildScore,
    row => Number(row.b5Breakthrough)
  );
  const minimumNForCI = Math.ceil(3 + (R95 / Math.atanh(A2_SIGNAL)) ** 2);
  const minimumNFor80Power = Math.ceil(
    3 + ((R95 + 0.8416212335729143) / Math.atanh(A2_SIGNAL)) ** 2
  );
  const conditions = {
    depthPointAtLeast020: depth.r >= A2_SIGNAL,
    depthCiLowerAboveZero: depth.low > 0
  };
  return {
    depth,
    breakthrough,
    power: {
      signal: A2_SIGNAL,
      minimumNForCI,
      approximateNFor80PercentPower: minimumNFor80Power,
      observedN: depth.n,
      observedNAtLeastMinimum: depth.n >= minimumNForCI,
      observedNAtLeast80PowerTarget: depth.n >= minimumNFor80Power
    },
    auxiliaryBreakthroughSameDirection: breakthrough.r > 0,
    conditions,
    pass: Object.values(conditions).every(Boolean)
  };
}

function featureEffect(rows, predicate) {
  const featureRows = rows.filter(row => predicate(row));
  const nonFeatureRows = rows.filter(row => !predicate(row));
  const endpoints = {
    b5Breakthrough: classCenteredEffect(rows, predicate, row => row.b5Breakthrough),
    b5Death: classCenteredEffect(rows, predicate, row => row.b5Death),
    reachedFloor: classCenteredEffect(rows, predicate, row => row.reachedFloor)
  };
  const expectedDirections = {
    b5Breakthrough: "positive",
    b5Death: "negative",
    reachedFloor: "positive"
  };
  const endpointPass = Object.fromEntries(
    Object.entries(endpoints).map(([key, effect]) => {
      const direction = expectedDirections[key];
      const excludesZero = direction === "positive" ? effect.low > 0 : effect.high < 0;
      return [key, excludesZero];
    })
  );
  const groupsAtLeast30 = featureRows.length >= 30 && nonFeatureRows.length >= 30;
  return {
    withN: featureRows.length,
    withoutN: nonFeatureRows.length,
    endpoints,
    expectedDirections,
    endpointPass,
    groupsAtLeast30,
    status: !groupsAtLeast30
      ? "未確定（N<30）"
      : Object.values(endpointPass).every(Boolean)
        ? "成立"
        : "不成立",
    pass: groupsAtLeast30 && Object.values(endpointPass).every(Boolean)
  };
}

function ordinalFeatureEffect(rows, valueSelector) {
  // A3 uses a B5-time ordinal dose axis instead of the saturated core/no-core
  // split. Values are capped at 3+; the 1 and 2 levels must each have N>=30.
  const values = rows.map(row => Math.max(0, Math.min(3, valueSelector(row))));
  const levelCounts = Object.fromEntries(
    ORDINAL_LEVELS.map(level => [level === 3 ? "3+" : String(level), 0])
  );
  values.forEach(value => {
    const label = value === 3 ? "3+" : String(value);
    levelCounts[label]++;
  });
  const endpoints = {
    b5Breakthrough: classCenteredOrdinalEffect(rows, valueSelector, row => row.b5Breakthrough),
    b5Death: classCenteredOrdinalEffect(rows, valueSelector, row => row.b5Death),
    reachedFloor: classCenteredOrdinalEffect(rows, valueSelector, row => row.reachedFloor)
  };
  const expectedDirections = {
    b5Breakthrough: "positive",
    b5Death: "negative",
    reachedFloor: "positive"
  };
  const endpointPass = Object.fromEntries(
    Object.entries(endpoints).map(([key, effect]) => {
      const direction = expectedDirections[key];
      const excludesZero = direction === "positive" ? effect.low > 0 : effect.high < 0;
      return [key, excludesZero];
    })
  );
  const interiorLevelsAtLeast30 = levelCounts["1"] >= 30 && levelCounts["2"] >= 30;
  const dataSufficient = values.length >= MIN_A3_TREND_N && interiorLevelsAtLeast30;
  return {
    axis: "ordinal",
    levels: ["0", "1", "2", "3+"],
    levelCounts,
    n: values.length,
    endpoints,
    expectedDirections,
    endpointPass,
    dataSufficient,
    status: !dataSufficient
      ? "未確定（総N<194またはlevel 1/2のN<30）"
      : Object.values(endpointPass).every(Boolean)
        ? "成立"
        : "不成立",
    pass: dataSufficient && Object.values(endpointPass).every(Boolean)
  };
}

function calculateA3(rows) {
  const coreCount = row => Math.min(3, row.b5.coreIds.length);
  const combatCoreCount = row => Math.min(
    3,
    row.b5.coreIds.filter(coreId => COMBAT_CORE_IDS.has(coreId)).length
  );
  const economyCoreCount = row => Math.min(
    3,
    row.b5.coreIds.filter(coreId => ECONOMY_CORE_IDS.has(coreId)).length
  );
  return {
    coreCount: ordinalFeatureEffect(rows, coreCount),
    combatCoreCount: ordinalFeatureEffect(rows, combatCoreCount),
    economyCoreCount: ordinalFeatureEffect(rows, economyCoreCount),
    coreWithMatchingSupport: featureEffect(rows, row => hasMatchedSupport(row.b5))
  };
}

function aggregateCoreSupply(rows) {
  const coreCountDistribution = {};
  rows.forEach(row => {
    const count = row.b5.coreIds.length;
    coreCountDistribution[count] = (coreCountDistribution[count] || 0) + 1;
  });
  const perCore = Object.fromEntries(
    [...ENABLED_CORE_IDS].map(coreId => {
      const equipped = rows.filter(row => row.b5.coreIds.includes(coreId));
      const matched = equipped.filter(row =>
        (CORE_SUPPORT_SYNERGY[coreId] || []).some(supportId => hasSupport(row.b5, supportId))
      );
      const breakthrough = equipped.filter(row => row.b5Breakthrough).length;
      return [coreId, {
        b5EquipN: equipped.length,
        b5EquipRate: wilson(equipped.length, rows.length),
        matchingSupportN: matched.length,
        b5BreakthroughRateAmongEquipped: wilson(breakthrough, equipped.length)
      }];
    })
  );
  return {
    coreCountDistribution,
    anyCore: wilson(rows.filter(row => row.b5.coreIds.length > 0).length, rows.length),
    twoOrMoreCore: wilson(rows.filter(row => row.b5.coreIds.length >= 2).length, rows.length),
    combatCore: wilson(
      rows.filter(row => row.b5.coreIds.some(coreId => COMBAT_CORE_IDS.has(coreId))).length,
      rows.length
    ),
    coreWithMatchingSupport: wilson(rows.filter(row => hasMatchedSupport(row.b5)).length, rows.length),
    perCore
  };
}

function sumObservation(rows, key) {
  return rows.reduce((sum, row) => sum + Number(row.coreObservations[key] || 0), 0);
}

function aggregateOverallCoreSupply(rows) {
  const distribution = { 0: 0, 1: 0, 2: 0, "3+": 0 };
  rows.forEach(row => {
    const count = row.finalCoreIds.length;
    const bucket = count >= 3 ? "3+" : String(count);
    distribution[bucket]++;
  });
  const equipmentFound = rows.reduce((sum, row) => sum + row.equipmentFound, 0);
  const coreEquipmentFound = rows.reduce((sum, row) => sum + row.coreEquipmentFound, 0);
  return {
    coreEncounter: wilson(
      rows.filter(row => row.coreEncounteredIds.length > 0).length,
      rows.length
    ),
    finalEquipped: wilson(
      rows.filter(row => row.finalCoreIds.length > 0).length,
      rows.length
    ),
    twoOrMoreFinal: wilson(
      rows.filter(row => row.finalCoreIds.length >= 2).length,
      rows.length
    ),
    distribution,
    coreEquipmentShare: wilson(coreEquipmentFound, equipmentFound),
    equipmentFound,
    coreEquipmentFound
  };
}

function aggregateB5Boss(rows) {
  const attempts = rows.flatMap(row => row.b5BossBattles.flatMap(battle => battle.attempts));
  const sum = key => attempts.reduce(
    (total, attempt) => total + Number(attempt.bloodWandObservations?.[key] || 0),
    0
  );
  return {
    bossRunN: new Set(rows.flatMap(row =>
      row.b5BossBattles.flatMap(() => [row.runIndex])
    )).size,
    attemptsN: attempts.length,
    results: Object.fromEntries(
      [...new Set(rows.flatMap(row => row.b5BossBattles.map(battle => battle.finalResult)))]
        .map(result => [result, rows.reduce(
          (count, row) => count + row.b5BossBattles.filter(battle => battle.finalResult === result).length,
          0
        )])
    ),
    bloodWand: {
      spellCandidates: sum("spellCandidates"),
      spellActivations: sum("spellActivations"),
      healCandidates: sum("healCandidates"),
      healActivations: sum("healActivations")
    }
  };
}

function summarizeScenario(rows) {
  const entrants = rows.filter(row => row.b5);
  const deathCounts = {};
  rows.filter(row => row.died).forEach(row => {
    deathCounts[row.deathSource || "other"] = (deathCounts[row.deathSource || "other"] || 0) + 1;
  });
  const b5DeathSources = {};
  entrants.filter(row => row.b5Death).forEach(row => {
    b5DeathSources[row.deathSource || "other"] =
      (b5DeathSources[row.deathSource || "other"] || 0) + 1;
  });
  const totalTime = rows.reduce((sum, row) => sum + row.timeCost, 0);
  const totalBanked = rows.reduce((sum, row) => sum + row.bankedMaterials, 0);
  const powderAcquired = rows.reduce(
    (sum, row) => sum + row.identificationPowderAcquired,
    0
  );
  const powderUsed = rows.reduce((sum, row) => sum + row.identificationPowderUsed, 0);
  const powderRemaining = rows.reduce((sum, row) => sum + row.identificationPowderRemaining, 0);
  return {
    runs: rows.length,
    survived: wilson(rows.filter(row => row.survived).length, rows.length),
    died: wilson(rows.filter(row => row.died).length, rows.length),
    averageReachedFloor: mean(rows.map(row => row.reachedFloor)),
    materialEvPerTime: totalTime > 0 ? totalBanked / totalTime : null,
    deathCounts,
    b5: {
      entrantsN: entrants.length,
      death: wilson(entrants.filter(row => row.b5Death).length, entrants.length),
      breakthrough: wilson(
        entrants.filter(row => row.b5Breakthrough).length,
        entrants.length
      ),
      deathSources: b5DeathSources,
      averageScore: mean(entrants.map(row => row.b5.combatBuildScore))
    },
    a1: calculateA1(entrants),
    a2: calculateA2(entrants),
    a3: calculateA3(entrants),
    overallCoreSupply: aggregateOverallCoreSupply(rows),
    b5CoreSupply: aggregateCoreSupply(entrants),
    b5Boss: aggregateB5Boss(entrants),
    coreActivations: {
      bloodWandSpellOpportunities: sumObservation(rows, "bloodWandSpellOpportunities"),
      bloodWandSpellActivations: sumObservation(rows, "bloodWandSpellActivations"),
      bloodWandHealOpportunities: sumObservation(rows, "bloodWandHealOpportunities"),
      bloodWandHealActivations: sumObservation(rows, "bloodWandHealActivations"),
      purifyTagKills: sumObservation(rows, "purifyTagKills"),
      purifyKillsWithMpRoom: sumObservation(rows, "purifyKillsWithMpRoom")
    },
    identificationPowder: {
      acquired: powderAcquired,
      used: powderUsed,
      remaining: powderRemaining,
      depletedRuns: rows.filter(row => row.identificationPowderRemaining === 0).length
    }
  };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function formatPercent(value) {
  return value === null || value === undefined ? "NA" : `${(value * 100).toFixed(1)}%`;
}

function formatRate(rate) {
  return rate.estimate === null
    ? "NA"
    : `${formatPercent(rate.estimate)} [${formatPercent(rate.low)},${formatPercent(rate.high)}]`;
}

function shortScenarioSummary(summary) {
  return {
    runs: summary.runs,
    b5Entrants: summary.b5.entrantsN,
    b5Death: formatRate(summary.b5.death),
    b5Breakthrough: formatRate(summary.b5.breakthrough),
    averageReachedFloor: summary.averageReachedFloor,
    a1: {
      q4MinusQ1Death: summary.a1.q4MinusQ1Death,
      q4Death: summary.a1.quartiles[3]?.b5Death,
      pass: summary.a1.pass
    },
    a2: {
      depth: summary.a2.depth,
      breakthrough: summary.a2.breakthrough,
      pass: summary.a2.pass
    },
    a3: Object.fromEntries(
      Object.entries(summary.a3).map(([name, value]) => [name, value.axis === "ordinal"
        ? {
          axis: value.axis,
          levelCounts: value.levelCounts,
          n: value.n,
          endpoints: value.endpoints,
          status: value.status,
          pass: value.pass
        }
        : {
          withN: value.withN,
          withoutN: value.withoutN,
          endpoints: value.endpoints,
          status: value.status,
          pass: value.pass
        }])
    ),
    overallCoreSupply: {
      coreEncounter: formatRate(summary.overallCoreSupply.coreEncounter),
      finalEquipped: formatRate(summary.overallCoreSupply.finalEquipped),
      twoOrMoreFinal: formatRate(summary.overallCoreSupply.twoOrMoreFinal)
    },
    b5CoreSupply: {
      anyCore: formatRate(summary.b5CoreSupply.anyCore),
      twoOrMoreCore: formatRate(summary.b5CoreSupply.twoOrMoreCore),
      coreWithMatchingSupport: formatRate(summary.b5CoreSupply.coreWithMatchingSupport)
    }
  };
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
    exportName: "runQualityRemeasureTask",
    runTask: runQualityRemeasureTask,
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
  const rawPath = join(resultDir, `issue-271-quality-remeasure-${RESULT_SUFFIX}.jsonl`);
  const summaryPath = join(resultDir, `issue-271-quality-remeasure-${RESULT_SUFFIX}.json`);
  const rawText = rows.map(row => JSON.stringify(row)).join("\n") + "\n";
  const rawSha256 = sha256(rawText);
  writeFileSync(rawPath, rawText);
  const measurement = {
    phase: "1",
    seed: SEED,
    SIM_RUNS: RUNS,
    SIM_CALIBRATION_RUNS: CALIBRATION_RUNS,
    SIM_PARALLEL: "未指定",
    resolvedParallelism,
    availableParallelism: availableParallelism(),
    identificationPolicy: process.env.IDENTIFICATION_POLICY,
    fleePolicy: FLEE_POLICY,
    fleeHpThreshold: FLEE_HP_THRESHOLD,
    environment: {
      SIM_SEED: process.env.SIM_SEED,
      SIM_RUNS: process.env.SIM_RUNS,
      SIM_CALIBRATION_RUNS: process.env.SIM_CALIBRATION_RUNS,
      DEPARTURE_CRAFT_IDS: process.env.DEPARTURE_CRAFT_IDS,
      TRAP_POLICY: process.env.TRAP_POLICY,
      TRAP_AVOIDANCE_POLICY: process.env.TRAP_AVOIDANCE_POLICY,
      TRAP_DAMAGE_MULTIPLIER: process.env.TRAP_DAMAGE_MULTIPLIER,
      IDENTIFICATION_POLICY: process.env.IDENTIFICATION_POLICY,
      IDENTIFICATION_STARTING_POWDER: process.env.IDENTIFICATION_STARTING_POWDER,
      IDENTIFICATION_COST_OVERRIDE: process.env.IDENTIFICATION_COST_OVERRIDE,
      STATUS_CURE_POLICY: process.env.STATUS_CURE_POLICY,
      STATUS_CURE_HP_THRESHOLD: process.env.STATUS_CURE_HP_THRESHOLD,
      STATUS_CURE_MERCHANT_POLICY: process.env.STATUS_CURE_MERCHANT_POLICY,
      HEAL_POTION_MERCHANT_POLICY: process.env.HEAL_POTION_MERCHANT_POLICY,
      FLEE_POLICY: process.env.FLEE_POLICY,
      FLEE_HP_THRESHOLD: process.env.FLEE_HP_THRESHOLD,
      PORTAL_HP_THRESHOLD: process.env.PORTAL_HP_THRESHOLD,
      PORTAL_MAX_HEAL_POTIONS: process.env.PORTAL_MAX_HEAL_POTIONS,
      PORTAL_MIN_FLOOR: process.env.PORTAL_MIN_FLOOR,
      ELITE_POLICY: process.env.ELITE_POLICY,
      BLOOD_WAND_HP_PAYMENT_MIN_RATE: process.env.BLOOD_WAND_HP_PAYMENT_MIN_RATE,
      SIM_CORE_SCORE_DROP_TOLERANCE: process.env.SIM_CORE_SCORE_DROP_TOLERANCE,
      SIM_440_CONDITION: process.env.SIM_440_CONDITION,
      SIM_SCENARIOS: process.env.SIM_SCENARIOS,
      SIM_PARALLEL: "未指定"
    },
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
    cases: Object.fromEntries(
      SCENARIO_IDS.map(id => [id, shortScenarioSummary(caseSummaries[id])])
    )
  }, null, 2));
}

if (isMainThread) await main();
