// sim-scope: run — Issue #510 B10 entrant A1/A3 migration measurement.
/* global console, process */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { performance } from "node:perf_hooks";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveSimParallelism, runSimTasks } from "./sim_parallel.js";

const BASIC_CLASSES = Object.freeze(["Fighter", "Thief", "Priest", "Mage"]);
const CLASS_LABELS = Object.freeze({
  Fighter: "戦士",
  Thief: "盗賊",
  Priest: "僧侶",
  Mage: "魔術師"
});
const OBSERVED_WORKSHOP_DISTRIBUTION = Object.freeze([
  { scenarioId: "workshop-empty", observedRuns: 30 },
  { scenarioId: "workshop-stats", observedRuns: 74 },
  { scenarioId: "workshop-gear", observedRuns: 69 },
  { scenarioId: "workshop-blood-wand", observedRuns: 216 },
  { scenarioId: "workshop-blood-wand-spells", observedRuns: 47 },
  { scenarioId: "workshop-complete", observedRuns: 764 }
]);
const OBSERVED_WORKSHOP_TOTAL = OBSERVED_WORKSHOP_DISTRIBUTION.reduce(
  (sum, row) => sum + row.observedRuns,
  0
);
const WORKSHOP_SCENARIO_IDS = Object.freeze(
  OBSERVED_WORKSHOP_DISTRIBUTION.map(row => row.scenarioId)
);
const DEFAULT_RUNS_PER_CLASS = 3000;
const DEFAULT_CALIBRATION_RUNS = 1000;
const B10 = 10;
const TARGET_DEPTH = 21;
const R95 = 1.959963984540054;
const Z80 = 0.8416212335729143;
const MONOTONIC_ALPHA = 0.05;
const ORDINAL_LEVELS = Object.freeze([0, 1, 2, 3]);
const SMOKE = process.env.ISSUE510_SMOKE === "1";
const OUTPUT_STEM = SMOKE
  ? "issue-510-b10-criteria-migration-smoke"
  : "issue-510-b10-criteria-migration";

const SIM_ENV_DEFAULTS = Object.freeze({
  SIM_PRESET: "",
  SIM_SEED: "461",
  SIM_RUNS: String(DEFAULT_RUNS_PER_CLASS),
  SIM_CALIBRATION_RUNS: String(DEFAULT_CALIBRATION_RUNS),
  DEPARTURE_CRAFT_IDS:
    "TOWN_PORTAL,HEAL_POTION,HEAL_POTION,HEAL_POTION,HEAL_POTION,ANTIDOTE,GUARD_POTION",
  TRAP_POLICY: "conservative",
  TRAP_AVOIDANCE_POLICY: "ev",
  TRAP_DAMAGE_MULTIPLIER: "1",
  TRAP_BONUS_OVERRIDE: "",
  TRAP_SENSE_OVERRIDE: "",
  IDENTIFICATION_POLICY: "powder",
  IDENTIFICATION_STARTING_POWDER: "2",
  IDENTIFICATION_COST_OVERRIDE: "1",
  STATUS_CURE_POLICY: "smart",
  STATUS_CURE_HP_THRESHOLD: "0.35",
  STATUS_CURE_MERCHANT_POLICY: "missing",
  HEAL_POTION_MERCHANT_POLICY: "missing",
  FLEE_POLICY: "ev",
  FLEE_HP_THRESHOLD: "0.20",
  HEAL_POTION_THRESHOLD: "0.55",
  PORTAL_HP_THRESHOLD: "0.35",
  PORTAL_MAX_HEAL_POTIONS: "0",
  PORTAL_MIN_FLOOR: "3",
  ELITE_POLICY: "avoid",
  BLOOD_WAND_HP_PAYMENT_MIN_RATE: "0.50",
  SIM_CORE_SCORE_DROP_TOLERANCE: "0",
  SIM_440_CONDITION: "current",
  SIM_SCENARIOS: WORKSHOP_SCENARIO_IDS.join(","),
  SIM_MAP_STATS: "0",
  SIM_DAMAGE_PROBE: "0",
  SIM_CORE_ENCOUNTER_CEILING: "",
  SIM_CORE_WORKSHOP_GATE: "",
  SIM_SUPPORT_SUPPLY_CEILING: "none",
  SIM_EQUIPMENT_SLOT_MODE: "standard",
  SIM_EQUIPMENT_SLOT_AFFIX_MODE: "retain",
  SIM_AFFIXLESS_DUPLICATE_COUNT: "2",
  SIM_AFFIXLESS_DUPLICATE_SLOT: "",
  SIM_EQUIPMENT_POLICY: "individual-score",
  SIM_MATCHING_DEFINITION: "exact",
  SIM_CURSE_LOCK_MODE: "current",
  SIM_CURSE_BASE_CHANCE_OVERRIDE: "",
  SIM_CURSE_CHANCE_PER_FLOOR_OVERRIDE: "",
  SIM_CURSE_MAX_CHANCE_OVERRIDE: "",
  SIM_CURSE_CORE_BONUS_OVERRIDE: "",
  SIM_CURSE_DETECT_BASE_OVERRIDE: "",
  SIM_CURSE_DETECT_DECAY_OVERRIDE: "",
  SIM_CURSE_DETECT_MIN_OVERRIDE: ""
});

if (process.env.SIM_PARALLEL !== undefined) {
  throw new Error("SIM_PARALLEL must be omitted for Issue #510 measurement");
}
if (process.env.SIM_MAP_CACHE_ENTRIES !== undefined) {
  throw new Error("SIM_MAP_CACHE_ENTRIES must be omitted for Issue #510 measurement");
}

const runtimeEnvDefaults = {
  ...SIM_ENV_DEFAULTS,
  ...(SMOKE ? { SIM_RUNS: "1", SIM_CALIBRATION_RUNS: "1" } : {})
};
for (const [key, value] of Object.entries(runtimeEnvDefaults)) {
  if (process.env[key] === undefined) {
    process.env[key] = value;
  } else if (process.env[key] !== value) {
    throw new Error("Issue #510 fixed env mismatch: " + key + "=" + process.env[key]);
  }
}

const {
  calibrateCoreScoringProfile,
  getScenarioById,
  MEASUREMENT_PROVENANCE,
  resetSimulationRandom,
  SIM_CLASSES,
  simulateRun
} = await import("./sim_depth_material_ev.js");

const RUNS_PER_CLASS = Number(process.env.SIM_RUNS);
const CALIBRATION_RUNS = Number(process.env.SIM_CALIBRATION_RUNS);
if (!Number.isInteger(RUNS_PER_CLASS) || RUNS_PER_CLASS < 1) {
  throw new Error("SIM_RUNS must be a positive integer: " + RUNS_PER_CLASS);
}
if (!Number.isInteger(CALIBRATION_RUNS) || CALIBRATION_RUNS < 1) {
  throw new Error(
    "SIM_CALIBRATION_RUNS must be a positive integer: " + CALIBRATION_RUNS
  );
}
if (!SMOKE && RUNS_PER_CLASS !== DEFAULT_RUNS_PER_CLASS) {
  throw new Error("SIM_RUNS must be " + DEFAULT_RUNS_PER_CLASS + " for the audit");
}
if (!SMOKE && CALIBRATION_RUNS !== DEFAULT_CALIBRATION_RUNS) {
  throw new Error(
    "SIM_CALIBRATION_RUNS must be " + DEFAULT_CALIBRATION_RUNS + " for the audit"
  );
}

const CLASS_NAMES = SMOKE
  ? BASIC_CLASSES.slice(0, 1)
  : BASIC_CLASSES.filter(className => SIM_CLASSES.includes(className));
const SCENARIO_IDS = SMOKE
  ? WORKSHOP_SCENARIO_IDS.slice(0, 1)
  : WORKSHOP_SCENARIO_IDS;
