// sim-scope: run — #499 浅い階回復供給の候補A/B/C比較
/* global console, process */

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
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
const R95 = 1.959963984540054;
const TARGET_DEPTH = 21;
const HEAL_POTION_UNIT_HP = 15;
const TARGET_EXTRA_UNITS = 0.390;
const DEFAULT_CAMP_TIME_COST = 6;
const OUTPUT_STEM = "issue-499-shallow-recovery-supply";
const SMOKE = process.env.ISSUE499_SMOKE === "1";

const ENV_DEFAULTS = Object.freeze({
  SIM_PRESET: "",
  SIM_SEED: "499",
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
  throw new Error("Issue #499 measurement omits SIM_PARALLEL and SIM_MAP_CACHE_ENTRIES");
}

const RUNS_PER_CLASS = SMOKE ? 2 : Number(process.env.SIM_RUNS);
const CALIBRATION_RUNS = SMOKE ? 1 : Number(process.env.SIM_CALIBRATION_RUNS);
const TUNING_RUNS = SMOKE ? 2 : Number(process.env.ISSUE499_TUNING_RUNS || 500);
const TUNING_ITERATIONS = SMOKE ? 2 : Number(process.env.ISSUE499_TUNING_ITERATIONS || 12);
function parseOptionalChance(value, name) {
  if (value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`${name} must be between 0 and 1: ${value}`);
  }
  return parsed;
}

const FIXED_CANDIDATE_VALUES = Object.freeze({
  a: parseOptionalChance(process.env.ISSUE499_FIXED_A_CHANCE, "ISSUE499_FIXED_A_CHANCE"),
  b: parseOptionalChance(process.env.ISSUE499_FIXED_B_CHANCE, "ISSUE499_FIXED_B_CHANCE"),
  c: parseOptionalChance(process.env.ISSUE499_FIXED_C_RATE, "ISSUE499_FIXED_C_RATE")
});
const HAS_FIXED_CANDIDATE_VALUES = Object.values(FIXED_CANDIDATE_VALUES)
  .some(value => value !== null);
const CAMP_TIME_COST = Number(
  process.env.ISSUE499_CAMP_TIME_COST || DEFAULT_CAMP_TIME_COST
);
const TARGET_EXTRA = Number(
  process.env.ISSUE499_TARGET_EXTRA_UNITS || TARGET_EXTRA_UNITS
);
if (!Number.isInteger(RUNS_PER_CLASS) || RUNS_PER_CLASS < 1) {
  throw new Error(`SIM_RUNS must be a positive integer: ${RUNS_PER_CLASS}`);
}
if (!Number.isInteger(CALIBRATION_RUNS) || CALIBRATION_RUNS < 1) {
  throw new Error(`SIM_CALIBRATION_RUNS must be a positive integer: ${CALIBRATION_RUNS}`);
}
if (!Number.isInteger(TUNING_RUNS) || TUNING_RUNS < 1) {
  throw new Error(`ISSUE499_TUNING_RUNS must be a positive integer: ${TUNING_RUNS}`);
}
if (!Number.isInteger(TUNING_ITERATIONS) || TUNING_ITERATIONS < 1) {
  throw new Error(`ISSUE499_TUNING_ITERATIONS must be a positive integer: ${TUNING_ITERATIONS}`);
}
if (!Number.isInteger(CAMP_TIME_COST) || CAMP_TIME_COST < 0) {
  throw new Error(`ISSUE499_CAMP_TIME_COST must be a non-negative integer: ${CAMP_TIME_COST}`);
}
if (!Number.isFinite(TARGET_EXTRA) || TARGET_EXTRA <= 0) {
  throw new Error(`ISSUE499_TARGET_EXTRA_UNITS must be positive: ${TARGET_EXTRA}`);
}

const {
  calibrateCoreScoringProfile,
  getResolvedSimulationEnv,
  getScenarioById,
  resetSimulationRandom,
  simulateRun,
  SIM_CLASSES
} = await import("./sim_depth_material_ev.js");
let CURRENT_SCORING_PROFILES = null;

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

function createCondition(id, label, kind, scenario = {}) {
  return { id, label, kind, scenario };
}

const BASELINE_CONDITION = createCondition(
  "baseline",
  "基準線",
  "baseline"
);

