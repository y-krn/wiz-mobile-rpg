// sim-scope: run
/* global console, process */

import { isMainThread } from "node:worker_threads";
import { runSimTasks } from "./sim_parallel.js";

Object.defineProperty(globalThis, "localStorage", {
  value: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  configurable: true
});

process.env.SIM_SEED ||= "271";
process.env.SIM_RUNS ||= "2000";
process.env.SIM_CALIBRATION_RUNS ||= "1000";
process.env.DEPARTURE_CRAFT_IDS ||= [
  "TOWN_PORTAL",
  "HEAL_POTION",
  "HEAL_POTION",
  "HEAL_POTION",
  "HEAL_POTION",
  "ANTIDOTE",
  "GUARD_POTION"
].join(",");
process.env.TRAP_POLICY ||= "conservative";
process.env.TRAP_AVOIDANCE_POLICY ||= "ev";
process.env.TRAP_DAMAGE_MULTIPLIER ||= "1";
process.env.IDENTIFICATION_POLICY ||= "legacy";
process.env.STATUS_CURE_POLICY ||= "smart";
process.env.STATUS_CURE_HP_THRESHOLD ||= "0.35";
process.env.STATUS_CURE_MERCHANT_POLICY ||= "missing";
process.env.FLEE_HP_THRESHOLD ||= "0.35";
process.env.PORTAL_HP_THRESHOLD ||= "0.35";
process.env.PORTAL_MAX_HEAL_POTIONS ||= "0";
process.env.PORTAL_MIN_FLOOR ||= "3";
process.env.ELITE_POLICY ||= "avoid";
process.env.SIM_SCENARIOS ||= "workshop-complete";

const RUNS = Math.max(1, Math.floor(Number(process.env.SIM_RUNS)));
const CALIBRATION_RUNS = Math.max(1, Math.floor(Number(process.env.SIM_CALIBRATION_RUNS)));
const SEED = Number(process.env.SIM_SEED) >>> 0;
const FLEE_POLICY = process.env.FLEE_POLICY === "never" ? "never" : "threshold";
const FLEE_HP_THRESHOLD = FLEE_POLICY === "never"
  ? null
  : Math.max(0, Math.min(1, Number(process.env.FLEE_HP_THRESHOLD)));
const CURRENT_PORTAL_CONFIG = Object.freeze({
  hpThreshold: Number(process.env.PORTAL_HP_THRESHOLD),
  maxHealPotions: Math.max(0, Number(process.env.PORTAL_MAX_HEAL_POTIONS)),
  minFloor: Math.max(1, Number(process.env.PORTAL_MIN_FLOOR))
});
const HAZARD_MIN_N = 30;
const SCENARIO_ID = "workshop-complete";
const SERIES_ID = "issue271-revalidation";
const SWEEP_MODE = process.env.PORTAL_SWEEP_MODE || "all";
const FULL_OBSERVATION = process.env.PORTAL_FULL_OBSERVATION === "1";
const ONE_FLOOR_HORIZON = process.env.PORTAL_HORIZON === "one-floor";
const D_RUNS = Math.max(1, Math.floor(Number(process.env.PORTAL_D_RUNS || RUNS)));
const COMPARE_RUNS = Math.max(1, Math.floor(Number(process.env.PORTAL_COMPARE_RUNS || 1000)));

const {
  BANKING_RATES
} = await import("../src/rules/material_rules.js");
const { getDepartureCraftCost } = await import("../src/systems/workshop.js");
const {
  DEPTH_SCENARIOS,
  SIM_CLASSES,
  calibrateCoreScoringProfile,
  getPortalStateKey,
  resetSimulationRandom,
  simulateRun
} = await import("./sim_depth_material_ev.js");

const SCENARIO_BASE = DEPTH_SCENARIOS.find(scenario => scenario.id === SCENARIO_ID);
if (!SCENARIO_BASE) throw new Error(`missing scenario: ${SCENARIO_ID}`);
const WING_COST = getDepartureCraftCost(["TOWN_PORTAL"]).any;
if (WING_COST !== 8) throw new Error(`unexpected TOWN_PORTAL cost: ${WING_COST}`);

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

function wilson95(successes, trials) {
  if (trials <= 0) return null;
  const z = 1.96;
  const p = successes / trials;
  const denominator = 1 + (z * z) / trials;
  const center = (p + (z * z) / (2 * trials)) / denominator;
  const halfWidth = z * Math.sqrt(
    (p * (1 - p)) / trials + (z * z) / (4 * trials * trials)
  ) / denominator;
  return [Math.max(0, center - halfWidth), Math.min(1, center + halfWidth)];
}

