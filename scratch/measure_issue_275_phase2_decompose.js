// sim-scope: run — Issue #275 phase 2 B5→B10 decomposition
/* global console, process */

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";

import { resolveSimParallelism, runSimTasks } from "./sim_parallel.js";

const SMOKE = process.env.ISSUE275_PHASE2_SMOKE === "1";
const DEFAULT_RUNS_PER_CLASS = 500;
const DEFAULT_CALIBRATION_RUNS = 100;
const RUNS_PER_CLASS = SMOKE
  ? 2
  : Math.max(1, Number(process.env.SIM_RUNS || DEFAULT_RUNS_PER_CLASS));
const CALIBRATION_RUNS = SMOKE
  ? 1
  : Math.max(1, Number(process.env.SIM_CALIBRATION_RUNS || DEFAULT_CALIBRATION_RUNS));
const SEED = Number(process.env.SIM_SEED || 461) >>> 0;
const TARGET_DEPTHS = Object.freeze([5, 10]);
const BASIC_CLASSES = Object.freeze(["Fighter", "Thief", "Priest", "Mage"]);
const SCENARIO_IDS = Object.freeze([
  "workshop-empty",
  "workshop-stats",
  "workshop-gear",
  "workshop-blood-wand",
  "workshop-blood-wand-spells",
  "workshop-complete"
]);
const WORKSHOP_DISTRIBUTION = Object.freeze([
  ["workshop-empty", 30],
  ["workshop-stats", 74],
  ["workshop-gear", 69],
  ["workshop-blood-wand", 216],
  ["workshop-blood-wand-spells", 47],
  ["workshop-complete", 764]
]);
const WORKSHOP_TOTAL = WORKSHOP_DISTRIBUTION.reduce(
  (sum, [, count]) => sum + count,
  0
);
const COMBAT_TURN_WEIGHT = 3;
const R95 = 1.959963984540054;
const RESULT_STEM = process.env.SIM_RESULT_BASENAME ||
  (SMOKE ? "issue-275-phase2-decompose-smoke" : "issue-275-phase2-decompose");

const ENV_DEFAULTS = Object.freeze({
  SIM_PRESET: "",
  SIM_SEED: String(SEED),
  SIM_RUNS: String(RUNS_PER_CLASS),
  SIM_CALIBRATION_RUNS: String(CALIBRATION_RUNS),
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
  SIM_SCENARIOS: SCENARIO_IDS.join(",")
});

function applyFixedEnvironment() {
  if (process.env.SIM_PARALLEL !== undefined) {
    throw new Error("Issue #275 phase 2 omits SIM_PARALLEL");
  }
  if (process.env.SIM_MAP_CACHE_ENTRIES !== undefined) {
    throw new Error("Issue #275 phase 2 omits SIM_MAP_CACHE_ENTRIES");
  }
  for (const [key, value] of Object.entries(ENV_DEFAULTS)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
      continue;
    }
    if (process.env[key] !== value) {
      throw new Error(
        `Issue #275 phase 2 fixed env mismatch: ${key}=${process.env[key]} != ${value}`
      );
    }
  }
}

applyFixedEnvironment();

const simulationModule = await import("./sim_depth_material_ev.js");
const {
  calibrateCoreScoringProfile,
  getScenarioById,
  resetSimulationRandom,
  simulateRun,
  SIM_CLASSES
} = simulationModule;

if (!SMOKE && JSON.stringify(SIM_CLASSES) !== JSON.stringify(BASIC_CLASSES)) {
  throw new Error(`unexpected SIM_CLASSES: ${SIM_CLASSES.join(",")}`);
}

export function generateSharedRunFloor(args) {
  return simulationModule.generateSharedRunFloor(args);
}

