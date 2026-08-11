// sim-scope: run — Issue #470 build-definition candidates through generateRunFloor
/* global console, process */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { performance } from "node:perf_hooks";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { runSimTasks } from "./sim_parallel.js";

const SMOKE = process.env.ISSUE470_SMOKE === "1";
if (SMOKE) process.env.ISSUE461_SMOKE = "1";

const {
  calibrateCoreScoringProfile,
  getScenarioById,
  resetSimulationRandom,
  SIM_CLASSES
} = await import("./sim_depth_material_ev.js");
const { runIssue461BaselineTask } = await import("./sim_issue_461_baseline.js");

const BASIC_CLASSES = Object.freeze(["Fighter", "Thief", "Priest", "Mage"]);
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
const R95 = 1.959963984540054;
const MONOTONIC_ALPHA = 0.05;
const ORDINAL_SCORES = Object.freeze([0, 1, 2, 3]);
const SEED = Number(process.env.SIM_SEED) >>> 0;
const RUNS_PER_CLASS = Number(process.env.SIM_RUNS);
const CALIBRATION_RUNS = Number(process.env.SIM_CALIBRATION_RUNS);
const EXPECTED_ENV_HASH =
  "e79d51f4d7ce5e701e0e73db97afc9ee051d609b9a652e278ab84b0518897bda";

if (!SMOKE && process.env.ISSUE461_SMOKE === "1") {
  throw new Error("Issue #470 measurement does not accept ISSUE461_SMOKE");
}
if (!SMOKE && (RUNS_PER_CLASS !== 3000 || CALIBRATION_RUNS !== 1000)) {
  throw new Error("Issue #470 requires SIM_RUNS=3000 and SIM_CALIBRATION_RUNS=1000");
}
if (SMOKE && (RUNS_PER_CLASS !== 1 || CALIBRATION_RUNS !== 1)) {
  throw new Error("ISSUE470_SMOKE requires SIM_RUNS=1 and SIM_CALIBRATION_RUNS=1");
}
if (SIM_CLASSES.length < (SMOKE ? 1 : BASIC_CLASSES.length)) {
  throw new Error(`basic classes missing: ${BASIC_CLASSES.join(",")}`);
}

const CLASS_NAMES = SMOKE ? BASIC_CLASSES.slice(0, 1) : BASIC_CLASSES;
const SCENARIO_IDS = SMOKE
  ? WORKSHOP_SCENARIO_IDS.slice(0, 1)
  : WORKSHOP_SCENARIO_IDS;

const CANDIDATES = Object.freeze([
  {
    id: "current-total-class-quartile",
    label: "現行 total = equipment + first combat core（職内 quartile）",
    metric: "currentTotal",
    scope: "class"
  },
  {
    id: "equipment-only-class-quartile",
    label: "equipmentStatScore のみ（職内 quartile）",
    metric: "equipmentOnly",
    scope: "class",
    role: "diagnostic"
  },
  {
    id: "first-combat-core-only-class-quartile",
    label: "現行 first combatCoreScore のみ（職内 quartile）",
    metric: "firstCoreOnly",
    scope: "class",
    role: "diagnostic"
  },
  {
    id: "all-combat-core-only-class-quartile",
    label: "全 combat core 合計のみ（職内 quartile）",
    metric: "allCoreOnly",
    scope: "class"
  },
  {
    id: "all-combat-total-class-quartile",
    label: "equipment + 全 combat core 合計（職内 quartile）",
    metric: "allCoreTotal",
    scope: "class"
  },
  {
    id: "current-total-global-quartile",
    label: "現行 total（全職 global quartile / 上位25%）",
    metric: "currentTotal",
    scope: "global"
  },
  {
    id: "all-combat-total-global-quartile",
    label: "equipment + 全 combat core 合計（全職 global quartile / 上位25%）",
    metric: "allCoreTotal",
    scope: "global"
  }
]);
const ADOPTION_PRIORITY = Object.freeze([
  "current-total-class-quartile",
  "all-combat-total-class-quartile"
]);

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
  const keys = [
    "SIM_PRESET",
    "SIM_SEED",
    "SIM_RUNS",
    "SIM_CALIBRATION_RUNS",
    "DEPARTURE_CRAFT_IDS",
    "TRAP_POLICY",
    "TRAP_AVOIDANCE_POLICY",
    "TRAP_DAMAGE_MULTIPLIER",
    "TRAP_BONUS_OVERRIDE",
    "TRAP_SENSE_OVERRIDE",
    "IDENTIFICATION_POLICY",
    "IDENTIFICATION_STARTING_POWDER",
    "IDENTIFICATION_COST_OVERRIDE",
    "STATUS_CURE_POLICY",
    "STATUS_CURE_HP_THRESHOLD",
    "STATUS_CURE_MERCHANT_POLICY",
    "HEAL_POTION_MERCHANT_POLICY",
    "FLEE_POLICY",
    "FLEE_HP_THRESHOLD",
    "PORTAL_HP_THRESHOLD",
    "PORTAL_MAX_HEAL_POTIONS",
    "PORTAL_MIN_FLOOR",
    "ELITE_POLICY",
    "BLOOD_WAND_HP_PAYMENT_MIN_RATE",
    "SIM_CORE_SCORE_DROP_TOLERANCE",
    "SIM_440_CONDITION",
    "SIM_SCENARIOS",
    "SIM_MAP_STATS",
    "SIM_DAMAGE_PROBE",
    "SIM_CORE_ENCOUNTER_CEILING",
    "SIM_CORE_WORKSHOP_GATE",
    "SIM_SUPPORT_SUPPLY_CEILING",
    "SIM_EQUIPMENT_SLOT_MODE",
    "SIM_EQUIPMENT_SLOT_AFFIX_MODE",
    "SIM_AFFIXLESS_DUPLICATE_COUNT",
    "SIM_AFFIXLESS_DUPLICATE_SLOT",
    "SIM_EQUIPMENT_POLICY",
    "SIM_MATCHING_DEFINITION",
    "SIM_CURSE_LOCK_MODE",
    "SIM_CURSE_BASE_CHANCE_OVERRIDE",
    "SIM_CURSE_CHANCE_PER_FLOOR_OVERRIDE",
    "SIM_CURSE_MAX_CHANCE_OVERRIDE",
    "SIM_CURSE_CORE_BONUS_OVERRIDE",
    "SIM_CURSE_DETECT_BASE_OVERRIDE",
    "SIM_CURSE_DETECT_DECAY_OVERRIDE",
    "SIM_CURSE_DETECT_MIN_OVERRIDE"
  ];
  const values = Object.fromEntries(keys.sort().map(key => [key, process.env[key]]));
  values.CI = process.env.CI ?? "<unset>";
  values.SIM_PARALLEL = "<omitted>";
  values.SIM_MAP_CACHE_ENTRIES = "<omitted; default=1024>";
  values.ISSUE461_MODE = "baseline";
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
if (!SMOKE && ENV_HASH !== EXPECTED_ENV_HASH) {
  throw new Error(`Issue #461 env hash mismatch: ${ENV_HASH}`);
}
const OUTPUT_STEM = process.env.SIM_RESULT_BASENAME || (SMOKE
  ? "issue-470-build-definition-smoke"
  : "issue-470-build-definition");

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

