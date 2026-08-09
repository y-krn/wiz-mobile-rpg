// sim-scope: run
// Issue #271 Phase 2a: status-threat depth-scaling ceiling measurement.

/* global console, process */

import { createHash } from "node:crypto";
import { closeSync, mkdirSync, openSync, readFileSync, writeFileSync, writeSync } from "node:fs";
import { availableParallelism } from "node:os";
import { performance } from "node:perf_hooks";
import { isMainThread } from "node:worker_threads";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveSimParallelism, runSimTasks } from "./sim_parallel.js";

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
const STATUS_NAMES = Object.freeze(["poisoned", "blind", "paralyzed", "sleep"]);
const STATUS_START_FLOOR = 6;
const STATUS_END_FLOOR = 20;
const B5 = 5;
const TARGET_DEPTH = 21;
const R95 = 1.959963984540054;
const MIN_GROUP_N = 30;

const STATUS_CONDITIONS = Object.freeze({
  base: Object.freeze({
    id: "base",
    label: "base（現行）",
    override: null,
    chanceMultiplierAtMax: 1,
    encounterProbabilityAtMax: 0
  }),
  weak: Object.freeze({
    id: "weak",
    label: "status scale 弱",
    override: Object.freeze({
      startFloor: STATUS_START_FLOOR,
      endFloor: STATUS_END_FLOOR,
      chanceMultiplierAtMax: 1.5,
      encounterProbabilityAtMax: 0.25
    }),
    chanceMultiplierAtMax: 1.5,
    encounterProbabilityAtMax: 0.25
  }),
  medium: Object.freeze({
    id: "medium",
    label: "status scale 中",
    override: Object.freeze({
      startFloor: STATUS_START_FLOOR,
      endFloor: STATUS_END_FLOOR,
      chanceMultiplierAtMax: 2,
      encounterProbabilityAtMax: 0.5
    }),
    chanceMultiplierAtMax: 2,
    encounterProbabilityAtMax: 0.5
  }),
  strong: Object.freeze({
    id: "strong",
    label: "status scale 強",
    override: Object.freeze({
      startFloor: STATUS_START_FLOOR,
      endFloor: STATUS_END_FLOOR,
      chanceMultiplierAtMax: 3,
      encounterProbabilityAtMax: 0.75
    }),
    chanceMultiplierAtMax: 3,
    encounterProbabilityAtMax: 0.75
  }),
  ceiling: Object.freeze({
    id: "ceiling",
    label: "status scale 天井",
    override: Object.freeze({
      startFloor: STATUS_START_FLOOR,
      endFloor: STATUS_END_FLOOR,
      forceStatusEncounter: true,
      forceStatusChance: true,
      chanceMultiplierAtMax: null,
      encounterProbabilityAtMax: 1
    }),
    chanceMultiplierAtMax: 1,
    encounterProbabilityAtMax: 1
  }),
  "ceiling-b3": Object.freeze({
    id: "ceiling-b3",
    label: "status scale 天井（B3開始）",
    override: Object.freeze({
      startFloor: 3,
      endFloor: STATUS_END_FLOOR,
      forceStatusEncounter: true,
      forceStatusChance: true,
      chanceMultiplierAtMax: null,
      encounterProbabilityAtMax: 1
    }),
    chanceMultiplierAtMax: 1,
    encounterProbabilityAtMax: 1
  })
});
const STATUS_CONDITION_ORDER = Object.freeze([
  "base",
  "weak",
  "medium",
  "strong",
  "ceiling",
  "ceiling-b3"
]);
const REQUESTED_SCENARIOS = String(
  process.env.STATUS_SCENARIOS || ALL_SCENARIO_IDS.join(",")
).split(",").map(value => value.trim()).filter(Boolean);
const REQUESTED_CONDITIONS = String(
  process.env.STATUS_CONDITIONS || STATUS_CONDITION_ORDER.join(",")
).split(",").map(value => value.trim()).filter(Boolean);
const CURE_POLICIES = String(
  process.env.STATUS_CURE_POLICIES || "smart,never"
).split(",").map(value => value.trim()).filter(Boolean);

const ENV_DEFAULTS = Object.freeze({
  SIM_SEED: "271",
  SIM_RUNS: "11000",
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
  PORTAL_HP_THRESHOLD: "0.35",
  PORTAL_MAX_HEAL_POTIONS: "0",
  PORTAL_MIN_FLOOR: "3",
  ELITE_POLICY: "avoid",
  BLOOD_WAND_HP_PAYMENT_MIN_RATE: "0.50",
  SIM_CORE_SCORE_DROP_TOLERANCE: "0",
  SIM_440_CONDITION: "current",
  SIM_SCENARIOS: REQUESTED_SCENARIOS.join(",")
});
for (const [key, value] of Object.entries(ENV_DEFAULTS)) {
  if (process.env[key] === undefined) process.env[key] = value;
}
if (process.env.SIM_PARALLEL) {
  throw new Error("SIM_PARALLEL must be omitted for Issue #271 Phase 2a measurement");
}
if (process.env.IDENTIFICATION_POLICY !== "powder") {
  throw new Error("IDENTIFICATION_POLICY must be powder for Issue #271 Phase 2a");
}
if (Number(process.env.SIM_CALIBRATION_RUNS) !== 100) {
  throw new Error("SIM_CALIBRATION_RUNS must be 100 for Issue #271 Phase 2a");
}
if (process.env.FLEE_POLICY !== "threshold") {
  throw new Error("FLEE_POLICY must be threshold for Issue #271 Phase 2a");
}
if (!REQUESTED_SCENARIOS.length || REQUESTED_SCENARIOS.some(id => !ALL_SCENARIO_IDS.includes(id))) {
  throw new Error(`unknown STATUS_SCENARIOS: ${REQUESTED_SCENARIOS.join(",")}`);
}
if (!REQUESTED_CONDITIONS.length || REQUESTED_CONDITIONS.some(id => !STATUS_CONDITION_ORDER.includes(id))) {
  throw new Error(`unknown STATUS_CONDITIONS: ${REQUESTED_CONDITIONS.join(",")}`);
}
if (!CURE_POLICIES.length || CURE_POLICIES.some(policy => !["smart", "never"].includes(policy))) {
  throw new Error(`STATUS_CURE_POLICIES must contain smart and/or never: ${CURE_POLICIES.join(",")}`);
}

const RUNS = Math.max(1, Number(process.env.SIM_RUNS));
const CALIBRATION_RUNS = Math.max(1, Number(process.env.SIM_CALIBRATION_RUNS));
const SEED = Number(process.env.SIM_SEED) >>> 0;
const FLEE_HP_THRESHOLD = Number(process.env.FLEE_HP_THRESHOLD);
const STATUS_CONDITION_DEFINITIONS = REQUESTED_CONDITIONS.map(id => STATUS_CONDITIONS[id]);
const SELECTED_SCENARIO_IDS = Object.freeze([...REQUESTED_SCENARIOS]);
const STATUS_CURE_POLICY_ORDER = Object.freeze([...CURE_POLICIES]);

const [
  {
    SIM_CLASSES,
    calibrateCoreScoringProfile,
    getScenarioById,
    resetSimulationRandom,
    simulateRun
  },
  { CORE_AFFIXES, SUPPORT_AFFIXES }
] = await Promise.all([
  import("./sim_depth_material_ev.js"),
  import("../src/data/affixes.js")
]);

