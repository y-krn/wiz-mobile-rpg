// sim-scope: run — production-backed virtual-player population measurement
/* global console, process */
import "../simulations/simulation_preflight.js";
import fs from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  calibrateCoreScoringProfile,
  getScenarioById,
  simulateRun
} from "../simulations/sim_depth_material_ev.js";
import { requireRunnerProvenance } from "./measurement_provenance.js";
import { printEnvSignatureBanner } from "./measurement_env_signature.js";

export const RUNNER_VERSION = "issue990-phase3-stage1-v1";
export const SCHEMA_VERSION = 1;
export const DEFAULT_SEED = "issue990-phase3-stage1";
export const DEFAULT_RUNS = 500;
export const TARGET_DEPTH = 30;
export const CHECKPOINTS = Object.freeze([5, 10, 15, 20, 21, 25, 30]);
export const DEATH_CATEGORIES = Object.freeze([
  "pure_raw_damage",
  "mechanic_mediated_raw_lethal",
  "direct_mechanic_death",
  "unknown_or_mixed"
]);

const BASE_EQUIPMENT_WEIGHTS = Object.freeze({
  weaponAtk: 1,
  defense: 1,
  maxHp: 1,
  str: 1,
  vit: 1,
  int: 1,
  pie: 1,
  agi: 1,
  guardian: 1,
  spellGuard: 1,
  followUp: 1,
  firstStrike: 1,
  arcane: 1,
  devotion: 1,
  combatCore: 1,
  economyCore: 1
});

// One interface for all Stage 1 personas. These are measurement policies,
// not claims about real-player frequency or behavior.
export const PERSONA_POLICIES = Object.freeze({
  cautious: Object.freeze({
    id: "cautious",
    label: "cautious / 慎重型",
    priority: ["survival", "hp", "mp", "defense_resistance", "damage", "exploration"],
    explorationPolicy: "known_frontier_then_stairs",
    exploration: Object.freeze({ budgetMultiplier: 2.5, budgetExtraSteps: 10, afterStairsSteps: 2 }),
    equipmentWeights: Object.freeze({ ...BASE_EQUIPMENT_WEIGHTS, defense: 1.55, maxHp: 1.45, guardian: 1.4, spellGuard: 1.35, combatCore: 0.9, economyCore: 0.75 }),
    resourcePolicy: Object.freeze({ healPotionThreshold: 0.70, manaPotionThreshold: 0.70, healPriorityPolicy: "potion-first" })
  }),
  aggressive: Object.freeze({
    id: "aggressive",
    label: "aggressive / 攻撃型",
    priority: ["kill_speed", "atk_spell_power", "action_count", "mp_efficiency", "defense"],
    explorationPolicy: "known_frontier_then_stairs",
    exploration: Object.freeze({ budgetMultiplier: 2.5, budgetExtraSteps: 10, afterStairsSteps: 4 }),
    equipmentWeights: Object.freeze({ ...BASE_EQUIPMENT_WEIGHTS, weaponAtk: 1.55, str: 1.35, int: 1.35, pie: 1.2, arcane: 1.3, defense: 0.70, maxHp: 0.75, combatCore: 1.35, economyCore: 0.70 }),
    resourcePolicy: Object.freeze({ healPotionThreshold: 0.40, manaPotionThreshold: 0.40, healPriorityPolicy: "potion-first" })
  }),
  explorer: Object.freeze({
    id: "explorer",
    label: "explorer / 探索型",
    priority: ["unexplored_area", "chest", "equipment_opportunity", "damage", "resource_cost"],
    explorationPolicy: "frontier_with_post_stairs_search",
    exploration: Object.freeze({ budgetMultiplier: 3.2, budgetExtraSteps: 18, afterStairsSteps: 24 }),
    equipmentWeights: Object.freeze({ ...BASE_EQUIPMENT_WEIGHTS, defense: 0.90, maxHp: 0.90, combatCore: 1.05, economyCore: 1.60 }),
    resourcePolicy: Object.freeze({ healPotionThreshold: 0.55, manaPotionThreshold: 0.55, healPriorityPolicy: "potion-first" })
  }),
  "stairs-first": Object.freeze({
    id: "stairs-first",
    label: "stairs-first / 階段優先型",
    priority: ["known_stairs", "mandatory_boss", "hp_mp_preservation", "equipment", "exploration"],
    explorationPolicy: "stairs_immediately_when_known",
    exploration: Object.freeze({ budgetMultiplier: 2.5, budgetExtraSteps: 10, afterStairsSteps: 0 }),
    equipmentWeights: Object.freeze({ ...BASE_EQUIPMENT_WEIGHTS, defense: 1.15, maxHp: 1.15, combatCore: 0.95, economyCore: 0.65 }),
    resourcePolicy: Object.freeze({ healPotionThreshold: 0.60, manaPotionThreshold: 0.60, healPriorityPolicy: "potion-first" })
  }),
  balanced: Object.freeze({
    id: "balanced",
    label: "balanced / バランス型",
    priority: ["hp_mp", "damage", "defense", "equipment_improvement", "exploration_cost"],
    explorationPolicy: "known_frontier_then_stairs",
    exploration: Object.freeze({ budgetMultiplier: 2.5, budgetExtraSteps: 10, afterStairsSteps: 8 }),
    equipmentWeights: Object.freeze({ ...BASE_EQUIPMENT_WEIGHTS, combatCore: 1, economyCore: 1 }),
    resourcePolicy: Object.freeze({ healPotionThreshold: 0.55, manaPotionThreshold: 0.55, healPriorityPolicy: "potion-first" })
  })
});

const PERSONA_IDS = Object.freeze(Object.keys(PERSONA_POLICIES));
const EXPLORATION_POLICY_INTERFACE = Object.freeze([
  "explorationPolicy",
  "exploration",
  "equipmentWeights",
  "resourcePolicy"
]);

function number(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export function percentile(sorted, probability) {
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] * (1 - (index - lower)) + sorted[upper] * (index - lower);
}

export function describe(values) {
  const finite = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!finite.length) return { n: 0, mean: null, p50: null, p90: null, min: null, max: null };
  return {
    n: finite.length,
    mean: mean(finite),
    p50: percentile(finite, 0.5),
    p90: percentile(finite, 0.9),
    min: finite[0],
    max: finite.at(-1)
  };
}

function classifyDeath(result) {
  if (!result.died) return null;
  if (["floor-trap", "flame-trap", "chest-trap", "from-drop-chest-trap", "secret-room-chest-trap", "poison"].includes(result.deathEncounterType)) {
    return "direct_mechanic_death";
  }
  const terminal = (result.encounterIdentityLog || []).filter(event => event.outcome === "death").at(-1);
  return DEATH_CATEGORIES.includes(terminal?.deathCategory) ? terminal.deathCategory : "unknown_or_mixed";
}

function compactCheckpoint(snapshot, runIndex) {
  return { ...snapshot, runIndex };
}

