// sim-scope: run — Issue #461 weighted baseline through simulateRun/generateRunFloor
// Historical runner: its rendered 35〜40% wording belongs to the #461-era record;
// current canon is .agents/balance-simulation.md, Issue #471.
/* global console, process */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { performance } from "node:perf_hooks";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  resolveSimParallelism,
  runSimTasks
} from "./sim_parallel.js";

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
// Issue #461 baseline exception: stabilize each class/scenario scoring profile
// before applying the quartile and endpoint analysis.
const DEFAULT_CALIBRATION_RUNS = 1000;
const R95 = 1.959963984540054;
const SMOKE = process.env.ISSUE461_SMOKE === "1";
const OUTPUT_STEM = process.env.SIM_RESULT_BASENAME ||
  (SMOKE ? "issue-461-baseline-smoke" : "issue-461-baseline");

// Fixed measurement env. SIM_PARALLEL and SIM_MAP_CACHE_ENTRIES intentionally
// remain absent; their defaults are part of the measurement contract.
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
const ENV_MUTABLE_FOR_SMOKE = new Set(["SIM_RUNS", "SIM_CALIBRATION_RUNS"]);

if (process.env.SIM_PARALLEL !== undefined) {
  throw new Error("SIM_PARALLEL must be omitted for Issue #461 measurement");
}
if (process.env.SIM_MAP_CACHE_ENTRIES !== undefined) {
  throw new Error("SIM_MAP_CACHE_ENTRIES must be omitted for Issue #461 measurement");
}

const runtimeEnvDefaults = {
  ...SIM_ENV_DEFAULTS,
  ...(SMOKE
    ? { SIM_RUNS: "1", SIM_CALIBRATION_RUNS: "1" }
    : {})
};
for (const [key, value] of Object.entries(runtimeEnvDefaults)) {
  if (process.env[key] === undefined) {
    process.env[key] = value;
    continue;
  }
  if (!SMOKE || !ENV_MUTABLE_FOR_SMOKE.has(key)) {
    if (process.env[key] !== value) {
      throw new Error(`Issue #461 fixed env mismatch: ${key}=${process.env[key]}`);
    }
  }
}

const RUNS_PER_CLASS = Math.max(1, Number(process.env.SIM_RUNS));
const CALIBRATION_RUNS = Math.max(1, Number(process.env.SIM_CALIBRATION_RUNS));
if (!SMOKE && RUNS_PER_CLASS !== DEFAULT_RUNS_PER_CLASS) {
  throw new Error(`SIM_RUNS must be ${DEFAULT_RUNS_PER_CLASS} for the baseline`);
}
if (!SMOKE && CALIBRATION_RUNS !== DEFAULT_CALIBRATION_RUNS) {
  throw new Error(
    `SIM_CALIBRATION_RUNS must be ${DEFAULT_CALIBRATION_RUNS} for the baseline`
  );
}
if (SMOKE && (RUNS_PER_CLASS !== 1 || CALIBRATION_RUNS !== 1)) {
  throw new Error("ISSUE461_SMOKE requires SIM_RUNS=1 and SIM_CALIBRATION_RUNS=1");
}

const {
  calibrateCoreScoringProfile,
  getScenarioById,
  resetSimulationRandom,
  simulateRun,
  SIM_CLASSES
} = await import("./sim_depth_material_ev.js");

const CLASS_NAMES = SMOKE
  ? BASIC_CLASSES.slice(0, 1)
  : BASIC_CLASSES.filter(className => SIM_CLASSES.includes(className));
if (CLASS_NAMES.length !== (SMOKE ? 1 : BASIC_CLASSES.length)) {
  throw new Error(`basic classes missing: ${BASIC_CLASSES.join(",")}`);
}
const SCENARIO_IDS = SMOKE
  ? WORKSHOP_SCENARIO_IDS.slice(0, 1)
  : WORKSHOP_SCENARIO_IDS;

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
  values.ISSUE461_TARGET_DEPTH_BASELINE = "21";
  values.ISSUE461_WORKSHOP_DISTRIBUTION = OBSERVED_WORKSHOP_DISTRIBUTION
    .map(row => `${row.scenarioId}:${row.observedRuns}/${OBSERVED_WORKSHOP_TOTAL}`)
    .join(",");
  return values;
}