function hashSeed(text) {
  let seed = 2166136261;
  for (let index = 0; index < text.length; index++) {
    seed ^= text.charCodeAt(index);
    seed = Math.imul(seed, 16777619);
  }
  return seed >>> 0;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function scenarioForRun(runIndex) {
  const position = ((runIndex * 37) % RUNS_PER_CLASS + 0.5) /
    RUNS_PER_CLASS * WORKSHOP_TOTAL;
  let cumulative = 0;
  for (const [scenarioId, count] of WORKSHOP_DISTRIBUTION) {
    cumulative += count;
    if (position < cumulative) return scenarioId;
  }
  return WORKSHOP_DISTRIBUTION.at(-1)[0];
}

function fleeRoundStats(result) {
  const encounters = result.diagnostics?.encounters;
  if (!Array.isArray(encounters)) {
    throw new Error("phase 2 decomposition requires compact encounter diagnostics");
  }
  const fleeEncounters = encounters.filter(encounter => encounter.result === "flee");
  if (fleeEncounters.length !== result.fleeCount) {
    throw new Error(
      `flee diagnostic mismatch: diagnostics=${fleeEncounters.length} result=${result.fleeCount}`
    );
  }
  const fleeEncounterRounds = fleeEncounters.reduce(
    (sum, encounter) => sum + (
      Array.isArray(encounter.rounds)
        ? encounter.rounds.length
        : Number(encounter.rounds || 0)
    ),
    0
  );
  return {
    fleeEncounterCount: fleeEncounters.length,
    fleeEncounterRounds,
    fleeTimeCost: fleeEncounterRounds * COMBAT_TURN_WEIGHT
  };
}

function projectResult(result, task) {
  const flee = fleeRoundStats(result);
  const deathLoss = result.died
    ? result.carriedMaterials - result.bankedMaterials
    : 0;
  if (result.carriedMaterials < result.bankedMaterials || deathLoss < 0) {
    throw new Error(
      `banking invariant failed: carried=${result.carriedMaterials} banked=${result.bankedMaterials}`
    );
  }
  if (flee.fleeTimeCost > result.timeCost) {
    throw new Error(
      `flee time invariant failed: flee=${flee.fleeTimeCost} total=${result.timeCost}`
    );
  }
  return {
    targetDepth: task.targetDepth,
    className: task.className,
    runIndex: task.runIndex,
    scenarioId: task.scenarioId,
    outcome: result.outcome,
    survived: Boolean(result.survived),
    died: Boolean(result.died),
    reachedFloor: result.reachedFloor,
    finalLevel: result.finalLevel,
    targetReached: result.reachedFloor >= task.targetDepth,
    materialAcquired: result.materialAcquired,
    materialConsumed: result.materialConsumed,
    carriedMaterials: result.carriedMaterials,
    bankedMaterials: result.bankedMaterials,
    deathBankLoss: deathLoss,
    timeCost: result.timeCost,
    steps: result.steps,
    combatRounds: result.combatRounds,
    deathLossEvPerTime: result.timeCost > 0
      ? deathLoss / result.timeCost
      : 0,
    deathFreeMaterialEvPerTime: result.timeCost > 0
      ? result.carriedMaterials / result.timeCost
      : 0,
    materialEvPerTime: result.timeCost > 0
      ? result.bankedMaterials / result.timeCost
      : 0,
    fleeCount: result.fleeCount,
    fleeRun: result.fleeCount > 0,
    fleeEncounterCount: flee.fleeEncounterCount,
    fleeEncounterRounds: flee.fleeEncounterRounds,
    fleeTimeCost: flee.fleeTimeCost,
    nonFleeTimeCost: result.timeCost - flee.fleeTimeCost
  };
}

export function runIssue275Phase2Task(task, context) {
  const baseScenario = getScenarioById(task.scenarioId);
  const scenario = { ...baseScenario, simDiagnosticLevel: "compact" };
  resetSimulationRandom(hashSeed(
    `${SEED}:issue275-phase2:${task.scenarioId}:${task.className}:${task.runIndex}`
  ));
  const result = simulateRun({
    className: task.className,
    startFloor: 1,
    targetDepth: task.targetDepth,
    runIndex: task.runIndex,
    seriesId: "issue275-phase2",
    scoringProfile: context.scoringProfiles[task.scenarioId],
    scenario,
    workshop: scenario.workshop,
    collectDiagnostics: true
  });
  return projectResult(result, task);
}

function wilson(successes, trials) {
  if (trials <= 0) {
    return { estimate: null, low: null, high: null, trials, uncertain: true };
  }
  const p = successes / trials;
  const z2 = R95 * R95;
  const denominator = 1 + z2 / trials;
  const center = (p + z2 / (2 * trials)) / denominator;
  const margin = R95 * Math.sqrt(
    (p * (1 - p) + z2 / (4 * trials)) / trials
  ) / denominator;
  return {
    estimate: p,
    low: Math.max(0, center - margin),
    high: Math.min(1, center + margin),
    trials,
    uncertain: trials < 30
  };
}

function meanStats(values) {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) {
    return { mean: null, low: null, high: null, trials: 0, uncertain: true };
  }
  const mean = finite.reduce((sum, value) => sum + value, 0) / finite.length;
  if (finite.length < 2) {
    return { mean, low: null, high: null, trials: finite.length, uncertain: true };
  }
  const variance = finite.reduce(
    (sum, value) => sum + (value - mean) ** 2,
    0
  ) / (finite.length - 1);
  const margin = R95 * Math.sqrt(variance / finite.length);
  return {
    mean,
    low: mean - margin,
    high: mean + margin,
    trials: finite.length,
    uncertain: finite.length < 30
  };
}