function mean95(values) {
  if (!values.length) return null;
  const average = mean(values);
  const standardError = Math.sqrt(sampleVariance(values) / values.length);
  return [average - 1.96 * standardError, average + 1.96 * standardError];
}

function ratio95(numerators, denominators) {
  if (!numerators.length || numerators.length !== denominators.length) return null;
  const n = numerators.length;
  const meanNumerator = mean(numerators);
  const meanDenominator = mean(denominators);
  if (meanDenominator <= 0) return null;
  const numeratorVariance = sampleVariance(numerators);
  const denominatorVariance = sampleVariance(denominators);
  const covariance = numerators.reduce(
    (sum, numerator, index) =>
      sum + (numerator - meanNumerator) * (denominators[index] - meanDenominator),
    0
  ) / Math.max(1, n - 1);
  const ratio = meanNumerator / meanDenominator;
  const ratioVariance = (
    numeratorVariance / (n * meanDenominator ** 2) +
    (meanNumerator ** 2 * denominatorVariance) / (n * meanDenominator ** 4) -
    (2 * meanNumerator * covariance) / (n * meanDenominator ** 3)
  );
  const halfWidth = 1.96 * Math.sqrt(Math.max(0, ratioVariance));
  return [ratio - halfWidth, ratio + halfWidth];
}

function rate(successes, trials) {
  return trials > 0 ? successes / trials : null;
}

function sumObjectValues(object) {
  return Object.values(object || {}).reduce((sum, value) => sum + Number(value || 0), 0);
}

function departureCraftIdsForHealPotions(count) {
  return [
    "TOWN_PORTAL",
    ...Array(Math.max(0, Math.floor(Number(count)))).fill("HEAL_POTION"),
    "ANTIDOTE",
    "GUARD_POTION"
  ];
}

function compactResult(task, result) {
  return {
    runIndex: task.runIndex,
    className: task.className,
    survived: result.survived,
    died: result.died,
    depth: Math.min(20, result.reachedFloor),
    timeCost: result.timeCost,
    carriedMaterials: result.carriedMaterials,
    bankedMaterials: result.bankedMaterials,
    townPortalsUsed: result.townPortalsUsed,
    portalAcquisitions: result.portalAcquisitions,
    portalDecisionEvents: result.portalDecisionEvents,
    portalOneFloorHorizonEvents: result.portalOneFloorHorizonEvents,
    portalOneFloorHorizonResolutionCounts: result.portalOneFloorHorizonResolutionCounts,
    terminationReason: result.terminationReason,
    terminationFloor: result.terminationFloor,
    floorMaterialSnapshots: result.floorMaterialSnapshots
  };
}

function scenarioFor(config, profileContext) {
  const scenario = {
    ...SCENARIO_BASE,
    identificationPolicy: "legacy",
    trapPolicy: process.env.TRAP_POLICY,
    trapAvoidancePolicy: process.env.TRAP_AVOIDANCE_POLICY,
    fleeHpThreshold: FLEE_HP_THRESHOLD,
    statusCurePolicy: process.env.STATUS_CURE_POLICY,
    statusCureHpThreshold: Math.max(
      0,
      Math.min(1, Number(process.env.STATUS_CURE_HP_THRESHOLD))
    ),
    statusCureMerchantPolicy: process.env.STATUS_CURE_MERCHANT_POLICY,
    elitePolicy: process.env.ELITE_POLICY,
    portalPolicy: config.policy || "threshold",
    portalObservationOnly: Boolean(config.observationOnly),
    portalOneFloorHorizon: Boolean(config.oneFloorHorizon),
    portalHorizonMaxFloor: config.horizonMaxFloor,
    portalSkipRetreats: Math.max(0, Math.floor(Number(config.skipRetreats) || 0)),
    portalHpThreshold: config.hpThreshold,
    portalMaxHealPotions: config.maxHealPotions,
    portalMinFloor: config.minFloor,
    portalRecordBelowMinFloor: Boolean(config.recordBelowMinFloor),
    portalWingCost: WING_COST,
    portalEvHazards: profileContext?.hazards || null,
    portalEvDeltaByFloor: profileContext?.deltaByFloor || null
  };
  if (config.departureCraftIds) scenario.departureCraft = [...config.departureCraftIds];
  return scenario;
}

export function runPortalTask(task, context) {
  const scenario = scenarioFor(context.config, context);
  resetSimulationRandom(hashSeed(`${context.seed}:${SCENARIO_ID}:${task.runIndex}`));
  const result = simulateRun({
    className: task.className,
    startFloor: 1,
    targetDepth: 21,
    runIndex: task.runIndex,
    seriesId: SERIES_ID,
    scoringProfile: context.scoringProfile,
    scenario,
    workshop: SCENARIO_BASE.workshop,
    collectDiagnostics: false
  });
  return compactResult(task, result);
}

