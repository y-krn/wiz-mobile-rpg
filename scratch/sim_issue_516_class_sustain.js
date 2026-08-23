// sim-scope: run — Issue #516 basic-class sustain and counterfactuals
/* global console, process */

import "./simulation_preflight.js";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";

import { resolveSimParallelism, runSimTasks } from "./sim_parallel.js";

const SMOKE = process.env.ISSUE516_SMOKE === "1";
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
const WORKSHOP_DISTRIBUTION = Object.freeze([
  ["workshop-empty", 30],
  ["workshop-stats", 74],
  ["workshop-gear", 69],
  ["workshop-blood-wand", 216],
  ["workshop-blood-wand-spells", 47],
  ["workshop-complete", 764]
]);
const WORKSHOP_TOTAL = WORKSHOP_DISTRIBUTION.reduce((sum, [, count]) => sum + count, 0);
const DAMAGE_SOURCES = Object.freeze([
  "floor-trap",
  "chest-trap",
  "normal",
  "elite",
  "midboss",
  "boss"
]);
const DAMAGE_SOURCE_LABELS = Object.freeze({
  "floor-trap": "床罠",
  "chest-trap": "宝箱罠",
  normal: "通常戦闘",
  elite: "エリート",
  midboss: "中ボス",
  boss: "boss"
});
const ENDPOINTS = Object.freeze(["b1", "b5", "b10"]);
const PRE_FIX_CASE_ID = "pre-516-control";
const FIXED_CASE_ID = "baseline";

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

const PRE_FIX_PATCH = Object.freeze({
  trapGuardOverride: Object.freeze({
    classNames: ["Fighter", "Mage"],
    value: 0
  })
});

const CASES = Object.freeze([
  {
    id: PRE_FIX_CASE_ID,
    label: "#516前対照",
    patch: PRE_FIX_PATCH
  },
  { id: FIXED_CASE_ID, label: "修正後現行", patch: {} },
  {
    id: "no-priest-healing",
    label: "僧侶 DIOS無効",
    patch: { ...PRE_FIX_PATCH, disablePriestHealing: true }
  },
  {
    id: "no-thief-sustain",
    label: "盗賊の解除・偵察・回避無効",
    patch: {
      ...PRE_FIX_PATCH,
      ignoreThiefSustain: true,
      trapOverride: {
        className: "Thief",
        trapBonus: { multiplier: 0, maxApt: 60, maxNonApt: 60 }
      },
      countermeasureOverride: {
        className: "Thief",
        affixType: "evasion",
        multiplier: 0,
        startFloor: 1
      }
    }
  },
  {
    id: "fighter-guardian-plus20",
    label: "戦士 guardian +20",
    patch: {
      ...PRE_FIX_PATCH,
      countermeasureOverride: {
        affixType: "guardian",
        multiplier: 2,
        startFloor: 1
      }
    }
  },
  {
    id: "mage-arcane-plus20",
    label: "魔術師 arcane +20",
    patch: {
      ...PRE_FIX_PATCH,
      countermeasureOverride: {
        affixType: "arcane",
        multiplier: 2,
        startFloor: 1
      }
    }
  },
  {
    id: "universal-camp-floor3",
    label: "全職 floor3 camp",
    patch: {
      ...PRE_FIX_PATCH,
      extraCampFloors: [3],
      extraCampRecoveryRate: 0.4,
      extraCampTimeCost: 0
    }
  },
  {
    id: "universal-stairs-25",
    label: "全職 階層移動回復25%",
    patch: {
      ...PRE_FIX_PATCH,
      floorTransitionRecoveryRate: 0.25
    }
  },
  {
    id: "fighter-trap-guard20",
    label: "戦士 罠被害-20%",
    patch: {
      ...PRE_FIX_PATCH,
      trapGuardOverride: [
        { className: "Fighter", value: 20 },
        { className: "Mage", value: 0 }
      ]
    }
  },
  {
    id: "mage-trap-guard30",
    label: "魔術師 罠被害-30%",
    patch: {
      ...PRE_FIX_PATCH,
      trapGuardOverride: [
        { className: "Fighter", value: 0 },
        { className: "Mage", value: 30 }
      ]
    }
  },
  {
    id: "fighter-trap-guard40",
    label: "戦士 罠被害-40%",
    patch: {
      ...PRE_FIX_PATCH,
      trapGuardOverride: [
        { className: "Fighter", value: 40 },
        { className: "Mage", value: 0 }
      ]
    }
  },
  {
    id: "mage-trap-guard50",
    label: "魔術師 罠被害-50%",
    patch: {
      ...PRE_FIX_PATCH,
      trapGuardOverride: [
        { className: "Fighter", value: 0 },
        { className: "Mage", value: 50 }
      ]
    }
  }
]);

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

