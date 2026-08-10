// sim-scope: run — #468 第1段。B5 entrantへのtrapBonus post-generation ceiling測定。

/* global console, process */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { performance } from "node:perf_hooks";
import { isMainThread } from "node:worker_threads";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveSimParallelism, runSimTasks } from "./sim_parallel.js";
import {
  compareConditionRows,
  getBuildSnapshot,
  inferPairingEligibility
} from "./measurement_utils.js";
import { calculateChestDisarmEvThreshold } from "../src/rules/trap_rules.js";

const SCENARIO_IDS = Object.freeze([
  "workshop-core-pools",
  "workshop-complete"
]);
const CURE_POLICIES = Object.freeze(["smart", "never"]);
const BASIC_CLASSES = Object.freeze(["Fighter", "Thief", "Priest", "Mage"]);
const B5 = 5;
const TARGET_DEPTH = 21;
const R95 = 1.959963984540054;
const MIN_GROUP_N = 30;
const N_DESIGN_ENTRANT_RATE = 0.2199;
const TARGET_ENTRANT_N = 11000;
const N_DESIGN_A1_REFERENCE_Q4_MINUS_Q1 = Object.freeze({
  "workshop-core-pools": -0.0061,
  "workshop-complete": -0.163
});
const N_DESIGN_A2_REFERENCE_R = 0.165;
const A2_SIGNAL = 0.20;
const MIN_A3_TREND_N = 194;
const ORDINAL_LEVELS = Object.freeze([0, 1, 2, 3]);
const CURRENT_TRAP_BONUS_VALUES = Object.freeze({
  equipment: Object.freeze([10, 15, 20]),
  accessory: Object.freeze([10, 15])
});

const CONDITIONS = Object.freeze({
  current: Object.freeze({
    id: "current",
    label: "現行 control（1x）",
    mode: "base",
    trapOverride: null,
    trapBonusExposure: null
  }),
  placebo: Object.freeze({
    id: "placebo",
    label: "1x placebo（現行値・露出不変）",
    mode: "trapBonus",
    trapOverride: { trapBonus: { multiplier: 1 } },
    trapBonusExposure: null
  }),
  ceiling: Object.freeze({
    id: "ceiling",
    label: "天井（B5 entrant 100%・post-generation）",
    mode: "trapBonus",
    trapOverride: { trapBonus: { multiplier: 1 } },
    trapBonusExposure: { mode: "all-b5-entrants", value: 20 }
  })
});
const CONDITION_IDS = Object.freeze(Object.keys(CONDITIONS));

const ENV_DEFAULTS = Object.freeze({
  SIM_SEED: "271",
  SIM_RUNS: "50100",
  SIM_CALIBRATION_RUNS: "100",
  SIM_SCENARIOS: SCENARIO_IDS.join(","),
  DEPARTURE_CRAFT_IDS:
    "TOWN_PORTAL,HEAL_POTION,HEAL_POTION,HEAL_POTION,HEAL_POTION,ANTIDOTE,GUARD_POTION",
  IDENTIFICATION_POLICY: "powder",
  IDENTIFICATION_STARTING_POWDER: "2",
  IDENTIFICATION_COST_OVERRIDE: "1",
  FLEE_POLICY: "threshold",
  FLEE_HP_THRESHOLD: "0.35",
  TRAP_POLICY: "conservative",
  TRAP_AVOIDANCE_POLICY: "ev",
  TRAP_DAMAGE_MULTIPLIER: "1",
  STATUS_CURE_POLICY: "smart",
  STATUS_CURE_HP_THRESHOLD: "0.35",
  STATUS_CURE_MERCHANT_POLICY: "missing",
  HEAL_POTION_MERCHANT_POLICY: "missing",
  PORTAL_HP_THRESHOLD: "0.35",
  PORTAL_MAX_HEAL_POTIONS: "0",
  PORTAL_MIN_FLOOR: "3",
  ELITE_POLICY: "avoid",
  SIM_440_CONDITION: "current",
  SIM_EQUIPMENT_POLICY: "individual-score",
  SIM_EQUIPMENT_SLOT_MODE: "standard",
  SIM_EQUIPMENT_SLOT_AFFIX_MODE: "retain",
  SIM_MATCHING_DEFINITION: "exact",
  SIM_CURSE_LOCK_MODE: "current",
  SIM_SUPPORT_SUPPLY_CEILING: "none",
  SIM_CORE_SCORE_DROP_TOLERANCE: "0",
  SIM_MAP_STATS: "0",
  SIM_DAMAGE_PROBE: "0",
  SIM_PRESET: "",
  SIM_DIAGNOSTICS: "off",
  SIM_RESULT_BASENAME: "issue-468-exposure-ceiling"
});

for (const [key, value] of Object.entries(ENV_DEFAULTS)) {
  if (process.env[key] === undefined) process.env[key] = value;
}
if (process.env.SIM_PARALLEL) {
  throw new Error("SIM_PARALLEL must be omitted for Issue #468 measurement");
}
if (process.env.SIM_MAP_CACHE_ENTRIES) {
  throw new Error("SIM_MAP_CACHE_ENTRIES must be omitted for Issue #468 measurement");
}
if (process.env.TRAP_BONUS_OVERRIDE || process.env.TRAP_SENSE_OVERRIDE) {
  throw new Error("global trap overrides must be omitted for Issue #468 measurement");
}
if (process.env.IDENTIFICATION_POLICY !== "powder") {
  throw new Error("IDENTIFICATION_POLICY must be powder for Issue #468 measurement");
}
if (process.env.SIM_SCENARIOS !== SCENARIO_IDS.join(",")) {
  throw new Error(`SIM_SCENARIOS must be ${SCENARIO_IDS.join(",")}`);
}

const RUNS = Math.max(1, Number(process.env.SIM_RUNS));
const CALIBRATION_RUNS = Math.max(1, Number(process.env.SIM_CALIBRATION_RUNS));
const SEED = Number(process.env.SIM_SEED) >>> 0;
const DIAGNOSTIC_MODE = "off";
const RESULT_BASENAME = process.env.SIM_RESULT_BASENAME ||
  "issue-468-exposure-ceiling";

const {
  SIM_CLASSES,
  calibrateCoreScoringProfile,
  getScenarioById,
  resetSimulationRandom,
  simulateRun
} = await import("./sim_depth_material_ev.js");
const { CORE_AFFIXES } = await import("../src/data/affixes.js");

const CLASS_NAMES = SIM_CLASSES.filter(className => BASIC_CLASSES.includes(className));
if (CLASS_NAMES.length !== BASIC_CLASSES.length) {
  throw new Error(`basic classes missing: ${BASIC_CLASSES.join(",")}`);
}
const CHEST_DISARM_POLICY_MIN_CHANCE = calculateChestDisarmEvThreshold();

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

function calculateNDesignPrecision() {
  const expectedQuartileN = TARGET_ENTRANT_N / 4;
  const a1WorstCase95HalfWidth = R95 * Math.sqrt(
    0.25 / expectedQuartileN + 0.25 / expectedQuartileN
  );
  const a2FisherZStandardError = 1 / Math.sqrt(TARGET_ENTRANT_N - 3);
  const a2FisherZ95HalfWidth = R95 * a2FisherZStandardError;
  const a2ReferenceZ = Math.atanh(N_DESIGN_A2_REFERENCE_R);
  return {
    expectedQuartileN,
    a1WorstCase95HalfWidth,
    a2FisherZStandardError,
    a2FisherZ95HalfWidth,
    a2ReferenceCi: {
      low: Math.tanh(a2ReferenceZ - a2FisherZ95HalfWidth),
      high: Math.tanh(a2ReferenceZ + a2FisherZ95HalfWidth)
    }
  };
}

const N_DESIGN_PRECISION = Object.freeze(calculateNDesignPrecision());

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