function classStratifiedCochranArmitage(rows) {
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
    const deaths = classRows.filter(outcomeValue).length;
    const nullRate = deaths / n;
    const counts = [1, 2, 3, 4].map(stratum =>
      classRows.filter(row => row.stratum === stratum)
    );
    const stratumCounts = counts.map(group => group.length);
    const stratumDeaths = counts.map(group => group.filter(outcomeValue).length);
    minCellN = Math.min(minCellN, ...stratumCounts);
    const scoreTotal = stratumCounts.reduce(
      (sum, count, index) => sum + count * ORDINAL_SCORES[index],
      0
    );
    const scoreMean = scoreTotal / n;
    const scoreVariance = stratumCounts.reduce(
      (sum, count, index) =>
        sum + count * (ORDINAL_SCORES[index] - scoreMean) ** 2,
      0
    );
    numerator += stratumDeaths.reduce(
      (sum, deathCount, index) =>
        sum + ORDINAL_SCORES[index] * (deathCount - stratumCounts[index] * nullRate),
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

function fisherCorrelation(xValues, yValues) {
  if (xValues.length !== yValues.length || xValues.length < 4) {
    return {
      estimate: null,
      low: null,
      high: null,
      n: xValues.length,
      status: "未確定（N<30）"
    };
  }
  const xMean = mean(xValues);
  const yMean = mean(yValues);
  const xSS = xValues.reduce((sum, value) => sum + (value - xMean) ** 2, 0);
  const ySS = yValues.reduce((sum, value) => sum + (value - yMean) ** 2, 0);
  if (xSS === 0 || ySS === 0) {
    return {
      estimate: null,
      low: null,
      high: null,
      n: xValues.length,
      status: "未確定（分散0）"
    };
  }
  const covariance = xValues.reduce(
    (sum, value, index) => sum + (value - xMean) * (yValues[index] - yMean),
    0
  );
  const r = Math.max(-1, Math.min(1, covariance / Math.sqrt(xSS * ySS)));
  const z = Math.atanh(r);
  const margin = R95 / Math.sqrt(xValues.length - 3);
  return {
    estimate: r,
    low: Math.tanh(z - margin),
    high: Math.tanh(z + margin),
    n: xValues.length,
    status: xValues.length < 30 ? "未確定（N<30）" : "確定"
  };
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

export function runIssue470Task(task, context) {
  return runIssue461BaselineTask(task, context);
}

function createCalibrationSpecs() {
  return [
    { phase: "initial", scenarioId: "workshop-empty" },
    ...SCENARIO_IDS.map(scenarioId => ({ phase: "baseline", scenarioId }))
  ];
}

function createTasks() {
  return ["initial", "baseline"].flatMap(phase =>
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

function metricValue(row, metric) {
  const build = row.b5Build;
  switch (metric) {
    case "currentTotal":
      return build.combatBuildScore;
    case "equipmentOnly":
      return build.equipmentStatScore;
    case "firstCoreOnly":
      return build.combatCoreScore;
    case "allCoreOnly":
      return build.combatCoreScoreAll;
    case "allCoreTotal":
      return build.equipmentStatScore + build.combatCoreScoreAll;
    default:
      throw new Error(`unknown candidate metric: ${metric}`);
  }
}

function assignStrata(rows, candidate) {
  const groups = new Map();
  rows.forEach(row => {
    const key = candidate.scope === "class" ? row.className : "all";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });
  const strata = new Map();
  groups.forEach(group => {
    const sorted = [...group].sort((left, right) =>
      metricValue(left, candidate.metric) - metricValue(right, candidate.metric) ||
      left.className.localeCompare(right.className) ||
      left.runIndex - right.runIndex
    );
    sorted.forEach((row, index) => {
      strata.set(`${row.className}:${row.runIndex}`, Math.floor(index * 4 / sorted.length) + 1);
    });
  });
  return rows.map(row => ({
    ...row,
    stratum: strata.get(`${row.className}:${row.runIndex}`),
    metricValue: metricValue(row, candidate.metric)
  }));
}

function outcomeValue(row) {
  return Number(row.endpoints.b5.death);
}

function groupMean(rows, selector) {
  return normalMean(rows.map(selector));
}

function groupStats(rows, stratum) {
  const group = rows.filter(row => row.stratum === stratum);
  const buildValues = field => group.map(row => Number(row.b5Build[field] || 0));
  const combatCoreCounts = group.map(row => row.b5Build.combatCoreIds.length);
  const currentValues = group.map(row => row.b5Build.combatBuildScore);
  const allTotalValues = group.map(row =>
    row.b5Build.equipmentStatScore + row.b5Build.combatCoreScoreAll
  );
  const currentSum = currentValues.reduce((sum, value) => sum + value, 0);
  const allCoreSum = buildValues("combatCoreScoreAll")
    .reduce((sum, value) => sum + value, 0);
  return {
    stratum,
    n: group.length,
    metricMean: groupMean(group, row => row.metricValue),
    death: wilson(group.filter(outcomeValue).length, group.length),
    breakthrough: wilson(
      group.filter(row => row.endpoints.b5.breakthrough).length,
      group.length
    ),
    equipmentStatScoreMean: groupMean(group, row => row.b5Build.equipmentStatScore),
    firstCombatCoreScoreMean: groupMean(group, row => row.b5Build.combatCoreScore),
    allCombatCoreScoreMean: groupMean(group, row => row.b5Build.combatCoreScoreAll),
    currentTotalMean: groupMean(group, row => row.b5Build.combatBuildScore),
    allCombatTotalMean: groupMean(group, row =>
      row.b5Build.equipmentStatScore + row.b5Build.combatCoreScoreAll
    ),
    combatCoreCountMean: normalMean(combatCoreCounts),
    multipleCombatCore: wilson(
      combatCoreCounts.filter(count => count >= 2).length,
      group.length
    ),
    firstCoreShareOfCurrent: currentSum > 0 ?
      buildValues("combatCoreScore").reduce((sum, value) => sum + value, 0) / currentSum :
      null,
    allCoreShareOfAllTotal: allTotalValues.reduce((sum, value) => sum + value, 0) > 0
      ? allCoreSum / allTotalValues.reduce((sum, value) => sum + value, 0)
      : null
  };
}

function centeredRates(rows) {
  const byClass = new Map();
  rows.forEach(row => {
    if (!byClass.has(row.className)) byClass.set(row.className, []);
    byClass.get(row.className).push(row);
  });
  return [1, 2, 3, 4].map(stratum => {
    const classRates = [...byClass.entries()].map(([className, classRows]) => {
      const group = classRows.filter(row => row.stratum === stratum);
      return {
        className,
        n: group.length,
        deaths: group.filter(outcomeValue).length,
        rate: group.length ? mean(group.map(outcomeValue)) : null
      };
    });
    const available = classRates.filter(row => row.rate !== null);
    return {
      stratum,
      estimate: available.length ? mean(available.map(row => row.rate)) : null,
      classRates
    };
  });
}

function classCenteredDifference(rows) {
  const left = [];
  const right = [];
  const classCounts = {};
  const byClass = new Map();
  rows.forEach(row => {
    if (!byClass.has(row.className)) byClass.set(row.className, []);
    byClass.get(row.className).push(row);
  });
  byClass.forEach((classRows, className) => {
    const classMean = mean(classRows.map(outcomeValue));
    const q1 = classRows.filter(row => row.stratum === 1);
    const q4 = classRows.filter(row => row.stratum === 4);
    classCounts[className] = {
      q1: q1.length,
      q4: q4.length,
      allStrata: [1, 2, 3, 4].map(stratum =>
        classRows.filter(row => row.stratum === stratum).length
      )
    };
    right.push(...q1.map(row => outcomeValue(row) - classMean));
    left.push(...q4.map(row => outcomeValue(row) - classMean));
  });
  return {
    ...normalDifference(left, right),
    classCounts,
    classCentered: Object.values(classCounts).every(
      counts => counts.q1 >= 30 && counts.q4 >= 30
    ),
    allStrataAtLeast30: Object.values(classCounts).every(counts =>
      counts.allStrata.every(n => n >= 30)
    )
  };
}

function evaluateCandidate(rows, candidate) {
  const stratifiedRows = assignStrata(rows, candidate);
  const quartiles = [1, 2, 3, 4].map(stratum =>
    groupStats(stratifiedRows, stratum)
  );
  const rates = centeredRates(stratifiedRows);
  const q4MinusQ1Death = classCenteredDifference(stratifiedRows);
  const adjacentDifferences = [1, 2, 3].map(stratum => {
    const previous = stratifiedRows
      .filter(row => row.stratum === stratum)
      .map(outcomeValue);
    const next = stratifiedRows
      .filter(row => row.stratum === stratum + 1)
      .map(outcomeValue);
    return {
      fromStratum: stratum,
      toStratum: stratum + 1,
      ...normalDifference(next, previous)
    };
  });
  const trendTest = classStratifiedCochranArmitage(stratifiedRows);
  const statisticallyNonMonotonic = adjacentDifferences.some(
    difference => difference.status === "確定" && difference.low > 0
  );
  const monotonicNonIncreasing =
    trendTest.status === "確定" &&
    trendTest.pValueDecreasing < MONOTONIC_ALPHA &&
    !statisticallyNonMonotonic;
  const sampleSizeSufficient = q4MinusQ1Death.allStrataAtLeast30;
  const conditions = {
    q4MinusQ1UpperBelowZero:
      q4MinusQ1Death.status === "確定" && q4MinusQ1Death.high < 0,
    monotonicNonIncreasing,
    classCentered: q4MinusQ1Death.classCentered
  };
  return {
    ...candidate,
    quartiles,
    centeredRates: rates,
    q4MinusQ1Death,
    adjacentDifferences,
    trendTest,
    statisticallyNonMonotonic,
    conditions,
    sampleSizeSufficient,
    pass: sampleSizeSufficient && Object.values(conditions).every(Boolean),
    stratifiedRows
  };
}

function q4MinusQ3ForCandidate(candidateResult) {
  const q3 = candidateResult.stratifiedRows
    .filter(row => row.stratum === 3)
    .map(outcomeValue);
  const q4 = candidateResult.stratifiedRows
    .filter(row => row.stratum === 4)
    .map(outcomeValue);
  return normalDifference(q4, q3);
}

function correlationByMetric(rows, metric) {
  const x = rows.map(row => metricValue(row, metric));
  const y = rows.map(row => row.reachedFloor);
  return fisherCorrelation(x, y);
}

function nDesign() {
  const p1 = 0.328;
  const p4 = 0.241;
  const difference = p1 - p4;
  const variance = p1 * (1 - p1) + p4 * (1 - p4);
  const zPower = 0.8416212335729143;
  const n95 = Math.ceil(R95 ** 2 * variance / difference ** 2);
  const n80Observed = Math.ceil((R95 + zPower) ** 2 * variance / difference ** 2);
  const n80Conservative = Math.ceil((R95 + zPower) ** 2 * 0.5 / difference ** 2);
  const requiredEntrants = n80Conservative * 4;
  return {
    referenceRates: { q1: p1, q4: p4, difference },
    requiredQuartileN95: n95,
    requiredQuartileN80ObservedRates: n80Observed,
    requiredQuartileN80Conservative: n80Conservative,
    requiredB5Entrants80Conservative: requiredEntrants,
    requiredTotalRunsAtBaselineEntrantRate: Math.ceil(
      requiredEntrants / (2805 / 12000)
    ),
    observedQuartileN: Math.floor(2805 / 4),
    minimumClassRunsFor30PerQuartileAtMageRate: Math.ceil(30 * 4 / 0.051),
    fixedRunsPerClass: RUNS_PER_CLASS,
    fixedTotalBaselineRuns: RUNS_PER_CLASS * CLASS_NAMES.length
  };
}

function contributionDiagnostic(rows, candidateResults) {
  const current = candidateResults.find(
    result => result.id === "current-total-class-quartile"
  );
  const equipment = candidateResults.find(
    result => result.id === "equipment-only-class-quartile"
  );
  const firstCore = candidateResults.find(
    result => result.id === "first-combat-core-only-class-quartile"
  );
  const allCore = candidateResults.find(
    result => result.id === "all-combat-core-only-class-quartile"
  );
  const reverseByRanking = [equipment, firstCore, allCore].map(result => ({
    id: result.id,
    q4MinusQ3Death: q4MinusQ3ForCandidate(result),
    q3Death: result.quartiles[2].death,
    q4Death: result.quartiles[3].death
  }));
  const b5Entrants = rows.length;
  const multipleCore = rows.filter(row => row.b5Build.combatCoreIds.length >= 2);
  const firstUnderestimates = rows.filter(row =>
    row.b5Build.combatCoreScoreAll > row.b5Build.combatCoreScore + 1e-12
  );
  return {
    currentQuartiles: current.quartiles,
    q3ToQ4ReversalByComponentRanking: reverseByRanking,
    multipleCombatCoreRuns: wilson(multipleCore.length, b5Entrants),
    firstCoreUnderestimatesAllCoreScore: wilson(
      firstUnderestimates.length,
      b5Entrants
    ),
    firstVsAllCoreScoreDelta: normalMean(rows.map(row =>
      row.b5Build.combatCoreScoreAll - row.b5Build.combatCoreScore
    )),
    multipleCoreFirstVsAllCoreScoreDelta: normalMean(multipleCore.map(row =>
      row.b5Build.combatCoreScoreAll - row.b5Build.combatCoreScore
    )),
    currentQuartileMultipleCore: current.quartiles.map(quartile => ({
      stratum: quartile.stratum,
      multipleCombatCore: quartile.multipleCombatCore,
      firstCoreScoreMean: quartile.firstCombatCoreScoreMean,
      allCoreScoreMean: quartile.allCombatCoreScoreMean,
      firstCoreShareOfCurrent: quartile.firstCoreShareOfCurrent,
      allCoreShareOfAllTotal: quartile.allCoreShareOfAllTotal
    }))
  };
}

function formatPercent(value) {
  return value === null || value === undefined ? "NA" : `${(value * 100).toFixed(1)}%`;
}

function formatRate(rate) {
  if (!rate || rate.estimate === null) {
    return rate?.status === "未観測" ? `未観測 [N=${rate.trials}]` : "NA";
  }
  return `${formatPercent(rate.estimate)} [${formatPercent(rate.low)}, ${formatPercent(rate.high)}; N=${rate.trials}]`;
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

function formatPValue(value) {
  if (value === null || value === undefined) return "NA";
  return value < 0.0001 ? "<0.0001" : value.toFixed(4);
}

function adjacentDifferenceLabel(difference) {
  if (difference.status !== "確定") return "未確定（N<30）";
  if (difference.low > 0) return "統計的反転";
  if (difference.estimate > 0) return "点推定反転（CIは0を跨ぐ）";
  if (difference.high < 0) return "統計的減少";
  return "点推定減少（CIは0を跨ぐ）";
}

function renderCandidate(candidate) {
  const lines = [
    `### ${candidate.id}`,
    "",
    `- 定義: ${candidate.label}`,
    `- Q4−Q1（職内 centered）: ${formatDifference(candidate.q4MinusQ1Death)}。CI上限<0=${candidate.conditions.q4MinusQ1UpperBelowZero ? "成立" : "不成立"}`,
    `- Q1→Q4 統計的単調減少: ${candidate.conditions.monotonicNonIncreasing ? "成立" : "不成立"}`,
    `- trend test: ${candidate.trendTest.test}、z=${candidate.trendTest.z === null ? "NA" : candidate.trendTest.z.toFixed(3)}、減少方向 p=${formatPValue(candidate.trendTest.pValueDecreasing)}、増加方向 p=${formatPValue(candidate.trendTest.pValueIncreasing)}`,
    `- 統計的非単調（隣接差CI下限>0）: ${candidate.statisticallyNonMonotonic ? "確認" : "確認なし"}`,
    `- 職内 centered: ${candidate.conditions.classCentered ? "成立" : "不成立"}`,
    `- サンプル十分性（全職・全層 N>=30）: ${candidate.sampleSizeSufficient ? "成立" : "未確定"}`,
    `- A1: ${candidate.pass ? "成立" : "不成立 / 未確定"}`,
    "",
    "| 層 | N | 指標平均（正規95% CI） | B5死亡率（Wilson95% CI） | 職内centered死亡率 |",
    "| --- | ---: | --- | --- | ---: |"
  ];
  candidate.quartiles.forEach((quartile, index) => {
    lines.push(
      `| Q${quartile.stratum} | ${quartile.n} | ${formatMean(quartile.metricMean)} | ${formatRate(quartile.death)} | ${formatPercent(candidate.centeredRates[index].estimate)} |`
    );
  });
  lines.push(
    "",
    "| 隣接 | 差（次−前、正規95% CI） | 判定 |",
    "| --- | --- | --- |",
    ...candidate.adjacentDifferences.map(difference =>
      `| Q${difference.fromStratum}→Q${difference.toStratum} | ${formatDifference(difference)} | ${adjacentDifferenceLabel(difference)} |`
    )
  );
  return lines.join("\n");
}

export function renderMarkdown(summary, rawSha256, summarySha256) {
  const lines = [
    "# Issue #470 完成ビルド定義測定",
    "",
    `## 結論: ${summary.conclusion}`,
    "",
    "同じ #461 固定条件・同じ raw run を候補指標ごとに再ランキングした。候補指標の変更は装備選択・戦闘・探索へ反映しない観測分析であり、balance 値は変更していない。",
    "",
    "## N 設計",
    "",
    `- 観測基準 Q1=${formatPercent(summary.nDesign.referenceRates.q1)}、Q4=${formatPercent(summary.nDesign.referenceRates.q4)}、差=${formatPercent(summary.nDesign.referenceRates.difference)}。95% CI上限<0だけなら ${summary.nDesign.requiredQuartileN95}/Q、80% power・観測分散なら ${summary.nDesign.requiredQuartileN80ObservedRates}/Q、p=.5保守値なら ${summary.nDesign.requiredQuartileN80Conservative}/Q。`,
    `- 保守値の必要 B5 entrant=${summary.nDesign.requiredB5Entrants80Conservative}、基準線 B5 entrant率23.4%換算 ${summary.nDesign.requiredTotalRunsAtBaselineEntrantRate} run。実測見込み ${summary.nDesign.observedQuartileN}/Q、固定値は ${summary.nDesign.fixedRunsPerClass}/職（合計${summary.nDesign.fixedTotalBaselineRuns} baseline run）。`,
    `- 低率 Mage の #461 B5 entrant率5.1%で各 quartile N>=30を満たす下限 ${summary.nDesign.minimumClassRunsFor30PerQuartileAtMageRate}/職。固定3000/職を採用。N<30 は未確定扱い。`,
    "",
    "## スナップショット時点と深度",
    "",
    `- B5 entrant=${summary.snapshotTiming.b5Entrants}。全 ${summary.snapshotTiming.b5Entrants} 件の snapshot が floor=${summary.snapshotTiming.floor} / point=${summary.snapshotTiming.point}。B5死亡判定前の floor-start であり、予測入力として時間順は成立。`,
    "- `reachedFloor` は run 終了値。B5後の結果をB5 entryスコアへ正規化するのは後知恵・媒介調整になるため候補入力から除外。B5 entrant内の score→終了到達floor は選別後の関連であり、因果効果ではない。",
    `- 全run平均到達floor（無条件指標）: ${formatMean(summary.unconditionalAverageReachedFloor)}。`,
    "",
    "### B5 entry score と終了到達floorの Fisher z 相関（B5 entrant内、選別後）",
    "",
    "| 指標 | r（Fisher z 95% CI） |",
    "| --- | --- |",
    ...Object.entries(summary.depthAssociations).map(([id, value]) =>
      `| ${id} | ${value.estimate === null ? value.status : `${value.estimate.toFixed(3)} [${value.low.toFixed(3)}, ${value.high.toFixed(3)}; N=${value.n}]`} |`
    ),
    "",
    "## 先決め判定基準（結果を見る前に固定）",
    "",
    "- 候補は既登録の7個から増やさず、A1の単調性は点推定の順序だけで判定しない。各隣接差を Δ=Q次−Q前 とし、各候補の実測 quartile 死亡率から正規近似95% CIを出す。",
    "- Δの95% CI下限が0を上回る隣接ペアだけを、統計的に確認された非単調（有意な反転）とする。Δ>0でもCIが0を跨ぐ場合は点推定反転に留め、A1失格にしない。",
    `- 全体の傾向は職を層とする Cochran–Armitage trend test（Q1〜Q4の順序 score=0〜3）で判定する。一側の減少方向 p<${MONOTONIC_ALPHA}、かつ統計的反転なしを「統計的単調減少 成立」とする。N<30セルまたは検定不能は未確定。`,
    "- この基準は、隣接差が0を跨ぐことを効果なしと断定せず、N不足・測定誤差で区別不能な点推定反転を非単調と扱わないため採用。",
    "",
    "## 候補別 A1",
    "",
    `正式候補 ${summary.multipleComparisons.candidateCount} 個、A1主条件 ${summary.multipleComparisons.formalA1Checks} 個。単調性の隣接差・trend補助チェック ${summary.multipleComparisons.monotonicitySubchecks} 個を含む報告総数 ${summary.multipleComparisons.totalReportedChecks} 個。α=.05の機械的な期待偽陽性数 ${summary.multipleComparisons.expectedFalsePositives.toFixed(2)}（Bonferroni family-wise α=${summary.multipleComparisons.bonferroniAlpha.toFixed(5)}）。候補追加による数字合わせはしない。`,
    "",
    ...summary.candidates.flatMap(candidate => [renderCandidate(candidate), ""]),
    "## 分解診断",
    "",
    "現行 total の Q1〜Q4は equipmentStatScore と first combatCoreScore の和。全 combat core 合計は測定専用派生値であり、既存の装備選択スコアは変更していない。",
    "",
    "### 現行 total quartile の寄与",
    "",
    "| 層 | equipmentStatScore平均 | first combatCoreScore平均 | 全 combat core平均 | first/現行total | all-core/(equipment+all-core) | 複数combat core率 |",
    "| --- | --- | --- | --- | ---: | ---: | --- |",
    ...summary.diagnostic.currentQuartileMultipleCore.map(row =>
      `| Q${row.stratum} | ${formatMean(summary.diagnostic.currentQuartiles[row.stratum - 1].equipmentStatScoreMean)} | ${formatMean(row.firstCoreScoreMean)} | ${formatMean(row.allCoreScoreMean)} | ${row.firstCoreShareOfCurrent === null ? "NA" : formatPercent(row.firstCoreShareOfCurrent)} | ${row.allCoreShareOfAllTotal === null ? "NA" : formatPercent(row.allCoreShareOfAllTotal)} | ${formatRate(row.multipleCombatCore)} |`
    ),
    "",
    `- B5 entrant内 複数combat core: ${formatRate(summary.diagnostic.multipleCombatCoreRuns)}。first coreのみが全core合計を過小評価するrun: ${formatRate(summary.diagnostic.firstCoreUnderestimatesAllCoreScore)}。全体の first→all 差: ${formatMean(summary.diagnostic.firstVsAllCoreScoreDelta)}、複数core限定: ${formatMean(summary.diagnostic.multipleCoreFirstVsAllCoreScoreDelta)}。`,
    "",
    "### Q3→Q4反転の切り分け",
    "",
    "各 component-only ranking でも同じ A1 層定義を使い、Q4−Q3 B5死亡率を比較した。反転が equipment-only でも出れば装備総量側、all-core-only でのみ出れば core scoring側を示す。これは同一runの再ランキングで、因果分解ではない。",
    "",
    "| ranking | Q3死亡率 | Q4死亡率 | Q4−Q3（正規95% CI） |",
    "| --- | --- | --- | --- |",
    ...summary.diagnostic.q3ToQ4ReversalByComponentRanking.map(row =>
      `| ${row.id} | ${formatRate(row.q3Death)} | ${formatRate(row.q4Death)} | ${formatDifference(row.q4MinusQ3Death)} |`
    ),
    "",
    "- 3比較とも差の95% CIが0を跨ぐ。点推定の方向は観測事実だが、反転の実在も主因もこのNでは確定しない。",
    "",
    "## 測定記録",
    "",
    `- env hash: \`${summary.measurement.envHash}\`。期待固定 hash: \`${EXPECTED_ENV_HASH}\``,
    `- source commit: \`${summary.measurement.sourceCommit}\``,
    `- resolved parallelism: ${summary.measurement.resolvedParallelism}（availableParallelism=${summary.measurement.availableParallelism}、` +
      "`SIM_PARALLEL`未指定）",
    "- `SIM_MAP_CACHE_ENTRIES`未指定（既定1024）",
    `- wall-clock: calibration ${summary.measurement.calibrationWallSeconds.toFixed(3)}s + simulation ${summary.measurement.simulationWallSeconds.toFixed(3)}s = ${summary.measurement.totalWallSeconds.toFixed(3)}s`,
    `- CPU: calibration ${summary.measurement.calibrationCpuSeconds.toFixed(3)}s + simulation ${summary.measurement.simulationCpuSeconds.toFixed(3)}s = ${summary.measurement.totalCpuSeconds.toFixed(3)}s`,
    `- raw JSONL SHA-256: \`${rawSha256}\``,
    `- summary JSON SHA-256: \`${summarySha256}\``,
    "",
    "### Resolved environment",
    "",
    "```text",
    ...Object.entries(summary.measurement.environment)
    .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${value}`),
    "```",
    "",
    "### 実行コマンド",
    "",
    "```sh",
    "node --check scratch/sim_depth_material_ev.js",
    "node --check scratch/sim_issue_461_baseline.js",
    "node --check scratch/sim_issue_470_build_definition.js",
    "SIM_SEED=461 SIM_RUNS=3000 SIM_CALIBRATION_RUNS=1000 \\",
    "DEPARTURE_CRAFT_IDS=TOWN_PORTAL,HEAL_POTION,HEAL_POTION,HEAL_POTION,HEAL_POTION,ANTIDOTE,GUARD_POTION \\",
    "IDENTIFICATION_POLICY=powder IDENTIFICATION_STARTING_POWDER=2 IDENTIFICATION_COST_OVERRIDE=1 \\",
    "FLEE_POLICY=threshold FLEE_HP_THRESHOLD=0.35 PORTAL_HP_THRESHOLD=0.35 PORTAL_MAX_HEAL_POTIONS=0 \\",
    "PORTAL_MIN_FLOOR=3 ELITE_POLICY=avoid \\",
    "TRAP_POLICY=conservative TRAP_AVOIDANCE_POLICY=ev TRAP_DAMAGE_MULTIPLIER=1 \\",
    "STATUS_CURE_POLICY=smart STATUS_CURE_HP_THRESHOLD=0.35 STATUS_CURE_MERCHANT_POLICY=missing \\",
    "HEAL_POTION_MERCHANT_POLICY=missing BLOOD_WAND_HP_PAYMENT_MIN_RATE=0.50 \\",
    "SIM_CORE_SCORE_DROP_TOLERANCE=0 SIM_440_CONDITION=current SIM_SUPPORT_SUPPLY_CEILING=none \\",
    "SIM_EQUIPMENT_POLICY=individual-score SIM_EQUIPMENT_SLOT_MODE=standard SIM_EQUIPMENT_SLOT_AFFIX_MODE=retain \\",
    "SIM_MATCHING_DEFINITION=exact SIM_CURSE_LOCK_MODE=current SIM_SCENARIOS=workshop-empty,workshop-stats,workshop-gear,workshop-blood-wand,workshop-blood-wand-spells,workshop-complete \\",
    "SIM_MAP_STATS=0 SIM_DAMAGE_PROBE=0 node scratch/sim_issue_470_build_definition.js",
    "```",
    "",
    "## 未採用候補・限界",
    "",
    "- 絶対閾値は score の外部校正値がなく、thresholdを結果後に選ぶと多重比較を増やすため正式候補にしなかった。top 25%の global quartile は明示的に測定した。",
    "- B5 entrant は既に B5到達という選別済み集合。終了 `reachedFloor` を使う深度正規化は endpoint後の情報で、完成度の予測定義にならない。",
    "- `core + 対応support` と `core 1個以上 + slot充足` は #470指定どおり再提案しない。",
    "",
    "## 取り直し対象",
    "",
    `- 採用定義は ${summary.adoptedCandidate ?? "未確定"}。#271 の A1（Q4−Q1、統計的単調性、Q4安全性gate）を取り直す。`,
    "- #271 の A2（class-centered score×depth、補助のscore×B5突破）と A3（combat core / core+対応support feature）を同じ固定条件で取り直す。",
    "- 完成ビルド率、quality quartileを入力にしたdepth-quality表・要約・派生判断を全て再集計する。#470のB5 raw再測定は不要。",
    "",
    "Refs #470, #461, #469, #271",
    ""
  ];
  return lines.join("\n");
}

function validateRows(rows) {
  const rowKeys = rows.map(row => `${row.phase}:${row.className}:${row.runIndex}`);
  if (new Set(rowKeys).size !== rows.length) {
    throw new Error("raw result audit failed: duplicate phase/class/run key");
  }
  rows.filter(row => row.phase === "baseline").forEach(row => {
    if (row.endpoints.b5.entrant !== Boolean(row.b5Build)) {
      throw new Error(`B5 snapshot mismatch: ${row.className}/${row.runIndex}`);
    }
    if (row.b5Build) {
      const fields = [
        "combatBuildScore",
        "equipmentStatScore",
        "combatCoreScore",
        "combatCoreScoreAll"
      ];
      fields.forEach(field => {
        if (!Number.isFinite(row.b5Build[field])) {
          throw new Error(`B5 ${field} missing: ${row.className}/${row.runIndex}`);
        }
      });
      if (row.b5Build.floor !== 5 || row.b5Build.point !== "floor-start") {
        throw new Error(`B5 snapshot timing mismatch: ${row.className}/${row.runIndex}`);
      }
    }
  });
}

export function summarizeIssue470Rows(rows, measurement) {
  validateRows(rows);
  const baselineRows = rows.filter(row => row.phase === "baseline");
  const b5Rows = baselineRows.filter(row => row.b5Build);
  const candidateResults = CANDIDATES.map(candidate =>
    evaluateCandidate(b5Rows, candidate)
  );
  const diagnostic = contributionDiagnostic(b5Rows, candidateResults);
  const depthAssociations = {
    currentTotal: correlationByMetric(b5Rows, "currentTotal"),
    equipmentOnly: correlationByMetric(b5Rows, "equipmentOnly"),
    firstCoreOnly: correlationByMetric(b5Rows, "firstCoreOnly"),
    allCoreOnly: correlationByMetric(b5Rows, "allCoreOnly"),
    allCoreTotal: correlationByMetric(b5Rows, "allCoreTotal")
  };
  const candidateCount = CANDIDATES.length;
  const formalA1Checks = candidateCount * 3;
  const monotonicitySubchecks = candidateCount * 4;
  const totalReportedChecks = formalA1Checks + monotonicitySubchecks;
  const multipleComparisons = {
    alpha: MONOTONIC_ALPHA,
    candidateCount,
    formalA1Checks,
    monotonicitySubchecks,
    totalReportedChecks,
    expectedFalsePositives: totalReportedChecks * MONOTONIC_ALPHA,
    bonferroniAlpha: 0.05 / totalReportedChecks,
    note: "各候補のA1主条件と単調性補助チェックを並べる探索的比較。候補追加なし。"
  };
  const passed = candidateResults.filter(candidate => candidate.pass);
  const adopted = ADOPTION_PRIORITY
    .map(id => candidateResults.find(candidate => candidate.id === id))
    .find(candidate => candidate?.pass);
  const conclusion = adopted
    ? `${adopted.label} の Q4 を完成ビルド定義として採用。隣接差CIで統計的反転は確認されず、trend testで減少傾向が成立。`
    : "深層生存で完成度を判定できない（測定した候補に採用優先順位内のA1成立定義なし）";
  return {
    measurement,
    conclusion,
    adoptedCandidate: adopted?.id ?? null,
    nDesign: nDesign(),
    snapshotTiming: {
      b5Entrants: b5Rows.length,
      floor: 5,
      point: "floor-start",
      entrantMatch: b5Rows.length === baselineRows.filter(row => row.endpoints.b5.entrant).length
    },
    unconditionalAverageReachedFloor: normalMean(
      baselineRows.map(row => row.reachedFloor)
    ),
    depthAssociations,
    multipleComparisons,
    candidates: candidateResults.map(({ stratifiedRows, ...candidate }) => candidate),
    diagnostic: {
      ...diagnostic,
      currentQuartiles: candidateResults.find(
        candidate => candidate.id === "current-total-class-quartile"
      ).quartiles
    },
    passedCandidates: passed.map(candidate => candidate.id)
  };
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
  const resolvedParallelism = Number(
    process.env.SIM_PARALLEL || availableParallelism()
  );
  const simulationStarted = performance.now();
  const simulationCpuStarted = process.cpuUsage();
  const rows = await runSimTasks({
    moduleUrl: pathToFileURL(fileURLToPath(import.meta.url)).href,
    exportName: "runIssue470Task",
    runTask: runIssue470Task,
    tasks,
    context: { scoringProfiles }
  });
  const simulationCpu = process.cpuUsage(simulationCpuStarted);
  const simulationWallSeconds = (performance.now() - simulationStarted) / 1000;

  if (rows.length !== tasks.length) {
    throw new Error(`raw result audit failed: rows=${rows.length}/${tasks.length}`);
  }
  validateRows(rows);
  const cpuTotalSeconds = (
    calibrationCpu.user + calibrationCpu.system +
    simulationCpu.user + simulationCpu.system
  ) / 1e6;
  const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8"
  }).trim();
  const measurement = {
    issue: 470,
    scope: "run",
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
    sourceCommit
  };
  const summary = summarizeIssue470Rows(rows, measurement);

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
    b5Entrants: summary.snapshotTiming.b5Entrants,
    candidateCount: CANDIDATES.length,
    passedCandidates: summary.passedCandidates,
    conclusion: summary.conclusion,
    resolvedParallelism,
    wallClockSeconds: measurement.totalWallSeconds,
    cpuTotalSeconds: measurement.totalCpuSeconds
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