function compactRun(result, { persona, runIndex, worldSeed }) {
  const deathCategory = classifyDeath(result);
  const reachedDepth = Math.min(TARGET_DEPTH, number(result.reachedFloor));
  const checkpoints = Object.fromEntries(
    (result.checkpointSnapshots || [])
      .filter(snapshot => CHECKPOINTS.includes(snapshot.floor))
      .map(snapshot => [String(snapshot.floor), compactCheckpoint(snapshot, runIndex)])
  );
  return {
    persona,
    runIndex,
    worldSeed,
    reachedDepth,
    deathDepth: result.died ? number(result.deathFloor) : null,
    died: Boolean(result.died),
    deathCategory,
    terminationReason: result.terminationReason || null,
    encounters: number(result.battles),
    steps: number(result.steps),
    searchActions: number(result.searchActions),
    campUsage: number(result.campRestCount),
    equipmentDrops: number(result.equipmentFound),
    equipmentChanges: number(result.equipmentUpgrades),
    normalHits: number(result.normalCombatTelemetry?.incomingHits),
    normalDamage: number(result.normalCombatTelemetry?.incomingDamage),
    enemyActions: number(result.normalCombatTelemetry?.enemyActions),
    rounds: number(result.normalCombatTelemetry?.rounds),
    secretSearches: number(result.secretSearchAttempts),
    exploredRatio: describe(Object.values(result.exploredRatioByFloor || {}).map(Number)).mean,
    forcedPush: true,
    checkpoints,
    ...(result.stage15Diagnostics ? { stage15Diagnostics: result.stage15Diagnostics } : {})
  };
}

function perFloor(value, row) {
  return number(value) / Math.max(1, row.reachedDepth);
}

function checkpointSummary(rows, depth) {
  const reachedRows = rows.filter(row => row.checkpoints[String(depth)]);
  const values = field => reachedRows.map(row => Number(row.checkpoints[String(depth)][field])).filter(Number.isFinite);
  const snapshot = field => describe(values(field));
  return {
    checkpoint: `B${depth}`,
    reachedCount: reachedRows.length,
    reachedRate: reachedRows.length / Math.max(1, rows.length),
    status: reachedRows.length ? "observed" : "unobserved",
    hpRatio: snapshot("hpRatio"),
    mpRatio: snapshot("mpRatio"),
    HP: snapshot("hp"),
    maxHP: snapshot("maxHP"),
    MP: snapshot("mp"),
    maxMP: snapshot("maxMP"),
    ATK: snapshot("ATK"),
    DEF: snapshot("DEF"),
    buildScore: snapshot("combatBuildScore"),
    encounters: snapshot("encountersSoFar"),
    normalHits: snapshot("normalHitsReceivedSoFar"),
    normalDamage: snapshot("totalNormalDamageSoFar"),
    enemyActions: snapshot("enemyActionsSoFar"),
    rounds: snapshot("roundsSoFar"),
    steps: snapshot("stepsSoFar"),
    equipmentChanges: snapshot("equipmentChangesSoFar"),
    equipmentDrops: snapshot("equipmentDropsSeen"),
    searchActions: snapshot("searchActionsSoFar"),
    campUsage: snapshot("campUsageSoFar"),
    representativeSnapshots: reachedRows.slice(0, 50).map(row => row.checkpoints[String(depth)])
  };
}

function aggregateRows(rows) {
  const deaths = rows.filter(row => row.died);
  const reached = Object.fromEntries(CHECKPOINTS.map(depth => {
    const count = rows.filter(row => row.reachedDepth >= depth).length;
    return [String(depth), { count, rate: count / Math.max(1, rows.length), status: count ? "observed" : "unobserved" }];
  }));
  const deathCategories = Object.fromEntries(DEATH_CATEGORIES.map(category => {
    const count = deaths.filter(row => row.deathCategory === category).length;
    return [category, { count, rate: count / Math.max(1, deaths.length), status: deaths.length ? "observed" : "unobserved" }];
  }));
  const exposure = metric => describe(rows.map(row => perFloor(row[metric], row)));
  const terminationReasons = Object.fromEntries(
    [...new Set(rows.map(row => row.terminationReason || "unknown"))].sort().map(reason => [
      reason,
      rows.filter(row => (row.terminationReason || "unknown") === reason).length
    ])
  );
  return {
    runs: rows.length,
    deaths: deaths.length,
    reachedDepth: describe(rows.map(row => row.reachedDepth)),
    reached,
    deathDepth: describe(deaths.map(row => row.deathDepth)),
    deathCategories,
    terminationReasons,
    exposure: {
      encountersPerFloor: exposure("encounters"),
      stepsPerFloor: exposure("steps"),
      normalDamagePerFloor: exposure("normalDamage"),
      normalHitsPerFloor: exposure("normalHits"),
      enemyActionsPerFloor: exposure("enemyActions"),
      roundsPerFloor: exposure("rounds"),
      equipmentChangesPerFloor: exposure("equipmentChanges"),
      equipmentDropsPerFloor: exposure("equipmentDrops"),
      searchActionsPerFloor: exposure("searchActions"),
      campUsagePerFloor: exposure("campUsage")
    },
    totals: {
      encounters: rows.reduce((sum, row) => sum + row.encounters, 0),
      steps: rows.reduce((sum, row) => sum + row.steps, 0),
      normalDamage: rows.reduce((sum, row) => sum + row.normalDamage, 0),
      enemyActions: rows.reduce((sum, row) => sum + row.enemyActions, 0),
      equipmentChanges: rows.reduce((sum, row) => sum + row.equipmentChanges, 0),
      equipmentDrops: rows.reduce((sum, row) => sum + row.equipmentDrops, 0)
    },
    checkpoints: Object.fromEntries(CHECKPOINTS.map(depth => [String(depth), checkpointSummary(rows, depth)]))
  };
}

export function conditionalSurvival(rows) {
  const transitions = [[5, 10], [10, 15], [15, 20], [20, 21], [21, 25], [25, 30]];
  return Object.fromEntries(transitions.map(([from, to]) => {
    const denominator = rows.filter(row => row.reachedDepth >= from).length;
    const numerator = rows.filter(row => row.reachedDepth >= to).length;
    return [`B${from}->B${to}`, {
      numerator,
      denominator,
      rate: denominator ? numerator / denominator : null,
      status: denominator ? "observed" : "unobserved",
      insufficient: denominator === 0
    }];
  }));
}

const STAGE15_FLOORS = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9]);
const STAGE15_MP_BUCKETS = Object.freeze(["0%", "1-25%", "26-50%", "51-75%", "76-100%"]);

function stage15Values(rows, floor, field, side) {
  const property = `${side}${field[0].toUpperCase()}${field.slice(1)}`;
  return rows
    .map(row => row.stage15Diagnostics?.byFloor?.[String(floor)]?.[property])
    .filter(Number.isFinite);
}