if (CLASS_NAMES.length !== (SMOKE ? 1 : BASIC_CLASSES.length)) {
  throw new Error("basic classes missing: " + BASIC_CLASSES.join(","));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hashSeed(text) {
  let seed = 2166136261;
  for (let index = 0; index < text.length; index++) {
    seed ^= text.charCodeAt(index);
    seed = Math.imul(seed, 16777619);
  }
  return seed >>> 0;
}

function environmentForHash() {
  const values = Object.fromEntries(
    Object.keys(SIM_ENV_DEFAULTS)
      .sort()
      .map(key => [key, process.env[key]])
  );
  values.CI = process.env.CI ?? "<unset>";
  values.SIM_PARALLEL = "<omitted>";
  values.SIM_MAP_CACHE_ENTRIES = "<omitted; default=1024>";
  values.ISSUE461_MODE = SMOKE ? "smoke" : "baseline";
  values.ISSUE461_CLASSES = CLASS_NAMES.join(",");
  values.ISSUE461_SCENARIOS = SCENARIO_IDS.join(",");
  values.ISSUE461_TARGET_DEPTH_INITIAL = "2";
  values.ISSUE461_TARGET_DEPTH_BASELINE = String(TARGET_DEPTH);
  values.ISSUE461_WORKSHOP_DISTRIBUTION = OBSERVED_WORKSHOP_DISTRIBUTION
    .map(row => row.scenarioId + ":" + row.observedRuns + "/" + OBSERVED_WORKSHOP_TOTAL)
    .join(",");
  return values;
}

const HASH_ENVIRONMENT = environmentForHash();
const ENV_CANONICAL = Object.entries(HASH_ENVIRONMENT)
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([key, value]) => key + "=" + value)
  .join("\n") + "\n";
const ENV_HASH = sha256(ENV_CANONICAL);
const EXPECTED_ENV_HASH =
  "6630774fbe1172084adde136272b09df77373427bc3d179fdd3587b9fad4f572";
if (!SMOKE && ENV_HASH !== EXPECTED_ENV_HASH) {
  throw new Error("Issue #461 fixed env hash mismatch: " + ENV_HASH);
}
const SEED = Number(process.env.SIM_SEED) >>> 0;

function mean(values) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

function wilson(successes, trials) {
  if (trials <= 0) {
    return {
      successes,
      trials,
      estimate: null,
      low: null,
      high: null,
      status: "未観測"
    };
  }
  const p = successes / trials;
  const denominator = 1 + R95 ** 2 / trials;
  const center = (p + R95 ** 2 / (2 * trials)) / denominator;
  const halfWidth = R95 * Math.sqrt(
    p * (1 - p) / trials + R95 ** 2 / (4 * trials ** 2)
  ) / denominator;
  return {
    successes,
    trials,
    estimate: p,
    low: Math.max(0, center - halfWidth),
    high: Math.min(1, center + halfWidth),
    status: trials < 30 ? "未確定（N<30）" : "確定"
  };
}

function normalMean(values) {
  if (!values.length) {
    return { estimate: null, low: null, high: null, n: 0, status: "未観測" };
  }
  const estimate = mean(values);
  if (values.length < 2) {
    return {
      estimate,
      low: null,
      high: null,
      n: values.length,
      status: "未確定（N<30）"
    };
  }
  const variance = values.reduce(
    (sum, value) => sum + (value - estimate) ** 2,
    0
  ) / (values.length - 1);
  const margin = R95 * Math.sqrt(variance / values.length);
  return {
    estimate,
    low: estimate - margin,
    high: estimate + margin,
    n: values.length,
    status: values.length < 30 ? "未確定（N<30）" : "確定"
  };
}

function normalDifference(left, right) {
  if (!left.length || !right.length) {
    return {
      estimate: null,
      low: null,
      high: null,
      leftN: left.length,
      rightN: right.length,
      status: "未観測"
    };
  }
  const leftMean = mean(left);
  const rightMean = mean(right);
  const leftVariance = left.length > 1
    ? left.reduce((sum, value) => sum + (value - leftMean) ** 2, 0) /
      (left.length - 1)
    : 0;
  const rightVariance = right.length > 1
    ? right.reduce((sum, value) => sum + (value - rightMean) ** 2, 0) /
      (right.length - 1)
    : 0;
  const estimate = leftMean - rightMean;
  const margin = R95 * Math.sqrt(
    leftVariance / left.length + rightVariance / right.length
  );
  return {
    estimate,
    low: estimate - margin,
    high: estimate + margin,
    leftN: left.length,
    rightN: right.length,
    status: Math.min(left.length, right.length) < 30
      ? "未確定（N<30）"
      : "確定"
  };
}

function normalCdf(value) {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const polynomial = (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t -
    0.284496736) * t + 0.254829592) * t);
  const erf = sign * (1 - polynomial * Math.exp(-x * x));
  return 0.5 * (1 + erf);
}

function endpoint(result, floor) {
  const entrant = result.reachedFloor >= floor;
  const outcome = !entrant
    ? null
    : result.reachedFloor > floor
      ? "breakthrough"
      : result.deathFloor === floor
        ? "death"
        : "retreat";
  return {
    entrant,
    outcome,
    breakthrough: outcome === "breakthrough",
    death: outcome === "death",
    retreat: outcome === "retreat"
  };
}

function compactBuildSnapshot(result, floor) {
  const snapshots = result.buildSnapshots || result.diagnostics?.buildSnapshots || [];
  const snapshot = snapshots.find(
    row => row.floor === floor && row.point === "floor-start"
  ) || (result.diagnostics?.finalBuild?.floor === floor
    ? result.diagnostics.finalBuild
    : null);
  if (!snapshot) return null;
  return {
    floor: snapshot.floor,
    point: snapshot.point,
    combatBuildScore: snapshot.combatBuildScore,
    equipmentStatScore: snapshot.equipmentStatScore,
    combatCoreScore: snapshot.combatCoreScore,
    combatCoreScoreAll: snapshot.combatCoreScoreAll,
    combatCoreScoreById: { ...(snapshot.combatCoreScoreById || {}) },
    coreIds: [...(snapshot.coreIds || [])],
    combatCoreIds: [...(snapshot.combatCoreIds || [])]
  };
}

function scenarioForRun(runIndex) {
  const position = ((runIndex * 37) % RUNS_PER_CLASS + 0.5) /
    RUNS_PER_CLASS * OBSERVED_WORKSHOP_TOTAL;
  let cumulative = 0;
  for (const row of OBSERVED_WORKSHOP_DISTRIBUTION) {
    cumulative += row.observedRuns;
    if (position < cumulative) return row.scenarioId;
  }
  return OBSERVED_WORKSHOP_DISTRIBUTION.at(-1).scenarioId;
}

function profileKey(scenarioId) {
  return scenarioId;
}

export function runIssue510Task(task, context) {
  const runSeed = hashSeed(
    SEED + ":baseline:" + task.scenarioId + ":" + task.className + ":" + task.runIndex
  );
  const scenario = getScenarioById(task.scenarioId);
  const simulationArgs = {
    className: task.className,
    startFloor: 1,
    targetDepth: TARGET_DEPTH,
    runIndex: task.runIndex,
    seriesId: "issue461-baseline",
    scoringProfile: context.scoringProfiles[profileKey(task.scenarioId)],
    scenario,
    workshop: scenario.workshop
  };
  resetSimulationRandom(runSeed);
  const result = simulateRun({
    ...simulationArgs,
    collectBuildSnapshots: true
  });
  let b10Build = compactBuildSnapshot(result, B10);
  if (!b10Build && result.reachedFloor >= B10) {
    resetSimulationRandom(runSeed);
    const diagnosticResult = simulateRun({
      ...simulationArgs,
      collectDiagnostics: true
    });
    b10Build = compactBuildSnapshot(diagnosticResult, B10);
  }
  const statusCureItemsUsed = { ...(result.statusCureItemsUsed || {}) };
  return {
    className: task.className,
    runIndex: task.runIndex,
    scenarioId: task.scenarioId,
    survived: Boolean(result.survived),
    died: Boolean(result.died),
    outcome: result.outcome,
    reachedFloor: result.reachedFloor,
    deathFloor: result.deathFloor,
    endpoints: {
      b5: endpoint(result, 5),
      b10: endpoint(result, B10)
    },
    b10Build,
    finalCoreIds: [...(result.finalCoreIds || [])],
    mechanisms: {
      trapEncounters: result.trapEncounterCount || 0,
      trapActivations: result.trapActivations || 0,
      trapDisarms: result.trapDisarms || 0,
      trapDamageHp: result.trapDamageHp || 0,
      townPortalsUsed: result.townPortalsUsed || 0,
      healPotionsUsed: result.healPotionsUsed || 0,
      statusCureItemsUsed,
      statusesCured: Object.values(result.statusesCured || {})
        .reduce((sum, value) => sum + Number(value || 0), 0),
      identificationCount: result.identificationCount || 0,
      identificationPowderUsed: result.identificationPowderUsed || 0
    }
  };
}

