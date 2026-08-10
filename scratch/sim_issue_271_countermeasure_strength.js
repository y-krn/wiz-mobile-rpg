// sim-scope: run
// Issue #271 Phase 2b: countermeasure affix strength and mechanism audit.

/* global console, process */

import { createHash } from "node:crypto";
import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeSync,
  writeFileSync
} from "node:fs";
import { availableParallelism } from "node:os";
import { performance } from "node:perf_hooks";
import { isMainThread } from "node:worker_threads";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveSimParallelism, runSimTasks } from "./sim_parallel.js";
import {
  getBuildSnapshot,
  inferPairingEligibility,
  resolveDiagnosticMode
} from "./measurement_utils.js";

const ALL_SCENARIO_IDS = Object.freeze([
  "workshop-empty",
  "workshop-stats",
  "workshop-gear",
  "workshop-blood-wand",
  "workshop-blood-wand-spells",
  "workshop-core-pools",
  "workshop-complete"
]);
const BASIC_CLASSES = Object.freeze(["Fighter", "Thief", "Priest", "Mage"]);
const CURE_POLICIES = Object.freeze(["smart", "never"]);
const ATTACK_STRENGTHS = Object.freeze([1, 5, 10, 25, 100]);
const DEFENSE_STRENGTHS = Object.freeze([1, 5, 10, 25, 100]);
const DEFENSE_AFFIXES = Object.freeze([
  "statusResistance",
  "poisonWard",
  "spellGuard",
  "guardian",
  "frontGuard"
]);
const PRIMARY_SCENARIO = "workshop-core-pools";
const COUNTERMEASURE_START_FLOOR = 3;
const TARGET_DEPTH = 21;
const B5 = 5;
const R95 = 1.959963984540054;
const MIN_GROUP_N = 30;
const CELL_BATCH_SIZE = 8;
const PRACTICAL_SURVIVAL_FLOOR = 0.20;
const B5_ENTRANT_RATE = 507 / 2200;
const SMALLEST_AFFIX_RATE = 0.01;
const REQUIRED_RUNS = Math.ceil(
  MIN_GROUP_N / (B5_ENTRANT_RATE * SMALLEST_AFFIX_RATE)
);
const PLANNED_RUNS = Math.ceil(REQUIRED_RUNS / 1000) * 1000;

const RUNS = Math.max(1, Number(process.env.SIM_RUNS || PLANNED_RUNS));
const CALIBRATION_RUNS = 100;
const SEED = Number(process.env.SIM_SEED || 271) >>> 0;
const FLEE_HP_THRESHOLD = Number(process.env.FLEE_HP_THRESHOLD || 0.35);
const IDENTIFICATION_POLICY = "powder";
const REQUESTED_SCENARIOS = String(
  process.env.CM_SCENARIOS || ALL_SCENARIO_IDS.join(",")
).split(",").map(value => value.trim()).filter(Boolean);
const AUDIT_RUNS = Math.max(1, Number(process.env.SIM_AUDIT_RUNS || 500));
const DIAGNOSTIC_MODE = resolveDiagnosticMode(process.env.SIM_DIAGNOSTICS);
const RESULT_BASENAME = process.env.SIM_RESULT_BASENAME ||
  "issue-271-countermeasure-strength";
const REQUESTED_ATTACK_STRENGTHS = String(
  process.env.CM_ATTACK_STRENGTHS || ATTACK_STRENGTHS.join(",")
).split(",").map(value => Number(value)).filter(Number.isFinite);
const REQUESTED_DEFENSE_STRENGTHS = String(
  process.env.CM_DEFENSE_STRENGTHS || DEFENSE_STRENGTHS.join(",")
).split(",").map(value => Number(value)).filter(Number.isFinite);
process.env.SIM_CALIBRATION_RUNS = "100";
process.env.SIM_SEED = String(SEED);
process.env.SIM_RUNS = String(RUNS);
process.env.DEPARTURE_CRAFT_IDS = process.env.DEPARTURE_CRAFT_IDS ||
  "TOWN_PORTAL,HEAL_POTION,HEAL_POTION,HEAL_POTION,HEAL_POTION,ANTIDOTE,GUARD_POTION";
process.env.TRAP_POLICY = process.env.TRAP_POLICY || "conservative";
process.env.TRAP_AVOIDANCE_POLICY = process.env.TRAP_AVOIDANCE_POLICY || "ev";
process.env.TRAP_DAMAGE_MULTIPLIER = process.env.TRAP_DAMAGE_MULTIPLIER || "1";
process.env.IDENTIFICATION_POLICY = IDENTIFICATION_POLICY;
process.env.IDENTIFICATION_STARTING_POWDER = process.env.IDENTIFICATION_STARTING_POWDER || "2";
process.env.IDENTIFICATION_COST_OVERRIDE = process.env.IDENTIFICATION_COST_OVERRIDE || "1";
process.env.FLEE_POLICY = "threshold";
process.env.FLEE_HP_THRESHOLD = String(FLEE_HP_THRESHOLD);
process.env.STATUS_CURE_POLICY = process.env.STATUS_CURE_POLICY || "smart";
process.env.STATUS_CURE_HP_THRESHOLD = process.env.STATUS_CURE_HP_THRESHOLD || "0.35";
process.env.STATUS_CURE_MERCHANT_POLICY = process.env.STATUS_CURE_MERCHANT_POLICY || "missing";
process.env.HEAL_POTION_MERCHANT_POLICY = process.env.HEAL_POTION_MERCHANT_POLICY || "missing";
process.env.PORTAL_HP_THRESHOLD = process.env.PORTAL_HP_THRESHOLD || "0.35";
process.env.PORTAL_MAX_HEAL_POTIONS = process.env.PORTAL_MAX_HEAL_POTIONS || "0";
process.env.PORTAL_MIN_FLOOR = process.env.PORTAL_MIN_FLOOR || "3";
process.env.ELITE_POLICY = process.env.ELITE_POLICY || "avoid";
process.env.BLOOD_WAND_HP_PAYMENT_MIN_RATE =
  process.env.BLOOD_WAND_HP_PAYMENT_MIN_RATE || "0.50";
process.env.SIM_CORE_SCORE_DROP_TOLERANCE = process.env.SIM_CORE_SCORE_DROP_TOLERANCE || "0";
process.env.SIM_440_CONDITION = process.env.SIM_440_CONDITION || "current";
process.env.SIM_SCENARIOS = REQUESTED_SCENARIOS.join(",");
process.env.SIM_DAMAGE_PROBE = DIAGNOSTIC_MODE === "full" ? "1" : "0";
if (process.env.SIM_PARALLEL) {
  throw new Error("SIM_PARALLEL must be omitted for Issue #271 Phase 2b measurement");
}
if (REQUESTED_SCENARIOS.length === 0 || REQUESTED_SCENARIOS.some(
  id => !ALL_SCENARIO_IDS.includes(id)
)) {
  throw new Error(`unknown CM_SCENARIOS: ${REQUESTED_SCENARIOS.join(",")}`);
}
if (!REQUESTED_SCENARIOS.includes(PRIMARY_SCENARIO)) {
  throw new Error(`CM_SCENARIOS must include primary scenario: ${PRIMARY_SCENARIO}`);
}
if (REQUESTED_ATTACK_STRENGTHS.length === 0 || REQUESTED_ATTACK_STRENGTHS.some(
  value => value <= 0
)) {
  throw new Error("CM_ATTACK_STRENGTHS must contain positive numbers");
}
if (REQUESTED_DEFENSE_STRENGTHS.length === 0 || REQUESTED_DEFENSE_STRENGTHS.some(
  value => value <= 0
)) {
  throw new Error("CM_DEFENSE_STRENGTHS must contain positive numbers");
}

const {
  SIM_CLASSES,
  calibrateCoreScoringProfile,
  getScenarioById,
  resetSimulationRandom,
  simulateRun
} = await import("./sim_depth_material_ev.js");

const CLASS_NAMES = SIM_CLASSES.filter(className => BASIC_CLASSES.includes(className));
if (CLASS_NAMES.length !== BASIC_CLASSES.length) {
  throw new Error(`basic classes missing: ${BASIC_CLASSES.join(",")}`);
}

function hashSeed(text) {
  let seed = 2166136261;
  for (let index = 0; index < text.length; index++) {
    seed ^= text.charCodeAt(index);
    seed = Math.imul(seed, 16777619);
  }
  return seed >>> 0;
}

function mean(values) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

function sampleVariance(values) {
  if (values.length < 2) return 0;
  const average = mean(values);
  return values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
    (values.length - 1);
}

function wilson(successes, trials) {
  if (trials <= 0) return { successes, trials, estimate: null, low: null, high: null };
  const p = successes / trials;
  const denominator = 1 + (R95 ** 2) / trials;
  const center = (p + (R95 ** 2) / (2 * trials)) / denominator;
  const halfWidth = R95 * Math.sqrt(
    (p * (1 - p)) / trials + (R95 ** 2) / (4 * trials ** 2)
  ) / denominator;
  return {
    successes,
    trials,
    estimate: p,
    low: Math.max(0, center - halfWidth),
    high: Math.min(1, center + halfWidth)
  };
}

function meanInterval(values) {
  if (!values.length) return { n: 0, estimate: null, low: null, high: null };
  const estimate = mean(values);
  const standardError = values.length > 1
    ? Math.sqrt(sampleVariance(values) / values.length)
    : null;
  return {
    n: values.length,
    estimate,
    low: standardError === null ? null : estimate - R95 * standardError,
    high: standardError === null ? null : estimate + R95 * standardError
  };
}

function normalDifference(left, right) {
  if (!left.length || !right.length) {
    return { estimate: null, low: null, high: null, leftN: left.length, rightN: right.length };
  }
  const estimate = mean(left) - mean(right);
  const standardError = Math.sqrt(
    sampleVariance(left) / left.length + sampleVariance(right) / right.length
  );
  return {
    estimate,
    low: estimate - R95 * standardError,
    high: estimate + R95 * standardError,
    leftN: left.length,
    rightN: right.length
  };
}