function conditionalMean(rows, predicate, field) {
  return meanStats(rows.filter(predicate).map(row => row[field]));
}

function summarizeRows(rows, targetDepth, className) {
  const selected = rows.filter(
    row => row.targetDepth === targetDepth &&
      (className === null || row.className === className)
  );
  const runs = selected.length;
  const deaths = selected.filter(row => row.died);
  const fleeRuns = selected.filter(row => row.fleeRun);
  const averageTime = meanStats(selected.map(row => row.timeCost));
  const averageFleeTime = meanStats(selected.map(row => row.fleeTimeCost));
  return {
    targetDepth,
    className,
    runs,
    materialAcquired: meanStats(selected.map(row => row.materialAcquired)),
    materialConsumed: meanStats(selected.map(row => row.materialConsumed)),
    carriedMaterials: meanStats(selected.map(row => row.carriedMaterials)),
    bankedMaterials: meanStats(selected.map(row => row.bankedMaterials)),
    deathBankLoss: meanStats(selected.map(row => row.deathBankLoss)),
    deathLossEvPerTime: meanStats(selected.map(row => row.deathLossEvPerTime)),
    deathFreeMaterialEvPerTime: meanStats(
      selected.map(row => row.deathFreeMaterialEvPerTime)
    ),
    materialEvPerTime: meanStats(selected.map(row => row.materialEvPerTime)),
    averageTimeCost: averageTime,
    averageSteps: meanStats(selected.map(row => row.steps)),
    averageCombatRounds: meanStats(selected.map(row => row.combatRounds)),
    averageFleeCount: meanStats(selected.map(row => row.fleeCount)),
    averageFleeEncounterRounds: meanStats(selected.map(row => row.fleeEncounterRounds)),
    fleeTimeCost: averageFleeTime,
    nonFleeTimeCost: meanStats(selected.map(row => row.nonFleeTimeCost)),
    fleeTimeShare: meanStats(selected.map(row =>
      row.timeCost > 0 ? row.fleeTimeCost / row.timeCost : 0
    )),
    deathBankLossOnDeath: conditionalMean(selected, row => row.died, "deathBankLoss"),
    fleeTimeCostOnFleeRun: conditionalMean(fleeRuns, () => true, "fleeTimeCost"),
    fleeRunTimeCost: conditionalMean(selected, row => row.fleeRun, "timeCost"),
    noFleeRunTimeCost: conditionalMean(selected, row => !row.fleeRun, "timeCost"),
    survivalRate: wilson(selected.filter(row => row.survived).length, runs),
    deathRate: wilson(deaths.length, runs),
    fleeRunRate: wilson(fleeRuns.length, runs),
    targetReachedRate: wilson(selected.filter(row => row.targetReached).length, runs)
  };
}