const CLASS_NAMES = SIM_CLASSES.filter(className => BASIC_CLASSES.includes(className));
if (CLASS_NAMES.length !== BASIC_CLASSES.length) {
  throw new Error(`basic classes missing: ${BASIC_CLASSES.join(",")}`);
}

const CORE_SUPPORT_SYNERGY = Object.freeze({
  CORE_LAST_STAND: ["hp", "vit", "guardian", "killHeal"],
  CORE_OPENER: ["firstStrike", "firstTurnAttack", "fullHpDamage", "followUp"],
  CORE_BLOOD_WAND: ["hp", "vit", "int", "pie", "arcane", "devotion"],
  CORE_PURIFY_RING: ["antiUndead", "antiDemon", "arcane", "devotion"],
  CORE_TRAP_EATER: ["trapBonus"],
  CORE_CURSE_KEEPER: [],
  CORE_GIANT_SLAYER: ["antiDragon", "antiBeast", "antiSpirit"],
  CORE_THORN_SHIELD: ["guardian", "def", "vit", "hitFlinch"],
  CORE_EXECUTIONER: []
});
const ENABLED_CORE_IDS = new Set(
  CORE_AFFIXES.filter(affix => affix.enabled).map(affix => affix.id)
);
const ENABLED_SUPPORT_IDS = SUPPORT_AFFIXES
  .filter(affix => affix.enabled)
  .map(affix => affix.id);

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

function countValues(values = {}) {
  return Object.values(values).reduce((sum, value) => sum + Number(value || 0), 0);
}

function normalizeStatus(status) {
  return status === "paralyze" ? "paralyzed" : status;
}