function createTasks(runCount) {
  return Array.from({ length: runCount }, (_, runIndex) => ({
    runIndex,
    className: SIM_CLASSES[runIndex % SIM_CLASSES.length]
  }));
}

async function runCase(config, profileContext, runCount = RUNS) {
  return runSimTasks({
    moduleUrl: import.meta.url,
    exportName: "runPortalTask",
    runTask: runPortalTask,
    tasks: createTasks(runCount),
    context: {
      seed: SEED,
      seriesId: SERIES_ID,
      scoringProfile: profileContext.scoringProfile,
      hazards: profileContext.hazards || null,
      deltaByFloor: profileContext.deltaByFloor || null,
      config
    }
  });
}

function dedupeEvents(rows) {
  const seen = new Set();
  const events = [];
  rows.forEach(row => {
    (row.portalDecisionEvents || []).forEach(event => {
      const cellKey = getPortalStateKey(
        event.floor,
        event.hpRate,
        event.healPotions,
        event.progressStage
      );
      const runCellKey = `${row.runIndex}:${cellKey}`;
      if (seen.has(runCellKey)) return;
      seen.add(runCellKey);
      events.push({ row, event, key: cellKey });
    });
  });
  return events;
}

function calculateBreakEven(event, deltaByFloor) {
  const deltaEntry = deltaByFloor?.[event.floor];
  const delta = Number(
    deltaEntry && typeof deltaEntry === "object" ? deltaEntry.mean : deltaEntry
  );
  const m = Number(event.carriedMaterials);
  const mPlusDelta = m + delta;
  if (!Number.isFinite(delta) || !Number.isFinite(m) || mPlusDelta <= 0) return null;
  return (delta + WING_COST) / ((1 - BANKING_RATES.death) * mPlusDelta);
}

function calculateHazards(rows, deltaByFloor) {
  return calculateHazardsFromEvents(dedupeEvents(rows), deltaByFloor);
}

function calculateHazardsFromEvents(eventRecords, deltaByFloor) {
  const cells = new Map();
  eventRecords.forEach(({ row, event, key }) => {
    const cell = cells.get(key) || {
      key,
      floor: event.floor,
      progressStage: event.progressStage,
      hpBand: event.hpBand,
      potionBand: event.potionBand,
      events: 0,
      runs: new Set(),
      deaths: 0,
      breakEvenValues: [],
      situationCounts: {},
      classCounts: {},
      classStats: {}
    };
    cell.events++;
    cell.runs.add(row.runIndex);
    cell.deaths += Number(row.died);
    cell.situationCounts[event.situation] =
      (cell.situationCounts[event.situation] || 0) + 1;
    cell.classCounts[row.className] = (cell.classCounts[row.className] || 0) + 1;
    cell.classStats[row.className] ||= { n: 0, deaths: 0 };
    cell.classStats[row.className].n++;
    cell.classStats[row.className].deaths += Number(row.died);
    const breakEven = calculateBreakEven(event, deltaByFloor);
    if (breakEven !== null) cell.breakEvenValues.push(breakEven);
    cells.set(key, cell);
  });
  return Object.fromEntries([...cells.values()].map(cell => {
    const ci = wilson95(cell.deaths, cell.events);
    const breakEven = mean(cell.breakEvenValues);
    return [cell.key, {
      floor: cell.floor,
      progressStage: cell.progressStage,
      hpBand: cell.hpBand,
      potionBand: cell.potionBand,
      n: cell.events,
      runs: cell.runs.size,
      deaths: cell.deaths,
      hazard: rate(cell.deaths, cell.events),
      hazardCi: ci,
      breakEven,
      situationCounts: cell.situationCounts,
      classCounts: cell.classCounts,
      classStats: cell.classStats,
      determined: cell.events >= HAZARD_MIN_N && breakEven !== null
    }];
  }));
}

function dedupeOneFloorHorizonEvents(rows) {
  const seen = new Set();
  const events = [];
  rows.forEach(row => {
    (row.portalOneFloorHorizonEvents || []).forEach(event => {
      if (!event.horizonOutcome) return;
      const key = getPortalStateKey(
        event.floor,
        event.hpRate,
        event.healPotions,
        event.progressStage
      );
      const runCellKey = `${row.runIndex}:${key}`;
      if (seen.has(runCellKey)) return;
      seen.add(runCellKey);
      events.push({ row, event, key });
    });
  });
  return events;
}