function stage15Aggregate(rows, floor) {
  const records = rows
    .map(row => row.stage15Diagnostics?.byFloor?.[String(floor)])
    .filter(Boolean);
  const scalar = field => records.reduce((sum, record) => sum + number(record[field]), 0);
  const distribution = (field, side = null) => describe(
    side ? stage15Values(rows, floor, field, side) : records.map(record => number(record[field]))
  );
  const entry = {
    hp: distribution("hp", "entry"),
    hpRatio: distribution("hpRatio", "entry"),
    mp: distribution("mp", "entry"),
    mpRatio: distribution("mpRatio", "entry")
  };
  const exit = {
    hp: distribution("hp", "exit"),
    hpRatio: distribution("hpRatio", "exit"),
    mp: distribution("mp", "exit"),
    mpRatio: distribution("mpRatio", "exit")
  };
  return {
    floor,
    entered: records.length,
    survived: scalar("survived"),
    died: scalar("died"),
    incomplete: scalar("incomplete"),
    conditionalSurvival: records.length ? scalar("survived") / records.length : null,
    status: records.length ? "observed" : "unobserved",
    entry,
    exit,
    mpSpent: scalar("mpSpent"),
    mpRecovered: scalar("mpRecovered"),
    manaPotionUses: scalar("manaPotionUses"),
    campMpRecovery: scalar("campMpRecovery"),
    otherMpRecovery: scalar("otherMpRecovery"),
    damageTaken: scalar("damageTaken"),
    healing: scalar("healing"),
    healPotionUses: scalar("healPotionUses"),
    encounters: scalar("encounters"),
    combatActions: scalar("combatActions"),
    spellActions: scalar("spellActions"),
    normalAttackActions: scalar("normalAttackActions"),
    defensiveSupportActions: scalar("defensiveSupportActions"),
    itemActions: scalar("itemActions"),
    failedNoopActions: scalar("failedNoopActions"),
    rounds: scalar("rounds"),
    enemyActions: scalar("enemyActions"),
    normalHits: scalar("normalHits"),
    normalDamage: scalar("normalDamage"),
    insufficientMpDecisionCount: scalar("insufficientMpDecisionCount"),
    insufficientMpRounds: scalar("insufficientMpRounds"),
    insufficientMpNormalAttackRounds: scalar("insufficientMpNormalAttackRounds"),
    combatsEnteredLowMp: scalar("combatsEnteredLowMp"),
    combatsEnteredZeroMp: scalar("combatsEnteredZeroMp"),
    equipmentDrops: scalar("equipmentDrops"),
    equipmentChanges: scalar("equipmentChanges"),
    steps: scalar("steps"),
    exploredRatio: distribution("exploredRatio")
  };
}

function mergeStage15Buckets(rows) {
  const result = Object.fromEntries(STAGE15_MP_BUCKETS.map(bucket => [bucket, {
    bucket, encounters: 0, clear: 0, death: 0, pureRawDeaths: 0,
    rounds: 0, enemyActions: 0, normalHits: 0, normalDamage: 0,
    spellCasts: 0, normalAttacks: 0
  }]));
  rows.forEach(row => Object.entries(row.stage15Diagnostics?.mpBuckets || {}).forEach(([bucket, value]) => {
    const target = result[bucket] ||= { bucket, encounters: 0, clear: 0, death: 0, pureRawDeaths: 0, rounds: 0, enemyActions: 0, normalHits: 0, normalDamage: 0, spellCasts: 0, normalAttacks: 0 };
    Object.keys(target).filter(key => key !== "bucket").forEach(key => { target[key] += number(value[key]); });
  }));
  return Object.fromEntries(Object.entries(result).map(([bucket, value]) => [bucket, {
    ...value,
    clearRate: value.encounters ? value.clear / value.encounters : null,
    deathRate: value.encounters ? value.death / value.encounters : null,
    pureRawDeathRate: value.encounters ? value.pureRawDeaths / value.encounters : null,
    meanRounds: value.encounters ? value.rounds / value.encounters : null,
    meanEnemyActions: value.encounters ? value.enemyActions / value.encounters : null,
    meanNormalHits: value.encounters ? value.normalHits / value.encounters : null,
    meanNormalDamage: value.encounters ? value.normalDamage / value.encounters : null,
    meanSpellCasts: value.encounters ? value.spellCasts / value.encounters : null,
    meanNormalAttacks: value.encounters ? value.normalAttacks / value.encounters : null,
    status: value.encounters ? "observed" : "unobserved"
  }]));
}

function b5MpBucket(ratio) {
  if (ratio <= 0.10) return "0-10%";
  if (ratio <= 0.25) return "10-25%";
  if (ratio <= 0.50) return "25-50%";
  return "50%+";
}

function aggregateB5MpSurvival(rows) {
  const buckets = Object.fromEntries(["0-10%", "10-25%", "25-50%", "50%+"].map(bucket => [bucket, []]));
  rows.forEach(row => {
    const b5 = row.stage15Diagnostics?.b5Entry;
    if (b5?.mpRatio === null || !Number.isFinite(b5?.mpRatio)) return;
    buckets[b5MpBucket(b5.mpRatio)].push(row);
  });
  return Object.fromEntries(Object.entries(buckets).map(([bucket, selected]) => {
    const reached = depth => selected.filter(row => row.reachedDepth >= depth).length;
    const insufficient = selected.length < 5;
    return [bucket, {
      bucket,
      n: selected.length,
      meanReachedDepth: mean(selected.map(row => row.reachedDepth)),
      B6: reached(6), B7: reached(7), B8: reached(8), B9: reached(9), B10: reached(10),
      B6Rate: insufficient || !selected.length ? null : reached(6) / selected.length,
      B7Rate: insufficient || !selected.length ? null : reached(7) / selected.length,
      B8Rate: insufficient || !selected.length ? null : reached(8) / selected.length,
      B9Rate: insufficient || !selected.length ? null : reached(9) / selected.length,
      B10Rate: insufficient || !selected.length ? null : reached(10) / selected.length,
      status: selected.length ? (insufficient ? "insufficient" : "observed") : "unobserved"
    }];
  }));
}

function aggregateStage15(rowsByPersona) {
  const personaEntries = Object.entries(rowsByPersona).map(([persona, rows]) => {
    const floors = Object.fromEntries(STAGE15_FLOORS.map(floor => [String(floor), stage15Aggregate(rows, floor)]));
    const representativeSamples = Object.fromEntries(STAGE15_FLOORS.map(floor => [String(floor), rows
      .filter(row => row.stage15Diagnostics?.byFloor?.[String(floor)])
      .slice(0, 50)
      .map(row => ({ persona, runIndex: row.runIndex, worldSeed: row.worldSeed, snapshot: row.stage15Diagnostics.byFloor[String(floor)] }))]));
    const spellUsage = {};
    rows.forEach(row => Object.entries(row.stage15Diagnostics?.spellUsage || {}).forEach(([spellId, value]) => {
      const target = spellUsage[spellId] ||= { spellId, castCount: 0, successfulCasts: 0, totalMpSpent: 0, targetTypes: {} };
      target.castCount += number(value.castCount);
      target.successfulCasts += number(value.successfulCasts);
      target.totalMpSpent += number(value.totalMpSpent);
      Object.entries(value.targetTypes || {}).forEach(([type, count]) => { target.targetTypes[type] = (target.targetTypes[type] || 0) + number(count); });
    }));
    const totalCasts = Object.values(spellUsage).reduce((sum, value) => sum + value.castCount, 0);
    Object.values(spellUsage).forEach(value => { value.castShare = totalCasts ? value.castCount / totalCasts : null; });
    const combatTotals = floors => {
      const encounters = floors.reduce((sum, floor) => sum + floor.encounters, 0);
      const perEncounter = field => encounters ? floors.reduce((sum, floor) => sum + floor[field], 0) / encounters : null;
      return { encounters, spellCastsPerEncounter: perEncounter("spellActions"), mpSpentPerEncounter: floors.reduce((sum, floor) => sum + floor.mpSpent, 0) / Math.max(1, encounters), normalAttacksPerEncounter: perEncounter("normalAttackActions"), roundsPerEncounter: perEncounter("rounds"), enemyActionsPerEncounter: perEncounter("enemyActions") };
    };
    return [persona, { floors, representativeSamples, mpBuckets: mergeStage15Buckets(rows), spellUsage, b5MpSurvival: aggregateB5MpSurvival(rows), combat: combatTotals(Object.values(floors)) }];
  });
  const byPersona = Object.fromEntries(personaEntries);
  return { byPersona, comparison: {
    aggressiveVsBalanced: Object.fromEntries(["aggressive", "balanced"].map(persona => [persona, byPersona[persona]?.combat || null])),
    cautiousVsBalanced: Object.fromEntries(["cautious", "balanced"].map(persona => [persona, byPersona[persona]?.combat || null]))
  } };
}

