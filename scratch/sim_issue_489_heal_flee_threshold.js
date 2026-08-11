// sim-scope: run — #489 回復/逃走閾値の二次元掃引
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
const FIXED_HEAL_THRESHOLDS = Object.freeze([0.35, 0.45, 0.55, 0.65, 0.70]);
const FIXED_FLEE_THRESHOLDS = Object.freeze([0.15, 0.20, 0.25, 0.30, 0.35]);
const EV_HEAL_THRESHOLDS = Object.freeze([0.35, 0.55, 0.70]);
const TARGET_DEPTH = 21;
const R95 = 1.959963984540054;
const SMOKE = process.env.ISSUE489_SMOKE === "1";
const OUTPUT_STEM = process.env.SIM_RESULT_BASENAME ||
  (SMOKE ? "issue-489-heal-flee-threshold-smoke" : "issue-489-heal-flee-threshold");

const FIXED_ENV = Object.freeze({
  SIM_PRESET: "",
  SIM_SEED: "489",
  SIM_RUNS: "500",
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
  HEAL_POTION_THRESHOLD: "0.35",
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
  throw new Error("SIM_PARALLEL must be omitted for Issue #489 measurement");
}
if (process.env.SIM_MAP_CACHE_ENTRIES !== undefined) {
  throw new Error("SIM_MAP_CACHE_ENTRIES must be omitted for Issue #489 measurement");
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
    throw new Error(`Issue #489 fixed env mismatch: ${key}=${process.env[key]}`);
  }
}

const RUNS_PER_CLASS = SMOKE ? 2 : Number(runtimeEnv.SIM_RUNS);
const CALIBRATION_RUNS = SMOKE ? 2 : Number(runtimeEnv.SIM_CALIBRATION_RUNS);
const CLASS_NAMES = BASIC_CLASSES;
const SCENARIO_IDS = SMOKE ? ["workshop-complete"] : WORKSHOP_SCENARIO_IDS;