function createTasks() {
  return CLASS_NAMES.flatMap(className =>
    Array.from({ length: RUNS_PER_CLASS }, (_, runIndex) => ({
      className,
      runIndex,
      scenarioId: scenarioForRun(runIndex)
    }))
  );
}

function createCalibrationSpecs() {
  return SCENARIO_IDS.map(scenarioId => ({ scenarioId }));
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
      left.b10Build.combatBuildScore - right.b10Build.combatBuildScore ||
      left.runIndex - right.runIndex
    );
    sorted.forEach((row, index) => {
      quartiles.set(
        row.className + ":" + row.runIndex,
        Math.floor(index * 4 / sorted.length) + 1
      );
    });
  });
  return rows.map(row => ({
    ...row,
    qualityQuartile: quartiles.get(row.className + ":" + row.runIndex)
  }));
}

function classCenteredDifference(rows, leftPredicate, rightPredicate, outcome) {
  const leftValues = [];
  const rightValues = [];
  const classCounts = {};
  const byClass = new Map();
  rows.forEach(row => {
    if (!byClass.has(row.className)) byClass.set(row.className, []);
    byClass.get(row.className).push(row);
  });
  byClass.forEach((classRows, className) => {
    const classMean = mean(classRows.map(row => Number(outcome(row))));
    const leftRows = classRows.filter(leftPredicate);
    const rightRows = classRows.filter(rightPredicate);
    classCounts[className] = {
      left: leftRows.length,
      right: rightRows.length,
      allQuartiles: [1, 2, 3, 4].map(quartile =>
        classRows.filter(row => row.qualityQuartile === quartile).length
      )
    };
    leftValues.push(...leftRows.map(row => Number(outcome(row)) - classMean));
    rightValues.push(...rightRows.map(row => Number(outcome(row)) - classMean));
  });
  return {
    ...normalDifference(leftValues, rightValues),
    classCounts,
    classCentered: Object.values(classCounts).every(
      counts => counts.left >= 30 && counts.right >= 30
    ),
    allQuartilesAtLeast30: Object.values(classCounts).every(counts =>
      counts.allQuartiles.every(n => n >= 30)
    )
  };
}

function quartileStats(rows) {
  return [1, 2, 3, 4].map(quartile => {
    const group = rows.filter(row => row.qualityQuartile === quartile);
    const deaths = group.filter(row => row.endpoints.b10.death).length;
    return {
      quartile,
      n: group.length,
      scoreMean: mean(group.map(row => row.b10Build.combatBuildScore)),
      b10Death: wilson(deaths, group.length),
      b10Breakthrough: wilson(
        group.filter(row => row.endpoints.b10.breakthrough).length,
        group.length
      )
    };
  });
}

function classStratifiedCochranArmitage(rows, outcomeSelector) {
  const byClass = new Map();
  rows.forEach(row => {
    if (!byClass.has(row.className)) byClass.set(row.className, []);
    byClass.get(row.className).push(row);
  });
  let numerator = 0;
  let variance = 0;
  let minCellN = Infinity;
  byClass.forEach(classRows => {
    const n = classRows.length;
    const successes = classRows.filter(outcomeSelector).length;
    const nullRate = successes / n;
    const groups = [1, 2, 3, 4].map(quartile =>
      classRows.filter(row => row.qualityQuartile === quartile)
    );
    const counts = groups.map(group => group.length);
    const successCounts = groups.map(group => group.filter(outcomeSelector).length);
    minCellN = Math.min(minCellN, ...counts);
    const scoreMean = counts.reduce(
      (sum, count, index) => sum + count * index,
      0
    ) / n;
    const scoreVariance = counts.reduce(
      (sum, count, index) => sum + count * (index - scoreMean) ** 2,
      0
    );
    numerator += successCounts.reduce(
      (sum, successCount, index) =>
        sum + index * (successCount - counts[index] * nullRate),
      0
    );
    variance += nullRate * (1 - nullRate) * scoreVariance;
  });
  if (variance === 0 || !Number.isFinite(variance)) {
    return {
      test: "class-stratified Cochran-Armitage",
      z: null,
      pValueDecreasing: null,
      pValueIncreasing: null,
      minCellN,
      status: "未確定（分散0）"
    };
  }
  const z = numerator / Math.sqrt(variance);
  return {
    test: "class-stratified Cochran-Armitage",
    z,
    pValueDecreasing: normalCdf(z),
    pValueIncreasing: 1 - normalCdf(z),
    minCellN,
    status: minCellN < 30 ? "未確定（N<30）" : "確定"
  };
}

function calculateA1(rows) {
  const quartiles = quartileStats(rows);
  const q4MinusQ1Death = classCenteredDifference(
    rows,
    row => row.qualityQuartile === 4,
    row => row.qualityQuartile === 1,
    row => row.endpoints.b10.death
  );
  const adjacentDifferences = [1, 2, 3].map(quartile => ({
    fromQuartile: quartile,
    toQuartile: quartile + 1,
    ...classCenteredDifference(
      rows,
      row => row.qualityQuartile === quartile + 1,
      row => row.qualityQuartile === quartile,
      row => row.endpoints.b10.death
    )
  }));
  const trendTest = classStratifiedCochranArmitage(
    rows,
    row => row.endpoints.b10.death
  );
  const statisticallyNonMonotonic = adjacentDifferences.some(
    difference => difference.status === "確定" && difference.low > 0
  );
  const monotonicNonIncreasing = trendTest.status === "確定" &&
    trendTest.pValueDecreasing < MONOTONIC_ALPHA &&
    !statisticallyNonMonotonic;
  const conditions = {
    q4MinusQ1UpperBelowZero: q4MinusQ1Death.high < 0 &&
      q4MinusQ1Death.allQuartilesAtLeast30,
    monotonicNonIncreasing,
    q4PointAtOrBelowGate: quartiles[3]?.b10Death.estimate <= 0.309,
    classCentered: q4MinusQ1Death.classCentered
  };
  return {
    endpoint: "deathFloor===10",
    quartiles,
    q4MinusQ1Death,
    adjacentDifferences,
    trendTest,
    statisticallyNonMonotonic,
    conditions,
    pass: q4MinusQ1Death.allQuartilesAtLeast30 &&
      Object.values(conditions).every(Boolean)
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
    const valueMean = mean(classRows.map(row => row.value));
    const outcomeMean = mean(classRows.map(row => row.outcome));
    classRows.forEach(row => {
      pairs.push({
        value: row.value - valueMean,
        outcome: row.outcome - outcomeMean
      });
    });
  });
  const valueSquare = pairs.reduce((sum, pair) => sum + pair.value ** 2, 0);
  const degreesOfFreedom = pairs.length - byClass.size - 1;
  if (pairs.length < 4 || valueSquare === 0 || degreesOfFreedom <= 0) {
    return {
      estimate: null,
      low: null,
      high: null,
      n: pairs.length,
      degreesOfFreedom,
      status: "未観測"
    };
  }
  const cross = pairs.reduce(
    (sum, pair) => sum + pair.value * pair.outcome,
    0
  );
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
    degreesOfFreedom,
    status: pairs.length < 30 ? "未確定（N<30）" : "確定"
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
    breakthrough: classCenteredOrdinalEffect(
      rows,
      valueSelector,
      row => row.endpoints.b10.breakthrough
    ),
    death: classCenteredOrdinalEffect(
      rows,
      valueSelector,
      row => row.endpoints.b10.death
    ),
    reachedFloor: classCenteredOrdinalEffect(
      rows,
      valueSelector,
      row => row.reachedFloor
    )
  };
  const nUnder30 = Object.fromEntries(
    Object.entries(levelCounts).filter(([, count]) => count < 30)
  );
  const dataSufficient = values.length >= 194 &&
    levelCounts["1"] >= 30 && levelCounts["2"] >= 30;
  const expectedDirections = {
    breakthrough: "positive",
    death: "negative",
    reachedFloor: "positive"
  };
  const endpointPass = Object.fromEntries(
    Object.entries(endpoints).map(([key, effect]) => {
      const direction = expectedDirections[key];
      return [key, direction === "positive"
        ? effect.low > 0
        : effect.high < 0];
    })
  );
  return {
    axis: "combatCoreCount",
    levels: ["0", "1", "2", "3+"],
    n: values.length,
    levelCounts,
    nUnder30,
    endpoints,
    endpointPass,
    expectedDirections,
    dataSufficient,
    status: !dataSufficient
      ? "未確定（総N<194または中心level 1/2がN<30）"
      : Object.values(endpointPass).every(Boolean)
        ? "成立"
        : "不成立",
    pass: dataSufficient && Object.values(endpointPass).every(Boolean)
  };
}