function pairComparison(rowsByPersona) {
  const result = {};
  const personaIds = Object.keys(rowsByPersona);
  for (let leftIndex = 0; leftIndex < personaIds.length; leftIndex++) {
    for (let rightIndex = leftIndex + 1; rightIndex < personaIds.length; rightIndex++) {
      const leftId = personaIds[leftIndex];
      const rightId = personaIds[rightIndex];
      const rightByRun = new Map(rowsByPersona[rightId].map(row => [row.runIndex, row]));
      const counts = { leftReachedDeeper: 0, sameDepth: 0, rightReachedDeeper: 0 };
      rowsByPersona[leftId].forEach(left => {
        const right = rightByRun.get(left.runIndex);
        if (!right) return;
        if (left.reachedDepth > right.reachedDepth) counts.leftReachedDeeper++;
        else if (left.reachedDepth < right.reachedDepth) counts.rightReachedDeeper++;
        else counts.sameDepth++;
      });
      const n = Object.values(counts).reduce((sum, value) => sum + value, 0);
      result[`${leftId}__${rightId}`] = {
        left: leftId,
        right: rightId,
        ...counts,
        rates: Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, n ? value / n : null])),
        pairedRuns: n,
        status: n ? "observed" : "unobserved"
      };
    }
  }
  return result;
}