function indexRows(rows, className) {
  const selected = className === null
    ? rows
    : rows.filter(row => row.className === className);
  return new Map(selected.map(row => [
    `${row.className}:${row.runIndex}:${row.targetDepth}`,
    row
  ]));
}

function pairedRows(rows, className) {
  const indexed = indexRows(rows, className);
  const pairs = [];
  const classes = className === null ? BASIC_CLASSES : [className];
  for (const currentClass of classes) {
    for (let runIndex = 0; runIndex < RUNS_PER_CLASS; runIndex++) {
      const from = indexed.get(`${currentClass}:${runIndex}:5`);
      const to = indexed.get(`${currentClass}:${runIndex}:10`);
      if (!from || !to) continue;
      pairs.push({ from, to });
    }
  }
  return pairs;
}

function pairedDepthDelta(rows, className, field) {
  return meanStats(pairedRows(rows, className).map(({ from, to }) => to[field] - from[field]));
}

function classifyDelta(stat) {
  if (!stat || stat.mean === null) return "未観測";
  if (stat.high < 0) return "統計的低下";
  if (stat.low > 0) return "統計的上昇";
  return "CI重複";
}

function pairedRatioDecomposition(rows, className) {
  const pairs = pairedRows(rows, className);
  const numerator = [];
  const denominator = [];
  const total = [];
  for (const { from, to } of pairs) {
    const fromTime = Math.max(1e-9, from.timeCost);
    const toTime = Math.max(1e-9, to.timeCost);
    const numeratorEffect = 0.5 * (to.bankedMaterials - from.bankedMaterials) * (
      1 / fromTime + 1 / toTime
    );
    const denominatorEffect = 0.5 * (from.bankedMaterials + to.bankedMaterials) * (
      1 / toTime - 1 / fromTime
    );
    numerator.push(numeratorEffect);
    denominator.push(denominatorEffect);
    total.push(to.materialEvPerTime - from.materialEvPerTime);
  }
  return {
    numerator: meanStats(numerator),
    denominator: meanStats(denominator),
    total: meanStats(total)
  };
}

function buildGroup(rows, className) {
  const b5 = summarizeRows(rows, 5, className);
  const b10 = summarizeRows(rows, 10, className);
  return {
    className,
    b5,
    b10,
    paired: {
      materialAcquired: pairedDepthDelta(rows, className, "materialAcquired"),
      materialConsumed: pairedDepthDelta(rows, className, "materialConsumed"),
      carriedMaterials: pairedDepthDelta(rows, className, "carriedMaterials"),
      bankedMaterials: pairedDepthDelta(rows, className, "bankedMaterials"),
      deathBankLoss: pairedDepthDelta(rows, className, "deathBankLoss"),
      deathLossEvPerTime: pairedDepthDelta(rows, className, "deathLossEvPerTime"),
      materialEvPerTime: pairedDepthDelta(rows, className, "materialEvPerTime"),
      timeCost: pairedDepthDelta(rows, className, "timeCost"),
      steps: pairedDepthDelta(rows, className, "steps"),
      combatRounds: pairedDepthDelta(rows, className, "combatRounds"),
      fleeCount: pairedDepthDelta(rows, className, "fleeCount"),
      fleeEncounterRounds: pairedDepthDelta(rows, className, "fleeEncounterRounds"),
      fleeTimeCost: pairedDepthDelta(rows, className, "fleeTimeCost"),
      nonFleeTimeCost: pairedDepthDelta(rows, className, "nonFleeTimeCost")
    },
    ratioDecomposition: pairedRatioDecomposition(rows, className)
  };
}