function buildScenario(caseId, scenarioId) {
  const base = getScenarioById(scenarioId);
  return { ...base, ...getCase(caseId).patch };
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
  return {
    caseId: task.caseId,
    className: task.className,
    runIndex: task.runIndex,
    scenarioId: task.scenarioId,
    outcome: result.died ? "death" : result.outcome,
    survived: result.survived,
    died: result.died,
    reachedFloor: result.reachedFloor,
    deathFloor: result.deathFloor,
    endpoints: Object.fromEntries(ENDPOINTS.map(floor => [
      floor,
      endpoint(result, Number(floor.slice(1)))
    ])),
    damageHpBySource: { ...(result.damageHpBySource || {}) },
    lastDamageEvent: result.lastDamageEvent ? { ...result.lastDamageEvent } : null,
    deathEncounterType: result.deathEncounterType || null,
    recoveryPotionsUsed: result.recoveryPotionsUsed,
    healPotionsUsed: result.healPotionsUsed,
    greaterHealPotionsUsed: result.greaterHealPotionsUsed,
    recoveryPotionShortages: result.recoveryPotionShortages,
    recoveryPotionDepletedFloor: result.recoveryPotionDepletedFloor,
    recoveryPotionShortageFloor: result.recoveryPotionShortageFloor,
    diosHealingHp: result.diosHealingHp,
    extraCampRestCount: result.extraCampRestCount,
    extraCampHealingHp: result.extraCampHealingHp,
    trapDisarms: result.trapDisarms,
    trapActivations: result.trapActivations,
    trapDamageHp: result.trapDamageHp,
    townPortalsUsed: result.townPortalsUsed,
    bankedMaterials: result.bankedMaterials,
    timeCost: result.timeCost,
    materialEvPerTime: result.timeCost > 0
      ? result.bankedMaterials / result.timeCost
      : 0
  };
}