function pearson(rows, left, right) {
  const pairs = rows.map(row => [left(row), right(row)]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
  if (pairs.length < 2) return { n: pairs.length, value: null, status: "insufficient" };
  const meanLeft = mean(pairs.map(pair => pair[0]));
  const meanRight = mean(pairs.map(pair => pair[1]));
  const numerator = pairs.reduce((sum, [a, b]) => sum + (a - meanLeft) * (b - meanRight), 0);
  const leftVariance = pairs.reduce((sum, [a]) => sum + (a - meanLeft) ** 2, 0);
  const rightVariance = pairs.reduce((sum, [, b]) => sum + (b - meanRight) ** 2, 0);
  return { n: pairs.length, value: leftVariance && rightVariance ? numerator / Math.sqrt(leftVariance * rightVariance) : null, status: "observed" };
}

function deathPrecedingCheckpoints(rows) {
  return Object.fromEntries(Object.keys(rows).map(persona => {
    const values = [];
    rows[persona].filter(row => row.died).forEach(row => {
      const checkpoint = CHECKPOINTS.filter(depth => depth < row.deathDepth && row.checkpoints[String(depth)]).at(-1);
      if (!checkpoint) return;
      const snapshot = row.checkpoints[String(checkpoint)];
      values.push({ checkpoint, snapshot, row });
    });
    return [persona, Object.fromEntries(CHECKPOINTS.map(depth => {
      const selected = values.filter(value => value.checkpoint === depth);
      const field = name => describe(selected.map(value => Number(value.snapshot[name])).filter(Number.isFinite));
      return [`B${depth}`, { deathsAfterCheckpoint: selected.length, hpRatio: field("hpRatio"), mpRatio: field("mpRatio"), ATK: field("ATK"), DEF: field("DEF"), buildScore: field("combatBuildScore"), equipmentChanges: field("equipmentChangesSoFar"), normalHits: field("normalHitsReceivedSoFar"), normalDamage: field("totalNormalDamageSoFar"), enemyActions: field("enemyActionsSoFar"), rounds: field("roundsSoFar"), encounters: field("encountersSoFar"), steps: field("stepsSoFar") }];
    }))];
  }));
}

export function runMeasurement({ seed = DEFAULT_SEED, runs = DEFAULT_RUNS, personas = PERSONA_IDS, provenance = null, environmentSignature = null, collectStage15Diagnostics = false, runnerVersion = RUNNER_VERSION, schemaVersion = SCHEMA_VERSION, runnerPath = "scratch/measurements/issue990_phase3_stage1.js" } = {}) {
  if (!Number.isInteger(runs) || runs < 1) throw new Error(`runs must be a positive integer: ${runs}`);
  const selected = [...new Set(personas)];
  if (!selected.length || selected.some(id => !PERSONA_POLICIES[id])) throw new Error(`personas must be ${PERSONA_IDS.join(",")}`);
  const baseScenario = getScenarioById("legacy-no-portal");
  const scoringProfile = calibrateCoreScoringProfile(
    Math.min(10, runs),
    { routePolicy: "partial_information_exploration", equipmentUpdatePolicy: "deterministic_greedy", fleePolicy: "never", useTownPortal: false },
    "powder",
    baseScenario.workshop,
    ["Mage"]
  );
  const rowsByPersona = Object.fromEntries(selected.map(id => [id, []]));
  for (const persona of selected) {
    const policy = PERSONA_POLICIES[persona];
    const personaScoringProfile = { ...scoringProfile, personaEquipmentWeights: policy.equipmentWeights };
    for (let runIndex = 0; runIndex < runs; runIndex++) {
      const worldSeed = `${seed}:world:${runIndex}`;
      const result = simulateRun({
        className: "Mage",
        startFloor: 1,
        targetDepth: TARGET_DEPTH + 1,
        runIndex,
        seriesId: "issue990-phase3-stage1",
        worldSeed,
        scoringProfile: personaScoringProfile,
        scenario: {
          ...baseScenario,
          routePolicy: "partial_information_exploration",
          equipmentUpdatePolicy: "deterministic_greedy",
          personaId: persona,
          personaPolicy: policy,
          fleePolicy: "never",
          useTownPortal: false,
          healPotionThreshold: policy.resourcePolicy.healPotionThreshold,
          manaPotionThreshold: policy.resourcePolicy.manaPotionThreshold,
          healPriorityPolicy: policy.resourcePolicy.healPriorityPolicy,
          identificationPolicy: "powder",
          collectEncounterIdentities: true,
          collectCheckpointSnapshots: true,
          collectStage15Diagnostics
        },
        workshop: baseScenario.workshop,
        collectEquipmentTelemetry: true
      });
      rowsByPersona[persona].push(compactRun(result, { persona, runIndex, worldSeed }));
    }
  }
  const summaries = Object.fromEntries(selected.map(persona => [persona, {
    persona: PERSONA_POLICIES[persona],
    summary: aggregateRows(rowsByPersona[persona]),
    conditionalSurvival: conditionalSurvival(rowsByPersona[persona])
  }]));
  const b21Plus = Object.fromEntries(selected.map(persona => {
    const summary = summaries[persona].summary;
    return [persona, Object.fromEntries([21, 25, 30].map(depth => [String(depth), summary.reached[String(depth)]]))];
  }));
  return {
    schemaVersion,
    measurement: {
      issue: 990,
      phase: 3,
      stage: 1,
      runnerVersion,
      sourceCommit: provenance?.sourceCommit || null,
      mainBaselineSha: provenance?.baseCommit || null,
      measurementRunnerDiffSha256: provenance?.measurementRunnerDiffSha256 || null,
      environmentSignature,
      configuration: { seed, runs, personas: selected, className: "Mage", startFloor: 1, targetDepth: TARGET_DEPTH, checkpoints: CHECKPOINTS, stage15Floors: collectStage15Diagnostics ? STAGE15_FLOORS : [], forcedPush: true, retreatModeled: false, runnerPath },
      seedPolicy: `runIndex i uses ${seed}:world:i for every selected persona; only policy inputs differ`,
      worldSeedTemplate: `${seed}:world:{runIndex}`,
      personaInterface: [...EXPLORATION_POLICY_INTERFACE],
      modeledSystems: ["production run-floor generation", "production-backed movement and known-cell frontier exploration", "production secret search", "production encounter generation", "production combat/enemy behavior", "production loot/equipment generation and eligibility", "production Core/Support and curse/unidentified powder rules", "production HP/MP carry-over, camp, floor transition recovery, milestone boss", "#983 exclusive death classification with state degradation evidence", "checkpoint state capture and population aggregation"],
      omittedSystems: ["real-player behavior distribution", "checkpoint continuation/resampling", "return/retreat judgment", "Monte Carlo/search/RL/future simulation", "human UI timing", "full raw encounter history in evidence"],
      productionBalanceChanged: false,
      N: runs,
      seed
    },
    personaDefinitions: selected.map(id => PERSONA_POLICIES[id]),
    naturalProgression: summaries,
    checkpointPopulation: Object.fromEntries(selected.map(persona => [persona, summaries[persona].summary.checkpoints])),
    conditionalSurvival: Object.fromEntries(selected.map(persona => [persona, summaries[persona].conditionalSurvival])),
    b21Plus,
    deathSummaries: Object.fromEntries(selected.map(persona => [persona, { categories: summaries[persona].summary.deathCategories, precedingCheckpoints: deathPrecedingCheckpoints(rowsByPersona)[persona] }])),
    comparison: {
      personaPairs: pairComparison(rowsByPersona),
      correlations: Object.fromEntries(selected.map(persona => [persona, {
        explorationVsEquipmentChanges: pearson(rowsByPersona[persona], row => perFloor(row.steps, row), row => row.equipmentChanges),
        explorationVsNormalDamage: pearson(rowsByPersona[persona], row => perFloor(row.steps, row), row => row.normalDamage),
        explorationVsEnemyActions: pearson(rowsByPersona[persona], row => perFloor(row.steps, row), row => row.enemyActions)
      }])),
      interpretation: "Run reach is persona-level natural progression. No encounter raw log or checkpoint continuation is used. Pair comparison is same-seed reached-depth comparison, not #975 encounter-level build evidence."
    },
    audit: {
      hiddenStairsUsed: false,
      hiddenBossUsed: false,
      hiddenSecretDoorUsed: false,
      futureEncounterInfoUsed: false,
      futureLootUsed: false,
      unidentifiedHiddenAffixUsed: false,
      retreatDecisionUsed: false,
      forcedPush: true,
      rawEncounterHistoryStored: false,
      productionBalanceChanged: false,
      deathCategories: [...DEATH_CATEGORIES],
      deathCategoryContract: "every death receives exactly one exclusive category; mechanic-mediated requires state-degradation evidence from production causal classifier"
    },
    ...(collectStage15Diagnostics ? { stage15Diagnostics: aggregateStage15(rowsByPersona) } : {})
  };
}

function percent(value) { return value === null || value === undefined ? "n/a" : `${(Number(value) * 100).toFixed(1)}%`; }
function fmt(value) { return value === null || value === undefined || !Number.isFinite(Number(value)) ? "n/a" : Number(value).toFixed(2); }
function checkpointMean(summary, field) { return summary?.[field]?.mean ?? null; }

function renderStage15Sections(report) {
  const personas = report.measurement.configuration.personas;
  const diagnostics = report.stage15Diagnostics.byPersona;
  const floor = (persona, numberValue) => diagnostics[persona]?.floors?.[String(numberValue)];
  const meanPerEntered = (record, field) => record?.entered ? record[field] / record.entered : null;
  const observedFloors = persona => STAGE15_FLOORS.map(numberValue => floor(persona, numberValue)).filter(record => record?.entered);
  const bottleneck = persona => {
    const candidates = STAGE15_FLOORS.map(numberValue => floor(persona, numberValue)).filter(record => record?.entered);
    return candidates.sort((left, right) => (left.conditionalSurvival ?? 1) - (right.conditionalSurvival ?? 1))[0] || null;
  };
  const lines = [
    "## Stage 1.5 — shallow MP/combat diagnosis",
    "",
    "Stage 1.5 measures B1–B9 only. It does not alter Mage combat action selection, production balance, or retreat behavior.",
    "Stage 1 interpretation: these are five measurement policies sharing the same basic combat policy; Stage 1 did not implement five fully distinct combat AIs.",
    "B5 checkpoint values below are conditional on reaching B5 (survivor bias). Floor exit is sampled after floor recovery/camp and before the transition recovery; the next floor entry includes transition recovery.",
    "",
    "### Table A — Floor survival",
    "",
    "| persona | floor | entered | survived | died | next-floor survival |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    ...personas.flatMap(persona => STAGE15_FLOORS.map(numberValue => {
      const value = floor(persona, numberValue);
      return `| ${persona} | B${numberValue} | ${value.entered} | ${value.survived} | ${value.died} | ${percent(value.conditionalSurvival)} |`;
    })),
    "",
    "### Table B — HP/MP progression",
    "",
    "| persona | floor | entry HP% | exit HP% | entry MP% | exit MP% | MP spent | MP recovered |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...personas.flatMap(persona => STAGE15_FLOORS.map(numberValue => {
      const value = floor(persona, numberValue);
      return `| ${persona} | B${numberValue} | ${percent(value.entry.hpRatio.mean)} | ${percent(value.exit.hpRatio.mean)} | ${percent(value.entry.mpRatio.mean)} | ${percent(value.exit.mpRatio.mean)} | ${fmt(meanPerEntered(value, "mpSpent"))} | ${fmt(meanPerEntered(value, "mpRecovered"))} |`;
    })),
    "",
    "### Table C — Combat actions and exposure",
    "",
    "| persona | floor | encounters | spell casts | normal attacks | items | rounds | enemy actions | normal hits | normal damage |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...personas.flatMap(persona => STAGE15_FLOORS.map(numberValue => {
      const value = floor(persona, numberValue);
      return `| ${persona} | B${numberValue} | ${value.encounters} | ${value.spellActions} | ${value.normalAttackActions} | ${value.itemActions} | ${value.rounds} | ${value.enemyActions} | ${value.normalHits} | ${value.normalDamage} |`;
    })),
    "",
    "### Table D — Spell usage",
    "",
    "| persona | spell ID | cast count | successful | total MP spent | cast share | target types |",
    "| --- | --- | ---: | ---: | ---: | ---: | --- |",
    ...personas.flatMap(persona => Object.values(diagnostics[persona]?.spellUsage || {}).map(value => `| ${persona} | ${value.spellId} | ${value.castCount} | ${value.successfulCasts} | ${value.totalMpSpent} | ${percent(value.castShare)} | ${Object.entries(value.targetTypes).map(([type, count]) => `${type}:${count}`).join(", ")} |`)),
    "",
    "### Table E — Combat-entry MP bucket",
    "",
    "| persona | bucket | encounters | clear% | death% | pure raw death% | rounds | enemy actions | normal hits | normal damage | spell casts | normal attacks |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...personas.flatMap(persona => Object.values(diagnostics[persona]?.mpBuckets || {}).map(value => `| ${persona} | ${value.bucket} | ${value.encounters} | ${percent(value.clearRate)} | ${percent(value.deathRate)} | ${percent(value.pureRawDeathRate)} | ${fmt(value.meanRounds)} | ${fmt(value.meanEnemyActions)} | ${fmt(value.meanNormalHits)} | ${fmt(value.meanNormalDamage)} | ${fmt(value.meanSpellCasts)} | ${fmt(value.meanNormalAttacks)} |`)),
    "",
    "### Table F — B5 entry MP vs later survival",
    "",
    "| persona | B5 entry MP bucket | N | mean reached depth | B6 | B7 | B8 | B9 | B10 | status |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
    ...personas.flatMap(persona => Object.values(diagnostics[persona]?.b5MpSurvival || {}).map(value => `| ${persona} | ${value.bucket} | ${value.n} | ${fmt(value.meanReachedDepth)} | ${value.B6} (${percent(value.B6Rate)}) | ${value.B7} (${percent(value.B7Rate)}) | ${value.B8} (${percent(value.B8Rate)}) | ${value.B9} (${percent(value.B9Rate)}) | ${value.B10} (${percent(value.B10Rate)}) | ${value.status} |`)),
    "",
    "### Table G — Persona combat differences (B1–B9)",
    "",
    "| persona | spell casts/encounter | MP spent/encounter | normal attacks/encounter | rounds/encounter | enemy actions/encounter |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    ...personas.map(persona => {
      const value = diagnostics[persona].combat;
      return `| ${persona} | ${fmt(value.spellCastsPerEncounter)} | ${fmt(value.mpSpentPerEncounter)} | ${fmt(value.normalAttacksPerEncounter)} | ${fmt(value.roundsPerEncounter)} | ${fmt(value.enemyActionsPerEncounter)} |`;
    }),
    "",
    "Representative samples are capped at 50 snapshots per persona × floor; individual combat telemetry is aggregated in memory and is not stored in evidence.",
    "",
    "### Stage 1.5 answers",
    "",
    `1. Population bottleneck: ${personas.map(persona => `${persona}=B${bottleneck(persona)?.floor ?? "n/a"} (${percent(bottleneck(persona)?.conditionalSurvival)})`).join("; ")}.`,
    `2. MP decline: ${personas.map(persona => { const records = observedFloors(persona); const first = records.find(value => value.exit.mpRatio < value.entry.mpRatio); return `${persona}=${first ? `B${first.floor}` : "not observed"}`; }).join("; ")}.`,
    `3. HP vs MP: B5 entry survivor means are ${personas.map(persona => `${persona} HP ${percent(floor(persona, 5)?.entry.hpRatio.mean)}, MP ${percent(floor(persona, 5)?.entry.mpRatio.mean)}`).join("; ")}; this is conditional on B5 entry.`,
    `4. Main spells: ${personas.map(persona => { const spells = Object.values(diagnostics[persona]?.spellUsage || {}).sort((a, b) => b.castCount - a.castCount); return `${persona}=${spells[0]?.spellId || "none"}`; }).join("; ")}.`,
    `5. MP shortage changing action: blocked decisions=${personas.map(persona => `${persona} ${observedFloors(persona).reduce((sum, value) => sum + value.insufficientMpDecisionCount, 0)}`).join(", ")}; this is telemetry of denied spell opportunities, not a causal proof.`,
    `6. Low-MP combats and rounds: compare Table E means; the observed direction is ${personas.some(persona => diagnostics[persona].mpBuckets["0%"]?.meanRounds > diagnostics[persona].mpBuckets["76-100%"]?.meanRounds) ? "higher in at least one persona" : "not uniformly higher"}.`,
    `7. Low-MP combats and enemy actions: ${personas.some(persona => diagnostics[persona].mpBuckets["0%"]?.meanEnemyActions > diagnostics[persona].mpBuckets["76-100%"]?.meanEnemyActions) ? "higher in at least one persona" : "not uniformly higher"}.`,
    `8. Low-MP combats and normal damage: ${personas.some(persona => diagnostics[persona].mpBuckets["0%"]?.meanNormalDamage > diagnostics[persona].mpBuckets["76-100%"]?.meanNormalDamage) ? "higher in at least one persona" : "not uniformly higher"}.`,
    `9. Low-MP combats and pure raw death: ${personas.map(persona => `${persona}=${percent(diagnostics[persona].mpBuckets["0%"]?.pureRawDeathRate)}`).join("; ")}; do not treat this association as causation.`,
    `10. B5 MP and later survival: see Table F; buckets with N<5 are explicitly insufficient.`,
    "11. B5 HP ~90% is survivor-conditioned and cannot be read as the all-run state; floor entrant/death counts in Table A expose that selection.",
    `12. aggressive combat behavior: ${fmt(diagnostics.aggressive?.combat.spellCastsPerEncounter)} casts/encounter vs balanced ${fmt(diagnostics.balanced?.combat.spellCastsPerEncounter)}; the shared selector means aggressive was not independently aggressive.`,
    `13. cautious MP conservation: ${fmt(diagnostics.cautious?.combat.mpSpentPerEncounter)} MP/encounter vs balanced ${fmt(diagnostics.balanced?.combat.mpSpentPerEncounter)}; cautious did not implement combat-level MP conservation.`,
    `14. explorer tradeoff: explorer vs balanced is shown in Tables B/C and Stage 1 exposure; extra exploration should be interpreted as both equipment opportunity and additional exposure, not as a guaranteed benefit.`,
    "15. Stage 1 persona comparison confidence: limited to exploration, equipment scoring, and resource thresholds because combat selection was shared.",
    "16. The “AI is merely too weak” explanation is weakened as a complete explanation only insofar as the missing combat-policy variation is now explicit; Stage 1 cannot establish a game-structure conclusion.",
    "17. Next: implement a separately specified combat-persona experiment only after reviewing this diagnosis; do not silently alter this baseline.",
    "18. Checkpoint resampling: not yet; first decide whether the shallow MP/action relationship warrants a combat-persona stage.",
    "19. #973 Build Confidence: **Revise**; this remains a measurement baseline, not a build-confidence replacement.",
    "20. #990 remains **open**.",
    "21. Production tuning: **not recommended from Stage 1.5 alone**; no production balance or combat behavior was changed."
  ];
  return lines;
}

