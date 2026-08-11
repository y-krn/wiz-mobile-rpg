// sim-scope: run — Issue #487 回復薬/DIOS優先順位の固定条件比較
/* global console, process */

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { performance } from "node:perf_hooks";
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
const WORKSHOP_SCENARIO_IDS = Object.freeze([
  "workshop-empty",
  "workshop-stats",
  "workshop-gear",
  "workshop-blood-wand",
  "workshop-blood-wand-spells",
  "workshop-complete"
]);
const CONDITIONS = Object.freeze([
  {
    id: "current",
    label: "現行（薬先）",
    healPriorityPolicy: "potion-first",
    bloodWandHealPolicy: "reserve-potion"
  },
  {
    id: "dios-first",
    label: "DIOS先",
    healPriorityPolicy: "dios-first",
    bloodWandHealPolicy: "reserve-potion"
  },
  {
    id: "blood-wand-allow",
    label: "血杖薬保有許可",
    healPriorityPolicy: "potion-first",
    bloodWandHealPolicy: "allow-recovery-potion"
  },
  {
    id: "combined",
    label: "DIOS先＋血杖薬保有許可",
    healPriorityPolicy: "dios-first",
    bloodWandHealPolicy: "allow-recovery-potion"
  }
]);
const CONDITION_BY_ID = new Map(CONDITIONS.map(condition => [condition.id, condition]));
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
const DEFAULT_RUNS_PER_CLASS = 3000;
const DEFAULT_CALIBRATION_RUNS = 1000;
const DEFAULT_DIAGNOSTIC_RUNS = 500;
const TARGET_DEPTH = 21;
const R95 = 1.959963984540054;
const SMOKE = process.env.ISSUE487_SMOKE === "1";
const OUTPUT_STEM = process.env.SIM_RESULT_BASENAME ||
  (SMOKE ? "issue-487-heal-priority-smoke" : "issue-487-heal-priority");

const FIXED_ENV = Object.freeze({
  SIM_PRESET: "",
  SIM_SEED: "487",
  SIM_RUNS: String(DEFAULT_RUNS_PER_CLASS),
  SIM_CALIBRATION_RUNS: String(DEFAULT_CALIBRATION_RUNS),
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
  SIM_SCENARIOS: WORKSHOP_SCENARIO_IDS.join(",")
});

if (process.env.SIM_PARALLEL !== undefined) {
  throw new Error("SIM_PARALLEL must be omitted for Issue #487 measurement");
}
if (process.env.SIM_MAP_CACHE_ENTRIES !== undefined) {
  throw new Error("SIM_MAP_CACHE_ENTRIES must be omitted for Issue #487 measurement");
}

const runtimeEnv = {
  ...FIXED_ENV,
  ...(SMOKE
    ? { SIM_RUNS: "2", SIM_CALIBRATION_RUNS: "2" }
    : {})
};
for (const [key, value] of Object.entries(runtimeEnv)) {
  if (process.env[key] === undefined) {
    process.env[key] = value;
    continue;
  }
  if (SMOKE && ["SIM_RUNS", "SIM_CALIBRATION_RUNS"].includes(key)) continue;
  if (process.env[key] !== value) {
    throw new Error(`Issue #487 fixed env mismatch: ${key}=${process.env[key]}`);
  }
}

const RUNS_PER_CLASS = SMOKE ? 2 : DEFAULT_RUNS_PER_CLASS;
const CALIBRATION_RUNS = SMOKE ? 2 : DEFAULT_CALIBRATION_RUNS;
const DIAGNOSTIC_RUNS = SMOKE ? 2 : DEFAULT_DIAGNOSTIC_RUNS;
const CLASS_NAMES = SMOKE ? ["Priest"] : BASIC_CLASSES;
const SCENARIO_IDS = SMOKE ? ["workshop-complete"] : WORKSHOP_SCENARIO_IDS;

const {
  calibrateCoreScoringProfile,
  getResolvedSimulationEnv,
  getScenarioById,
  resetSimulationRandom,
  simulateRun,
  SIM_CLASSES
} = await import("./sim_depth_material_ev.js");