function createStatusCounts() {
  return Object.fromEntries(STATUS_NAMES.map(status => [status, 0]));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getIncomingDamage(log, playerName) {
  const escapedName = escapeRegExp(playerName);
  const pattern = new RegExp(`${escapedName}(?:は|に)(\\d+)の[^。！]*ダメージ`);
  return log
    .filter(message => message.startsWith("[ 敵 ]") &&
      message.includes(playerName) &&
      message.includes("ダメージ") &&
      !message.includes("反射"))
    .map(message => Number(message.match(pattern)?.[1] || 0))
    .filter(damage => damage > 0);
}

function getPlayerPoisonDamage(log) {
  return log
    .filter(message => message.startsWith("[味方]") && message.includes("毒のダメージ"))
    .map(message => Number(message.match(/(\d+)のダメージ/)?.[1] || 0))
    .filter(damage => damage > 0);
}

function collectStatusDiagnostics(result, statusStartFloor = STATUS_START_FLOOR) {
  const statusApplications = createStatusCounts();
  const statusDurationTurns = createStatusCounts();
  const statusLostTurns = createStatusCounts();
  const statusActiveIncomingHits = createStatusCounts();
  const statusActiveIncomingDamage = createStatusCounts();
  let normalEncounterCount = 0;
  let statusEncounterCount = 0;
  let statusApplicationCount = 0;
  let statusDurationTurnCount = 0;
  let statusLostTurnCount = 0;
  let statusActiveIncomingHitCount = 0;
  let statusActiveIncomingDamageTotal = 0;
  let incapacitatedExtraHits = 0;
  let incapacitatedExtraDamage = 0;
  let poisonDamage = 0;
  let blindMisses = 0;

  const encounters = result.diagnostics?.encounters || [];
  encounters
    .filter(encounter => encounter.floor >= statusStartFloor)
    .forEach(encounter => {
      const normal = encounter.type === "normal";
      if (normal) {
        normalEncounterCount++;
        if (encounter.monsters.some(monster => monster.statusCapable)) {
          statusEncounterCount++;
        }
      }
      encounter.rounds.forEach(round => {
        const statusBefore = normalizeStatus(round.statusBefore);
        const statusAfter = normalizeStatus(round.statusAfter);
        const activeStatuses = STATUS_NAMES.filter(status =>
          statusBefore === status || statusAfter === status
        );
        activeStatuses.forEach(status => {
          statusDurationTurns[status]++;
          statusDurationTurnCount++;
          if (statusBefore === "sleep" || statusBefore === "paralyzed") {
            const lost = round.log.some(message => message.includes("動けない"));
            if (lost) {
              statusLostTurns[status]++;
              statusLostTurnCount++;
            }
          }
          if (statusBefore === status) {
            const incoming = getIncomingDamage(round.log, encounter.startPlayerName);
            statusActiveIncomingHits[status] += incoming.length;
            statusActiveIncomingDamage[status] += incoming.reduce((sum, value) => sum + value, 0);
            statusActiveIncomingHitCount += incoming.length;
            statusActiveIncomingDamageTotal += incoming.reduce((sum, value) => sum + value, 0);
            if (status === "sleep" || status === "paralyzed") {
              incapacitatedExtraHits += incoming.length;
              incapacitatedExtraDamage += incoming.reduce((sum, value) => sum + value, 0);
            }
          }
      });
        round.log.forEach(message => {
          poisonDamage += getPlayerPoisonDamage([message])
            .reduce((sum, value) => sum + value, 0);
          if (message.includes("目がくらんで空振りした")) blindMisses++;
          if (!message.startsWith("[ 敵 ]")) return;
          const applications = [
            ["poisoned", /毒を受け、毒状態になった/],
            ["blind", /盲目状態になった/],
            ["paralyzed", /麻痺を受け、麻痺状態になった/],
            ["sleep", /眠りに落ちた/]
          ];
          applications.forEach(([status, pattern]) => {
            if (!pattern.test(message)) return;
            statusApplications[status]++;
            statusApplicationCount++;
          });
        });
      });
    });

  const statusCureItemsUsed = { ...result.statusCureItemsUsed };
  const statusCureItemsAcquired = Object.fromEntries(
    Object.keys(result.finalStatusCureInventory || {}).map(itemId => [
      itemId,
      Object.values(result.statusCureItemsAcquired || {})
        .reduce((sum, source) => sum + Number(source?.[itemId] || 0), 0)
    ])
  );
  return {
    normalEncounterCount,
    statusEncounterCount,
    statusApplications,
    statusApplicationCount,
    statusDurationTurns,
    statusDurationTurnCount,
    statusLostTurns,
    statusLostTurnCount,
    statusActiveIncomingHits,
    statusActiveIncomingDamage,
    statusActiveIncomingHitCount,
    statusActiveIncomingDamageTotal,
    incapacitatedExtraHits,
    incapacitatedExtraDamage,
    poisonDamage,
    blindMisses,
    statusCureItemsUsed,
    statusCureItemsAcquired,
    statusCureItemCount: countValues(statusCureItemsUsed),
    statusCureUnavailableCount: countValues(result.statusCureUnavailableStatuses),
    statusCureHeldNotUsedCount: countValues(result.statusCureHeldNotUsedStatuses),
    statusCureDepleted: countValues(result.finalStatusCureInventory) === 0,
    finalStatusCureInventory: { ...(result.finalStatusCureInventory || {}) }
  };
}

function compactSnapshot(snapshot) {
  if (!snapshot) return null;
  return {
    floor: snapshot.floor,
    point: snapshot.point,
    level: snapshot.level,
    equipmentStatScore: snapshot.equipmentStatScore,
    combatCoreScore: snapshot.combatCoreScore,
    combatBuildScore: snapshot.combatBuildScore,
    coreIds: [...(snapshot.coreIds || [])],
    supportAffixes: { ...(snapshot.supportAffixes || {}) },
    resistanceScore: Number(snapshot.resistanceScore || 0)
  };
}

function getB5Snapshot(result) {
  return compactSnapshot(
    result.diagnostics?.buildSnapshots?.find(
      snapshot => snapshot.floor === B5 && snapshot.point === "floor-start"
    ) || null
  );
}

function getProtectionKind(snapshot) {
  if (!snapshot) return "none";
  const statusResistance = Number(snapshot.supportAffixes?.statusResistance || 0);
  const poisonWard = Number(snapshot.supportAffixes?.poisonWard || 0);
  if (statusResistance > 0 && poisonWard > 0) return "both";
  if (statusResistance > 0) return "statusResistance";
  if (poisonWard > 0) return "poisonWard";
  return "none";
}

function hasProtection(snapshot) {
  return getProtectionKind(snapshot) !== "none";
}

function getMatchingSupportIds(coreId) {
  return CORE_SUPPORT_SYNERGY[coreId] || [];
}

function hasMatchingSupport(snapshot) {
  return Boolean(snapshot?.coreIds?.some(coreId =>
    ENABLED_CORE_IDS.has(coreId) &&
    getMatchingSupportIds(coreId).some(supportId =>
      Number(snapshot.supportAffixes?.[supportId] || 0) > 0
    )
  ));
}

function compactRow(task, result, statusStartFloor) {
  const b5 = getB5Snapshot(result);
  const b6 = result.diagnostics?.buildSnapshots?.some(
    snapshot => snapshot.floor === B5 + 1 && snapshot.point === "floor-start"
  );
  return {
    conditionId: task.conditionId,
    curePolicy: task.curePolicy,
    scenarioId: task.scenarioId,
    runIndex: task.runIndex,
    className: task.className,
    survived: Boolean(result.survived),
    died: Boolean(result.died),
    reachedFloor: Number(result.reachedFloor),
    deathFloor: result.deathFloor === null ? null : Number(result.deathFloor),
    b5,
    b5ProtectionKind: getProtectionKind(b5),
    b5Death: Boolean(b5 && result.died && result.deathFloor === B5),
    b5Breakthrough: Boolean(b5 && b6),
    statusStartFloor,
    status: collectStatusDiagnostics(result, statusStartFloor)
  };
}

function buildScenario(scenarioId, condition, curePolicy) {
  const base = getScenarioById(scenarioId);
  return {
    ...base,
    identificationPolicy: "powder",
    trapPolicy: process.env.TRAP_POLICY,
    trapAvoidancePolicy: process.env.TRAP_AVOIDANCE_POLICY,
    statusCurePolicy: curePolicy,
    statusCureHpThreshold: Number(process.env.STATUS_CURE_HP_THRESHOLD),
    statusCureMerchantPolicy: process.env.STATUS_CURE_MERCHANT_POLICY,
    fleeHpThreshold: FLEE_HP_THRESHOLD,
    elitePolicy: process.env.ELITE_POLICY,
    statusScalingOverride: condition.override
  };
}

export function runStatusDepthScalingTask(task, context) {
  const caseKey = `${task.conditionId}:${task.curePolicy}:${task.scenarioId}`;
  const scenario = context.scenarios[caseKey];
  resetSimulationRandom(hashSeed(`${context.seed}:${caseKey}:${task.runIndex}`));
  const result = simulateRun({
    className: task.className,
    startFloor: 1,
    targetDepth: TARGET_DEPTH,
    runIndex: task.runIndex,
    seriesId: "issue271-status-depth-scaling",
    scoringProfile: context.scoringProfiles[caseKey],
    scenario,
    workshop: scenario.workshop,
    collectDiagnostics: true
  });
  const statusStartFloor = Number(scenario.statusScalingOverride?.startFloor) || STATUS_START_FLOOR;
  return compactRow(task, result, statusStartFloor);
}

function sumStatusRows(rows, selector) {
  return rows.reduce((sum, row) => sum + Number(selector(row) || 0), 0);
}

function sumStatusMap(rows, selector) {
  const total = {};
  rows.forEach(row => addCounts(total, selector(row)));
  return total;
}

function summarizeStatus(rows) {
  const statusApplications = sumStatusMap(rows, row => row.status.statusApplications);
  const statusDurationTurns = sumStatusMap(rows, row => row.status.statusDurationTurns);
  const statusLostTurns = sumStatusMap(rows, row => row.status.statusLostTurns);
  const statusActiveIncomingHits = sumStatusMap(rows, row => row.status.statusActiveIncomingHits);
  const statusActiveIncomingDamage = sumStatusMap(rows, row => row.status.statusActiveIncomingDamage);
  const statusCureItemsUsed = sumStatusMap(rows, row => row.status.statusCureItemsUsed);
  const statusCureItemsAcquired = sumStatusMap(rows, row => row.status.statusCureItemsAcquired);
  const normalEncounterCount = sumStatusRows(rows, row => row.status.normalEncounterCount);
  const statusEncounterCount = sumStatusRows(rows, row => row.status.statusEncounterCount);
  return {
    deepNormalEncounterCount: normalEncounterCount,
    deepStatusEncounterCount: statusEncounterCount,
    deepStatusEncounterRate: wilson(statusEncounterCount, normalEncounterCount),
    statusApplications,
    statusApplicationCount: sumStatusRows(rows, row => row.status.statusApplicationCount),
    statusApplicationsPerRun: sumStatusRows(rows, row => row.status.statusApplicationCount) / rows.length,
    statusDurationTurns,
    statusDurationTurnsPerRun: sumStatusRows(rows, row => row.status.statusDurationTurnCount) / rows.length,
    statusLostTurns,
    statusLostTurnsPerRun: sumStatusRows(rows, row => row.status.statusLostTurnCount) / rows.length,
    statusActiveIncomingHits,
    statusActiveIncomingHitsPerRun:
      sumStatusRows(rows, row => row.status.statusActiveIncomingHitCount) / rows.length,
    statusActiveIncomingDamage,
    statusActiveIncomingDamagePerRun:
      sumStatusRows(rows, row => row.status.statusActiveIncomingDamageTotal) / rows.length,
    incapacitatedExtraHits:
      sumStatusRows(rows, row => row.status.incapacitatedExtraHits),
    incapacitatedExtraHitsPerRun:
      sumStatusRows(rows, row => row.status.incapacitatedExtraHits) / rows.length,
    incapacitatedExtraDamage:
      sumStatusRows(rows, row => row.status.incapacitatedExtraDamage),
    incapacitatedExtraDamagePerRun:
      sumStatusRows(rows, row => row.status.incapacitatedExtraDamage) / rows.length,
    poisonDamage: sumStatusRows(rows, row => row.status.poisonDamage),
    poisonDamagePerRun: sumStatusRows(rows, row => row.status.poisonDamage) / rows.length,
    blindMisses: sumStatusRows(rows, row => row.status.blindMisses),
    blindMissesPerRun: sumStatusRows(rows, row => row.status.blindMisses) / rows.length,
    statusCureItemsUsed,
    statusCureItemsUsedTotal: countValues(statusCureItemsUsed),
    statusCureItemsUsedPerRun: countValues(statusCureItemsUsed) / rows.length,
    statusCureItemsAcquired,
    statusCureItemsAcquiredTotal: countValues(statusCureItemsAcquired),
    statusCureUnavailableCount: sumStatusRows(rows, row => row.status.statusCureUnavailableCount),
    statusCureHeldNotUsedCount: sumStatusRows(rows, row => row.status.statusCureHeldNotUsedCount),
    statusCureDepletedRate: wilson(
      rows.filter(row => row.status.statusCureDepleted).length,
      rows.length
    ),
    finalStatusCureInventory: sumStatusMap(rows, row => row.status.finalStatusCureInventory)
  };
}

function summarizeProtection(entrants, predicate) {
  const matched = entrants.filter(predicate);
  const unmatched = entrants.filter(row => !predicate(row));
  const endpoint = outcomeSelector => classCenteredDifference(entrants, predicate, outcomeSelector);
  return {
    matchedN: matched.length,
    unmatchedN: unmatched.length,
    dataSufficient: matched.length >= MIN_GROUP_N && unmatched.length >= MIN_GROUP_N,
    status: matched.length >= MIN_GROUP_N && unmatched.length >= MIN_GROUP_N
      ? "確定"
      : "未確定（N<30）",
    matchedSurvival: wilson(matched.filter(row => !row.died).length, matched.length),
    unmatchedSurvival: wilson(unmatched.filter(row => !row.died).length, unmatched.length),
    endpointEffects: {
      breakthrough: endpoint(row => row.b5Breakthrough),
      death: endpoint(row => row.b5Death),
      reachedFloor: endpoint(row => row.reachedFloor)
    }
  };
}

function summarizeScenario(rows) {
  const entrants = rows.filter(row => row.b5);
  const statusStartFloor = Number(rows[0]?.statusStartFloor) || STATUS_START_FLOOR;
  const exposedRows = rows.filter(row => row.reachedFloor >= statusStartFloor);
  const protection = summarizeProtection(entrants, row => hasProtection(row.b5));
  const statusResistance = summarizeProtection(
    entrants,
    row => row.b5ProtectionKind === "statusResistance" || row.b5ProtectionKind === "both"
  );
  const poisonWard = summarizeProtection(
    entrants,
    row => row.b5ProtectionKind === "poisonWard" || row.b5ProtectionKind === "both"
  );
  const matching = summarizeProtection(entrants, row => hasMatchingSupport(row.b5));
  return {
    statusStartFloor,
    runs: rows.length,
    b5: {
      entrantsN: entrants.length,
      breakthroughRate: wilson(entrants.filter(row => row.b5Breakthrough).length, entrants.length),
      deathRate: wilson(entrants.filter(row => row.b5Death).length, entrants.length),
      reachedFloor: meanInterval(entrants.map(row => row.reachedFloor)),
      protection,
      statusResistance,
      poisonWard,
      matching
    },
    averageReachedFloor: meanInterval(rows.map(row => row.reachedFloor)),
    survivalRate: wilson(rows.filter(row => !row.died).length, rows.length),
    status: summarizeStatus(rows),
    exposure: {
      startFloor: statusStartFloor,
      reachedN: exposedRows.length,
      reachedRate: wilson(exposedRows.length, rows.length),
      status: exposedRows.length ? summarizeStatus(exposedRows) : null
    }
  };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function writeRawRows(rawPath, rows) {
  const hash = createHash("sha256");
  const file = openSync(rawPath, "w");
  try {
    const chunkSize = 1000;
    for (let offset = 0; offset < rows.length; offset += chunkSize) {
      const chunk = rows.slice(offset, offset + chunkSize).map(row => JSON.stringify(row)).join("\n") + "\n";
      writeSync(file, chunk);
      hash.update(chunk);
    }
  } finally {
    closeSync(file);
  }
  return hash.digest("hex");
}

function percent(value, digits = 1) {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "NA"
    : `${(value * 100).toFixed(digits)}%`;
}

function number(value, digits = 2) {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "NA"
    : Number(value).toFixed(digits);
}

function rateText(rate) {
  if (!rate || rate.estimate === null) return "NA";
  const uncertain = rate.trials < MIN_GROUP_N ? "; N<30 未確定" : "";
  return `${percent(rate.estimate)} [${percent(rate.low)}, ${percent(rate.high)}${uncertain}]`;
}

function meanText(interval) {
  if (!interval || interval.estimate === null) return "NA";
  return `${number(interval.estimate)} [${number(interval.low)}, ${number(interval.high)}]`;
}

function diffText(diff, digits = 2) {
  if (!diff || diff.estimate === null) return `NA (N=${diff?.matchedN || 0}/${diff?.unmatchedN || 0})`;
  const suffix = diff.matchedN < MIN_GROUP_N || diff.unmatchedN < MIN_GROUP_N
    ? "; N<30 未確定"
    : "";
  return `${diff.estimate >= 0 ? "+" : ""}${number(diff.estimate, digits)} ` +
    `[${number(diff.low, digits)}, ${number(diff.high, digits)}]${suffix}`;
}

function effectStatus(effect) {
  return effect.dataSufficient ? "確定" : "未確定（N<30）";
}

function caseKey(conditionId, curePolicy, scenarioId) {
  return `${conditionId}:${curePolicy}:${scenarioId}`;
}

function buildMarkdown(fullSummary, summarySha256) {
  const hasConditionCase = conditionId =>
    Boolean(fullSummary.cases[caseKey(
      conditionId,
      STATUS_CURE_POLICY_ORDER[0],
      SELECTED_SCENARIO_IDS[0]
    )]);
  const primaryCeilingId = hasConditionCase("ceiling-b3") ? "ceiling-b3" : "ceiling";
  const primaryCeilingStartFloor =
    Number(STATUS_CONDITIONS[primaryCeilingId]?.override?.startFloor) || STATUS_START_FLOOR;
  const ceilingCaseEntries = STATUS_CURE_POLICY_ORDER.flatMap(curePolicy =>
    SELECTED_SCENARIO_IDS.map(scenarioId => ({
      curePolicy,
      scenarioId,
      summary: fullSummary.cases[caseKey(primaryCeilingId, curePolicy, scenarioId)]
    }))
  );
  const ceilingSummaries = ceilingCaseEntries.map(entry => entry.summary);
  const ceilingProtectionEffects = ceilingSummaries.flatMap(summary => [
    summary.b5.protection.endpointEffects.reachedFloor,
    summary.b5.protection.endpointEffects.death,
    summary.b5.protection.endpointEffects.breakthrough
  ]);
  const ceilingProtectionDataSufficient = ceilingSummaries.every(summary =>
    summary.b5.protection.dataSufficient
  );
 const ceilingAllIntervalsCrossZero = ceilingProtectionEffects.every(effect =>
   effect.low <= 0 && effect.high >= 0
 );
  const endpointDefinitions = [
    ["reachedFloor", "到達floor"],
    ["death", "B5死亡"],
    ["breakthrough", "B5突破"]
  ];
  const ceilingNonCrossingDetails = ceilingCaseEntries.flatMap(entry =>
    endpointDefinitions
      .filter(([key]) => {
        const effect = entry.summary.b5.protection.endpointEffects[key];
        return effect.low > 0 || effect.high < 0;
      })
      .map(([, label]) =>
        entry.curePolicy + "/" + entry.scenarioId.replace("workshop-", "") + ":" + label
      )
  );
  const ceilingNonCrossingCells = new Set(
    ceilingCaseEntries
      .filter(entry => endpointDefinitions.some(([key]) => {
        const effect = entry.summary.b5.protection.endpointEffects[key];
        return effect.low > 0 || effect.high < 0;
      }))
      .map(entry => entry.curePolicy + "/" + entry.scenarioId)
  );
  const ceilingExposureSummaries = ceilingSummaries
    .map(summary => summary.exposure)
    .filter(Boolean);
  const ceilingExposureDataSufficient = ceilingExposureSummaries.length > 0 &&
    ceilingExposureSummaries.every(exposure => exposure.reachedN >= MIN_GROUP_N);
  const legacyCeilingCoreCases = hasConditionCase("ceiling") &&
    SELECTED_SCENARIO_IDS.includes("workshop-core-pools")
    ? STATUS_CURE_POLICY_ORDER.map(curePolicy =>
      fullSummary.cases[caseKey("ceiling", curePolicy, "workshop-core-pools")]
    )
    : [];
  const legacyCeilingJudgement = legacyCeilingCoreCases.length === 2
    ? "旧B6開始 ceiling は、core-poolsの適用階到達率が " +
      STATUS_CURE_POLICY_ORDER.map((curePolicy, index) =>
        curePolicy + " " + rateText(legacyCeilingCoreCases[index].exposure.reachedRate)
      ).join(" / ") +
      " に留まるため、全run endpoint差による耐性効果は判定不能。B6到達run条件付き値は記述的に併記する。"
    : "旧B6開始 ceiling は比較データ不足で判定不能。";
  const ceilingJudgement = !ceilingExposureDataSufficient
    ? `B${primaryCeilingStartFloor}開始 ceiling は適用階到達母数不足で判定不能`
    : !ceilingProtectionDataSufficient
      ? `B${primaryCeilingStartFloor}開始 ceiling は保護群のN不足で判定不能`
      : ceilingNonCrossingDetails.length === 0
        ? `B${primaryCeilingStartFloor}開始のtrue ceiling（深層通常遭遇を全てstatus化、statusChance=100%）でも、statusResistance / poisonWard 有群−両方なし群の職内centered endpoint差（深層到達floorを含む）は全${ceilingCaseEntries.length}セルで95% CIが0を跨いだ。質依存化は未観測だが、耐性の効果が無いと確定したわけではない。`
        : `B${primaryCeilingStartFloor}開始のtrue ceilingでは、${ceilingNonCrossingCells.size}/${ceilingCaseEntries.length}セルで少なくとも1つのendpoint差の95% CIが0を跨がなかった（${ceilingNonCrossingDetails.join("、")}）。この条件下のsim上の耐性群差は観測されたが、状態異常だけの因果効果とは確定せず、該当cellを中心に測定側も点検する。`;
  const ceilingMeasurementGuardrail = primaryCeilingId === "ceiling-b3" &&
    fullSummary.cases[caseKey("ceiling-b3", "never", "workshop-empty")]
    ? (() => {
      const summary = fullSummary.cases[caseKey("ceiling-b3", "never", "workshop-empty")];
      return "直感に反するcellの留保: B3 ceiling/never/empty は保護群−なし群が " +
        `Δ死亡 ${diffText(summary.b5.protection.endpointEffects.death)}、Δ突破 ${diffText(summary.b5.protection.endpointEffects.breakthrough)}。` +
        "これは耐性の逆効果と断定せず、群構成・seed・計測経路を先に点検する。";
    })()
    : "";
  const primaryCeilingCoreCases = hasConditionCase(primaryCeilingId) &&
    SELECTED_SCENARIO_IDS.includes("workshop-core-pools")
    ? STATUS_CURE_POLICY_ORDER.map(curePolicy =>
      fullSummary.cases[caseKey(primaryCeilingId, curePolicy, "workshop-core-pools")]
    )
    : [];
  const exposureComparison = legacyCeilingCoreCases.length === 2 &&
    primaryCeilingCoreCases.length === 2 &&
    primaryCeilingId !== "ceiling"
    ? STATUS_CURE_POLICY_ORDER.map((curePolicy, index) => {
      const legacy = legacyCeilingCoreCases[index];
      const primary = primaryCeilingCoreCases[index];
     const ratio = primary.status.statusApplicationsPerRun > 0
       ? legacy.status.statusApplicationsPerRun / primary.status.statusApplicationsPerRun
       : null;
      const legacyExposed = legacy.exposure.status?.statusApplicationsPerRun;
      const primaryExposed = primary.exposure.status?.statusApplicationsPerRun;
      const exposedRatio = primaryExposed > 0 ? legacyExposed / primaryExposed : null;
     return `${curePolicy}: B6 ceiling ${number(legacy.status.statusApplicationsPerRun)}/run ` +
       `vs B${primaryCeilingStartFloor} ceiling ${number(primary.status.statusApplicationsPerRun)}/run ` +
        `(B6/B${primaryCeilingStartFloor}=${percent(ratio)}); ` +
        `到達run条件付きは ${number(legacyExposed)}/run vs ${number(primaryExposed)}/run ` +
        `(B6/B${primaryCeilingStartFloor}=${percent(exposedRatio)})`;
    }).join("、")
    : "比較対象不足";
  const conditionStartFloor = condition =>
    Number(condition.override?.startFloor) || STATUS_START_FLOOR;
  const conditionIsCeiling = condition => Boolean(condition.override?.forceStatusChance);
  const formatStatusConditionDefinition = condition => {
    const startFloor = conditionStartFloor(condition);
    const chance = conditionIsCeiling(condition)
      ? "100%固定"
      : number(condition.chanceMultiplierAtMax, 2) + "x";
    const promotion = percent(condition.encounterProbabilityAtMax);
    const meaning = conditionIsCeiling(condition)
      ? "B" + startFloor + "以降、全通常遭遇にstatus持ち・付与率100%"
      : condition.id === "base"
        ? "overrideなし（現行）"
        : "B" + startFloor + "からB" + STATUS_END_FLOOR + "へ線形増加";
    return "| " + [condition.label, "B" + startFloor, chance, promotion, meaning].join(" | ") + " |";
  };
  const formatSweepRow = (condition, curePolicy, scenarioId, summary) => {
    const protection = summary.b5.protection;
    return "| " + [
      condition.id,
      curePolicy,
      scenarioId.replace("workshop-", ""),
      summary.b5.entrantsN,
      meanText(summary.averageReachedFloor),
      rateText(summary.b5.breakthroughRate),
      rateText(summary.b5.deathRate),
      "B" + summary.statusStartFloor,
      rateText(summary.status.deepStatusEncounterRate),
      number(summary.status.statusApplicationsPerRun),
      number(summary.status.statusCureItemsUsedPerRun),
      rateText(summary.status.statusCureDepletedRate),
      protection.matchedN + "/" + protection.unmatchedN,
      diffText(protection.endpointEffects.reachedFloor),
      diffText(protection.endpointEffects.death),
      diffText(protection.endpointEffects.breakthrough),
      rateText(protection.unmatchedSurvival),
      effectStatus(protection)
    ].join(" | ") + " |";
  };
  const lines = [
    "# Issue #271 Phase 2a: status depth-scaling ceiling",
    "",
    "## 結論の読み方",
    "",
    "Phase 2a は sim override のみ。`src/` は変更していない。主判定はB5開始時点の",
    "`statusResistance` または `poisonWard` 有群−両方なし群の職内centered endpoint差。",
    "深層が難化したかではなく、耐性有無で到達が分かれるかを判定する。CIが0を跨ぐ",
    "差は「未確定」とし、効果なし・結論反転とは書かない。",
    "",
    "## 天井判定",
    "",
   legacyCeilingJudgement,
   ceilingJudgement,
    ceilingMeasurementGuardrail,
   "",
    "## 曝露率監査",
    "",
    "条件付き分母は reachedFloor >= 適用開始階 のrun。旧B6 ceiling は全runの約7.6%しか適用階へ到達しないため、そのcell単独の全run値は判定材料にしない。",
    "workshop-core-pools status付与/run のB6 ceiling対true ceiling比率は次行に示す。全run値と適用階到達run条件付き値を併記する。true ceilingは深層通常遭遇を全てstatus化し、statusChance=100%に固定した上界条件。",
    `- ${exposureComparison}`,
    "",
   "## 測定条件",
    "",
    `- 実行: \`SIM_RUNS=${fullSummary.measurement.SIM_RUNS} SIM_CALIBRATION_RUNS=100 IDENTIFICATION_POLICY=powder FLEE_POLICY=threshold node scratch/sim_issue_271_status_depth_scaling.js\``,
    `- seed=${fullSummary.measurement.seed}、基本4職、target depth=${fullSummary.measurement.targetDepth}、SIM_PARALLELは未指定（解決値=${fullSummary.measurement.resolvedParallelism}）`,
    `- 主状態: \`workshop-core-pools\`。7シナリオ ${SELECTED_SCENARIO_IDS.length === ALL_SCENARIO_IDS.length ? "測定" : "pilot"}。`,
    `- cure policy: ${STATUS_CURE_POLICY_ORDER.join(" / ")}。smartはHP閾値0.35、merchant補充はmissing。`,
    `- 状態異常スケール適用帯: 条件定義表の開始階〜B${STATUS_END_FLOOR}通常遭遇。baseはoverrideなし。`,
    "- 状態異常持続/被害は深層 encounter diagnostic の実ログから集計。`statusActiveIncoming*` は状態開始後の被弾、`incapacitatedExtra*` は睡眠/麻痺中の被弾であり、因果効果の推定ではない。",
    "",
    "## N設計",
    "",
    `- 保守値: B5 entrant率 0.2305、statusResistance群率 0.089、poisonWard群率 0.013（旧実測）。`,
    `- statusResistanceの期待N=${number(fullSummary.nDesign.expectedStatusResistanceN, 1)}、poisonWardの期待N=${number(fullSummary.nDesign.expectedPoisonWardN, 1)}。`,
    `- ${fullSummary.nDesign.formula}。実測各cellの群Nを確認し、N<30は未確定扱い。`,
    "- 11,000 runは、poisonWard単独を最低N30へ近づけるための設計。CI幅や80% powerを保証する数字ではない。",
    "",
    "## status override の定義",
    "",
    "| 条件 | 開始階 | B20 statusChance倍率 | 通常遭遇 promotion | ceiling意味 |",
    "| --- | ---: | ---: | ---: | --- |",
    ...STATUS_CONDITION_DEFINITIONS.map(formatStatusConditionDefinition),
    "",
    "## 掃引表",
    "",
    "Δは耐性有−耐性なし。floorはB5 entrantの到達floor、括弧内95% CI。全run平均到達floorを別列に併記。",
    "",
    "| 条件 | cure | scenario | B5 N | 全run平均floor | B5突破率 | B5死亡率 | 開始階 | status遭遇率 | 付与回数/run | cure消費/run | 枯渇率 | 耐性N | Δfloor | Δ死亡 | Δ突破 | 耐性なし生存率 | 状態 |",
    "| --- | --- | --- | ---: | --- | --- | --- | --- | --- | ---: | ---: | --- | --- | --- | --- | --- | --- | --- |"
  ];
  for (const condition of STATUS_CONDITION_DEFINITIONS) {
    for (const curePolicy of STATUS_CURE_POLICY_ORDER) {
      for (const scenarioId of SELECTED_SCENARIO_IDS) {
        const summary = fullSummary.cases[caseKey(condition.id, curePolicy, scenarioId)];
        lines.push(formatSweepRow(condition, curePolicy, scenarioId, summary));
      }
    }
  }
  lines.push(
    "",
    "## 上位設計論点",
    "",
    "B3開始は、現行の全run平均到達floor（約B3.6）で状態異常の脅威を観測可能にするためのsim上の測定条件であり、ゲームの到達制約を意味しない。",
    "現行の到達帯で深層を定義するか、到達深度を先に上げるかは、#264/#275と接続する上位判断である。",
  );
  lines.push(
    "",
    "## 曝露率・条件付き状態指標",
    "",
    "条件付き分母は reachedFloor >= 適用開始階。付与/run、持続、被害はその分母で集計。全run値と条件付き値を並べ、到達帯でのtrue ceiling飽和を確認する。",
    "",
    "| 条件 | cure | scenario | 開始階 | 到達N | 曝露率 | 全run付与/run | 到達run付与/run | 持続/run | 失turn/run | 状態中damage/run | 毒damage/run | cure/run |",
    "| --- | --- | --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"
  );
  for (const condition of STATUS_CONDITION_DEFINITIONS.filter(item =>
    item.override?.forceStatusEncounter
  )) {
    for (const curePolicy of STATUS_CURE_POLICY_ORDER) {
      for (const scenarioId of SELECTED_SCENARIO_IDS) {
        const summary = fullSummary.cases[caseKey(condition.id, curePolicy, scenarioId)];
        const exposure = summary.exposure;
        const status = exposure.status;
        lines.push(
         `| ${condition.id} | ${curePolicy} | ${scenarioId.replace("workshop-", "")} | ${exposure.startFloor} | ${exposure.reachedN} | ${rateText(exposure.reachedRate)} | ${number(summary.status.statusApplicationsPerRun)} | ${number(status?.statusApplicationsPerRun)} | ${number(status?.statusDurationTurnsPerRun)} | ${number(status?.statusLostTurnsPerRun)} | ${number(status?.statusActiveIncomingDamagePerRun)} | ${number(status?.poisonDamagePerRun)} | ${number(status?.statusCureItemsUsedPerRun)} |`
       );
     }
   }
  }
  lines.push(
    "",
    "## 耐性種類別の再集計",
    "",
    "主表の合算群（statusResistance または poisonWard）を、個別の対策手段にも分解した。N<30 またはCIが0を跨ぐ差は、そのまま未確定として扱う。",
    "",
    "| 条件 | cure | scenario | 種別 | N | Δfloor | Δ死亡 | Δ突破 | 耐性なし生存率 | 状態 |",
    "| --- | --- | --- | --- | ---: | --- | --- | --- | --- | --- |"
  );
  for (const condition of STATUS_CONDITION_DEFINITIONS) {
    for (const curePolicy of STATUS_CURE_POLICY_ORDER) {
      for (const scenarioId of SELECTED_SCENARIO_IDS) {
        const summary = fullSummary.cases[caseKey(condition.id, curePolicy, scenarioId)];
        for (const [kind, label] of [
          ["statusResistance", "statusResistance"],
          ["poisonWard", "poisonWard"]
        ]) {
          const protection = summary.b5[kind];
          lines.push(
            `| ${condition.id} | ${curePolicy} | ${scenarioId.replace("workshop-", "")} | ${label} | ${protection.matchedN}/${protection.unmatchedN} | ${diffText(protection.endpointEffects.reachedFloor)} | ${diffText(protection.endpointEffects.death)} | ${diffText(protection.endpointEffects.breakthrough)} | ${rateText(protection.unmatchedSurvival)} | ${effectStatus(protection)} |`
          );
        }
      }
    }
  }
  lines.push(
    "",
    "## PR #445 baselineとの噛み合わせ再集計",
    "",
    "exact matching（core + #445対応support）を同じ職内centered差で再集計した。これは状態異常耐性群とは別の対照である。",
    "",
    "| 条件 | cure | scenario | matching N | Δfloor | Δ死亡 | Δ突破 | 状態 |",
    "| --- | --- | --- | ---: | --- | --- | --- | --- |"
  );
  for (const condition of STATUS_CONDITION_DEFINITIONS) {
    for (const curePolicy of STATUS_CURE_POLICY_ORDER) {
      for (const scenarioId of SELECTED_SCENARIO_IDS) {
        const summary = fullSummary.cases[caseKey(condition.id, curePolicy, scenarioId)];
        const matching = summary.b5.matching;
        lines.push(
          `| ${condition.id} | ${curePolicy} | ${scenarioId.replace("workshop-", "")} | ${matching.matchedN}/${matching.unmatchedN} | ${diffText(matching.endpointEffects.reachedFloor)} | ${diffText(matching.endpointEffects.death)} | ${diffText(matching.endpointEffects.breakthrough)} | ${effectStatus(matching)} |`
        );
      }
    }
  }
  lines.push(
    "",
    "## 状態異常の付与・持続・被害・消耗品",
    "",
    "数値は各case全run集計。付与回数は条件開始階〜B20 diagnostic log、消耗品はrun全体。",
    "",
    "| 条件 | cure | scenario | poison / blind / paralyze / sleep | 持続turn/run | 失ったturn/run | 状態中被弾hit/run | 状態中被弾damage/run | 睡眠/麻痺中hit/run | 毒damage/run | blind miss/run | cure unavailable/run |",
    "| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"
  );
  for (const condition of STATUS_CONDITION_DEFINITIONS) {
    for (const curePolicy of STATUS_CURE_POLICY_ORDER) {
      for (const scenarioId of SELECTED_SCENARIO_IDS) {
        const summary = fullSummary.cases[caseKey(condition.id, curePolicy, scenarioId)];
        const status = summary.status;
        lines.push(
          `| ${condition.id} | ${curePolicy} | ${scenarioId.replace("workshop-", "")} | ${STATUS_NAMES.map(name => status.statusApplications[name]).join(" / ")} | ${number(status.statusDurationTurnsPerRun)} | ${number(status.statusLostTurnsPerRun)} | ${number(status.statusActiveIncomingHitsPerRun)} | ${number(status.statusActiveIncomingDamagePerRun)} | ${number(status.incapacitatedExtraHitsPerRun)} | ${number(status.poisonDamagePerRun)} | ${number(status.blindMissesPerRun)} | ${number(status.statusCureUnavailableCount / summary.runs)} |`
        );
      }
    }
  }
  lines.push(
    "",
    "## 消耗品内訳",
    "",
    "消費数・取得数は各case全run合計。枯渇率は終了時に状態回復薬5種が全て0のrun割合。",
    "",
    "| 条件 | cure | scenario | 消費内訳 | 取得内訳 | 枯渇率 |",
    "| --- | --- | --- | --- | --- | --- |"
  );
  for (const condition of STATUS_CONDITION_DEFINITIONS) {
    for (const curePolicy of STATUS_CURE_POLICY_ORDER) {
      for (const scenarioId of SELECTED_SCENARIO_IDS) {
        const summary = fullSummary.cases[caseKey(condition.id, curePolicy, scenarioId)];
        lines.push(
          `| ${condition.id} | ${curePolicy} | ${scenarioId.replace("workshop-", "")} | ${JSON.stringify(summary.status.statusCureItemsUsed)} | ${JSON.stringify(summary.status.statusCureItemsAcquired)} | ${rateText(summary.status.statusCureDepletedRate)} |`
        );
      }
    }
  }
  lines.push(
    "",
    "## PR #445 baselineとの対比",
    "",
    "PR #445はbase/core-poolsのexact matching 9.5% [7.2,12.4]、職内差は突破 +8.5pp [-5.2,+22.2]、死亡 +1.4pp [-12.7,+15.4]、到達floor +6.6pp [-46.3,+59.4]で、いずれもCIが0を跨いだ。上の再集計表で、status条件によりこの対照差が動いたかを確認する。support供給やslotの上界条件は追加しない。B5突破/死亡はB6開始のstatus overrideより前の記述的対照で、statusの因果判定は深層到達floor・状態診断を中心に読む。",
    "",
    "## 出力監査",
    "",
    `- raw JSONL SHA-256: \`${fullSummary.measurement.rawSha256}\``,
    `- summary JSON SHA-256: \`${summarySha256}\``,
    `- calibration wall-clock: ${number(fullSummary.measurement.calibrationWallSeconds, 3)}s`,
    `- simulation wall-clock: ${number(fullSummary.measurement.wallClockSeconds, 3)}s`,
    `- total CPU: ${number(fullSummary.measurement.totalCpuSeconds, 3)}s (calibration + simulation)`,
    `- src変更: なし。生成run path: \`generateRunFloor\`→現行combat/reward/cure経路。`
  );
  return `${lines.join("\n")}\n`;
}

async function main() {
  const scenarios = {};
  const scoringProfiles = {};
  const calibrationStarted = performance.now();
  const calibrationCpuStart = process.cpuUsage();
  for (const condition of STATUS_CONDITION_DEFINITIONS) {
    for (const curePolicy of STATUS_CURE_POLICY_ORDER) {
      for (const scenarioId of SELECTED_SCENARIO_IDS) {
        const key = caseKey(condition.id, curePolicy, scenarioId);
        const scenario = buildScenario(scenarioId, condition, curePolicy);
        scenarios[key] = scenario;
        resetSimulationRandom(SEED);
        scoringProfiles[key] = calibrateCoreScoringProfile(
          CALIBRATION_RUNS,
          scenario,
          "powder",
          scenario.workshop
        );
      }
    }
  }
  const calibrationCpu = process.cpuUsage(calibrationCpuStart);
  const calibrationWallSeconds = (performance.now() - calibrationStarted) / 1000;

  const tasks = STATUS_CONDITION_DEFINITIONS.flatMap(condition =>
    STATUS_CURE_POLICY_ORDER.flatMap(curePolicy =>
      SELECTED_SCENARIO_IDS.flatMap(scenarioId =>
        Array.from({ length: RUNS }, (_, runIndex) => ({
          conditionId: condition.id,
          curePolicy,
          scenarioId,
          runIndex,
          className: CLASS_NAMES[runIndex % CLASS_NAMES.length]
        }))
      )
    )
  );
  const resolvedParallelism = resolveSimParallelism(tasks.length);
  const startedWall = performance.now();
  const startedCpu = process.cpuUsage();
  const rows = await runSimTasks({
    moduleUrl: pathToFileURL(fileURLToPath(import.meta.url)).href,
    exportName: "runStatusDepthScalingTask",
    runTask: runStatusDepthScalingTask,
    tasks,
    context: {
      seed: SEED,
      scenarios,
      scoringProfiles
    }
  });
  const runCpu = process.cpuUsage(startedCpu);
  const wallClockSeconds = (performance.now() - startedWall) / 1000;
  const duplicateKeys = rows.length - new Set(
    rows.map(row => `${row.conditionId}:${row.curePolicy}:${row.scenarioId}:${row.runIndex}:${row.className}`)
  ).size;
  if (rows.length !== tasks.length || duplicateKeys !== 0) {
    throw new Error(
      `raw result audit failed: rows=${rows.length}/${tasks.length}, duplicates=${duplicateKeys}`
    );
  }

  const cases = {};
  for (const condition of STATUS_CONDITION_DEFINITIONS) {
    for (const curePolicy of STATUS_CURE_POLICY_ORDER) {
      for (const scenarioId of SELECTED_SCENARIO_IDS) {
        const key = caseKey(condition.id, curePolicy, scenarioId);
        cases[key] = summarizeScenario(rows.filter(row =>
          row.conditionId === condition.id &&
          row.curePolicy === curePolicy &&
          row.scenarioId === scenarioId
        ));
      }
    }
  }

  const resultDir = join(process.cwd(), "scratch", "results");
  mkdirSync(resultDir, { recursive: true });
  const runLabel = STATUS_CONDITION_DEFINITIONS.map(condition => condition.id).join("-");
  const cureLabel = STATUS_CURE_POLICY_ORDER.join("-");
  const rawPath = join(resultDir, `issue-271-status-depth-scaling-${runLabel}-${cureLabel}.jsonl`);
  const summaryPath = join(resultDir, `issue-271-status-depth-scaling-${runLabel}-${cureLabel}.json`);
  const reportPath = join(resultDir, "issue-271-status-depth-scaling.md");
  const rawSha256 = writeRawRows(rawPath, rows);
  const cpuTotalSeconds = (
    calibrationCpu.user + calibrationCpu.system + runCpu.user + runCpu.system
  ) / 1e6;
  const measurement = {
    issue: 271,
    phase: "2a",
    seed: SEED,
    SIM_RUNS: RUNS,
    SIM_CALIBRATION_RUNS: CALIBRATION_RUNS,
    SIM_PARALLEL: "未指定",
    resolvedParallelism,
    availableParallelism: availableParallelism(),
    identificationPolicy: process.env.IDENTIFICATION_POLICY,
    fleePolicy: process.env.FLEE_POLICY,
    fleeHpThreshold: FLEE_HP_THRESHOLD,
    statusCurePolicies: STATUS_CURE_POLICY_ORDER,
    statusConditions: STATUS_CONDITION_DEFINITIONS.map(condition => condition.id),
    scenarios: SELECTED_SCENARIO_IDS,
    classes: CLASS_NAMES,
    targetDepth: TARGET_DEPTH,
    calibrationWallSeconds,
    wallClockSeconds,
    calibrationCpuSeconds: (calibrationCpu.user + calibrationCpu.system) / 1e6,
    simulationCpuSeconds: (runCpu.user + runCpu.system) / 1e6,
    totalCpuSeconds: cpuTotalSeconds,
    rawSha256,
    rawPath: rawPath.replace(`${process.cwd()}/`, "")
  };
  const nDesign = {
    b5EntrantRate: 507 / 2200,
    statusResistanceRate: 194 / 2194,
    poisonWardRate: 29 / 2188,
    expectedStatusResistanceN: RUNS * (507 / 2200) * (194 / 2194),
    expectedPoisonWardN: RUNS * (507 / 2200) * (29 / 2188),
    targetPrimaryGroupN: 100,
    targetPoisonWardN: 30,
    formula: "ceil(30 / (0.2305 × 0.013)) = 10,012 → 11,000 run"
  };
  const fullSummary = {
    measurement,
    nDesign,
    statusConditions: STATUS_CONDITION_DEFINITIONS.map(condition => ({
      id: condition.id,
      label: condition.label,
      startFloor: Number(condition.override?.startFloor) || STATUS_START_FLOOR,
      endFloor: STATUS_END_FLOOR,
      chanceMultiplierAtMax: condition.chanceMultiplierAtMax,
      encounterProbabilityAtMax: condition.encounterProbabilityAtMax,
      ceiling: Boolean(condition.override?.forceStatusChance)
    })),
    cases
  };
  const summaryText = `${JSON.stringify(fullSummary, null, 2)}\n`;
  writeFileSync(summaryPath, summaryText);
  const summarySha256 = sha256(summaryText);
  writeFileSync(reportPath, buildMarkdown(fullSummary, summarySha256));

  console.log(JSON.stringify({
    reportPath: reportPath.replace(`${process.cwd()}/`, ""),
    summaryPath: summaryPath.replace(`${process.cwd()}/`, ""),
    rawPath: rawPath.replace(`${process.cwd()}/`, ""),
    rawSha256,
    summarySha256,
    measurement,
    nDesign,
    cases: Object.fromEntries(Object.entries(cases).map(([key, summary]) => [key, {
      b5Entrants: summary.b5.entrantsN,
      averageReachedFloor: summary.averageReachedFloor,
      b5Breakthrough: rateText(summary.b5.breakthroughRate),
      b5Death: rateText(summary.b5.deathRate),
      deepStatusEncounter: rateText(summary.status.deepStatusEncounterRate),
      statusApplicationsPerRun: summary.status.statusApplicationsPerRun,
      statusCureItemsUsedPerRun: summary.status.statusCureItemsUsedPerRun,
      statusCureDepleted: rateText(summary.status.statusCureDepletedRate),
      protectionN: `${summary.b5.protection.matchedN}/${summary.b5.protection.unmatchedN}`,
      protectionDeltaFloor: diffText(summary.b5.protection.endpointEffects.reachedFloor),
      protectionDeltaDeath: diffText(summary.b5.protection.endpointEffects.death),
      protectionDeltaBreakthrough: diffText(summary.b5.protection.endpointEffects.breakthrough),
      protectionStatus: effectStatus(summary.b5.protection),
      matchingDeltaFloor: diffText(summary.b5.matching.endpointEffects.reachedFloor),
      matchingDeltaDeath: diffText(summary.b5.matching.endpointEffects.death),
      matchingDeltaBreakthrough: diffText(summary.b5.matching.endpointEffects.breakthrough)
    }]))
  }, null, 2));
}

if (isMainThread) {
  if (process.env.STATUS_REPORT_ONLY) {
    const summaryPath = join(process.cwd(), process.env.STATUS_REPORT_ONLY);
    const summaryText = readFileSync(summaryPath, "utf8");
    const fullSummary = JSON.parse(summaryText);
    const reportPath = join(process.cwd(), "scratch", "results", "issue-271-status-depth-scaling.md");
    writeFileSync(reportPath, buildMarkdown(fullSummary, sha256(summaryText)));
    console.log("report regenerated from " + process.env.STATUS_REPORT_ONLY);
  } else {
    await main();
  }
}