function calculateA3(rows) {
  const combatCoreCount = row => Math.min(3, row.b10Build.combatCoreIds.length);
  const allCoreCount = row => Math.min(3, row.b10Build.coreIds.length);
  return {
    acceptanceAxis: "combatCoreCount",
    combatCoreCount: ordinalFeatureEffect(rows, combatCoreCount),
    allCoreCount: ordinalFeatureEffect(rows, allCoreCount)
  };
}

function qualitySummary(rows) {
  const entrants = rows.filter(row => row.b10Build);
  if (!entrants.length) {
    return {
      entrants: 0,
      q4AllRuns: wilson(0, rows.length),
      q4AmongB10Entrants: wilson(0, 0),
      a1: null,
      rows: []
    };
  }
  const quartileRows = assignQuartiles(entrants);
  const q4Count = quartileRows.filter(row => row.qualityQuartile === 4).length;
  return {
    entrants: entrants.length,
    q4AllRuns: wilson(q4Count, rows.length),
    q4AmongB10Entrants: wilson(q4Count, entrants.length),
    a1: calculateA1(quartileRows),
    rows: quartileRows
  };
}

function endpointSummary(rows, floor) {
  const entrantRows = rows.filter(row => row.endpoints["b" + floor].entrant);
  const outcomeKeys = ["breakthrough", "death", "retreat"];
  const counts = Object.fromEntries(
    outcomeKeys.map(key => [
      key,
      entrantRows.filter(row => row.endpoints["b" + floor][key]).length
    ])
  );
  if (Object.values(counts).reduce((sum, value) => sum + value, 0) !== entrantRows.length) {
    throw new Error("B" + floor + " endpoint partition failed");
  }
  return {
    entrant: wilson(entrantRows.length, rows.length),
    entrantN: entrantRows.length,
    breakthrough: wilson(counts.breakthrough, entrantRows.length),
    death: wilson(counts.death, entrantRows.length),
    retreat: wilson(counts.retreat, entrantRows.length),
    counts
  };
}

function distribution(rows, selector) {
  const counts = { "0": 0, "1": 0, "2": 0, "3+": 0 };
  rows.forEach(row => {
    const level = Math.min(3, Math.max(0, Number(selector(row))));
    counts[level === 3 ? "3+" : String(level)]++;
  });
  return {
    n: rows.length,
    counts,
    rates: Object.fromEntries(
      Object.entries(counts).map(([key, count]) => [key, wilson(count, rows.length)])
    ),
    nUnder30: Object.fromEntries(
      Object.entries(counts).filter(([, count]) => count < 30)
    )
  };
}

function classSummary(className, rows, qualityRows) {
  const classQuality = qualityRows.filter(row => row.className === className);
  const b10Entrants = rows.filter(row => row.endpoints.b10.entrant);
  const combat = row => Math.min(3, row.b10Build.combatCoreIds.length);
  return {
    className,
    runs: rows.length,
    b10: endpointSummary(rows, B10),
    averageReachedFloor: normalMean(rows.map(row => row.reachedFloor)),
    averageReachedFloorAmongB10Entrants: normalMean(
      b10Entrants.map(row => row.reachedFloor)
    ),
    b10EntrantBuildN: classQuality.length,
    quartileCellCounts: Object.fromEntries(
      [1, 2, 3, 4].map(quartile => [
        "Q" + quartile,
        classQuality.filter(row => row.qualityQuartile === quartile).length
      ])
    ),
    combatCoreDistribution: distribution(classQuality, combat),
    b10QualityDeath: classQuality.length
      ? wilson(
          classQuality.filter(row => row.endpoints.b10.death).length,
          classQuality.length
        )
      : wilson(0, 0)
  };
}

function twoProportionRequiredN(leftRate, rightRate) {
  if (!Number.isFinite(leftRate) || !Number.isFinite(rightRate)) return null;
  const difference = Math.abs(leftRate - rightRate);
  if (difference === 0) return null;
  const pooled = (leftRate + rightRate) / 2;
  const numerator = R95 * Math.sqrt(2 * pooled * (1 - pooled)) +
    Z80 * Math.sqrt(
      leftRate * (1 - leftRate) + rightRate * (1 - rightRate)
    );
  return Math.ceil((numerator / difference) ** 2);
}

function rateOrNull(stat) {
  return stat && Number.isFinite(stat.estimate) ? stat.estimate : null;
}