function classCenteredDifference(rows, predicate, outcomeSelector) {
  const byClass = new Map();
  rows.forEach(row => {
    const outcome = Number(outcomeSelector(row));
    if (!Number.isFinite(outcome)) return;
    if (!byClass.has(row.className)) byClass.set(row.className, []);
    byClass.get(row.className).push({ row, outcome });
  });
  const matched = [];
  const unmatched = [];
  const classCounts = {};
  byClass.forEach((classRows, className) => {
    const classMean = mean(classRows.map(item => item.outcome));
    const matchingRows = classRows.filter(item => predicate(item.row));
    const nonMatchingRows = classRows.filter(item => !predicate(item.row));
    classCounts[className] = {
      matched: matchingRows.length,
      unmatched: nonMatchingRows.length
    };
    matched.push(...matchingRows.map(item => item.outcome - classMean));
    unmatched.push(...nonMatchingRows.map(item => item.outcome - classMean));
  });
  return {
    ...normalDifference(matched, unmatched),
    matchedN: matched.length,
    unmatchedN: unmatched.length,
    classCounts
  };
}

function addCounts(target, additions = {}) {
  Object.entries(additions).forEach(([key, value]) => {
    target[key] = (target[key] || 0) + Number(value || 0);
  });
  return target;
}

function formatPercent(value, digits = 1) {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "NA"
    : `${(value * 100).toFixed(digits)}%`;
}

function formatNumber(value, digits = 2) {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "NA"
    : Number(value).toFixed(digits);
}

function formatRate(rate) {
  if (!rate || rate.estimate === null) return "NA";
  const suffix = rate.trials < MIN_GROUP_N ? "; N<30 未確定" : "";
  return `${formatPercent(rate.estimate)} [${formatPercent(rate.low)}, ${formatPercent(rate.high)}${suffix}]`;
}

function formatMean(interval, digits = 2) {
  if (!interval || interval.estimate === null) return "NA";
  return `${formatNumber(interval.estimate, digits)} [${formatNumber(interval.low, digits)}, ${formatNumber(interval.high, digits)}]`;
}

function formatDifference(diff, digits = 2) {
  if (!diff || diff.estimate === null) return "NA";
  const suffix = diff.matchedN < MIN_GROUP_N || diff.unmatchedN < MIN_GROUP_N
    ? "; N<30 未確定"
    : "";
  return `${diff.estimate >= 0 ? "+" : ""}${formatNumber(diff.estimate, digits)} ` +
    `[${formatNumber(diff.low, digits)}, ${formatNumber(diff.high, digits)}${suffix}]`;
}

function formatRateDifference(diff, leftN = 0, rightN = 0) {
  if (!diff || diff.estimate === null) return "NA";
  const suffix = leftN < MIN_GROUP_N || rightN < MIN_GROUP_N ? "; N<30 未確定" : "";
  return `${diff.estimate >= 0 ? "+" : ""}${formatPercent(diff.estimate)} ` +
    `[${formatPercent(diff.low)}, ${formatPercent(diff.high)}${suffix}]`;
}

function isSeparated(effect) {
  return Boolean(effect && effect.low !== null && (effect.low > 0 || effect.high < 0));
}

function snapshotAffix(snapshot, affixType) {
  return Number(
    snapshot?.effectiveAffixes?.[affixType] ??
    snapshot?.supportAffixes?.[affixType] ??
    0
  );
}

function getB5Snapshot(result) {
  return getBuildSnapshot(result, B5);
}