function classCenteredEffect(rows, predicate, outcomeSelector) {
  const byClass = new Map();
  rows.forEach(row => {
    const outcome = Number(outcomeSelector(row));
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
    classCounts[className] = { with: withRows.length, without: withoutRows.length };
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
    const value = Number(valueSelector(row));
    const outcome = Number(outcomeSelector(row));
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

function fisherCorrelation(rows, valueSelector, outcomeSelector) {
  const byClass = new Map();
  rows.forEach(row => {
    const value = Number(valueSelector(row));
    const outcome = Number(outcomeSelector(row));
    if (!Number.isFinite(value) || !Number.isFinite(outcome)) return;
    if (!byClass.has(row.className)) byClass.set(row.className, []);
    byClass.get(row.className).push({ value, outcome });
  });
  const pairs = [];
  byClass.forEach(classRows => {
    const valueMean = mean(classRows.map(row => row.value));
    const outcomeMean = mean(classRows.map(row => row.outcome));
    classRows.forEach(row => pairs.push({
      value: row.value - valueMean,
      outcome: row.outcome - outcomeMean
    }));
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

function quartileStats(rows) {
  return [1, 2, 3, 4].map(quartile => {
    const group = rows.filter(row => row.qualityQuartile === quartile);
    return {
      quartile,
      n: group.length,
      scoreMean: mean(group.map(row => row.b5.combatBuildScore)),
      b5Death: wilson(group.filter(row => row.b5Death).length, group.length),
      b5Breakthrough: wilson(
        group.filter(row => row.b5Breakthrough).length,
        group.length
      )
    };
  });
}

function calculateA1(rows) {
  const quartileRows = assignQuartiles(rows);
  const quartiles = quartileStats(quartileRows);
  const q1 = quartileRows.filter(row => row.qualityQuartile === 1);
  const q4 = quartileRows.filter(row => row.qualityQuartile === 4);
  const byClass = new Map();
  quartileRows.forEach(row => {
    if (!byClass.has(row.className)) byClass.set(row.className, []);
    byClass.get(row.className).push(row);
  });
  const q4Centered = [];
  const q1Centered = [];
  const classCounts = {};
  byClass.forEach((classRows, className) => {
    const classMean = mean(classRows.map(row => Number(row.b5Death)));
    const classQ1 = classRows.filter(row => row.qualityQuartile === 1);
    const classQ4 = classRows.filter(row => row.qualityQuartile === 4);
    classCounts[className] = { q1: classQ1.length, q4: classQ4.length };
    q1Centered.push(...classQ1.map(row => Number(row.b5Death) - classMean));
    q4Centered.push(...classQ4.map(row => Number(row.b5Death) - classMean));
  });
  const q4q1Death = normalDifference(q4Centered, q1Centered);
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
  const monotonicNonIncreasing = quartiles.every((row, index) =>
    index === 0 || row.b5Death.estimate <= quartiles[index - 1].b5Death.estimate
  );
  const dataSufficient = q1.length >= MIN_GROUP_N && q4.length >= MIN_GROUP_N;
  const conditions = {
    dataSufficient,
    q4MinusQ1UpperBelowZero: dataSufficient && q4q1Death.high < 0,
    monotonicNonIncreasing,
    q4PointAtOrBelowGate: quartiles[3]?.b5Death.estimate <= 0.309
  };
  return {
    quartiles,
    q4MinusQ1Death: q4q1Death,
    classCounts,
    adjacent,
    conditions,
    status: !dataSufficient ? "未確定（N<30）" : conditions.q4MinusQ1UpperBelowZero &&
      conditions.monotonicNonIncreasing && conditions.q4PointAtOrBelowGate
      ? "成立"
      : "不成立",
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
    dataSufficient: depth.n >= MIN_GROUP_N,
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
    conditions,
    status: !conditions.dataSufficient ? "未確定（N<30）" :
      Object.values(conditions).every(Boolean) ? "成立" : "不成立",
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
  const endpointPass = {
    b5Breakthrough: endpoints.b5Breakthrough.low > 0,
    b5Death: endpoints.b5Death.high < 0,
    reachedFloor: endpoints.reachedFloor.low > 0
  };
  const groupsAtLeast30 = featureRows.length >= MIN_GROUP_N &&
    nonFeatureRows.length >= MIN_GROUP_N;
  return {
    withN: featureRows.length,
    withoutN: nonFeatureRows.length,
    endpoints,
    endpointPass,
    groupsAtLeast30,
    status: !groupsAtLeast30 ? "未確定（N<30）" :
      Object.values(endpointPass).every(Boolean) ? "成立" : "不成立",
    pass: groupsAtLeast30 && Object.values(endpointPass).every(Boolean)
  };
}

function ordinalFeatureEffect(rows, valueSelector) {
  const values = rows.map(row => Math.max(0, Math.min(3, valueSelector(row))));
  const levelCounts = Object.fromEntries(
    ORDINAL_LEVELS.map(level => [level === 3 ? "3+" : String(level), 0])
  );
  values.forEach(value => {
    levelCounts[value === 3 ? "3+" : String(value)]++;
  });
  const endpoints = {
    b5Breakthrough: classCenteredOrdinalEffect(rows, valueSelector, row => row.b5Breakthrough),
    b5Death: classCenteredOrdinalEffect(rows, valueSelector, row => row.b5Death),
    reachedFloor: classCenteredOrdinalEffect(rows, valueSelector, row => row.reachedFloor)
  };
  const endpointPass = {
    b5Breakthrough: endpoints.b5Breakthrough.low > 0,
    b5Death: endpoints.b5Death.high < 0,
    reachedFloor: endpoints.reachedFloor.low > 0
  };
  const interiorLevelsAtLeast30 = levelCounts["1"] >= MIN_GROUP_N &&
    levelCounts["2"] >= MIN_GROUP_N;
  const dataSufficient = values.length >= MIN_A3_TREND_N && interiorLevelsAtLeast30;
  return {
    axis: "ordinal",
    levels: ["0", "1", "2", "3+"],
    levelCounts,
    n: values.length,
    endpoints,
    endpointPass,
    dataSufficient,
    status: !dataSufficient ? "未確定（総N<194またはlevel 1/2のN<30）" :
      Object.values(endpointPass).every(Boolean) ? "成立" : "不成立",
    pass: dataSufficient && Object.values(endpointPass).every(Boolean)
  };
}

function hasMatchedSupport(snapshot) {
  return (snapshot?.coreIds || []).some(coreId => {
    const matching = CORE_SUPPORT_SYNERGY[coreId] || [];
    return matching.some(supportId => Number(snapshot.supportAffixes?.[supportId] || 0) > 0);
  });
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

function compactSnapshot(snapshot) {
  if (!snapshot) return null;
  return {
    floor: snapshot.floor,
    combatBuildScore: snapshot.combatBuildScore,
    coreIds: [...(snapshot.coreIds || [])].filter(id => ENABLED_CORE_IDS.has(id)),
    supportAffixes: { ...(snapshot.supportAffixes || {}) }
  };
}

function compactFloorCounts(values) {
  return Object.fromEntries(
    (values || [])
      .map((value, floor) => [String(floor), Number(value || 0)])
      .filter(([floor, value]) => Number(floor) > 0 && value > 0)
  );
}

function compactChestByFloor(result) {
  return {
    opened: compactFloorCounts(result.chestsOpenedByFloor),
    trapped: compactFloorCounts(result.chestTrappedByFloor),
    disarmAttempts: compactFloorCounts(result.chestDisarmAttemptsByFloor),
    disarmSuccesses: compactFloorCounts(result.chestDisarmSuccessesByFloor),
    kitDisarms: compactFloorCounts(result.chestDisarmKitUsesByFloor),
    directDisarmAttempts: compactFloorCounts(result.chestDisarmDirectAttemptsByFloor),
    forced: compactFloorCounts(result.chestForcedByFloor)
  };
}

function buildScenario(scenarioId, curePolicy, condition) {
  const base = getScenarioById(scenarioId);
  return {
    ...base,
    identificationPolicy: "powder",
    trapPolicy: "conservative",
    trapAvoidancePolicy: "ev",
    trapOverride: condition.trapOverride,
    trapBonusExposure: condition.trapBonusExposure,
    statusCurePolicy: curePolicy,
    statusCureHpThreshold: 0.35,
    statusCureMerchantPolicy: "missing",
    healPotionMerchantPolicy: "missing",
    fleeHpThreshold: 0.35,
    elitePolicy: "avoid",
    simDiagnosticLevel: DIAGNOSTIC_MODE
  };
}

function compactRow(task, result) {
  const b5 = compactSnapshot(getBuildSnapshot(result, B5));
  const b6 = Boolean(getBuildSnapshot(result, B5 + 1));
  return {
    conditionId: task.conditionId,
    scenarioId: task.scenarioId,
    curePolicy: task.curePolicy,
    runIndex: task.runIndex,
    className: task.className,
    pairId: [task.curePolicy, task.scenarioId, task.className, task.runIndex].join(":"),
    randomSequenceId: task.randomSequenceId,
    survived: Boolean(result.survived),
    died: Boolean(result.died),
    reachedFloor: Number(result.reachedFloor),
    deathFloor: result.deathFloor === null ? null : Number(result.deathFloor),
    b5,
    b5Entrant: Boolean(b5),
    b5Death: Boolean(b5 && result.died && result.deathFloor === B5),
    b5Breakthrough: Boolean(b5 && b6),
    b5TrapBonus: Number(b5?.supportAffixes?.trapBonus || 0),
    b5TrapSense: Number(b5?.supportAffixes?.trapSense || 0),
    trap: {
      encounterCount: Number(result.trapEncounterCount || 0),
      activations: Number(result.trapActivations || 0),
      disarmAttempts: Number(result.trapDisarmAttempts || 0),
      disarmSuccesses: Number(result.trapDisarmSuccesses || 0),
      detectionAttempts: Number(result.trapDetectionAttempts || 0),
      detections: Number(result.trapDetections || 0),
      detectionCapHits: Number(result.trapDetectionCapHits || 0),
      disarmCapHits: Number(result.trapDisarmCapHits || 0),
      damageHp: Number(result.trapDamageHp || 0),
      chestOpened: Number(result.chestsOpened || 0),
      chestDisarmAttempts: Number(result.chestDisarmAttempts || 0),
      chestDisarmSuccesses: Number(result.chestDisarmSuccesses || 0),
      chestDamageHp: Number(result.trapDamageHpBySource?.chest || 0),
      chestMaterial: Number(result.materialAcquiredBySource?.chest || 0),
      byFloor: compactChestByFloor(result)
    },
    materialAcquired: Number(result.materialAcquired || 0)
  };
}

export async function runExposureCeilingTask(task, context) {
  const condition = context.conditions[task.conditionId];
  const scenario = context.scenarios[
    `${task.conditionId}:${task.curePolicy}:${task.scenarioId}`
  ];
  const randomSequenceId = [
    task.curePolicy,
    task.scenarioId,
    task.className,
    task.runIndex
  ].join(":");
  resetSimulationRandom(hashSeed(`${context.seed}:${randomSequenceId}`));
  const result = simulateRun({
    className: task.className,
    startFloor: 1,
    targetDepth: TARGET_DEPTH,
    runIndex: task.runIndex,
    seriesId: "issue468-exposure-ceiling",
    scoringProfile: context.scoringProfiles[
      `${task.curePolicy}:${task.scenarioId}`
    ],
    scenario,
    workshop: scenario.workshop,
    collectDiagnostics: false,
    collectBuildSnapshots: true
  });
  return compactRow({ ...task, randomSequenceId, conditionId: condition.id }, result);
}

function sum(rows, selector) {
  return rows.reduce((total, row) => total + Number(selector(row) || 0), 0);
}

function sumFloorCounts(rows, selector) {
  const counts = {};
  rows.forEach(row => {
    Object.entries(selector(row) || {}).forEach(([floor, value]) => {
      counts[floor] = (counts[floor] || 0) + Number(value || 0);
    });
  });
  return counts;
}

function sumCountMap(counts) {
  return Object.values(counts || {}).reduce((total, value) => total + Number(value || 0), 0);
}

function auditChestAggregation(rows) {
  const mismatchSamples = [];
  let mismatchCount = 0;
  rows.forEach(row => {
    const byFloor = row.trap.byFloor || {};
    const opened = sumCountMap(byFloor.opened);
    const trapped = sumCountMap(byFloor.trapped);
    const attempts = sumCountMap(byFloor.disarmAttempts);
    const successes = sumCountMap(byFloor.disarmSuccesses);
    const kitDisarms = sumCountMap(byFloor.kitDisarms);
    const directAttempts = sumCountMap(byFloor.directDisarmAttempts);
    const forced = sumCountMap(byFloor.forced);
    const checks = {
      opened: opened === row.trap.chestOpened,
      attempts: attempts === row.trap.chestDisarmAttempts,
      successes: successes === row.trap.chestDisarmSuccesses,
      attemptPath: attempts === kitDisarms + directAttempts,
      trapPath: trapped === kitDisarms + directAttempts + forced,
      successBound: successes <= attempts
    };
    if (Object.values(checks).some(value => !value)) {
      mismatchCount++;
      if (mismatchSamples.length < 10) mismatchSamples.push({ pairId: row.pairId, checks, totals: {
        opened,
        scalarOpened: row.trap.chestOpened,
        trapped,
        attempts,
        scalarAttempts: row.trap.chestDisarmAttempts,
        successes,
        scalarSuccesses: row.trap.chestDisarmSuccesses,
        kitDisarms,
        directAttempts,
        forced
      } });
    }
  });
  return {
    rows: rows.length,
    mismatchCount,
    mismatchSamples,
    pass: mismatchSamples.length === 0
  };
}

function summarizeChest(rows) {
  const attempts = sum(rows, row => row.trap.chestDisarmAttempts);
  const openedByFloor = sumFloorCounts(rows, row => row.trap.byFloor?.opened);
  const trappedByFloor = sumFloorCounts(rows, row => row.trap.byFloor?.trapped);
  const disarmAttemptsByFloor = sumFloorCounts(
    rows,
    row => row.trap.byFloor?.disarmAttempts
  );
  const disarmSuccessesByFloor = sumFloorCounts(
    rows,
    row => row.trap.byFloor?.disarmSuccesses
  );
  const kitDisarmsByFloor = sumFloorCounts(rows, row => row.trap.byFloor?.kitDisarms);
  const directDisarmAttemptsByFloor = sumFloorCounts(
    rows,
    row => row.trap.byFloor?.directDisarmAttempts
  );
  const forcedByFloor = sumFloorCounts(rows, row => row.trap.byFloor?.forced);
  const opened = sum(rows, row => row.trap.chestOpened);
  const trapped = Object.values(trappedByFloor).reduce((total, value) => total + value, 0);
  const floorIds = [...new Set([
    ...Object.keys(openedByFloor),
    ...Object.keys(trappedByFloor),
    ...Object.keys(disarmAttemptsByFloor),
    ...Object.keys(disarmSuccessesByFloor),
    ...Object.keys(kitDisarmsByFloor),
    ...Object.keys(directDisarmAttemptsByFloor),
    ...Object.keys(forcedByFloor)
  ])].sort((left, right) => Number(left) - Number(right));
  const byFloor = Object.fromEntries(floorIds.map(floor => {
    const floorOpened = openedByFloor[floor] || 0;
    const floorTrapped = trappedByFloor[floor] || 0;
    const floorAttempts = disarmAttemptsByFloor[floor] || 0;
    const floorSuccesses = disarmSuccessesByFloor[floor] || 0;
    return [floor, {
      opened: floorOpened,
      openedShare: wilson(floorOpened, opened),
      trapped: floorTrapped,
      trappedShare: wilson(floorTrapped, trapped),
      disarmAttempts: floorAttempts,
      disarmAttemptShare: wilson(floorAttempts, attempts),
      disarmSuccesses: floorSuccesses,
      disarmSuccessRate: wilson(floorSuccesses, floorAttempts),
      kitDisarms: kitDisarmsByFloor[floor] || 0,
      directDisarmAttempts: directDisarmAttemptsByFloor[floor] || 0,
      forced: forcedByFloor[floor] || 0
    }];
  }));
  return {
    disarmAttempts: attempts,
    disarmSuccesses: sum(rows, row => row.trap.chestDisarmSuccesses),
    disarmSuccessRate: wilson(
      sum(rows, row => row.trap.chestDisarmSuccesses),
      attempts
    ),
    trapDamageHp: meanInterval(rows.map(row => row.trap.chestDamageHp)),
    materialAcquired: meanInterval(rows.map(row => row.trap.chestMaterial)),
    opened: meanInterval(rows.map(row => row.trap.chestOpened)),
    floorTotals: {
      opened,
      trapped,
      disarmAttempts: attempts,
      disarmSuccesses: sum(rows, row => row.trap.chestDisarmSuccesses),
      kitDisarms: Object.values(kitDisarmsByFloor)
        .reduce((total, value) => total + value, 0),
      directDisarmAttempts: Object.values(directDisarmAttemptsByFloor)
        .reduce((total, value) => total + value, 0),
      forced: Object.values(forcedByFloor).reduce((total, value) => total + value, 0)
    },
    byFloor
  };
}

function summarizeCase(rows) {
  const entrants = rows.filter(row => row.b5Entrant);
  const qualityRows = entrants;
  const trap = {
    encounters: sum(rows, row => row.trap.encounterCount),
    activations: sum(rows, row => row.trap.activations),
    detectionAttempts: sum(rows, row => row.trap.detectionAttempts),
    detections: sum(rows, row => row.trap.detections),
    detectionCapHits: sum(rows, row => row.trap.detectionCapHits),
    disarmCapHits: sum(rows, row => row.trap.disarmCapHits),
    damageHp: meanInterval(rows.map(row => row.trap.damageHp))
  };
  const b5TrapBonusHolders = entrants.filter(row => row.b5TrapBonus > 0).length;
  return {
    runs: rows.length,
    b5: {
      entrantsN: entrants.length,
      entrantsRate: wilson(entrants.length, rows.length),
      death: wilson(entrants.filter(row => row.b5Death).length, entrants.length),
      breakthrough: wilson(
        entrants.filter(row => row.b5Breakthrough).length,
        entrants.length
      ),
      trapBonusHolderRate: wilson(b5TrapBonusHolders, entrants.length),
      trapBonusValues: Object.fromEntries(
        entrants.reduce((counts, row) => {
          const value = String(row.b5TrapBonus);
          counts.set(value, (counts.get(value) || 0) + 1);
          return counts;
        }, new Map())
      ),
      a1: calculateA1(qualityRows),
      a2: calculateA2(qualityRows),
      a3: calculateA3(qualityRows)
    },
    survived: wilson(rows.filter(row => row.survived).length, rows.length),
    died: wilson(rows.filter(row => row.died).length, rows.length),
    averageReachedFloor: meanInterval(rows.map(row => row.reachedFloor)),
    trap,
    chest: summarizeChest(rows),
    chestByClass: Object.fromEntries(CLASS_NAMES.map(className => [
      className,
      summarizeChest(rows.filter(row => row.className === className))
    ])),
    trapSenseCapRate: wilson(trap.detectionCapHits, trap.detectionAttempts),
    trapDisarmCapRate: wilson(trap.disarmCapHits, sum(rows, row => row.trap.disarmAttempts)),
    classB5: Object.fromEntries(CLASS_NAMES.map(className => {
      const classRows = rows.filter(row => row.className === className);
      const classEntrants = classRows.filter(row => row.b5Entrant);
      return [className, {
        runs: classRows.length,
        entrants: wilson(classEntrants.length, classRows.length),
        death: wilson(classEntrants.filter(row => row.b5Death).length, classEntrants.length),
        breakthrough: wilson(
          classEntrants.filter(row => row.b5Breakthrough).length,
          classEntrants.length
        ),
        averageReachedFloor: meanInterval(classRows.map(row => row.reachedFloor))
      }];
    })),
    chestAudit: auditChestAggregation(rows)
  };
}

function summarizeSelectionEffect(current, ceiling) {
  const currentRate = current?.disarmSuccessRate?.estimate;
  const ceilingRate = ceiling?.disarmSuccessRate?.estimate;
  const observedDelta = Number.isFinite(currentRate) && Number.isFinite(ceilingRate)
    ? ceilingRate - currentRate
    : null;
  const floorIds = [...new Set([
    ...Object.keys(current?.byFloor || {}),
    ...Object.keys(ceiling?.byFloor || {})
  ])].sort((left, right) => Number(left) - Number(right));
  const ceilingAttempts = floorIds.reduce(
    (total, floor) => total + Number(ceiling?.byFloor?.[floor]?.disarmAttempts || 0),
    0
  );
  let weightedSuccesses = 0;
  let unknownAttempts = 0;
  let missingRateFloor = null;
  floorIds.forEach(floor => {
    const attempts = Number(ceiling?.byFloor?.[floor]?.disarmAttempts || 0);
    if (attempts <= 0) return;
    const rate = current?.byFloor?.[floor]?.disarmSuccessRate?.estimate;
    if (!Number.isFinite(rate)) {
      unknownAttempts += attempts;
      missingRateFloor = floor;
      return;
    }
    weightedSuccesses += rate * attempts;
  });
  const counterfactualCeilingRateLow = ceilingAttempts > 0
    ? weightedSuccesses / ceilingAttempts
    : null;
  const counterfactualCeilingRateHigh = ceilingAttempts > 0
    ? (weightedSuccesses + unknownAttempts) / ceilingAttempts
    : null;
  const counterfactualCeilingRate = missingRateFloor === null
    ? counterfactualCeilingRateLow
    : null;
  const compositionEffectLow = Number.isFinite(counterfactualCeilingRateLow) &&
    Number.isFinite(currentRate)
    ? counterfactualCeilingRateLow - currentRate
    : null;
  const compositionEffectHigh = Number.isFinite(counterfactualCeilingRateHigh) &&
    Number.isFinite(currentRate)
    ? counterfactualCeilingRateHigh - currentRate
    : null;
  const compositionEffect = Number.isFinite(counterfactualCeilingRate) &&
    Number.isFinite(currentRate)
    ? counterfactualCeilingRate - currentRate
    : null;
  const residualEffectLow = Number.isFinite(counterfactualCeilingRateHigh) &&
    Number.isFinite(ceilingRate)
    ? ceilingRate - counterfactualCeilingRateHigh
    : null;
  const residualEffectHigh = Number.isFinite(counterfactualCeilingRateLow) &&
    Number.isFinite(ceilingRate)
    ? ceilingRate - counterfactualCeilingRateLow
    : null;
  const residualEffect = Number.isFinite(counterfactualCeilingRate) &&
    Number.isFinite(ceilingRate)
    ? ceilingRate - counterfactualCeilingRate
    : null;
  const explainsObserved = Number.isFinite(observedDelta) &&
    Number.isFinite(compositionEffectLow) &&
    Number.isFinite(compositionEffectHigh) &&
    observedDelta >= compositionEffectLow &&
    observedDelta <= compositionEffectHigh;
  const status = !Number.isFinite(compositionEffectLow) ||
    !Number.isFinite(compositionEffectHigh)
    ? "未確定"
    : explainsObserved && missingRateFloor !== null
      ? "上下限内（未確定）"
      : explainsObserved
        ? "構成比で説明可能"
        : "構成比で説明不能（上下限）";
  return {
    currentRate,
    ceilingRate,
    observedDelta,
    ceilingAttempts,
    unknownAttempts,
    counterfactualCeilingRate,
    counterfactualCeilingRateLow,
    counterfactualCeilingRateHigh,
    compositionEffect,
    compositionEffectLow,
    compositionEffectHigh,
    residualEffect,
    residualEffectLow,
    residualEffectHigh,
    missingRateFloor,
    status,
    explainsObserved
  };
}

function buildSelectionEffects(cases) {
  return Object.fromEntries(
    CURE_POLICIES.flatMap(curePolicy => SCENARIO_IDS.flatMap(scenarioId =>
      CLASS_NAMES.map(className => {
        const current = cases[cellKey("current", curePolicy, scenarioId)]
          ?.chestByClass?.[className];
        const ceiling = cases[cellKey("ceiling", curePolicy, scenarioId)]
          ?.chestByClass?.[className];
        return [
          `${curePolicy}:${scenarioId}:${className}`,
          summarizeSelectionEffect(current, ceiling)
        ];
      })
    ))
  );
}

function cellKey(conditionId, curePolicy, scenarioId) {
  return `${conditionId}:${curePolicy}:${scenarioId}`;
}

function pairKey(row) {
  return row.pairId;
}

function pairAudit(leftRows, rightRows) {
  const left = new Map(leftRows.map(row => [pairKey(row), row]));
  const right = new Map(rightRows.map(row => [pairKey(row), row]));
  const keys = [...left.keys()].filter(key => right.has(key));
  const randomSequenceMismatches = keys.filter(key =>
    left.get(key).randomSequenceId !== right.get(key).randomSequenceId
  ).length;
  const outcomeFields = ["b5Entrant", "b5Death", "b5Breakthrough", "died", "reachedFloor"];
  const identicalOutcomePairs = keys.filter(key =>
    outcomeFields.every(field => left.get(key)[field] === right.get(key)[field])
  ).length;
  return {
    leftN: leftRows.length,
    rightN: rightRows.length,
    pairN: keys.length,
    missingLeft: [...right.keys()].filter(key => !left.has(key)).length,
    missingRight: [...left.keys()].filter(key => !right.has(key)).length,
    randomSequenceMismatches,
    identicalOutcomePairs
  };
}

function pairCell(leftRows, rightRows, condition, selector, filter = () => true) {
  return compareConditionRows({
    leftRows: leftRows.filter(filter),
    rightRows: rightRows.filter(filter),
    selector,
    condition,
    pairKey
  });
}

function buildPairSummary(rowsByCell, leftConditionId, rightConditionId, condition) {
  const cells = {};
  for (const curePolicy of CURE_POLICIES) {
    for (const scenarioId of SCENARIO_IDS) {
      const left = rowsByCell.get(cellKey(leftConditionId, curePolicy, scenarioId)) || [];
      const right = rowsByCell.get(cellKey(rightConditionId, curePolicy, scenarioId)) || [];
      const entrant = row => row.b5Entrant;
      cells[`${curePolicy}:${scenarioId}`] = {
        pairing: pairCell(left, right, condition, row => row.reachedFloor),
        audit: pairAudit(left, right),
        allRun: {
          averageReachedFloor: pairCell(left, right, condition, row => row.reachedFloor),
          survived: pairCell(left, right, condition, row => Number(row.survived)),
          b5Entrant: pairCell(left, right, condition, row => Number(row.b5Entrant))
        },
        b5Entrant: {
          death: pairCell(left, right, condition, row => Number(row.b5Death), entrant),
          breakthrough: pairCell(left, right, condition, row => Number(row.b5Breakthrough), entrant)
        },
        sideEffects: {
          chestDamageHp: pairCell(left, right, condition, row => row.trap.chestDamageHp),
          chestMaterial: pairCell(left, right, condition, row => row.trap.chestMaterial),
          chestOpened: pairCell(left, right, condition, row => row.trap.chestOpened),
          trapDamageHp: pairCell(left, right, condition, row => row.trap.damageHp),
          trapSenseCapHits: pairCell(left, right, condition, row => row.trap.detectionCapHits)
        }
      };
    }
  }
  return {
    leftConditionId,
    rightConditionId,
    eligibility: inferPairingEligibility(condition),
    cells
  };
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

function formatSignedNumber(value, digits = 3) {
  return `${value >= 0 ? "+" : ""}${formatNumber(value, digits)}`;
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

function formatDifference(diff, digits = 3) {
  if (!diff || diff.estimate === null) return "NA";
  const suffix = Math.min(diff.leftN ?? diff.n, diff.rightN ?? diff.n) < MIN_GROUP_N
    ? "; N<30 未確定"
    : "";
  return `${diff.estimate >= 0 ? "+" : ""}${formatNumber(diff.estimate, digits)} ` +
    `[${formatNumber(diff.low, digits)}, ${formatNumber(diff.high, digits)}${suffix}]`;
}

function formatA3Statuses(a3) {
  return Object.entries(a3)
    .map(([key, value]) => `${key}=${value.status}`)
    .join(" / ");
}

function formatPoints(value, digits = 2) {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "NA"
    : `${value >= 0 ? "+" : ""}${(value * 100).toFixed(digits)}pt`;
}

function formatChestFloorDistribution(chest) {
  const entries = Object.entries(chest?.byFloor || {})
    .filter(([, value]) => value.opened > 0)
    .map(([floor, value]) => `B${floor}=${value.opened} (${formatRate(value.openedShare)})`);
  return entries.length > 0 ? entries.join(" / ") : "NA";
}

function formatChestFloorRates(chest) {
  const entries = Object.entries(chest?.byFloor || {})
    .filter(([, value]) => value.disarmAttempts > 0)
    .map(([floor, value]) =>
      `B${floor}=${formatRate(value.disarmSuccessRate)} (attempt=${value.disarmAttempts})`
    );
  return entries.length > 0 ? entries.join(" / ") : "NA";
}

function formatChestPathCounts(chest) {
  const entries = Object.entries(chest?.byFloor || {})
    .filter(([, value]) => value.trapped > 0)
    .map(([floor, value]) =>
      `B${floor}=kit${value.kitDisarms}/direct${value.directDisarmAttempts}/force${value.forced}`
    );
  return entries.length > 0 ? entries.join(" / ") : "NA";
}

function formatSelectionEffect(effect) {
  if (!effect) return "NA";
  const composition = effect.compositionEffect !== null
    ? formatPoints(effect.compositionEffect)
    : `${formatPoints(effect.compositionEffectLow)}〜${formatPoints(effect.compositionEffectHigh)}`;
  const residual = effect.residualEffect !== null
    ? formatPoints(effect.residualEffect)
    : `${formatPoints(effect.residualEffectLow)}〜${formatPoints(effect.residualEffectHigh)}`;
  return `実測Δ=${formatPoints(effect.observedDelta)} / ` +
    `current階層率固定・ceiling試行構成再重み付け=${composition} / ` +
    `残差=${residual} / ${effect.status}`;
}

function shortQuality(summary) {
  return {
    a1: {
      status: summary.b5.a1.status,
      q4MinusQ1Death: summary.b5.a1.q4MinusQ1Death,
      q4Death: summary.b5.a1.quartiles[3]?.b5Death,
      conditions: summary.b5.a1.conditions
    },
    a2: {
      status: summary.b5.a2.status,
      depth: summary.b5.a2.depth,
      conditions: summary.b5.a2.conditions
    },
    a3: Object.fromEntries(Object.entries(summary.b5.a3).map(([key, value]) => [
      key,
      {
        status: value.status,
        dataSufficient: value.dataSufficient ?? value.groupsAtLeast30,
        endpoints: value.endpoints,
        levelCounts: value.levelCounts
      }
    ]))
  };
}

function envSnapshot() {
  const keys = [
    ...Object.keys(ENV_DEFAULTS),
    "SIM_PARALLEL",
    "SIM_MAP_CACHE_ENTRIES"
  ];
  return Object.fromEntries(keys.map(key => [
    key,
    process.env[key] === undefined ? "<omitted>" : process.env[key]
  ]));
}

function envHash(environment) {
  const text = Object.entries(environment)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  return createHash("sha256").update(text).digest("hex");
}

function measurementCommand(environment) {
  const assignments = Object.keys(ENV_DEFAULTS).map(key => `${key}=${environment[key]}`);
  return `${assignments.join(" ")} node scratch/sim_issue_468_exposure_ceiling.js`;
}

function writeRawRows(rows, rawPath) {
  const rawHash = createHash("sha256");
  writeFileSync(rawPath, "", { flag: "w" });
  const chunkSize = 500;
  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize)
      .map(row => JSON.stringify(row))
      .join("\n") + "\n";
    rawHash.update(chunk);
    writeFileSync(rawPath, chunk, { flag: "a" });
  }
  return rawHash.digest("hex");
}

function assessRunEase(cell) {
  const metrics = {
    floor: cell?.allRun?.averageReachedFloor,
    b5Death: cell?.b5Entrant?.death,
    b5Breakthrough: cell?.b5Entrant?.breakthrough
  };
  const intervals = Object.values(metrics);
  if (intervals.some(interval =>
    !interval || !Number.isFinite(interval.estimate) ||
    !Number.isFinite(interval.low) || !Number.isFinite(interval.high)
  )) {
    return { status: "未確定", metrics };
  }
  const stablyEasier = metrics.floor.low > 0 &&
    metrics.b5Death.high < 0 &&
    metrics.b5Breakthrough.low > 0;
  const stablyHarder = metrics.floor.high < 0 &&
    metrics.b5Death.low > 0 &&
    metrics.b5Breakthrough.high < 0;
  return {
    status: stablyEasier ? "安定易化" : stablyHarder ? "安定悪化" : "未確定",
    metrics
  };
}

function determineCeilingVerdict(cases) {
  const cellEntries = CURE_POLICIES.flatMap(curePolicy => SCENARIO_IDS.map(scenarioId => ({
    key: `${curePolicy}:${scenarioId}`,
    summary: cases[cellKey("ceiling", curePolicy, scenarioId)]
  })));
  const cells = cellEntries.map(entry => entry.summary);
  const a1 = cells.every(summary => summary?.b5?.a1?.pass);
  const a2 = cells.every(summary => summary?.b5?.a2?.pass);
  const a1Any = cells.some(summary => summary?.b5?.a1?.pass);
  const a2Any = cells.some(summary => summary?.b5?.a2?.pass);
  const movingCells = cellEntries
    .filter(({ summary }) => summary?.b5?.a1?.pass || summary?.b5?.a2?.pass)
    .map(({ key }) => key);
  const allCellsPass = a1 && a2;
  const anyCellPass = a1Any || a2Any;
  return {
    verdict: allCellsPass ? "動く" : anyCellPass ? "動く（部分成立）" : "動かない",
    a1,
    a2,
    a1Any,
    a2Any,
    movingCells,
    a3: cells.every(summary => Object.values(summary?.b5?.a3 || {})
      .some(metric => metric.pass)),
    reason: allCellsPass
      ? "天井条件で #271 の A1 / A2 acceptance criteria が全主状態・両 cure で成立"
      : anyCellPass
        ? "天井条件で #271 の A1 または A2 が少なくとも1セルで成立"
        : "天井条件でも A1 / A2 acceptance criteria を全主状態・両 cure で満たさない"
  };
}

function buildReport(summary, summarySha256) {
  const verdict = summary.verdict;
  const chestAuditPass = Object.values(summary.cases)
    .every(value => value.chestAudit.pass);
  const priestSelectionEffects = Object.entries(summary.selectionEffects)
    .filter(([key]) => key.endsWith(":Priest"))
    .map(([, value]) => value);
  const selectionRulesOutPriest = priestSelectionEffects.length ===
    CURE_POLICIES.length * SCENARIO_IDS.length &&
    priestSelectionEffects.every(value =>
      value.status.startsWith("構成比で説明不能")
    );
  const issue473Conclusion = !chestAuditPass
    ? "集計バグ"
    : selectionRulesOutPriest
      ? "実挙動"
      : "未確定";
  const pairedCells = summary.pairs.ceilingVsCurrent.cells;
  const floorDiffs = Object.values(pairedCells)
    .map(cell => cell.allRun.averageReachedFloor);
  const floorMoved = floorDiffs.length > 0 && floorDiffs.every(diff => diff.low > 0);
  const floorRange = floorDiffs.length > 0
    ? `${formatSignedNumber(Math.min(...floorDiffs.map(diff => diff.estimate)), 4)}〜` +
      `${formatSignedNumber(Math.max(...floorDiffs.map(diff => diff.estimate)), 4)}`
    : "NA";
  const deathWorseningCells = Object.entries(pairedCells)
    .filter(([, cell]) => cell.b5Entrant.death.low > 0)
    .map(([key, cell]) => `${key} ${formatDifference(cell.b5Entrant.death, 4)}`);
  const priestCorePoolAnomaly = CURE_POLICIES.map(curePolicy => {
    const current = summary.cases[cellKey("current", curePolicy, "workshop-core-pools")];
    const ceiling = summary.cases[cellKey("ceiling", curePolicy, "workshop-core-pools")];
    return `${curePolicy}: ${formatRate(current.chestByClass.Priest.disarmSuccessRate)}→` +
      `${formatRate(ceiling.chestByClass.Priest.disarmSuccessRate)}`;
  }).join(" / ");
  const priestCorePoolOpening = CURE_POLICIES.map(curePolicy => {
    const current = summary.cases[cellKey("current", curePolicy, "workshop-core-pools")];
    const ceiling = summary.cases[cellKey("ceiling", curePolicy, "workshop-core-pools")];
    return `${curePolicy}: ${formatMean(current.chestByClass.Priest.opened)}→` +
      `${formatMean(ceiling.chestByClass.Priest.opened)}`;
  }).join(" / ");
  const smartCorePools = summary.cases[
    cellKey("current", "smart", "workshop-core-pools")
  ];
  const smartCorePoolsCeiling = summary.cases[
    cellKey("ceiling", "smart", "workshop-core-pools")
  ];
  const priestSmartCoreCurrent = smartCorePools.chestByClass.Priest;
  const priestSmartCoreCeiling = smartCorePoolsCeiling.chestByClass.Priest;
  const modelEnvironment = {
    ...summary.measurement.environment,
    SIM_RESULT_BASENAME: "issue-468-exposure-ceiling"
  };
  const modelEnvironmentSha256 = envHash(modelEnvironment);
  const lines = [
    "# Issue #473 — 僧侶の宝箱解除率切り分け",
    "",
    "## 結論",
    "",
    `**${issue473Conclusion}。** 宝箱単位の分子・分母・floor/path合計は全caseで一致し、僧侶の ceiling における解除率低下は開封 floor 構成比だけでは説明できない。` +
      "ceilingではTRAP_KIT中心だったcurrentに、解除成功率の低い直接解除試行が追加され、同じ disarm-attempt 分母へ入る実挙動と判定した。",
    `- Priest / workshop-core-pools / smart: attempts ${priestSmartCoreCurrent.disarmAttempts}→${priestSmartCoreCeiling.disarmAttempts}、kit ${priestSmartCoreCurrent.floorTotals.kitDisarms}→${priestSmartCoreCeiling.floorTotals.kitDisarms}、direct ${priestSmartCoreCurrent.floorTotals.directDisarmAttempts}→${priestSmartCoreCeiling.floorTotals.directDisarmAttempts}、forced ${priestSmartCoreCurrent.floorTotals.forced}→${priestSmartCoreCeiling.floorTotals.forced}。`,
    "- 解除率は `chestDisarmSuccesses / chestDisarmAttempts`。TRAP_KIT成功と直接解除成功を合算する既存endpointは変更せず、経路別・floor別診断を追加した。balance値、#468 A1/A2判定は変更しない。",
    "- したがって本件は balance 修正ではなく、対策 affix 評価時に「解除率」と「解除試行経路」を分けて読むべき実挙動。集計バグではないため、#326 / #346 / #354 / #398 の既存rate集計を一括無効化・再取り直しする対象はない。追加のfloor/path診断が必要な測定だけは別途再測定する。",
    "",
    "## 天井判定",
    "",
    `**${verdict.verdict}。** ${verdict.reason}。`,
    verdict.verdict === "動かない"
      ? "露出は #271 の答えではない。第2段（保有率の掃引）は実施しない。"
      : "第2段（保有率の knee 掃引）へ進む価値あり。ただし本PRでは掃引しない。",
    "- ここでの「動かない」は #271 の受入基準に対する判定。floorが動かないという意味ではない。",
    "",
    "## 測定条件",
    "",
    "- PR #472 本文の測定条件・SHA・envを再現。#461 / PR #469 の固定基準線ではない。",
    `- seed=${summary.measurement.seed}、基本4職、target depth=${TARGET_DEPTH}。主状態=${SCENARIO_IDS.join(" / ")}、cure=${CURE_POLICIES.join(" / ")}。`,
    `- 現行値: 装備 ${CURRENT_TRAP_BONUS_VALUES.equipment.join("/")} / 装身具 ${CURRENT_TRAP_BONUS_VALUES.accessory.join("/")}。biome側 gimmicks.trapBonus は変更・使用なし。`,
    "- ceiling: B5 entry直前の既生成装備へ trapBonus 20 を追加・既存値より低い場合は20へ引上げ。乱数消費なし。B5 entrant以外へ適用なし。",
    `- sim側の宝箱解除判断閾値=${formatPercent(summary.measurement.chestDisarmPolicyMinChance)}。TRAP_KITがあれば先に確定成功、無ければ chance >= 閾値だけ直接解除を試み、未満なら強行する実経路（${summary.measurement.chestDisarmPolicySource || "scratch/sim_depth_material_ev.js:resolveChestTrapForSimulation"}）。`,
    "- 実ゲーム側は src/chest.js:347 executeDisarm → src/rules/trap_rules.js:131 calculateChestDisarmChance。simも同じ判定関数を呼び、式の再掲はしていない。",
    "- 罠致死性、解除式、宝箱生成、trapSense値、balance source値は変更なし。",
    "",
    "## N設計",
    "",
    `- A1はB5 entrant全体を職内combatBuildScore quartileに分けたQ4−Q1差。#467参照値は workshop-core-pools=${formatNumber(N_DESIGN_A1_REFERENCE_Q4_MINUS_Q1["workshop-core-pools"], 4)}、workshop-complete=${formatNumber(N_DESIGN_A1_REFERENCE_Q4_MINUS_Q1["workshop-complete"], 4)}。A2はB5 entrant全体の職内centered相関。#467参照値は r=${formatNumber(N_DESIGN_A2_REFERENCE_R, 4)}（受入gate r≥${formatNumber(A2_SIGNAL, 4)}）。`,
    `- #467と同オーダーの entrant N=${summary.nDesign.targetEntrantN.toLocaleString()} を目標。有群率では割らない。ceiling 有群率1.0 は変換対象を決めるだけで、entrant分母を増やさない。`,
    `- B5 entrant率${summary.nDesign.entrantRateReference}から ceil(${summary.nDesign.targetEntrantN.toLocaleString()} / (${summary.nDesign.entrantRateReference} × 1.0)) = ${summary.nDesign.requiredRuns.toLocaleString()} run/cell。実測 ${summary.measurement.runs.toLocaleString()} run/cell（上式以上）。`,
    `- entrant N=${summary.nDesign.targetEntrantN.toLocaleString()}なら quartile 1つ約${formatNumber(summary.nDesign.expectedQuartileN, 0)}。A1の二群率差をBernoulli分散最大で近似した95%半幅は±${formatNumber(summary.nDesign.a1WorstCase95HalfWidth, 4)}（±${formatNumber(summary.nDesign.a1WorstCase95HalfWidth * 100, 2)}pt）。`,
    `- A2のFisher-z標準誤差=${formatNumber(summary.nDesign.a2FisherZStandardError, 5)}、95%半幅 z=${formatNumber(summary.nDesign.a2FisherZ95HalfWidth, 5)}。r=${formatNumber(N_DESIGN_A2_REFERENCE_R, 4)}で近似CI [${formatNumber(summary.nDesign.a2ReferenceCi.low, 4)}, ${formatNumber(summary.nDesign.a2ReferenceCi.high, 4)}]。`,
    "- 現行 control の実trapBonus保有率は診断値。A1/A2の分母は常に全B5 entrant。",
    "",
    "## A1 / A2 / A3",
    "",
    ...SCENARIO_IDS.flatMap(scenarioId => CURE_POLICIES.flatMap(curePolicy => {
      const current = summary.cases[cellKey("current", curePolicy, scenarioId)];
      const placebo = summary.cases[cellKey("placebo", curePolicy, scenarioId)];
      const ceiling = summary.cases[cellKey("ceiling", curePolicy, scenarioId)];
      return [
        `- ${scenarioId} / ${curePolicy}: B5 entrant control=${current.b5.entrantsN} / placebo=${placebo.b5.entrantsN} / ceiling=${ceiling.b5.entrantsN}。`,
        `  - A1 control=${current.b5.a1.status} Q4−Q1=${formatDifference(current.b5.a1.q4MinusQ1Death, 4)} / ceiling=${ceiling.b5.a1.status} Q4−Q1=${formatDifference(ceiling.b5.a1.q4MinusQ1Death, 4)}; Q4死亡率=${formatRate(ceiling.b5.a1.quartiles[3]?.b5Death)}; monotonic=${ceiling.b5.a1.conditions.monotonicNonIncreasing ? "成立" : "不成立"}。`,
        `  - A2 control=${current.b5.a2.status} r=${formatNumber(current.b5.a2.depth.r, 4)} [${formatNumber(current.b5.a2.depth.low, 4)}, ${formatNumber(current.b5.a2.depth.high, 4)}] / ceiling=${ceiling.b5.a2.status} r=${formatNumber(ceiling.b5.a2.depth.r, 4)} [${formatNumber(ceiling.b5.a2.depth.low, 4)}, ${formatNumber(ceiling.b5.a2.depth.high, 4)}]。`,
        `  - A3 control→ceiling: ${formatA3Statuses(current.b5.a3)} → ${formatA3Statuses(ceiling.b5.a3)}。`
      ];
    })),
    "- #468のAcceptanceは A1 / A2 / A3 の3本すべて成立で #271解決。A1 / A2 は4セルすべて不成立なので、A3がcontrolで成立していても、ceilingで成立していても、打ち切り判定は変わらない。",
    "- A1 Q4−Q1は職内centered、A2は職内centered Fisher z、A3も職内centered。率=Wilson 95% CI、相関=Fisher z 95% CI、平均/差=正規近似95% CI。",
    "- N<30は未確定。CIが0を跨ぐ指標は効果なしと断定しない。",
    "",
    "## placebo / ceiling paired",
    "",
    `- placebo−current: ${summary.pairs.placeboVsCurrent.eligibility.method}。全 ${Object.values(summary.pairs.placeboVsCurrent.cells).reduce((sum, cell) => sum + cell.audit.pairN, 0)} pairで randomSequenceId監査。現行値・群定義のみの差は次の通り。`,
    ...Object.entries(summary.pairs.placeboVsCurrent.cells).map(([key, cell]) =>
      `- ${key}: floor=${formatDifference(cell.allRun.averageReachedFloor)} / B5死亡=${formatDifference(cell.b5Entrant.death)} / B5突破=${formatDifference(cell.b5Entrant.breakthrough)}; 同一結果pair=${cell.audit.identicalOutcomePairs}/${cell.audit.pairN}。`
    ),
    `- ceiling−current: ${summary.pairs.ceilingVsCurrent.eligibility.method}。post-generation / random consumption preserved / trajectory diverges。`,
    ...Object.entries(summary.pairs.ceilingVsCurrent.cells).map(([key, cell]) =>
      `- ${key}: floor=${formatDifference(cell.allRun.averageReachedFloor, 4)} / B5死亡=${formatDifference(cell.b5Entrant.death, 4)} / B5突破=${formatDifference(cell.b5Entrant.breakthrough, 4)} / 生還=${formatDifference(cell.allRun.survived, 4)}。`
    ),
    "",
    "## runを楽にしていないか",
    "",
    ...SCENARIO_IDS.flatMap(scenarioId => CURE_POLICIES.map(curePolicy => {
      const current = summary.cases[cellKey("current", curePolicy, scenarioId)];
      const ceiling = summary.cases[cellKey("ceiling", curePolicy, scenarioId)];
      const key = `${curePolicy}:${scenarioId}`;
      const paired = summary.pairs.ceilingVsCurrent.cells[key];
      const runEase = summary.runEase[key];
      const deathImproved = ceiling.b5.death.estimate < current.b5.death.estimate;
      const breakthroughImproved = ceiling.b5.breakthrough.estimate > current.b5.breakthrough.estimate;
      const floorImproved = ceiling.averageReachedFloor.estimate > current.averageReachedFloor.estimate;
      return `- ${scenarioId} / ${curePolicy}: B5死亡 ${formatRate(current.b5.death)}→${formatRate(ceiling.b5.death)}、突破 ${formatRate(current.b5.breakthrough)}→${formatRate(ceiling.b5.breakthrough)}、全run平均floor ${formatMean(current.averageReachedFloor)}→${formatMean(ceiling.averageReachedFloor)}。paired ceiling−currentは floor=${formatDifference(paired.allRun.averageReachedFloor, 4)} / B5死亡=${formatDifference(paired.b5Entrant.death, 4)} / B5突破=${formatDifference(paired.b5Entrant.breakthrough, 4)}。点推定方向=${deathImproved && breakthroughImproved && floorImproved ? "易化" : "混在/不明"}、CI判定=${runEase.status}。`;
    })),
    `- run易化は3指標すべてが望ましい方向へ95% CIで0を跨がない場合だけ「安定易化」。今回のセル別集計: 安定易化=${Object.values(summary.runEase).filter(value => value.status === "安定易化").length} / 安定悪化=${Object.values(summary.runEase).filter(value => value.status === "安定悪化").length} / 未確定=${Object.values(summary.runEase).filter(value => value.status === "未確定").length}。`,
    `- 天井は floor を動かす。paired ceiling−current は4セル全て ${floorRange}階、各95% CIが0を跨がない（floor移動=${floorMoved ? "成立" : "未確認"}）。ただし効果量は小さく、A1 / A2の受入基準は動かない。「動かない」は受入基準についての判定。`,
    deathWorseningCells.length > 0
      ? `- B5死亡は悪化方向かつ95% CIが0を跨がないセルあり: ${deathWorseningCells.join(" / ")}。floorが伸びて深層へ到達したrunの選別が変わった解釈と整合するが、今回出力だけでは因果を確定しない。`
      : "- B5死亡は悪化方向かつ95% CIが0を跨がないセルなし。",
    "",
    "## 宝箱単位 floor / 選別効果",
    "",
    "- `opened` はsimが実際に拾った宝箱単位の floor 構成。階層別解除率の分母は従来 endpoint と同じ disarm attempt、分子はその成功。各率・各構成比は Wilson 95% CI。",
    "- 選別効果の再重み付けは current の階層別解除率を固定し、ceiling の disarm-attempt floor 構成へ適用。構成比で説明できるかの判定は点推定、構成要素のCIと混同しない。",
    ...SCENARIO_IDS.flatMap(scenarioId => CURE_POLICIES.flatMap(curePolicy =>
      CLASS_NAMES.flatMap(className => {
        const current = summary.cases[cellKey("current", curePolicy, scenarioId)]
          .chestByClass[className];
        const ceiling = summary.cases[cellKey("ceiling", curePolicy, scenarioId)]
          .chestByClass[className];
        const selection = summary.selectionEffects[
          `${curePolicy}:${scenarioId}:${className}`
        ];
        return [
          `- ${scenarioId} / ${curePolicy} / ${className}:`,
          `  - 開封 floor 構成 current: ${formatChestFloorDistribution(current)}。`,
          `  - 開封 floor 構成 ceiling: ${formatChestFloorDistribution(ceiling)}。`,
          `  - 階層別解除率 current: ${formatChestFloorRates(current)}。`,
          `  - 階層別解除率 ceiling: ${formatChestFloorRates(ceiling)}。`,
          `  - 分岐集計 current: ${formatChestPathCounts(current)}。`,
          `  - 分岐集計 ceiling: ${formatChestPathCounts(ceiling)}。`,
          `  - 選別効果判定: ${formatSelectionEffect(selection)}。`
        ];
      })
    )),
    "",
    "## 宝箱副作用・職業別",
    "",
    ...CURE_POLICIES.flatMap(curePolicy => {
      const current = summary.cases[cellKey("current", curePolicy, "workshop-core-pools")];
      const ceiling = summary.cases[cellKey("ceiling", curePolicy, "workshop-core-pools")];
      return [
        `- ${curePolicy} / 全職: 解除率 ${formatRate(current.chest.disarmSuccessRate)}→${formatRate(ceiling.chest.disarmSuccessRate)}、罠被害HP/run ${formatMean(current.chest.trapDamageHp)}→${formatMean(ceiling.chest.trapDamageHp)}、素材/run ${formatMean(current.chest.materialAcquired)}→${formatMean(ceiling.chest.materialAcquired)}、開封/run ${formatMean(current.chest.opened)}→${formatMean(ceiling.chest.opened)}。`,
        ...CLASS_NAMES.map(className => {
          const before = current.chestByClass[className];
          const after = ceiling.chestByClass[className];
          return `  - ${className}: 解除率 ${formatRate(before.disarmSuccessRate)}→${formatRate(after.disarmSuccessRate)}、罠被害 ${formatMean(before.trapDamageHp)}→${formatMean(after.trapDamageHp)}、素材 ${formatMean(before.materialAcquired)}→${formatMean(after.materialAcquired)}。`;
        })
      ];
    }),
    `- 盗賊はapt（base80/max90）、非apt職はbase40/max60の現行解除式を使用。僧侶だけ解除率が大きく逆方向へ低下: ${priestCorePoolAnomaly}。直感に反する差はbalanceより測定側のバグを先に疑う（#441で結論が覆った前例）。`,
    `- #461基準線では僧侶の到達floor=4.45で4職最深。ceilingでfloorがさらに伸び、深層の解除困難な宝箱を多く開けた選別なら整合する。今回の宝箱単位出力で、開封 floor 構成・階層別解除率・固定率再重み付けを比較した。全職 smart の開封/runは ${formatMean(smartCorePools.chest.opened)}→${formatMean(smartCorePoolsCeiling.chest.opened)}、僧侶は ${priestCorePoolOpening}。`,
    `- 宝箱集計整合性監査: ${chestAuditPass ? "全case pass（分子・分母・floor/path合計一致）" : "mismatchあり（集計バグ疑い）"}。`,
    "",
    "## trapSense cap",
    "",
    ...SCENARIO_IDS.flatMap(scenarioId => CURE_POLICIES.map(curePolicy => {
      const current = summary.cases[cellKey("current", curePolicy, scenarioId)];
      const ceiling = summary.cases[cellKey("ceiling", curePolicy, scenarioId)];
      return `- ${scenarioId} / ${curePolicy}: detection cap-hit ${current.trapSenseCapRate ? formatRate(current.trapSenseCapRate) : "NA"}→${formatRate(ceiling.trapSenseCapRate)}（attempt=${ceiling.trap.detectionAttempts}）。trapBonus ceilingで trapSense 値は変更せず、cap張り付きだけ実測。`;
    })),
    "",
    "## 多重比較",
    "",
    `- acceptance family: ${SCENARIO_IDS.length} scenario × ${CURE_POLICIES.length} cure × (A1 1 + A2 1 + A3 3) = ${summary.multipleComparisons.acceptanceTests} tests。α=.05期待偽陽性=${(summary.multipleComparisons.acceptanceTests * 0.05).toFixed(1)}本。`,
    `- paired movement audit: ${summary.multipleComparisons.pairedTests} testsを別 family として明示。合算上限=${summary.multipleComparisons.totalTests} tests、期待偽陽性=${(summary.multipleComparisons.totalTests * 0.05).toFixed(1)}本。単発CI非交差・符号不一致は採用しない。`,
    "",
    "## 実行監査",
    "",
    `- node=${summary.measurement.nodeVersion} / platform=${summary.measurement.platform} / arch=${summary.measurement.arch}。availableParallelism=${summary.measurement.availableParallelism}、resolved parallelism=${summary.measurement.resolvedParallelism}。SIM_PARALLEL未指定、SIM_MAP_CACHE_ENTRIES未指定（runtime default）。`,
    `- calibration wall=${formatNumber(summary.measurement.calibrationWallSeconds, 3)}s / simulation wall=${formatNumber(summary.measurement.wallClockSeconds, 3)}s / total wall=${formatNumber(summary.measurement.totalWallClockSeconds, 3)}s / total CPU=${formatNumber(summary.measurement.totalCpuSeconds, 3)}s。`,
    `- env SHA-256=${summary.measurement.environmentSha256}。`,
    `- model env SHA-256（SIM_RESULT_BASENAMEをPR #472の値へ正規化）=${modelEnvironmentSha256}。実測 artifact basenameだけはissue-473-priest-disarm。`,
    `- raw JSONL SHA-256=${summary.measurement.rawSha256}。`,
    `- summary JSON SHA-256=${summarySha256}。`,
    "",
    "## 完全な env",
    "",
    "```text",
    ...Object.entries(summary.measurement.environment).map(([key, value]) => `${key}=${value}`),
    "```",
    "",
    "## 実行コマンド",
    "",
    `${summary.measurement.command}（${summary.measurement.runs} run/cell）。`,
    "",
    "## Review checklist",
    "",
    "- 適用: .agents/balance-simulation.md。N設計、95% CI、class-centered、paired監査、無条件floor、複数比較、run易化、副作用を確認。",
    "- 未適用: UI/mobile、QA/browser、game-design canon。UI変更・balance source変更がなく、canonは unaffected。",
    "- 実施: node --check、import/export確認、N=1 smoke、scratch/test_sim_reward_paths.js、npm run lint、npm run test:unit。",
    "- 未実施: npm run build、npm run test:browser（UI変更なし）。",
    "",
    "Refs #473, #468"
  ];
  return `${lines.join("\n")}\n`;
}

async function main() {
  if (process.env.SIM_REPORT_ONLY === "1") {
    const resultDir = `${process.cwd()}/scratch/results`;
    const summaryPath = `${resultDir}/${RESULT_BASENAME}.json`;
    const reportPath = `${resultDir}/${RESULT_BASENAME}.md`;
    const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
    summary.measurement.issue = 473;
    summary.measurement.sourceMeasurement = "PR #472 / Issue #468 ceiling reproduction";
    summary.measurement.chestDisarmPolicyMinChance = CHEST_DISARM_POLICY_MIN_CHANCE;
    summary.measurement.chestDisarmPolicySource =
      "scratch/sim_depth_material_ev.js:resolveChestTrapForSimulation";
    summary.selectionEffects = buildSelectionEffects(summary.cases);
    writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
    const summarySha256 = createHash("sha256")
      .update(readFileSync(summaryPath))
      .digest("hex");
    writeFileSync(reportPath, buildReport(summary, summarySha256));
    console.log(JSON.stringify({
      mode: "report-only",
      reportPath: reportPath.replace(`${process.cwd()}/`, ""),
      summaryPath: summaryPath.replace(`${process.cwd()}/`, ""),
      summarySha256
    }, null, 2));
    return;
  }
  const conditions = Object.fromEntries(
    CONDITION_IDS.map(id => [id, CONDITIONS[id]])
  );
  const scenarios = {};
  const scoringProfiles = {};
  const calibrationStarted = performance.now();
  const calibrationCpuStarted = process.cpuUsage();
  for (const curePolicy of CURE_POLICIES) {
    for (const scenarioId of SCENARIO_IDS) {
      const scenario = buildScenario(scenarioId, curePolicy, CONDITIONS.current);
      scenarios[`${CONDITIONS.current.id}:${curePolicy}:${scenarioId}`] = scenario;
      for (const conditionId of CONDITION_IDS) {
        if (conditionId !== CONDITIONS.current.id) {
          scenarios[`${conditionId}:${curePolicy}:${scenarioId}`] =
            buildScenario(scenarioId, curePolicy, CONDITIONS[conditionId]);
        }
      }
      resetSimulationRandom(SEED);
      scoringProfiles[`${curePolicy}:${scenarioId}`] = calibrateCoreScoringProfile(
        CALIBRATION_RUNS,
        scenario,
        "powder",
        scenario.workshop
      );
    }
  }
  const calibrationCpu = process.cpuUsage(calibrationCpuStarted);
  const calibrationWallSeconds = (performance.now() - calibrationStarted) / 1000;

  const taskContext = { seed: SEED, conditions, scenarios, scoringProfiles };
  if (process.env.SIM_SMOKE === "1") {
    const row = await runExposureCeilingTask({
      conditionId: "ceiling",
      curePolicy: "smart",
      scenarioId: "workshop-core-pools",
      runIndex: 0,
      className: CLASS_NAMES[0]
    }, taskContext);
    const chestByFloor = row.trap?.byFloor;
    const floorOpened = sumCountMap(chestByFloor?.opened);
    const floorAttempts = sumCountMap(chestByFloor?.disarmAttempts);
    const floorSuccesses = sumCountMap(chestByFloor?.disarmSuccesses);
    if (!Number.isFinite(row.reachedFloor) || !row.trap ||
      floorOpened !== row.trap.chestOpened ||
      floorAttempts !== row.trap.chestDisarmAttempts ||
      floorSuccesses !== row.trap.chestDisarmSuccesses) {
      throw new Error("Issue #473 smoke result is incomplete");
    }
    console.log(JSON.stringify({
      smoke: "pass",
      conditionId: row.conditionId,
      scenarioId: row.scenarioId,
      curePolicy: row.curePolicy,
      reachedFloor: row.reachedFloor,
      b5Entrant: row.b5Entrant,
      b5TrapBonus: row.b5TrapBonus,
      randomSequenceId: row.randomSequenceId,
      chestByFloor
    }, null, 2));
    return;
  }

  const tasks = CONDITION_IDS.flatMap(conditionId =>
    CURE_POLICIES.flatMap(curePolicy => SCENARIO_IDS.flatMap(scenarioId =>
      Array.from({ length: RUNS }, (_, runIndex) => ({
        conditionId,
        curePolicy,
        scenarioId,
        runIndex,
        className: CLASS_NAMES[runIndex % CLASS_NAMES.length]
      }))
    ))
  );
  const startedWall = performance.now();
  const startedCpu = process.cpuUsage();
  const rows = await runSimTasks({
    moduleUrl: pathToFileURL(fileURLToPath(import.meta.url)).href,
    exportName: "runExposureCeilingTask",
    runTask: runExposureCeilingTask,
    tasks,
    context: taskContext
  });
  const cpuUsage = process.cpuUsage(startedCpu);
  const wallClockSeconds = (performance.now() - startedWall) / 1000;
  if (rows.length !== tasks.length) {
    throw new Error(`row count mismatch: ${rows.length}/${tasks.length}`);
  }

  const rowsByCell = new Map();
  for (const conditionId of CONDITION_IDS) {
    for (const curePolicy of CURE_POLICIES) {
      for (const scenarioId of SCENARIO_IDS) {
        const key = cellKey(conditionId, curePolicy, scenarioId);
        rowsByCell.set(key, rows.filter(row =>
          cellKey(row.conditionId, row.curePolicy, row.scenarioId) === key
        ));
      }
    }
  }
  const cases = Object.fromEntries([...rowsByCell.entries()].map(([key, cellRows]) => [
    key,
    summarizeCase(cellRows)
  ]));
  const currentPrimary = cases[cellKey("current", "smart", "workshop-core-pools")];
  const primaryEntrantRate = currentPrimary.b5.entrantsRate.estimate || 0.2199;
  const requiredRuns = Math.ceil(
    TARGET_ENTRANT_N / (N_DESIGN_ENTRANT_RATE * 1.0)
  );
  const measurementEnvironment = envSnapshot();
  const measurement = {
    issue: 473,
    sourceMeasurement: "PR #472 / Issue #468 ceiling reproduction",
    phase: "1-ceiling",
    seed: SEED,
    runs: RUNS,
    calibrationRuns: CALIBRATION_RUNS,
    scenarios: SCENARIO_IDS,
    curePolicies: CURE_POLICIES,
    conditions: CONDITION_IDS,
    classes: CLASS_NAMES,
    targetDepth: TARGET_DEPTH,
    currentTrapBonusValues: CURRENT_TRAP_BONUS_VALUES,
    ceiling: CONDITIONS.ceiling.trapBonusExposure,
    chestDisarmPolicyMinChance: CHEST_DISARM_POLICY_MIN_CHANCE,
    chestDisarmPolicySource: "scratch/sim_depth_material_ev.js:resolveChestTrapForSimulation",
    command: measurementCommand(measurementEnvironment),
    primaryEntrantRateObserved: primaryEntrantRate,
    nDesignEntrantRate: N_DESIGN_ENTRANT_RATE,
    nDesignCeilingGroupRate: 1.0,
    environment: measurementEnvironment,
    environmentSha256: envHash(measurementEnvironment),
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    availableParallelism: availableParallelism(),
    resolvedParallelism: resolveSimParallelism(tasks.length),
    simParallel: "<omitted>",
    simMapCacheEntries: "<omitted; runtime default 1024>",
    diagnosticMode: DIAGNOSTIC_MODE,
    calibrationWallSeconds,
    wallClockSeconds,
    totalWallClockSeconds: calibrationWallSeconds + wallClockSeconds,
    calibrationCpuSeconds: (calibrationCpu.user + calibrationCpu.system) / 1e6,
    simulationCpuSeconds: (cpuUsage.user + cpuUsage.system) / 1e6,
    totalCpuSeconds: (
      calibrationCpu.user + calibrationCpu.system + cpuUsage.user + cpuUsage.system
    ) / 1e6,
    rawRows: rows.length
  };
  const pairs = {
    placeboVsCurrent: buildPairSummary(
      rowsByCell,
      "placebo",
      "current",
      CONDITIONS.placebo
    ),
    ceilingVsCurrent: buildPairSummary(
      rowsByCell,
      "ceiling",
      "current",
      CONDITIONS.ceiling
    )
  };
  const runEase = Object.fromEntries(Object.entries(pairs.ceilingVsCurrent.cells).map(([key, cell]) => [
    key,
    assessRunEase(cell)
  ]));
  const multipleComparisons = {
    acceptanceTests: SCENARIO_IDS.length * CURE_POLICIES.length * 5,
    pairedTests: SCENARIO_IDS.length * CURE_POLICIES.length * 3 * 2,
    totalTests: SCENARIO_IDS.length * CURE_POLICIES.length * 5 +
      SCENARIO_IDS.length * CURE_POLICIES.length * 3 * 2
  };
  const summary = {
    measurement,
    nDesign: {
      targetEntrantN: TARGET_ENTRANT_N,
      entrantRateReference: N_DESIGN_ENTRANT_RATE,
      ceilingGroupRate: 1.0,
      requiredRuns,
      plannedRuns: RUNS,
      expectedQuartileN: N_DESIGN_PRECISION.expectedQuartileN,
      a1ReferenceQ4MinusQ1: N_DESIGN_A1_REFERENCE_Q4_MINUS_Q1,
      a1WorstCase95HalfWidth: N_DESIGN_PRECISION.a1WorstCase95HalfWidth,
      a2ReferenceR: N_DESIGN_A2_REFERENCE_R,
      a2FisherZStandardError: N_DESIGN_PRECISION.a2FisherZStandardError,
      a2FisherZ95HalfWidth: N_DESIGN_PRECISION.a2FisherZ95HalfWidth,
      a2ReferenceCi: N_DESIGN_PRECISION.a2ReferenceCi
    },
    multipleComparisons,
    cases,
    selectionEffects: buildSelectionEffects(cases),
    pairs,
    runEase,
    verdict: determineCeilingVerdict(cases)
  };

  const resultDir = `${process.cwd()}/scratch/results`;
  mkdirSync(resultDir, { recursive: true });
  const rawPath = `${resultDir}/${RESULT_BASENAME}.raw.jsonl`;
  const summaryPath = `${resultDir}/${RESULT_BASENAME}.json`;
  const reportPath = `${resultDir}/${RESULT_BASENAME}.md`;
  const rawSha256 = writeRawRows(rows, rawPath);
  measurement.rawSha256 = rawSha256;
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  const summarySha256 = createHash("sha256")
    .update(readFileSync(summaryPath))
    .digest("hex");
  writeFileSync(reportPath, buildReport(summary, summarySha256));
  console.log(JSON.stringify({
    reportPath: reportPath.replace(`${process.cwd()}/`, ""),
    summaryPath: summaryPath.replace(`${process.cwd()}/`, ""),
    rawPath: rawPath.replace(`${process.cwd()}/`, ""),
    rawSha256,
    summarySha256,
    verdict: summary.verdict,
    nDesign: summary.nDesign,
    measurement: summary.measurement,
    cases: Object.fromEntries(Object.entries(cases).map(([key, value]) => [
      key,
      {
        runs: value.runs,
        b5: {
          entrantsN: value.b5.entrantsN,
          entrantRate: formatRate(value.b5.entrantsRate),
          death: formatRate(value.b5.death),
          breakthrough: formatRate(value.b5.breakthrough)
        },
        averageReachedFloor: formatMean(value.averageReachedFloor),
        a1: value.b5.a1.status,
        a2: value.b5.a2.status
      }
    ]))
  }, null, 2));
}

if (isMainThread && process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