function buildNDesign(overall, a1, a3, byClass) {
  const b5A1PerGroup = 232;
  const b5A3PerGroup = 1622;
  const b5EntrantRate = 0.1295;
  const b5CoreComposition = 0.455;
  const b10Q1 = rateOrNull(a1?.quartiles?.[0]?.b10Death);
  const b10Q4 = rateOrNull(a1?.quartiles?.[3]?.b10Death);
  const b10A1PerGroup = twoProportionRequiredN(b10Q1, b10Q4);
  const b10EntrantRate = rateOrNull(overall.b10.entrant);
  const combatA3 = a3.combatCoreCount;
  const b10A3Slope = rateOrNull(combatA3.endpoints.death);
  const b10DeathRate = rateOrNull(overall.b10.death);
  const b10A3Low = b10DeathRate === null || b10A3Slope === null
    ? null
    : Math.min(0.999999, b10DeathRate + Math.abs(b10A3Slope) / 2);
  const b10A3High = b10DeathRate === null || b10A3Slope === null
    ? null
    : Math.max(0.000001, b10DeathRate - Math.abs(b10A3Slope) / 2);
  const b10A3PerGroup = twoProportionRequiredN(b10A3Low, b10A3High);
  const b10CoreN = combatA3.n;
  const b10CoreComposition = b10CoreN
    ? (combatA3.levelCounts["0"] + combatA3.levelCounts["2"] + combatA3.levelCounts["3+"]) /
      b10CoreN
    : null;
  const makeTarget = (perGroup, groups, composition) => {
    const entrantTotal = perGroup === null || composition <= 0
      ? null
      : Math.ceil(perGroup * groups / composition);
    return {
      perGroup,
      groups,
      composition,
      entrantTotal,
      pooledRunCount: entrantTotal === null || b10EntrantRate === null
        ? null
        : Math.ceil(entrantTotal / b10EntrantRate),
      pooledRunCountEqualClassMix: entrantTotal === null || b10EntrantRate === null
        ? null
        : Math.ceil(Math.ceil(entrantTotal / b10EntrantRate) / BASIC_CLASSES.length) *
          BASIC_CLASSES.length
    };
  };
  const a1Target = makeTarget(b10A1PerGroup, 4, 1);
  const a3Target = makeTarget(b10A3PerGroup, 2, b10CoreComposition);
  const referenceA1 = makeTarget(b5A1PerGroup, 4, 1);
  const referenceA3 = makeTarget(b5A3PerGroup, 2, b5CoreComposition);
  const classRates = Object.fromEntries(byClass.map(summary => [
    summary.className,
    rateOrNull(summary.b10.entrant)
  ]));
  const classRunCounts = target => Object.fromEntries(
    byClass.map(summary => [
      summary.className,
      target.entrantTotal === null || classRates[summary.className] === null
        ? null
        : Math.ceil(target.entrantTotal / classRates[summary.className])
    ])
  );
  const n30QuartileEntrantsPerClass = 4 * 30;
  const n30QuartileRunCounts = Object.fromEntries(
    byClass.map(summary => [
      summary.className,
      classRates[summary.className] === null
        ? null
        : Math.ceil(n30QuartileEntrantsPerClass / classRates[summary.className])
    ])
  );
  const finiteN30RunCounts = Object.values(n30QuartileRunCounts)
    .filter(count => Number.isFinite(count));
  return {
    assumptions: {
      power: 0.80,
      alpha: 0.05,
      twoSided: true,
      method: "two-proportion normal approximation; optimistic lower bound",
      a1: "Q1/Q4 raw B10 rates for sizing; A1 verdict remains class-centered",
      a3: "death slope converted to two groups around observed B10 entrant death rate",
      denominator: "B10 entrant; feature-group rate is never used to divide run count"
    },
    referenceB5: {
      a1: {
        q1Rate: 0.124,
        q4Rate: 0.051,
        diff: -0.073,
        perGroup: b5A1PerGroup,
        target: referenceA1,
        runCountUsingCombinedEntrantRate: b5A1PerGroup === null
          ? null
          : Math.ceil((b5A1PerGroup * 4) / b5EntrantRate)
      },
      a3: {
        centerRate: 0.082,
        deathDiff: -0.027,
        groupRates: [0.095, 0.068],
        perGroup: b5A3PerGroup,
        target: referenceA3,
        runCountUsingCombinedEntrantRate: referenceA3.entrantTotal === null
          ? null
          : Math.ceil(referenceA3.entrantTotal / b5EntrantRate)
      }
    },
    observedB10: {
      a1: {
        q1Rate: b10Q1,
        q4Rate: b10Q4,
        diff: a1?.q4MinusQ1Death?.estimate ?? null,
        perGroup: b10A1PerGroup,
        target: a1Target,
        classRunCounts: classRunCounts(a1Target)
      },
      a3: {
        deathSlope: b10A3Slope,
        centerRate: b10DeathRate,
        groupRates: [b10A3Low, b10A3High],
        levelComposition0And2Plus: b10CoreComposition,
        perGroup: b10A3PerGroup,
        target: a3Target,
        classRunCounts: classRunCounts(a3Target)
      }
    },
    n30QuartileGate: {
      entrantsPerClass: n30QuartileEntrantsPerClass,
      runCountsByClass: n30QuartileRunCounts,
      equalClassMixRunCount: finiteN30RunCounts.length
        ? Math.max(...finiteN30RunCounts) * BASIC_CLASSES.length
        : null
    },
    effectComparison: {
      a1AbsoluteShrink: b10A1PerGroup !== null && b5A1PerGroup !== null
        ? Math.abs(a1?.q4MinusQ1Death?.estimate ?? 0) < 0.073
        : null,
      a3AbsoluteShrink: b10A3Slope !== null
        ? Math.abs(b10A3Slope) < 0.027
        : null
    }
  };
}

function aggregateMechanisms(rows) {
  const statusCureItemsUsed = {};
  const totals = rows.reduce((sum, row) => {
    sum.trapEncounters += row.mechanisms.trapEncounters;
    sum.trapActivations += row.mechanisms.trapActivations;
    sum.trapDisarms += row.mechanisms.trapDisarms;
    sum.trapDamageHp += row.mechanisms.trapDamageHp;
    sum.townPortalsUsed += row.mechanisms.townPortalsUsed;
    sum.healPotionsUsed += row.mechanisms.healPotionsUsed;
    sum.statusesCured += row.mechanisms.statusesCured;
    sum.identificationCount += row.mechanisms.identificationCount;
    sum.identificationPowderUsed += row.mechanisms.identificationPowderUsed;
    Object.entries(row.mechanisms.statusCureItemsUsed).forEach(([itemId, count]) => {
      statusCureItemsUsed[itemId] = (statusCureItemsUsed[itemId] || 0) + count;
    });
    return sum;
  }, {
    trapEncounters: 0,
    trapActivations: 0,
    trapDisarms: 0,
    trapDamageHp: 0,
    townPortalsUsed: 0,
    healPotionsUsed: 0,
    statusesCured: 0,
    identificationCount: 0,
    identificationPowderUsed: 0
  });
  return {
    ...totals,
    statusCureItemsUsed,
    warnings: [
      ["trap", totals.trapEncounters],
      ["TOWN_PORTAL", totals.townPortalsUsed],
      ["status-cure", totals.statusesCured],
      ["identification", totals.identificationCount]
    ].filter(([, count]) => count === 0).map(([label]) => label)
  };
}

function formatPercent(value, digits = 1) {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "NA"
    : (value * 100).toFixed(digits) + "%";
}

function formatRate(stat) {
  if (!stat || stat.estimate === null) return "NA [N=" + (stat?.trials ?? 0) + "]";
  const status = stat.status.startsWith("未確定") ? " 未確定" : "";
  return formatPercent(stat.estimate) + " [" +
    formatPercent(stat.low) + ", " + formatPercent(stat.high) +
    "; N=" + stat.trials + "]" + status;
}

function formatMean(stat, digits = 2) {
  if (!stat || stat.estimate === null) return "NA";
  if (stat.low === null) {
    return stat.estimate.toFixed(digits) + " [未確定; N=" + stat.n + "]";
  }
  return stat.estimate.toFixed(digits) + " [" +
    stat.low.toFixed(digits) + ", " + stat.high.toFixed(digits) +
    "; N=" + stat.n + "]";
}

function formatDifference(stat, digits = 1) {
  if (!stat || stat.estimate === null || !Number.isFinite(stat.estimate)) return "NA";
  const point = (stat.estimate * 100).toFixed(digits) + "pt";
  if (stat.low === null || stat.high === null) return point;
  return point + " [" + (stat.low * 100).toFixed(digits) + ", " +
    (stat.high * 100).toFixed(digits) + "]";
}

function formatEffect(stat, digits = 3) {
  if (!stat || stat.estimate === null || !Number.isFinite(stat.estimate)) return "NA";
  if (stat.low === null || stat.high === null) return stat.estimate.toFixed(digits);
  return stat.estimate.toFixed(digits) + " [" +
    stat.low.toFixed(digits) + ", " + stat.high.toFixed(digits) + "]";
}

function formatNumber(value, digits = 0) {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "NA"
    : Number(value).toFixed(digits);
}

function formatPValue(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "NA";
  return value < 0.0001 ? "<0.0001" : value.toFixed(4);
}

function formatCounts(counts) {
  return ["0", "1", "2", "3+"]
    .map(level => level + ":" + (counts[level] ?? 0))
    .join(" / ");
}

