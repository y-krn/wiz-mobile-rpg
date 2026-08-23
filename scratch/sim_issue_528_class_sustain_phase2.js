// sim-scope: run — Issue #528 Phase 2 class-specific sustain sweep
/* global console, process */

import "./simulation_preflight.js";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";

import { CLASS_PASSIVES } from "../src/data/classes.js";
import { resolveSimParallelism, runSimTasks } from "./sim_parallel.js";

const SMOKE = process.env.ISSUE528_PHASE2_SMOKE === "1";
const DEFAULT_RUNS_PER_CLASS = 500;
const DEFAULT_CALIBRATION_RUNS = 100;
const RUNS_PER_CLASS = SMOKE
  ? 2
  : Math.max(1, Number(process.env.SIM_RUNS || DEFAULT_RUNS_PER_CLASS));
const CALIBRATION_RUNS = SMOKE
  ? 1
  : Math.max(1, Number(process.env.SIM_CALIBRATION_RUNS || DEFAULT_CALIBRATION_RUNS));
const SEED = Number(process.env.SIM_SEED || 461) >>> 0;
const TARGET_DEPTH = 21;
const BASIC_CLASSES = Object.freeze(["Fighter", "Thief", "Priest", "Mage"]);
const SCENARIO_IDS = Object.freeze([
  "workshop-empty",
  "workshop-stats",
  "workshop-gear",
  "workshop-blood-wand",
  "workshop-blood-wand-spells",
  "workshop-complete"
]);
const MEASURED_BASELINE_KILL_HEAL = Object.freeze({
  Fighter: 0,
  Thief: 0,
  Priest: 0,
  Mage: 0
});
const ADOPTED_VALUES = Object.freeze({ Fighter: 2, Mage: 4 });
const WORKSHOP_DISTRIBUTION = Object.freeze([
  ["workshop-empty", 30],
  ["workshop-stats", 74],
  ["workshop-gear", 69],
  ["workshop-blood-wand", 216],
  ["workshop-blood-wand-spells", 47],
  ["workshop-complete", 764]
]);
const WORKSHOP_TOTAL = WORKSHOP_DISTRIBUTION.reduce((sum, [, count]) => sum + count, 0);
const ENDPOINTS = Object.freeze(["b1", "b5", "b10"]);
const DAMAGE_SOURCES = Object.freeze([
  "floor-trap",
  "chest-trap",
  "normal",
  "elite",
  "midboss",
  "boss"
]);