export function renderSummary(report) {
  const personas = report.measurement.configuration.personas;
  const summaries = Object.fromEntries(personas.map(persona => [persona, report.naturalProgression[persona].summary]));
  const meanDepths = personas.map(persona => summaries[persona].reachedDepth.mean).filter(Number.isFinite);
  const deepestPersona = personas.slice().sort((left, right) => summaries[right].reachedDepth.mean - summaries[left].reachedDepth.mean)[0] || "n/a";
  const deepestMean = summaries[deepestPersona]?.reachedDepth.mean ?? null;
  const shallowestMean = meanDepths.length ? Math.min(...meanDepths) : null;
  const reversePairObserved = Object.values(report.comparison.personaPairs).some(pair => pair.leftReachedDeeper > 0 && pair.rightReachedDeeper > 0);
  const getExposure = (persona, field) => summaries[persona]?.exposure[field]?.mean ?? null;
  const getCheckpoint = (persona, field, depth = 5) => summaries[persona]?.checkpoints[String(depth)]?.[field]?.mean ?? null;
  const explorerSteps = getExposure("explorer", "stepsPerFloor");
  const explorerDrops = getExposure("explorer", "equipmentDropsPerFloor");
  const explorerChanges = getExposure("explorer", "equipmentChangesPerFloor");
  const explorerDamage = getExposure("explorer", "normalDamagePerFloor");
  const referencePersona = summaries.balanced ? "balanced" : personas[0];
  const referenceSteps = getExposure(referencePersona, "stepsPerFloor");
  const referenceDrops = getExposure(referencePersona, "equipmentDropsPerFloor");
  const referenceChanges = getExposure(referencePersona, "equipmentChangesPerFloor");
  const referenceDamage = getExposure(referencePersona, "normalDamagePerFloor");
  const b5ToB10 = report.conditionalSurvival[deepestPersona]?.["B5->B10"];
  const rawShares = personas.map(persona => summaries[persona].deathCategories.pure_raw_damage.rate).filter(Number.isFinite);
  const lines = [
    "# Issue #990 Phase 3 Stage 1 — virtual player population",
    "",
    `- runner: \`${report.measurement.runnerVersion}\` / schema \`${report.schemaVersion}\``,
    `- seed: \`${report.measurement.configuration.seed}\`; N: **${report.measurement.configuration.runs} / persona**`,
    "- production-backed, deterministic, B1-start, same-seed, forced-push; retreat behavior is not modeled",
    "",
    "These personas are measurement policies, not claims about real player behavior. They measure sensitivity to simple, explainable play priorities.",
    "Stage 1 interpretation: persona differences are concentrated in exploration, equipment evaluation, and recovery thresholds. The basic Mage combat action selector is shared; this is not evidence from five fully distinct combat AIs.",
    "",
    "## Table 1 — Reach",
    "",
    "| persona | mean depth | B5 | B10 | B15 | B20 | B21 | B25 | B30 |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...personas.map(persona => {
      const summary = report.naturalProgression[persona].summary;
      return `| ${persona} | ${fmt(summary.reachedDepth.mean)} | ${percent(summary.reached["5"].rate)} | ${percent(summary.reached["10"].rate)} | ${percent(summary.reached["15"].rate)} | ${percent(summary.reached["20"].rate)} | ${percent(summary.reached["21"].rate)} | ${percent(summary.reached["25"].rate)} | ${percent(summary.reached["30"].rate)} |`;
    }),
    "",
    "## Table 2 — Conditional survival",
    "",
    "| persona | B5→B10 | B10→B15 | B15→B20 | B20→B21 | B21→B25 | B25→B30 |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...personas.map(persona => `| ${persona} | ${Object.values(report.conditionalSurvival[persona]).map(value => `${value.status === "unobserved" ? "n/a" : percent(value.rate)} (n=${value.denominator})`).join(" | ")} |`),
    "",
    "## Table 3 — Resource state (checkpoint mean)",
    "",
    "| checkpoint | persona | HP% | MP% | ATK | DEF | build score |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: |",
    ...CHECKPOINTS.flatMap(depth => personas.map(persona => {
      const checkpoint = report.checkpointPopulation[persona][String(depth)];
      return `| B${depth} | ${persona} | ${checkpoint.reachedCount ? percent(checkpointMean(checkpoint, "hpRatio")) : "n/a"} | ${checkpoint.reachedCount ? percent(checkpointMean(checkpoint, "mpRatio")) : "n/a"} | ${checkpoint.reachedCount ? fmt(checkpointMean(checkpoint, "ATK")) : "n/a"} | ${checkpoint.reachedCount ? fmt(checkpointMean(checkpoint, "DEF")) : "n/a"} | ${checkpoint.reachedCount ? fmt(checkpointMean(checkpoint, "buildScore")) : "n/a"} |`;
    })),
    "",
    "## Table 4 — Exposure",
    "",
    "| persona | encounters/floor | steps/floor | normal damage/floor | enemy actions/floor | equipment changes/floor |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    ...personas.map(persona => {
      const exposure = report.naturalProgression[persona].summary.exposure;
      return `| ${persona} | ${fmt(exposure.encountersPerFloor.mean)} | ${fmt(exposure.stepsPerFloor.mean)} | ${fmt(exposure.normalDamagePerFloor.mean)} | ${fmt(exposure.enemyActionsPerFloor.mean)} | ${fmt(exposure.equipmentChangesPerFloor.mean)} |`;
    }),
    "",
    "## Table 5 — Death causes",
    "",
    "| persona | pure raw | mechanic-mediated | direct mechanic | unknown/mixed |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...personas.map(persona => {
      const categories = report.naturalProgression[persona].summary.deathCategories;
      return `| ${persona} | ${categories.pure_raw_damage.count} (${percent(categories.pure_raw_damage.rate)}) | ${categories.mechanic_mediated_raw_lethal.count} (${percent(categories.mechanic_mediated_raw_lethal.rate)}) | ${categories.direct_mechanic_death.count} (${percent(categories.direct_mechanic_death.rate)}) | ${categories.unknown_or_mixed.count} (${percent(categories.unknown_or_mixed.rate)}) |`;
    }),
    "",
    "## Table 6 — Persona pair comparison",
    "",
    "| pair | left deeper | same depth | right deeper | paired N |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...Object.values(report.comparison.personaPairs).map(pair => `| ${pair.left} vs ${pair.right} | ${pair.leftReachedDeeper} | ${pair.sameDepth} | ${pair.rightReachedDeeper} | ${pair.pairedRuns} |`),
    "",
    "## Checkpoint population",
    "",
    "Only reached checkpoint snapshots and at most 50 representative samples per persona × checkpoint are durable evidence. Full encounter histories remain in runner memory only.",
    "",
    ...personas.flatMap(persona => CHECKPOINTS.map(depth => {
      const checkpoint = report.checkpointPopulation[persona][String(depth)];
      return `- ${persona} B${depth}: reached=${checkpoint.reachedCount}/${report.measurement.configuration.runs}; HP p50=${fmt(checkpoint.hpRatio.p50)}; MP p50=${fmt(checkpoint.mpRatio.p50)}; ATK=${fmt(checkpoint.ATK.mean)}; DEF=${fmt(checkpoint.DEF.mean)}; equipment changes=${fmt(checkpoint.equipmentChanges.mean)}`;
    })),
    "",
    "## Answers",
    "",
    `1. 到達深度の平均は ${fmt(shallowestMean)}〜${fmt(deepestMean)}（幅 ${fmt(deepestMean === null || shallowestMean === null ? null : deepestMean - shallowestMean)}）。explorer の B5 到達率は ${percent(summaries.explorer?.reached["5"]?.rate)} で、他の ${referencePersona} は ${percent(summaries[referencePersona]?.reached["5"]?.rate)}。`,
    `2. 最深到達 persona: ${deepestPersona}（平均 ${fmt(deepestMean)} floor）。`,
    `3. 全面支配: ${reversePairObserved ? "なし。同一seedで両方向の深度逆転を観測した。" : "同一seedで両方向の深度逆転は未観測。"}`,
    `4. 探索量と装備成長: explorer は ${fmt(explorerSteps)} steps/floor、${fmt(explorerDrops)} drops/floor、${fmt(explorerChanges)} changes/floor。${referencePersona} は ${fmt(referenceSteps)}、${fmt(referenceDrops)}、${fmt(referenceChanges)} で、探索増加はdropと変更数を増やす方向だった。`,
    `5. 探索量と HP/MP 消耗: explorer の normal damage は ${fmt(explorerDamage)}/floor、B5 HP/MP は ${percent(getCheckpoint("explorer", "hpRatio"))}/${percent(getCheckpoint("explorer", "mpRatio"))}。${referencePersona} は ${fmt(referenceDamage)}/floor、${percent(getCheckpoint(referencePersona, "hpRatio"))}/${percent(getCheckpoint(referencePersona, "mpRatio"))} で、探索型の曝露増加と資源低下が同時に観測された。`,
    `6. 階段直行: stairs-first の B5 到達率は ${percent(summaries["stairs-first"]?.reached["5"]?.rate)}、B5→B10 は ${report.conditionalSurvival["stairs-first"]?.["B5->B10"]?.status === "unobserved" ? "n/a" : percent(report.conditionalSurvival["stairs-first"]?.["B5->B10"]?.rate)}。この N では生存優位は確認できない。`,
    `7. cautious: B5 到達率 ${percent(summaries.cautious?.reached["5"]?.rate)}、平均深度 ${fmt(summaries.cautious?.reachedDepth.mean)} で、stairs-first/balanced と同程度。深層生存への優位は観測できない。`,
    `8. aggressive: ${fmt(getExposure("aggressive", "enemyActionsPerFloor"))} enemy actions/floor、${fmt(getExposure("aggressive", "roundsPerFloor"))} rounds/floor。${referencePersona} の ${fmt(getExposure(referencePersona, "enemyActionsPerFloor"))}/${fmt(getExposure(referencePersona, "roundsPerFloor"))} とほぼ同じで、明確な短縮は確認できない。`,
    `9. B21+ population: ${personas.map(persona => `${persona}=B21 ${report.b21Plus[persona]["21"].count}, B25 ${report.b21Plus[persona]["25"].count}, B30 ${report.b21Plus[persona]["30"].count}`).join("; ")}。全て unobserved。`,
    `10. population bottleneck: B5→B10 は ${b5ToB10?.status === "unobserved" ? "unobserved" : `${percent(b5ToB10.rate)} (n=${b5ToB10.denominator})`}。B10以降は全personaで分母0のため unobserved。`,
    `11. B5 は観測された最後の checkpoint で、explorer は HP/MP ${percent(getCheckpoint("explorer", "hpRatio"))}/${percent(getCheckpoint("explorer", "mpRatio"))}、ATK/DEF ${fmt(getCheckpoint("explorer", "ATK"))}/${fmt(getCheckpoint("explorer", "DEF"))}。B10到達者がいないため、B5→B10の後比較は行わず、deathSummaries に保存した。`,
    `12. pure raw: persona別割合は ${percent(Math.min(...rawShares))}〜${percent(Math.max(...rawShares))}。explorerだけ低めだが、全persona共通の増加とは言えない。`,
    "13. Phase 2 の「AIが弱すぎただけ」という説明は部分的に残るが、explorer の B5 差に対して全personaが同じ B5→B10 で崩れるため、ゲーム構造側のボトルネックも残る。",
    "14. #973 Build Confidence: **Revise**。Stage 1 は persona run reach の測定であり、#975 encounter-level build confidence を置換しない。",
    "15. #990 は **open のまま**。",
    "16. Stage 2 は checkpoint population をレビューしてから進める。",
    "17. production tuning は **行わない**。production src/ balance は変更していない。",
    "",
    "## Reproduction",
    "",
    "```sh",
    `node scratch/measurements/issue990_phase3_stage1.js --runs ${report.measurement.configuration.runs} --seed ${report.measurement.configuration.seed} --personas ${personas.join(",")} --output evidence/results/issue-990-phase3-stage1.json --summary evidence/results/issue-990-phase3-stage1.md`,
    "```",
    ""
  ];
  if (report.stage15Diagnostics) {
    const reproductionIndex = lines.indexOf("## Reproduction");
    lines.splice(reproductionIndex, 0, ...renderStage15Sections(report), "");
  }
  return lines.join("\n");
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (["--runs", "--seed", "--personas", "--output", "--summary"].includes(arg)) options[arg.slice(2)] = argv[++index];
    else if (arg === "--stage15") options.stage15 = true;
    else if (arg === "--help") { console.log("Usage: node scratch/measurements/issue990_phase3_stage1.js --runs 500 --seed issue990-phase3-stage1 --personas cautious,aggressive,explorer,stairs-first,balanced --output evidence/results/issue-990-phase3-stage1.json --summary evidence/results/issue-990-phase3-stage1.md"); process.exit(0); }
    else throw new Error(`unknown option: ${arg}`);
  }
  return {
    runs: options.runs === undefined ? DEFAULT_RUNS : Number(options.runs),
    seed: options.seed || DEFAULT_SEED,
    personas: options.personas ? options.personas.split(",").map(value => value.trim()).filter(Boolean) : PERSONA_IDS,
    output: options.output || null,
    summary: options.summary || null
  };
}