function renderEndpoint(label, endpointValue) {
  return [
    "- " + label + " entrant: " + formatRate(endpointValue.entrant),
    "  - 突破: " + formatRate(endpointValue.breakthrough),
    "  - 死亡（deathFloor===10）: " + formatRate(endpointValue.death),
    "  - 撤退: " + formatRate(endpointValue.retreat)
  ].join("\n");
}

function renderA1(a1) {
  if (!a1) return "未観測";
  const lines = [
    "| Q | N | combatBuildScore平均 | B10死亡率（Wilson 95% CI） |",
    "| ---: | ---: | ---: | --- |"
  ];
  a1.quartiles.forEach(quartile => {
    lines.push(
      "| Q" + quartile.quartile + " | " + quartile.n + " | " +
      formatNumber(quartile.scoreMean, 2) + " | " +
      formatRate(quartile.b10Death) + " |"
    );
  });
  lines.push(
    "",
    "- Q4−Q1 B10死亡率差（職内centered、正規近似95% CI）: " +
      formatDifference(a1.q4MinusQ1Death),
    "- trend: z=" + formatNumber(a1.trendTest.z, 3) +
      "、減少方向 p=" + formatPValue(a1.trendTest.pValueDecreasing) +
      "、min cell N=" + a1.trendTest.minCellN,
    "- A1条件: Q4−Q1上限<0=" +
      (a1.conditions.q4MinusQ1UpperBelowZero ? "成立" : "不成立") +
      " / 単調減少=" +
      (a1.conditions.monotonicNonIncreasing ? "成立" : "不成立") +
      " / Q4≤30.9%=" +
      (a1.conditions.q4PointAtOrBelowGate ? "成立" : "不成立") +
      " / 全職cell N≥30=" +
      (a1.conditions.classCentered && a1.q4MinusQ1Death.allQuartilesAtLeast30
        ? "成立"
        : "不成立"),
    "- A1判定: **" + (a1.pass ? "成立" : "不成立または未確定") + "**"
  );
  return lines.join("\n");
}

function renderA3(a3) {
  const renderAxis = (label, axis) => [
    "### " + label,
    "",
    "- N=" + axis.n + "、level 0/1/2/3+ = " + formatCounts(axis.levelCounts),
    "- N<30セル: " +
      (Object.keys(axis.nUnder30).length ? formatCounts(axis.nUnder30) : "なし"),
    "- 突破差（core level slope）: " +
      formatDifference(axis.endpoints.breakthrough),
    "- 死亡差（core level slope）: " +
      formatDifference(axis.endpoints.death),
    "- 終了到達floor差（core level slope）: " +
      formatEffect(axis.endpoints.reachedFloor, 3),
    "- 方向判定: 突破=" +
      (axis.endpointPass.breakthrough ? "成立" : "不成立") +
      " / 死亡=" + (axis.endpointPass.death ? "成立" : "不成立") +
      " / floor=" + (axis.endpointPass.reachedFloor ? "成立" : "不成立"),
    "- A3判定: **" + axis.status + "**"
  ];
  return [
    ...renderAxis("combat core個数軸（判定軸）", a3.combatCoreCount),
    "",
    ...renderAxis("全core個数軸（参考）", a3.allCoreCount)
  ].join("\n");
}

function renderNDesign(nDesign, measurement) {
  const refA1 = nDesign.referenceB5.a1;
  const refA3 = nDesign.referenceB5.a3;
  const obsA1 = nDesign.observedB10.a1;
  const obsA3 = nDesign.observedB10.a3;
  const n30Gate = nDesign.n30QuartileGate;
  const targetLines = (label, target) => [
    "- " + label + ": 群あたりN=" + (target.perGroup ?? "NA") +
      "、必要entrant総数=" + (target.entrantTotal ?? "NA") +
      "、run=" + (target.pooledRunCount ?? "NA") +
      "（4職均等runへ丸めると" +
      (target.pooledRunCountEqualClassMix ?? "NA") + "）"
  ];
  const classRunLines = (label, counts) => [
    "- " + label + "を各職単独で満たすrun数: " +
      Object.entries(counts)
        .map(([className, count]) => CLASS_LABELS[className] + "=" + (count ?? "NA"))
        .join(" / ")
  ];
  const perRun = measurement.simulationWallSeconds / measurement.rawRows;
  const estimateWall = target => target.pooledRunCount === null
    ? "NA"
    : formatNumber(target.pooledRunCount * perRun, 1) +
      "s simulation + calibration実測" +
      formatNumber(measurement.calibrationWallSeconds, 1) + "s";
  return [
    "## N設計比較",
    "",
    "80% power、α=.05、両側、2比例正規近似。A1はB10 Q1/Q4率、A3死亡は観測core level slopeを2群差へ近似。すべてB10 entrant分母。選別効果を含むため、実測N設計は正式判定前の監査下限。",
    "",
    "- B5理論A1: " + refA1.perGroup + " / 群、entrant総数" +
      refA1.target.entrantTotal + "、4職合算run約" +
      refA1.runCountUsingCombinedEntrantRate +
      "（提示値≈928 / ≈7,166と同水準）",
    "- B5理論A3: " + refA3.perGroup + " / 群、entrant総数" +
      refA3.target.entrantTotal + "、4職合算run約" +
      refA3.runCountUsingCombinedEntrantRate +
      "（提示値≈1,622 / ≈7,130 / ≈55,058と同じ近似）",
    "- B10 A1実測効果: Q4−Q1=" +
      formatDifference({ estimate: obsA1.diff, low: null, high: null }) +
      "、絶対効果縮小=" +
      (nDesign.effectComparison.a1AbsoluteShrink === null
        ? "判定不能"
        : nDesign.effectComparison.a1AbsoluteShrink ? "はい" : "いいえ"),
    ...targetLines("B10 A1再計算", obsA1.target),
    "  - 推定wall-clock: " + estimateWall(obsA1.target),
    ...classRunLines("B10 A1必要entrant総数", obsA1.classRunCounts),
    "- B10 A3死亡 slope=" +
      formatDifference({ estimate: obsA3.deathSlope, low: null, high: null }) +
      "、0/2+近似構成=" + formatPercent(obsA3.levelComposition0And2Plus) +
      "、絶対効果縮小=" +
      (nDesign.effectComparison.a3AbsoluteShrink === null
        ? "判定不能"
        : nDesign.effectComparison.a3AbsoluteShrink ? "はい" : "いいえ"),
    ...targetLines("B10 A3再計算", obsA3.target),
    "  - 推定wall-clock: " + estimateWall(obsA3.target),
    ...classRunLines("B10 A3必要entrant総数", obsA3.classRunCounts),
    "",
    "- A1のN≥30ゲートだけなら、各職120 entrant（4 quartile×30）が必要。各職run: " +
      Object.entries(n30Gate.runCountsByClass)
        .map(([className, count]) => CLASS_LABELS[className] + "=" + (count ?? "NA"))
        .join(" / ") +
      "、4職均等runなら約" + (n30Gate.equalClassMixRunCount ?? "NA"),
    "A3の必要entrant総数はClaude設計と同じく「0個 vs 2個以上」の合算構成比を使う楽観的下限。0個/2個以上の群サイズ不均衡、職内quartileセル、4職層化を追加要求すると増える。"
  ].join("\n");
}