function calculateOneFloorHazards(rows, deltaByFloor) {
  const cells = new Map();
  dedupeOneFloorHorizonEvents(rows).forEach(({ row, event, key }) => {
    const cell = cells.get(key) || {
      key,
      floor: event.floor,
      progressStage: event.progressStage,
      hpBand: event.hpBand,
      potionBand: event.potionBand,
      events: 0,
      runs: new Set(),
      deaths: 0,
      breakEvenValues: [],
      situationCounts: {},
      classCounts: {},
      classStats: {}
    };
    cell.events++;
    cell.runs.add(row.runIndex);
    cell.deaths += Number(event.horizonOutcome === "death");
    cell.situationCounts[event.situation] =
      (cell.situationCounts[event.situation] || 0) + 1;
    cell.classCounts[row.className] = (cell.classCounts[row.className] || 0) + 1;
    cell.classStats[row.className] ||= { n: 0, deaths: 0 };
    cell.classStats[row.className].n++;
    cell.classStats[row.className].deaths += Number(event.horizonOutcome === "death");
    const breakEven = calculateBreakEven(event, deltaByFloor);
    if (breakEven !== null) cell.breakEvenValues.push(breakEven);
    cells.set(key, cell);
  });
  return Object.fromEntries([...cells.values()].map(cell => {
    const ci = wilson95(cell.deaths, cell.events);
    const breakEven = mean(cell.breakEvenValues);
    return [cell.key, {
      floor: cell.floor,
      progressStage: cell.progressStage,
      hpBand: cell.hpBand,
      potionBand: cell.potionBand,
      n: cell.events,
      runs: cell.runs.size,
      deaths: cell.deaths,
      hazard: rate(cell.deaths, cell.events),
      hazardCi: ci,
      breakEven,
      situationCounts: cell.situationCounts,
      classCounts: cell.classCounts,
      classStats: cell.classStats,
      determined: cell.events >= HAZARD_MIN_N && breakEven !== null
    }];
  }));
}

function calculateContinuationHazards(currentRows, skipRows, deltaByFloor) {
  const records = continuationRecords(currentRows, skipRows);
  return calculateHazardsFromEvents(records, deltaByFloor);
}

function continuationRecords(currentRows, skipRows) {
  const records = dedupeEvents(currentRows)
    .filter(({ event }) => !event.thresholdRetreat);
  skipRows.forEach(row => {
    const event = (row.portalDecisionEvents || []).find(candidate => candidate.thresholdRetreat);
    if (!event) return;
    records.push({
      row,
      event,
      key: getPortalStateKey(
        event.floor,
        event.hpRate,
        event.healPotions,
        event.progressStage
      )
    });
  });
  return records;
}

function calculateFloorForwardHazard(currentRows, skipRows) {
  const cells = new Map();
  const seen = new Set();
  continuationRecords(currentRows, skipRows).forEach(({ row, event }) => {
    const key = `${row.runIndex}:${event.floor}`;
    if (seen.has(key)) return;
    seen.add(key);
    const cell = cells.get(event.floor) || { n: 0, deaths: 0 };
    cell.n++;
    cell.deaths += Number(row.died);
    cells.set(event.floor, cell);
  });
  return Object.fromEntries([...cells.entries()].map(([floor, cell]) => [floor, {
    n: cell.n,
    deaths: cell.deaths,
    hazard: rate(cell.deaths, cell.n),
    hazardCi: wilson95(cell.deaths, cell.n)
  }]));
}

function calculateDeltaByFloor(rows) {
  const values = Object.fromEntries(Array.from({ length: 20 }, (_, index) => [index + 1, []]));
  rows.forEach(row => {
    for (let floor = 1; floor < 20; floor++) {
      const current = row.floorMaterialSnapshots?.[floor];
      const next = row.floorMaterialSnapshots?.[floor + 1];
      if (!current || !next) continue;
      values[floor].push(next.startTotal - current.startTotal);
    }
  });
  return Object.fromEntries(Object.entries(values).map(([floor, samples]) => [floor, {
    n: samples.length,
    mean: mean(samples),
    ci: mean95(samples)
  }]));
}

function deltaMeans(deltaByFloor) {
  return Object.fromEntries(
    Object.entries(deltaByFloor)
      .filter(([, value]) => value.mean !== null)
      .map(([floor, value]) => [floor, value.mean])
  );
}