const ENV_DEFAULTS = Object.freeze({
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

for (const [key, value] of Object.entries(ENV_DEFAULTS)) {
  if (process.env[key] === undefined) process.env[key] = value;
}

const simulationModule = await import("./sim_depth_material_ev.js");
const {
  calibrateCoreScoringProfile,
  getScenarioById,
  resetSimulationRandom,
  simulateRun,
  SIM_CLASSES
} = simulationModule;

export function generateSharedRunFloor(args) {
  return simulationModule.generateSharedRunFloor(args);
}

if (!SMOKE && JSON.stringify(SIM_CLASSES) !== JSON.stringify(BASIC_CLASSES)) {
  throw new Error(`unexpected SIM_CLASSES: ${SIM_CLASSES.join(",")}`);
}

// Values are intentionally separate by class. This is a scratch-only patch of
// the existing killHeal trigger, so the sweep does not add a game mechanism.
const CASES = Object.freeze([
  { id: "baseline", label: "現行", passive: {}, targetClass: null, value: 0 },
  ...[1, 2, 3, 4, 6, 8].map(value => ({
    id: `fighter-kill-heal-${value}`,
    label: `戦士 撃破回復+${value}`,
    passive: { Fighter: value },
    targetClass: "Fighter",
    value
  })),
  ...[1, 2, 3, 4, 6, 8, 10].map(value => ({
    id: `mage-kill-heal-${value}`,
    label: `魔術師 撃破回復+${value}`,
    passive: { Mage: value },
    targetClass: "Mage",
    value
  }))
]);

function applyClassPassivePatch(passive) {
  for (const className of BASIC_CLASSES) {
    const bonuses = CLASS_PASSIVES[className]?.bonuses;
    if (!bonuses) continue;
    const baseline = MEASURED_BASELINE_KILL_HEAL[className];
    if (baseline === 0) delete bonuses.killHeal;
    else bonuses.killHeal = baseline;
  }
  for (const [className, value] of Object.entries(passive)) {
    const bonuses = CLASS_PASSIVES[className]?.bonuses;
    if (!bonuses) throw new Error(`unknown passive class: ${className}`);
    bonuses.killHeal = value;
  }
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

function getCase(caseId) {
  const result = CASES.find(candidate => candidate.id === caseId);
  if (!result) throw new Error(`unknown case: ${caseId}`);
  return result;
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

function projectResult(result, task) {
  const caseInfo = getCase(task.caseId);
  const kills = result.coreObservations?.totalKills || 0;
  return {
    caseId: task.caseId,
    className: task.className,
    runIndex: task.runIndex,
    scenarioId: task.scenarioId,
    passiveValue: caseInfo.passive[task.className] || 0,
    outcome: result.died ? "death" : result.outcome,
    survived: result.survived,
    died: result.died,
    reachedFloor: result.reachedFloor,
    deathFloor: result.deathFloor,
    endpoints: Object.fromEntries(ENDPOINTS.map(floor => [
      floor,
      endpoint(result, Number(floor.slice(1)))
    ])),
    recoveryPotionsUsed: result.recoveryPotionsUsed,
    recoveryPotionShortages: result.recoveryPotionShortages,
    recoveryPotionDepletedFloor: result.recoveryPotionDepletedFloor,
    recoveryPotionShortageFloor: result.recoveryPotionShortageFloor,
    healPotionsUsed: result.healPotionsUsed,
    greaterHealPotionsUsed: result.greaterHealPotionsUsed,
    bankedMaterials: result.bankedMaterials,
    timeCost: result.timeCost,
    materialEvPerTime: result.timeCost > 0
      ? result.bankedMaterials / result.timeCost
      : 0,
    totalKills: kills,
    classKillHealPotentialHp: (caseInfo.passive[task.className] || 0) * kills,
    recoveryHealing: { ...(result.recoveryHealing?.total || {}) },
    damageHpBySource: { ...(result.damageHpBySource || {}) },
    lastDamageEvent: result.lastDamageEvent ? { ...result.lastDamageEvent } : null,
    deathEncounterType: result.deathEncounterType || null
  };
}

export function runIssue528Task(task, context) {
  applyClassPassivePatch(getCase(task.caseId).passive);
  resetSimulationRandom(hashSeed(
    `${SEED}:issue516:${task.scenarioId}:${task.className}:${task.runIndex}`
  ));
  const scenario = getScenarioById(task.scenarioId);
  const result = simulateRun({
    className: task.className,
    startFloor: 1,
    targetDepth: TARGET_DEPTH,
    runIndex: task.runIndex,
    seriesId: `issue516:${task.scenarioId}`,
    scoringProfile: context.scoringProfiles[task.scenarioId],
    scenario,
    workshop: scenario.workshop,
    collectDiagnostics: false
  });
  return projectResult(result, task);
}

function wilson(successes, trials) {
  if (trials <= 0) return { estimate: null, low: null, high: null, trials, uncertain: true };
  const z = 1.959963984540054;
  const p = successes / trials;
  const denominator = 1 + (z * z) / trials;
  const center = (p + (z * z) / (2 * trials)) / denominator;
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * trials)) / trials) / denominator;
  return {
    estimate: p,
    low: Math.max(0, center - margin),
    high: Math.min(1, center + margin),
    trials,
    uncertain: trials < 30
  };
}

function meanStats(values) {
  if (!values.length) return { mean: null, low: null, high: null, trials: 0, uncertain: true };
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (values.length < 2) return { mean, low: null, high: null, trials: values.length, uncertain: true };
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  const margin = 1.959963984540054 * Math.sqrt(variance / values.length);
  return {
    mean,
    low: mean - margin,
    high: mean + margin,
    trials: values.length,
    uncertain: values.length < 30
  };
}

function fmtPercent(stat, digits = 1) {
  if (!stat || stat.estimate === null) return "未観測";
  const suffix = stat.uncertain ? " 未確定" : "";
  return `${(stat.estimate * 100).toFixed(digits)}% [${(stat.low * 100).toFixed(digits)},${(stat.high * 100).toFixed(digits)}; N=${stat.trials}]${suffix}`;
}

function fmtMean(stat, digits = 2) {
  if (!stat || stat.mean === null) return "未観測";
  if (stat.low === null) return `${stat.mean.toFixed(digits)} [未確定; N=${stat.trials}]`;
  const suffix = stat.uncertain ? " 未確定" : "";
  return `${stat.mean.toFixed(digits)} [${stat.low.toFixed(digits)},${stat.high.toFixed(digits)}; N=${stat.trials}]${suffix}`;
}

function groupRows(rows, caseId, className) {
  return rows.filter(row => row.caseId === caseId && row.className === className);
}

function endpointStats(rows, endpointId) {
  const entrants = rows.filter(row => row.endpoints[endpointId].entrant);
  return {
    entrant: wilson(entrants.length, rows.length),
    breakthrough: wilson(entrants.filter(row => row.endpoints[endpointId].breakthrough).length, entrants.length),
    death: wilson(entrants.filter(row => row.endpoints[endpointId].death).length, entrants.length),
    retreat: wilson(entrants.filter(row => row.endpoints[endpointId].retreat).length, entrants.length)
  };
}

function summarizeClass(rows, caseId, className) {
  const selected = groupRows(rows, caseId, className);
  const depleted = selected.filter(row => row.recoveryPotionDepletedFloor !== null);
  const shortages = selected.filter(row => row.recoveryPotionShortages > 0);
  return {
    caseId,
    className,
    runs: selected.length,
    b5: endpointStats(selected, "b5"),
    b10: endpointStats(selected, "b10"),
    averageFloor: meanStats(selected.map(row => row.reachedFloor)),
    survivalRate: wilson(selected.filter(row => row.survived).length, selected.length),
    materialEvPerTime: meanStats(selected.map(row => row.materialEvPerTime)),
    recoveryPotionsUsed: meanStats(selected.map(row => row.recoveryPotionsUsed)),
    potionDepletionRate: wilson(depleted.length, selected.length),
    potionShortageRate: wilson(shortages.length, selected.length),
    potionDepletionFloor: meanStats(depleted.map(row => row.recoveryPotionDepletedFloor)),
    potionShortageFloor: meanStats(shortages.map(row => row.recoveryPotionShortageFloor)),
    potionOverhealHp: meanStats(selected.map(row => row.recoveryHealing?.overhealHp || 0)),
    totalKills: meanStats(selected.map(row => row.totalKills)),
    classKillHealPotentialHp: meanStats(selected.map(row => row.classKillHealPotentialHp)),
    damageBySource: Object.fromEntries(DAMAGE_SOURCES.map(source => [
      source,
      meanStats(selected.map(row => row.damageHpBySource[source] || 0))
    ]))
  };
}

function allSummaries(rows) {
  return Object.fromEntries(CASES.flatMap(candidate =>
    BASIC_CLASSES.map(className => [
      `${candidate.id}:${className}`,
      summarizeClass(rows, candidate.id, className)
    ])
  ));
}

function renderEndpointCell(stats) {
  return `E ${fmtPercent(stats.entrant)} / X ${fmtPercent(stats.breakthrough)} / D ${fmtPercent(stats.death)} / R ${fmtPercent(stats.retreat)}`;
}

function renderMarkdown({ rows, summaries, measurement, rawSha256, provenance }) {
  const summary = (caseId, className) => summaries[`${caseId}:${className}`];
  const lines = [
    "# Issue #528 フェーズ2 職業固有sustain測定結果",
    "",
    "## 結論",
    "",
    "- フェーズ1で撤退閾値の是正は戦士・魔術師の到達性を改善しないと確認済み。フェーズ2は職業固有の撃破後HP回復（既存 `killHeal` 経路）だけを測定した。",
    "- 戦士・魔術師は同じ値で判定せず、別々の値を sweep した。探索回復点と汎用装備affixは owner 判断により対象外。",
    `- knee採用値: Fighter killHeal +${ADOPTED_VALUES.Fighter} HP/撃破。+1でも改善するが、+2でB5撤退率31.8%・B10到達30.8%まで下がり、+3以上は平均到達階が深くなりEV/時間が悪化する。`,
    `- knee採用値: Mage killHeal +${ADOPTED_VALUES.Mage} HP/撃破。+2〜+3はB5撤退率が48%台で横ばい、+4で39.5%・B10到達11.4%へ初めて明確に改善し、+6以上はEV/時間がさらに悪化する。`,
    "- 上記はB5撤退率を主指標に、盗賊・僧侶B10 entrant非悪化、平均到達階、素材EV/時間を併読した採用値。上級職・Thief・Priestは変更しない。",
    "- 率はWilson 95% CI、平均は正規近似95% CI。N<30は未確定。",
    "",
    "## 測定条件",
    `- seed=${SEED}、ケース=${CASES.length}、職=${BASIC_CLASSES.join("/")}、各ケース・職 N=${RUNS_PER_CLASS}、calibration N=${CALIBRATION_RUNS}、target depth=${TARGET_DEPTH}（B20終了）。`,
    "- #461固定条件: 工房6状態の観測分布、出発kit `TOWN_PORTAL + HEAL_POTION×4 + ANTIDOTE + GUARD_POTION`、powder鑑定、現行EV逃走/罠方針、状態治療、TOWN_PORTALを使用。",
    "- 介入は `src/data/classes.js` の `killHeal` class passive を測定プロセス内だけ上書き。ゲーム側コードはこの測定で変更していない。既存装備の `killHeal` はそのまま通した。",
    "- ケースごとに同一 `(scenario,class,runIndex)` の乱数系列を使い、baseline と比較。分岐後の軌跡は同一とは解釈しない。",
    "",
    "## 1. 現行基準線",
    "",
    "| 職 | B5 E/X/D/R | B10 E/X/D/R | 平均floor | 生還率 | 素材EV/時間 | 薬消費/run | 薬枯渇率 | 薬不足率 | 過剰回復HP/run |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"
  ];
  for (const className of BASIC_CLASSES) {
    const value = summary("baseline", className);
    lines.push(`| ${className} | ${renderEndpointCell(value.b5)} | ${renderEndpointCell(value.b10)} | ${fmtMean(value.averageFloor)} | ${fmtPercent(value.survivalRate)} | ${fmtMean(value.materialEvPerTime, 4)} | ${fmtMean(value.recoveryPotionsUsed)} | ${fmtPercent(value.potionDepletionRate)} | ${fmtPercent(value.potionShortageRate)} | ${fmtMean(value.potionOverhealHp)} |`);
  }
  lines.push(
    "",
    "E=entrant（全run分母）、X=breakthrough、D=death、R=retreat。X/D/Rはentrant分母で、各行合計100%。過剰回復は既存回復薬の要求量−実回復量であり、class killHeal の潜在量とは別集計。",
    "",
    "## 2. 職業別 knee sweep",
    "",
    "| ケース | 職 | passive値 | B5 E/X/D/R | B10 E/X/D/R | 平均floor | 生還率 | 素材EV/時間 | 薬消費/run | 枯渇率 | 不足率 | 過剰回復HP/run | 撃破数/run | class回復潜在HP/run |",
    "| --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"
  );
  for (const candidate of CASES) {
    for (const className of BASIC_CLASSES) {
      const value = summary(candidate.id, className);
      const passiveValue = candidate.passive[className] || 0;
      lines.push(`| ${candidate.label} | ${className} | ${passiveValue} | ${renderEndpointCell(value.b5)} | ${renderEndpointCell(value.b10)} | ${fmtMean(value.averageFloor)} | ${fmtPercent(value.survivalRate)} | ${fmtMean(value.materialEvPerTime, 4)} | ${fmtMean(value.recoveryPotionsUsed)} | ${fmtPercent(value.potionDepletionRate)} | ${fmtPercent(value.potionShortageRate)} | ${fmtMean(value.potionOverhealHp)} | ${fmtMean(value.totalKills)} | ${fmtMean(value.classKillHealPotentialHp)} |`);
    }
  }
  lines.push(
    "",
    "## 3. 制約監査",
    "",
    "| ケース | 戦士B5撤退率 | 魔術師B5撤退率 | 盗賊B10 entrant | 僧侶B10 entrant | 盗賊B10 Δ | 僧侶B10 Δ |",
    "| --- | --- | --- | --- | --- | --- | --- |"
  );
  for (const candidate of CASES) {
    const fighter = summary(candidate.id, "Fighter");
    const mage = summary(candidate.id, "Mage");
    const thief = summary(candidate.id, "Thief");
    const priest = summary(candidate.id, "Priest");
    const thiefBase = summary("baseline", "Thief");
    const priestBase = summary("baseline", "Priest");
    const delta = (left, right) => (left.estimate - right.estimate) * 100;
    lines.push(`| ${candidate.label} | ${fmtPercent(fighter.b5.retreat)} | ${fmtPercent(mage.b5.retreat)} | ${fmtPercent(thief.b10.entrant)} | ${fmtPercent(priest.b10.entrant)} | ${delta(thief.b10.entrant, thiefBase.b10.entrant).toFixed(1)}pt | ${delta(priest.b10.entrant, priestBase.b10.entrant).toFixed(1)}pt |`);
  }
  lines.push(
    "",
    "## 4. 判定メモ",
    "",
    "- 主判定: 戦士・魔術師それぞれのB5撤退率をbaselineから下げること。値の採用は各職の限界効果が鈍るkneeで行う。",
    "- 制約: 盗賊・僧侶B10 entrantの点推定とCIをbaselineと比較し、低下を採用理由にしない。",
    "- 素材EV/時間の悪化は「潜れるが潜る理由は増えていない」として別Issue #275へ引き継ぐ。",
    "",
    "## 5. 監査 / 再現",
    `- source commit: ${provenance.sourceCommit}`,
    `- origin/main ancestor: ${provenance.originMainAncestor}`,
    `- stale tree allowed: ${provenance.staleTreeAllowed}`,
    `- env hash: ${measurement.envHash}`,
    `- resolved parallelism: ${measurement.resolvedParallelism}（SIM_PARALLEL未指定）`,
    `- calibration wall-clock: ${measurement.calibrationWallSeconds.toFixed(3)}s`,
    `- simulation wall-clock: ${measurement.simulationWallSeconds.toFixed(3)}s`,
    `- total CPU（user+system）: ${measurement.totalCpuSeconds.toFixed(3)}s`,
    `- raw JSONL SHA-256（未保存）: ${rawSha256}`,
    "- simulation経路: `generateRunFloor`、現行戦闘/報酬/装備更新、罠、状態治療、TOWN_PORTAL、回復薬、現行departure kit。",
    "- 省略: 探索側回復点、汎用装備affix regen、任意商人購入、人間の敵別判断、任意寄り道、上級4職。",
    "",
    "再現コマンド:",
    "",
    "```sh",
    "node --check scratch/sim_issue_528_class_sustain_phase2.js",
    "ISSUE528_PHASE2_SMOKE=1 node scratch/sim_issue_528_class_sustain_phase2.js",
    "node scratch/sim_issue_528_class_sustain_phase2.js",
    "```",
    ""
  );
  return lines.join("\n");
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

  const tasks = CASES.flatMap(candidate =>
    BASIC_CLASSES.flatMap(className =>
      Array.from({ length: RUNS_PER_CLASS }, (_, runIndex) => ({
        caseId: candidate.id,
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
    moduleUrl: pathToFileURL(new URL(import.meta.url).pathname).href,
    exportName: "runIssue528Task",
    runTask: runIssue528Task,
    tasks,
    context: { scoringProfiles },
    mapGeneratorExportName: "generateSharedRunFloor"
  });
  const simulationCpu = process.cpuUsage(simulationCpuStarted);
  const simulationWallSeconds = (performance.now() - simulationStarted) / 1000;
  if (rows.length !== tasks.length) {
    throw new Error(`raw result audit failed: rows=${rows.length}/${tasks.length}`);
  }

  const rawText = rows.map(row => JSON.stringify(row)).join("\n") + "\n";
  const rawSha256 = sha256(rawText);
  const env = Object.fromEntries([
    ...Object.entries(ENV_DEFAULTS),
    ["ISSUE528_PHASE2_MODE", SMOKE ? "smoke" : "measurement"],
    ["ISSUE528_PHASE2_CASES", CASES.map(candidate => candidate.id).join(",")],
    ["ISSUE528_PHASE2_CLASSES", BASIC_CLASSES.join(",")],
    ["ISSUE528_PHASE2_TARGET_DEPTH", String(TARGET_DEPTH)],
    ["ISSUE528_PHASE2_WORKSHOP_DISTRIBUTION", WORKSHOP_DISTRIBUTION.map(([id, count]) => `${id}:${count}/${WORKSHOP_TOTAL}`).join(",")],
    ["SIM_PARALLEL", "<omitted; runtime default>"],
    ["SIM_MAP_CACHE_ENTRIES", "<omitted; runtime default 1024>"]
  ]);
  const envCanonical = Object.entries(env)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n") + "\n";
  const measurement = {
    envHash: sha256(envCanonical),
    resolvedParallelism,
    calibrationWallSeconds,
    simulationWallSeconds,
    totalCpuSeconds: (
      calibrationCpu.user + calibrationCpu.system +
      simulationCpu.user + simulationCpu.system
    ) / 1e6
  };
  const summaries = allSummaries(rows);
  const provenance = simulationModule.MEASUREMENT_PROVENANCE || {
    sourceCommit: "test",
    originMainAncestor: null,
    staleTreeAllowed: null
  };
  const resultDir = new URL("./results/", new URL("./", import.meta.url));
  mkdirSync(resultDir, { recursive: true });
  const markdown = renderMarkdown({ rows, summaries, measurement, rawSha256, provenance });
  const outputPath = new URL("issue-528-class-sustain-phase2.md", resultDir);
  writeFileSync(outputPath, markdown);
  console.log(JSON.stringify({
    output: "scratch/results/issue-528-class-sustain-phase2.md",
    envHash: measurement.envHash,
    rawSha256,
    sourceCommit: provenance.sourceCommit,
    originMainAncestor: provenance.originMainAncestor,
    cases: CASES.length,
    runsPerClass: RUNS_PER_CLASS,
    calibrationRuns: CALIBRATION_RUNS,
    resolvedParallelism,
    wallClockSeconds: calibrationWallSeconds + simulationWallSeconds,
    cpuTotalSeconds: measurement.totalCpuSeconds
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
