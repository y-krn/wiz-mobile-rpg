// sim-scope: run — Issue #537 Mage HP order and MP-ward sweep
/* global console, process */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";

import { CLASS_PASSIVES } from "../src/data/classes.js";
import { createSoloCharacter } from "../src/state/initial_state.js";
import { resolveSimParallelism, runSimTasks } from "./sim_parallel.js";

const SMOKE = process.env.ISSUE537_SMOKE === "1";
const DEFAULT_RUNS = 500;
const DEFAULT_CALIBRATION_RUNS = 100;
const RUNS = SMOKE ? 2 : Math.max(1, Number(process.env.SIM_RUNS || DEFAULT_RUNS));
const CALIBRATION_RUNS = SMOKE
  ? 1
  : Math.max(1, Number(process.env.SIM_CALIBRATION_RUNS || DEFAULT_CALIBRATION_RUNS));
const SEED = Number(process.env.SIM_SEED || 461) >>> 0;
const TARGET_DEPTH = 21;
const CLASSES = Object.freeze(["Fighter", "Thief", "Priest", "Mage"]);
const CLASS_LABELS = Object.freeze({
  Fighter: "戦士",
  Thief: "盗賊",
  Priest: "僧侶",
  Mage: "魔術師"
});
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
const ENDPOINTS = Object.freeze(["b5", "b10"]);
const DAMAGE_SOURCES = Object.freeze([
  "floor-trap",
  "chest-trap",
  "normal",
  "elite",
  "midboss",
  "boss"
]);
const SOURCE_LABELS = Object.freeze({
  "floor-trap": "床罠",
  "chest-trap": "宝箱罠",
  normal: "通常戦闘",
  elite: "エリート",
  midboss: "中ボス",
  boss: "boss"
});
const LEGACY_MAGE_BASE_HP = 21;
const LEGACY_MAGE_MP_WARD = 4;
const LEGACY_MAGE_KILL_HEAL = 4;
const LEGACY_MAGE_TRAP_GUARD = 50;
const LEGACY_MAGE_KILL_MP = 1;
const LEGACY_MAGE_SPELL_CYCLE_MP = 2;
const SOURCE_MAGE_BASE_HP = createSoloCharacter("Mage").maxHp;

if (process.env.SIM_PARALLEL !== undefined) {
  throw new Error("SIM_PARALLEL must be omitted for Issue #537 measurement");
}

function mageBaseScenario(baseHp, extra = {}) {
  return {
    hpBaseBonus: baseHp - SOURCE_MAGE_BASE_HP,
    ...extra
  };
}