function formatPercent(stat, digits = 1) {
  if (!stat || stat.estimate === null) return "未観測";
  const suffix = stat.uncertain ? " 未確定" : "";
  return `${(stat.estimate * 100).toFixed(digits)}% ` +
    `[${(stat.low * 100).toFixed(digits)},${(stat.high * 100).toFixed(digits)}; ` +
    `N=${stat.trials}]${suffix}`;
}

function formatMean(stat, digits = 2) {
  if (!stat || stat.mean === null) return "未観測";
  if (stat.low === null) return `${stat.mean.toFixed(digits)} [未確定; N=${stat.trials}]`;
  const suffix = stat.uncertain ? " 未確定" : "";
  return `${stat.mean.toFixed(digits)} ` +
    `[${stat.low.toFixed(digits)},${stat.high.toFixed(digits)}; ` +
    `N=${stat.trials}]${suffix}`;
}

function formatDelta(stat, digits = 2) {
  return `${formatMean(stat, digits)} (${classifyDelta(stat)})`;
}

function buildMarkdown(summary) {
  const all = summary.groups.all;
  const lines = [
    "# Issue #275 フェーズ2 分解測定",
    "",
    "## 判定",
    "",
    "- フェーズ1で最大の折れ点だった B5→B10 を、候補変更なし・現行実src経路で分解した。",
    `- 全職合算 EV/時間: B5 ${formatMean(all.b5.materialEvPerTime, 4)} → B10 ${formatMean(all.b10.materialEvPerTime, 4)}。paired差 ${formatDelta(all.paired.materialEvPerTime, 4)}。`,
    `- 分子（bank素材）寄与: ${formatMean(all.ratioDecomposition.numerator, 4)}。分母（時間）寄与: ${formatMean(all.ratioDecomposition.denominator, 4)}。合計: ${formatMean(all.ratioDecomposition.total, 4)}。`,
    `- 死亡bank損失: B5 ${formatMean(all.b5.deathBankLoss)} → B10 ${formatMean(all.b10.deathBankLoss)}。死亡時 conditional は B5 ${formatMean(all.b5.deathBankLossOnDeath)}、B10 ${formatMean(all.b10.deathBankLossOnDeath)}。`,
    `- 死亡で失うEV/時間: B5 ${formatMean(all.b5.deathLossEvPerTime, 4)}、B10 ${formatMean(all.b10.deathLossEvPerTime, 4)}。死亡損失なし反実仮想のEV/時間: B5 ${formatMean(all.b5.deathFreeMaterialEvPerTime, 4)}、B10 ${formatMean(all.b10.deathFreeMaterialEvPerTime, 4)}。`,
    `- 逃走戦闘に直接使った時間: B5 ${formatMean(all.b5.fleeTimeCost)} / ${formatMean(all.b5.averageTimeCost)}、B10 ${formatMean(all.b10.fleeTimeCost)} / ${formatMean(all.b10.averageTimeCost)}。逃走時間比率は B5 ${formatMean(all.b5.fleeTimeShare, 3)} → B10 ${formatMean(all.b10.fleeTimeShare, 3)}。`,
    "- 判定: 分子は増えるが、分母の時間増加が上回る。死亡bank損失はB10で増える。逃走は時間分母の観測要素だが、今回の測定はno-flee反実仮想ではなく、逃走そのものを原因と断定しない。",
    "- 候補（EXP・逃走方針・報酬・撤退コスト・bank保護）のwhat-if測定、実装、PRは未実施。",
    "",
    "## 全職合算",
    "",
    `- B5: 素材入手 ${formatMean(all.b5.materialAcquired)}、消費 ${formatMean(all.b5.materialConsumed)}、携行 ${formatMean(all.b5.carriedMaterials)}、bank ${formatMean(all.b5.bankedMaterials)}、時間 ${formatMean(all.b5.averageTimeCost)}。`,
    `- B10: 素材入手 ${formatMean(all.b10.materialAcquired)}、消費 ${formatMean(all.b10.materialConsumed)}、携行 ${formatMean(all.b10.carriedMaterials)}、bank ${formatMean(all.b10.bankedMaterials)}、時間 ${formatMean(all.b10.averageTimeCost)}。`,
    `- B5→B10 paired差: 入手 ${formatDelta(all.paired.materialAcquired)}、携行 ${formatDelta(all.paired.carriedMaterials)}、bank ${formatDelta(all.paired.bankedMaterials)}、死亡損失 ${formatDelta(all.paired.deathBankLoss)}。`,
    `- B5→B10 paired差: 時間 ${formatDelta(all.paired.timeCost)}（歩数 ${formatDelta(all.paired.steps)}、戦闘round ${formatDelta(all.paired.combatRounds)}）、逃走回数 ${formatDelta(all.paired.fleeCount)}、逃走round ${formatDelta(all.paired.fleeEncounterRounds)}、逃走時間 ${formatDelta(all.paired.fleeTimeCost)}。`,
    `- 率: 死亡 ${formatPercent(all.b5.deathRate)} → ${formatPercent(all.b10.deathRate)}、逃走run ${formatPercent(all.b5.fleeRunRate)} → ${formatPercent(all.b10.fleeRunRate)}。`,
    "",
    "## 職業別",
    ""
  ];
  for (const className of BASIC_CLASSES) {
    const group = summary.groups[className];
    lines.push(
      `### ${className}`,
      "",
      `- B5: bank ${formatMean(group.b5.bankedMaterials)} / 時間 ${formatMean(group.b5.averageTimeCost)} / EV/時間 ${formatMean(group.b5.materialEvPerTime, 4)} / 死亡 ${formatPercent(group.b5.deathRate)} / 逃走run ${formatPercent(group.b5.fleeRunRate)}。`,
      `- B10: bank ${formatMean(group.b10.bankedMaterials)} / 時間 ${formatMean(group.b10.averageTimeCost)} / EV/時間 ${formatMean(group.b10.materialEvPerTime, 4)} / 死亡 ${formatPercent(group.b10.deathRate)} / 逃走run ${formatPercent(group.b10.fleeRunRate)}。`,
      `- B5→B10: EV/時間 ${formatDelta(group.paired.materialEvPerTime, 4)}、bank ${formatDelta(group.paired.bankedMaterials)}、時間 ${formatDelta(group.paired.timeCost)}、死亡損失 ${formatDelta(group.paired.deathBankLoss)}、逃走時間 ${formatDelta(group.paired.fleeTimeCost)}。`,
      ""
    );
  }
  lines.push(
    "## 測定条件",
    "",
    `- seed=${summary.seed}、B5/B10、各職 N=${summary.runsPerClass}、calibration N=${summary.calibrationRuns}。全職合算 N=${summary.runsPerClass * BASIC_CLASSES.length}。`,
    `- 工房分布=${WORKSHOP_DISTRIBUTION.map(([id, count]) => `${id}:${count}/${WORKSHOP_TOTAL}`).join(", ")}。`,
    "- 現行固定env: departure kit `TOWN_PORTAL + HEAL_POTION×4 + ANTIDOTE + GUARD_POTION`、powder鑑定、`FLEE_POLICY=ev`、`FLEE_HP_THRESHOLD=0.20`、`HEAL_POTION_THRESHOLD=0.55`、罠 conservative/ev、状態治療 smart、portal HP<=35%・薬<=0・B3以降。",
    "- `SIM_PARALLEL` / `SIM_MAP_CACHE_ENTRIES` は未指定。runtime既定値を使用。",
    "- `generateRunFloor`、現行戦闘/報酬/装備更新、罠、状態治療、回復薬、`TOWN_PORTAL`、killHeal、core判定を実経路でモデル化。任意商人購入、MP/強化アイテム能動使用、任意寄り道、人間の敵別判断は非モデル化。",
    "- B5/B10 は同一 `(scenario,class,runIndex)` を対応。paired差は同一seed系列の観測差。target depth変更による後続軌跡の変化を無視しない。",
    "- 逃走時間 = diagnosticsで `result=flee` の戦闘round × `COMBAT_TURN_WEIGHT=3`。逃走後の再探索・再遭遇時間は非逃走時間側に残るため、逃走の因果効果全体ではない。",
    "",
    "## 監査・再現",
    "",
    `- source commit: ${summary.measurement.sourceCommit}`,
    `- origin/main ancestor: ${summary.measurement.originMainAncestor}`,
    `- stale tree allowed: ${summary.measurement.staleTreeAllowed}`,
    `- env hash: ${summary.envHash}`,
    `- raw JSONL SHA-256: ${summary.rawSha256}`,
    `- summary JSON SHA-256: ${summary.summarySha256}`,
    `- resolved parallelism: ${summary.measurement.resolvedParallelism}（SIM_PARALLEL未指定）`,
    `- calibration wall-clock: ${summary.measurement.calibrationWallSeconds.toFixed(3)}s`,
    `- simulation wall-clock: ${summary.measurement.simulationWallSeconds.toFixed(3)}s`,
    `- total CPU（user+system）: ${summary.measurement.totalCpuSeconds.toFixed(3)}s`,
    `- raw: scratch/results/${RESULT_STEM}.raw.jsonl`,
    `- summary: scratch/results/${RESULT_STEM}.json`,
    "",
    "再現:",
    "",
    "```sh",
    "node --check scratch/measure_issue_275_phase2_decompose.js",
    "ISSUE275_PHASE2_SMOKE=1 node scratch/measure_issue_275_phase2_decompose.js",
    "node scratch/measure_issue_275_phase2_decompose.js",
    "```",
    "",
    "## プレイヤー影響",
    "",
    "- 本フェーズは観測のみ。ゲームコード・balance値・設計canonへの変更なし。プレイヤー影響なし。"
  );
  return `${lines.join("\n")}\n`;
}