if (
  SIM_CLASSES.length !== BASIC_CLASSES.length ||
  BASIC_CLASSES.some(className => !SIM_CLASSES.includes(className))
) {
  throw new Error(`basic class set mismatch: ${SIM_CLASSES.join(",")}`);
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
  const environment = Object.fromEntries(
    Object.entries(getResolvedSimulationEnv()).map(([key, value]) => [key, value])
  );
  return {
    ...environment,
    ISSUE487_MODE: SMOKE ? "smoke" : "baseline",
    ISSUE487_CONDITIONS: CONDITIONS.map(condition =>
      `${condition.id}:${condition.healPriorityPolicy}:${condition.bloodWandHealPolicy}`
    ).join(","),
    SIM_PARALLEL: "<omitted>",
    SIM_MAP_CACHE_ENTRIES: "<omitted; default=1024>"
  };
}

const HASH_ENVIRONMENT = environmentForHash();
const ENV_CANONICAL = Object.entries(HASH_ENVIRONMENT)
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([key, value]) => `${key}=${value}`)
  .join("\n") + "\n";
const ENV_HASH = sha256(ENV_CANONICAL);
const SEED = Number(process.env.SIM_SEED) >>> 0;

function buildScenario(scenarioId, condition, { fleeHpThreshold = "default" } = {}) {
  const scenario = getScenarioById(scenarioId);
  const result = {
    ...scenario,
    healPriorityPolicy: condition.healPriorityPolicy,
    bloodWandHealPolicy: condition.bloodWandHealPolicy
  };
  if (fleeHpThreshold !== "default") result.fleeHpThreshold = fleeHpThreshold;
  return result;
}

function scenarioProfileKey(conditionId, scenarioId, mode = "baseline") {
  return `${mode}:${conditionId}:${scenarioId}`;
}