function scenarioWithCondition(condition, scenarioId) {
  return {
    ...getScenarioById(scenarioId),
    ...condition.scenario
  };
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

function totalMaterials(materials = {}) {
  return Object.values(materials).reduce((sum, value) => sum + (Number(value) || 0), 0);
}

function compactRun(result, condition, task) {
  const acquired = result.healPotionsAcquiredBySource || {};
  const materialSourceCounts = result.materialSourceCounts || {};
  const sourceMaterials = Object.fromEntries(
    Object.entries(materialSourceCounts).map(([source, values]) => [
      source,
      totalMaterials(values)
    ])
  );
  const extraUnits = condition.kind === "candidate-c"
    ? (result.extraCampHealingHp || 0) / HEAL_POTION_UNIT_HP
    : condition.kind === "candidate-a"
      ? acquired["chest-extra"] || 0
      : condition.kind === "candidate-b"
        ? acquired["combat-extra"] || 0
        : 0;
  const outcome = result.outcome || (result.died ? "death" : "retreat");
  return {
    conditionId: condition.id,
    className: task.className,
    scenarioId: task.scenarioId,
    runIndex: task.runIndex,
    outcome,
    reachedFloor: result.reachedFloor,
    deathFloor: result.deathFloor,
    endpoints: {
      b5: endpoint(result, 5),
      b10: endpoint(result, 10)
    },
    bankedMaterials: result.bankedMaterials,
    carriedMaterials: result.carriedMaterials,
    materialAcquired: result.materialAcquired,
    sourceMaterials,
    timeCost: result.timeCost,
    materialEvPerTime: result.timeCost > 0
      ? result.bankedMaterials / result.timeCost
      : 0,
    bankRetentionRate: result.carriedMaterials > 0
      ? result.bankedMaterials / result.carriedMaterials
      : 0,
    recovery: {
      naturalChest: acquired.chest || 0,
      extraChest: acquired["chest-extra"] || 0,
      extraCombat: acquired["combat-extra"] || 0,
      total: Object.values(acquired).reduce((sum, value) => sum + value, 0),
      extraUnits,
      shortages: result.recoveryPotionShortages || 0,
      depleted: result.finalHealPotions === 0,
      finalHealPotions: result.finalHealPotions || 0,
      finalRecoveryPotions: result.finalRecoveryPotions || 0,
      acquiredBySource: { ...acquired },
      consumedBySource: { ...(result.healPotionsConsumedBySource || {}) }
    },
    inventory: {
      finalSlots: result.finalInventorySlots || 0,
      pickupAttempts: { ...(result.pickupAttemptsBySource || {}) },
      pickupRejections: { ...(result.pickupRejectionsBySource || {}) },
      pickupRejectionsByCategory: { ...(result.pickupRejectionsByCategory || {}) }
    },
    equipment: {
      total: result.equipmentFound || 0,
      chest: result.equipmentFoundBySource?.chest || 0,
      combat: result.equipmentFoundBySource?.combat || 0,
      chestReplacedByHealPotion: result.chestEquipmentReplacedByHealPotion || 0
    },
    chestMaterials: sourceMaterials.chest || 0,
    chest: {
      opened: result.chestsOpened || 0,
      extraGenerated: result.chestHealPotionExtraGenerated || 0,
      replacementGenerated: result.chestHealPotionReplacementGenerated || 0,
      equipmentRate: result.chestsOpened > 0
        ? (result.equipmentFoundBySource?.chest || 0) / result.chestsOpened
        : 0,
      materialRate: result.chestsOpened > 0
        ? (sourceMaterials.chest || 0) / result.chestsOpened
        : 0
    },
    combat: {
      extraGenerated: result.enemyHealPotionExtraGenerated || 0
    },
    camp: {
      extraRests: result.extraCampRestCount || 0,
      extraHealingHp: result.extraCampHealingHp || 0,
      timeCost: result.extraCampTimeCost || 0
    }
  };
}

export function runIssue499Task(task, context) {
  const condition = context.conditions[task.conditionId];
  const scenario = scenarioWithCondition(condition, task.scenarioId);
  resetSimulationRandom(hashSeed(
    `${process.env.SIM_SEED}:${condition.id}:${task.className}:${task.runIndex}`
  ));
  const result = simulateRun({
    className: task.className,
    startFloor: 1,
    targetDepth: TARGET_DEPTH,
    runIndex: task.runIndex,
    seriesId: `issue499-${condition.id}`,
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
  if (stats.n === 0) return { n: 0, mean: null, ci95: null, status: "未観測" };
  const mean = stats.sum / stats.n;
  if (stats.n < 2) return { n: stats.n, mean, ci95: null, status: "未確定" };
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
    bankedMaterials: createStats(),
    materialAcquired: createStats(),
    timeCost: createStats(),
    materialEvPerTime: createStats(),
    bankRetentionRate: createStats(),
    survival: 0,
    deaths: 0,
    outcomes: { 5: createOutcomeCounts(), 10: createOutcomeCounts() },
    sourceMaterials: Object.fromEntries(
      ["combat", "chest", "quest", "other"].map(source => [source, createStats()])
    ),
    recovery: {
      naturalChest: createStats(),
      extraChest: createStats(),
      extraCombat: createStats(),
      total: createStats(),
      extraUnits: createStats(),
      shortages: createStats(),
      depleted: 0,
      finalHealPotions: createStats(),
      finalRecoveryPotions: createStats()
    },
    inventory: {
      finalSlots: createStats(),
      pickupAttempts: { chest: 0, combat: 0, material: 0 },
      pickupRejections: { chest: 0, combat: 0, material: 0 },
      pickupRejectionsByCategory: { item: 0, equipment: 0, material: 0 }
    },
    equipment: {
      total: createStats(),
      chest: createStats(),
      combat: createStats(),
      chestReplacedByHealPotion: createStats()
    },
    chestMaterials: createStats(),
    chest: {
      opened: createStats(),
      extraGenerated: createStats(),
      replacementGenerated: createStats(),
      equipmentRate: createStats(),
      materialRate: createStats()
    },
    combat: { extraGenerated: createStats() },
    camp: {
      extraRests: createStats(),
      extraHealingHp: createStats(),
      timeCost: createStats()
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
  addStats(accumulator.bankedMaterials, row.bankedMaterials);
  addStats(accumulator.materialAcquired, row.materialAcquired);
  addStats(accumulator.timeCost, row.timeCost);
  addStats(accumulator.materialEvPerTime, row.materialEvPerTime);
  addStats(accumulator.bankRetentionRate, row.bankRetentionRate);
  accumulator.survival += Number(row.outcome === "retreat");
  accumulator.deaths += Number(row.outcome === "death");
  addEndpoint(accumulator.outcomes[5], row.endpoints.b5);
  addEndpoint(accumulator.outcomes[10], row.endpoints.b10);
  Object.entries(row.sourceMaterials).forEach(([source, value]) => {
    if (!accumulator.sourceMaterials[source]) accumulator.sourceMaterials[source] = createStats();
    addStats(accumulator.sourceMaterials[source], value);
  });
  Object.entries(accumulator.recovery).forEach(([key, stats]) => {
    if (key === "depleted") return;
    addStats(stats, row.recovery[key]);
  });
  accumulator.recovery.depleted += Number(row.recovery.depleted);
  addStats(accumulator.inventory.finalSlots, row.inventory.finalSlots);
  Object.entries(accumulator.inventory.pickupAttempts).forEach(([source]) => {
    accumulator.inventory.pickupAttempts[source] += row.inventory.pickupAttempts[source] || 0;
    accumulator.inventory.pickupRejections[source] += row.inventory.pickupRejections[source] || 0;
  });
  Object.entries(accumulator.inventory.pickupRejectionsByCategory).forEach(([category]) => {
    accumulator.inventory.pickupRejectionsByCategory[category] +=
      row.inventory.pickupRejectionsByCategory[category] || 0;
  });
  Object.entries(accumulator.equipment).forEach(([key, stats]) => addStats(stats, row.equipment[key]));
  addStats(accumulator.chestMaterials, row.chestMaterials);
  Object.entries(accumulator.chest).forEach(([key, stats]) => addStats(stats, row.chest[key]));
  addStats(accumulator.combat.extraGenerated, row.combat.extraGenerated);
  Object.entries(accumulator.camp).forEach(([key, stats]) => addStats(stats, row.camp[key]));
}

function summarizeOutcomes(outcomes, runs) {
  const split = outcomes.breakthroughs + outcomes.deaths + outcomes.retreats;
  if (split !== outcomes.entrants) throw new Error("endpoint split does not sum to entrants");
  return {
    entrant: wilson(outcomes.entrants, runs),
    breakthrough: wilson(outcomes.breakthroughs, outcomes.entrants),
    death: wilson(outcomes.deaths, outcomes.entrants),
    retreat: wilson(outcomes.retreats, outcomes.entrants),
    splitSumsTo100: split === outcomes.entrants
  };
}

function summarizeAccumulator(accumulator) {
  const runs = accumulator.runs;
  return {
    runs,
    averageReachedFloor: summarizeStats(accumulator.reachedFloor),
    survivalRate: wilson(accumulator.survival, runs),
    overallDeathRate: wilson(accumulator.deaths, runs),
    averageBankedMaterials: summarizeStats(accumulator.bankedMaterials),
    materialAcquired: summarizeStats(accumulator.materialAcquired),
    timeCost: summarizeStats(accumulator.timeCost),
    materialEvPerTime: summarizeStats(accumulator.materialEvPerTime),
    bankRetentionRate: summarizeStats(accumulator.bankRetentionRate),
    outcomes: {
      B5: summarizeOutcomes(accumulator.outcomes[5], runs),
      B10: summarizeOutcomes(accumulator.outcomes[10], runs)
    },
    sourceMaterials: Object.fromEntries(
      Object.entries(accumulator.sourceMaterials).map(([source, stats]) => [
        source,
        summarizeStats(stats)
      ])
    ),
    recovery: {
      naturalChest: summarizeStats(accumulator.recovery.naturalChest),
      extraChest: summarizeStats(accumulator.recovery.extraChest),
      extraCombat: summarizeStats(accumulator.recovery.extraCombat),
      total: summarizeStats(accumulator.recovery.total),
      extraUnits: summarizeStats(accumulator.recovery.extraUnits),
      shortages: summarizeStats(accumulator.recovery.shortages),
      depletionRate: wilson(accumulator.recovery.depleted, runs),
      finalHealPotions: summarizeStats(accumulator.recovery.finalHealPotions),
      finalRecoveryPotions: summarizeStats(accumulator.recovery.finalRecoveryPotions)
    },
    inventory: {
      finalSlots: summarizeStats(accumulator.inventory.finalSlots),
      pickupAttemptsPerRun: Object.fromEntries(
        Object.entries(accumulator.inventory.pickupAttempts).map(([source, count]) => [
          source,
          count / Math.max(1, runs)
        ])
      ),
      pickupRejectionsPerRun: Object.fromEntries(
        Object.entries(accumulator.inventory.pickupRejections).map(([source, count]) => [
          source,
          count / Math.max(1, runs)
        ])
      ),
      pickupRejectionsByCategoryPerRun: Object.fromEntries(
        Object.entries(accumulator.inventory.pickupRejectionsByCategory).map(([category, count]) => [
          category,
          count / Math.max(1, runs)
        ])
      ),
      pickupRejectionCounts: {
        bySource: { ...accumulator.inventory.pickupRejections },
        byCategory: { ...accumulator.inventory.pickupRejectionsByCategory }
      },
      limit: 20
    },
    equipment: Object.fromEntries(
      Object.entries(accumulator.equipment).map(([key, stats]) => [key, summarizeStats(stats)])
    ),
    chestMaterials: summarizeStats(accumulator.chestMaterials),
    chest: Object.fromEntries(
      Object.entries(accumulator.chest).map(([key, stats]) => [key, summarizeStats(stats)])
    ),
    combat: { extraGenerated: summarizeStats(accumulator.combat.extraGenerated) },
    camp: Object.fromEntries(
      Object.entries(accumulator.camp).map(([key, stats]) => [key, summarizeStats(stats)])
    )
  };
}

export function conditionSummary(rows) {
  const accumulator = createAccumulator();
  const byClass = Object.fromEntries(BASIC_CLASSES.map(className => [className, createAccumulator()]));
  rows.forEach(row => {
    addRun(accumulator, row);
    addRun(byClass[row.className], row);
  });
  return {
    overall: summarizeAccumulator(accumulator),
    byClass: Object.fromEntries(
      Object.entries(byClass).map(([className, value]) => [className, summarizeAccumulator(value)])
    )
  };
}

function mean(rows, selector) {
  if (!rows.length) return null;
  return rows.reduce((sum, row) => sum + selector(row), 0) / rows.length;
}

function pilotRows(condition, scoringProfiles) {
  const context = {
    conditions: { [condition.id]: condition },
    scoringProfiles
  };
  const rows = [];
  BASIC_CLASSES.forEach(className => {
    for (let sampleIndex = 0; sampleIndex < TUNING_RUNS; sampleIndex++) {
      const runIndex = Math.floor(sampleIndex * RUNS_PER_CLASS / TUNING_RUNS);
      rows.push(runIssue499Task({
        conditionId: condition.id,
        className,
        runIndex,
        runsPerClass: RUNS_PER_CLASS,
        scenarioId: scenarioForRun(runIndex, RUNS_PER_CLASS)
      }, context));
    }
  });
  return rows;
}

function tuneCondition({ id, label, kind, field }) {
  let low = 0;
  let high = 1;
  let best = null;
  const iterations = [];
  for (let iteration = 0; iteration < TUNING_ITERATIONS; iteration++) {
    const value = (low + high) / 2;
    const scenario = kind === "candidate-a"
      ? { chestHealPotionReplacementChance: value }
      : kind === "candidate-b"
        ? { enemyHealPotionDropChance: value }
        : {
            extraCampFloors: [1, 3],
            extraCampRecoveryRate: value,
            extraCampTimeCost: CAMP_TIME_COST
          };
    const condition = createCondition(id, label, kind, scenario);
    const rows = pilotRows(condition, CURRENT_SCORING_PROFILES);
    const supplyUnits = mean(rows, row => row.recovery.extraUnits);
    const distance = Math.abs(supplyUnits - TARGET_EXTRA);
    iterations.push({ value, supplyUnits, distance });
    if (!best || distance < best.distance) best = { value, supplyUnits, distance };
    if (supplyUnits < TARGET_EXTRA) low = value;
    else high = value;
  }
  const scenario = kind === "candidate-a"
    ? { chestHealPotionReplacementChance: best.value }
    : kind === "candidate-b"
      ? { enemyHealPotionDropChance: best.value }
      : {
          extraCampFloors: [1, 3],
          extraCampRecoveryRate: best.value,
          extraCampTimeCost: CAMP_TIME_COST
        };
  return {
    condition: createCondition(id, label, kind, scenario),
    tuning: {
      targetExtraUnits: TARGET_EXTRA,
      tuningRunsPerClass: TUNING_RUNS,
      tuningIterations: TUNING_ITERATIONS,
      parameter: field,
      chosenValue: best.value,
      pilotSupplyUnits: best.supplyUnits,
      iterations
    }
  };
}

function fixedCondition({ id, label, kind, field, value }) {
  const scenario = kind === "candidate-a"
    ? { chestHealPotionReplacementChance: value }
    : kind === "candidate-b"
      ? { enemyHealPotionDropChance: value }
      : {
          extraCampFloors: [1, 3],
          extraCampRecoveryRate: value,
          extraCampTimeCost: CAMP_TIME_COST
        };
  return {
    condition: createCondition(id, label, kind, scenario),
    tuning: {
      targetExtraUnits: TARGET_EXTRA,
      tuningRunsPerClass: 0,
      tuningIterations: 0,
      parameter: field,
      chosenValue: value,
      pilotSupplyUnits: null,
      iterations: [],
      mode: "fixed same-run calibration"
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

function formatEndpoint(endpointSummary) {
  return [
    formatRate(endpointSummary.entrant),
    formatRate(endpointSummary.breakthrough),
    formatRate(endpointSummary.death),
    formatRate(endpointSummary.retreat)
  ].join(" / ");
}

export function acceptanceFor(conditionSummaryValue, baselineSummary) {
  const b5Death = conditionSummaryValue.outcomes.B5.death;
  const b10Death = conditionSummaryValue.outcomes.B10.death;
  const ev = conditionSummaryValue.materialEvPerTime.mean;
  const isUsableRate = rate => rate?.rate !== null && rate?.status === "監査";
  const isUsableMean = stat => stat?.mean !== null && stat?.status === "監査";
  const checks = {
    b10Entrant: {
      value: conditionSummaryValue.outcomes.B10.entrant.rate,
      target: 0.10,
      pass: isUsableRate(conditionSummaryValue.outcomes.B10.entrant) &&
        conditionSummaryValue.outcomes.B10.entrant.rate >= 0.10
    },
    b5Death: {
      value: b5Death.rate,
      target: 0.309,
      pass: isUsableRate(b5Death) && b5Death.rate <= 0.309
    },
    b10Death: {
      value: b10Death.rate,
      target: 0.15,
      pass: isUsableRate(b10Death) && b10Death.rate <= 0.15
    },
    materialEvPerTime: {
      value: ev,
      target: baselineSummary.materialEvPerTime.mean * 0.8,
      pass: isUsableMean(conditionSummaryValue.materialEvPerTime) &&
        isUsableMean(baselineSummary.materialEvPerTime) &&
        ev >= baselineSummary.materialEvPerTime.mean * 0.8
    }
  };
  return {
    checks,
    pass: Object.values(checks).every(check => check.pass)
  };
}

function buildMarkdown(summary) {
  const lines = [];
  const tuningDescription = summary.tuningMode === "fixed same-run calibration"
    ? `fixed same-run calibration（A=${formatNumber(summary.fixedCandidateValues.a, 5)} / B=${formatNumber(summary.fixedCandidateValues.b, 5)} / C=${formatNumber(summary.fixedCandidateValues.c, 5)}）`
    : `${summary.tuningRunsPerClass}/職×${summary.tuningIterations}反復 pilot binary search`;
  lines.push("# #499 浅い階回復供給 測定結果", "");
  lines.push("## 結論", "");
  lines.push(`- 同量目標: 現行宝箱傷薬 **${formatNumber(summary.baselineNaturalChestTarget, 3)}本/run** を基準に、追加回復 **${formatNumber(summary.targetExtraUnits, 3)}本/run**。Cは追加camp HPを15で割った傷薬換算。`);
  lines.push(`- 採用候補: **${summary.decision.adoptedLabel}**。受入判定は B10 entrant≥10%、B5死亡≤30.9%、B10死亡≤15.0%、素材EV/時間≥基準線×0.8。`);
  lines.push(`- 候補Aの宝箱競合: 装備・素材差を下記へ記録。候補Aは本体枠置換、候補B/Cは追加ドロップ/休息のsim what-if。`, "");
  lines.push("## 条件", "");
  lines.push(`- seed=${summary.seed}、targetDepth=B20終了、4職、工房分布=${WORKSHOP_DISTRIBUTION.map(row => `${row.scenarioId}:${row.observedRuns}/${WORKSHOP_TOTAL}`).join(" / ")}`);
  lines.push(`- N=${summary.runsPerClass}/職、calibration=${summary.calibrationRuns}/工房状態、tuning=${tuningDescription}、休息時間コスト=${summary.campTimeCost}歩。`);
  lines.push("- 現行緩和: `TOWN_PORTAL`、状態異常治療、鑑定粉、現行戦闘/報酬/装備更新、既存B2/B4 camp、#481出発kit。");
  lines.push("- 条件間CIは独立条件として解釈。Wilson 95% CI、平均値は正規近似95% CI。N<30は未確定。", "");
  lines.push("## 4職合算 指定指標", "");
  lines.push("|条件|平均到達floor|B5 E/X/D/R|B10 E/X/D/R|生還率|素材EV/時間|bank保持率|");
  lines.push("|---|---:|---|---|---|---|---|");
  summary.conditions.forEach(condition => {
    const row = condition.summary.overall;
    lines.push(`|${condition.label}|${formatStat(row.averageReachedFloor)}|${formatEndpoint(row.outcomes.B5)}|${formatEndpoint(row.outcomes.B10)}|${formatRate(row.survivalRate)}|${formatStat(row.materialEvPerTime)}|${formatStat(row.bankRetentionRate)}|`);
  });
  lines.push("", "E/X/D/R = entrant / breakthrough / death / retreat。各endpoint内 split は100%。", "");
  lines.push("## 同量調整", "");
  lines.push("|候補|simパラメータ|調整値|tuning実測追加回復/run|");
  lines.push("|---|---|---:|---:|");
  [["A", summary.tuning.candidateA], ["B", summary.tuning.candidateB], ["C", summary.tuning.candidateC]].forEach(([label, tuning]) => {
    lines.push(`|${label}|${tuning.parameter}|${formatNumber(tuning.chosenValue, 5)}|${formatNumber(tuning.pilotSupplyUnits, 3)}|`);
  });
  lines.push(``, `本測定での実測追加回復は条件別表へ記録。目標=${formatNumber(summary.targetExtraUnits, 3)}本/run。`, "");
  lines.push("## 職業別 B5/B10", "");
  lines.push("|条件|職|平均floor|B5 E/X/D/R|B10 E/X/D/R|生還率|素材EV/時間|bank保持率|");
  lines.push("|---|---|---:|---|---|---|---|---|");
  summary.conditions.forEach(condition => {
    BASIC_CLASSES.forEach(className => {
      const row = condition.summary.byClass[className];
      lines.push(`|${condition.label}|${className}|${formatStat(row.averageReachedFloor)}|${formatEndpoint(row.outcomes.B5)}|${formatEndpoint(row.outcomes.B10)}|${formatRate(row.survivalRate)}|${formatStat(row.materialEvPerTime)}|${formatStat(row.bankRetentionRate)}|`);
    });
  });
  lines.push("", "## 回復量・枯渇・入手内訳", "");
  lines.push("|条件|自然宝箱傷薬/run|追加回復(傷薬換算)/run|追加生成/run|C追加回復HP/run|傷薬総入手/run|傷薬枯渇率|回復不足/run|終了傷薬/run|終了回復薬/run|");
  lines.push("|---|---:|---:|---:|---:|---:|---|---:|---:|---:|");
  summary.conditions.forEach(condition => {
    const row = condition.summary.overall;
    const recovery = row.recovery;
    const generated = condition.kind === "candidate-a"
      ? row.chest.replacementGenerated
      : condition.kind === "candidate-b"
        ? row.combat.extraGenerated
        : null;
    const campHealingHp = condition.kind === "candidate-c"
      ? row.camp.extraHealingHp
      : null;
    lines.push(`|${condition.label}|${formatStat(recovery.naturalChest)}|${formatStat(recovery.extraUnits)}|${formatStat(generated)}|${formatStat(campHealingHp)}|${formatStat(recovery.total)}|${formatRate(recovery.depletionRate)}|${formatStat(recovery.shortages)}|${formatStat(recovery.finalHealPotions)}|${formatStat(recovery.finalRecoveryPotions)}|`);
  });
  lines.push("", "入手 source: `starting` / `departureCraft` / `chest` / `chest-extra` / `combat-extra` / `merchant` / `other`。", "");
  lines.push("## 所持枠20 拾得拒否", "");
  lines.push("|条件|最終slots|宝箱試行/run|宝箱拒否/run|戦闘試行/run|戦闘拒否/run|素材試行/run|素材拒否/run|装備拒否/run|");
  lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|");
  summary.conditions.forEach(condition => {
    const inventory = condition.summary.overall.inventory;
    lines.push(`|${condition.label}|${formatStat(inventory.finalSlots)}|${formatNumber(inventory.pickupAttemptsPerRun.chest)}|${formatNumber(inventory.pickupRejectionsPerRun.chest)}|${formatNumber(inventory.pickupAttemptsPerRun.combat)}|${formatNumber(inventory.pickupRejectionsPerRun.combat)}|${formatNumber(inventory.pickupAttemptsPerRun.material)}|${formatNumber(inventory.pickupRejectionsPerRun.material)}|${formatNumber(inventory.pickupRejectionsByCategoryPerRun.equipment)}|`);
  });
  lines.push("", "素材はゲーム設計上 inventory slot 外。素材拒否0を測定経路の仕様として記録。", "");
  lines.push("## 候補A 宝箱トレードオフ", "");
  lines.push("|指標|基準線|A:宝箱枠置換|差分(A−基準線)|");
  lines.push("|---|---:|---:|---:|");
  const baseline = summary.conditions[0].summary.overall;
  const candidateA = summary.conditions.find(condition => condition.kind === "candidate-a").summary.overall;
  const tradeoffRows = [
    ["宝箱装備/宝箱", baseline.chest.equipmentRate, candidateA.chest.equipmentRate],
    ["宝箱素材/宝箱", baseline.chest.materialRate, candidateA.chest.materialRate],
    ["本体枠置換/run", baseline.chest.replacementGenerated, candidateA.chest.replacementGenerated],
    ["置換元装備/run", baseline.equipment.chestReplacedByHealPotion, candidateA.equipment.chestReplacedByHealPotion]
  ];
  tradeoffRows.forEach(([label, before, after]) => {
    lines.push(`|${label}|${formatStat(before)}|${formatStat(after)}|${formatNumber(after.mean - before.mean)}|`);
  });
  lines.push("", "宝箱素材束はmain itemと別抽選のため、現行simでは置換による素材減少は0。装備減少を別指標として報告。", "");
  lines.push("## 受入判定", "");
  lines.push("|候補|B10 entrant≥10%|B5死亡≤30.9%|B10死亡≤15.0%|素材EV/時間≥基準線×0.8|総合|");
  lines.push("|---|---|---|---|---|---|");
  summary.conditions.forEach(condition => {
    const acceptance = summary.acceptance[condition.id];
    const checks = acceptance.checks;
    lines.push(`|${condition.label}|${formatRate(condition.summary.overall.outcomes.B10.entrant)} / ${checks.b10Entrant.pass ? "PASS" : "FAIL"}|${formatRate(condition.summary.overall.outcomes.B5.death)} / ${checks.b5Death.pass ? "PASS" : "FAIL"}|${formatRate(condition.summary.overall.outcomes.B10.death)} / ${checks.b10Death.pass ? "PASS" : "FAIL"}|${formatNumber(checks.materialEvPerTime.value)} ≥ ${formatNumber(checks.materialEvPerTime.target)} / ${checks.materialEvPerTime.pass ? "PASS" : "FAIL"}|${acceptance.pass ? "PASS" : "FAIL"}|`);
  });
  lines.push("", "率の分母30未満は未確定。基準線は受入候補ではなく比較元。", "");
  lines.push("## #461下流取り直し対象", "");
  lines.push("- #470: completed-build / quality quartile のB5判定");
  lines.push("- #471: core装備率監視");
  lines.push("- #475: core個数軸のB5 endpoint");
  lines.push("- #468 / #473: 宝箱解除・解除方針監査");
  lines.push("- #480: 罠方針比較");
  lines.push("本測定は回復供給候補比較。上記下流値は採用候補をゲーム側へ反映したPRで再測定する。", "");
  lines.push("## 実行記録", "");
  lines.push(`- env hash: \`${summary.envHash}\``);
  lines.push(`- raw JSONL SHA-256: \`${summary.rawSha256}\``);
  lines.push(`- calibration wall/CPU: ${formatNumber(summary.calibration.wallSeconds, 2)}s / ${formatNumber(summary.calibration.cpuSeconds, 2)}s`);
  lines.push(`- measurement wall/CPU: ${formatNumber(summary.runtime.wallSeconds, 2)}s / ${formatNumber(summary.runtime.cpuSeconds, 2)}s`);
  lines.push(`- resolved parallelism: ${summary.runtime.resolvedParallelism}（SIM_PARALLEL未指定、runtime default）`);
  lines.push(`- 再現: \`${summary.reproductionCommand}\``);
  lines.push("- 採用時の設計canon: game-design / balance-simulation を同一PRで更新。未採用なら本PRはsim what-ifのみ。", "");
  return `${lines.join("\n")}\n`;
}

async function buildScoringProfiles() {
  const profiles = {};
  const started = performance.now();
  const cpuStarted = process.cpuUsage();
  WORKSHOP_SCENARIOS.forEach(scenarioId => {
    const scenario = getScenarioById(scenarioId);
    resetSimulationRandom(Number(process.env.SIM_SEED) >>> 0);
    profiles[scenarioId] = calibrateCoreScoringProfile(
      CALIBRATION_RUNS,
      scenario,
      "powder",
      scenario.workshop
    );
  });
  const cpu = process.cpuUsage(cpuStarted);
  return {
    profiles,
    wallSeconds: (performance.now() - started) / 1000,
    cpuSeconds: (cpu.user + cpu.system) / 1e6
  };
}

function buildTasks(conditions) {
  return conditions.flatMap(condition =>
    BASIC_CLASSES.flatMap(className =>
      Array.from({ length: RUNS_PER_CLASS }, (_, runIndex) => ({
        conditionId: condition.id,
        className,
        runIndex,
        runsPerClass: RUNS_PER_CLASS,
        scenarioId: scenarioForRun(runIndex, RUNS_PER_CLASS)
      }))
    )
  );
}

async function main() {
  const scoring = await buildScoringProfiles();
  CURRENT_SCORING_PROFILES = scoring.profiles;
  const tuningStarted = performance.now();
  const tunedA = FIXED_CANDIDATE_VALUES.a === null
    ? tuneCondition({
        id: "candidate-a",
        label: "A:宝箱枠置換",
        kind: "candidate-a",
        field: "chestHealPotionReplacementChance"
      })
    : fixedCondition({
        id: "candidate-a",
        label: "A:宝箱枠置換",
        kind: "candidate-a",
        field: "chestHealPotionReplacementChance",
        value: FIXED_CANDIDATE_VALUES.a
      });
  const tunedB = FIXED_CANDIDATE_VALUES.b === null
    ? tuneCondition({
        id: "candidate-b",
        label: "B:敵ドロップ",
        kind: "candidate-b",
        field: "enemyHealPotionDropChance"
      })
    : fixedCondition({
        id: "candidate-b",
        label: "B:敵ドロップ",
        kind: "candidate-b",
        field: "enemyHealPotionDropChance",
        value: FIXED_CANDIDATE_VALUES.b
      });
  const tunedC = FIXED_CANDIDATE_VALUES.c === null
    ? tuneCondition({
        id: "candidate-c",
        label: "C:B1+B3追加camp",
        kind: "candidate-c",
        field: "extraCampRecoveryRate"
      })
    : fixedCondition({
        id: "candidate-c",
        label: "C:B1+B3追加camp",
        kind: "candidate-c",
        field: "extraCampRecoveryRate",
        value: FIXED_CANDIDATE_VALUES.c
      });
  const tuningWallSeconds = (performance.now() - tuningStarted) / 1000;
  const conditions = [BASELINE_CONDITION, tunedA.condition, tunedB.condition, tunedC.condition];
  const conditionMap = Object.fromEntries(conditions.map(condition => [condition.id, condition]));
  const tasks = buildTasks(conditions);
  const resolvedParallelism = resolveSimParallelism(tasks.length);
  const measurementStarted = performance.now();
  const measurementCpuStarted = process.cpuUsage();
  const rows = await runSimTasks({
    moduleUrl: pathToFileURL(fileURLToPath(import.meta.url)).href,
    exportName: "runIssue499Task",
    runTask: runIssue499Task,
    tasks,
    context: { conditions: conditionMap, scoringProfiles: scoring.profiles }
  });
  const measurementCpu = process.cpuUsage(measurementCpuStarted);
  const runtime = {
    wallSeconds: (performance.now() - measurementStarted) / 1000,
    cpuSeconds: (measurementCpu.user + measurementCpu.system) / 1e6,
    resolvedParallelism,
    availableParallelism: availableParallelism()
  };
  if (rows.length !== tasks.length) throw new Error(`raw rows mismatch: ${rows.length}/${tasks.length}`);
  const keys = rows.map(row => `${row.conditionId}:${row.className}:${row.runIndex}`);
  if (new Set(keys).size !== rows.length) throw new Error("duplicate raw row key");
  const rawText = rows.map(row => JSON.stringify(row)).join("\n") + "\n";
  const rawSha256 = sha256(rawText);
  const resultDir = join(process.cwd(), "scratch", "results");
  mkdirSync(resultDir, { recursive: true });
  writeFileSync(join(resultDir, `${OUTPUT_STEM}.jsonl`), rawText);
  const conditionResults = conditions.map(condition => {
    const conditionRows = rows.filter(row => row.conditionId === condition.id);
    return {
      id: condition.id,
      label: condition.label,
      kind: condition.kind,
      scenario: condition.scenario,
      summary: conditionSummary(conditionRows),
      rows: conditionRows.length
    };
  });
  const baselineSummary = conditionResults[0].summary.overall;
  const baselineNaturalChestTarget = baselineSummary.recovery.naturalChest.mean;
  const acceptance = Object.fromEntries(conditionResults.map(condition => [
    condition.id,
    acceptanceFor(condition.summary.overall, baselineSummary)
  ]));
  const acceptedCandidates = conditionResults
    .filter(condition => condition.kind !== "baseline" && acceptance[condition.id].pass)
    .sort((left, right) =>
      right.summary.overall.outcomes.B10.entrant.rate - left.summary.overall.outcomes.B10.entrant.rate
    );
  const adopted = acceptedCandidates[0] || null;
  const environment = {
    ...Object.fromEntries(Object.entries(getResolvedSimulationEnv())),
    SIM_SEED: process.env.SIM_SEED,
    SIM_RUNS: String(RUNS_PER_CLASS),
    SIM_CALIBRATION_RUNS: String(CALIBRATION_RUNS),
    SIM_PARALLEL: "<omitted; runtime default>",
    SIM_MAP_CACHE_ENTRIES: "<omitted; runtime default 1024>",
    ISSUE499_TUNING_RUNS: String(TUNING_RUNS),
    ISSUE499_TUNING_ITERATIONS: String(TUNING_ITERATIONS),
    ISSUE499_FIXED_A_CHANCE: FIXED_CANDIDATE_VALUES.a === null ? "<unset>" : String(FIXED_CANDIDATE_VALUES.a),
    ISSUE499_FIXED_B_CHANCE: FIXED_CANDIDATE_VALUES.b === null ? "<unset>" : String(FIXED_CANDIDATE_VALUES.b),
    ISSUE499_FIXED_C_RATE: FIXED_CANDIDATE_VALUES.c === null ? "<unset>" : String(FIXED_CANDIDATE_VALUES.c),
    ISSUE499_TARGET_EXTRA_UNITS: String(TARGET_EXTRA),
    ISSUE499_CAMP_TIME_COST: String(CAMP_TIME_COST),
    ISSUE499_WORKSHOP_DISTRIBUTION: WORKSHOP_DISTRIBUTION
      .map(row => `${row.scenarioId}:${row.observedRuns}/${WORKSHOP_TOTAL}`)
      .join(",")
  };
  const envHash = sha256(JSON.stringify(environment));
  const fixedEnvironment = [
    ["ISSUE499_FIXED_A_CHANCE", FIXED_CANDIDATE_VALUES.a],
    ["ISSUE499_FIXED_B_CHANCE", FIXED_CANDIDATE_VALUES.b],
    ["ISSUE499_FIXED_C_RATE", FIXED_CANDIDATE_VALUES.c]
  ]
    .filter(([, value]) => value !== null)
    .map(([name, value]) => `${name}=${value}`)
    .join(" ");
  const reproductionCommand = fixedEnvironment
    ? `${fixedEnvironment} node scratch/sim_issue_499_shallow_recovery_supply.js`
    : "node scratch/sim_issue_499_shallow_recovery_supply.js";
  const summary = {
    issue: 499,
    seed: Number(process.env.SIM_SEED) >>> 0,
    runsPerClass: RUNS_PER_CLASS,
    calibrationRuns: CALIBRATION_RUNS,
    tuningRunsPerClass: TUNING_RUNS,
    tuningIterations: TUNING_ITERATIONS,
    targetExtraUnits: TARGET_EXTRA,
    tuningMode: HAS_FIXED_CANDIDATE_VALUES ? "fixed same-run calibration" : "pilot binary search",
    fixedCandidateValues: FIXED_CANDIDATE_VALUES,
    reproductionCommand,
    baselineNaturalChestTarget,
    campTimeCost: CAMP_TIME_COST,
    environment,
    envHash,
    rawSha256,
    calibration: scoring,
    tuning: {
      wallSeconds: tuningWallSeconds,
      targetExtraUnits: TARGET_EXTRA,
      candidateA: tunedA.tuning,
      candidateB: tunedB.tuning,
      candidateC: tunedC.tuning
    },
    runtime,
    conditions: conditionResults,
    acceptance,
    decision: {
      adoptedId: adopted?.id || null,
      adoptedLabel: adopted?.label || "なし（受入条件を同時に満たす候補なし）"
    },
    downstreamRemeasureTargets: [470, 471, 475, 468, 473, 480]
  };
  const markdown = buildMarkdown(summary);
  writeFileSync(join(resultDir, `${OUTPUT_STEM}.md`), markdown);
  console.log(JSON.stringify({
    output: `scratch/results/${OUTPUT_STEM}.md`,
    rawSha256,
    envHash,
    adopted: summary.decision.adoptedLabel,
    resolvedParallelism,
    calibrationWallSeconds: scoring.wallSeconds,
    tuningWallSeconds,
    measurementWallSeconds: runtime.wallSeconds,
    measurementCpuSeconds: runtime.cpuSeconds
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