async function main() {
  const scoringProfiles = {};
  const calibrationStarted = performance.now();
  const calibrationCpuStarted = process.cpuUsage();
  for (const scenarioId of SCENARIO_IDS) {
    const scenario = getScenarioById(scenarioId);
    resetSimulationRandom(SEED);
    scoringProfiles[scenarioId] = calibrateCoreScoringProfile(
      CALIBRATION_RUNS,
      scenario,
      "powder",
      scenario.workshop
    );
  }
  const calibrationCpu = process.cpuUsage(calibrationCpuStarted);
  const calibrationWallSeconds = (performance.now() - calibrationStarted) / 1000;

  const tasks = TARGET_DEPTHS.flatMap(targetDepth =>
    BASIC_CLASSES.flatMap(className =>
      Array.from({ length: RUNS_PER_CLASS }, (_, runIndex) => ({
        targetDepth,
        className,
        runIndex,
        scenarioId: scenarioForRun(runIndex)
      }))
    )
  );
  const resolvedParallelism = resolveSimParallelism(tasks.length);
  const simulationStarted = performance.now();
  const simulationCpuStarted = process.cpuUsage();
  const rows = await runSimTasks({
    moduleUrl: pathToFileURL(fileURLToPath(import.meta.url)).href,
    exportName: "runIssue275Phase2Task",
    runTask: runIssue275Phase2Task,
    tasks,
    context: { scoringProfiles },
    mapGeneratorExportName: "generateSharedRunFloor"
  });
  const simulationCpu = process.cpuUsage(simulationCpuStarted);
  const simulationWallSeconds = (performance.now() - simulationStarted) / 1000;
  if (rows.length !== tasks.length) {
    throw new Error(`raw result audit failed: rows=${rows.length}/${tasks.length}`);
  }
  rows.sort((left, right) =>
    left.className.localeCompare(right.className) ||
    left.runIndex - right.runIndex ||
    left.targetDepth - right.targetDepth
  );

  const rawText = `${rows.map(row => JSON.stringify(row)).join("\n")}\n`;
  const rawSha256 = sha256(rawText);
  const measurementProvenance = simulationModule.MEASUREMENT_PROVENANCE || {
    sourceCommit: "test",
    originMainAncestor: null,
    staleTreeAllowed: null
  };
  const environment = {
    ...ENV_DEFAULTS,
    ISSUE275_PHASE2_MODE: SMOKE ? "smoke" : "measurement",
    ISSUE275_PHASE2_TARGET_DEPTHS: TARGET_DEPTHS.join(","),
    ISSUE275_PHASE2_CLASSES: BASIC_CLASSES.join(","),
    ISSUE275_PHASE2_WORKSHOP_DISTRIBUTION: WORKSHOP_DISTRIBUTION
      .map(([id, count]) => `${id}:${count}/${WORKSHOP_TOTAL}`)
      .join(","),
    SIM_PARALLEL: "<omitted; runtime default>",
    SIM_MAP_CACHE_ENTRIES: "<omitted; runtime default 1024>",
    SIM_DIAGNOSTICS: "compact per run"
  };
  const envCanonical = Object.entries(environment)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n") + "\n";
  const envHash = sha256(envCanonical);
  const measurement = {
    sourceCommit: measurementProvenance.sourceCommit,
    originMainAncestor: measurementProvenance.originMainAncestor,
    staleTreeAllowed: measurementProvenance.staleTreeAllowed,
    resolvedParallelism,
    calibrationWallSeconds,
    simulationWallSeconds,
    totalCpuSeconds: (
      calibrationCpu.user + calibrationCpu.system +
      simulationCpu.user + simulationCpu.system
    ) / 1e6
  };
  const groups = Object.fromEntries([
    ["all", buildGroup(rows, null)],
    ...BASIC_CLASSES.map(className => [className, buildGroup(rows, className)])
  ]);
  const summaryWithoutHash = {
    issue: 275,
    phase: "phase2-decompose",
    mode: SMOKE ? "smoke" : "measurement",
    seed: SEED,
    runsPerClass: RUNS_PER_CLASS,
    calibrationRuns: CALIBRATION_RUNS,
    targetDepths: TARGET_DEPTHS,
    classes: BASIC_CLASSES,
    workshopDistribution: WORKSHOP_DISTRIBUTION,
    environment,
    envHash,
    rawSha256,
    rows: rows.length,
    measurement,
    groups,
    reproductionCommand: "node scratch/measure_issue_275_phase2_decompose.js"
  };
  const summaryPreHash = `${JSON.stringify(summaryWithoutHash, null, 2)}\n`;
  const summarySha256 = sha256(summaryPreHash);
  const summary = { ...summaryWithoutHash, summarySha256 };
  const resultDir = new URL("./results/", new URL("./", import.meta.url));
  mkdirSync(resultDir, { recursive: true });
  writeFileSync(new URL(`${RESULT_STEM}.raw.jsonl`, resultDir), rawText);
  writeFileSync(
    new URL(`${RESULT_STEM}.json`, resultDir),
    `${JSON.stringify(summary, null, 2)}\n`
  );
  writeFileSync(new URL(`${RESULT_STEM}.md`, resultDir), buildMarkdown(summary));
  process.stdout.write(JSON.stringify({
    output: `scratch/results/${RESULT_STEM}.md`,
    summaryOutput: `scratch/results/${RESULT_STEM}.json`,
    rawOutput: `scratch/results/${RESULT_STEM}.raw.jsonl`,
    rows: rows.length,
    runsPerClass: RUNS_PER_CLASS,
    calibrationRuns: CALIBRATION_RUNS,
    envHash,
    rawSha256,
    summarySha256,
    sourceCommit: measurement.sourceCommit,
    originMainAncestor: measurement.originMainAncestor,
    resolvedParallelism,
    wallClockSeconds: calibrationWallSeconds + simulationWallSeconds,
    cpuTotalSeconds: measurement.totalCpuSeconds
  }, null, 2) + "\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