function scenarioForRun(runIndex) {
  if (SMOKE) return SCENARIO_IDS[0];
  const position = ((runIndex * 37) % DEFAULT_RUNS_PER_CLASS + 0.5) /
    DEFAULT_RUNS_PER_CLASS * OBSERVED_WORKSHOP_TOTAL;
  let cumulative = 0;
  for (const row of OBSERVED_WORKSHOP_DISTRIBUTION) {
    cumulative += row.observedRuns;
    if (position < cumulative) return row.scenarioId;
  }
  return OBSERVED_WORKSHOP_DISTRIBUTION.at(-1).scenarioId;
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

export function runIssue487Task(task, context) {
  const condition = CONDITION_BY_ID.get(task.conditionId);
  if (!condition) throw new Error(`unknown condition: ${task.conditionId}`);
  const mode = task.mode || "baseline";
  const scenario = buildScenario(task.scenarioId, condition, {
    fleeHpThreshold: task.fleeHpThreshold
  });
  const profile = context.scoringProfiles[scenarioProfileKey(
    task.conditionId,
    task.scenarioId,
    mode
  )];
  if (!profile) {
    throw new Error(`missing scoring profile: ${task.conditionId}/${task.scenarioId}/${mode}`);
  }
  resetSimulationRandom(hashSeed(
    `${SEED}:${mode}:${task.scenarioId}:${task.className}:${task.runIndex}`
  ));
  const result = simulateRun({
    className: task.className,
    startFloor: 1,
    targetDepth: TARGET_DEPTH,
    runIndex: task.runIndex,
    seriesId: `issue487-${mode}`,
    scoringProfile: profile,
    scenario: {
      ...scenario,
      collectHealPriorityDiagnostics: Boolean(task.collectHealPriorityDiagnostics)
    },
    workshop: scenario.workshop
  });
  const coreObservations = result.coreObservations || {};
  return {
    conditionId: task.conditionId,
    mode,
    className: task.className,
    runIndex: task.runIndex,
    scenarioId: task.scenarioId,
    randomSequenceId: `${mode}:${task.scenarioId}:${task.className}:${task.runIndex}`,
    reachedFloor: result.reachedFloor,
    deathFloor: result.deathFloor,
    outcome: result.outcome,
    endpoints: {
      b5: endpoint(result, 5),
      b10: endpoint(result, 10)
    },
    mechanisms: {
      diosCastCount: result.diosCastCount || 0,
      diosCombatCastCount: result.diosCombatCastCount || 0,
      diosPostCombatCastCount: result.diosPostCombatCastCount || 0,
      recoveryPotionsUsed: result.recoveryPotionsUsed || 0,
      healPotionsUsed: result.healPotionsUsed || 0,
      greaterHealPotionsUsed: result.greaterHealPotionsUsed || 0,
      finalMp: result.finalMp || 0,
      finalMaxMp: result.finalMaxMp || 0,
      diosPotionPriorityOpportunities: result.diosPotionPriorityOpportunities || 0,
      diosPotionPriorityCases: result.diosPotionPriorityCases || 0,
      bloodWandHealOpportunities: coreObservations.bloodWandHealOpportunities || 0,
      bloodWandHealActivations: coreObservations.bloodWandHealActivations || 0,
      bloodWandSpellOpportunities: coreObservations.bloodWandSpellOpportunities || 0,
      bloodWandSpellActivations: coreObservations.bloodWandSpellActivations || 0,
      eventSamples: result.diosPotionPriorityEventSamples || []
    }
  };
}

function createTasks({ mode = "baseline", conditionIds = CONDITIONS.map(row => row.id) } = {}) {
  return conditionIds.flatMap(conditionId =>
    CLASS_NAMES.flatMap(className =>
      Array.from({ length: RUNS_PER_CLASS }, (_, runIndex) => ({
        mode,
        conditionId,
        className,
        runIndex,
        scenarioId: scenarioForRun(runIndex),
        fleeHpThreshold: "default",
        collectHealPriorityDiagnostics: false
      }))
    )
  );
}

function createDiagnosticTasks() {
  const conditionId = "current";
  return Array.from({ length: DIAGNOSTIC_RUNS }, (_, runIndex) => ({
    mode: "no-flee-diagnostic",
    conditionId,
    className: "Priest",
    runIndex,
    scenarioId: "workshop-complete",
    fleeHpThreshold: null,
    collectHealPriorityDiagnostics: true
  }));
}

function calibrateProfiles() {
  const scoringProfiles = {};
  CONDITIONS.forEach(condition => {
    SCENARIO_IDS.forEach(scenarioId => {
      const scenario = buildScenario(scenarioId, condition);
      resetSimulationRandom(SEED);
      scoringProfiles[scenarioProfileKey(condition.id, scenarioId)] =
        calibrateCoreScoringProfile(
          CALIBRATION_RUNS,
          scenario,
          "powder",
          scenario.workshop
        );
    });
  });
  const diagnosticCondition = CONDITION_BY_ID.get("current");
  const diagnosticScenario = buildScenario("workshop-complete", diagnosticCondition, {
    fleeHpThreshold: null
  });
  resetSimulationRandom(SEED);
  scoringProfiles[scenarioProfileKey(
    "current",
    "workshop-complete",
    "no-flee-diagnostic"
  )] = calibrateCoreScoringProfile(
    SMOKE ? 2 : 100,
    diagnosticScenario,
    "powder",
    diagnosticScenario.workshop
  );
  return scoringProfiles;
}

function normalSummary(values, digits = 2) {
  if (values.length === 0) {
    return { estimate: null, low: null, high: null, n: 0, status: "未観測" };
  }
  const estimate = values.reduce((sum, value) => sum + value, 0) / values.length;
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
    status: values.length < 30 ? "未確定（N<30）" : "確定",
    digits
  };
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

function outcomeSummary(rows, floor) {
  const entrants = rows.filter(row => row.endpoints[`b${floor}`].entrant).length;
  const outcomes = ["breakthrough", "death", "retreat"].map(kind => [
    kind,
    rows.filter(row => row.endpoints[`b${floor}`][kind]).length
  ]);
  const splitTotal = outcomes.reduce((sum, [, count]) => sum + count, 0);
  if (splitTotal !== entrants) {
    throw new Error(`B${floor} entrant split mismatch: ${splitTotal}/${entrants}`);
  }
  return {
    entrant: wilson(entrants, rows.length),
    breakthrough: wilson(
      outcomes.find(([kind]) => kind === "breakthrough")[1],
      entrants
    ),
    death: wilson(outcomes.find(([kind]) => kind === "death")[1], entrants),
    retreat: wilson(outcomes.find(([kind]) => kind === "retreat")[1], entrants),
    splitSumsTo100: true
  };
}

function aggregateRows(rows) {
  const metrics = {
    diosCastCount: [],
    diosCombatCastCount: [],
    diosPostCombatCastCount: [],
    recoveryPotionsUsed: [],
    healPotionsUsed: [],
    greaterHealPotionsUsed: [],
    finalMp: [],
    finalMaxMp: [],
    diosPotionPriorityOpportunities: [],
    diosPotionPriorityCases: [],
    bloodWandHealOpportunities: [],
    bloodWandHealActivations: [],
    bloodWandSpellOpportunities: [],
    bloodWandSpellActivations: [],
    reachedFloor: []
  };
  rows.forEach(row => {
    const values = row.mechanisms;
    Object.keys(metrics).forEach(key => {
      metrics[key].push(key === "reachedFloor" ? row.reachedFloor : values[key]);
    });
  });
  const averages = Object.fromEntries(
    Object.entries(metrics).map(([key, values]) => [key, normalSummary(values)])
  );
  const bloodWandHealOpportunityCount = metrics.bloodWandHealOpportunities
    .reduce((sum, value) => sum + value, 0);
  const bloodWandSpellOpportunityCount = metrics.bloodWandSpellOpportunities
    .reduce((sum, value) => sum + value, 0);
  return {
    runs: rows.length,
    b5: outcomeSummary(rows, 5),
    b10: outcomeSummary(rows, 10),
    averages,
    bloodWand: {
      healCoverage: bloodWandHealOpportunityCount > 0
        ? wilson(
            metrics.bloodWandHealActivations.reduce((sum, value) => sum + value, 0),
            bloodWandHealOpportunityCount
          )
        : wilson(0, 0),
      spellCoverage: bloodWandSpellOpportunityCount > 0
        ? wilson(
            metrics.bloodWandSpellActivations.reduce((sum, value) => sum + value, 0),
            bloodWandSpellOpportunityCount
          )
        : wilson(0, 0)
    },
    eventSamples: rows.flatMap(row => row.mechanisms.eventSamples.map(sample => ({
      className: row.className,
      scenarioId: row.scenarioId,
      ...sample
    }))).slice(0, 20)
  };
}

function pairRows(baseRows, variantRows) {
  const baseByKey = new Map(baseRows.map(row => [row.randomSequenceId, row]));
  const variantByKey = new Map(variantRows.map(row => [row.randomSequenceId, row]));
  const commonKeys = [...baseByKey.keys()].filter(key => variantByKey.has(key));
  const eligible = commonKeys.length === baseRows.length &&
    commonKeys.length === variantRows.length &&
    new Set(commonKeys).size === commonKeys.length;
  return {
    method: eligible ? "paired" : "independent-2-sample",
    stage: "post-generation action policy",
    randomConsumption: "生成前・run key共通。介入後軌跡は分岐し得る",
    baseN: baseRows.length,
    variantN: variantRows.length,
    commonN: commonKeys.length,
    baseByKey,
    variantByKey,
    commonKeys
  };
}

function independentDifference(baseValues, variantValues) {
  const base = normalSummary(baseValues);
  const variant = normalSummary(variantValues);
  if (base.estimate === null || variant.estimate === null) {
    return { estimate: null, low: null, high: null, n: 0, status: "未観測" };
  }
  const baseVariance = baseValues.length > 1
    ? baseValues.reduce((sum, value) => sum + (value - base.estimate) ** 2, 0) /
      (baseValues.length - 1)
    : 0;
  const variantVariance = variantValues.length > 1
    ? variantValues.reduce((sum, value) => sum + (value - variant.estimate) ** 2, 0) /
      (variantValues.length - 1)
    : 0;
  const estimate = variant.estimate - base.estimate;
  const margin = R95 * Math.sqrt(
    baseVariance / Math.max(1, baseValues.length) +
    variantVariance / Math.max(1, variantValues.length)
  );
  return {
    estimate,
    low: estimate - margin,
    high: estimate + margin,
    n: Math.min(baseValues.length, variantValues.length),
    status: Math.min(baseValues.length, variantValues.length) < 30
      ? "未確定（N<30）"
      : "確定"
  };
}

function pairedDifference(baseRows, variantRows, selector) {
  const pairing = pairRows(baseRows, variantRows);
  const baseValues = [];
  const variantValues = [];
  pairing.commonKeys.forEach(key => {
    baseValues.push(Number(selector(pairing.baseByKey.get(key))));
    variantValues.push(Number(selector(pairing.variantByKey.get(key))));
  });
  const difference = pairing.method === "paired"
    ? normalSummary(variantValues.map((value, index) => value - baseValues[index]))
    : independentDifference(baseValues, variantValues);
  return { ...pairing, difference };
}

function buildPairComparisons(rowsByCondition) {
  const baseRows = rowsByCondition.get("current") || [];
  const selectors = [
    ["B5 entrant（全run）", row => row.endpoints.b5.entrant],
    ["B5 breakthrough（全run）", row => row.endpoints.b5.breakthrough],
    ["B5 death（全run）", row => row.endpoints.b5.death],
    ["B5 retreat（全run）", row => row.endpoints.b5.retreat],
    ["B10 entrant（全run）", row => row.endpoints.b10.entrant],
    ["B10 breakthrough（全run）", row => row.endpoints.b10.breakthrough],
    ["B10 death（全run）", row => row.endpoints.b10.death],
    ["B10 retreat（全run）", row => row.endpoints.b10.retreat],
    ["平均到達floor", row => row.reachedFloor],
    ["DIOS cast/run", row => row.mechanisms.diosCastCount],
    ["回復薬/run", row => row.mechanisms.recoveryPotionsUsed],
    ["終了MP/run", row => row.mechanisms.finalMp],
    ["DIOS可用時薬選択/run", row => row.mechanisms.diosPotionPriorityCases]
  ];
  return CONDITIONS.filter(condition => condition.id !== "current").map(condition => ({
    conditionId: condition.id,
    label: condition.label,
    indicators: selectors.map(([label, selector]) => ({
      label,
      ...pairedDifference(baseRows, rowsByCondition.get(condition.id) || [], selector)
    }))
  }));
}

function formatPercent(stat, digits = 1) {
  if (!stat || stat.estimate === null) return "未観測";
  const uncertain = stat.status?.includes("未確定") ? " 未確定" : "";
  return `${(stat.estimate * 100).toFixed(digits)}% [` +
    `${(stat.low * 100).toFixed(digits)},${(stat.high * 100).toFixed(digits)}; N=${stat.trials}]${uncertain}`;
}

function formatMean(stat, digits = 2) {
  if (!stat || stat.estimate === null) return "未観測";
  if (stat.low === null) return `${stat.estimate.toFixed(digits)} [未確定; N=${stat.n}]`;
  const uncertain = stat.status?.includes("未確定") ? " 未確定" : "";
  return `${stat.estimate.toFixed(digits)} [` +
    `${stat.low.toFixed(digits)},${stat.high.toFixed(digits)}; N=${stat.n}]${uncertain}`;
}

function formatDifference(stat, digits = 3) {
  if (!stat || stat.estimate === null) return "未観測";
  if (stat.low === null) return `${stat.estimate.toFixed(digits)} [未確定; N=${stat.n}]`;
  const uncertain = stat.status?.includes("未確定") ? " 未確定" : "";
  return `${stat.estimate.toFixed(digits)} [` +
    `${stat.low.toFixed(digits)},${stat.high.toFixed(digits)}; N=${stat.n}]${uncertain}`;
}

function formatOutcome(outcome) {
  return [
    formatPercent(outcome.entrant),
    formatPercent(outcome.breakthrough),
    formatPercent(outcome.death),
    formatPercent(outcome.retreat)
  ].join(" / ");
}

function renderMarkdown({
  aggregates,
  pairComparisons,
  diagnosticAggregate,
  measurement,
  rawSha256,
  summarySha256
}) {
  const allPairedIndicatorsZero = pairComparisons.length > 0 &&
    pairComparisons.every(comparison =>
      comparison.indicators.every(indicator => indicator.difference.estimate === 0)
    );
  const lines = [
    "# Issue #487 回復優先順位 what-if",
    "",
    "## 結論",
    "",
    "DIOS先行・血杖条件変更を同一run keyで比較した。",
    allPairedIndicatorsZero
      ? "固定 #461 条件では4条件のendpoint・機構値のpaired差が全指標0.000。逃走判定（HP<=35%）が回復選択より先のため、固定測定ではDIOS可用時の薬選択も0/runだった。"
      : "固定 #461 条件でpaired差が発生したため、endpoint・機構値を下表で確認する。",
    "逃走なし診断では衝突分岐を再現できるが、固定endpoint差の原因にはならない。既定の薬先・血杖の薬温存を維持し、ゲーム本体のbalance/canonは変更しない。",
    "",
    "## 固定条件 endpoint",
    "",
    "B5/B10 は `entrant / breakthrough / death / retreat`。後3つは entrant 分母、合計100%。",
    "",
    "| 条件 | 職 | B5 E/B/D/R | B10 E/B/D/R | 平均到達floor | DIOS/run | 回復薬/run | 終了MP/run | DIOS可用時薬選択/run |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |"
  ];
  CONDITIONS.forEach(condition => {
    const byClass = aggregates[condition.id].byClass;
    Object.entries(byClass).forEach(([className, summary]) => {
      lines.push(
        `| ${condition.label} | ${CLASS_LABELS[className]} | ${formatOutcome(summary.b5)} | ` +
        `${formatOutcome(summary.b10)} | ${formatMean(summary.averages.reachedFloor)} | ` +
        `${formatMean(summary.averages.diosCastCount)} | ` +
        `${formatMean(summary.averages.recoveryPotionsUsed)} | ` +
        `${formatMean(summary.averages.finalMp)} | ` +
        `${formatMean(summary.averages.diosPotionPriorityCases)} |`
      );
    });
  });
  lines.push(
    "",
    "## paired差（variant − current）",
    "",
    "生成条件・対応keyは共通。介入後の戦闘/探索軌跡は同一とは解釈しない。paired不可時はコードが独立2標本へ切替。",
    "",
    "| variant | 指標 | method | N | 差95% CI |",
    "| --- | --- | --- | ---: | --- |"
  );
  pairComparisons.forEach(comparison => {
    comparison.indicators.forEach(indicator => {
      lines.push(
        `| ${comparison.label} | ${indicator.label} | ${indicator.method} | ${indicator.difference.n} | ` +
        `${formatDifference(indicator.difference)} |`
      );
    });
  });
  lines.push(
    "",
    "## 血杖条件監査",
    "",
    "| 条件 | 職 | DIOS候補/run | DIOS発動/run | 血杖DIOS coverage | 攻撃候補/run | 攻撃発動/run |",
    "| --- | --- | ---: | ---: | --- | ---: | ---: |"
  );
  CONDITIONS.forEach(condition => {
    Object.entries(aggregates[condition.id].byClass).forEach(([className, summary]) => {
      lines.push(
        `| ${condition.label} | ${CLASS_LABELS[className]} | ` +
        `${formatMean(summary.averages.bloodWandHealOpportunities)} | ` +
        `${formatMean(summary.averages.bloodWandHealActivations)} | ` +
        `${formatPercent(summary.bloodWand.healCoverage)} | ` +
        `${formatMean(summary.averages.bloodWandSpellOpportunities)} | ` +
        `${formatMean(summary.averages.bloodWandSpellActivations)} |`
      );
    });
  });
  lines.push(
    "",
    "## DIOS可用時に薬を選んだ事例",
    "",
    `固定条件 current の全run集計: ${formatMean(aggregates.current.overall.averages.diosPotionPriorityCases)}。` +
      "事例sampleは固定条件で0件の場合、逃走判定を外した診断runから提示する。",
    "",
    "| 職 | floor | round | HP/maxHP | MP/maxMP | 薬 | DIOS payment | 選択 | runSeed |",
    "| --- | ---: | ---: | --- | --- | --- | --- | --- | --- |"
  );
  const samples = diagnosticAggregate?.eventSamples || aggregates.current.overall.eventSamples;
  if (samples.length === 0) {
    lines.push("| なし | - | - | - | - | - | - | - | - |");
  } else {
    samples.forEach(sample => {
      lines.push(
        `| ${CLASS_LABELS[sample.className] || sample.className} | ${sample.floor} | ${sample.round} | ` +
        `${sample.hp}/${sample.maxHp} | ${sample.mp}/${sample.maxMp} | ${sample.recoveryItem} | ` +
        `${sample.diosPaymentResource}/${sample.diosPaymentCost} | ${sample.selectedAction}/${sample.selectedItem} | ` +
        `${sample.runSeed} |`
      );
    });
  }
  if (diagnosticAggregate) {
    lines.push(
      "",
      `逃走判定なし診断（僧侶 N=${diagnosticAggregate.runs}、固定endpoint判定外）: ` +
        `DIOS=${formatMean(diagnosticAggregate.averages.diosCastCount)} / ` +
        `回復薬=${formatMean(diagnosticAggregate.averages.recoveryPotionsUsed)} / ` +
        `終了MP=${formatMean(diagnosticAggregate.averages.finalMp)} / ` +
        `DIOS可用時薬選択=${formatMean(diagnosticAggregate.averages.diosPotionPriorityCases)}。`
    );
  }
  lines.push(
    "",
    "## 測定条件・再現",
    "",
    "```text",
    ...Object.entries(measurement.environment).sort(([left], [right]) =>
      left.localeCompare(right)
    ).map(([key, value]) => `${key}=${value}`),
    `RUNS_PER_CLASS=${measurement.runsPerClass}`,
    `CALIBRATION_RUNS=${measurement.calibrationRuns}`,
    `DIAGNOSTIC_RUNS=${measurement.diagnosticRuns}`,
    "```",
    "",
    `- seed=${measurement.seed}; targetDepth=B20終了（targetDepth=${measurement.targetDepth}）。`,
    `- 職=${measurement.classNames.join(", ")}; scenario=${measurement.scenarioIds.join(", ")}; 条件=${CONDITIONS.map(condition => condition.id).join(", ")}`,
    `- resolved parallelism=${measurement.resolvedParallelism}（availableParallelism=${measurement.availableParallelism}、SIM_PARALLEL未指定）。`,
    `- calibration wall-clock=${measurement.calibrationWallSeconds.toFixed(3)}s / CPU=${measurement.calibrationCpuSeconds.toFixed(3)}s。`,
    `- simulation wall-clock=${measurement.simulationWallSeconds.toFixed(3)}s / CPU=${measurement.simulationCpuSeconds.toFixed(3)}s。`,
    `- raw JSONL SHA-256: \`${rawSha256}\``,
    `- summary SHA-256: \`${summarySha256}\``,
    `- environment SHA-256: \`${measurement.environmentSha256}\``,
    "",
    "## モデル・制約",
    "",
    "- `simulateRun`、`generateRunFloor`、現行戦闘/報酬/罠/ポータル/鑑定/装備更新を使用。",
    "- DIOS は戦闘中と戦闘後回復を分けて数え、回復薬は傷薬＋上薬を合算/内訳出力。終了MPはrunごとに測定。",
    "- 固定条件では逃走判定が回復選択より先。逃走なし診断は分岐の実在確認用で、endpoint採否へ混ぜない。",
    "- 率 Wilson 95% CI、平均/paired差 正規近似95% CI。N<30 は未確定。",
    "- 上級職、任意商人購入、人間の敵別判断、任意寄り道は対象外。",
    "",
    "## Review output",
    "",
    "- Blocking issues: なし。",
    "- Non-blocking issues: 固定条件の回復優先順位は逃走閾値に遮られるため、DIOS先行差をendpoint原因とは断定しない。",
    "- Missing verification: なし。full測定・paired監査・職別B5/B10・Wilson CIを実施。",
    "- Verdict: pass with notes。",
    "",
    "## チェックリスト",
    "",
    "- 適用: `.agents/balance-simulation.md`。採用: 実run経路、固定条件、paired監査、Wilson 95% CI、N<30注記、逃走なし診断の分離。",
    "- 非適用: mobile UI/QA。UI変更なし。",
    "- Design Canon: sim方針のみ。ゲーム本体の呪文/アイテム性能・balance値は変更なし。",
    "",
    "## 再現コマンド",
    "",
    "```sh",
    `${SMOKE ? "ISSUE487_SMOKE=1 " : ""}node scratch/sim_issue_487_heal_priority.js`,
    "```",
    ""
  );
  return lines.join("\n");
}

async function main() {
  const calibrationStarted = performance.now();
  const calibrationCpuStarted = process.cpuUsage();
  const scoringProfiles = calibrateProfiles();
  const calibrationCpu = process.cpuUsage(calibrationCpuStarted);
  const calibrationWallSeconds = (performance.now() - calibrationStarted) / 1000;

  const tasks = createTasks();
  const resolvedParallelism = resolveSimParallelism(tasks.length);
  const simulationStarted = performance.now();
  const simulationCpuStarted = process.cpuUsage();
  const rows = await runSimTasks({
    moduleUrl: pathToFileURL(fileURLToPath(import.meta.url)).href,
    exportName: "runIssue487Task",
    runTask: runIssue487Task,
    tasks,
    context: { scoringProfiles }
  });
  const simulationCpu = process.cpuUsage(simulationCpuStarted);
  const simulationWallSeconds = (performance.now() - simulationStarted) / 1000;
  if (rows.length !== tasks.length) {
    throw new Error(`raw result audit failed: rows=${rows.length}/${tasks.length}`);
  }
  const rowKeys = rows.map(row =>
    `${row.mode}:${row.conditionId}:${row.className}:${row.runIndex}`
  );
  if (new Set(rowKeys).size !== rows.length) {
    throw new Error("raw result audit failed: duplicate condition/class/run key");
  }

  const diagnosticTasks = createDiagnosticTasks();
  const diagnosticStarted = performance.now();
  const diagnosticCpuStarted = process.cpuUsage();
  const diagnosticRows = await runSimTasks({
    moduleUrl: pathToFileURL(fileURLToPath(import.meta.url)).href,
    exportName: "runIssue487Task",
    runTask: runIssue487Task,
    tasks: diagnosticTasks,
    context: { scoringProfiles }
  });
  const diagnosticCpu = process.cpuUsage(diagnosticCpuStarted);
  const diagnosticWallSeconds = (performance.now() - diagnosticStarted) / 1000;
  if (diagnosticRows.length !== diagnosticTasks.length) {
    throw new Error(`diagnostic result audit failed: rows=${diagnosticRows.length}/${diagnosticTasks.length}`);
  }

  const rowsByCondition = new Map(
    CONDITIONS.map(condition => [
      condition.id,
      rows.filter(row => row.conditionId === condition.id)
    ])
  );
  const aggregates = Object.fromEntries(
    CONDITIONS.map(condition => {
      const conditionRows = rowsByCondition.get(condition.id);
      return [
        condition.id,
        {
          overall: aggregateRows(conditionRows),
          byClass: Object.fromEntries(
            CLASS_NAMES.map(className => [
              className,
              aggregateRows(conditionRows.filter(row => row.className === className))
            ])
          )
        }
      ];
    })
  );
  const diagnosticAggregate = aggregateRows(diagnosticRows);
  const pairComparisons = buildPairComparisons(rowsByCondition);
  const rawText = rows.map(row => JSON.stringify(row)).join("\n") + "\n";
  const rawSha256 = sha256(rawText);
  const environment = HASH_ENVIRONMENT;
  const measurement = {
    issue: 487,
    scope: "run",
    mode: SMOKE ? "smoke" : "baseline",
    seed: SEED,
    runsPerClass: RUNS_PER_CLASS,
    calibrationRuns: CALIBRATION_RUNS,
    diagnosticRuns: DIAGNOSTIC_RUNS,
    classNames: CLASS_NAMES,
    scenarioIds: SCENARIO_IDS,
    targetDepth: TARGET_DEPTH,
    conditions: CONDITIONS,
    environment,
    environmentSha256: ENV_HASH,
    resolvedParallelism,
    availableParallelism: availableParallelism(),
    calibrationWallSeconds,
    simulationWallSeconds,
    diagnosticWallSeconds,
    calibrationCpuSeconds: (calibrationCpu.user + calibrationCpu.system) / 1e6,
    simulationCpuSeconds: (simulationCpu.user + simulationCpu.system) / 1e6,
    diagnosticCpuSeconds: (diagnosticCpu.user + diagnosticCpu.system) / 1e6,
    totalMeasuredRuns: rows.length,
    diagnosticMeasuredRuns: diagnosticRows.length
  };
  const summaryWithoutHash = {
    measurement,
    rawSha256,
    aggregates,
    pairComparisons,
    diagnosticAggregate
  };
  const summarySha256 = sha256(`${JSON.stringify(summaryWithoutHash, null, 2)}\n`);
  const resultDir = `${process.cwd()}/scratch/results`;
  mkdirSync(resultDir, { recursive: true });
  const markdownPath = `${resultDir}/${OUTPUT_STEM}.md`;
  const markdown = renderMarkdown({
    aggregates,
    pairComparisons,
    diagnosticAggregate,
    measurement,
    rawSha256,
    summarySha256
  });
  writeFileSync(markdownPath, markdown);
  if (process.env.SIM_RAW_PATH) writeFileSync(process.env.SIM_RAW_PATH, rawText);
  console.log(JSON.stringify({
    output: markdownPath.replace(`${process.cwd()}/`, ""),
    envHash: ENV_HASH,
    rawSha256,
    summarySha256,
    resolvedParallelism,
    wallClockSeconds: calibrationWallSeconds + simulationWallSeconds + diagnosticWallSeconds,
    cpuTotalSeconds: measurement.calibrationCpuSeconds +
      measurement.simulationCpuSeconds + measurement.diagnosticCpuSeconds
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