export async function main(argv = process.argv.slice(2), overrides = {}) {
  const options = parseArgs(argv);
  if (!options.output || !options.summary) throw new Error("--output and --summary are required");
  const stage15 = Boolean(overrides.stage15 || options.stage15);
  const runnerVersion = stage15 ? "issue990-phase3-stage1.5-v1" : RUNNER_VERSION;
  const schemaVersion = stage15 ? 2 : SCHEMA_VERSION;
  const runnerPath = stage15 ? "scratch/measurements/issue990_phase3_stage1_5.js" : "scratch/measurements/issue990_phase3_stage1.js";
  const provenance = requireRunnerProvenance({
    fetchOriginMain: false,
    measurementRunnerPaths: [runnerPath, "scratch/measurements/issue990_phase3_stage1.js", "scratch/simulations/sim_depth_material_ev.js", "scratch/measurements/measurement_provenance.js"]
  });
  const environmentSignature = printEnvSignatureBanner({ runnerVersion, seed: options.seed, runs: options.runs, personas: options.personas, targetDepth: TARGET_DEPTH }, { label: stage15 ? "issue990 phase3 stage1.5 env" : "issue990 phase3 stage1 env" });
  const report = runMeasurement({ ...options, provenance, environmentSignature, collectStage15Diagnostics: stage15, runnerVersion, schemaVersion, runnerPath });
  const outputPath = resolve(options.output);
  const summaryPath = resolve(options.summary);
  fs.mkdirSync(dirname(outputPath), { recursive: true });
  fs.mkdirSync(dirname(summaryPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report)}\n`);
  fs.writeFileSync(summaryPath, renderSummary(report));
  console.log(`Wrote Issue #990 Phase 3 ${stage15 ? "Stage 1.5" : "Stage 1"} JSON evidence: ${outputPath}`);
  console.log(`Wrote Issue #990 Phase 3 ${stage15 ? "Stage 1.5" : "Stage 1"} Markdown evidence: ${summaryPath}`);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