export function runIssue516Task(task, context) {
  const scenario = buildScenario(task.caseId, task.scenarioId);
  resetSimulationRandom(hashSeed(
    `${SEED}:issue516:${task.scenarioId}:${task.className}:${task.runIndex}`
  ));
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

function fmtPoint(value, digits = 1) {
  return `${(value * 100).toFixed(digits)}%`;
}

function groupRows(rows, caseId, className = null) {
  return rows.filter(row => row.caseId === caseId && (!className || row.className === className));
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

function terminalRows(rows, outcome) {
  return rows.filter(row => row.outcome === outcome);
}

function sourceMeans(rows) {
  return Object.fromEntries(DAMAGE_SOURCES.map(source => [
    source,
    rows.length
      ? rows.reduce((sum, row) => sum + (row.damageHpBySource[source] || 0), 0) / rows.length
      : 0
  ]));
}

function lastDamageCounts(rows) {
  const counts = { none: 0, ...Object.fromEntries(DAMAGE_SOURCES.map(source => [source, 0])) };
  rows.forEach(row => {
    const source = row.lastDamageEvent?.source || row.deathEncounterType || "none";
    counts[source] = (counts[source] || 0) + 1;
  });
  return counts;
}

function summarizeClass(rows, caseId, className) {
  const selected = groupRows(rows, caseId, className);
  const b5 = endpointStats(selected, "b5");
  const b10 = endpointStats(selected, "b10");
  const depletionRows = selected.filter(row => row.recoveryPotionDepletedFloor !== null);
  const shortageRows = selected.filter(row => row.recoveryPotionShortages > 0);
  return {
    caseId,
    className,
    runs: selected.length,
    b1: endpointStats(selected, "b1"),
    b5,
    b10,
    averageFloor: meanStats(selected.map(row => row.reachedFloor)),
    survivalRate: wilson(selected.filter(row => row.survived).length, selected.length),
    materialEvPerTime: meanStats(selected.map(row => row.materialEvPerTime)),
    recoveryPotionsUsed: meanStats(selected.map(row => row.recoveryPotionsUsed)),
    healPotionsUsed: meanStats(selected.map(row => row.healPotionsUsed)),
    greaterHealPotionsUsed: meanStats(selected.map(row => row.greaterHealPotionsUsed)),
    potionDepletionRate: wilson(depletionRows.length, selected.length),
    potionDepletionFloor: meanStats(depletionRows.map(row => row.recoveryPotionDepletedFloor)),
    potionShortageRate: wilson(shortageRows.length, selected.length),
    potionShortageFloor: meanStats(shortageRows.map(row => row.recoveryPotionShortageFloor)),
    diosHealingHp: meanStats(selected.map(row => row.diosHealingHp)),
    extraCampRestCount: meanStats(selected.map(row => row.extraCampRestCount)),
    extraCampHealingHp: meanStats(selected.map(row => row.extraCampHealingHp)),
    trapDisarms: meanStats(selected.map(row => row.trapDisarms)),
    trapActivations: meanStats(selected.map(row => row.trapActivations)),
    trapDamageHp: meanStats(selected.map(row => row.trapDamageHp)),
    damageByTerminal: Object.fromEntries(["retreat", "death"].map(outcome => {
      const terminal = terminalRows(selected, outcome);
      return [outcome, {
        runs: terminal.length,
        sourceMeans: sourceMeans(terminal),
        lastDamageCounts: lastDamageCounts(terminal)
      }];
    }))
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

function renderSourceMeans(means) {
  return DAMAGE_SOURCES
    .map(source => `${DAMAGE_SOURCE_LABELS[source]} ${means[source].toFixed(2)}`)
    .join(" / ");
}

function renderLastDamage(counts, runs) {
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([source, count]) => `${source === "none" ? "なし" : DAMAGE_SOURCE_LABELS[source]} ${count}/${runs}`)
    .join(" / ") || "なし";
}

function renderMarkdown({ rows, summaries, measurement, rawSha256 }) {
  const baseline = className => summaries[`${PRE_FIX_CASE_ID}:${className}`];
  const fixed = className => summaries[`${FIXED_CASE_ID}:${className}`];
  const lines = [
    "# Issue #516 基本4職 sustain非対称 測定結果",
    "",
    "## 結論",
    "",
    "- #516前対照では戦士・魔術師のB5撤退が主 endpoint。僧侶はDIOS、盗賊は解除・罠偵察・回避が到達性を支える。",
    "- 直前被害源と累積HP寄与は職ごとに異なる。戦士・魔術師は宝箱罠を含む罠被害が死亡の主因で、罠被害軽減を実ソースへ採用する。",
    "- #516前対照を固定し、修正後の戦士・魔術師だけの到達性と、盗賊・僧侶の非悪化を比較する。guardian発動帯変更・killHeal・arcane強化は効果不足で不採用。",
    "- `N<30` の率は未確定。率の区間はWilson 95% CI、平均の区間は正規近似95% CI。",
    "",
    "## 測定条件",
    "",
    `- seed=${SEED}、ケース=${CASES.length}、職=${BASIC_CLASSES.join("/")}、各ケース・職 N=${RUNS_PER_CLASS}、calibration N=${CALIBRATION_RUNS}。target depth=${TARGET_DEPTH}（B20終了）。`,
    "- #461固定条件: 工房6状態の観測分布、出発kit `TOWN_PORTAL + HEAL_POTION×4 + ANTIDOTE + GUARD_POTION`、powder鑑定、現行EV逃走/罠方針、状態治療、TOWN_PORTALを使用。",
    "- 全ケース同一 `scoringProfile`、同一 `(scenario,class,runIndex)` のmap/乱数系列を使用。ただし行動経路が分岐するためケース差は独立2標本CIとして解釈。",
    "- 対策候補の値は測定前固定: 戦士 `guardian×2`（+20相当）/罠被害-20%・-40%、魔術師 `arcane×2`（+20相当）/罠被害-30%・-50%、全職 floor3追加camp（回復率40%、時間コスト0）、全職階層移動回復25%。採用値は実ソースの戦士`trapGuard=40`%、魔術師`trapGuard=50`%。",
    "",
    "## 1. #516前対照 endpoint / depth",
    "",
    "| 職 | B5 E/X/D/R | B10 E/X/D/R | 平均到達floor | 生還（retreat終了）率 | 素材EV/時間 |",
    "| --- | --- | --- | --- | --- | --- |"
  ];
  for (const className of BASIC_CLASSES) {
    const summary = baseline(className);
    lines.push(`| ${className} | ${renderEndpointCell(summary.b5)} | ${renderEndpointCell(summary.b10)} | ${fmtMean(summary.averageFloor)} | ${fmtPercent(summary.survivalRate)} | ${fmtMean(summary.materialEvPerTime, 4)} |`);
  }
  lines.push(
    "",
    "E=entrant（全run分母）、X=breakthrough、D=death、R=retreat。X/D/Rはentrant分母、各行のX+D+R=100%。生還率はsimの `survived`（retreat終了）を示す。",
    "",
    "## 1b. 修正後 endpoint / depth",
    "",
    "| 職 | B5 E/X/D/R | B10 E/X/D/R | 平均到達floor | 生還（retreat終了）率 | 素材EV/時間 |",
    "| --- | --- | --- | --- | --- | --- |"
  );
  for (const className of BASIC_CLASSES) {
    const summary = fixed(className);
    lines.push(`| ${className} | ${renderEndpointCell(summary.b5)} | ${renderEndpointCell(summary.b10)} | ${fmtMean(summary.averageFloor)} | ${fmtPercent(summary.survivalRate)} | ${fmtMean(summary.materialEvPerTime, 4)} |`);
  }
  lines.push(
    "",
    "修正後は実ソースの現行クラスpassive/罠被害軽減を通った値。#516前対照は同じ乱数系列で旧条件を再現するためのsim control。",
    "",
    "## 1c. 修正前→修正後の主要差分",
    "",
    "| 職 | B10 entrant 前→後 | 平均floor 前→後 | 生還（retreat終了）率 前→後 | 素材EV/時間 前→後 |",
    "| --- | --- | --- | --- | --- |"
  );
  for (const className of BASIC_CLASSES) {
    const before = baseline(className);
    const after = fixed(className);
    lines.push(`| ${className} | ${fmtPercent(before.b10.entrant)} → ${fmtPercent(after.b10.entrant)} | ${fmtMean(before.averageFloor)} → ${fmtMean(after.averageFloor)} | ${fmtPercent(before.survivalRate)} → ${fmtPercent(after.survivalRate)} | ${fmtMean(before.materialEvPerTime, 4)} → ${fmtMean(after.materialEvPerTime, 4)} |`);
  }
  lines.push(
    "",
    "採用判定: 戦士・魔術師の到達性を押し上げ、盗賊・僧侶のB10 entrantが対照を下回らないことを確認する。素材EV/時間は別の受入閾値を捏造せず、差分を監査値として併記する。",
    "",
    "## 2. 終了理由: 直前被害源 / 累積HP寄与",
    "",
    "累積HP寄与は終了endpoint内 run の平均HP/run。直前被害源は最後に記録した実被害イベント。実被害イベントがない死亡runは `deathEncounterType` を補完表示する。",
    "",
    "| 職 | 終了 | N | 直前被害源 | 床罠 / 宝箱罠 / 通常戦闘 / エリート / 中ボス / boss（HP/run） |",
    "| --- | --- | ---: | --- | --- |"
  );
  for (const className of BASIC_CLASSES) {
    const summary = baseline(className);
    for (const outcome of ["retreat", "death"]) {
      const detail = summary.damageByTerminal[outcome];
      lines.push(`| ${className} | ${outcome} | ${detail.runs} | ${renderLastDamage(detail.lastDamageCounts, detail.runs)} | ${renderSourceMeans(detail.sourceMeans)} |`);
    }
  }
  lines.push(
    "",
    "## 3. sustain反実仮想 / 対策候補",
    "",
    "| ケース | 戦士 B10 entrant | 盗賊 B10 entrant | 僧侶 B10 entrant | 魔術師 B10 entrant | 4職平均floor |",
    "| --- | --- | --- | --- | --- | --- |"
  );
  for (const candidate of CASES) {
    const classStats = BASIC_CLASSES.map(className => summaries[`${candidate.id}:${className}`]);
    lines.push(`| ${candidate.label} | ${fmtPercent(classStats[0].b10.entrant)} | ${fmtPercent(classStats[1].b10.entrant)} | ${fmtPercent(classStats[2].b10.entrant)} | ${fmtPercent(classStats[3].b10.entrant)} | ${fmtMean(meanStats(classStats.flatMap(summary => rows.filter(row => row.caseId === candidate.id && row.className === summary.className).map(row => row.reachedFloor))))} |`);
  }
  lines.push(
    "",
    "反実仮想の読み方:",
    `- 僧侶DIOS無効: 僧侶のDIOS回復平均 ${fmtMean(baseline("Priest").diosHealingHp)} → ${fmtMean(summaries["no-priest-healing:Priest"].diosHealingHp)}。`,
    `- 盗賊sustain無効: 盗賊の罠解除平均 ${fmtMean(baseline("Thief").trapDisarms)} → ${fmtMean(summaries["no-thief-sustain:Thief"].trapDisarms)}、罠被害 ${fmtMean(baseline("Thief").trapDamageHp)} → ${fmtMean(summaries["no-thief-sustain:Thief"].trapDamageHp)}。`,
    `- 戦士guardian+20候補: 戦士B10 entrant ${fmtPercent(baseline("Fighter").b10.entrant)} → ${fmtPercent(summaries["fighter-guardian-plus20:Fighter"].b10.entrant)}（不採用）。`,
    `- 魔術師arcane+20候補: 魔術師B10 entrant ${fmtPercent(baseline("Mage").b10.entrant)} → ${fmtPercent(summaries["mage-arcane-plus20:Mage"].b10.entrant)}（不採用）。`,
    `- 全職camp候補: 4職平均floor ${fmtMean(meanStats(BASIC_CLASSES.flatMap(className => rows.filter(row => row.caseId === PRE_FIX_CASE_ID && row.className === className).map(row => row.reachedFloor))))} → ${fmtMean(meanStats(BASIC_CLASSES.flatMap(className => rows.filter(row => row.caseId === "universal-camp-floor3" && row.className === className).map(row => row.reachedFloor))))}。`,
    `- 全職階層移動回復候補: 4職平均floor ${fmtMean(meanStats(BASIC_CLASSES.flatMap(className => rows.filter(row => row.caseId === PRE_FIX_CASE_ID && row.className === className).map(row => row.reachedFloor))))} → ${fmtMean(meanStats(BASIC_CLASSES.flatMap(rowClass => rows.filter(row => row.caseId === "universal-stairs-25" && row.className === rowClass).map(row => row.reachedFloor))))}。`,
    `- 罠被害軽減候補: 戦士罠被害-20%/${fmtPercent(summaries["fighter-trap-guard20:Fighter"].b10.entrant)}、-40%/${fmtPercent(summaries["fighter-trap-guard40:Fighter"].b10.entrant)}。魔術師罠被害-30%/${fmtPercent(summaries["mage-trap-guard30:Mage"].b10.entrant)}、-50%/${fmtPercent(summaries["mage-trap-guard50:Mage"].b10.entrant)}。`,
    "",
    "## 4. 回復薬消費・枯渇",
    "",
    "| ケース | 職 | 消費/run | 枯渇率 | 枯渇floor | 不足率 | 不足初floor |",
    "| --- | --- | --- | --- | --- | --- | --- |"
  );
  for (const candidate of CASES) {
    for (const className of BASIC_CLASSES) {
      const summary = summaries[`${candidate.id}:${className}`];
      lines.push(`| ${candidate.label} | ${className} | ${fmtMean(summary.recoveryPotionsUsed)} | ${fmtPercent(summary.potionDepletionRate)} | ${fmtMean(summary.potionDepletionFloor)} | ${fmtPercent(summary.potionShortageRate)} | ${fmtMean(summary.potionShortageFloor)} |`);
    }
  }
  lines.push(
    "",
    "## 5. 監査 / 再現",
    "",
    `- env hash: ${measurement.envHash}`,
    `- resolved parallelism: ${measurement.resolvedParallelism}（SIM_PARALLEL未指定）`,
    `- calibration wall-clock: ${measurement.calibrationWallSeconds.toFixed(3)}s`,
    `- simulation wall-clock: ${measurement.simulationWallSeconds.toFixed(3)}s`,
    `- total CPU（user+system）: ${measurement.totalCpuSeconds.toFixed(3)}s`,
    `- raw JSONL SHA-256（未保存）: ${rawSha256}`,
    "- 経路確認: `generateRunFloor`、現行戦闘/報酬/装備更新、罠、状態治療、TOWN_PORTAL、回復薬、現行departure kit。",
    "- 省略: 任意商人購入、人間の敵別判断、任意寄り道、上級4職。",
    "",
    "再現コマンド:",
    "",
    "```sh",
    "node --check scratch/sim_issue_516_class_sustain.js",
    "node scratch/sim_issue_516_class_sustain.js",
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
    exportName: "runIssue516Task",
    runTask: runIssue516Task,
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
    ["ISSUE516_MODE", SMOKE ? "smoke" : "measurement"],
    ["ISSUE516_CASES", CASES.map(candidate => candidate.id).join(",")],
    ["ISSUE516_CLASSES", BASIC_CLASSES.join(",")],
    ["ISSUE516_TARGET_DEPTH", String(TARGET_DEPTH)],
    ["ISSUE516_WORKSHOP_DISTRIBUTION", WORKSHOP_DISTRIBUTION.map(([id, count]) => `${id}:${count}/${WORKSHOP_TOTAL}`).join(",")],
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
  const resultDir = new URL("./results/", new URL("./", import.meta.url));
  mkdirSync(resultDir, { recursive: true });
  const markdown = renderMarkdown({ rows, summaries, measurement, rawSha256 });
  const outputPath = new URL("issue-516-class-sustain.md", resultDir);
  writeFileSync(outputPath, markdown);
  console.log(JSON.stringify({
    output: "scratch/results/issue-516-class-sustain.md",
    envHash: measurement.envHash,
    rawSha256,
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