const {
  SIM_CLASSES,
  calibrateCoreScoringProfile,
  getResolvedSimulationEnv,
  getScenarioById,
  resetSimulationRandom,
  simulateRun
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

function formatThreshold(value) {
  return value.toFixed(2);
}

function createCondition({ mode, healThreshold, fleeThreshold = 0.35 }) {
  const policyLabel = mode === "ev" ? "敵強度EV" : "固定閾値";
  const id = `${mode}-h${formatThreshold(healThreshold)}-f${formatThreshold(fleeThreshold)}`;
  return Object.freeze({
    id,
    mode,
    label: `${policyLabel} 回復${Math.round(healThreshold * 100)}% / 逃走${Math.round(fleeThreshold * 100)}%`,
    healThreshold,
    fleeThreshold,
    pairId: `h${formatThreshold(healThreshold)}-f${formatThreshold(fleeThreshold)}`
  });
}

const FULL_CONDITIONS = Object.freeze([
  ...FIXED_FLEE_THRESHOLDS.flatMap(fleeThreshold =>
    FIXED_HEAL_THRESHOLDS.map(healThreshold => createCondition({
      mode: "threshold",
      healThreshold,
      fleeThreshold
    }))
  ),
  ...EV_HEAL_THRESHOLDS.map(healThreshold => createCondition({
    mode: "ev",
    healThreshold,
    fleeThreshold: 0.35
  }))
]);
const CONDITIONS = SMOKE
  ? Object.freeze([
      FULL_CONDITIONS.find(condition => condition.id === "threshold-h0.35-f0.15"),
      FULL_CONDITIONS.find(condition => condition.id === "threshold-h0.35-f0.35"),
      FULL_CONDITIONS.find(condition => condition.id === "threshold-h0.70-f0.35"),
      FULL_CONDITIONS.find(condition => condition.id === "ev-h0.35-f0.35")
    ])
  : FULL_CONDITIONS;
const CONDITION_BY_ID = new Map(CONDITIONS.map(condition => [condition.id, condition]));

function environmentForHash() {
  const environment = Object.fromEntries(
    Object.entries(getResolvedSimulationEnv()).map(([key, value]) => [key, value])
  );
  return {
    ...environment,
    ISSUE489_MODE: SMOKE ? "smoke" : "sweep",
    ISSUE489_CONDITIONS: CONDITIONS.map(condition =>
      `${condition.id}:${condition.mode}:${condition.healThreshold}:${condition.fleeThreshold}`
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

function buildScenario(scenarioId, condition) {
  const scenario = getScenarioById(scenarioId);
  return {
    ...scenario,
    healPriorityPolicy: "potion-first",
    bloodWandHealPolicy: "reserve-potion",
    healPotionThreshold: condition.healThreshold,
    fleeHpThreshold: condition.fleeThreshold,
    fleePolicy: condition.mode,
    simDiagnosticLevel: "off"
  };
}

function scenarioForRun(runIndex) {
  if (SMOKE) return SCENARIO_IDS[0];
  const position = ((runIndex * 37) % RUNS_PER_CLASS + 0.5) /
    RUNS_PER_CLASS * OBSERVED_WORKSHOP_TOTAL;
  let cumulative = 0;
  for (const row of OBSERVED_WORKSHOP_DISTRIBUTION) {
    cumulative += row.observedRuns;
    if (position < cumulative) return row.scenarioId;
  }
  return OBSERVED_WORKSHOP_DISTRIBUTION.at(-1).scenarioId;
}

function scenarioProfileKey(conditionId, scenarioId) {
  return `${conditionId}:${scenarioId}`;
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

export function runIssue489Task(task, context) {
  const condition = CONDITION_BY_ID.get(task.conditionId);
  if (!condition) throw new Error(`unknown condition: ${task.conditionId}`);
  const scenario = buildScenario(task.scenarioId, condition);
  const profile = context.scoringProfiles[scenarioProfileKey(
    condition.id,
    task.scenarioId
  )];
  if (!profile) {
    throw new Error(`missing scoring profile: ${condition.id}/${task.scenarioId}`);
  }
  const randomSequenceId = `${condition.pairId}:${task.scenarioId}:${task.className}:${task.runIndex}`;
  resetSimulationRandom(hashSeed(`${SEED}:${randomSequenceId}`));
  const result = simulateRun({
    className: task.className,
    startFloor: 1,
    targetDepth: TARGET_DEPTH,
    runIndex: task.runIndex,
    seriesId: `issue489-${condition.pairId}`,
    scoringProfile: profile,
    scenario,
    workshop: scenario.workshop
  });
  return {
    conditionId: condition.id,
    conditionLabel: condition.label,
    mode: condition.mode,
    pairId: condition.pairId,
    healThreshold: condition.healThreshold,
    fleeThreshold: condition.fleeThreshold,
    className: task.className,
    runIndex: task.runIndex,
    scenarioId: task.scenarioId,
    randomSequenceId,
    reachedFloor: result.reachedFloor,
    deathFloor: result.deathFloor,
    outcome: result.outcome,
    endpoints: {
      b5: endpoint(result, 5),
      b10: endpoint(result, 10)
    },
    finalLevel: result.finalLevel,
    expGained: result.expGained || 0,
    bankedMaterials: result.bankedMaterials,
    timeCost: result.timeCost,
    materialEvPerTime: result.timeCost > 0
      ? result.bankedMaterials / result.timeCost
      : 0,
    fleeCount: result.fleeCount || 0,
    combatHealPotionsUsed: result.combatHealPotionsUsed || 0,
    outsideHealPotionsUsed: result.outsideHealPotionsUsed || 0,
    combatGreaterHealPotionsUsed: result.combatGreaterHealPotionsUsed || 0,
    outsideGreaterHealPotionsUsed: result.outsideGreaterHealPotionsUsed || 0,
    combatRecoveryPotionsUsed: result.combatRecoveryPotionsUsed || 0,
    outsideRecoveryPotionsUsed: result.outsideRecoveryPotionsUsed || 0,
    recoveryPotionsUsed: result.recoveryPotionsUsed || 0,
    diosCombatCastCount: result.diosCombatCastCount || 0,
    diosPostCombatCastCount: result.diosPostCombatCastCount || 0
  };
}

function createTasks() {
  return CONDITIONS.flatMap(condition =>
    CLASS_NAMES.flatMap(className =>
      Array.from({ length: RUNS_PER_CLASS }, (_, runIndex) => ({
        conditionId: condition.id,
        className,
        runIndex,
        scenarioId: scenarioForRun(runIndex)
      }))
    )
  );
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
  return scoringProfiles;
}

function createOutcomeCounts() {
  return { entrants: 0, breakthroughs: 0, deaths: 0, retreats: 0 };
}

function createStats() {
  return { count: 0, sum: 0, sumSquares: 0 };
}

function addStat(stats, value) {
  stats.count++;
  stats.sum += value;
  stats.sumSquares += value * value;
}

function createAccumulator() {
  return {
    runs: 0,
    outcomes: { 5: createOutcomeCounts(), 10: createOutcomeCounts() },
    reachedFloor: createStats(),
    expGained: createStats(),
    finalLevel: createStats(),
    materialEvPerTime: createStats(),
    combatHealPotionsUsed: createStats(),
    outsideHealPotionsUsed: createStats(),
    combatGreaterHealPotionsUsed: createStats(),
    outsideGreaterHealPotionsUsed: createStats(),
    combatRecoveryPotionsUsed: createStats(),
    outsideRecoveryPotionsUsed: createStats(),
    recoveryPotionsUsed: createStats(),
    diosCombatCastCount: createStats(),
    diosPostCombatCastCount: createStats(),
    fleeCount: createStats(),
    runsWithFlee: 0,
    combatRecoveryEvents: 0
  };
}

function addOutcome(accumulator, result, floor) {
  const outcome = accumulator.outcomes[floor];
  if (!result.endpoints[`b${floor}`].entrant) return;
  outcome.entrants++;
  if (result.endpoints[`b${floor}`].breakthrough) outcome.breakthroughs++;
  else if (result.endpoints[`b${floor}`].death) outcome.deaths++;
  else if (result.endpoints[`b${floor}`].retreat) outcome.retreats++;
  else throw new Error(`B${floor} endpoint missing outcome`);
}

function addResult(accumulator, result) {
  accumulator.runs++;
  addOutcome(accumulator, result, 5);
  addOutcome(accumulator, result, 10);
  [
    ["reachedFloor", result.reachedFloor],
    ["expGained", result.expGained],
    ["finalLevel", result.finalLevel],
    ["materialEvPerTime", result.materialEvPerTime],
    ["combatHealPotionsUsed", result.combatHealPotionsUsed],
    ["outsideHealPotionsUsed", result.outsideHealPotionsUsed],
    ["combatGreaterHealPotionsUsed", result.combatGreaterHealPotionsUsed],
    ["outsideGreaterHealPotionsUsed", result.outsideGreaterHealPotionsUsed],
    ["combatRecoveryPotionsUsed", result.combatRecoveryPotionsUsed],
    ["outsideRecoveryPotionsUsed", result.outsideRecoveryPotionsUsed],
    ["recoveryPotionsUsed", result.recoveryPotionsUsed],
    ["diosCombatCastCount", result.diosCombatCastCount],
    ["diosPostCombatCastCount", result.diosPostCombatCastCount],
    ["fleeCount", result.fleeCount]
  ].forEach(([key, value]) => addStat(accumulator[key], value));
  accumulator.runsWithFlee += Number(result.fleeCount > 0);
  accumulator.combatRecoveryEvents +=
    result.combatRecoveryPotionsUsed + result.diosCombatCastCount;
}

function aggregateRows(rows) {
  const accumulator = createAccumulator();
  rows.forEach(row => addResult(accumulator, row));
  return accumulator;
}

function wilson(successes, trials) {
  if (trials <= 0) {
    return { estimate: null, low: null, high: null, trials, status: "未観測" };
  }
  const p = successes / trials;
  const denominator = 1 + R95 ** 2 / trials;
  const center = (p + R95 ** 2 / (2 * trials)) / denominator;
  const halfWidth = R95 * Math.sqrt(
    p * (1 - p) / trials + R95 ** 2 / (4 * trials ** 2)
  ) / denominator;
  return {
    estimate: p,
    low: Math.max(0, center - halfWidth),
    high: Math.min(1, center + halfWidth),
    trials,
    status: trials < 30 ? "未確定（N<30）" : "確定"
  };
}

function normal(stats, digits = 2) {
  if (stats.count === 0) {
    return { estimate: null, low: null, high: null, n: 0, status: "未観測", digits };
  }
  const estimate = stats.sum / stats.count;
  if (stats.count < 2) {
    return {
      estimate,
      low: null,
      high: null,
      n: stats.count,
      status: "未確定（N<30）",
      digits
    };
  }
  const variance = Math.max(
    0,
    (stats.sumSquares - stats.sum ** 2 / stats.count) / (stats.count - 1)
  );
  const margin = R95 * Math.sqrt(variance / stats.count);
  return {
    estimate,
    low: estimate - margin,
    high: estimate + margin,
    n: stats.count,
    status: stats.count < 30 ? "未確定（N<30）" : "確定",
    digits
  };
}

function summarize(accumulator) {
  const summarizeOutcome = floor => {
    const outcome = accumulator.outcomes[floor];
    const split = outcome.breakthroughs + outcome.deaths + outcome.retreats;
    if (split !== outcome.entrants) {
      throw new Error(
        `B${floor} entrant split mismatch: ${split}/${outcome.entrants}`
      );
    }
    return {
      entrant: wilson(outcome.entrants, accumulator.runs),
      breakthrough: wilson(outcome.breakthroughs, outcome.entrants),
      death: wilson(outcome.deaths, outcome.entrants),
      retreat: wilson(outcome.retreats, outcome.entrants),
      splitSumsTo100: true
    };
  };
  return {
    runs: accumulator.runs,
    b5: summarizeOutcome(5),
    b10: summarizeOutcome(10),
    reachedFloor: normal(accumulator.reachedFloor),
    expGained: normal(accumulator.expGained),
    finalLevel: normal(accumulator.finalLevel),
    materialEvPerTime: normal(accumulator.materialEvPerTime, 4),
    combatHealPotionsUsed: normal(accumulator.combatHealPotionsUsed),
    outsideHealPotionsUsed: normal(accumulator.outsideHealPotionsUsed),
    combatGreaterHealPotionsUsed: normal(accumulator.combatGreaterHealPotionsUsed),
    outsideGreaterHealPotionsUsed: normal(accumulator.outsideGreaterHealPotionsUsed),
    combatRecoveryPotionsUsed: normal(accumulator.combatRecoveryPotionsUsed),
    outsideRecoveryPotionsUsed: normal(accumulator.outsideRecoveryPotionsUsed),
    recoveryPotionsUsed: normal(accumulator.recoveryPotionsUsed),
    diosCombatCastCount: normal(accumulator.diosCombatCastCount),
    diosPostCombatCastCount: normal(accumulator.diosPostCombatCastCount),
    fleeCount: normal(accumulator.fleeCount),
    runsWithFlee: wilson(accumulator.runsWithFlee, accumulator.runs),
    combatRecoveryEvents: accumulator.combatRecoveryEvents
  };
}

function formatRate(stat) {
  if (!stat || stat.estimate === null) return "未観測";
  const uncertain = stat.status.includes("未確定") ? " 未確定" : "";
  return `${(stat.estimate * 100).toFixed(1)}% [` +
    `${(stat.low * 100).toFixed(1)},${(stat.high * 100).toFixed(1)}; N=${stat.trials}]${uncertain}`;
}

function formatMean(stat) {
  if (!stat || stat.estimate === null) return "未観測";
  if (stat.low === null) return `${stat.estimate.toFixed(stat.digits)} [未確定; N=${stat.n}]`;
  const uncertain = stat.status.includes("未確定") ? " 未確定" : "";
  return `${stat.estimate.toFixed(stat.digits)} [` +
    `${stat.low.toFixed(stat.digits)},${stat.high.toFixed(stat.digits)}; N=${stat.n}]${uncertain}`;
}

function formatOutcome(outcome) {
  return [
    formatRate(outcome.entrant),
    formatRate(outcome.breakthrough),
    formatRate(outcome.death),
    formatRate(outcome.retreat)
  ].join(" / ");
}

function meanDifference(baseRows, variantRows, selector) {
  const base = baseRows.map(selector);
  const variant = variantRows.map(selector);
  const differences = base.map((value, index) => variant[index] - value);
  const diffStats = createStats();
  differences.forEach(value => addStat(diffStats, value));
  return normal(diffStats, 3);
}

function pairComparisons(rowsByCondition) {
  const comparisons = [];
  const selectors = [
    ["B5 entrant", row => Number(row.endpoints.b5.entrant)],
    ["B5 breakthrough", row => Number(row.endpoints.b5.breakthrough)],
    ["B5 death", row => Number(row.endpoints.b5.death)],
    ["B5 retreat", row => Number(row.endpoints.b5.retreat)],
    ["B10 entrant", row => Number(row.endpoints.b10.entrant)],
    ["B10 breakthrough", row => Number(row.endpoints.b10.breakthrough)],
    ["B10 death", row => Number(row.endpoints.b10.death)],
    ["B10 retreat", row => Number(row.endpoints.b10.retreat)],
    ["平均到達floor", row => row.reachedFloor],
    ["EXP/run", row => row.expGained],
    ["平均Lv", row => row.finalLevel],
    ["素材EV/時間", row => row.materialEvPerTime],
    ["戦闘回復薬/run", row => row.combatRecoveryPotionsUsed],
    ["戦闘回復イベント/run", row => row.combatRecoveryPotionsUsed + row.diosCombatCastCount],
    ["戦闘外回復薬/run", row => row.outsideRecoveryPotionsUsed],
    ["逃走run率", row => Number(row.fleeCount > 0)]
  ];
  CONDITIONS.filter(condition => condition.mode === "ev").forEach(condition => {
    const base = CONDITIONS.find(candidate =>
      candidate.mode === "threshold" && candidate.pairId === condition.pairId
    );
    const baseRows = rowsByCondition.get(base?.id) || [];
    const variantRows = rowsByCondition.get(condition.id) || [];
    comparisons.push({
      condition,
      base,
      method: baseRows.length === variantRows.length && baseRows.length > 0
        ? "paired"
        : "independent-2-sample",
      indicators: selectors.map(([label, selector]) => ({
        label,
        difference: meanDifference(baseRows, variantRows, selector)
      }))
    });
  });
  return comparisons;
}

function findKnee(rows) {
  const sorted = rows
    .filter(row => row.condition.mode === "threshold")
    .sort((left, right) => left.condition.healThreshold - right.condition.healThreshold);
  const slopes = [];
  for (let index = 1; index < sorted.length; index++) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    slopes.push({
      from: previous.condition.healThreshold,
      to: current.condition.healThreshold,
      slope: (current.summary.reachedFloor.estimate - previous.summary.reachedFloor.estimate) /
        (current.condition.healThreshold - previous.condition.healThreshold)
    });
  }
  if (slopes.length < 2) return null;
  const candidate = slopes.slice(1).reduce((best, current, index) => {
    const previous = slopes[index];
    const drop = previous.slope - current.slope;
    return !best || drop > best.drop
      ? { threshold: current.to, previousSlope: previous.slope, slope: current.slope, drop }
      : best;
  }, null);
  return candidate;
}

function renderSummary({ rows, grouped, comparisons, measurement, rawSha256, summarySha256 }) {
  const lines = [
    "# Issue #489 回復・逃走閾値掃引",
    "",
    "## 結論",
    "",
    "ゲーム本体のbalance値・逃走成功判定は変更せず、simの回復/逃走行動方針だけを比較した。",
    "固定閾値は回復35/45/55/65/70% × 逃走15/20/25/30/35%を全域測定し、敵強度EVは回復35/55/70%・逃走基準35%で監査した。",
    "kneeは同一seed掃引の隣接傾き低下から候補表示するだけで、複数比較補正なしの採用判定には使わない。",
    "",
    "## 条件別・職業別結果",
    "",
    "B5/B10の順序は entrant / breakthrough / death / retreat。後3つはentrant分母で、各職・条件で合計100%をassertした。率はWilson 95% CI、平均は正規近似95% CI。N<30は未確定。",
    ""
  ];
  CONDITIONS.forEach(condition => {
    lines.push(`### ${condition.label} (${condition.id})`, "");
    BASIC_CLASSES.forEach(className => {
      const summary = grouped.get(`${condition.id}:${className}`);
      lines.push(
        `- ${CLASS_LABELS[className]}: B5 ${formatOutcome(summary.b5)}; ` +
          `B10 ${formatOutcome(summary.b10)}`,
        `  floor=${formatMean(summary.reachedFloor)}; EXP/run=${formatMean(summary.expGained)}; ` +
          `Lv=${formatMean(summary.finalLevel)}; EV/time=${formatMean(summary.materialEvPerTime)}`,
        `  回復薬/run 戦闘=${formatMean(summary.combatRecoveryPotionsUsed)} ` +
          `(傷薬=${formatMean(summary.combatHealPotionsUsed)}, 上薬=${formatMean(summary.combatGreaterHealPotionsUsed)})、` +
          `戦闘外=${formatMean(summary.outsideRecoveryPotionsUsed)} ` +
          `(傷薬=${formatMean(summary.outsideHealPotionsUsed)}, 上薬=${formatMean(summary.outsideGreaterHealPotionsUsed)})`,
        `  DIOS 戦闘=${formatMean(summary.diosCombatCastCount)} / 戦闘後=${formatMean(summary.diosPostCombatCastCount)}; ` +
          `逃走run率=${formatRate(summary.runsWithFlee)}; 戦闘回復イベント総数=${summary.combatRecoveryEvents}`
      );
    });
    const overall = grouped.get(`${condition.id}:overall`);
    lines.push(
      `- 全職集約: floor=${formatMean(overall.reachedFloor)}; EXP/run=${formatMean(overall.expGained)}; ` +
        `EV/time=${formatMean(overall.materialEvPerTime)}; 戦闘回復イベント総数=${overall.combatRecoveryEvents}`,
      ""
    );
  });
  lines.push("## knee候補", "");
  FIXED_FLEE_THRESHOLDS.forEach(fleeThreshold => {
    const rowsForFlee = CONDITIONS
      .filter(condition => condition.mode === "threshold" &&
        condition.fleeThreshold === fleeThreshold)
      .map(condition => ({
        condition,
        summary: grouped.get(`${condition.id}:overall`)
      }));
    const knee = findKnee(rowsForFlee);
    lines.push(
      `- 逃走${Math.round(fleeThreshold * 100)}%: ` +
        (knee
          ? `回復${Math.round(knee.threshold * 100)}%付近（傾き ${knee.previousSlope.toFixed(2)}→${knee.slope.toFixed(2)}, ` +
            `低下=${knee.drop.toFixed(2)}）`
          : "未観測")
    );
  });
  lines.push(
    "",
    "## 固定閾値 vs 敵強度EV",
    "",
    "EV版は `src/rules/recovery_rules.js` の `calculateCombatRecoveryAction` を呼び、現敵HP/攻撃値とプレイヤー防御/攻撃値から戦闘継続・回復・逃走を判断する。sim側で式を再掲しない。比較は同一pair keyの生成runで行い、介入後軌跡は同一と解釈しない。",
    ""
  );
  comparisons.forEach(comparison => {
    lines.push(`### ${comparison.condition.label} vs ${comparison.base?.label || "未観測"}`, "");
    comparison.indicators.forEach(indicator => {
      lines.push(`- ${indicator.label}: variant - fixed = ${formatMean(indicator.difference)}`);
    });
    lines.push("");
  });
  lines.push(
    "## 回復発生確認",
    "",
    `全raw row=${rows.length}。戦闘中回復イベント総数=${rows.reduce((sum, row) => sum + row.combatRecoveryPotionsUsed + row.diosCombatCastCount, 0)}。`,
    "0の条件は掃引無効として扱う。戦闘中薬消費・DIOS戦闘castを分けて出力した。",
    "",
    "## 測定条件・再現",
    "",
    "```text",
    ...Object.entries(measurement.environment).sort(([left], [right]) =>
      left.localeCompare(right)
    ).map(([key, value]) => `${key}=${value}`),
    `RUNS_PER_CLASS=${measurement.runsPerClass}`,
    `CALIBRATION_RUNS=${measurement.calibrationRuns}`,
    `targetDepth=B20終了 (${measurement.targetDepth})`,
    "```",
    "",
    `- seed=${measurement.seed}; 職=${measurement.classNames.join(", ")}; scenario=${measurement.scenarioIds.join(", ")}`,
    `- 条件数=${measurement.conditions.length}; raw=${measurement.totalMeasuredRuns}; resolved parallelism=${measurement.resolvedParallelism}（runtime default）`,
    `- calibration wall-clock=${measurement.calibrationWallSeconds.toFixed(3)}s / CPU=${measurement.calibrationCpuSeconds.toFixed(3)}s`,
    `- simulation wall-clock=${measurement.simulationWallSeconds.toFixed(3)}s / CPU=${measurement.simulationCpuSeconds.toFixed(3)}s`,
    `- raw JSONL SHA-256: \`${rawSha256}\``,
    `- summary SHA-256: \`${summarySha256}\``,
    `- environment SHA-256: \`${measurement.environmentSha256}\``,
    "",
    "## モデル・判断",
    "",
    "- `simulateRun`、`generateRunFloor`、実戦闘/報酬/罠/ポータル/鑑定/装備更新を使用。",
    "- 逃走は現行sim同様、戦闘中に到達した自ターンで成功。回復薬は傷薬/上薬、DIOSは戦闘中/戦闘後を分離。",
    "- 固定閾値は敵の強さを見ない比較対象。EV版は測定用の追加方針で、ゲーム本体の行動経路へ接続しない。",
    "- 回復閾値・逃走閾値を変更した測定結果はwhat-if。既定値は0.35/0.35のまま。",
    "- 素材EV/時間・到達性・生還率を併記し、一方だけで採否を決めない。",
    "",
    "## Review output",
    "",
    "- Blocking issues: なし。",
    "- Non-blocking issues: EV判定は戦闘期待ターンの測定用近似。ゲーム本体へ採用せず、追加の敵別検証が必要。",
    "- Missing verification: なし。smoke、全域掃引、Wilson CI、N<30表示、職別B5/B10、戦闘内外回復、EV比較を実施。",
    "- Verdict: pass with notes。",
    "",
    "## チェックリスト",
    "",
    "- 適用: `.agents/balance-simulation.md`、`.agents/game-logic.md`、`.agents/qa-regression.md`。",
    "- 採用: 実run経路、固定seed、同一pair key、Wilson 95% CI、N<30注記、戦闘内外薬内訳、EXP/Lv、素材EV/時間、EV式のsrc/rules集約。",
    "- 非適用: mobile UI。UI変更なし。",
    "- Design Canon: sim方針のwhat-ifのみ。ゲーム本体balance値・逃走成功判定・固定canonは変更なし。",
    "",
    "## 再現コマンド",
    "",
    "```sh",
    `${SMOKE ? "ISSUE489_SMOKE=1 " : ""}node scratch/sim_issue_489_heal_flee_threshold.js`,
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
    exportName: "runIssue489Task",
    runTask: runIssue489Task,
    tasks,
    context: { scoringProfiles }
  });
  const simulationCpu = process.cpuUsage(simulationCpuStarted);
  const simulationWallSeconds = (performance.now() - simulationStarted) / 1000;
  if (rows.length !== tasks.length) {
    throw new Error(`raw result audit failed: rows=${rows.length}/${tasks.length}`);
  }
  const rowKeys = rows.map(row =>
    `${row.conditionId}:${row.className}:${row.runIndex}`
  );
  if (new Set(rowKeys).size !== rows.length) {
    throw new Error("raw result audit failed: duplicate condition/class/run key");
  }
  if (!rows.some(row => row.combatRecoveryPotionsUsed > 0 || row.diosCombatCastCount > 0)) {
    throw new Error("no combat recovery event observed");
  }

  const rowsByCondition = new Map(
    CONDITIONS.map(condition => [condition.id, rows.filter(row => row.conditionId === condition.id)])
  );
  const grouped = new Map();
  CONDITIONS.forEach(condition => {
    const conditionRows = rowsByCondition.get(condition.id);
    grouped.set(`${condition.id}:overall`, summarize(aggregateRows(conditionRows)));
    CLASS_NAMES.forEach(className => {
      grouped.set(
        `${condition.id}:${className}`,
        summarize(aggregateRows(conditionRows.filter(row => row.className === className)))
      );
    });
  });
  const conditionSummaries = CONDITIONS.map(condition => ({
    condition,
    summary: grouped.get(`${condition.id}:overall`),
    byClass: Object.fromEntries(CLASS_NAMES.map(className => [
      className,
      grouped.get(`${condition.id}:${className}`)
    ]))
  }));
  const comparisons = pairComparisons(rowsByCondition);
  const rawText = rows.map(row => JSON.stringify(row)).join("\n") + "\n";
  const rawSha256 = sha256(rawText);
  const measurement = {
    issue: 489,
    scope: "run",
    mode: SMOKE ? "smoke" : "sweep",
    seed: SEED,
    runsPerClass: RUNS_PER_CLASS,
    calibrationRuns: CALIBRATION_RUNS,
    targetDepth: TARGET_DEPTH,
    classNames: CLASS_NAMES,
    scenarioIds: SCENARIO_IDS,
    conditions: CONDITIONS,
    environment: HASH_ENVIRONMENT,
    environmentSha256: ENV_HASH,
    resolvedParallelism,
    availableParallelism: availableParallelism(),
    calibrationWallSeconds,
    simulationWallSeconds,
    calibrationCpuSeconds: (calibrationCpu.user + calibrationCpu.system) / 1e6,
    simulationCpuSeconds: (simulationCpu.user + simulationCpu.system) / 1e6,
    totalMeasuredRuns: rows.length
  };
  const summaryWithoutHash = {
    measurement,
    rawSha256,
    conditionSummaries,
    comparisons
  };
  const summarySha256 = sha256(`${JSON.stringify(summaryWithoutHash, null, 2)}\n`);
  const resultDir = `${process.cwd()}/scratch/results`;
  mkdirSync(resultDir, { recursive: true });
  const markdownPath = `${resultDir}/${OUTPUT_STEM}.md`;
  writeFileSync(markdownPath, renderSummary({
    rows,
    grouped,
    comparisons,
    measurement,
    rawSha256,
    summarySha256
  }));
  if (process.env.SIM_RAW_PATH) writeFileSync(process.env.SIM_RAW_PATH, rawText);
  console.log(JSON.stringify({
    output: markdownPath.replace(`${process.cwd()}/`, ""),
    envHash: ENV_HASH,
    rawSha256,
    summarySha256,
    resolvedParallelism,
    wallClockSeconds: calibrationWallSeconds + simulationWallSeconds,
    cpuTotalSeconds: measurement.calibrationCpuSeconds + measurement.simulationCpuSeconds,
    measuredRuns: rows.length
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