function decide(overall, byClass) {
  const lowStrata = byClass.filter(summary =>
    Object.values(summary.quartileCellCounts).some(count => count < 30)
  );
  const thiefPriest = byClass.filter(summary =>
    ["Thief", "Priest"].includes(summary.className)
  );
  const thiefPriestEntrants = thiefPriest.reduce(
    (sum, summary) => sum + summary.b10.entrantN,
    0
  );
  const overallEntrants = overall.b10.entrantN;
  const thiefPriestShare = overallEntrants
    ? thiefPriestEntrants / overallEntrants
    : 0;
  if (!lowStrata.length && overall.quality.a1?.pass &&
      overall.a3.combatCoreCount.pass) {
    return {
      label: "B10へ全面移行",
      reason: "4職quartile cellとA1/A3判定が成立"
    };
  }
  const reasons = [];
  if (lowStrata.length) {
    reasons.push(
      "職内quartileにN<30セル（" +
      lowStrata.map(row => CLASS_LABELS[row.className]).join("・") + "）"
    );
  }
  if (!overall.quality.a1?.pass) reasons.push("A1のCI/単調減少条件が未成立");
  if (!overall.a3.combatCoreCount.pass) {
    reasons.push("A3は3 endpoint全てのCI条件が未成立");
  }
  if (thiefPriestShare >= 0.8) {
    reasons.push(
      "盗賊・僧侶がB10 entrantの" + formatPercent(thiefPriestShare) +
      "だが、限定測定は#461と別estimandの追加監査に留める"
    );
  }
  return {
    label: "B5代理を残す",
    reason: reasons.join("。")
  };
}

function renderMarkdown(summary) {
  const measurement = summary.measurement;
  const overall = summary.overall;
  const byClass = summary.byClass;
  const nDesign = summary.nDesign;
  const decision = summary.decision;
  const BT = String.fromCharCode(96);
  const FENCE = BT.repeat(3);
  const thiefPriestRows = byClass.filter(row =>
    ["Thief", "Priest"].includes(row.className)
  );
  const thiefPriestN = thiefPriestRows.reduce(
    (sum, row) => sum + row.b10.entrantN,
    0
  );
  const lines = [
    "# Issue #510 B10受入基準移行測定",
    "",
    "## 判定: " + decision.label,
    "",
    decision.reason,
    "",
    "B10 entrantは既にB10到達できたrunだけの選別集団。全runのビルド質分布と異なるため、B10内の相関・core個数差は因果効果ではなく、" +
      BT + "deathFloor === floor" + BT +
      "のトートロジーと同種の選別罠を含む。",
    "",
    "## 測定対象",
    "",
    "- seed=" + measurement.seed + "、4職×各N=" + measurement.runsPerClass +
      "、calibration N=" + measurement.calibrationRuns +
      "、6工房状態。B10 entrant分母固定。",
    "- " + BT + "combatBuildScore" + BT +
      "はB10 floor-startの職内Q1〜Q4。A1死亡endpointは" +
      BT + "deathFloor===10" + BT + "。",
    "- B10 build観測点: floor-start=" + overall.b10BuildPointCounts["floor-start"] +
      "、finish fallback=" + overall.b10BuildPointCounts.finish +
      "（floor 9→10直後にportal終了しfloor-start snapshotが無い14件を診断再実行で補完）。",
    "- A3はB10 floor-startのcombat core個数0/1/2/3+。突破/死亡はB10 entrant内、終了到達floorは同じB10 entrant内の" +
      BT + "reachedFloor" + BT + "。",
    "- " + BT + "generateRunFloor" + BT +
      "を経由する" + BT + "simulateRun" + BT +
      "、" + BT + "TOWN_PORTAL" + BT +
      "、状態異常治療、鑑定粉、現行戦闘/報酬/装備更新、現行departure kitをモデル化。上級4職、任意寄り道、MP/強化アイテム能動使用は#461と同じく省略。",
    "",
    "## B10 entrant実測",
    "",
    "- 4職合算B10 entrant実数: " + overall.b10.entrantN + "/" + overall.runs +
      " = " + formatPercent(overall.b10.entrant.estimate, 2),
    renderEndpoint("4職合算", overall.b10),
    "",
    "| 職 | B10 entrant | 実数 | 平均到達floor（全run） | B10 entrant内平均floor | quartile N(Q1/Q2/Q3/Q4) | combat core 0/1/2/3+ |",
    "| --- | --- | ---: | --- | --- | --- | --- |",
    ...byClass.map(row =>
      "| " + CLASS_LABELS[row.className] + " | " + formatRate(row.b10.entrant) +
      " | " + row.b10.entrantN + " | " + formatMean(row.averageReachedFloor) +
      " | " + formatMean(row.averageReachedFloorAmongB10Entrants) +
      " | " + Object.values(row.quartileCellCounts).join("/") +
      " | " + formatCounts(row.combatCoreDistribution.counts) + " |"
    ),
    "",
    "- 盗賊+僧侶 entrant実数: " + thiefPriestN + " / " + overall.b10.entrantN +
      " = " + formatPercent(thiefPriestN / overall.b10.entrantN),
    "- N<30セルは未確定。職全体のentrant率がN≥30でも、職内4分位の分割後にN<30ならA1の4職共通判定へ使わない。",
    "",
    "## A1",
    "",
    BT + "combatBuildScore" + BT +
      "職内Q1〜Q4、B10死亡率。率Wilson 95% CI、差分/平均は正規近似95% CI。",
    "",
    renderA1(overall.quality.a1),
    "",
    "## A3",
    "",
    "A3主軸は既存canonどおりcombat core個数。全core個数は参考。",
    "",
    renderA3(overall.a3),
    "",
    renderNDesign(nDesign, measurement),
    "",
    "## B5基準線との比較",
    "",
    "- B5 A1: Q4−Q1死亡率差 -7.3pt [-9.2, -5.4]。",
    "- B5 A3: 突破 +3.5pp [+1.5, +5.5] / 死亡 -2.7pp [-4.8, -0.6] / 終了到達floor +0.182 [+0.092, +0.273]。",
    "- B10 A1符号: " +
      (overall.quality.a1?.q4MinusQ1Death?.estimate < 0
        ? "一致（負）"
        : "不一致または未確定") +
      "。B10大きさ: " + formatDifference(overall.quality.a1?.q4MinusQ1Death) + "。",
    "- B10 A3符号: " +
      (["breakthrough", "reachedFloor"].every(key =>
        overall.a3.combatCoreCount.endpoints[key].estimate > 0
      ) && overall.a3.combatCoreCount.endpoints.death.estimate < 0
        ? "3 endpointとも一致"
        : "不一致または一部未確定") +
      "。大きさは上記CI参照。",
    "- 判定上の注意: B10 A1/A3は必要なCI条件を満たさない。B10 entrantは選別集団のため、点推定の方向だけでB5受入基準を移行しない。",
    "",
    "## 選別効果と移行提案",
    "",
    "B10 entrantを全run母集団として扱わない。B10到達できた時点で死亡・撤退したrunが除外され、ビルド質とcore供給が選別される。したがってB10効果がB5と同符号でも、#271/#475のB5受入基準をそのままB10へ移す証拠にはならない。",
    "- 提案: **" + decision.label + "**。" + decision.reason,
    "- 盗賊・僧侶限定へ進む場合、#461の4職共通層化系列を崩す。戦士・魔術師のB10測定不能を隠さず、別estimandとしてcanon/Issueへ明記する。",
    "",
    "## 実行記録",
    "",
    "- source commit: " + BT + measurement.sourceCommit + BT,
    "- origin/main ancestor: " + (measurement.originMainAncestor ? "yes" : "no"),
    "- stale tree override: " + (measurement.staleTreeAllowed ? "SIM_ALLOW_STALE_TREE=1" : "none"),
    "- env hash: " + BT + measurement.envHash + BT,
    "- raw JSONL SHA-256: " + BT + summary.rawSha256 + BT,
    "- summary JSON SHA-256: " + BT + summary.summarySha256 + BT,
    "- calibration wall/CPU: " + formatNumber(measurement.calibrationWallSeconds, 3) +
      "s / " + formatNumber(measurement.calibrationCpuSeconds, 3) + "s",
    "- simulation wall/CPU: " + formatNumber(measurement.simulationWallSeconds, 3) +
      "s / " + formatNumber(measurement.simulationCpuSeconds, 3) + "s",
    "- total wall/CPU: " + formatNumber(measurement.totalWallSeconds, 3) +
      "s / " + formatNumber(measurement.totalCpuSeconds, 3) + "s",
    "- resolved parallelism: " + measurement.resolvedParallelism +
      "（available=" + measurement.availableParallelism + "、SIM_PARALLEL未指定）",
    "- reproduction: " + BT + measurement.reproductionCommand + BT,
    "- raw JSONL/summary JSONはコミットしない。",
    "",
    "## 固定env",
    "",
    FENCE + "text",
    ENV_CANONICAL.trimEnd(),
    FENCE,
    "",
    "Refs #510 / #461 / #475 / #271"
  ];
  return lines.join("\n") + "\n";
}

