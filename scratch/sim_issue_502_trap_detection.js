// sim-scope: run — #502 不意打ち撤廃・trapSense転換比較
/* global console, process */

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { resolveSimParallelism, runSimTasks } from "./sim_parallel.js";

const BASIC_CLASSES = Object.freeze(["Fighter", "Thief", "Priest", "Mage"]);
const WORKSHOP_DISTRIBUTION = Object.freeze([
  { scenarioId: "workshop-empty", observedRuns: 30 },
  { scenarioId: "workshop-stats", observedRuns: 74 },
  { scenarioId: "workshop-gear", observedRuns: 69 },
  { scenarioId: "workshop-blood-wand", observedRuns: 216 },
  { scenarioId: "workshop-blood-wand-spells", observedRuns: 47 },
  { scenarioId: "workshop-complete", observedRuns: 764 }
]);
const WORKSHOP_TOTAL = WORKSHOP_DISTRIBUTION.reduce(
  (sum, row) => sum + row.observedRuns,
  0
);
const WORKSHOP_SCENARIOS = Object.freeze(
  WORKSHOP_DISTRIBUTION.map(row => row.scenarioId)
);
const TARGET_DEPTH = 21;
const R95 = 1.959963984540054;
const OUTPUT_STEM = "issue-502-trap-detection";
const SMOKE = process.env.ISSUE502_SMOKE === "1";

const ENV_DEFAULTS = Object.freeze({
  SIM_PRESET: "",
  SIM_SEED: "502",
  SIM_RUNS: "3000",
  SIM_CALIBRATION_RUNS: "1000",
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
  SIM_SCENARIOS: WORKSHOP_SCENARIOS.join(","),
  SIM_DIAGNOSTICS: "off"
});

for (const [key, value] of Object.entries(ENV_DEFAULTS)) {
  if (process.env[key] === undefined) process.env[key] = value;
}
if (process.env.SIM_PARALLEL !== undefined || process.env.SIM_MAP_CACHE_ENTRIES !== undefined) {
  throw new Error("Issue #502 measurement omits SIM_PARALLEL and SIM_MAP_CACHE_ENTRIES");
}

const RUNS_PER_CLASS = SMOKE ? 2 : Number(process.env.SIM_RUNS);
const CALIBRATION_RUNS = SMOKE ? 1 : Number(process.env.SIM_CALIBRATION_RUNS);
if (!Number.isInteger(RUNS_PER_CLASS) || RUNS_PER_CLASS < 1) {
  throw new Error(`SIM_RUNS must be a positive integer: ${RUNS_PER_CLASS}`);
}
if (!Number.isInteger(CALIBRATION_RUNS) || CALIBRATION_RUNS < 1) {
  throw new Error(`SIM_CALIBRATION_RUNS must be a positive integer: ${CALIBRATION_RUNS}`);
}

const {
  calibrateCoreScoringProfile,
  getResolvedSimulationEnv,
  getScenarioById,
  resetSimulationRandom,
  simulateRun,
  SIM_CLASSES
} = await import("./sim_depth_material_ev.js");