function calculateFloorEconomics(rows) {
  const values = Object.fromEntries(Array.from({ length: 20 }, (_, index) => [index + 1, []]));
  rows.forEach(row => {
    for (let floor = 1; floor < 20; floor++) {
      const current = row.floorMaterialSnapshots?.[floor];
      const next = row.floorMaterialSnapshots?.[floor + 1];
      if (!current || !next) continue;
      const m = Number(current.startTotal);
      const delta = Number(next.startTotal - current.startTotal);
      if (!Number.isFinite(m) || !Number.isFinite(delta) || m + delta <= 0) continue;
      values[floor].push({
        m,
        delta,
        breakEven: (delta + WING_COST) /
          ((1 - BANKING_RATES.death) * (m + delta))
      });
    }
  });
  return Object.fromEntries(Object.entries(values).map(([floor, samples]) => [floor, {
    n: samples.length,
    m: mean(samples.map(sample => sample.m)),
    mCi: mean95(samples.map(sample => sample.m)),
    delta: mean(samples.map(sample => sample.delta)),
    deltaCi: mean95(samples.map(sample => sample.delta)),
    breakEven: mean(samples.map(sample => sample.breakEven)),
    breakEvenCi: mean95(samples.map(sample => sample.breakEven))
  }]));
}

function summarizeCase(rows, config, deltaByFloor) {
  const count = rows.length;
  const depthValues = rows.map(row => row.depth);
  const timeValues = rows.map(row => row.timeCost);
  const adjustedBankValues = rows.map(row =>
    row.bankedMaterials - WING_COST * row.townPortalsUsed
  );
  const b5Entrants = rows.filter(row => row.floorMaterialSnapshots?.[5]).length;
  const b10Entrants = rows.filter(row => row.floorMaterialSnapshots?.[10]).length;
  const acquisitionCounts = rows.map(row => sumObjectValues(row.portalAcquisitions));
  const acquisitionRuns = acquisitionCounts.filter(value => value > 0).length;
  const useRuns = rows.filter(row => row.townPortalsUsed > 0).length;
  const terminationByReason = {};
  rows.forEach(row => {
    terminationByReason[row.terminationReason] =
      (terminationByReason[row.terminationReason] || 0) + 1;
  });
  const events = dedupeEvents(rows);
  const hpLow = events.filter(({ event }) => event.hpCondition);
  const potionLow = events.filter(({ event }) => event.potionCondition);
  const both = events.filter(({ event }) => event.thresholdRetreat);
  const currentRetreatEvents = events.filter(({ event }) => event.thresholdRetreat);
  const policyRetreatEvents = events.filter(({ event }) => event.policyRetreat);
  return {
    config,
    n: count,
    averageDepth: mean(depthValues),
    averageDepthCi: mean95(depthValues),
    survivalRate: rate(rows.filter(row => row.survived).length, count),
    survivalCi: wilson95(rows.filter(row => row.survived).length, count),
    deathRate: rate(rows.filter(row => row.died).length, count),
    deathCi: wilson95(rows.filter(row => row.died).length, count),
    averageTime: mean(timeValues),
    averageTimeCi: mean95(timeValues),
    adjustedBankedMaterialEv: mean(adjustedBankValues),
    adjustedBankedMaterialEvCi: mean95(adjustedBankValues),
    evPerTime: sum(adjustedBankValues) / Math.max(1, sum(timeValues)),
    evPerTimeCi: ratio95(adjustedBankValues, timeValues),
    b5EntrantRate: rate(b5Entrants, count),
    b5EntrantCi: wilson95(b5Entrants, count),
    b10EntrantRate: rate(b10Entrants, count),
    b10EntrantCi: wilson95(b10Entrants, count),
    wingUseRate: rate(useRuns, count),
    wingUseCi: wilson95(useRuns, count),
    wingUsesPerRun: mean(rows.map(row => row.townPortalsUsed)),
    wingAcquisitionRate: rate(acquisitionRuns, count),
    wingAcquisitionCi: wilson95(acquisitionRuns, count),
    wingAcquisitionsPerRun: mean(acquisitionCounts),
    wingAcquisitionsBySource: rows.reduce((totals, row) => {
      Object.entries(row.portalAcquisitions || {}).forEach(([source, amount]) => {
        totals[source] = (totals[source] || 0) + amount;
      });
      return totals;
    }, {}),
    terminationByReason,
    decisionEvents: events.length,
    hpConditionEvents: hpLow.length,
    potionConditionEvents: potionLow.length,
    bothConditionEvents: both.length,
    potionBindingAmongHpLow: rate(both.length, hpLow.length),
    potionBindingAmongHpLowCi: wilson95(both.length, hpLow.length),
    hpBindingAmongPotionLow: rate(both.length, potionLow.length),
    hpBindingAmongPotionLowCi: wilson95(both.length, potionLow.length),
    thresholdRetreatEvents: currentRetreatEvents.length,
    policyRetreatEvents: policyRetreatEvents.length,
    hazards: config.observationOnly ? calculateHazards(rows, deltaByFloor) : undefined
  };
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function addDivergence(currentRows, hazards, deltaByFloor) {
  const cells = new Map();
  dedupeEvents(currentRows).forEach(({ event, key }) => {
    const hazard = hazards[key];
    const breakEven = calculateBreakEven(event, deltaByFloor);
    if (!hazard?.determined || breakEven === null) return;
    const currentRetreat = event.thresholdRetreat;
    const evRetreat = hazard.hazard > breakEven;
    const cell = cells.get(key) || {
      key,
      floor: event.floor,
      progressStage: event.progressStage,
      hpBand: event.hpBand,
      potionBand: event.potionBand,
      n: 0,
      currentRetreat: 0,
      evRetreat: 0,
      currentRetreatEvContinue: 0,
      currentContinueEvRetreat: 0,
      breakEvenValues: [],
      hazard
    };
    cell.n++;
    cell.currentRetreat += Number(currentRetreat);
    cell.evRetreat += Number(evRetreat);
    cell.currentRetreatEvContinue += Number(currentRetreat && !evRetreat);
    cell.currentContinueEvRetreat += Number(!currentRetreat && evRetreat);
    cell.breakEvenValues.push(breakEven);
    cells.set(key, cell);
  });
  const rows = [...cells.values()].map(cell => ({
    ...cell,
    currentRetreatRate: cell.currentRetreat / cell.n,
    evRetreatRate: cell.evRetreat / cell.n,
    breakEven: mean(cell.breakEvenValues),
    d: cell.hazard.hazard
  }));
  return {
    cells: rows.sort((left, right) =>
      (right.currentRetreatEvContinue + right.currentContinueEvRetreat) -
      (left.currentRetreatEvContinue + left.currentContinueEvRetreat)
    ),
    currentRetreatEvContinue: rows.reduce((sumValue, row) => sumValue + row.currentRetreatEvContinue, 0),
    currentRetreatKnown: rows.reduce((sumValue, row) => sumValue + row.currentRetreat, 0),
    currentContinueEvRetreat: rows.reduce((sumValue, row) => sumValue + row.currentContinueEvRetreat, 0),
    currentContinueKnown: rows.reduce((sumValue, row) => sumValue + (row.n - row.currentRetreat), 0)
  };
}

function formatEnvironment() {
  return {
    seed: SEED,
    SIM_RUNS: RUNS,
    SIM_CALIBRATION_RUNS: CALIBRATION_RUNS,
    PORTAL_D_RUNS: D_RUNS,
    PORTAL_COMPARE_RUNS: COMPARE_RUNS,
    DEPARTURE_CRAFT_IDS: process.env.DEPARTURE_CRAFT_IDS,
    TRAP_POLICY: process.env.TRAP_POLICY,
    TRAP_AVOIDANCE_POLICY: process.env.TRAP_AVOIDANCE_POLICY,
    TRAP_DAMAGE_MULTIPLIER: process.env.TRAP_DAMAGE_MULTIPLIER,
    IDENTIFICATION_POLICY: process.env.IDENTIFICATION_POLICY,
    STATUS_CURE_POLICY: process.env.STATUS_CURE_POLICY,
    STATUS_CURE_HP_THRESHOLD: process.env.STATUS_CURE_HP_THRESHOLD,
    STATUS_CURE_MERCHANT_POLICY: process.env.STATUS_CURE_MERCHANT_POLICY,
    FLEE_POLICY,
    FLEE_HP_THRESHOLD,
    PORTAL_HP_THRESHOLD: process.env.PORTAL_HP_THRESHOLD,
    PORTAL_MAX_HEAL_POTIONS: process.env.PORTAL_MAX_HEAL_POTIONS,
    PORTAL_MIN_FLOOR: process.env.PORTAL_MIN_FLOOR,
    ELITE_POLICY: process.env.ELITE_POLICY,
    SIM_SCENARIOS: process.env.SIM_SCENARIOS,
    classes: SIM_CLASSES,
    workshop: SCENARIO_BASE.workshop,
    BANKING_RATES,
    wingCost: WING_COST,
    stateKey: "B5/B10/B15/B20=pre-boss|post-boss × early|mid|late; other floors=early|mid|late (equal elapsed-step thirds)",
    dHorizon: ONE_FLOOR_HORIZON ? "current state -> next floor start; portal decisions within the horizon suppressed" : null,
    source: "generateRunFloor -> simulateRun -> src/rules/*"
  };
}

async function runOneFloorHorizonCase(profileContext) {
  const observationConfig = {
    policy: "threshold",
    observationOnly: true,
    oneFloorHorizon: true,
    horizonMaxFloor: 20,
    hpThreshold: CURRENT_PORTAL_CONFIG.hpThreshold,
    maxHealPotions: CURRENT_PORTAL_CONFIG.maxHealPotions,
    minFloor: CURRENT_PORTAL_CONFIG.minFloor,
    recordBelowMinFloor: true,
    departureCraftIds: departureCraftIdsForHealPotions(4)
  };
  const observationRows = await runCase(observationConfig, profileContext, D_RUNS);
  const deltaByFloor = calculateDeltaByFloor(observationRows);
  const hazardTable = calculateOneFloorHazards(observationRows, deltaByFloor);
  const hazardProfile = {
    hazards: hazardTable,
    deltaByFloor: deltaMeans(deltaByFloor)
  };
  const unresolvedHorizonFloors = {};
  const unresolvedHorizonSamples = [];
  const horizonResolutionCounts = {};
  observationRows.forEach(row => {
    Object.entries(row.portalOneFloorHorizonResolutionCounts || {}).forEach(([floor, counts]) => {
      horizonResolutionCounts[floor] ||= { death: 0, "reached-next-floor": 0 };
      horizonResolutionCounts[floor].death += counts.death || 0;
      horizonResolutionCounts[floor]["reached-next-floor"] += counts["reached-next-floor"] || 0;
    });
    (row.portalOneFloorHorizonEvents || [])
      .filter(event => !event.horizonOutcome)
      .forEach(event => {
        const floor = String(event.floor);
        unresolvedHorizonFloors[floor] = (unresolvedHorizonFloors[floor] || 0) + 1;
        if (unresolvedHorizonSamples.length < 20) {
          unresolvedHorizonSamples.push({
            runIndex: row.runIndex,
            className: row.className,
            terminationReason: row.terminationReason,
            terminationFloor: row.terminationFloor,
            resolutionCounts: row.portalOneFloorHorizonResolutionCounts,
            event
          });
        }
      });
  });
  const currentConfig = {
    policy: "threshold",
    observationOnly: false,
    ...CURRENT_PORTAL_CONFIG,
    departureCraftIds: departureCraftIdsForHealPotions(4)
  };
  const currentRows = await runCase(currentConfig, profileContext, COMPARE_RUNS);
  const evConfig = {
    policy: "ev",
    observationOnly: false,
    ...CURRENT_PORTAL_CONFIG,
    departureCraftIds: departureCraftIdsForHealPotions(4)
  };
  const evRows = await runCase(evConfig, { ...profileContext, ...hazardProfile }, COMPARE_RUNS);
  return {
    environment: formatEnvironment(),
    mode: "one-floor-horizon",
    horizonDefinition: "d = death before the next floor start after suppressing portal actions within the current floor",
    observation: {
      config: observationConfig,
      n: observationRows.length,
      horizonEvents: observationRows.reduce(
        (sumValue, row) => sumValue + (row.portalOneFloorHorizonEvents || []).length,
        0
      ),
      unresolvedHorizonEvents: observationRows.reduce(
        (sumValue, row) => sumValue + (row.portalOneFloorHorizonEvents || [])
          .filter(event => !event.horizonOutcome).length,
        0
      ),
      unresolvedHorizonFloors,
      unresolvedHorizonSamples,
      horizonResolutionCounts
    },
    deltaByFloor,
    hazardDeltaByFloor: deltaByFloor,
    floorEconomics: calculateFloorEconomics(observationRows),
    hazards: hazardTable,
    current: summarizeCase(currentRows, currentConfig, deltaByFloor),
    evPolicy: summarizeCase(evRows, evConfig, deltaByFloor),
    divergence: addDivergence(currentRows, hazardTable, deltaByFloor),
    compareRuns: COMPARE_RUNS
  };
}

async function main() {
  resetSimulationRandom(SEED);
  const scoringProfile = calibrateCoreScoringProfile(
    CALIBRATION_RUNS,
    scenarioFor({
      policy: "threshold",
      hpThreshold: CURRENT_PORTAL_CONFIG.hpThreshold,
      maxHealPotions: CURRENT_PORTAL_CONFIG.maxHealPotions,
      minFloor: CURRENT_PORTAL_CONFIG.minFloor
    }),
    "legacy",
    SCENARIO_BASE.workshop
  );
  const profileContext = { scoringProfile };

  if (ONE_FLOOR_HORIZON) {
    console.log(JSON.stringify(await runOneFloorHorizonCase(profileContext), null, 2));
    return;
  }

  const currentConfig = {
    policy: "threshold",
    observationOnly: false,
    ...CURRENT_PORTAL_CONFIG,
    departureCraftIds: departureCraftIdsForHealPotions(4)
  };
  const currentRows = await runCase(currentConfig, profileContext);
  const skipRows = FULL_OBSERVATION
    ? []
    : await runCase({
        ...currentConfig,
        skipRetreats: 1
      }, profileContext);
  const deltaByFloor = calculateDeltaByFloor(currentRows);
  let observation = null;
  if (FULL_OBSERVATION) {
    const observationConfig = {
      policy: "threshold",
      observationOnly: true,
      hpThreshold: CURRENT_PORTAL_CONFIG.hpThreshold,
      maxHealPotions: CURRENT_PORTAL_CONFIG.maxHealPotions,
      minFloor: CURRENT_PORTAL_CONFIG.minFloor,
      recordBelowMinFloor: true,
      departureCraftIds: departureCraftIdsForHealPotions(4)
    };
    const observationRows = await runCase(observationConfig, profileContext);
    const observationDeltaByFloor = calculateDeltaByFloor(observationRows);
    observation = {
      config: observationConfig,
      n: observationRows.length,
      deltaByFloor: observationDeltaByFloor,
      hazards: calculateHazards(observationRows, observationDeltaByFloor)
    };
  }
  const hazardDeltaByFloor = observation?.deltaByFloor || deltaByFloor;
  const hazardTable = observation?.hazards ||
    calculateContinuationHazards(currentRows, skipRows, hazardDeltaByFloor);
  const hazardProfile = {
    hazards: hazardTable,
    deltaByFloor: deltaMeans(hazardDeltaByFloor)
  };
  const evRows = await runCase({
    policy: "ev",
    observationOnly: false,
    hpThreshold: CURRENT_PORTAL_CONFIG.hpThreshold,
    maxHealPotions: CURRENT_PORTAL_CONFIG.maxHealPotions,
    minFloor: CURRENT_PORTAL_CONFIG.minFloor,
    departureCraftIds: departureCraftIdsForHealPotions(4)
  }, { ...profileContext, ...hazardProfile });

  const currentSummary = summarizeCase(currentRows, currentConfig, deltaByFloor);
  const evSummary = summarizeCase(evRows, {
    policy: "ev",
    ...CURRENT_PORTAL_CONFIG,
    departureCraftIds: departureCraftIdsForHealPotions(4)
  }, deltaByFloor);
  const divergence = addDivergence(currentRows, hazardTable, hazardDeltaByFloor);

  const sweepRuns = Math.max(1, Math.floor(Number(process.env.PORTAL_SWEEP_RUNS || 500)));
  const hpThresholds = [0.2, 0.35, 0.5];
  const minFloors = [2, 3, 4, 5];
  const maxHealPotions = [0, 1, 2];
  const sweep = [];
  if (SWEEP_MODE === "all" || SWEEP_MODE === "portal") {
    for (const hpThreshold of hpThresholds) {
      for (const minFloor of minFloors) {
        for (const maxHealPotion of maxHealPotions) {
          const config = {
            policy: "threshold",
            observationOnly: false,
            hpThreshold,
            minFloor,
            maxHealPotions: maxHealPotion,
            departureCraftIds: departureCraftIdsForHealPotions(4)
          };
          const rows = await runCase(config, { ...profileContext, ...hazardProfile }, sweepRuns);
          sweep.push(summarizeCase(rows, config, deltaByFloor));
        }
      }
    }
  }

  const potionSweepRuns = Math.max(1, Math.floor(Number(process.env.POTION_SWEEP_RUNS || 1000)));
  const potionSweep = [];
  if (SWEEP_MODE === "all" || SWEEP_MODE === "potion") {
    for (const startingHealPotions of [2, 3, 4, 5]) {
      const config = {
        policy: "threshold",
        observationOnly: false,
      ...CURRENT_PORTAL_CONFIG,
      startingHealPotions,
      departureCraftIds: departureCraftIdsForHealPotions(startingHealPotions)
      };
      const rows = await runCase(config, { ...profileContext, ...hazardProfile }, potionSweepRuns);
      potionSweep.push(summarizeCase(rows, config, deltaByFloor));
    }
  }

  console.log(JSON.stringify({
    environment: formatEnvironment(),
    sweepMode: SWEEP_MODE,
    hazardMinN: HAZARD_MIN_N,
    deltaByFloor,
    hazardDeltaByFloor,
    floorEconomics: calculateFloorEconomics(currentRows),
    floorForwardHazard: calculateFloorForwardHazard(currentRows, skipRows),
    observation,
    hazards: hazardTable,
    current: currentSummary,
    evPolicy: evSummary,
    divergence,
    sweepRuns,
    sweep,
    potionSweepRuns,
    potionSweep
  }, null, 2));
}

if (isMainThread && process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  await main();
}