async function main() {
  const scoringProfiles = {};
  const calibrationStarted = performance.now();
  const calibrationCpuStarted = process.cpuUsage();
  for (const spec of createCalibrationSpecs()) {
    const scenario = getScenarioById(spec.scenarioId);
    resetSimulationRandom(SEED);
    scoringProfiles[profileKey(spec.scenarioId)] = calibrateCoreScoringProfile(
      CALIBRATION_RUNS,
      scenario,
      "powder",
      scenario.workshop
    );
  }
  const calibrationCpu = process.cpuUsage(calibrationCpuStarted);
  const calibrationWallSeconds = (performance.now() - calibrationStarted) / 1000;

  const tasks = createTasks();
  const resolvedParallelism = resolveSimParallelism(tasks.length);
  const simulationStarted = performance.now();
  const simulationCpuStarted = process.cpuUsage();
  const rows = await runSimTasks({
    moduleUrl: pathToFileURL(fileURLToPath(import.meta.url)).href,
    exportName: "runIssue510Task",
    runTask: runIssue510Task,
    tasks,
    context: { scoringProfiles }
  });
  const simulationCpu = process.cpuUsage(simulationCpuStarted);
  const simulationWallSeconds = (performance.now() - simulationStarted) / 1000;
  if (rows.length !== tasks.length) {
    throw new Error("raw result audit failed: rows=" + rows.length + "/" + tasks.length);
  }
  const duplicateKeys = rows.length - new Set(
    rows.map(row => row.className + ":" + row.runIndex)
  ).size;
  if (duplicateKeys !== 0) {
    throw new Error("raw result audit failed: duplicates=" + duplicateKeys);
  }
  rows.forEach(row => {
    if (row.endpoints.b10.entrant !== Boolean(row.b10Build)) {
      throw new Error(
        "B10 snapshot mismatch: " + row.className + "/" + row.runIndex +
        " reachedFloor=" + row.reachedFloor +
        " deathFloor=" + row.deathFloor +
        " entrant=" + row.endpoints.b10.entrant +
        " snapshot=" + JSON.stringify(row.b10Build)
      );
    }
    if (row.b10Build && !Number.isFinite(row.b10Build.combatBuildScore)) {
      throw new Error("B10 combatBuildScore missing: " + row.className + "/" + row.runIndex);
    }
  });

  const overallQuality = qualitySummary(rows);
  const qualityRows = overallQuality.rows;
  const b10BuildPointCounts = Object.fromEntries(
    ["floor-start", "finish"].map(point => [
      point,
      rows.filter(row => row.b10Build?.point === point).length
    ])
  );
  const overall = {
    className: "all",
    runs: rows.length,
    b10: endpointSummary(rows, B10),
    averageReachedFloor: normalMean(rows.map(row => row.reachedFloor)),
    averageReachedFloorAmongB10Entrants: normalMean(
      rows.filter(row => row.endpoints.b10.entrant).map(row => row.reachedFloor)
    ),
    quality: {
      entrants: overallQuality.entrants,
      q4AllRuns: overallQuality.q4AllRuns,
      q4AmongB10Entrants: overallQuality.q4AmongB10Entrants,
      a1: overallQuality.a1
    },
    b10BuildPointCounts,
    a3: calculateA3(qualityRows),
    coreDistributions: {
      combatCoreCount: distribution(
        qualityRows,
        row => Math.min(3, row.b10Build.combatCoreIds.length)
      ),
      allCoreCount: distribution(
        qualityRows,
        row => Math.min(3, row.b10Build.coreIds.length)
      )
    },
    mechanisms: aggregateMechanisms(rows)
  };
  const byClass = CLASS_NAMES.map(className => classSummary(
    className,
    rows.filter(row => row.className === className),
    qualityRows
  ));
  const cpuTotalSeconds = (
    calibrationCpu.user + calibrationCpu.system +
    simulationCpu.user + simulationCpu.system
  ) / 1e6;
  const provenance = MEASUREMENT_PROVENANCE || {
    sourceCommit: "unknown",
    originMainAncestor: false,
    staleTreeAllowed: false
  };
  const measurement = {
    issue: 510,
    scope: "run",
    mode: SMOKE ? "smoke" : "audit",
    seed: SEED,
    runsPerClass: RUNS_PER_CLASS,
    calibrationRuns: CALIBRATION_RUNS,
    rawRows: rows.length,
    classNames: CLASS_NAMES,
    scenarioSet: SCENARIO_IDS,
    targetDepth: TARGET_DEPTH,
    endpoint: "B10 entrant / deathFloor===10",
    envHash: ENV_HASH,
    environment: HASH_ENVIRONMENT,
    resolvedParallelism,
    availableParallelism: availableParallelism(),
    simParallel: "未指定",
    simMapCacheEntries: "未指定（既定1024）",
    calibrationWallSeconds,
    simulationWallSeconds,
    totalWallSeconds: calibrationWallSeconds + simulationWallSeconds,
    calibrationCpuSeconds: (calibrationCpu.user + calibrationCpu.system) / 1e6,
    simulationCpuSeconds: (simulationCpu.user + simulationCpu.system) / 1e6,
    totalCpuSeconds: cpuTotalSeconds,
    sourceCommit: provenance.sourceCommit,
    originMainAncestor: provenance.originMainAncestor,
    staleTreeAllowed: provenance.staleTreeAllowed,
    reproductionCommand: (SMOKE ? "ISSUE510_SMOKE=1 " : "") +
      "node scratch/sim_issue_510_b10_criteria_migration.js"
  };
  const nDesign = buildNDesign(
    overall,
    overall.quality.a1,
    overall.a3,
    byClass
  );
  const decision = decide(overall, byClass);
  const summary = {
    measurement,
    overall,
    byClass,
    nDesign,
    decision,
    rawSha256: null,
    summarySha256: null
  };

  const resultDir = join(process.cwd(), "scratch", "results");
  mkdirSync(resultDir, { recursive: true });
  const rawText = rows.map(row => JSON.stringify(row)).join("\n") + "\n";
  const rawSha256 = sha256(rawText);
  const rawPath = join(resultDir, OUTPUT_STEM + ".jsonl");
  const summaryPath = join(resultDir, OUTPUT_STEM + ".json");
  const markdownPath = join(resultDir, OUTPUT_STEM + ".md");
  writeFileSync(rawPath, rawText);
  summary.rawSha256 = rawSha256;
  const summaryForFile = { ...summary };
  delete summaryForFile.summarySha256;
  const summaryText = JSON.stringify(summaryForFile, null, 2) + "\n";
  summary.summarySha256 = sha256(summaryText);
  writeFileSync(summaryPath, summaryText);
  writeFileSync(markdownPath, renderMarkdown(summary));
  console.log(JSON.stringify({
    output: markdownPath.replace(process.cwd() + "/", ""),
    sourceCommit: measurement.sourceCommit,
    originMainAncestor: measurement.originMainAncestor,
    envHash: ENV_HASH,
    rawSha256,
    summarySha256: summary.summarySha256,
    decision: decision.label,
    resolvedParallelism,
    wallClockSeconds: measurement.totalWallSeconds,
    cpuTotalSeconds
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