const HASH_ENVIRONMENT = environmentForHash();
const ENV_CANONICAL = Object.entries(HASH_ENVIRONMENT)
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([key, value]) => `${key}=${value}`)
  .join("\n") + "\n";
const ENV_HASH = sha256(ENV_CANONICAL);
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
  if (values.length === 0) {
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
  const sumSquares = values.reduce((sum, value) => sum + value ** 2, 0);
  const variance = Math.max(
    0,
    (sumSquares - values.length * estimate ** 2) / (values.length - 1)
  );
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
  if (left.length === 0 || right.length === 0) {
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
    ? left.reduce((sum, value) => sum + (value - leftMean) ** 2, 0) / (left.length - 1)
    : 0;
  const rightVariance = right.length > 1
    ? right.reduce((sum, value) => sum + (value - rightMean) ** 2, 0) / (right.length - 1)
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

function compactBuildSnapshot(result) {
  const snapshot = result.buildSnapshots?.find(
    row => row.floor === 5 && row.point === "floor-start"
  );
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

function countValues(values) {
  return values.reduce((sum, value) => sum + Number(value || 0), 0);
}

function buildScenario(scenarioId, phase) {
  const scenario = getScenarioById(scenarioId);
  return phase === "initial"
    ? { ...scenario, departureCraft: [] }
    : scenario;
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

function profileKey(phase, scenarioId) {
  return `${phase}:${scenarioId}`;
}

export function runIssue461BaselineTask(task, context) {
  resetSimulationRandom(hashSeed(
    `${SEED}:${task.phase}:${task.scenarioId}:${task.className}:${task.runIndex}`
  ));
  const scenario = buildScenario(task.scenarioId, task.phase);
  const result = simulateRun({
    className: task.className,
    startFloor: 1,
    targetDepth: task.phase === "initial" ? 2 : 21,
    runIndex: task.runIndex,
    seriesId: `issue461-${task.phase}`,
    scoringProfile: context.scoringProfiles[profileKey(task.phase, task.scenarioId)],
    scenario,
    workshop: scenario.workshop,
    collectBuildSnapshots: task.phase === "baseline"
  });
  const statusCureItemsUsed = { ...(result.statusCureItemsUsed || {}) };
  return {
    phase: task.phase,
    className: task.className,
    runIndex: task.runIndex,
    scenarioId: task.scenarioId,
    survived: Boolean(result.survived),
    died: Boolean(result.died),
    outcome: result.outcome,
    reachedFloor: result.reachedFloor,
    deathFloor: result.deathFloor,
    endpoints: {
      b1: endpoint(result, 1),
      b5: endpoint(result, 5),
      b10: endpoint(result, 10)
    },
    b5Build: task.phase === "baseline" ? compactBuildSnapshot(result) : null,
    finalCoreIds: [...(result.finalCoreIds || [])],
    mechanisms: {
      trapEncounters: result.trapEncounterCount || 0,
      trapActivations: result.trapActivations || 0,
      trapDisarms: result.trapDisarms || 0,
      trapDamageHp: result.trapDamageHp || 0,
      townPortalsUsed: result.townPortalsUsed || 0,
      healPotionsUsed: result.healPotionsUsed || 0,
      statusCureItemsUsed,
      statusesCured: countValues(Object.values(result.statusesCured || {})),
      identificationCount: result.identificationCount || 0,
      identificationPowderUsed: result.identificationPowderUsed || 0
    }
  };
}

function createTasks() {
  const phases = SMOKE ? ["baseline"] : ["initial", "baseline"];
  return phases.flatMap(phase =>
    CLASS_NAMES.flatMap(className =>
      Array.from({ length: RUNS_PER_CLASS }, (_, runIndex) => ({
        phase,
        className,
        runIndex,
        scenarioId: phase === "initial"
          ? "workshop-empty"
          : scenarioForRun(runIndex)
      }))
    )
  );
}

function createCalibrationSpecs() {
  const specs = [];
  if (!SMOKE) specs.push({ phase: "initial", scenarioId: "workshop-empty" });
  SCENARIO_IDS.forEach(scenarioId => {
    specs.push({ phase: "baseline", scenarioId });
  });
  return specs;
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
      left.b5Build.combatBuildScore - right.b5Build.combatBuildScore ||
      left.runIndex - right.runIndex
    );
    sorted.forEach((row, index) => {
      quartiles.set(
        `${row.className}:${row.runIndex}`,
        Math.floor(index * 4 / sorted.length) + 1
      );
    });
  });
  return rows.map(row => ({
    ...row,
    qualityQuartile: quartiles.get(`${row.className}:${row.runIndex}`)
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
    classCounts[className] = { left: leftRows.length, right: rightRows.length };
    leftValues.push(...leftRows.map(row => Number(outcome(row)) - classMean));
    rightValues.push(...rightRows.map(row => Number(outcome(row)) - classMean));
  });
  return {
    ...normalDifference(leftValues, rightValues),
    classCounts,
    classCentered: Object.values(classCounts).every(
      counts => counts.left >= 30 && counts.right >= 30
    )
  };
}

function quartileStats(rows) {
  return [1, 2, 3, 4].map(quartile => {
    const group = rows.filter(row => row.qualityQuartile === quartile);
    const deaths = group.filter(row => row.endpoints.b5.death).length;
    const breakthroughs = group.filter(row => row.endpoints.b5.breakthrough).length;
    return {
      quartile,
      n: group.length,
      scoreMean: mean(group.map(row => row.b5Build.combatBuildScore)),
      b5Death: wilson(deaths, group.length),
      b5Breakthrough: wilson(breakthroughs, group.length)
    };
  });
}

function centeredQuartileRates(rows) {
  const byClass = new Map();
  rows.forEach(row => {
    if (!byClass.has(row.className)) byClass.set(row.className, []);
    byClass.get(row.className).push(row);
  });
  return [1, 2, 3, 4].map(quartile => {
    const classRates = [...byClass.entries()].map(([className, classRows]) => {
      const group = classRows.filter(row => row.qualityQuartile === quartile);
      return {
        className,
        n: group.length,
        rate: group.length
          ? group.filter(row => row.endpoints.b5.death).length / group.length
          : null
      };
    });
    const available = classRates.filter(row => row.rate !== null);
    return {
      quartile,
      estimate: available.length
        ? mean(available.map(row => row.rate))
        : null,
      classRates
    };
  });
}

function calculateA1(rows) {
  const quartiles = quartileStats(rows);
  const centeredRates = centeredQuartileRates(rows);
  const q4MinusQ1Death = classCenteredDifference(
    rows,
    row => row.qualityQuartile === 4,
    row => row.qualityQuartile === 1,
    row => row.endpoints.b5.death
  );
  const monotonicNonIncreasing = centeredRates.every((row, index) =>
    index === 0 || row.estimate <= centeredRates[index - 1].estimate
  );
  const conditions = {
    q4MinusQ1UpperBelowZero: q4MinusQ1Death.high < 0,
    monotonicNonIncreasing,
    classCentered: q4MinusQ1Death.classCentered
  };
  return {
    quartiles,
    centeredRates,
    q4MinusQ1Death,
    conditions,
    pass: Object.values(conditions).every(Boolean)
  };
}

function qualitySummary(rows) {
  const entrants = rows.filter(row => row.b5Build);
  if (entrants.length === 0) {
    return {
      entrants: 0,
      q4: wilson(0, rows.length),
      q4AmongB5Entrants: wilson(0, 0),
      a1: calculateA1([]),
      rows: []
    };
  }
  const quartileRows = assignQuartiles(entrants);
  const q4Count = quartileRows.filter(row => row.qualityQuartile === 4).length;
  return {
    entrants: entrants.length,
    q4: wilson(q4Count, rows.length),
    q4AmongB5Entrants: wilson(q4Count, entrants.length),
    a1: calculateA1(quartileRows),
    rows: quartileRows
  };
}

function endpointSummary(rows, floor) {
  const entrantRows = rows.filter(row => row.endpoints[`b${floor}`].entrant);
  const outcomeKeys = ["breakthrough", "death", "retreat"];
  const outcomeCounts = Object.fromEntries(
    outcomeKeys.map(outcome => [
      outcome,
      entrantRows.filter(row => row.endpoints[`b${floor}`][outcome]).length
    ])
  );
  if (outcomeKeys.reduce((sum, outcome) => sum + outcomeCounts[outcome], 0) !== entrantRows.length) {
    throw new Error(`endpoint outcome partition failed: floor=${floor}`);
  }
  return {
    entrant: wilson(entrantRows.length, rows.length),
    ...Object.fromEntries(
      outcomeKeys.map(outcome => [
        outcome,
        wilson(outcomeCounts[outcome], entrantRows.length)
      ])
    )
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
  const warnings = [];
  if (totals.trapEncounters === 0) warnings.push("trap");
  if (totals.townPortalsUsed === 0) warnings.push("TOWN_PORTAL");
  if (totals.statusesCured === 0) warnings.push("status-cure");
  if (totals.identificationCount === 0) warnings.push("identification");
  return { ...totals, statusCureItemsUsed, warnings };
}

function aggregateClass(className, baselineRows, initialRows, qualityRows) {
  const quality = qualityRows.filter(row => row.className === className);
  const initialBreakthrough = initialRows.filter(
    row => row.endpoints.b1.breakthrough
  ).length;
  const q4Count = quality.filter(row => row.qualityQuartile === 4).length;
  return {
    className,
    runs: baselineRows.length,
    initialB1Breakthrough: wilson(initialBreakthrough, initialRows.length),
    endpoints: Object.fromEntries([1, 5, 10].map(floor => [
      `b${floor}`,
      endpointSummary(baselineRows, floor)
    ])),
    averageReachedFloor: normalMean(
      baselineRows.map(row => row.reachedFloor)
    ),
    coreEquipped: wilson(
      baselineRows.filter(row => row.finalCoreIds.length > 0).length,
      baselineRows.length
    ),
    completedBuild: {
      q4AllRuns: wilson(q4Count, baselineRows.length),
      q4AmongB5Entrants: wilson(q4Count, quality.length)
    },
    a1: calculateA1(quality)
  };
}

function multipleComparisonSummary() {
  const endpointRateChecks = CLASS_NAMES.length * (1 + 3 * 3);
  const completionAndCoreChecks = CLASS_NAMES.length * 2;
  const a1Checks = 1 + 3;
  const totalChecks = endpointRateChecks + completionAndCoreChecks + a1Checks;
  return {
    alpha: 0.05,
    endpointRateChecks,
    completionAndCoreChecks,
    a1Checks,
    totalChecks,
    expectedFalsePositives: totalChecks * 0.05,
    note: "基準線の記述区間。多重比較補正済みの効果判定ではない"
  };
}

function formatPercent(value) {
  return value === null || value === undefined
    ? "NA"
    : `${(value * 100).toFixed(1)}%`;
}

function formatRate(rate) {
  if (!rate || rate.estimate === null) {
    return rate?.status === "未観測" ? `未観測 [N=${rate.trials}]` : "NA";
  }
  return `${formatPercent(rate.estimate)} [${formatPercent(rate.low)}, ${formatPercent(rate.high)}; N=${rate.trials}]` +
    (rate.status.startsWith("未確定") ? " 未確定" : "");
}

function formatMean(stat) {
  if (!stat || stat.estimate === null) return "NA";
  if (stat.low === null) return `${stat.estimate.toFixed(2)} [未確定; N=${stat.n}]`;
  return `${stat.estimate.toFixed(2)} [${stat.low.toFixed(2)}, ${stat.high.toFixed(2)}; N=${stat.n}]`;
}

function formatDifference(stat) {
  if (!stat || stat.estimate === null) return "NA";
  return `${(stat.estimate * 100).toFixed(1)}pt [${(stat.low * 100).toFixed(1)}, ${(stat.high * 100).toFixed(1)}]`;
}

function renderBaselineTable(byClass) {
  const lines = [
    "| 職業 | 初回B1突破 | B1 entrant | B1突破 | B1死亡 | B1撤退 | B5 entrant | B5突破 | B5死亡 | B5撤退 | B10 entrant | B10突破 | B10死亡 | B10撤退 | 全run平均到達floor |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"
  ];
  byClass.forEach(summary => {
    const b1 = summary.endpoints.b1;
    const b5 = summary.endpoints.b5;
    const b10 = summary.endpoints.b10;
    lines.push(
      `| ${CLASS_LABELS[summary.className]} | ${formatRate(summary.initialB1Breakthrough)} | ` +
      `${formatRate(b1.entrant)} | ${formatRate(b1.breakthrough)} | ${formatRate(b1.death)} | ${formatRate(b1.retreat)} | ` +
      `${formatRate(b5.entrant)} | ${formatRate(b5.breakthrough)} | ${formatRate(b5.death)} | ${formatRate(b5.retreat)} | ` +
      `${formatRate(b10.entrant)} | ${formatRate(b10.breakthrough)} | ${formatRate(b10.death)} | ${formatRate(b10.retreat)} | ` +
      `${formatMean(summary.averageReachedFloor)} |`
    );
  });
  return lines.join("\n");
}

function renderQualityTable(overall, byClass) {
  const lines = [
    "| 対象 | Q4完成率 / 全run | Q4 / B5 entrant | core装備率（終了時1個以上） |",
    "| --- | --- | --- | --- |"
  ];
  const rows = [{ label: "4職合算", summary: overall }, ...byClass.map(summary => ({
    label: CLASS_LABELS[summary.className],
    summary
  }))];
  rows.forEach(({ label, summary }) => {
    lines.push(
      `| ${label} | ${formatRate(summary.completedBuild.q4AllRuns)} | ` +
      `${formatRate(summary.completedBuild.q4AmongB5Entrants)} | ` +
      `${formatRate(summary.coreEquipped)} |`
    );
  });
  return lines.join("\n");
}

function renderA1(a1, label = "4職合算") {
  const lines = [
    `### ${label}`,
    "",
    "| Q | N | combatBuildScore平均 | B5死亡率（deathFloor===5; Wilson 95% CI） | 職内centered率 |",
    "| ---: | ---: | ---: | --- | ---: |"
  ];
  a1.quartiles.forEach((quartile, index) => {
    lines.push(
      `| Q${quartile.quartile} | ${quartile.n} | ${quartile.scoreMean?.toFixed(2) ?? "NA"} | ` +
      `${formatRate(quartile.b5Death)} | ${formatPercent(a1.centeredRates[index].estimate)} |`
    );
  });
  lines.push(
    "",
    `- Q4−Q1 B5死亡率差（職内centered、正規近似CI）: ${formatDifference(a1.q4MinusQ1Death)}`,
    `- 条件: Q4−Q1 CI上限<0=${a1.conditions.q4MinusQ1UpperBelowZero ? "成立" : "不成立"}` +
      ` / Q1→Q4単調減少=${a1.conditions.monotonicNonIncreasing ? "成立" : "不成立"}` +
      ` / 職内centered=${a1.conditions.classCentered ? "成立" : "不成立"}`,
    `- A1判定: **${a1.pass ? "成立" : "不成立（Q4定義を採用しない）"}**`
  );
  return lines.join("\n");
}

function renderMarkdown(summary, rawSha256, summarySha256) {
  const { measurement, overall, byClass, a1ByClass, scenarioMix, mechanisms } = summary;
  const envLines = Object.entries(measurement.environment)
    .filter(([key]) => key !== "SIM_PARALLEL" && key !== "SIM_MAP_CACHE_ENTRIES")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const distributionLines = scenarioMix.map(row =>
    `| ${row.scenarioId} | ${row.configuredRuns}/${OBSERVED_WORKSHOP_TOTAL} ` +
    `(${formatPercent(row.configuredRate)}) | ${row.observedRuns}/${row.totalRuns} ` +
    `(${formatRate(row.observedRate)}) |`
  ).join("\n");
  const classA1Lines = a1ByClass.map(item =>
    `- ${CLASS_LABELS[item.className]}: Q4−Q1=${formatDifference(item.a1.q4MinusQ1Death)}, ` +
    `A1=${item.a1.pass ? "成立" : "不成立"}`
  ).join("\n");
  const omitted = [
    "任意の節目商人での鑑定粉購入（未観測・自動購入なし）",
    "人間の敵別判断、任意寄り道、テレポーター移動先の再経路化",
    "MP・強化アイテムの能動使用",
    "上級職4種"
  ];
  return `# Issue #461 基本4職 基準線

## 結論

${measurement.a1Pass
  ? "職内 \`combatBuildScore\` Q4 は A1 の3条件を満たす。完成ビルド定義として採用可能。"
  : "職内 \`combatBuildScore\` Q4 は A1 の3条件を満たさない。完成ビルド定義は未採用、再定義が必要。"}

${renderBaselineTable(byClass)}

初回ランは素材0・出発クラフトなし。各 floor の突破・死亡・撤退は entrant を分母とし、3内訳の合計は100%。死亡は \`deathFloor === floor\`（その階でちょうど死亡）であり、到達後に後続階で死亡した run は突破へ入る。撤退は entrant かつ突破/死亡でない run。B1撤退0%は \`PORTAL_MIN_FLOOR=3\` のため。率は Wilson 95% CI、平均は正規近似95% CI。

## 完成ビルド率 / core装備率

${renderQualityTable(overall, byClass)}

Q4完成率の主値は Q4 / 全run。Q4 / B5 entrant は quartile定義上の監査値（約25%）。core装備率は終了時 \`finalCoreIds.length >= 1\` / 全run。

## A1

${renderA1(overall.a1)}

職内判定の確認:

${classA1Lines}

## 工房状態分布

観測正本 #343/#346 の30試行×40ランを整数再構成。各職 N=${measurement.runsPerClass} へ同じ層化系列を適用。空工房だけの測定ではない。

| state | 固定比率 | 実行時観測 |
| --- | --- | --- |
${distributionLines}

## 多重比較

- α=.05、計 ${measurement.multipleComparisons.totalChecks} チェック、期待偽陽性 ${measurement.multipleComparisons.expectedFalsePositives.toFixed(1)}件。
- 内訳: 初回率1 + 各 floor の entrant/突破/死亡/撤退、endpoint率 ${measurement.multipleComparisons.endpointRateChecks}、Q4/core ${measurement.multipleComparisons.completionAndCoreChecks}、A1 ${measurement.multipleComparisons.a1Checks}。
- これは基準線の記述区間。効果の採否に多重比較補正済み検定を主張しない。

## 配線確認 / 緩和策

- trap: encounter=${mechanisms.trapEncounters}, activation=${mechanisms.trapActivations}, disarm=${mechanisms.trapDisarms}, damageHP=${mechanisms.trapDamageHp.toFixed(1)}。
- TOWN_PORTAL: use=${mechanisms.townPortalsUsed}。status cure: ${JSON.stringify(mechanisms.statusCureItemsUsed)}, cured=${mechanisms.statusesCured}。
- identification: count=${mechanisms.identificationCount}, powderUsed=${mechanisms.identificationPowderUsed}。
- モデル: \`generateRunFloor\`、罠の発見/解除/被弾、\`TOWN_PORTAL\`、状態異常治療消耗品、鑑定粉、上薬（\`GREATER_HEAL\`）能動使用、現行戦闘/報酬/装備更新、現行 departure kit。
- 省略: ${omitted.join(" / ")}。
${mechanisms.warnings.length ? `- 警告: 発火0の機構=${mechanisms.warnings.join(",")}。\n` : ""}

## 固定条件

${"```text"}
${envLines}
SIM_PARALLEL=<omitted; runtime default>
SIM_MAP_CACHE_ENTRIES=<omitted; runtime default 1024>
${"```"}

- env hash: \`${measurement.envHash}\`
- scenario: ${measurement.scenarioSet.join(", ")}
- targetDepth: initial=2 / baseline=21（B20終了まで）
- resolved parallelism: ${measurement.resolvedParallelism}（availableParallelism=${measurement.availableParallelism}, ` +
  `SIM_PARALLEL未指定、CI=${measurement.environment.CI}）
- \`SIM_MAP_CACHE_ENTRIES\`未指定。既定1024。

## 実行記録

${"```sh"}
node --check scratch/sim_issue_461_baseline.js
SIM_RUNS=${measurement.runsPerClass} SIM_CALIBRATION_RUNS=${measurement.calibrationRuns} node scratch/sim_issue_461_baseline.js
${"```"}

- calibration wall-clock: ${measurement.calibrationWallSeconds.toFixed(3)}s
- simulation wall-clock: ${measurement.simulationWallSeconds.toFixed(3)}s
- total wall-clock（単純合計）: ${measurement.totalWallSeconds.toFixed(3)}s
- total CPU（user+system）: ${measurement.totalCpuSeconds.toFixed(3)}s
- raw JSONL SHA-256: \`${rawSha256}\`
- summary JSON SHA-256: \`${summarySha256}\`

## 採らなかった完成定義

- \`core 1個以上 + スロット充足\`: core装備率を35〜40%目標の別指標で使うため二重定義。
- \`core + 対応support\`: #445で成立率9.5%→71.1%にしてもB5 endpointが動かず、判定力なし。

## 検証

- \`node scratch/test_sim_reward_paths.js\`
- \`npm run lint\`
- \`npm run test:unit\`

Refs #461
`;
}

async function main() {
  const scoringProfiles = {};
  const calibrationStarted = performance.now();
  const calibrationCpuStarted = process.cpuUsage();
  for (const spec of createCalibrationSpecs()) {
    const scenario = buildScenario(spec.scenarioId, spec.phase);
    resetSimulationRandom(SEED);
    scoringProfiles[profileKey(spec.phase, spec.scenarioId)] =
      calibrateCoreScoringProfile(
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
    exportName: "runIssue461BaselineTask",
    runTask: runIssue461BaselineTask,
    tasks,
    context: { scoringProfiles }
  });
  const simulationCpu = process.cpuUsage(simulationCpuStarted);
  const simulationWallSeconds = (performance.now() - simulationStarted) / 1000;
  if (rows.length !== tasks.length) {
    throw new Error(`raw result audit failed: rows=${rows.length}/${tasks.length}`);
  }
  const rowKeys = rows.map(row => `${row.phase}:${row.className}:${row.runIndex}`);
  if (new Set(rowKeys).size !== rows.length) {
    throw new Error("raw result audit failed: duplicate phase/class/run key");
  }
  rows.filter(row => row.phase === "baseline").forEach(row => {
    if (row.endpoints.b5.entrant !== Boolean(row.b5Build)) {
      throw new Error(`B5 snapshot mismatch: ${row.className}/${row.runIndex}`);
    }
    if (row.b5Build && !Number.isFinite(row.b5Build.combatBuildScore)) {
      throw new Error(`B5 combatBuildScore missing: ${row.className}/${row.runIndex}`);
    }
  });

  const baselineRows = rows.filter(row => row.phase === "baseline");
  const initialRows = rows.filter(row => row.phase === "initial");
  const overallQuality = qualitySummary(baselineRows);
  const overall = {
    className: "all",
    runs: baselineRows.length,
    initialB1Breakthrough: wilson(
      initialRows.filter(row => row.endpoints.b1.breakthrough).length,
      initialRows.length
    ),
    endpoints: Object.fromEntries([1, 5, 10].map(floor => [
      `b${floor}`,
      endpointSummary(baselineRows, floor)
    ])),
    averageReachedFloor: normalMean(
      baselineRows.map(row => row.reachedFloor)
    ),
    coreEquipped: wilson(
      baselineRows.filter(row => row.finalCoreIds.length > 0).length,
      baselineRows.length
    ),
    completedBuild: {
      q4AllRuns: overallQuality.q4,
      q4AmongB5Entrants: overallQuality.q4AmongB5Entrants
    },
    a1: overallQuality.a1
  };
  const qualityRows = overallQuality.rows;
  const byClass = CLASS_NAMES.map(className => aggregateClass(
    className,
    baselineRows.filter(row => row.className === className),
    initialRows.filter(row => row.className === className),
    qualityRows
  ));
  const a1ByClass = byClass.map(summary => ({
    className: summary.className,
    a1: summary.a1
  }));
  const scenarioMix = SCENARIO_IDS.map(scenarioId => {
    const configured = OBSERVED_WORKSHOP_DISTRIBUTION.find(
      row => row.scenarioId === scenarioId
    );
    const observedRuns = baselineRows.filter(row => row.scenarioId === scenarioId).length;
    return {
      scenarioId,
      configuredRuns: configured.observedRuns,
      configuredRate: configured.observedRuns / OBSERVED_WORKSHOP_TOTAL,
      observedRuns,
      totalRuns: baselineRows.length,
      observedRate: wilson(observedRuns, baselineRows.length)
    };
  });
  const mechanisms = aggregateMechanisms(baselineRows);
  const multipleComparisons = multipleComparisonSummary();
  const cpuTotalSeconds = (
    calibrationCpu.user + calibrationCpu.system +
    simulationCpu.user + simulationCpu.system
  ) / 1e6;
  const measurement = {
    issue: 461,
    scope: "run",
    mode: SMOKE ? "smoke" : "baseline",
    seed: SEED,
    runsPerClass: RUNS_PER_CLASS,
    calibrationRuns: CALIBRATION_RUNS,
    classNames: CLASS_NAMES,
    scenarioSet: SCENARIO_IDS,
    targetDepthInitial: 2,
    targetDepthBaseline: 21,
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
    multipleComparisons,
    a1Pass: overall.a1.pass
  };
  const summary = {
    measurement,
    overall,
    byClass,
    a1ByClass,
    scenarioMix,
    mechanisms
  };

  const resultDir = join(process.cwd(), "scratch", "results");
  mkdirSync(resultDir, { recursive: true });
  const rawPath = join(resultDir, `${OUTPUT_STEM}.jsonl`);
  const summaryPath = join(resultDir, `${OUTPUT_STEM}.json`);
  const markdownPath = join(resultDir, `${OUTPUT_STEM}.md`);
  const rawText = rows.map(row => JSON.stringify(row)).join("\n") + "\n";
  const rawSha256 = sha256(rawText);
  writeFileSync(rawPath, rawText);
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  const summarySha256 = sha256(readFileSync(summaryPath));
  writeFileSync(markdownPath, renderMarkdown(summary, rawSha256, summarySha256));

  console.log(JSON.stringify({
    output: markdownPath.replace(`${process.cwd()}/`, ""),
    envHash: ENV_HASH,
    rawSha256,
    summarySha256,
    a1Pass: overall.a1.pass,
    resolvedParallelism,
    wallClockSeconds: measurement.totalWallSeconds,
    cpuTotalSeconds: measurement.totalCpuSeconds
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