function getB6Snapshot(result) {
  return getBuildSnapshot(result, B5 + 1);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sumNamedDamage(log, name) {
  const escaped = escapeRegExp(name);
  const pattern = new RegExp(`${escaped}(?:は|に)(\\d+)の[^。！]*ダメージ`, "g");
  return log.reduce((sum, message) => {
    let match;
    while ((match = pattern.exec(message)) !== null) sum += Number(match[1]);
    pattern.lastIndex = 0;
    return sum;
  }, 0);
}

function getNameFromDiagnostics(result) {
  return result.diagnostics?.encounters?.[0]?.startPlayerName || "";
}

function classifyDeath(result) {
  if (!result.died) return null;
  const type = result.deathEncounterType || "other";
  if (type === "boss") return "boss";
  if (type === "normal") return "normal";
  if (type === "floor-trap" || type === "chest-trap") return "trap";
  return "other";
}

function classifyDeathCause(result) {
  const cause = result.diagnostics?.deathLogs?.at(-1)?.cause || "";
  if (cause.includes("逃走追撃")) return "flee-pursuit";
  if (cause.includes("毒")) return "status-poison";
  if (/(ラハリト|マダルト|ティルトウェイト|ハリト)/.test(cause)) return "spell";
  if (cause.includes("反射")) return "reflection";
  if (cause.includes("狙撃")) return "snipe";
  if (cause.includes("攻撃")) return "physical";
  if (cause) return "other";
  return result.deathEncounterType === "floor-trap" || result.deathEncounterType === "chest-trap"
    ? "trap"
    : "other";
}

function createEncounterTurnStats() {
  return {
    total: 0,
    count: 0,
    victory: { total: 0, count: 0 },
    death: { total: 0, count: 0 },
    flee: { total: 0, count: 0 },
    stalemate: { total: 0, count: 0 }
  };
}

function addEncounterTurn(stats, encounter) {
  const turns = encounter.rounds.length;
  stats.total += turns;
  stats.count++;
  if (stats[encounter.result]) {
    stats[encounter.result].total += turns;
    stats[encounter.result].count++;
  }
}

function collectRunCombatMetrics(result) {
  const encounters = result.diagnostics?.encounters || [];
  const hasDetailedLogs = encounters.some(encounter =>
    encounter.rounds.some(round => Array.isArray(round.log) && round.log.length > 0)
  );
  if (!hasDetailedLogs) {
    const turns = createEncounterTurnStats();
    const normalTurns = createEncounterTurnStats();
    const bossTurns = createEncounterTurnStats();
    let normalEncounterCount = 0;
    let statusEncounterCount = 0;
    encounters.forEach(encounter => {
      addEncounterTurn(turns, encounter);
      if (encounter.type === "normal") {
        addEncounterTurn(normalTurns, encounter);
        normalEncounterCount++;
        if (encounter.monsters.some(monster => monster.statusCapable)) {
          statusEncounterCount++;
        }
      }
      if (encounter.type === "boss") addEncounterTurn(bossTurns, encounter);
    });
    return {
      damageGiven: 0,
      combatTurns: turns.total,
      combatEncounterCount: turns.count,
      turnStats: turns,
      normalTurnStats: normalTurns,
      bossTurnStats: bossTurns,
      damageTaken: Number(result.combatDamageHp || 0),
      damageTakenByType: { ...(result.combatDamageHpByType || {}) },
      trapDamage: Number(result.trapDamageHp || 0),
      totalDamageTaken: Number(result.combatDamageHp || 0) + Number(result.trapDamageHp || 0),
      initialDamage: 0,
      poisonDamage: 0,
      statusApplications: 0,
      statusLostTurns: 0,
      normalEncounterCount,
      statusEncounterCount,
      spellRoundCount: 0,
      physicalRoundCount: 0,
      poisonResisted: 0,
      spellGuardReductions: 0,
      guardianReductions: 0,
      deathCategory: classifyDeath(result),
      deathCause: classifyDeathCause(result),
      deathEncounterType: result.deathEncounterType || null,
      deathCauseText: null
    };
  }
  const playerName = getNameFromDiagnostics(result);
  const turns = createEncounterTurnStats();
  const normalTurns = createEncounterTurnStats();
  const bossTurns = createEncounterTurnStats();
  let damageGiven = 0;
  let initialDamage = 0;
  let poisonDamage = 0;
  let statusApplications = 0;
  let statusLostTurns = 0;
  let statusEncounterCount = 0;
  let normalEncounterCount = 0;
  let spellRoundCount = 0;
  let physicalRoundCount = 0;
  let poisonResisted = 0;
  let spellGuardReductions = 0;
  let guardianReductions = 0;

  encounters.forEach(encounter => {
    addEncounterTurn(turns, encounter);
    if (encounter.type === "normal") addEncounterTurn(normalTurns, encounter);
    if (encounter.type === "boss") addEncounterTurn(bossTurns, encounter);
    if (encounter.type === "normal") {
      normalEncounterCount++;
      if (encounter.monsters.some(monster => monster.statusCapable)) statusEncounterCount++;
    }
    encounter.rounds.forEach(round => {
      const roundDamageGiven = round.log.reduce((sum, message) => {
        if (!message.startsWith("[味方]") || !message.includes(playerName)) return sum;
        const match = message.match(/に(\d+)の[^！。]*ダメージ/);
        return sum + (match ? Number(match[1]) : 0);
      }, 0);
      damageGiven += roundDamageGiven;
      const incoming = sumNamedDamage(round.log, playerName);
      if (round.round === 1) initialDamage += incoming;
      round.log.forEach(message => {
        if (message.startsWith("[味方]") && message.includes("毒のダメージ")) {
          poisonDamage += Number(message.match(/(\d+)のダメージ/)?.[1] || 0);
        }
        if (message.includes("毒を受け、毒状態になった") ||
          message.includes("盲目状態になった") ||
          message.includes("麻痺を受け、麻痺状態になった") ||
          message.includes("眠りに落ちた")) {
          statusApplications++;
        }
        if (message.includes("動けない")) statusLostTurns++;
        if (message.includes("防毒の備えで毒を退けた")) poisonResisted++;
        if (message.includes("魔除け") || message.includes("結界と魔除け")) {
          spellGuardReductions++;
        }
        if (message.includes("守護がダメージを和らげた")) guardianReductions++;
        if (message.startsWith("[ 敵 ]") && message.includes("唱えた")) spellRoundCount++;
        if (message.startsWith("[ 敵 ]") && message.includes("攻撃！")) physicalRoundCount++;
      });
    });
  });
  return {
    damageGiven,
    combatTurns: turns.total,
    combatEncounterCount: turns.count,
    turnStats: turns,
    normalTurnStats: normalTurns,
    bossTurnStats: bossTurns,
    damageTaken: Number(result.combatDamageHp || 0),
    damageTakenByType: { ...(result.combatDamageHpByType || {}) },
    trapDamage: Number(result.trapDamageHp || 0),
    totalDamageTaken: Number(result.combatDamageHp || 0) + Number(result.trapDamageHp || 0),
    initialDamage,
    poisonDamage,
    statusApplications,
    statusLostTurns,
    normalEncounterCount,
    statusEncounterCount,
    spellRoundCount,
    physicalRoundCount,
    poisonResisted,
    spellGuardReductions,
    guardianReductions,
    deathCategory: classifyDeath(result),
    deathCause: classifyDeathCause(result),
    deathEncounterType: result.deathEncounterType || null,
    deathCauseText: result.diagnostics?.deathLogs?.at(-1)?.cause || null
  };
}

function collectRaceDiagnostics(result, startFloor = COUNTERMEASURE_START_FLOOR) {
  const beforeCounts = {};
  const afterCounts = {};
  let normalEncounterCount = 0;
  let targetEncounterCount = 0;
  let normalMonsterCount = 0;
  let targetMonsterCount = 0;
  let targetActionCount = 0;
  let antiEffectActionCount = 0;
  let damageApplications = 0;
  let damageCounterfactual = 0;
  let damageApplied = 0;
  let effectiveDamageApplications = 0;
  let effectiveDamageCounterfactual = 0;
  let effectiveDamageApplied = 0;
  const encounters = result.diagnostics?.encounters || [];
  encounters
    .filter(encounter => encounter.type === "normal" && encounter.floor >= startFloor)
    .forEach(encounter => {
      normalEncounterCount++;
      normalMonsterCount += encounter.monsters.length;
      const targetMonsters = encounter.monsters.filter(monster => monster.tags?.includes("undead"));
      targetMonsterCount += targetMonsters.length;
      if (targetMonsters.length > 0) targetEncounterCount++;
      encounter.rounds.forEach(round => {
        if (!round.raceTargeted) return;
        targetActionCount++;
        const before = Number(round.raceAffixValueBefore || 0);
        const after = Number(round.raceAffixValueAfter || 0);
        beforeCounts[before] = (beforeCounts[before] || 0) + 1;
        afterCounts[after] = (afterCounts[after] || 0) + 1;
        if (before > 0) antiEffectActionCount++;
        damageApplications += Number(round.raceDamageApplications || 0);
        damageCounterfactual += Number(round.raceDamageCounterfactual || 0);
        damageApplied += Number(round.raceDamageApplied || 0);
        if (after > 0) {
          effectiveDamageApplications += Number(round.raceDamageApplications || 0);
          effectiveDamageCounterfactual += Number(round.raceDamageCounterfactual || 0);
          effectiveDamageApplied += Number(round.raceDamageApplied || 0);
        }
      });
    });
  return {
    normalEncounterCount,
    targetEncounterCount,
    targetEncounterRate: wilson(targetEncounterCount, normalEncounterCount),
    normalMonsterCount,
    targetMonsterCount,
    targetMonsterRate: wilson(targetMonsterCount, normalMonsterCount),
    targetEncounterPerRun: targetEncounterCount,
    targetMonsterPerRun: targetMonsterCount,
    targetActionCount,
    antiEffectActionCount,
    damageApplications,
    damageCounterfactual,
    damageApplied,
    effectiveDamageApplications,
    effectiveDamageCounterfactual,
    effectiveDamageApplied,
    affixValueBeforeCounts: beforeCounts,
    affixValueAfterCounts: afterCounts
  };
}

function collectCountermeasureDiagnostics(result, affixType) {
  const valuesBefore = {};
  const valuesAfter = {};
  let activeRounds = 0;
  let activeEncounters = 0;
  const encounters = result.diagnostics?.encounters || [];
  encounters.forEach(encounter => {
    let hasActiveRound = false;
    encounter.rounds.forEach(round => {
      if (round.countermeasureAffixType !== affixType) return;
      hasActiveRound = true;
      activeRounds++;
      const before = Number(round.countermeasureAffixValueBefore || 0);
      const after = Number(round.countermeasureAffixValueAfter || 0);
      valuesBefore[before] = (valuesBefore[before] || 0) + 1;
      valuesAfter[after] = (valuesAfter[after] || 0) + 1;
    });
    activeEncounters += Number(hasActiveRound);
  });
  return {
    affixType,
    activeRounds,
    activeEncounters,
    valuesBefore,
    valuesAfter
  };
}

function summarizeCountermeasure(rows, affixType) {
  const valuesBefore = {};
  const valuesAfter = {};
  let activeRounds = 0;
  let activeEncounters = 0;
  rows.forEach(row => {
    const diagnostic = row.countermeasure;
    if (diagnostic?.affixType !== affixType) return;
    activeRounds += Number(diagnostic.activeRounds || 0);
    activeEncounters += Number(diagnostic.activeEncounters || 0);
    addCounts(valuesBefore, diagnostic.valuesBefore);
    addCounts(valuesAfter, diagnostic.valuesAfter);
  });
  return {
    affixType,
    activeRounds,
    activeEncounters,
    valuesBefore,
    valuesAfter
  };
}

function hasPositiveRaceRead(row) {
  return Object.entries(row.race.affixValueBeforeCounts || {})
    .some(([value, count]) => Number(value) > 0 && Number(count) > 0);
}

function summarizeRaceGroupDefinition(rows) {
  const snapshotPositive = rows.filter(row => row.b5HasAffix);
  const runtimePositive = rows.filter(hasPositiveRaceRead);
  const both = rows.filter(row => row.b5HasAffix && hasPositiveRaceRead(row));
  return {
    snapshotPositiveN: snapshotPositive.length,
    runtimePositiveReadN: runtimePositive.length,
    bothN: both.length,
    snapshotOnlyN: snapshotPositive.length - both.length,
    runtimeOnlyN: runtimePositive.length - both.length,
    runtimeReadDefinition: "B5 snapshot affix>0; damage path positive read = B3+ target action affixValueBefore>0"
  };
}

function compactRow(task, result, condition) {
  const b5 = getB5Snapshot(result);
  const b6 = getB6Snapshot(result);
  const affixValue = snapshotAffix(b5, condition.affixType);
  return {
    conditionId: task.conditionId,
    mode: condition.mode,
    curePolicy: task.curePolicy,
    scenarioId: task.scenarioId,
    runIndex: task.runIndex,
    className: task.className,
    pairId: [task.curePolicy, task.scenarioId, task.className, task.runIndex].join(":"),
    randomSequenceId: task.randomSequenceId || [
      task.conditionId,
      task.curePolicy,
      task.scenarioId,
      task.className,
      task.runIndex
    ].join(":"),
    survived: Boolean(result.survived),
    died: Boolean(result.died),
    reachedFloor: Number(result.reachedFloor),
    deathFloor: result.deathFloor === null ? null : Number(result.deathFloor),
    b5: Boolean(b5),
    b5Breakthrough: Boolean(b5 && b6),
    b5AffixValue: affixValue,
    b5HasAffix: affixValue > 0,
    combat: collectRunCombatMetrics(result),
    race: collectRaceDiagnostics(result),
    countermeasure: collectCountermeasureDiagnostics(result, condition.affixType)
  };
}

function buildRaceOverride(multiplier, upper, probe = false) {
  return {
    targetRace: "undead",
    affixType: "antiUndead",
    startFloor: COUNTERMEASURE_START_FLOOR,
    endFloor: 20,
    poolBias: upper ? 1 : 0,
    forceRaceEncounter: upper,
    antiEffectMultiplier: multiplier,
    damageProbe: probe,
    hpMultiplier: upper ? 1.60 : 1,
    atkMultiplier: upper ? 1.60 : 1,
    defMultiplier: upper ? 1.30 : 1
  };
}

const DEFENSE_CONFIG = Object.freeze({
  statusResistance: {
    label: "状態異常耐性",
    statusScalingOverride: {
      startFloor: COUNTERMEASURE_START_FLOOR,
      endFloor: 20,
      forceStatusEncounter: true,
      forceStatusChance: true
    }
  },
  poisonWard: {
    label: "毒耐性",
    threatOverride: {
      startFloor: COUNTERMEASURE_START_FLOOR,
      normalOnly: true,
      forcePoison: true,
      statusChance: 1
    }
  },
  spellGuard: {
    label: "呪文軽減",
    threatOverride: {
      startFloor: COUNTERMEASURE_START_FLOOR,
      normalOnly: true,
      forceSpell: true,
      spellName: "HALITO",
      spellChance: 1
    }
  },
  guardian: {
    label: "瀕死時物理軽減",
    threatOverride: {
      startFloor: COUNTERMEASURE_START_FLOOR,
      normalOnly: true,
      atkMultiplier: 1.60
    }
  },
  frontGuard: {
    label: "前衛防御",
    threatOverride: {
      startFloor: COUNTERMEASURE_START_FLOOR,
      normalOnly: true,
      atkMultiplier: 1.60
    }
  }
});

function makeCondition(mode, id, label, affixType, multiplier, extra = {}) {
  const { label: extraLabel, ...conditionExtra } = extra;
  return {
    mode,
    id,
    label: extraLabel || label,
    affixType,
    multiplier,
    ...conditionExtra
  };
}

const ATTACK_CONDITIONS = Object.freeze(
  REQUESTED_ATTACK_STRENGTHS.map(multiplier => makeCondition(
    "attack",
    multiplier === 1 ? "current-1x" : `upper-${multiplier}x`,
    multiplier === 1
      ? "現行遭遇・antiUndead 1x"
      : `不死100%・antiUndead ${multiplier}x・難易度校正`,
    "antiUndead",
    multiplier,
    {
      upper: multiplier > 1,
      probe: multiplier === 5
    }
  ))
);

const DEFENSE_CONDITIONS = Object.freeze(
  DEFENSE_AFFIXES.flatMap(affixType =>
    REQUESTED_DEFENSE_STRENGTHS.map(multiplier => makeCondition(
      "defense",
      `${affixType}-${multiplier}x`,
      `${DEFENSE_CONFIG[affixType].label} ${multiplier}x`,
      affixType,
      multiplier,
      DEFENSE_CONFIG[affixType]
    ))
  )
);

function conditionKey(condition, curePolicy, scenarioId) {
  return `${condition.id}:${curePolicy}:${scenarioId}`;
}

function buildScenario(scenarioId, condition, curePolicy) {
  const base = getScenarioById(scenarioId);
  const scenario = {
    ...base,
    identificationPolicy: IDENTIFICATION_POLICY,
    trapPolicy: process.env.TRAP_POLICY || "conservative",
    trapAvoidancePolicy: process.env.TRAP_AVOIDANCE_POLICY || "ev",
    statusCurePolicy: curePolicy,
    statusCureHpThreshold: Number(process.env.STATUS_CURE_HP_THRESHOLD || 0.35),
    statusCureMerchantPolicy: process.env.STATUS_CURE_MERCHANT_POLICY || "missing",
    healPotionMerchantPolicy: process.env.HEAL_POTION_MERCHANT_POLICY || "missing",
    fleeHpThreshold: FLEE_HP_THRESHOLD,
    elitePolicy: process.env.ELITE_POLICY || "avoid"
  };
  scenario.simDiagnosticLevel = DIAGNOSTIC_MODE;
  if (condition.mode === "attack") {
    scenario.raceBiasOverride = buildRaceOverride(
      condition.multiplier,
      condition.upper,
      condition.probe
    );
  } else {
    scenario.countermeasureOverride = {
      affixType: condition.affixType,
      multiplier: condition.multiplier,
      startFloor: COUNTERMEASURE_START_FLOOR
    };
    scenario.statusScalingOverride = condition.statusScalingOverride || null;
    scenario.threatOverride = condition.threatOverride || null;
  }
  return scenario;
}

export function runCountermeasureStrengthTask(task, context) {
  const condition = context.conditions[task.conditionId];
  const scenario = context.scenarios[conditionKey(condition, task.curePolicy, task.scenarioId)];
  const diagnosticMode = context.diagnosticMode ?? DIAGNOSTIC_MODE;
  const pairing = inferPairingEligibility(condition);
  const randomSequenceId = pairing.eligible
    ? [task.curePolicy, task.scenarioId, task.className, task.runIndex].join(":")
    : [condition.id, task.curePolicy, task.scenarioId, task.className, task.runIndex].join(":");
  // Pairing shares the initial random sequence; it does not alter the sim's
  // random-call order after a condition-specific trajectory branches.
  resetSimulationRandom(hashSeed(
    `${context.seed}:${randomSequenceId}`
  ));
  const result = simulateRun({
    className: task.className,
    startFloor: 1,
    targetDepth: TARGET_DEPTH,
    runIndex: task.runIndex,
    seriesId: "issue271-status-depth-scaling",
    scoringProfile: context.scoringProfiles[conditionKey(condition, task.curePolicy, task.scenarioId)],
    scenario,
    workshop: scenario.workshop,
    collectDiagnostics: diagnosticMode !== "off",
    collectBuildSnapshots: true
  });
  return compactRow({ ...task, randomSequenceId }, result, condition);
}

function summarizeMechanism(rows) {
  const beforeCounts = {};
  const afterCounts = {};
  let applications = 0;
  let effectiveApplications = 0;
  let counterfactual = 0;
  let applied = 0;
  let effectiveCounterfactual = 0;
  let effectiveApplied = 0;
  rows.forEach(row => {
    addCounts(beforeCounts, row.race.affixValueBeforeCounts);
    addCounts(afterCounts, row.race.affixValueAfterCounts);
    applications += row.race.damageApplications;
    counterfactual += row.race.damageCounterfactual;
    applied += row.race.damageApplied;
    effectiveApplications += row.race.effectiveDamageApplications;
    effectiveCounterfactual += row.race.effectiveDamageCounterfactual;
    effectiveApplied += row.race.effectiveDamageApplied;
  });
  return {
    beforeCounts,
    afterCounts,
    applications,
    effectiveApplications,
    counterfactual,
    applied,
    effectiveCounterfactual,
    effectiveApplied,
    ratio: effectiveCounterfactual > 0
      ? effectiveApplied / effectiveCounterfactual
      : null
  };
}

function summarizeMetrics(rows) {
  const meanMetric = key => meanInterval(rows.map(row => Number(row.combat[key] || 0)));
  const turnMean = result => {
    const total = rows.reduce((sum, row) => {
      const stat = result === "all" ? row.combat.turnStats : row.combat.turnStats[result];
      return sum + Number(stat?.total || 0);
    }, 0);
    const count = rows.reduce((sum, row) => {
      const stat = result === "all" ? row.combat.turnStats : row.combat.turnStats[result];
      return sum + Number(stat?.count || 0);
    }, 0);
    return count ? total / count : null;
  };
  return {
    damageGiven: meanMetric("damageGiven"),
    combatTurns: meanMetric("combatTurns"),
    damageTaken: meanMetric("damageTaken"),
    trapDamage: meanMetric("trapDamage"),
    totalDamageTaken: meanMetric("totalDamageTaken"),
    initialDamage: meanMetric("initialDamage"),
    poisonDamage: meanMetric("poisonDamage"),
    statusApplications: meanMetric("statusApplications"),
    statusLostTurns: meanMetric("statusLostTurns"),
    turnMean: {
      all: turnMean("all"),
      victory: turnMean("victory"),
      death: turnMean("death"),
      flee: turnMean("flee")
    }
  };
}

function summarizeGroup(entrants, predicate) {
  const matched = entrants.filter(predicate);
  const unmatched = entrants.filter(row => !predicate(row));
  const endpoint = selector => classCenteredDifference(entrants, predicate, selector);
  const survival = selected => wilson(selected.filter(row => !row.died).length, selected.length);
  return {
    matchedN: matched.length,
    unmatchedN: unmatched.length,
    dataSufficient: matched.length >= MIN_GROUP_N && unmatched.length >= MIN_GROUP_N,
    matchedSurvival: survival(matched),
    unmatchedSurvival: survival(unmatched),
    endpointEffects: {
      reachedFloor: endpoint(row => row.reachedFloor),
      death: endpoint(row => row.b5 && row.died && row.deathFloor === B5),
      breakthrough: endpoint(row => row.b5Breakthrough)
    },
    matchedMetrics: summarizeMetrics(matched),
    unmatchedMetrics: summarizeMetrics(unmatched),
    matchedDeaths: summarizeDeaths(matched),
    unmatchedDeaths: summarizeDeaths(unmatched)
  };
}

function summarizeDeaths(rows) {
  const deaths = rows.filter(row => row.died);
  const categories = {};
  const causes = {};
  deaths.forEach(row => {
    categories[row.combat.deathCategory] = (categories[row.combat.deathCategory] || 0) + 1;
    causes[row.combat.deathCause] = (causes[row.combat.deathCause] || 0) + 1;
  });
  const toRates = counts => Object.fromEntries(
    Object.entries(counts).map(([key, count]) => [key, {
      count,
      rate: wilson(count, deaths.length)
    }])
  );
  return {
    deathsN: deaths.length,
    categories: toRates(categories),
    causes: toRates(causes)
  };
}

function summarizeRace(rows, includeReached = true) {
  const aggregate = key => rows.reduce((sum, row) => sum + Number(row.race[key] || 0), 0);
  const normalEncounterCount = aggregate("normalEncounterCount");
  const targetEncounterCount = aggregate("targetEncounterCount");
  const normalMonsterCount = aggregate("normalMonsterCount");
  const targetMonsterCount = aggregate("targetMonsterCount");
  const reachedRows = rows.filter(row => row.reachedFloor >= COUNTERMEASURE_START_FLOOR);
  const reachedRace = includeReached && reachedRows.length
    ? summarizeRace(reachedRows, false)
    : null;
  return {
    normalEncounterCount,
    targetEncounterCount,
    targetEncounterRate: wilson(targetEncounterCount, normalEncounterCount),
    normalMonsterCount,
    targetMonsterCount,
    targetMonsterRate: wilson(targetMonsterCount, normalMonsterCount),
    targetEncounterPerRun: rows.length ? targetEncounterCount / rows.length : 0,
    targetMonsterPerRun: rows.length ? targetMonsterCount / rows.length : 0,
    targetActionCount: aggregate("targetActionCount"),
    antiEffectActionCount: aggregate("antiEffectActionCount"),
    damageApplications: aggregate("damageApplications"),
    damageCounterfactual: aggregate("damageCounterfactual"),
    damageApplied: aggregate("damageApplied"),
    reachedRun: reachedRace
      ? {
          targetEncounterPerRun: reachedRace.targetEncounterPerRun,
          targetMonsterPerRun: reachedRace.targetMonsterPerRun,
          targetActionPerRun: reachedRace.targetActionCount / reachedRows.length
        }
      : null,
    mechanism: summarizeMechanism(rows)
  };
}

function summarizeCase(rows, condition, curePolicy, scenarioId) {
  const entrants = rows.filter(row => row.b5);
  const group = summarizeGroup(entrants, row => row.b5HasAffix);
  const exposureRows = rows.filter(row => row.reachedFloor >= COUNTERMEASURE_START_FLOOR);
  return {
    conditionId: condition.id,
    conditionLabel: condition.label,
    mode: condition.mode,
    affixType: condition.affixType,
    multiplier: condition.multiplier,
    curePolicy,
    scenarioId,
    runs: rows.length,
    b5: {
      entrantsN: entrants.length,
      breakthroughRate: wilson(entrants.filter(row => row.b5Breakthrough).length, entrants.length),
      deathRate: wilson(entrants.filter(row => row.died && row.deathFloor === B5).length, entrants.length),
      group
    },
    survivalRate: wilson(rows.filter(row => !row.died).length, rows.length),
    averageReachedFloor: meanInterval(rows.map(row => row.reachedFloor)),
    metrics: summarizeMetrics(rows),
    deaths: summarizeDeaths(rows),
    raceGroupDefinition: condition.mode === "attack"
      ? summarizeRaceGroupDefinition(entrants)
      : null,
    exposure: {
      startFloor: COUNTERMEASURE_START_FLOOR,
      reachedN: exposureRows.length,
      reachedRate: wilson(exposureRows.length, rows.length),
      race: condition.mode === "attack" ? summarizeRace(rows) : null,
      countermeasure: condition.mode === "defense"
        ? summarizeCountermeasure(rows, condition.affixType)
        : null,
      threat: {
        normalEncounterCount: rows.reduce((sum, row) => sum + row.combat.normalEncounterCount, 0),
        statusEncounterCount: rows.reduce((sum, row) => sum + row.combat.statusEncounterCount, 0),
        statusApplicationCount: rows.reduce((sum, row) => sum + row.combat.statusApplications, 0),
        spellRoundCount: rows.reduce((sum, row) => sum + row.combat.spellRoundCount, 0),
        physicalRoundCount: rows.reduce((sum, row) => sum + row.combat.physicalRoundCount, 0),
        poisonResisted: rows.reduce((sum, row) => sum + row.combat.poisonResisted, 0),
        spellGuardReductions: rows.reduce((sum, row) => sum + row.combat.spellGuardReductions, 0),
        guardianReductions: rows.reduce((sum, row) => sum + row.combat.guardianReductions, 0)
      }
    }
  };
}

function getCase(cases, conditionId, curePolicy, scenarioId = PRIMARY_SCENARIO) {
  return cases[conditionKey({ id: conditionId }, curePolicy, scenarioId)];
}

export {
  CLASS_NAMES,
  CURE_POLICIES,
  buildScenario,
  conditionKey,
  summarizeCase
};

function survivalDifference(upper, base) {
  if (!upper || !base || upper.estimate === null || base.estimate === null) {
    return { estimate: null, low: null, high: null, intervalsOverlap: null };
  }
  const estimate = upper.estimate - base.estimate;
  const standardError = Math.sqrt(
    upper.estimate * (1 - upper.estimate) / upper.trials +
    base.estimate * (1 - base.estimate) / base.trials
  );
  return {
    estimate,
    low: estimate - R95 * standardError,
    high: estimate + R95 * standardError,
    intervalsOverlap: upper.low <= base.high && base.low <= upper.high
  };
}

function summarizeDifficultyCalibration(cases, upperConditionId = "upper-5x") {
  return Object.fromEntries(CURE_POLICIES.map(curePolicy => {
    const base = getCase(cases, "current-1x", curePolicy)?.b5.group.unmatchedSurvival;
    const upper = getCase(cases, upperConditionId, curePolicy)?.b5.group.unmatchedSurvival;
    return [curePolicy, {
      base,
      upper,
      delta: survivalDifference(upper, base),
      pass: Boolean(
        base?.trials >= MIN_GROUP_N && upper?.trials >= MIN_GROUP_N &&
        survivalDifference(upper, base).intervalsOverlap &&
        Math.abs(survivalDifference(upper, base).estimate) <= 0.04
      )
    }];
  }));
}

function determineThresholds(cases, conditions) {
  const primary = conditions.map(condition => {
    const smart = getCase(cases, condition.id, "smart");
    const never = getCase(cases, condition.id, "never");
    const effects = [smart?.b5.group, never?.b5.group].filter(Boolean);
    const separated = effects.some(group =>
      Object.values(group.endpointEffects).some(isSeparated)
    );
    const coherent = effects.length === 2 && Object.values(groupEndpointSigns(smart.b5.group, never.b5.group))
      .some(Boolean);
    const noCounterSurvivals = effects.map(group => group.unmatchedSurvival);
    const required = noCounterSurvivals.some(rate =>
      rate?.trials >= MIN_GROUP_N && rate.estimate < PRACTICAL_SURVIVAL_FLOOR
    );
    return {
      conditionId: condition.id,
      multiplier: condition.multiplier,
      separated,
      coherent,
      required,
      unmatchedSurvival: noCounterSurvivals
    };
  });
  const firstA = primary.find(item => item.separated && item.coherent) || null;
  const firstB = primary.find(item => item.required) || null;
  const maxMultiplier = primary.at(-1)?.multiplier || null;
  const relation = firstA && firstB
    ? (firstA.multiplier < firstB.multiplier ? "A<B" : "B≤A")
    : firstA
      ? `A=${firstA.multiplier}x観測、B未観測（${maxMultiplier}xまで）`
      : firstB
        ? `B=${firstB.multiplier}x観測、A未観測（${maxMultiplier}xまで）`
        : `A/B未観測（${maxMultiplier}xまで）`;
  return {
    primary,
    firstA,
    firstB,
    window: firstA && firstB && firstA.multiplier < firstB.multiplier,
    relation
  };
}

function groupEndpointSigns(smart, never) {
  const result = {};
  Object.entries(smart.endpointEffects).forEach(([key, effect]) => {
    const other = never.endpointEffects[key];
    result[key] = isSeparated(effect) && isSeparated(other) &&
      Math.sign(effect.estimate) === Math.sign(other.estimate);
  });
  return result;
}

function createRawWriter(path) {
  const file = openSync(path, "w");
  const hash = createHash("sha256");
  let rows = 0;
  return {
    write(batch) {
      const text = batch.map(row => JSON.stringify(row)).join("\n") + (batch.length ? "\n" : "");
      writeSync(file, text);
      hash.update(text);
      rows += batch.length;
    },
    close() {
      closeSync(file);
      return { rows, sha256: hash.digest("hex") };
    }
  };
}

function auditSignStatus(primaryCase, auditCase) {
  const endpointNames = ["reachedFloor", "death", "breakthrough"];
  const lowN = auditCase?.runs || 0;
  const primaryGroup = primaryCase?.b5?.group;
  const auditGroup = auditCase?.b5?.group;
  const groupNUncertain = [primaryGroup, auditGroup].some(group =>
    !group || group.matchedN < MIN_GROUP_N || group.unmatchedN < MIN_GROUP_N
  );
  const mismatches = [];
  const compared = [];
  endpointNames.forEach(endpoint => {
    const primaryEffect = primaryGroup?.endpointEffects?.[endpoint];
    const auditEffect = auditGroup?.endpointEffects?.[endpoint];
    const primarySign = Number.isFinite(primaryEffect?.estimate)
      ? Math.sign(primaryEffect.estimate)
      : null;
    const auditSign = Number.isFinite(auditEffect?.estimate)
      ? Math.sign(auditEffect.estimate)
      : null;
    if (primarySign === null || auditSign === null || primarySign === 0 || auditSign === 0) {
      return;
    }
    compared.push({ endpoint, primarySign, auditSign });
    if (primarySign !== auditSign) mismatches.push(endpoint);
  });
  return {
    status: lowN < MIN_GROUP_N || groupNUncertain
      ? "未確定（N<30）"
      : mismatches.length
        ? "符号不一致（追加測定）"
        : compared.length
          ? "符号一致"
          : "未観測",
    lowN,
    primaryGroupN: {
      matched: primaryGroup?.matchedN || 0,
      unmatched: primaryGroup?.unmatchedN || 0
    },
    auditGroupN: {
      matched: auditGroup?.matchedN || 0,
      unmatched: auditGroup?.unmatchedN || 0
    },
    compared,
    mismatches,
    escalated: lowN >= MIN_GROUP_N && !groupNUncertain && mismatches.length > 0
  };
}

function buildReport(summary, summarySha256) {
  const {
    cases,
    measurement,
    attackConditions,
    defenseConditions,
    thresholds,
    calibration,
    auditPlan
  } = summary;
  const conditionDisplayLabel = condition => condition.mode === "defense"
    ? `${condition.label} ${condition.multiplier}x`
    : condition.label;
  const primaryCaseLines = conditions => conditions.flatMap(condition =>
    CURE_POLICIES.map(curePolicy => {
      const item = cases[conditionKey(condition, curePolicy, PRIMARY_SCENARIO)];
      const group = item?.b5.group;
      return `- ${conditionDisplayLabel(condition)} / ${curePolicy}: B5 N=${item?.b5.entrantsN || 0}, ` +
        `有/なし=${group?.matchedN || 0}/${group?.unmatchedN || 0}, ` +
        `なし生存=${formatRate(group?.unmatchedSurvival)}, ` +
        `Δfloor=${formatDifference(group?.endpointEffects.reachedFloor)}, ` +
        `Δ死亡=${formatDifference(group?.endpointEffects.death)}, ` +
        `Δ突破=${formatDifference(group?.endpointEffects.breakthrough)}`;
    })
  );
  const anchorDefenseLines = defenseConditions
    .filter(condition => condition.multiplier === 5)
    .flatMap(condition => CURE_POLICIES.map(curePolicy => {
      const item = cases[conditionKey(condition, curePolicy, PRIMARY_SCENARIO)];
      const group = item?.b5.group;
      return `- ${conditionDisplayLabel(condition)} / ${curePolicy}: 有/なし=${group?.matchedN || 0}/${group?.unmatchedN || 0}, ` +
        `なし生存=${formatRate(group?.unmatchedSurvival)}, ` +
        `Δfloor=${formatDifference(group?.endpointEffects.reachedFloor)}, ` +
        `Δ死亡=${formatDifference(group?.endpointEffects.death)}, ` +
        `Δ突破=${formatDifference(group?.endpointEffects.breakthrough)}`;
    }));
  const attack5Smart = cases[conditionKey(
    attackConditions.find(condition => condition.multiplier === 5),
    "smart",
    PRIMARY_SCENARIO
  )];
  const attack5Never = cases[conditionKey(
    attackConditions.find(condition => condition.multiplier === 5),
    "never",
    PRIMARY_SCENARIO
  )];
  const mechanism = attack5Smart?.exposure.race?.mechanism;
  const mechanismNever = attack5Never?.exposure.race?.mechanism;
  const formatCounts = counts => Object.entries(counts || {})
    .sort((left, right) => Number(left[0]) - Number(right[0]))
    .map(([value, count]) => `${value}:${count}`)
    .join(" / ") || "未観測";
  const deathLines = deaths => {
    if (!deaths || deaths.deathsN <= 0) return "死亡なし";
    return ["boss", "normal", "trap", "other"]
      .map(key => {
        const value = deaths.categories?.[key];
        const rate = value?.rate || wilson(0, deaths.deathsN);
        return `${key} ${value?.count || 0}/${deaths.deathsN}=${formatRate(rate)}`;
      })
      .join(" / ");
  };
  const calibrationLines = CURE_POLICIES.map(curePolicy => {
    const item = calibration?.[curePolicy];
    return `- ${curePolicy}: base no-affix生存 ${formatRate(item?.base)} / ` +
      `校正upper no-affix生存 ${formatRate(item?.upper)} / ` +
      `upper−base ${formatRateDifference(
        item?.delta,
        item?.upper?.trials || 0,
        item?.base?.trials || 0
      )} / CI重複=${item?.delta?.intervalsOverlap === null ? "未観測" : item?.delta?.intervalsOverlap ? "yes" : "no"}`;
  });
  const primaryEndpointTestCount = (attackConditions.length + defenseConditions.length) *
    CURE_POLICIES.length * 3;
  const auditStatusCounts = Object.values(auditPlan?.statuses || {}).reduce((counts, item) => {
    counts[item.status] = (counts[item.status] || 0) + 1;
    return counts;
  }, {});
  const thresholdPoint = item => item ? `${item.multiplier}x` : "未観測";
  const spellGuardReplication = (() => {
    try {
      return JSON.parse(readFileSync(
        `${process.cwd()}/scratch/results/issue-271-spellguard-remeasure.json`,
        "utf8"
      ));
    } catch {
      return null;
    }
  })();
  const spellGuardReplicationLines = spellGuardReplication
    ? [
        "",
        "### spellGuard追加再測定（1x / 5x / 10x、主状態、N≥200）",
        "",
        `6セル全てで有群・なし群N≥200: ${spellGuardReplication.allGroupsMeetTarget ? "yes" : "no"}。` +
          ` 5x A再現: ${spellGuardReplication.reproduced5x ? "yes" : "no"}。`,
        ...spellGuardReplication.conditions.flatMap(condition =>
          CURE_POLICIES.map(curePolicy => {
            const item = spellGuardReplication.cases[
              `${condition.id}:${curePolicy}:${PRIMARY_SCENARIO}`
            ];
            const group = item?.b5.group;
            const threat = item?.exposure.threat;
            return `- ${condition.label} / ${curePolicy}: 有/なし=${group?.matchedN || 0}/${group?.unmatchedN || 0}, ` +
              `Δ死亡=${formatDifference(group?.endpointEffects.death)}, ` +
              `なし生存=${formatRate(group?.unmatchedSurvival)}, ` +
              `呪文round=${threat?.spellRoundCount || 0}, 魔除け軽減ログ=${threat?.spellGuardReductions || 0}。`;
          })
        ),
        "`damage.js:136-168` の `reduceIncomingDamage` は spell 時だけ `getCharAffixSum(\"spellGuard\")` を読み、spellGuard と mabarrier の合計を最大60%として呪文ダメージを軽減する。物理、初手、罠、毒はこの分岐の対象外。強制HALITOのfull診断でroundと軽減ログを実測した。",
        `追加測定 raw SHA-256: ${spellGuardReplication.measurement.rawSha256}。wall-clock ${spellGuardReplication.measurement.wallClockSeconds.toFixed(3)}s、total CPU ${spellGuardReplication.measurement.totalCpuSeconds.toFixed(3)}s。`
      ]
    : [];
  const spellGuardWindowLine = spellGuardReplication?.reproduced5x
    ? "spellGuardは追加測定で5x Aを再現し、既存100xでB未観測のためA<Bの窓を[5x, >100x]と観測する。"
    : "spellGuardは追加再測定前の単発Aを結論に使わず、追加結果がなければ窓は未確定とする。";
  const exposureLines = attackConditions.flatMap(condition =>
    CURE_POLICIES.map(curePolicy => {
      const item = cases[conditionKey(condition, curePolicy, PRIMARY_SCENARIO)];
      const race = item?.exposure?.race;
      const reached = race?.reachedRun;
      const allRunActions = item?.runs ? race?.targetActionCount / item.runs : null;
      return `- ${conditionDisplayLabel(condition)} / ${curePolicy}: B3到達率（全run分母） ${formatRate(item?.exposure?.reachedRate)}; ` +
        `不死遭遇率 ${formatRate(race?.targetEncounterRate)} / 不死monster率 ${formatRate(race?.targetMonsterRate)}; ` +
        `target action ${formatNumber(allRunActions, 2)}/全run、${formatNumber(reached?.targetActionPerRun, 2)}/到達run。`;
    })
  );
  const defenseExposureLines = defenseConditions
    .filter(condition => condition.multiplier === 5)
    .flatMap(condition => CURE_POLICIES.map(curePolicy => {
      const item = cases[conditionKey(condition, curePolicy, PRIMARY_SCENARIO)];
      const countermeasure = item?.exposure?.countermeasure;
      const formatCounts = counts => Object.entries(counts || {})
        .sort((left, right) => Number(left[0]) - Number(right[0]))
        .map(([value, count]) => `${value}:${count}`)
        .join(" / ") || "未観測";
      return `- ${conditionDisplayLabel(condition)} / ${curePolicy}: B3到達率 ${formatRate(item?.exposure?.reachedRate)}; ` +
        `countermeasure active rounds ${countermeasure?.activeRounds || 0}、` +
        `affix ${formatCounts(countermeasure?.valuesBefore)}→${formatCounts(countermeasure?.valuesAfter)}。`;
    }));
  const lines = [
    "# Issue #271 Phase 2b: 対策affix強度測定",
    "",
    "## 結論（Step 2を先に）",
    "",
    "攻撃系の強化は初手・毒・罠を減らさず、これらが深層endpointを支配し得る。2倍ダメージで決着turnは約0.2短縮したが、深層の帰結は戦闘の攻撃力だけでは決まらない。",
    "防御系では spellGuard だけが呪文被害という別経路に届く。追加再測定を含むA/B判定はStep 3に置く。",
    "",
    "## 曝露率監査（最初）",
    "",
    ...exposureLines,
    ...defenseExposureLines,
    "",
    "## Step 1: anti-X機構到達性（最初に判定）",
    "",
    `5x upper / ${PRIMARY_SCENARIO} / smart: getCharAffixSum(char, "antiUndead") 読取値分布（round target action）は、適用前 ${formatCounts(mechanism?.beforeCounts)} → 適用後 ${formatCounts(mechanism?.afterCounts)}。`,
    `5x upper / ${PRIMARY_SCENARIO} / never: 適用前 ${formatCounts(mechanismNever?.beforeCounts)} → 適用後 ${formatCounts(mechanismNever?.afterCounts)}。`,
    `実 applyTargetedDamageBonus 呼出回数（対象action内）: smart ${mechanism?.applications || 0}（anti-X有効 ${mechanism?.effectiveApplications || 0}）、never ${mechanismNever?.applications || 0}（有効 ${mechanismNever?.effectiveApplications || 0}）。`,
    `適用前後の実ダメージ比（damage.js:56 のMath.round引数から反実仮想を同時算出）: smart ${formatNumber(mechanism?.ratio, 3)}x、never ${formatNumber(mechanismNever?.ratio, 3)}x。`,
    `有群定義監査（B5 entrant）: smart snapshot有 ${attack5Smart?.raceGroupDefinition?.snapshotPositiveN || 0} / runtime positive read ${attack5Smart?.raceGroupDefinition?.runtimePositiveReadN || 0} / 両方 ${attack5Smart?.raceGroupDefinition?.bothN || 0}（snapshot-onlyはB3到達・対象action未観測を含む）。`,
    `有群定義監査（B5 entrant）: never snapshot有 ${attack5Never?.raceGroupDefinition?.snapshotPositiveN || 0} / runtime positive read ${attack5Never?.raceGroupDefinition?.runtimePositiveReadN || 0} / 両方 ${attack5Never?.raceGroupDefinition?.bothN || 0}。`,
    "5x override は別経路加算でなく、一時装備affixを通じて20→100（5倍のaffix sum）へ変換。実戦闘round.js:269/373→damage.js:53-62で適用された。",
    "",
    "## Step 2: 届いた後の切り分け",
    "",
    "最初の死因行は全run（無条件）の死亡者内訳、続く行は主状態のB5 entrant条件付き。有/なしのentrant選別を無条件指標と混ぜない。",
    `5x smart 全run死因: ${deathLines(attack5Smart?.deaths)}。5x never 全run死因: ${deathLines(attack5Never?.deaths)}。`,
    `5x smart B5 entrant死因（有群/なし群）: ${deathLines(attack5Smart?.b5.group.matchedDeaths)} / ${deathLines(attack5Smart?.b5.group.unmatchedDeaths)}。`,
    `5x never B5 entrant死因（有群/なし群）: ${deathLines(attack5Never?.b5.group.matchedDeaths)} / ${deathLines(attack5Never?.b5.group.unmatchedDeaths)}。`,
    `5x smart 有群平均: 与ダメージ ${formatMean(attack5Smart?.b5.group.matchedMetrics.damageGiven)} / 戦闘turn/run ${formatMean(attack5Smart?.b5.group.matchedMetrics.combatTurns)} / 決着turn/encounter ${formatNumber(attack5Smart?.b5.group.matchedMetrics.turnMean.all)} / 被ダメージ ${formatMean(attack5Smart?.b5.group.matchedMetrics.totalDamageTaken)}。`,
    `5x smart なし群平均: 与ダメージ ${formatMean(attack5Smart?.b5.group.unmatchedMetrics.damageGiven)} / 戦闘turn/run ${formatMean(attack5Smart?.b5.group.unmatchedMetrics.combatTurns)} / 決着turn/encounter ${formatNumber(attack5Smart?.b5.group.unmatchedMetrics.turnMean.all)} / 被ダメージ ${formatMean(attack5Smart?.b5.group.unmatchedMetrics.totalDamageTaken)}。`,
    `5x never 有群平均: 与ダメージ ${formatMean(attack5Never?.b5.group.matchedMetrics.damageGiven)} / 戦闘turn/run ${formatMean(attack5Never?.b5.group.matchedMetrics.combatTurns)} / 決着turn/encounter ${formatNumber(attack5Never?.b5.group.matchedMetrics.turnMean.all)} / 被ダメージ ${formatMean(attack5Never?.b5.group.matchedMetrics.totalDamageTaken)}。`,
    `5x never なし群平均: 与ダメージ ${formatMean(attack5Never?.b5.group.unmatchedMetrics.damageGiven)} / 戦闘turn/run ${formatMean(attack5Never?.b5.group.unmatchedMetrics.combatTurns)} / 決着turn/encounter ${formatNumber(attack5Never?.b5.group.unmatchedMetrics.turnMean.all)} / 被ダメージ ${formatMean(attack5Never?.b5.group.unmatchedMetrics.totalDamageTaken)}。`,
    `HP経路（5x smart 有群/なし群）: 初手 ${formatMean(attack5Smart?.b5.group.matchedMetrics.initialDamage)} / ${formatMean(attack5Smart?.b5.group.unmatchedMetrics.initialDamage)}、毒 ${formatMean(attack5Smart?.b5.group.matchedMetrics.poisonDamage)} / ${formatMean(attack5Smart?.b5.group.unmatchedMetrics.poisonDamage)}、罠 ${formatMean(attack5Smart?.b5.group.matchedMetrics.trapDamage)} / ${formatMean(attack5Smart?.b5.group.unmatchedMetrics.trapDamage)}、戦闘被ダメージ ${formatMean(attack5Smart?.b5.group.matchedMetrics.damageTaken)} / ${formatMean(attack5Smart?.b5.group.unmatchedMetrics.damageTaken)}。`,
    `HP経路（5x never 有群/なし群）: 初手 ${formatMean(attack5Never?.b5.group.matchedMetrics.initialDamage)} / ${formatMean(attack5Never?.b5.group.unmatchedMetrics.initialDamage)}、毒 ${formatMean(attack5Never?.b5.group.matchedMetrics.poisonDamage)} / ${formatMean(attack5Never?.b5.group.unmatchedMetrics.poisonDamage)}、罠 ${formatMean(attack5Never?.b5.group.matchedMetrics.trapDamage)} / ${formatMean(attack5Never?.b5.group.unmatchedMetrics.trapDamage)}、戦闘被ダメージ ${formatMean(attack5Never?.b5.group.matchedMetrics.damageTaken)} / ${formatMean(attack5Never?.b5.group.unmatchedMetrics.damageTaken)}。`,
    `HP消耗経路（全run平均）: 初手被弾 ${formatMean(attack5Smart?.metrics.initialDamage)}、毒 ${formatMean(attack5Smart?.metrics.poisonDamage)}、罠 ${formatMean(attack5Smart?.metrics.trapDamage)}、戦闘被ダメージ ${formatMean(attack5Smart?.metrics.damageTaken)}。`,
    `HP消耗経路（全run平均、never）: 初手被弾 ${formatMean(attack5Never?.metrics.initialDamage)}、毒 ${formatMean(attack5Never?.metrics.poisonDamage)}、罠 ${formatMean(attack5Never?.metrics.trapDamage)}、戦闘被ダメージ ${formatMean(attack5Never?.metrics.damageTaken)}。`,
    `決着turn（全combat encounter平均、全run）: smart ${formatNumber(attack5Smart?.metrics.turnMean.all)} / never ${formatNumber(attack5Never?.metrics.turnMean.all)}。群別は上記combatTurnsと死因内訳で切り分け。`,
    "",
    "## Step 3: 強度掃引",
    "",
    "### 攻撃系 antiUndead",
    "",
    ...primaryCaseLines(attackConditions),
    "",
    "### 防御・軽減系（主状態 core-pools）",
    "",
    "各affixは 1x→5x→10x→25x→100x の順、各強度はsmart/neverの2行。",
    ...primaryCaseLines(defenseConditions),
    "",
    "### A/B判定",
    "",
    `A（質依存が出る強度）: ${thresholds.attack.relation}。first A=${thresholdPoint(thresholds.attack.firstA)}。smart/neverで同符号CIが揃う条件を採用。`,
    `B（対策必須）: 対策なし生存率<${formatPercent(PRACTICAL_SURVIVAL_FLOOR)}を実用外と定義。first B=${thresholdPoint(thresholds.attack.firstB)}。`,
    `攻撃系の結論: ${thresholds.attack.relation}。A/Bの窓=${thresholds.attack.window === true ? "あり" : thresholds.attack.firstA && thresholds.attack.firstB ? "なし" : "判定不能（片方未観測）"}。`,
    `防御系: affix別に ${Object.entries(thresholds.defense).map(([affix, item]) => `${affix}=${item.relation}`).join(" / ")}。非単調な点推定はkneeと呼ばず、CIが重なる順位変化は結論反転と扱わない。`,
    "B判定は各cellのB5 entrant内・対策なし群の生存率で行い、100xで20%未満にならない条件はB未観測と記す。",
    spellGuardWindowLine,
    ...spellGuardReplicationLines,
    "",
    "## 難易度・選別",
    "",
    "- 適用階B3到達率は全run分母、到達run条件付き遭遇/適用回数は到達run分母で別集計。詳細な数値は冒頭の曝露率監査に置いた。",
    ...calibrationLines,
    "- 攻撃5x/10x/25x/100xはPR #451と同じ不死100%置換＋hp×1.60/atk×1.60/def×1.30固定校正。倍率は有/なし群・cure・scenarioで変えない。防御系はaffix強度を変えても敵条件不変、脅威overrideはaffix別に全strength共通。",
    "- 有/なしendpointはB5 entrant内の職内centered差。無条件平均floor・生還率・被害・死因は全runで別掲。群N<30は未確定、未到達は未観測、CI跨ぎは効果なしと断定しない。",
    `- 判定用多重比較: 主状態 ${primaryEndpointTestCount}検定、α=0.05の期待偽陽性 ${formatNumber(primaryEndpointTestCount * 0.05, 1)}本。監査は符号確認のみで判定検定に数えない。`,
    "",
    "## N設計",
    "",
    `- 主状態は ${RUNS.toLocaleString()} run/cell、監査は ${measurement.auditRuns || RUNS.toLocaleString()} run/cell。主状態の保守設計値は ceil(30 / (${B5_ENTRANT_RATE.toFixed(4)} × ${SMALLEST_AFFIX_RATE.toFixed(4)})) = ${REQUIRED_RUNS.toLocaleString()} → ${RUNS.toLocaleString()} run/cell。`,
    "- CI幅・powerは保証せず、各cell実測Nを監査。N<30は未確定。",
    `- 監査符号判定: ${Object.entries(auditStatusCounts).map(([status, count]) => `${status}=${count}`).join(" / ") || "対象なし"}。符号不一致のみ主状態Nへ追加測定。`,
    "",
    "## 実行監査",
    "",
    `- seed=${measurement.seed}、基本4職、target depth=${TARGET_DEPTH}、SIM_CALIBRATION_RUNS=100、IDENTIFICATION_POLICY=powder、FLEE_POLICY=threshold、SIM_PARALLEL未指定（解決値=${measurement.resolvedParallelism}）。`,
    `- scenario: ${REQUESTED_SCENARIOS.join(" / ")}。主状態=${PRIMARY_SCENARIO} は N=${measurement.primaryRuns || RUNS}、監査は N=${measurement.auditRuns || RUNS}。`,
    `- 監査削減: ${measurement.auditCellCount || 0}セルを低N、符号不一致による追加=${measurement.auditEscalatedCellCount || 0}セル。diagnostic=${measurement.diagnosticMode || "full"}。`,
    `- raw JSONL SHA-256: ${measurement.rawSha256}`,
    `- summary JSON SHA-256: ${summarySha256}`,
    `- calibration wall-clock ${formatNumber(measurement.calibrationWallSeconds, 3)}s / simulation wall-clock ${formatNumber(measurement.wallClockSeconds, 3)}s / total CPU ${formatNumber(measurement.totalCpuSeconds, 3)}s。`,
    "- src変更なし。生成run pathはgenerateRunFloor→現行combat/reward/cure経路。"
  ];
  return `${lines.join("\n")}\n`;
}

async function runMeasurement() {
  const resultDir = `${process.cwd()}/scratch/results`;
  mkdirSync(resultDir, { recursive: true });
  const rawPath = `${resultDir}/${RESULT_BASENAME}.raw.jsonl`;
  const summaryPath = `${resultDir}/${RESULT_BASENAME}.json`;
  const reportPath = `${resultDir}/${RESULT_BASENAME}.md`;
  const rawWriter = createRawWriter(rawPath);
  const conditions = [...ATTACK_CONDITIONS, ...DEFENSE_CONDITIONS];
  const conditionMap = Object.fromEntries(conditions.map(condition => [condition.id, condition]));
  const scenarios = {};
  const scoringProfiles = {};
  const calibrationStarted = performance.now();
  const calibrationCpuStarted = process.cpuUsage();
  for (const condition of conditions) {
    for (const curePolicy of CURE_POLICIES) {
      for (const scenarioId of REQUESTED_SCENARIOS) {
        const scenario = buildScenario(scenarioId, condition, curePolicy);
        const key = conditionKey(condition, curePolicy, scenarioId);
        scenarios[key] = scenario;
        resetSimulationRandom(SEED);
        scoringProfiles[key] = calibrateCoreScoringProfile(
          CALIBRATION_RUNS,
          scenario,
          IDENTIFICATION_POLICY,
          scenario.workshop
        );
      }
    }
  }
  const calibrationCpu = process.cpuUsage(calibrationCpuStarted);
  const calibrationWallSeconds = (performance.now() - calibrationStarted) / 1000;

  const simulationStarted = performance.now();
  const simulationCpuStarted = process.cpuUsage();
  const cells = conditions.flatMap(condition =>
    CURE_POLICIES.flatMap(curePolicy =>
      REQUESTED_SCENARIOS.map(scenarioId => ({ condition, curePolicy, scenarioId }))
    )
  );
  const primaryCells = cells.filter(cell => cell.scenarioId === PRIMARY_SCENARIO);
  const auditCells = cells.filter(cell => cell.scenarioId !== PRIMARY_SCENARIO);
  const rowsByCell = new Map();
  const runCells = async (selectedCells, runCount, phase) => {
    for (let batchStart = 0; batchStart < selectedCells.length; batchStart += CELL_BATCH_SIZE) {
      const batchCells = selectedCells.slice(batchStart, batchStart + CELL_BATCH_SIZE);
      const groupTasks = batchCells.flatMap(({ condition, curePolicy, scenarioId }) =>
        Array.from({ length: runCount }, (_, runIndex) => ({
          conditionId: condition.id,
          curePolicy,
          scenarioId,
          runIndex,
          className: CLASS_NAMES[runIndex % CLASS_NAMES.length]
        }))
      );
      const rows = await runSimTasks({
        moduleUrl: pathToFileURL(fileURLToPath(import.meta.url)).href,
        exportName: "runCountermeasureStrengthTask",
        runTask: runCountermeasureStrengthTask,
        tasks: groupTasks,
        context: {
          seed: SEED,
          conditions: conditionMap,
          scenarios,
          scoringProfiles,
          diagnosticMode: DIAGNOSTIC_MODE
        }
      });
      if (rows.length !== groupTasks.length) {
        throw new Error(
          `row count mismatch: ${phase} ${batchStart} ${rows.length}/${groupTasks.length}`
        );
      }
      for (const { condition, curePolicy, scenarioId } of batchCells) {
        const cellKey = conditionKey(condition, curePolicy, scenarioId);
        rowsByCell.set(cellKey, rows.filter(row =>
          row.conditionId === condition.id &&
          row.curePolicy === curePolicy &&
          row.scenarioId === scenarioId
        ));
      }
      console.error(
        `${phase} cells ${batchStart + 1}-${batchStart + batchCells.length}/` +
        `${selectedCells.length}: ${rows.length} runs`
      );
    }
  };

  await runCells(primaryCells, RUNS, "primary");
  const lowAuditCases = {};
  const auditStatuses = {};
  await runCells(auditCells, AUDIT_RUNS, "audit");
  auditCells.forEach(({ condition, curePolicy, scenarioId }) => {
    const cellKey = conditionKey(condition, curePolicy, scenarioId);
    const selected = rowsByCell.get(cellKey) || [];
    const lowCase = summarizeCase(selected, condition, curePolicy, scenarioId);
    lowAuditCases[cellKey] = lowCase;
    const primaryKey = conditionKey(condition, curePolicy, PRIMARY_SCENARIO);
    auditStatuses[cellKey] = auditSignStatus(
      summarizeCase(
        rowsByCell.get(primaryKey) || [],
        condition,
        curePolicy,
        PRIMARY_SCENARIO
      ),
      lowCase
    );
  });
  const escalatedCells = auditCells.filter(({ condition, curePolicy, scenarioId }) =>
    auditStatuses[conditionKey(condition, curePolicy, scenarioId)]?.escalated
  );
  if (escalatedCells.length) {
    await runCells(escalatedCells, RUNS, "audit-escalation");
  }
  const cases = {};
  cells.forEach(({ condition, curePolicy, scenarioId }) => {
    const cellKey = conditionKey(condition, curePolicy, scenarioId);
    cases[cellKey] = summarizeCase(
      rowsByCell.get(cellKey) || [],
      condition,
      curePolicy,
      scenarioId
    );
  });
  cells.forEach(({ condition, curePolicy, scenarioId }) => {
    rawWriter.write(rowsByCell.get(conditionKey(condition, curePolicy, scenarioId)) || []);
  });
  const simulationCpu = process.cpuUsage(simulationCpuStarted);
  const wallClockSeconds = (performance.now() - simulationStarted) / 1000;
  const rawAudit = rawWriter.close();
  const measurement = {
    issue: 271,
    phase: "2b",
    seed: SEED,
    SIM_RUNS: RUNS,
    SIM_AUDIT_RUNS: AUDIT_RUNS,
    SIM_CALIBRATION_RUNS: CALIBRATION_RUNS,
    SIM_PARALLEL: "未指定",
    resolvedParallelism: resolveSimParallelism(RUNS),
    availableParallelism: availableParallelism(),
    identificationPolicy: IDENTIFICATION_POLICY,
    fleePolicy: "threshold",
    fleeHpThreshold: FLEE_HP_THRESHOLD,
    departureCraftIds: process.env.DEPARTURE_CRAFT_IDS.split(",").filter(Boolean),
    trapPolicy: process.env.TRAP_POLICY,
    trapAvoidancePolicy: process.env.TRAP_AVOIDANCE_POLICY,
    scenarios: REQUESTED_SCENARIOS,
    primaryScenario: PRIMARY_SCENARIO,
    primaryRuns: RUNS,
    auditScenarios: REQUESTED_SCENARIOS.filter(id => id !== PRIMARY_SCENARIO),
    auditRuns: AUDIT_RUNS,
    auditCellCount: auditCells.length,
    auditLowRows: auditCells.length * AUDIT_RUNS,
    auditEscalatedCellCount: escalatedCells.length,
    auditEscalatedRows: escalatedCells.length * RUNS,
    diagnosticMode: DIAGNOSTIC_MODE,
    pairing: Object.fromEntries(conditions.map(condition => [
      condition.id,
      inferPairingEligibility(condition)
    ])),
    classes: CLASS_NAMES,
    targetDepth: TARGET_DEPTH,
    cellBatchSize: CELL_BATCH_SIZE,
    calibrationWallSeconds,
    wallClockSeconds,
    calibrationCpuSeconds: (calibrationCpu.user + calibrationCpu.system) / 1e6,
    simulationCpuSeconds: (simulationCpu.user + simulationCpu.system) / 1e6,
    totalCpuSeconds: (
      calibrationCpu.user + calibrationCpu.system + simulationCpu.user + simulationCpu.system
    ) / 1e6,
    rawRows: rawAudit.rows,
    rawSha256: rawAudit.sha256
  };
  const preliminary = {
    measurement,
    auditPlan: {
      primaryScenario: PRIMARY_SCENARIO,
      primaryRuns: RUNS,
      auditRuns: AUDIT_RUNS,
      auditScenarios: REQUESTED_SCENARIOS.filter(id => id !== PRIMARY_SCENARIO),
      lowAuditCases,
      statuses: auditStatuses,
      escalatedCells: escalatedCells.map(({ condition, curePolicy, scenarioId }) =>
        conditionKey(condition, curePolicy, scenarioId)
      )
    },
    nDesign: {
      b5EntrantRate: B5_ENTRANT_RATE,
      smallestAffixRate: SMALLEST_AFFIX_RATE,
      requiredRuns: REQUIRED_RUNS,
      plannedRuns: PLANNED_RUNS,
      practicalSurvivalFloor: PRACTICAL_SURVIVAL_FLOOR
    },
    attackConditions: ATTACK_CONDITIONS,
    defenseConditions: DEFENSE_CONDITIONS,
    cases,
    thresholds: { attack: null, defense: null }
  };
  preliminary.thresholds.attack = determineThresholds(cases, ATTACK_CONDITIONS);
  preliminary.thresholds.defense = Object.fromEntries(
    DEFENSE_AFFIXES.map(affixType => {
      const selected = DEFENSE_CONDITIONS.filter(condition => condition.affixType === affixType);
      return [affixType, determineThresholds(cases, selected)];
    })
  );
  preliminary.calibration = summarizeDifficultyCalibration(cases);
  const summaryText = `${JSON.stringify(preliminary, null, 2)}\n`;
  writeFileSync(summaryPath, summaryText);
  const summarySha256 = createHash("sha256").update(summaryText).digest("hex");
  writeFileSync(reportPath, buildReport(preliminary, summarySha256));
  console.log(JSON.stringify({
    reportPath: reportPath.replace(`${process.cwd()}/`, ""),
    summaryPath: summaryPath.replace(`${process.cwd()}/`, ""),
    rawPath: rawPath.replace(`${process.cwd()}/`, ""),
    rawSha256: measurement.rawSha256,
    summarySha256,
    measurement,
    thresholdRelations: {
      attack: preliminary.thresholds.attack.relation,
      defense: Object.fromEntries(
        Object.entries(preliminary.thresholds.defense).map(([key, value]) => [key, value.relation])
      )
    }
  }, null, 2));
}

if (isMainThread && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.env.SIM_REPORT_ONLY === "1") {
    const resultDir = `${process.cwd()}/scratch/results`;
    const summaryPath = `${resultDir}/${RESULT_BASENAME}.json`;
    const reportPath = `${resultDir}/${RESULT_BASENAME}.md`;
    const summaryText = readFileSync(summaryPath, "utf8");
    const summary = JSON.parse(summaryText);
    summary.thresholds.attack = determineThresholds(summary.cases, summary.attackConditions);
    summary.thresholds.defense = Object.fromEntries(
      DEFENSE_AFFIXES.map(affixType => {
        const selected = summary.defenseConditions.filter(
          condition => condition.affixType === affixType
        );
        return [affixType, determineThresholds(summary.cases, selected)];
      })
    );
    const summarySha256 = createHash("sha256").update(summaryText).digest("hex");
    writeFileSync(reportPath, buildReport(summary, summarySha256));
    console.log(JSON.stringify({ reportPath, summarySha256 }, null, 2));
  } else {
    await runMeasurement();
  }
}
