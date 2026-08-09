// sim-scope: run
// Issue #271 Phase 2a: race-biased threat ceiling measurement.

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
const RACE_START_FLOOR = 3;
const RACE_END_FLOOR = 20;
const RACE_TARGET = String(process.env.RACE_TARGET || "undead").trim().toLowerCase();
const RACE_AFFIX_BY_TARGET = Object.freeze({
  beast: "antiBeast",
  spirit: "antiSpirit",
  undead: "antiUndead",
  dragon: "antiDragon",
  demon: "antiDemon"
});
const RACE_LABEL_BY_TARGET = Object.freeze({
  beast: "獣",
  spirit: "霊",
  undead: "不死",
  dragon: "竜",
  demon: "悪魔"
});
if (!Object.hasOwn(RACE_AFFIX_BY_TARGET, RACE_TARGET)) {
  throw new Error(`RACE_TARGET must be beast|spirit|undead|dragon|demon: ${RACE_TARGET}`);
}
const RACE_AFFIX = RACE_AFFIX_BY_TARGET[RACE_TARGET];
const RACE_LABEL = RACE_LABEL_BY_TARGET[RACE_TARGET];
function readRaceDifficultyMultiplier(name) {
  const value = process.env[name] === undefined ? 1 : Number(process.env[name]);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number: ${process.env[name]}`);
  }
  return value;
}
const NO_RACE_DIFFICULTY = Object.freeze({
  hpMultiplier: 1,
  atkMultiplier: 1,
  defMultiplier: 1
});
const RACE_DIFFICULTY = Object.freeze({
  hpMultiplier: readRaceDifficultyMultiplier("RACE_HP_MULTIPLIER"),
  atkMultiplier: readRaceDifficultyMultiplier("RACE_ATK_MULTIPLIER"),
  defMultiplier: readRaceDifficultyMultiplier("RACE_DEF_MULTIPLIER")
});
const STATUS_START_FLOOR = RACE_START_FLOOR;
const STATUS_END_FLOOR = RACE_END_FLOOR;
const B5 = 5;
const TARGET_DEPTH = 21;
const R95 = 1.959963984540054;
const MIN_GROUP_N = 30;
const CALIBRATION_POINT_TOLERANCE = 0.04;
const N_DESIGN_B5_ENTRANT_RATE = 507 / 2200;
const N_DESIGN_RACE_AFFIX_RATE = 0.01;
const N_DESIGN_REQUIRED_RUNS = Math.ceil(
  MIN_GROUP_N / (N_DESIGN_B5_ENTRANT_RATE * N_DESIGN_RACE_AFFIX_RATE)
);
const N_DESIGN_PLANNED_RUNS = Math.ceil(N_DESIGN_REQUIRED_RUNS / 1000) * 1000;

const STATUS_CONDITIONS = Object.freeze({
  base: Object.freeze({
    id: "base",
    label: "base（現行）",
    override: Object.freeze({
      targetRace: RACE_TARGET,
      affixType: RACE_AFFIX,
      startFloor: RACE_START_FLOOR,
      endFloor: RACE_END_FLOOR,
      poolBias: 0,
      antiEffectMultiplier: 1,
      ...NO_RACE_DIFFICULTY
    }),
    poolBias: 0,
    antiEffectMultiplier: 1,
    raceDifficulty: NO_RACE_DIFFICULTY
  }),
  "pool-half-current": Object.freeze({
    id: "pool-half-current",
    label: `${RACE_LABEL}偏重 50%（現行効果）`,
    override: Object.freeze({
      targetRace: RACE_TARGET,
      affixType: RACE_AFFIX,
      startFloor: RACE_START_FLOOR,
      endFloor: RACE_END_FLOOR,
      poolBias: 0.5,
      antiEffectMultiplier: 1,
      ...NO_RACE_DIFFICULTY
    }),
    poolBias: 0.5,
    antiEffectMultiplier: 1,
    raceDifficulty: NO_RACE_DIFFICULTY
  }),
  "pool-ceiling-current": Object.freeze({
    id: "pool-ceiling-current",
    label: `${RACE_LABEL}偏重 100%（現行効果）`,
    override: Object.freeze({
      targetRace: RACE_TARGET,
      affixType: RACE_AFFIX,
      startFloor: RACE_START_FLOOR,
      endFloor: RACE_END_FLOOR,
      poolBias: 1,
      forceRaceEncounter: true,
      antiEffectMultiplier: 1,
      ...NO_RACE_DIFFICULTY
    }),
    poolBias: 1,
    antiEffectMultiplier: 1,
    raceDifficulty: NO_RACE_DIFFICULTY
  }),
  "effect-strong-natural": Object.freeze({
    id: "effect-strong-natural",
    label: `${RACE_LABEL}有利 5x（現行遭遇）`,
    override: Object.freeze({
      targetRace: RACE_TARGET,
      affixType: RACE_AFFIX,
      startFloor: RACE_START_FLOOR,
      endFloor: RACE_END_FLOOR,
      poolBias: 0,
      antiEffectMultiplier: 5,
      ...NO_RACE_DIFFICULTY
    }),
    poolBias: 0,
    antiEffectMultiplier: 5,
    raceDifficulty: NO_RACE_DIFFICULTY
  }),
  upper: Object.freeze({
    id: "upper",
    label: `${RACE_LABEL}偏重 100% × 有利 5x × 難易度校正（上界）`,
    override: Object.freeze({
      targetRace: RACE_TARGET,
      affixType: RACE_AFFIX,
      startFloor: RACE_START_FLOOR,
      endFloor: RACE_END_FLOOR,
      poolBias: 1,
      forceRaceEncounter: true,
      antiEffectMultiplier: 5,
      ...RACE_DIFFICULTY
    }),
    poolBias: 1,
    antiEffectMultiplier: 5,
    raceDifficulty: RACE_DIFFICULTY
  })
});
const STATUS_CONDITION_ORDER = Object.freeze([
  "base",
  "pool-half-current",
  "pool-ceiling-current",
  "effect-strong-natural",
  "upper"
]);
const REQUESTED_SCENARIOS = String(
  process.env.RACE_SCENARIOS || ALL_SCENARIO_IDS.join(",")
).split(",").map(value => value.trim()).filter(Boolean);
const REQUESTED_CONDITIONS = String(
  process.env.RACE_CONDITIONS || STATUS_CONDITION_ORDER.join(",")
).split(",").map(value => value.trim()).filter(Boolean);
const CURE_POLICIES = String(
  process.env.STATUS_CURE_POLICIES || "smart,never"
).split(",").map(value => value.trim()).filter(Boolean);

const ENV_DEFAULTS = Object.freeze({
  SIM_SEED: "271",
  SIM_RUNS: String(N_DESIGN_PLANNED_RUNS),
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
  throw new Error(`unknown RACE_SCENARIOS: ${REQUESTED_SCENARIOS.join(",")}`);
}
if (!REQUESTED_CONDITIONS.length || REQUESTED_CONDITIONS.some(id => !STATUS_CONDITION_ORDER.includes(id))) {
  throw new Error(`unknown RACE_CONDITIONS: ${REQUESTED_CONDITIONS.join(",")}`);
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
  { CORE_AFFIXES, SUPPORT_AFFIXES },
  { MONSTERS }
] = await Promise.all([
  import("./sim_depth_material_ev.js"),
  import("../src/data/affixes.js"),
  import("../src/data/monsters.js")
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
const SOURCE_RACE_TAG_COUNTS = Object.fromEntries(
  Object.keys(RACE_AFFIX_BY_TARGET).map(race => [
    race,
    MONSTERS.filter(monster => monster.tags?.includes(race)).length
  ])
);
const TASK_NOTE_RACE_TAG_COUNTS = Object.freeze({
  beast: 13,
  spirit: 21,
  undead: 10,
  dragon: 15,
  demon: 8
});
const SOURCE_RACE_TAG_COUNT_MISMATCHES = Object.entries(TASK_NOTE_RACE_TAG_COUNTS)
  .filter(([race, count]) => SOURCE_RACE_TAG_COUNTS[race] !== count)
  .map(([race, taskCount]) => `${race} ${taskCount}→${SOURCE_RACE_TAG_COUNTS[race]}`);

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

function collectRaceDiagnostics(result, raceStartFloor, targetRace, affixType) {
  let normalEncounterCount = 0;
  let targetEncounterCount = 0;
  let normalMonsterCount = 0;
  let targetMonsterCount = 0;
  let targetActionCount = 0;
  let antiEffectActionCount = 0;
  let antiDefenseReductionCount = 0;
  const encounters = result.diagnostics?.encounters || [];
  encounters
    .filter(encounter => encounter.type === "normal" && encounter.floor >= raceStartFloor)
    .forEach(encounter => {
      normalEncounterCount++;
      normalMonsterCount += encounter.monsters.length;
      const targetMonsters = encounter.monsters.filter(monster =>
        monster.tags?.includes(targetRace)
      );
      targetMonsterCount += targetMonsters.length;
      if (targetMonsters.length > 0) targetEncounterCount++;
      encounter.rounds.forEach(round => {
        if (round.raceTargeted) {
          targetActionCount++;
          if (Number(round.raceAffixValueBefore) > 0) antiEffectActionCount++;
        }
        if (targetRace === "dragon") {
          antiDefenseReductionCount += round.log.filter(message =>
            message.includes("竜殺し")
          ).length;
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
    targetActionCount,
    antiEffectActionCount,
    antiDefenseReductionCount
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
    effectiveAffixes: { ...(snapshot.effectiveAffixes || {}) },
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

function getRaceAffixValue(snapshot) {
  return Number(snapshot?.effectiveAffixes?.[RACE_AFFIX] || 0);
}

function hasRaceAffix(snapshot) {
  return getRaceAffixValue(snapshot) > 0;
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
    b5RaceAffixValue: getRaceAffixValue(b5),
    b5HasRaceAffix: hasRaceAffix(b5),
    b5Death: Boolean(b5 && result.died && result.deathFloor === B5),
    b5Breakthrough: Boolean(b5 && b6),
    statusStartFloor,
    status: collectStatusDiagnostics(result, statusStartFloor),
    race: collectRaceDiagnostics(result, statusStartFloor, RACE_TARGET, RACE_AFFIX)
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
    statusScalingOverride: null,
    raceBiasOverride: condition.override
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
  const statusStartFloor = Number(scenario.raceBiasOverride?.startFloor) || RACE_START_FLOOR;
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

function summarizeRace(rows) {
  const normalEncounterCount = sumStatusRows(rows, row => row.race.normalEncounterCount);
  const targetEncounterCount = sumStatusRows(rows, row => row.race.targetEncounterCount);
  const normalMonsterCount = sumStatusRows(rows, row => row.race.normalMonsterCount);
  const targetMonsterCount = sumStatusRows(rows, row => row.race.targetMonsterCount);
  return {
    normalEncounterCount,
    targetEncounterCount,
    targetEncounterRate: wilson(targetEncounterCount, normalEncounterCount),
    normalMonsterCount,
    targetMonsterCount,
    targetMonsterRate: wilson(targetMonsterCount, normalMonsterCount),
    targetEncounterPerRun: targetEncounterCount / rows.length,
    targetMonsterPerRun: targetMonsterCount / rows.length,
    targetActionCount: sumStatusRows(rows, row => row.race.targetActionCount),
    targetActionPerRun: sumStatusRows(rows, row => row.race.targetActionCount) / rows.length,
    antiEffectActionCount: sumStatusRows(rows, row => row.race.antiEffectActionCount),
    antiEffectActionPerRun:
      sumStatusRows(rows, row => row.race.antiEffectActionCount) / rows.length,
    antiDefenseReductionCount:
      sumStatusRows(rows, row => row.race.antiDefenseReductionCount),
    antiDefenseReductionPerRun:
      sumStatusRows(rows, row => row.race.antiDefenseReductionCount) / rows.length
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
  const statusStartFloor = Number(rows[0]?.statusStartFloor) || RACE_START_FLOOR;
  const exposedRows = rows.filter(row => row.reachedFloor >= statusStartFloor);
  const raceProtection = summarizeProtection(entrants, row => row.b5HasRaceAffix);
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
      raceProtection,
      protection,
      statusResistance,
      poisonWard,
      matching
    },
    averageReachedFloor: meanInterval(rows.map(row => row.reachedFloor)),
    survivalRate: wilson(rows.filter(row => !row.died).length, rows.length),
    race: summarizeRace(rows),
    raceExposure: {
      startFloor: statusStartFloor,
      reachedN: exposedRows.length,
      reachedRate: wilson(exposedRows.length, rows.length),
      allRun: summarizeRace(rows),
      reachedRun: exposedRows.length ? summarizeRace(exposedRows) : null
    },
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
  const primaryCeilingId = hasConditionCase("upper") ? "upper" : "pool-ceiling-current";
  const primaryCeilingStartFloor =
    Number(STATUS_CONDITIONS[primaryCeilingId]?.override?.startFloor) || RACE_START_FLOOR;
  const ceilingCaseEntries = STATUS_CURE_POLICY_ORDER.flatMap(curePolicy =>
    SELECTED_SCENARIO_IDS.map(scenarioId => ({
      curePolicy,
      scenarioId,
      summary: fullSummary.cases[caseKey(primaryCeilingId, curePolicy, scenarioId)]
    }))
  );
  const ceilingSummaries = ceilingCaseEntries.map(entry => entry.summary);
  const ceilingProtectionDataSufficient = ceilingSummaries.every(summary =>
    summary.b5.raceProtection.dataSufficient
  );
  const endpointDefinitions = [
    ["reachedFloor", "到達floor"],
    ["death", "B5死亡"],
    ["breakthrough", "B5突破"]
  ];
  const comparisonCellCount =
    STATUS_CONDITION_DEFINITIONS.length *
    STATUS_CURE_POLICY_ORDER.length *
    SELECTED_SCENARIO_IDS.length;
  const comparisonTestCount = comparisonCellCount * endpointDefinitions.length;
  const expectedFalsePositives = comparisonTestCount * 0.05;
  const ceilingNonCrossingDetails = ceilingCaseEntries.flatMap(entry =>
    endpointDefinitions
      .filter(([key]) => {
        const effect = entry.summary.b5.raceProtection.endpointEffects[key];
        return effect.low > 0 || effect.high < 0;
      })
      .map(([, label]) =>
        entry.curePolicy + "/" + entry.scenarioId.replace("workshop-", "") + ":" + label
      )
  );
  const ceilingNonCrossingCells = new Set(
    ceilingCaseEntries
      .filter(entry => endpointDefinitions.some(([key]) => {
        const effect = entry.summary.b5.raceProtection.endpointEffects[key];
        return effect.low > 0 || effect.high < 0;
      }))
      .map(entry => entry.curePolicy + "/" + entry.scenarioId)
  );
  const ceilingExposureSummaries = ceilingSummaries
    .map(summary => summary.raceExposure)
    .filter(Boolean);
  const ceilingExposureDataSufficient = ceilingExposureSummaries.length > 0 &&
    ceilingExposureSummaries.every(exposure => exposure.reachedN >= MIN_GROUP_N);
  const coreCalibrationRows = hasConditionCase("base") && hasConditionCase("upper") &&
    SELECTED_SCENARIO_IDS.includes("workshop-core-pools")
    ? STATUS_CURE_POLICY_ORDER.map(curePolicy => {
      const base = fullSummary.cases[caseKey("base", curePolicy, "workshop-core-pools")];
      const upper = fullSummary.cases[caseKey("upper", curePolicy, "workshop-core-pools")];
      const baseRate = base.b5.raceProtection.unmatchedSurvival;
      const upperRate = upper.b5.raceProtection.unmatchedSurvival;
      return {
        curePolicy,
        base,
        upper,
        baseRate,
        upperRate,
        delta: upperRate.estimate - baseRate.estimate,
        intervalsOverlap: upperRate.low <= baseRate.high && baseRate.low <= upperRate.high
      };
    })
    : [];
  const coreCalibrationDataSufficient = coreCalibrationRows.length === STATUS_CURE_POLICY_ORDER.length &&
    coreCalibrationRows.every(row =>
      row.baseRate.trials >= MIN_GROUP_N &&
      row.upperRate.trials >= MIN_GROUP_N
    );
  const coreCalibrationPass = coreCalibrationDataSufficient && coreCalibrationRows.every(row =>
    Math.abs(row.delta) <= CALIBRATION_POINT_TOLERANCE && row.intervalsOverlap
  );
  const legacyCeilingJudgement = "base（現行）は対照。上界はB3開始・全通常遭遇単一種族・anti-X効果5xに、敵hp/atk/defの固定倍率を加えてbase難易度へ校正した。";
  const ceilingJudgement = !ceilingExposureDataSufficient
      ? `B${primaryCeilingStartFloor}開始上界は適用階到達母数不足で判定不能`
    : !ceilingProtectionDataSufficient
      ? `B${primaryCeilingStartFloor}開始上界は${RACE_AFFIX}群のN不足で判定不能`
    : !coreCalibrationPass
      ? `上界の難易度校正が未成立（core-poolsの${RACE_AFFIX}なし群でbaseとの一致条件を満たさない）ため、耐性有無のendpoint差は判定対象外`
      : ceilingNonCrossingDetails.length === 0
        ? `難易度校正済み上界でも、${RACE_AFFIX}有群−なし群の職内centered endpoint差（深層到達floorを含む）は全${ceilingCaseEntries.length}セルで95% CIが0を跨いだ。質依存化はsim上で未観測だが、効果なしと確定したわけではない。打ち切り条件に従い、中間条件の掃引は実施しない。`
        : `難易度校正済み上界では、${ceilingNonCrossingCells.size}/${ceilingCaseEntries.length}セルで少なくとも1つのendpoint差の95% CIが0を跨がなかった（${ceilingNonCrossingDetails.join("、")}）。この条件下のsim上の群差は観測されたが、種族偏重だけの因果効果とは確定せず、測定側を点検する。`;
  const exposureConditionIds = ["base", primaryCeilingId];
  const exposureComparison = hasConditionCase(primaryCeilingId) &&
    hasConditionCase("base") && SELECTED_SCENARIO_IDS.includes("workshop-core-pools")
    ? exposureConditionIds.flatMap(conditionId => STATUS_CURE_POLICY_ORDER.map(curePolicy => {
      const primary = fullSummary.cases[caseKey(conditionId, curePolicy, "workshop-core-pools")];
      const reached = primary.raceExposure.reachedRun;
      return `${conditionId}/${curePolicy}: ${RACE_LABEL}遭遇 ${number(primary.race.targetEncounterPerRun)}/run ` +
        `（遭遇率 ${rateText(primary.race.targetEncounterRate)}、monster率 ${rateText(primary.race.targetMonsterRate)}）、` +
        `種族monster ${number(primary.race.targetMonsterPerRun)}/run、` +
        `適用階到達率 ${rateText(primary.raceExposure.reachedRate)}、` +
        `到達run条件付き遭遇 ${number(reached?.targetEncounterPerRun)}/run、` +
        `monster ${number(reached?.targetMonsterPerRun)}/run、` +
        `anti-X対象攻撃 ${number(primary.race.antiEffectActionPerRun)}/run`;
    })).join("、")
    : "比較対象不足";
  const conditionStartFloor = condition =>
    Number(condition.override?.startFloor) || RACE_START_FLOOR;
  const conditionIsCeiling = condition => Boolean(condition.override?.forceRaceEncounter);
  const formatRaceConditionDefinition = condition => {
    const startFloor = conditionStartFloor(condition);
    const poolBias = percent(condition.poolBias);
    const effectMultiplier = number(condition.antiEffectMultiplier, 1) + "x";
    const difficulty = condition.raceDifficulty || NO_RACE_DIFFICULTY;
    const meaning = conditionIsCeiling(condition)
      ? "B" + startFloor + "以降、通常遭遇を全て" + RACE_LABEL + "化"
      : condition.id === "base"
        ? "overrideなし（現行）"
        : "B" + startFloor + "以降、指定確率で" + RACE_LABEL + "化";
    return "| " + [condition.label, "B" + startFloor, poolBias, effectMultiplier,
      number(difficulty.hpMultiplier, 2) + "x",
      number(difficulty.atkMultiplier, 2) + "x",
      number(difficulty.defMultiplier, 2) + "x",
      meaning].join(" | ") + " |";
  };
  const formatSweepRow = (condition, curePolicy, scenarioId, summary) => {
    const protection = summary.b5.raceProtection;
    const reached = summary.raceExposure.reachedRun;
    return "| " + [
      condition.id,
      curePolicy,
      scenarioId.replace("workshop-", ""),
      summary.b5.entrantsN,
      meanText(summary.averageReachedFloor),
      rateText(summary.b5.breakthroughRate),
      rateText(summary.b5.deathRate),
      "B" + summary.statusStartFloor,
      rateText(summary.raceExposure.reachedRate),
      rateText(summary.race.targetEncounterRate),
      rateText(summary.race.targetMonsterRate),
      number(summary.race.targetEncounterPerRun),
      number(reached?.targetEncounterPerRun),
      number(summary.race.targetMonsterPerRun),
      number(reached?.targetMonsterPerRun),
      number(summary.race.antiEffectActionPerRun),
      number(summary.race.antiDefenseReductionPerRun),
      protection.matchedN + "/" + protection.unmatchedN,
      diffText(protection.endpointEffects.reachedFloor),
      diffText(protection.endpointEffects.death),
      diffText(protection.endpointEffects.breakthrough),
      rateText(protection.unmatchedSurvival),
      effectStatus(protection)
    ].join(" | ") + " |";
  };
  const formatCalibrationRow = row => "| " + [
    row.curePolicy,
    rateText(row.baseRate),
    rateText(row.upperRate),
    `${row.delta >= 0 ? "+" : ""}${percent(row.delta)}`,
    row.intervalsOverlap ? "重なる" : "重ならない"
  ].join(" | ") + " |";
  const lines = [
    "# Issue #271 Phase 2a: race-biased threat ceiling",
    "",
    "## 曝露率監査",
    "",
    "適用階はB3。分母を全runとB3到達runに分け、種族遭遇回数・種族モンスター率・anti-X対象攻撃回数を併記する。",
    `- 主状態 \`workshop-core-pools\` 上界: ${exposureComparison}`,
    "",
    "## 難易度校正",
    "",
    "前回PR #451の未校正 upper は、種族プールだけを100%不死化した条件だった。これはendpointの因果比較には使わず、プール構成が難易度を変える事実として残す。",
    "",
    "| 指標 | base smart | 未校正 upper smart | base never | 未校正 upper never |",
    "| --- | --- | --- | --- | --- |",
    "| B5死亡率 | 29.3% [27.7,30.9] | 18.4% [17.0,19.9] | 30.5% [29.0,32.2] | 17.3% [16.0,18.8] |",
    "| B5突破率 | 33.5% [31.9,35.2] | 49.8% [48.0,51.6] | 32.4% [30.8,34.0] | 49.5% [47.6,51.3] |",
    "| 全run平均floor | 3.57 [3.54,3.61] | 3.78 [3.74,3.82] | 3.53 [3.50,3.57] | 3.75 [3.70,3.79] |",
    "| 耐性なし生存率 | 76.8% [74.8,78.8] | 88.9% [86.9,90.6] | 76.3% [74.2,78.2] | 88.3% [86.4,90.1] |",
    "",
    "baseの種族遭遇率16.1%・種族monster率9.3%を、未校正 upper でともに100%へ振ると、smartのB5死亡率は10.9pt（約11pt）、neverは13.2pt下がった。これは不死が他種族より弱く、遭遇プール自体が易しくなった観測であり、「耐性の効果なし」ではない。",
    "",
    "今回の upper は不死偏重100%・anti-X 5xを維持し、通常遭遇の置換後に敵 hp/atk/def を固定倍率で再スケールした。cure policyや耐性有無では倍率を変えていない。",
    "",
    "| cure | baseの耐性なし生存率 | 校正済み upperの耐性なし生存率 | upper−base | 95% CIの重なり |",
    "| --- | --- | --- | ---: | --- |",
    ...coreCalibrationRows.map(formatCalibrationRow),
    `- 校正判定: ${coreCalibrationPass ? "成立（点推定差の絶対値4pt以内、かつ95% CIが重なる）" : "未成立。endpoint判定は行わない。"}。N<30の行は未確定。`,
    "",
    "## 結論の読み方",
    "",
    "Phase 2a は sim override のみ。`src/` は変更していない。主判定はB5開始時点の",
    `\`${RACE_AFFIX}\` 有群−なし群の職内centered endpoint差。深層が難化したかではなく、ビルド構成で生死が分かれるかを判定する。`,
    "CIが0を跨ぐ差は未確定。母数不足を効果なしと扱わない。",
    "",
    "## 天井判定",
    "",
    legacyCeilingJudgement,
    ceilingJudgement,
    "",
    "## 測定条件",
    "",
    `- 実行: \`SIM_RUNS=${fullSummary.measurement.SIM_RUNS} SIM_CALIBRATION_RUNS=100 IDENTIFICATION_POLICY=powder FLEE_POLICY=threshold RACE_HP_MULTIPLIER=${number(fullSummary.measurement.raceDifficulty.hpMultiplier)} RACE_ATK_MULTIPLIER=${number(fullSummary.measurement.raceDifficulty.atkMultiplier)} RACE_DEF_MULTIPLIER=${number(fullSummary.measurement.raceDifficulty.defMultiplier)} node scratch/sim_issue_271_status_depth_scaling.js\``,
    `- seed=${fullSummary.measurement.seed}、基本4職、target depth=${fullSummary.measurement.targetDepth}、SIM_PARALLELは未指定（解決値=${fullSummary.measurement.resolvedParallelism}）`,
    `- 主状態: \`workshop-core-pools\`。7シナリオ ${SELECTED_SCENARIO_IDS.length === ALL_SCENARIO_IDS.length ? "測定" : "pilot"}。`,
    `- 対象種族: ${RACE_TARGET}（${RACE_LABEL}）、対応affix: \`${RACE_AFFIX}\`。B3以降通常遭遇を対象。`,
    `- source literal \`tags\` 分布（${MONSTERS.length}種）: ${Object.entries(SOURCE_RACE_TAG_COUNTS).map(([race, count]) => `${race} ${count}`).join(" / ")}。combat anti-X判定はこの \`tags\` を使用。`,
    `- 課題記載の分布との差分（課題値→現行literal tags）: ${SOURCE_RACE_TAG_COUNT_MISMATCHES.length ? SOURCE_RACE_TAG_COUNT_MISMATCHES.join(" / ") : "なし"}。combat判定のsource-of-truthである現行tagsを採用した。`,
    `- cure policy: ${STATUS_CURE_POLICY_ORDER.join(" / ")}。smartはHP閾値0.35、merchant補充はmissing。`,
    `- 種族偏重: B${RACE_START_FLOOR}以降の通常遭遇を指定確率で対象種族へ置換。上界は全モンスター置換。`,
    `- anti-X効果強度: 現行1xと5x。5xは単一+20%級を+100%級へ拡大する${RACE_TARGET === "dragon" ? "。竜では防御側も最小1まで軽減する" : "。今回の不死条件は攻撃側のみで、防御側のdragonGuardは対象外。防御軽減0は整合的"}。`,
    "",
    "## N設計",
    "",
    `- 保守値: B5 entrant率 ${number(fullSummary.nDesign.b5EntrantRate, 4)}、${RACE_AFFIX}群率 ${number(fullSummary.nDesign.raceAffixRate, 4)}。`,
    `- ${RACE_AFFIX}群の期待N=${number(fullSummary.nDesign.expectedRaceAffixN, 1)}。`,
    `- ${fullSummary.nDesign.formula}。実測各cellの群Nを確認し、N<30は未確定扱い。`,
    `- ${fullSummary.measurement.SIM_RUNS.toLocaleString()} runは${RACE_AFFIX}少数群を最低N30へ近づける設計。CI幅や80% powerは保証しない。`,
    "- target選定監査: 先行dragon上界は遭遇率こそ飽和したが、antiDragon有群が各cell 0〜1件でN<30のため判定対象外。現行ビルドでantiUndead群Nを確保できるundeadを本判定対象にした。",
    "",
    "## anti-race供給制約",
    "",
    "- antiUndeadは僧侶・司教の職業ボーナス（各+20%、`src/data/classes.js:20,24`）とHOLY_BAND（+20%、`src/data/items.js:54`）で供給される。antiDragonはDRAGON_RING（+20%、`src/data/items.js:53`）が主な装備供給で、職業ボーナスはない。",
    "- したがって基本4職で測定群Nを確保できることを実測できたのはundeadだけ。dragonは先行upperの各cell 0〜1件でN<30。beast / spirit / demonは現行供給ではN30を確保できる測定経路がなく、未測定・検証不能であり、効果なしとは書かない。質依存化を実装する前にanti-race供給を増やす必要がある。",
    "",
    "## 種族偏重・効果量条件",
    "",
    "| 条件 | 開始階 | 遭遇偏り | anti-X効果 | hp倍率 | atk倍率 | def倍率 | 意味 |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
    ...STATUS_CONDITION_DEFINITIONS.map(formatRaceConditionDefinition),
    "",
    "## 掃引表",
    "",
    `Δは${RACE_AFFIX}有−なし。floorはB5 entrantの到達floor、括弧内95% CI。全run平均到達floorは無条件指標。`,
    "",
    "| 条件 | cure | scenario | B5 N | 全run平均floor | B5突破率 | B5死亡率 | 適用階 | 適用階到達率 | 種族遭遇率 | 種族monster率 | 種族遭遇/run 全run | 種族遭遇/run 到達run | 種族monster/run 全run | 種族monster/run 到達run | anti-X対象攻撃/run | 防御軽減発動/run | affix N | Δfloor | Δ死亡 | Δ突破 | affixなし生存率 | 状態 |",
    "| --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | --- | --- | --- |"
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
    "B3開始は、現行の全run平均到達floor（約B3.6）で種族脅威を観測可能にするためのsim上の測定条件であり、ゲームの到達制約を意味しない。",
    "現行の到達帯で深層を定義するか、到達深度を先に上げるかは、#264/#275と接続する上位判断である。",
  );
  lines.push(
    "",
    "## 上界飽和（全run / 到達run）",
    "",
    "上界の種族遭遇率とanti-X適用回数が何に張り付くかを確認する。適用階到達率は全run分母、右側は到達run分母。",
    "",
    "| 条件 | cure | scenario | 開始階 | 到達N | 適用階到達率 | 種族遭遇率 | 種族monster率 | 種族遭遇/run 全run | 種族遭遇/run 到達run | 種族monster/run 全run | 種族monster/run 到達run | anti-X対象攻撃/run | 防御軽減発動/run |",
    "| --- | --- | --- | ---: | ---: | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |"
  );
  for (const condition of STATUS_CONDITION_DEFINITIONS.filter(item =>
    item.override?.forceRaceEncounter
  )) {
    for (const curePolicy of STATUS_CURE_POLICY_ORDER) {
      for (const scenarioId of SELECTED_SCENARIO_IDS) {
        const summary = fullSummary.cases[caseKey(condition.id, curePolicy, scenarioId)];
        const exposure = summary.raceExposure;
        const reached = exposure.reachedRun;
        lines.push(
         `| ${condition.id} | ${curePolicy} | ${scenarioId.replace("workshop-", "")} | ${exposure.startFloor} | ${exposure.reachedN} | ${rateText(exposure.reachedRate)} | ${rateText(summary.race.targetEncounterRate)} | ${rateText(summary.race.targetMonsterRate)} | ${number(summary.race.targetEncounterPerRun)} | ${number(reached?.targetEncounterPerRun)} | ${number(summary.race.targetMonsterPerRun)} | ${number(reached?.targetMonsterPerRun)} | ${number(summary.race.antiEffectActionPerRun)} | ${number(summary.race.antiDefenseReductionPerRun)} |`
       );
     }
    }
  }
  lines.push(
    "",
    "## 多重比較",
    "",
    `全掃引は${STATUS_CONDITION_DEFINITIONS.length}条件 × ${STATUS_CURE_POLICY_ORDER.length} cure × ${SELECTED_SCENARIO_IDS.length} scenario = ${comparisonCellCount} cell、endpoint 3種で${comparisonTestCount}検定。α=0.05の期待偽陽性数は${number(expectedFalsePositives, 1)}本。`,
    `上界判定だけでは${ceilingCaseEntries.length} cell × endpoint 3種 = ${ceilingCaseEntries.length * endpointDefinitions.length}検定、期待偽陽性数${number(ceilingCaseEntries.length * endpointDefinitions.length * 0.05, 1)}本。`,
    "符号が揃わない単発の非交差はsignalとせず、CI・母数・上界飽和を併読する。"
  );
  lines.push(
    "",
    "## 補助診断（前段status・主判定外）",
    "",
    "以下は前段PR #450との連続性のための補助集計。raceProtectionのendpoint差が主判定であり、状態異常の値はこのPhase 2aの結論に使わない。",
    ""
  );
  lines.push(
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
    "## 補助: PR #445 matching（主判定外）",
    "",
    "exact matching（core + #445対応support）を同じ職内centered差で再集計した。これはrace耐性群とは別の対照である。",
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
    "## 補助: 状態異常診断（主判定外）",
    "",
    "数値は各case全run集計。付与回数はB3〜B20 diagnostic log、消耗品はrun全体。",
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
    "## 補助: 状態回復消耗品（主判定外）",
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
    "## 補助: PR #445 baselineとの対比",
    "",
    "PR #445の対照値は前段報告の記録。race条件の因果判定には使わない。",
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
  const rawPath = join(resultDir, `issue-271-status-depth-scaling-${RACE_TARGET}-${runLabel}-${cureLabel}.jsonl`);
  const summaryPath = join(resultDir, `issue-271-status-depth-scaling-${RACE_TARGET}-${runLabel}-${cureLabel}.json`);
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
    raceTarget: RACE_TARGET,
    raceAffix: RACE_AFFIX,
    raceDifficulty: RACE_DIFFICULTY,
    raceStartFloor: RACE_START_FLOOR,
    raceEndFloor: RACE_END_FLOOR,
    sourceMonsterCount: MONSTERS.length,
    sourceRaceTagCounts: SOURCE_RACE_TAG_COUNTS,
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
    b5EntrantRate: N_DESIGN_B5_ENTRANT_RATE,
    raceAffixRate: N_DESIGN_RACE_AFFIX_RATE,
    expectedRaceAffixN: RUNS * N_DESIGN_B5_ENTRANT_RATE * N_DESIGN_RACE_AFFIX_RATE,
    targetRaceAffixN: MIN_GROUP_N,
    requiredRuns: N_DESIGN_REQUIRED_RUNS,
    formula: `ceil(${MIN_GROUP_N} / (${N_DESIGN_B5_ENTRANT_RATE.toFixed(4)} × ${N_DESIGN_RACE_AFFIX_RATE.toFixed(3)})) = ${N_DESIGN_REQUIRED_RUNS.toLocaleString()} → ${N_DESIGN_PLANNED_RUNS.toLocaleString()} run`
  };
  const fullSummary = {
    measurement,
    nDesign,
    statusConditions: STATUS_CONDITION_DEFINITIONS.map(condition => ({
      id: condition.id,
      label: condition.label,
      startFloor: Number(condition.override?.startFloor) || RACE_START_FLOOR,
      endFloor: RACE_END_FLOOR,
      targetRace: RACE_TARGET,
      affixType: RACE_AFFIX,
      poolBias: condition.poolBias,
      antiEffectMultiplier: condition.antiEffectMultiplier,
      raceDifficulty: condition.raceDifficulty,
      ceiling: Boolean(condition.override?.forceRaceEncounter)
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
      raceExposure: rateText(summary.raceExposure.reachedRate),
      raceMonsterRate: rateText(summary.race.targetMonsterRate),
      raceMonsterPerRun: summary.race.targetMonsterPerRun,
      raceMonsterPerReachedRun: summary.raceExposure.reachedRun?.targetMonsterPerRun ?? null,
      antiEffectActionPerRun: summary.race.antiEffectActionPerRun,
      antiDefenseReductionPerRun: summary.race.antiDefenseReductionPerRun,
      raceAffixN: `${summary.b5.raceProtection.matchedN}/${summary.b5.raceProtection.unmatchedN}`,
      raceDeltaFloor: diffText(summary.b5.raceProtection.endpointEffects.reachedFloor),
      raceDeltaDeath: diffText(summary.b5.raceProtection.endpointEffects.death),
      raceDeltaBreakthrough: diffText(summary.b5.raceProtection.endpointEffects.breakthrough),
      raceProtectionStatus: effectStatus(summary.b5.raceProtection),
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