const ENV_DEFAULTS = Object.freeze({
  SIM_SEED: String(SEED),
  SIM_RUNS: String(RUNS),
  SIM_CALIBRATION_RUNS: String(CALIBRATION_RUNS),
  DEPARTURE_CRAFT_IDS:
    "TOWN_PORTAL,HEAL_POTION,HEAL_POTION,HEAL_POTION,HEAL_POTION,ANTIDOTE,GUARD_POTION",
  IDENTIFICATION_POLICY: "powder",
  IDENTIFICATION_STARTING_POWDER: "2",
  IDENTIFICATION_COST_OVERRIDE: "1",
  TRAP_POLICY: "conservative",
  TRAP_AVOIDANCE_POLICY: "ev",
  TRAP_DAMAGE_MULTIPLIER: "1",
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
  generateSharedRunFloor,
  getScenarioById,
  resetSimulationRandom,
  simulateRun,
  SIM_CLASSES
} = simulationModule;

if (!SMOKE && JSON.stringify(SIM_CLASSES) !== JSON.stringify(CLASSES)) {
  throw new Error(`unexpected SIM_CLASSES: ${SIM_CLASSES.join(",")}`);
}

const CASES = Object.freeze([
  {
    id: "current",
    label: "現行（HP21 / mpWard4）",
    targetClass: "Mage",
    scenario: mageBaseScenario(LEGACY_MAGE_BASE_HP),
    mpWard: LEGACY_MAGE_MP_WARD
  },
  ...[12, 13, 14].map(baseHp => ({
    id: `mage-base-hp-${baseHp}`,
    label: `魔術師 基礎HP${baseHp} / mpWard4`,
    targetClass: "Mage",
    scenario: mageBaseScenario(baseHp),
    mpWard: LEGACY_MAGE_MP_WARD
  })),
  ...[5, 6, 7, 8, 9, 10].map(mpWard => ({
    id: `mage-base-hp-14-mpward-${mpWard}`,
    label: `魔術師 基礎HP14 / mpWard${mpWard}`,
    targetClass: "Mage",
    scenario: mageBaseScenario(14),
    mpWard
  })),
  {
    id: "mage-base-hp-14-growth-3-5-mpward-4",
    label: "魔術師 基礎HP14 / 成長3..5 / mpWard4",
    targetClass: "Mage",
    scenario: mageBaseScenario(14, { hpGrowthBonus: -1 }),
    mpWard: LEGACY_MAGE_MP_WARD
  },
  {
    id: "mage-base-hp-14-growth-3-5-mpward-8",
    label: "魔術師 基礎HP14 / 成長3..5 / mpWard8",
    targetClass: "Mage",
    scenario: mageBaseScenario(14, { hpGrowthBonus: -1 }),
    mpWard: 8
  },
  {
    id: "mage-base-hp-14-growth-3-5-mpward-10",
    label: "魔術師 基礎HP14 / 成長3..5 / mpWard10",
    targetClass: "Mage",
    scenario: mageBaseScenario(14, { hpGrowthBonus: -1 }),
    mpWard: 10
  },
  ...[6, 8, 10].map(killHeal => ({
    id: `mage-base-hp-14-mpward-8-killheal-${killHeal}`,
    label: `魔術師 基礎HP14 / mpWard8 / killHeal${killHeal}`,
    targetClass: "Mage",
    scenario: mageBaseScenario(14),
    mpWard: 8,
    killHeal
  })),
  ...[30, 40, 50].map(arcane => ({
    id: `mage-base-hp-14-mpward-8-arcane-${arcane}`,
    label: `魔術師 基礎HP14 / mpWard8 / arcane${arcane}`,
    targetClass: "Mage",
    scenario: mageBaseScenario(14),
    mpWard: 8,
    arcane
  })),
  {
    id: "mage-base-hp-14-mpward-10-killheal-10",
    label: "魔術師 基礎HP14 / mpWard10 / killHeal10",
    targetClass: "Mage",
    scenario: mageBaseScenario(14),
    mpWard: 10,
    killHeal: 10
  },
  ...[12, 16, 20].map(mpWard => ({
    id: `mage-base-hp-14-mpward-${mpWard}`,
    label: `魔術師 基礎HP14 / mpWard${mpWard}`,
    targetClass: "Mage",
    scenario: mageBaseScenario(14),
    mpWard
  })),
  ...[12, 14, 16].map(killHeal => ({
    id: `mage-base-hp-14-mpward-10-killheal-${killHeal}`,
    label: `魔術師 基礎HP14 / mpWard10 / killHeal${killHeal}`,
    targetClass: "Mage",
    scenario: mageBaseScenario(14),
    mpWard: 10,
    killHeal
  })),
  ...[4, 6].map(spellCycleMp => ({
    id: `mage-base-hp-14-mpward-8-cycle-${spellCycleMp}`,
    label: `魔術師 基礎HP14 / mpWard8 / spellCycleMp${spellCycleMp}`,
    targetClass: "Mage",
    scenario: mageBaseScenario(14),
    mpWard: 8,
    spellCycleMp
  })),
  ...[2, 3].map(killMp => ({
    id: `mage-base-hp-14-mpward-8-killmp-${killMp}`,
    label: `魔術師 基礎HP14 / mpWard8 / killMp${killMp}`,
    targetClass: "Mage",
    scenario: mageBaseScenario(14),
    mpWard: 8,
    killMp
  })),
  {
    id: "mage-base-hp-14-mpward-10-cycle-4-killheal-8",
    label: "魔術師 基礎HP14 / mpWard10 / spellCycleMp4 / killHeal8",
    targetClass: "Mage",
    scenario: mageBaseScenario(14),
    mpWard: 10,
    spellCycleMp: 4,
    killHeal: 8
  },
  ...[10, 12, 14, 15, 16].map(killHeal => ({
    id: `mage-base-hp-14-mpward-16-killheal-${killHeal}`,
    label: `魔術師 基礎HP14 / mpWard16 / killHeal${killHeal}`,
    targetClass: "Mage",
    scenario: mageBaseScenario(14),
    mpWard: 16,
    killHeal
  })),
  {
    id: "mage-base-hp-14-mpward-20-killheal-14",
    label: "魔術師 基礎HP14 / mpWard20 / killHeal14",
    targetClass: "Mage",
    scenario: mageBaseScenario(14),
    mpWard: 20,
    killHeal: 14
  },
  ...[70, 100].map(trapGuard => ({
    id: `mage-base-hp-14-trapguard-${trapGuard}`,
    label: `魔術師 基礎HP14 / trapGuard${trapGuard}%`,
    targetClass: "Mage",
    scenario: mageBaseScenario(14, {
      trapGuardOverride: { className: "Mage", value: trapGuard }
    }),
    mpWard: 4
  })),
  {
    id: "mage-base-hp-14-trapguard-100-mpward-8-killheal-8",
    label: "魔術師 基礎HP14 / trapGuard100% / mpWard8 / killHeal8",
    targetClass: "Mage",
    scenario: mageBaseScenario(14, {
      trapGuardOverride: { className: "Mage", value: 100 }
    }),
    mpWard: 8,
    killHeal: 8
  },
  {
    id: "mage-base-hp-14-trapguard-100-mpward-10-killheal-10",
    label: "魔術師 基礎HP14 / trapGuard100% / mpWard10 / killHeal10",
    targetClass: "Mage",
    scenario: mageBaseScenario(14, {
      trapGuardOverride: { className: "Mage", value: 100 }
    }),
    mpWard: 10,
    killHeal: 10
  },
  ...[70, 80].flatMap(trapGuard => [
    {
      id: `mage-base-hp-14-trapguard-${trapGuard}-mpward-8-killheal-8`,
      label: `魔術師 基礎HP14 / trapGuard${trapGuard}% / mpWard8 / killHeal8`,
      targetClass: "Mage",
      scenario: mageBaseScenario(14, {
        trapGuardOverride: { className: "Mage", value: trapGuard }
      }),
      mpWard: 8,
      killHeal: 8
    },
    {
      id: `mage-base-hp-14-trapguard-${trapGuard}-mpward-10-killheal-10`,
      label: `魔術師 基礎HP14 / trapGuard${trapGuard}% / mpWard10 / killHeal10`,
      targetClass: "Mage",
      scenario: mageBaseScenario(14, {
        trapGuardOverride: { className: "Mage", value: trapGuard }
      }),
      mpWard: 10,
      killHeal: 10
    }
  ]),
  {
    id: "mage-base-hp-14-trapguard-70-mpward-8-killheal-10",
    label: "魔術師 基礎HP14 / trapGuard70% / mpWard8 / killHeal10",
    targetClass: "Mage",
    scenario: mageBaseScenario(14, {
      trapGuardOverride: { className: "Mage", value: 70 }
    }),
    mpWard: 8,
    killHeal: 10
  },
  {
    id: "mage-base-hp-14-trapguard-60-mpward-10-killheal-10",
    label: "魔術師 基礎HP14 / trapGuard60% / mpWard10 / killHeal10",
    targetClass: "Mage",
    scenario: mageBaseScenario(14, {
      trapGuardOverride: { className: "Mage", value: 60 }
    }),
    mpWard: 10,
    killHeal: 10
  },
  ...[
    [55, 8, 10],
    [55, 10, 10],
    [60, 8, 10],
    [60, 10, 8]
  ].map(([trapGuard, mpWard, killHeal]) => ({
    id: `mage-base-hp-14-trapguard-${trapGuard}-mpward-${mpWard}-killheal-${killHeal}`,
    label: `魔術師 基礎HP14 / trapGuard${trapGuard}% / mpWard${mpWard} / killHeal${killHeal}`,
    targetClass: "Mage",
    scenario: mageBaseScenario(14, {
      trapGuardOverride: { className: "Mage", value: trapGuard }
    }),
    mpWard,
    killHeal
  })),
  ...[2, 4, 6, 8, 10].map(intBonus => ({
    id: `mage-base-hp-14-int-plus-${intBonus}`,
    label: `魔術師 基礎HP14 / INT+${intBonus}`,
    targetClass: "Mage",
    scenario: mageBaseScenario(14, { intBonus }),
    mpWard: 4
  })),
  ...[4, 8].map(intBonus => ({
    id: `mage-base-hp-14-mpward-8-int-plus-${intBonus}`,
    label: `魔術師 基礎HP14 / mpWard8 / INT+${intBonus}`,
    targetClass: "Mage",
    scenario: mageBaseScenario(14, { intBonus }),
    mpWard: 8
  }
  ))
]);
const CASE_FILTER = process.env.ISSUE537_CASE_FILTER
  ? new Set(process.env.ISSUE537_CASE_FILTER.split(",").filter(Boolean))
  : null;
const ACTIVE_CASES = CASE_FILTER
  ? CASES.filter(candidate => CASE_FILTER.has(candidate.id))
  : CASES;
if (CASE_FILTER && ACTIVE_CASES.length !== CASE_FILTER.size) {
  const known = new Set(CASES.map(candidate => candidate.id));
  const unknown = [...CASE_FILTER].filter(caseId => !known.has(caseId));
  throw new Error(`unknown ISSUE537_CASE_FILTER: ${unknown.join(",")}`);
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

function scenarioForRun(runIndex) {
  const position = ((runIndex * 37) % RUNS + 0.5) / RUNS * WORKSHOP_TOTAL;
  let cumulative = 0;
  for (const [scenarioId, count] of WORKSHOP_DISTRIBUTION) {
    cumulative += count;
    if (position < cumulative) return scenarioId;
  }
  return WORKSHOP_DISTRIBUTION.at(-1)[0];
}

function getCase(caseId) {
  const candidate = CASES.find(item => item.id === caseId);
  if (!candidate) throw new Error(`unknown case: ${caseId}`);
  return candidate;
}

function applyCasePatch(caseInfo) {
  CLASS_PASSIVES.Mage.bonuses.killHeal = caseInfo.killHeal ?? LEGACY_MAGE_KILL_HEAL;
  CLASS_PASSIVES.Mage.bonuses.trapGuard = LEGACY_MAGE_TRAP_GUARD;
  CLASS_PASSIVES.Mage.bonuses.mpWard = caseInfo.mpWard;
  CLASS_PASSIVES.Mage.bonuses.arcane = caseInfo.arcane ?? 20;
  CLASS_PASSIVES.Mage.bonuses.killMp = caseInfo.killMp ?? LEGACY_MAGE_KILL_MP;
  CLASS_PASSIVES.Mage.bonuses.spellCycleMp = caseInfo.spellCycleMp ?? LEGACY_MAGE_SPELL_CYCLE_MP;
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
    outcome: result.outcome,
    survived: result.survived,
    died: result.died,
    reachedFloor: result.reachedFloor,
    deathFloor: result.deathFloor,
    endpoints: Object.fromEntries(ENDPOINTS.map(endpointId => [
      endpointId,
      endpoint(result, Number(endpointId.slice(1)))
    ])),
    damageHpBySource: { ...(result.damageHpBySource || {}) },
    deathEncounterType: result.deathEncounterType || null,
    deathCause: result.deathCause || null,
    deathSnapshot: result.deathSnapshot ? { ...result.deathSnapshot } : null,
    killHeal: { ...(result.killHeal || {}) },
    combatRounds: result.combatRounds || 0,
    incomingHits: result.incomingHits || 0,
    incomingHitTurns: result.incomingHitTurns || 0,
    combatDamageHp: result.combatDamageHp || 0,
    materialEvPerTime: result.timeCost > 0
      ? result.bankedMaterials / result.timeCost
      : 0,
    bankedMaterials: result.bankedMaterials,
    timeCost: result.timeCost
  };
}

export { generateSharedRunFloor };

export function runIssue537Task(task, context) {
  const caseInfo = getCase(task.caseId);
  applyCasePatch(caseInfo);
  resetSimulationRandom(hashSeed(
    `${SEED}:issue537:${task.scenarioId}:${task.className}:${task.runIndex}`
  ));
  const baseScenario = getScenarioById(task.scenarioId);
  const intervention = caseInfo.targetClass === task.className ? caseInfo.scenario : {};
  const scenario = { ...baseScenario, ...intervention };
  const result = simulateRun({
    className: task.className,
    startFloor: 1,
    targetDepth: TARGET_DEPTH,
    runIndex: task.runIndex,
    seriesId: `issue537:${task.scenarioId}`,
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

function fmtRate(stat, digits = 1) {
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
  const selected = rows.filter(row => row.caseId === caseId && row.className === className);
  const deaths = selected.filter(row => row.died);
  const deathSnapshots = deaths.map(row => row.deathSnapshot).filter(Boolean);
  const deathSourceCounts = Object.fromEntries(DAMAGE_SOURCES.map(source => [source, 0]));
  deaths.forEach(row => {
    const source = row.deathSnapshot?.source || row.deathEncounterType;
    if (source && source in deathSourceCounts) deathSourceCounts[source]++;
  });
  return {
    caseId,
    className,
    runs: selected.length,
    b5: endpointStats(selected, "b5"),
    b10: endpointStats(selected, "b10"),
    averageFloor: meanStats(selected.map(row => row.reachedFloor)),
    survivalRate: wilson(selected.filter(row => row.survived).length, selected.length),
    materialEvPerTime: meanStats(selected.map(row => row.materialEvPerTime)),
    combatRounds: meanStats(selected.map(row => row.combatRounds)),
    incomingHits: meanStats(selected.map(row => row.incomingHits)),
    incomingHitTurns: meanStats(selected.map(row => row.incomingHitTurns)),
    damageBySource: Object.fromEntries(DAMAGE_SOURCES.map(source => [
      source,
      meanStats(selected.map(row => row.damageHpBySource[source] || 0))
    ])),
    deathSource: Object.fromEntries(DAMAGE_SOURCES.map(source => [
      source,
      wilson(deathSourceCounts[source], deaths.length)
    ])),
    lastDamage: {
      damage: meanStats(deathSnapshots.map(snapshot => snapshot.damage || 0)),
      damageMaxHpRate: meanStats(deathSnapshots.map(snapshot => snapshot.damageMaxHpRate || 0)),
      hits: meanStats(deathSnapshots.map(snapshot => snapshot.hits || 0))
    },
    killHeal: {
      activationsPerRun: meanStats(selected.map(row => row.killHeal.killHealActivations || 0)),
      recoveredHpPerRun: meanStats(selected.map(row => row.killHeal.killHealRecoveredHp || 0)),
      activationsBeforeDeath: meanStats(deaths.map(row => row.deathSnapshot?.killHealActivationsBeforeDeath || 0)),
      zeroActivationDeathRate: wilson(
        deaths.filter(row => (row.deathSnapshot?.killHealActivationsBeforeDeath || 0) === 0).length,
        deaths.length
      )
    }
  };
}

function renderEndpoint(stats) {
  return `E ${fmtRate(stats.entrant)} / X ${fmtRate(stats.breakthrough)} / D ${fmtRate(stats.death)} / R ${fmtRate(stats.retreat)}`;
}

function renderMarkdown({ rows, summaries, measurement, rawSha256, summarySha256, provenance }) {
  const summary = (caseId, className) => summaries[`${caseId}:${className}`];
  const baseline = Object.fromEntries(CLASSES.map(className => [className, summary("current", className)]));
  const lines = [
    "# Issue #537 魔術師HP順序・mpWard掃引 測定結果",
    "",
    "## 結論",
    "",
    "- 採用: 魔術師 基礎HP14 / 成長4..6 / trapGuard70 / mpWard10 / killHeal10。#534のN=3000基準線とkillHeal単独 sweepは再利用し、同条件を再測定しない。",
    "- 採用点 N=500: B5死亡8.16%、B10到達26.6%、平均floor7.39、戦闘54.27turn/run、被弾46.27turn/run、素材EV/時間0.1623。",
    "- HP順序候補の広域掃引後、下表ではtrapGuard55/60/70の隣接候補を同一seed条件で比較。採用値は主判定（B5死亡率・B10到達率）と被弾ターン数・素材EV/時間で選ぶ。",
    "- 他3職は候補介入なし。B10 entrant差を併記し、悪化候補を除外する。",
    "",
    "## 現行基準線",
    "",
    "| 職 | B5 E/X/D/R | B10 E/X/D/R | 平均floor | 生還率 | 素材EV/時間 | 戦闘turn/run | 被弾turn/run | 被弾hit/run | killHeal発動/run |",
    "| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: |"
  ];
  for (const className of CLASSES) {
    const value = baseline[className];
    lines.push(`| ${CLASS_LABELS[className]} | ${renderEndpoint(value.b5)} | ${renderEndpoint(value.b10)} | ${fmtMean(value.averageFloor)} | ${fmtRate(value.survivalRate)} | ${fmtMean(value.materialEvPerTime, 4)} | ${fmtMean(value.combatRounds)} | ${fmtMean(value.incomingHitTurns)} | ${fmtMean(value.incomingHits)} | ${fmtMean(value.killHeal.activationsPerRun)} |`);
  }
  lines.push(
    "",
    "E=entrant（全run分母）、X/D/Rはentrant分母。X/D/R合計100%。率=Wilson 95% CI、平均=正規近似95% CI。N<30は未確定。",
    "",
    "## 候補 sweep",
    "",
    "| 候補 | 魔術師 B5 E/X/D/R | 魔術師 B10 E/X/D/R | 平均floor | 素材EV/時間 | 戦闘turn/run | 被弾turn/run | 被弾hit/run | killHeal発動/run | 死亡直前被害/最大HP | 他職B10 entrant Δ（戦/盗/僧） |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |"
  );
  for (const candidate of ACTIVE_CASES) {
    const mage = summary(candidate.id, "Mage");
    const deltas = ["Fighter", "Thief", "Priest"].map(className => {
      const current = baseline[className].b10.entrant.estimate;
      const value = summary(candidate.id, className).b10.entrant.estimate;
      return `${((value - current) * 100).toFixed(1)}pt`;
    }).join(" / ");
    lines.push(`| ${candidate.label} | ${renderEndpoint(mage.b5)} | ${renderEndpoint(mage.b10)} | ${fmtMean(mage.averageFloor)} | ${fmtMean(mage.materialEvPerTime, 4)} | ${fmtMean(mage.combatRounds)} | ${fmtMean(mage.incomingHitTurns)} | ${fmtMean(mage.incomingHits)} | ${fmtMean(mage.killHeal.activationsPerRun)} | ${fmtMean(mage.lastDamage.damageMaxHpRate, 3)} | ${deltas} |`);
  }
  lines.push(
    "",
    "## 死亡source・killHeal",
    "",
    "| 候補 | 死亡run内 source | 被害HP/run（床罠 / 宝箱罠 / 通常 / boss） | 死亡直前被害 | 被害hit数 | killHeal発動0死亡率 |",
    "| --- | --- | --- | ---: | ---: | ---: |"
  );
  for (const candidate of ACTIVE_CASES) {
    const mage = summary(candidate.id, "Mage");
    const sourceText = DAMAGE_SOURCES
      .filter(source => mage.deathSource[source].estimate > 0)
      .map(source => `${SOURCE_LABELS[source]} ${fmtRate(mage.deathSource[source])}`)
      .join(" / ") || "未観測";
    const damageText = ["floor-trap", "chest-trap", "normal", "boss"]
      .map(source => fmtMean(mage.damageBySource[source]))
      .join(" / ");
    lines.push(`| ${candidate.label} | ${sourceText} | ${damageText} | ${fmtMean(mage.lastDamage.damage)} | ${fmtMean(mage.lastDamage.hits)} | ${fmtRate(mage.killHeal.zeroActivationDeathRate)} |`);
  }
  lines.push(
    "",
    "## #534 結果再利用",
    "",
    "- `killHeal+6/+8/+10` の B10到達率 14.8% / 21.0% / 26.2%、B5死亡率 14.2% / 12.5% / 13.6%、戦闘 39.74 / 48.16 / 55.39 turn/run、素材EV/時間 0.1650 / 0.1664 / 0.1588 を再利用。",
    "- `ARCH_WAND` 戦闘短縮は B5死亡14.1%、B10到達8.4%、戦闘36.37 turn/run、素材EV/時間0.1722。HP順序候補との組合せは新規測定対象外。",
    "",
    "## 測定条件・再現",
    "",
    `- seed=${SEED}、各候補・職 N=${RUNS}、calibration N=${CALIBRATION_RUNS}、target depth=${TARGET_DEPTH}、工房6状態分布=${WORKSHOP_DISTRIBUTION.map(([id, count]) => `${id}:${count}/${WORKSHOP_TOTAL}`).join(", ")}`,
    "- 出発kit `TOWN_PORTAL + HEAL_POTION×4 + ANTIDOTE + GUARD_POTION`、powder鑑定、EV逃走、conservative罠、EV罠回避、smart状態治療、商人購入なし。",
    "- HP候補はMage sim-only override。`mpWard` はMage passiveだけ変更。#534既存掃引は再利用。",
    `- source commit: ${provenance.sourceCommit}`,
    `- origin/main ancestor: ${provenance.originMainAncestor}`,
    `- stale tree allowed: ${provenance.staleTreeAllowed}`,
    `- env hash: ${measurement.envHash}`,
    `- resolved parallelism: ${measurement.resolvedParallelism}`,
    `- calibration wall-clock: ${measurement.calibrationWallSeconds.toFixed(3)}s / simulation wall-clock: ${measurement.simulationWallSeconds.toFixed(3)}s / total CPU: ${measurement.totalCpuSeconds.toFixed(3)}s`,
    `- raw JSONL SHA-256（未追跡）: ${rawSha256}`,
    `- summary JSON SHA-256（未追跡）: ${summarySha256}`,
    "- 被弾turnは、敵からHP damageを受けたcombat round数。被弾hitは同round内の被弾数。",
    "- Wilson 95% CI。N<30セルは未確定として結論に使わない。",
    "",
    "再現コマンド:",
    "",
    "```sh",
    "node --check scratch/sim_issue_537_mage_hp_order.js",
    "ISSUE537_SMOKE=1 node scratch/sim_issue_537_mage_hp_order.js",
    "SIM_RUNS=500 SIM_CALIBRATION_RUNS=100 ISSUE537_CASE_FILTER=current,mage-base-hp-14-trapguard-55-mpward-10-killheal-10,mage-base-hp-14-trapguard-60-mpward-10-killheal-10,mage-base-hp-14-trapguard-70-mpward-10-killheal-10 node scratch/sim_issue_537_mage_hp_order.js",
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
  const tasks = ACTIVE_CASES.flatMap(candidate => CLASSES.flatMap(className =>
    Array.from({ length: RUNS }, (_, runIndex) => ({
      caseId: candidate.id,
      className,
      runIndex,
      scenarioId: scenarioForRun(runIndex)
    }))
  ));
  const resolvedParallelism = resolveSimParallelism(tasks.length);
  const simulationStarted = performance.now();
  const simulationCpuStarted = process.cpuUsage();
  const rows = await runSimTasks({
    moduleUrl: pathToFileURL(new URL(import.meta.url).pathname).href,
    exportName: "runIssue537Task",
    runTask: runIssue537Task,
    tasks,
    context: { scoringProfiles },
    mapGeneratorExportName: "generateSharedRunFloor"
  });
  const simulationCpu = process.cpuUsage(simulationCpuStarted);
  const simulationWallSeconds = (performance.now() - simulationStarted) / 1000;
  if (rows.length !== tasks.length) throw new Error(`raw result audit failed: rows=${rows.length}/${tasks.length}`);
  const rawText = rows.map(row => JSON.stringify(row)).join("\n") + "\n";
  const rawSha256 = sha256(rawText);
  const env = {
    ...ENV_DEFAULTS,
    ISSUE537_MODE: SMOKE ? "smoke" : "measurement",
    ISSUE537_CASES: ACTIVE_CASES.map(candidate => candidate.id).join(","),
    ISSUE537_CLASSES: CLASSES.join(","),
    ISSUE537_TARGET_DEPTH: String(TARGET_DEPTH),
    ISSUE537_WORKSHOP_DISTRIBUTION: WORKSHOP_DISTRIBUTION.map(([id, count]) => `${id}:${count}/${WORKSHOP_TOTAL}`).join(","),
    SIM_PARALLEL: "<omitted; runtime default>",
    SIM_MAP_CACHE_ENTRIES: "<omitted; runtime default 1024>"
  };
  const envCanonical = Object.entries(env).sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`).join("\n") + "\n";
  const measurement = {
    envHash: sha256(envCanonical),
    resolvedParallelism,
    calibrationWallSeconds,
    simulationWallSeconds,
    totalCpuSeconds: (
      calibrationCpu.user + calibrationCpu.system + simulationCpu.user + simulationCpu.system
    ) / 1e6
  };
  const summaries = Object.fromEntries(ACTIVE_CASES.flatMap(candidate =>
    CLASSES.map(className => [`${candidate.id}:${className}`, summarizeClass(rows, candidate.id, className)])
  ));
  const provenance = simulationModule.MEASUREMENT_PROVENANCE || {
    sourceCommit: "test",
    originMainAncestor: null,
    staleTreeAllowed: null
  };
  const summary = { measurement, env, cases: ACTIVE_CASES, summaries, provenance };
  const resultDir = new URL("./results/", new URL("./", import.meta.url));
  mkdirSync(resultDir, { recursive: true });
  const rawPath = new URL("issue-537-mage-hp-order.jsonl", resultDir);
  const summaryPath = new URL("issue-537-mage-hp-order.json", resultDir);
  const markdownPath = new URL("issue-537-mage-hp-order.md", resultDir);
  writeFileSync(rawPath, rawText);
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  const summarySha256 = sha256(readFileSync(summaryPath));
  writeFileSync(markdownPath, renderMarkdown({ rows, summaries, measurement, rawSha256, summarySha256, provenance }));
  console.log(JSON.stringify({
    output: "scratch/results/issue-537-mage-hp-order.md",
    envHash: measurement.envHash,
    rawSha256,
    summarySha256,
    sourceCommit: provenance.sourceCommit,
    originMainAncestor: provenance.originMainAncestor,
    cases: ACTIVE_CASES.length,
    runsPerCaseClass: RUNS,
    calibrationRuns: CALIBRATION_RUNS,
    resolvedParallelism,
    wallClockSeconds: calibrationWallSeconds + simulationWallSeconds,
    cpuTotalSeconds: measurement.totalCpuSeconds
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