if (BASIC_CLASSES.some(className => !SIM_CLASSES.includes(className))) {
  throw new Error(`basic classes missing: ${BASIC_CLASSES.join(",")}`);
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

function scenarioForRun(runIndex, runsPerClass) {
  const position = ((runIndex * 37) % runsPerClass + 0.5) /
    runsPerClass * WORKSHOP_TOTAL;
  let cumulative = 0;
  for (const row of WORKSHOP_DISTRIBUTION) {
    cumulative += row.observedRuns;
    if (position < cumulative) return row.scenarioId;
  }
  return WORKSHOP_DISTRIBUTION.at(-1).scenarioId;
}

function endpoint(result, floor) {
  const entrant = result.reachedFloor >= floor;
  return {
    entrant,
    breakthrough: entrant && result.reachedFloor > floor,
    death: entrant && result.deathFloor === floor,
    retreat: entrant && result.reachedFloor === floor && result.deathFloor !== floor
  };
}

function createCondition(id, label, scenario, metadata = {}) {
  return { id, label, scenario, ...metadata };
}

const CONDITIONS = Object.freeze([
  createCondition(
    "current",
    "現行（深度依存察知）",
    { floorTrapDetection: "legacy", trapSenseDisposition: "legacy-detection" },
    { comparison: true }
  ),
  createCondition(
    "removed",
    "確定察知 + trapSense撤去",
    { floorTrapDetection: "certain", trapSenseDisposition: "removed" },
    { comparison: true }
  ),
  createCondition(
    "disarm",
    "確定察知 + trapSenseを解除へ転換",
    { floorTrapDetection: "certain", trapSenseDisposition: "disarm" },
    { comparison: true }
  ),
  createCondition(
    "disarm-plus2",
    "解除転換 + 回復+2.0本/run",
    {
      floorTrapDetection: "certain",
      trapSenseDisposition: "disarm",
      chestHealPotionExtraChance: 0.072
    },
    { recovery: true }
  )
]);

function buildTasks() {
  return CONDITIONS.flatMap(condition =>
    BASIC_CLASSES.flatMap(className =>
      Array.from({ length: RUNS_PER_CLASS }, (_, runIndex) => ({
        conditionId: condition.id,
        className,
        runIndex,
        scenarioId: scenarioForRun(runIndex, RUNS_PER_CLASS)
      }))
    )
  );
}

function buildScoringProfiles() {
  const profiles = {};
  const started = performance.now();
  const cpuStarted = process.cpuUsage();
  for (const scenarioId of WORKSHOP_SCENARIOS) {
    const scenario = {
      ...getScenarioById(scenarioId),
      ...CONDITIONS[0].scenario
    };
    resetSimulationRandom(Number(process.env.SIM_SEED) >>> 0);
    profiles[scenarioId] = calibrateCoreScoringProfile(
      CALIBRATION_RUNS,
      scenario,
      "powder",
      scenario.workshop
    );
  }
  const cpu = process.cpuUsage(cpuStarted);
  return {
    profiles,
    wallSeconds: (performance.now() - started) / 1000,
    cpuSeconds: (cpu.user + cpu.system) / 1e6
  };
}

function scenarioForCondition(condition, scenarioId) {
  return {
    ...getScenarioById(scenarioId),
    ...condition.scenario
  };
}

function compactRun(result, condition, task) {
  const causes = result.trapActivationCauses || {};
  const floorEncounterCount = result.trapEncounterBySource?.floor || 0;
  const floorDisarmAttempts = Math.max(
    0,
    (result.trapDisarmAttempts || 0) - (result.chestDisarmAttempts || 0)
  );
  const floorDisarmSuccesses = Math.max(
    0,
    (result.trapDisarmSuccesses || 0) - (result.chestDisarmSuccesses || 0)
  );
  const floorDisarms = Math.max(
    0,
    (result.trapDisarms || 0) - (result.chestDisarmSuccesses || 0)
  );
  const acquired = result.healPotionsAcquiredBySource || {};
  return {
    conditionId: condition.id,
    className: task.className,
    scenarioId: task.scenarioId,
    runIndex: task.runIndex,
    outcome: result.died ? "death" : "retreat",
    reachedFloor: result.reachedFloor,
    deathFloor: result.deathFloor,
    endpoints: {
      b5: endpoint(result, 5),
      b10: endpoint(result, 10)
    },
    bankedMaterials: result.bankedMaterials,
    carriedMaterials: result.carriedMaterials,
    timeCost: result.timeCost,
    materialEvPerTime: result.timeCost > 0
      ? result.bankedMaterials / result.timeCost
      : 0,
    bankRetentionRate: result.carriedMaterials > 0
      ? result.bankedMaterials / result.carriedMaterials
      : 1,
    recoveryExtraUnits: acquired["chest-extra"] || 0,
    equipmentFound: result.equipmentFound || 0,
    trap: {
      floorEncounters: floorEncounterCount,
      floorActivations: result.trapActivationsBySource?.floor || 0,
      floorDamageHp: result.trapDamageHpBySource?.floor || 0,
      floorDetections: result.trapDetections || 0,
      floorDetectionAttempts: result.trapDetectionAttempts || 0,
      floorDisarms,
      floorDisarmAttempts,
      floorDisarmSuccesses,
      floorDisarmFailures: result.trapDisarmFailures || 0,
      ambush: causes.ambush || 0,
      chosen: causes.chosen || 0,
      disarmFailure: causes.disarmFailure || 0,
      avoidanceExtraSteps: result.trapAvoidanceExtraSteps || 0,
      avoidanceCount: result.trapAvoided || 0
    },
    trapSense: {
      items: result.trapSenseItemsFound || 0,
      values: { ...(result.trapSenseFoundByValue || {}) }
    }
  };
}

export function runIssue502Task(task, context) {
  const condition = context.conditions[task.conditionId];
  const scenario = scenarioForCondition(condition, task.scenarioId);
  resetSimulationRandom(hashSeed(
    `${process.env.SIM_SEED}:${condition.id}:${task.className}:${task.runIndex}`
  ));
  const result = simulateRun({
    className: task.className,
    startFloor: 1,
    targetDepth: TARGET_DEPTH,
    runIndex: task.runIndex,
    seriesId: `issue502-${condition.id}`,
    scoringProfile: context.scoringProfiles[task.scenarioId],
    scenario,
    workshop: scenario.workshop
  });
  return compactRun(result, condition, task);
}

function createStats() {
  return { n: 0, sum: 0, sumSquares: 0 };
}

function addStats(stats, value) {
  if (!Number.isFinite(value)) return;
  stats.n++;
  stats.sum += value;
  stats.sumSquares += value * value;
}

function summarizeStats(stats) {
  if (stats.n === 0) {
    return { n: 0, mean: null, ci95: null, status: "未観測" };
  }
  const mean = stats.sum / stats.n;
  if (stats.n < 2) {
    return { n: stats.n, mean, ci95: null, status: "未確定" };
  }
  const variance = Math.max(
    0,
    (stats.sumSquares - stats.sum * stats.sum / stats.n) / (stats.n - 1)
  );
  const margin = R95 * Math.sqrt(variance / stats.n);
  return {
    n: stats.n,
    mean,
    ci95: [mean - margin, mean + margin],
    status: stats.n < 30 ? "未確定" : "監査"
  };
}

function wilson(successes, trials) {
  if (trials <= 0) {
    return { successes, trials, rate: null, ci95: null, status: "未観測" };
  }
  const rate = successes / trials;
  const z2 = R95 * R95;
  const denominator = 1 + z2 / trials;
  const center = (rate + z2 / (2 * trials)) / denominator;
  const margin = R95 * Math.sqrt(
    (rate * (1 - rate) + z2 / (4 * trials)) / trials
  ) / denominator;
  return {
    successes,
    trials,
    rate,
    ci95: [Math.max(0, center - margin), Math.min(1, center + margin)],
    status: trials < 30 ? "未確定" : "監査"
  };
}

function createOutcomeCounts() {
  return { entrants: 0, breakthroughs: 0, deaths: 0, retreats: 0 };
}

function createAccumulator() {
  return {
    runs: 0,
    reachedFloor: createStats(),
    bankRetentionRate: createStats(),
    materialEvPerTime: createStats(),
    timeCost: createStats(),
    survival: 0,
    outcomes: { 5: createOutcomeCounts(), 10: createOutcomeCounts() },
    recoveryExtraUnits: createStats(),
    trap: {
      floorEncounters: 0,
      floorActivations: 0,
      floorDamageHp: createStats(),
      floorDetections: 0,
      floorDetectionAttempts: 0,
      floorDisarms: 0,
      floorDisarmAttempts: 0,
      floorDisarmSuccesses: 0,
      floorDisarmFailures: 0,
      ambush: 0,
      chosen: 0,
      disarmFailure: 0,
      avoidanceExtraSteps: createStats(),
      avoidanceCount: 0
    },
    trapSense: {
      items: 0,
      equipment: 0,
      values: {}
    }
  };
}

function addEndpoint(counts, endpointResult) {
  if (!endpointResult.entrant) return;
  counts.entrants++;
  if (endpointResult.breakthrough) counts.breakthroughs++;
  else if (endpointResult.death) counts.deaths++;
  else if (endpointResult.retreat) counts.retreats++;
}

function addRun(accumulator, row) {
  accumulator.runs++;
  addStats(accumulator.reachedFloor, row.reachedFloor);
  addStats(accumulator.bankRetentionRate, row.bankRetentionRate);
  addStats(accumulator.materialEvPerTime, row.materialEvPerTime);
  addStats(accumulator.timeCost, row.timeCost);
  addStats(accumulator.recoveryExtraUnits, row.recoveryExtraUnits);
  accumulator.survival += Number(row.outcome === "retreat");
  addEndpoint(accumulator.outcomes[5], row.endpoints.b5);
  addEndpoint(accumulator.outcomes[10], row.endpoints.b10);

  const trap = accumulator.trap;
  trap.floorEncounters += row.trap.floorEncounters;
  trap.floorActivations += row.trap.floorActivations;
  addStats(trap.floorDamageHp, row.trap.floorDamageHp);
  trap.floorDetections += row.trap.floorDetections;
  trap.floorDetectionAttempts += row.trap.floorDetectionAttempts;
  trap.floorDisarms += row.trap.floorDisarms;
  trap.floorDisarmAttempts += row.trap.floorDisarmAttempts;
  trap.floorDisarmSuccesses += row.trap.floorDisarmSuccesses;
  trap.floorDisarmFailures += row.trap.floorDisarmFailures;
  trap.ambush += row.trap.ambush;
  trap.chosen += row.trap.chosen;
  trap.disarmFailure += row.trap.disarmFailure;
  addStats(trap.avoidanceExtraSteps, row.trap.avoidanceExtraSteps);
  trap.avoidanceCount += row.trap.avoidanceCount;

  accumulator.trapSense.items += row.trapSense.items;
  accumulator.trapSense.equipment += row.equipmentFound;
  Object.entries(row.trapSense.values).forEach(([value, count]) => {
    accumulator.trapSense.values[value] =
      (accumulator.trapSense.values[value] || 0) + count;
  });
}

function summarizeOutcomes(outcomes, runs) {
  const split = outcomes.breakthroughs + outcomes.deaths + outcomes.retreats;
  if (split !== outcomes.entrants) {
    throw new Error("endpoint split does not sum to entrants");
  }
  return {
    entrant: wilson(outcomes.entrants, runs),
    breakthrough: wilson(outcomes.breakthroughs, outcomes.entrants),
    death: wilson(outcomes.deaths, outcomes.entrants),
    retreat: wilson(outcomes.retreats, outcomes.entrants),
    splitSumsTo100: split === outcomes.entrants
  };
}

function summarizeAccumulator(accumulator) {
  const trap = accumulator.trap;
  const causeTrials = trap.floorActivations;
  return {
    runs: accumulator.runs,
    averageReachedFloor: summarizeStats(accumulator.reachedFloor),
    survivalRate: wilson(accumulator.survival, accumulator.runs),
    timeCost: summarizeStats(accumulator.timeCost),
    materialEvPerTime: summarizeStats(accumulator.materialEvPerTime),
    bankRetentionRate: summarizeStats(accumulator.bankRetentionRate),
    recoveryExtraUnits: summarizeStats(accumulator.recoveryExtraUnits),
    outcomes: {
      B5: summarizeOutcomes(accumulator.outcomes[5], accumulator.runs),
      B10: summarizeOutcomes(accumulator.outcomes[10], accumulator.runs)
    },
    trap: {
      floorEncounters: trap.floorEncounters,
      floorActivations: trap.floorActivations,
      activationRate: wilson(trap.floorActivations, trap.floorEncounters),
      activationPerRun: trap.floorActivations / Math.max(1, accumulator.runs),
      floorDamageHpPerRun: summarizeStats(trap.floorDamageHp),
      detectionRate: wilson(trap.floorDetections, trap.floorDetectionAttempts),
      detectionAttempts: trap.floorDetectionAttempts,
      detections: trap.floorDetections,
      disarmRate: wilson(trap.floorDisarmSuccesses, trap.floorDisarmAttempts),
      disarmAttempts: trap.floorDisarmAttempts,
      disarmFailures: trap.floorDisarmFailures,
      avoidanceExtraStepsPerRun: summarizeStats(trap.avoidanceExtraSteps),
      avoidancePerRun: trap.avoidanceCount / Math.max(1, accumulator.runs),
      activationCauses: {
        ambush: wilson(trap.ambush, causeTrials),
        chosen: wilson(trap.chosen, causeTrials),
        disarmFailure: wilson(trap.disarmFailure, causeTrials)
      },
      activationCauseCounts: {
        ambush: trap.ambush,
        chosen: trap.chosen,
        disarmFailure: trap.disarmFailure,
        total: trap.ambush + trap.chosen + trap.disarmFailure,
        sumsToActivations: trap.ambush + trap.chosen + trap.disarmFailure ===
          trap.floorActivations
      }
    },
    trapSense: {
      itemsPerRun: accumulator.trapSense.items / Math.max(1, accumulator.runs),
      itemRateAmongEquipment: wilson(
        accumulator.trapSense.items,
        accumulator.trapSense.equipment
      ),
      values: { ...accumulator.trapSense.values }
    }
  };
}

function formatNumber(value, digits = 3) {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "—"
    : Number(value).toFixed(digits);
}

function formatStat(stat, digits = 3) {
  if (!stat || stat.mean === null) return "—";
  const suffix = stat.status === "未確定" ? " 未確定" : "";
  return stat.ci95
    ? `${formatNumber(stat.mean, digits)} [${formatNumber(stat.ci95[0], digits)}, ${formatNumber(stat.ci95[1], digits)}]${suffix}`
    : `${formatNumber(stat.mean, digits)}${suffix}`;
}

function formatRate(rate, digits = 1) {
  if (!rate || rate.rate === null) return "—";
  const suffix = rate.status === "未確定" ? " 未確定" : "";
  return `${formatNumber(rate.rate * 100, digits)}% [${formatNumber(rate.ci95[0] * 100, digits)}, ${formatNumber(rate.ci95[1] * 100, digits)}]${suffix}`;
}

function formatEndpoint(endpointResult) {
  return [
    formatRate(endpointResult.entrant),
    formatRate(endpointResult.breakthrough),
    formatRate(endpointResult.death),
    formatRate(endpointResult.retreat)
  ].join(" / ");
}

function formatCauses(trap) {
  return [
    `不意打ち ${formatRate(trap.activationCauses.ambush)}`,
    `察知後強行 ${formatRate(trap.activationCauses.chosen)}`,
    `解除失敗 ${formatRate(trap.activationCauses.disarmFailure)}`
  ].join(" / ");
}

function buildMarkdown(summary) {
  const lines = [];
  const comparison = summary.conditions.filter(condition => condition.comparison);
  const current = summary.conditions.find(condition => condition.id === "current");
  const removed = summary.conditions.find(condition => condition.id === "removed");
  const disarm = summary.conditions.find(condition => condition.id === "disarm");
  lines.push("# #502 罠の確定察知・trapSense転換測定", "");
  lines.push("## 結論", "");
  lines.push("- 採用: 隣接床罠の察知を確定化し、`trapSense` は既存装備・刻印互換を保ったまま罠解除率へ転換。");
  lines.push("- `trapSense` 撤去条件と解除転換条件を同一生成run条件で比較。撤去は情報を増やすだけ、転換は残存投資を解除選択へ接続する。");
  if (removed && disarm) {
    const damageDelta = disarm.summary.trap.floorDamageHpPerRun.mean -
      removed.summary.trap.floorDamageHpPerRun.mean;
    const floorDelta = disarm.summary.averageReachedFloor.mean -
      removed.summary.averageReachedFloor.mean;
    lines.push(`- 解除転換−撤去: 罠被害HP/run ${formatNumber(damageDelta, 3)}、平均到達floor ${formatNumber(floorDelta, 3)}。個別95% CIが重なるため統計的優越は主張せず、既存投資を保つ設計理由で転換を採用。`);
  }
  if (current && removed) {
    const floorDelta = removed.summary.averageReachedFloor.mean -
      current.summary.averageReachedFloor.mean;
    const b10Delta = removed.summary.outcomes.B10.entrant.rate -
      current.summary.outcomes.B10.entrant.rate;
    lines.push(`- 確定察知の主効果（撤去−現行）: 平均到達floor ${formatNumber(floorDelta, 3)}、B10 entrant ${formatNumber(b10Delta * 100, 1)}pt。不意打ちだけを消し、発見後の強行/解除/回避を残す。`);
  }
  lines.push("", "## 条件", "");
  lines.push(`- seed=${summary.seed}、targetDepth=B20終了、4職、N=${summary.runsPerClass}/職、条件数=${summary.conditions.length}、総行数=${summary.rawRows}`);
  lines.push(`- 工房分布=${WORKSHOP_DISTRIBUTION.map(row => `${row.scenarioId}:${row.observedRuns}/${WORKSHOP_TOTAL}`).join(" / ")}`);
  lines.push("- 現行緩和: `TOWN_PORTAL`、状態異常治療、鑑定粉、上薬、現行戦闘/報酬/装備更新、#461固定departure kit。");
  lines.push("- 現行条件は旧察知式をsim内で再現。確定条件は`calculateDetectRate=1.0`相当。`TRAP_POLICY=conservative`、`TRAP_AVOIDANCE_POLICY=ev`。");
  lines.push("- Wilson 95% CI、平均値は正規近似95% CI。N<30は未確定。B5/B10 E/X/D/Rは entrant / breakthrough / death / retreatで、split合計100%。", "");
  lines.push("## 数値", "");
  lines.push("|条件|平均到達floor|B5 E/X/D/R|B10 E/X/D/R|生還率|床罠発動率|床罠被害HP/run|回避追加歩数/run|素材EV/時間|bank保持率|");
  lines.push("|---|---|---|---|---|---|---|---|---|---|");
  comparison.forEach(condition => {
    const value = condition.summary;
    lines.push(`|${condition.label}|${formatStat(value.averageReachedFloor)}|${formatEndpoint(value.outcomes.B5)}|${formatEndpoint(value.outcomes.B10)}|${formatRate(value.survivalRate)}|${formatRate(value.trap.activationRate)}|${formatStat(value.trap.floorDamageHpPerRun)}|${formatStat(value.trap.avoidanceExtraStepsPerRun)}|${formatStat(value.materialEvPerTime)}|${formatStat(value.bankRetentionRate)}|`);
  });
  lines.push("", "## 発動原因分解", "");
  lines.push("床罠発動の分母は床罠発動数。不意打ち=察知失敗後の発動、察知後強行=発見後に強行を選んだ発動、解除失敗=発見後の解除判定失敗。", "");
  lines.push("|条件|不意打ち|察知後強行|解除失敗|分類合計|");
  lines.push("|---|---|---|---|---|");
  comparison.forEach(condition => {
    const trap = condition.summary.trap;
    lines.push(`|${condition.label}|${formatRate(trap.activationCauses.ambush)}|${formatRate(trap.activationCauses.chosen)}|${formatRate(trap.activationCauses.disarmFailure)}|${trap.activationCauseCounts.sumsToActivations ? "一致" : "不一致"}|`);
  });
  lines.push("", "## 罠対策の監査", "");
  comparison.forEach(condition => {
    const trap = condition.summary.trap;
    lines.push(`- ${condition.label}: 察知 ${formatRate(trap.detectionRate)}（${trap.detectionAttempts}回）、解除 ${formatRate(trap.disarmRate)}、発動/run ${formatNumber(trap.activationPerRun)}、回避/run ${formatNumber(trap.avoidancePerRun)}、原因=${formatCauses(trap)}。`);
  });
  lines.push("", "## #499 必要量取り直し", "");
  const recovery = summary.conditions.find(condition => condition.id === "disarm-plus2");
  if (recovery) {
    lines.push(`- 確定察知 + 解除転換 + 旧#499の回復+2.0設定: 実測追加 ${formatStat(recovery.summary.recoveryExtraUnits)}、B10 entrant ${formatRate(recovery.summary.outcomes.B10.entrant)}、B5死亡 ${formatRate(recovery.summary.outcomes.B5.death)}、B10死亡 ${formatRate(recovery.summary.outcomes.B10.death)}、素材EV/時間 ${formatStat(recovery.summary.materialEvPerTime)}。`);
  }
  lines.push("- 追加抽選は#499と同じ`chestHealPotionExtraChance=0.072`。必要量判定は#499の+2.0本/runを固定し、確定察知下で再測定。", "");
  lines.push("- seed=499の全用量掃引（+0.4〜+4.0、敵ドロップ同量比較）は `scratch/results/issue-502-499-fixed-detection.md` に分離記録。", "");
  lines.push("## trapSense供給", "");
  comparison.forEach(condition => {
    const supply = condition.summary.trapSense;
    lines.push(`- ${condition.label}: ${formatNumber(supply.itemsPerRun)}件/run、装備内率 ${formatRate(supply.itemRateAmongEquipment)}、値分布 ${JSON.stringify(supply.values)}。`);
  });
  lines.push("", "## 解釈・省略", "");
  lines.push("- 目的は到達性最大化ではなく、罠情報を全員へ配り、踏む/解除/迂回の選択を結果へ戻すこと。到達floor・生還・EVは副作用として報告。");
  lines.push("- 異種効果（警報、MP減少、落下、テレポート）をHPや素材へ換算しない。床罠被害HPは実ダメージ分のみ。");
  lines.push("- #461基準線は別コマンドで再測定し、A1・core監視・下流罠/解除監査を同一PR内で更新する。", "");
  lines.push("## 実行記録", "");
  lines.push(`- env hash: \`${summary.envHash}\``);
  lines.push(`- raw JSONL SHA-256: \`${summary.rawSha256}\``);
  lines.push(`- calibration wall/CPU: ${formatNumber(summary.calibration.wallSeconds, 2)}s / ${formatNumber(summary.calibration.cpuSeconds, 2)}s`);
  lines.push(`- measurement wall/CPU: ${formatNumber(summary.runtime.wallSeconds, 2)}s / ${formatNumber(summary.runtime.cpuSeconds, 2)}s`);
  lines.push(`- resolved parallelism: ${summary.runtime.resolvedParallelism}（SIM_PARALLEL未指定、runtime default）`);
  lines.push(`- 再現: \`${summary.reproductionCommand}\``);
  lines.push("", "Refs #502, #499, #461", "");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const scoring = buildScoringProfiles();
  const tasks = buildTasks();
  const conditionMap = Object.fromEntries(CONDITIONS.map(condition => [condition.id, condition]));
  const resolvedParallelism = resolveSimParallelism(tasks.length);
  const started = performance.now();
  const cpuStarted = process.cpuUsage();
  const rows = await runSimTasks({
    moduleUrl: pathToFileURL(fileURLToPath(import.meta.url)).href,
    exportName: "runIssue502Task",
    runTask: runIssue502Task,
    tasks,
    context: { conditions: conditionMap, scoringProfiles: scoring.profiles }
  });
  rows.sort((left, right) =>
    left.conditionId.localeCompare(right.conditionId) ||
    left.className.localeCompare(right.className) ||
    left.runIndex - right.runIndex
  );
  if (rows.length !== tasks.length) {
    throw new Error(`raw result audit failed: rows=${rows.length}/${tasks.length}`);
  }
  const cpu = process.cpuUsage(cpuStarted);
  const runtime = {
    wallSeconds: (performance.now() - started) / 1000,
    cpuSeconds: (cpu.user + cpu.system) / 1e6,
    resolvedParallelism
  };
  const raw = `${rows.map(row => JSON.stringify(row)).join("\n")}\n`;
  const rawSha256 = sha256(raw);
  const resultDir = join(process.cwd(), "scratch", "results");
  mkdirSync(resultDir, { recursive: true });
  writeFileSync(join(resultDir, `${OUTPUT_STEM}.jsonl`), raw);

  const conditionResults = CONDITIONS.map(condition => {
    const accumulator = createAccumulator();
    rows
      .filter(row => row.conditionId === condition.id)
      .forEach(row => addRun(accumulator, row));
    return {
      id: condition.id,
      label: condition.label,
      comparison: Boolean(condition.comparison),
      recovery: Boolean(condition.recovery),
      summary: summarizeAccumulator(accumulator)
    };
  });
  const environment = {
    ...Object.fromEntries(Object.entries(getResolvedSimulationEnv())),
    SIM_SEED: process.env.SIM_SEED,
    SIM_RUNS: String(RUNS_PER_CLASS),
    SIM_CALIBRATION_RUNS: String(CALIBRATION_RUNS),
    ISSUE502_CONDITIONS: CONDITIONS.map(condition => condition.id).join(","),
    ISSUE502_TARGET_DEPTH: String(TARGET_DEPTH),
    SIM_PARALLEL: "<omitted; runtime default>",
    SIM_MAP_CACHE_ENTRIES: "<omitted; runtime default 1024>"
  };
  const envHash = sha256(JSON.stringify(environment));
  const reproductionCommand = `${SMOKE ? "ISSUE502_SMOKE=1 " : ""}node scratch/sim_issue_502_trap_detection.js`;
  const summary = {
    issue: 502,
    seed: Number(process.env.SIM_SEED) >>> 0,
    runsPerClass: RUNS_PER_CLASS,
    runsPerCondition: RUNS_PER_CLASS * BASIC_CLASSES.length,
    rawRows: rows.length,
    calibrationRuns: CALIBRATION_RUNS,
    environment,
    envHash,
    rawSha256,
    calibration: scoring,
    runtime,
    conditions: conditionResults,
    reproductionCommand
  };
  writeFileSync(
    join(resultDir, `${OUTPUT_STEM}.md`),
    buildMarkdown(summary)
  );
  console.log(JSON.stringify({
    output: `scratch/results/${OUTPUT_STEM}.md`,
    rawSha256,
    envHash,
    resolvedParallelism,
    calibrationWallSeconds: scoring.wallSeconds,
    measurementWallSeconds: runtime.wallSeconds,
    measurementCpuSeconds: runtime.cpuSeconds
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
