// sim-scope: run
/* global console, process */

// Issue #433 の主状態を、深度B20までの実run callerで比較する。
// generateRunFloor("./sim_depth_material_ev.js") / round resolution / equipment selection は
// sim_depth_material_ev.js 経由。

import { pathToFileURL } from "node:url";

const modulePath = process.env.ISSUE433_SIM_MODULE_PATH ||
  new URL("./sim_depth_material_ev.js", import.meta.url).pathname;
const {
  calibrateCoreScoringProfile,
  getScenarioById,
  resetSimulationRandom,
  SIM_CLASSES,
  simulateRun
} = await import(pathToFileURL(modulePath).href);

const SCENARIO_IDS = [
  "workshop-empty",
  "workshop-stats",
  "workshop-gear",
  "workshop-blood-wand",
  "workshop-blood-wand-spells",
  "workshop-core-pools",
  "workshop-complete"
];
const RUNS = Math.max(1, Number(process.env.ISSUE433_RUNS || 1000));
const CALIBRATION_RUNS = Math.max(
  1,
  Number(process.env.ISSUE433_CALIBRATION_RUNS || 1000)
);
const SEED = Number(process.env.SIM_SEED || 231) >>> 0;
const IDENTIFICATION_POLICY = process.env.IDENTIFICATION_POLICY || "powder";
const CONDITION_ID = process.env.ISSUE433_CONDITION || "unspecified";
const COLLECT_EQUIPMENT_TELEMETRY = process.env.ISSUE433_TELEMETRY === "1";

const REASON_KEYS = ["powder", "score", "curseLock", "replacement", "other"];

function wilson(successes, trials) {
  if (trials <= 0) return null;
  const z = 1.96;
  const rate = successes / trials;
  const denominator = 1 + (z * z) / trials;
  const center = (rate + (z * z) / (2 * trials)) / denominator;
  const margin = z * Math.sqrt(
    (rate * (1 - rate) + (z * z) / (4 * trials)) / trials
  ) / denominator;
  return {
    rate,
    low: Math.max(0, center - margin),
    high: Math.min(1, center + margin),
    successes,
    trials,
    uncertain: trials < 30
  };
}

function meanInterval(values) {
  const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  if (values.length < 2) {
    return { mean, low: null, high: null, trials: values.length, uncertain: true };
  }
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) /
    (values.length - 1);
  const margin = 1.96 * Math.sqrt(variance / values.length);
  return {
    mean,
    low: mean - margin,
    high: mean + margin,
    trials: values.length,
    uncertain: values.length < 30
  };
}

function emptyReasonCounts() {
  return Object.fromEntries(REASON_KEYS.map(key => [key, 0]));
}

function getCoreReason(result, coreId) {
  if (result.coreEverEquippedIds.includes(coreId)) return "replacement";
  const reasons = new Set(result.coreDecisionReasons[coreId] || []);
  if (
    reasons.has("current-curse-locked") ||
    result.coreBlockedByCurseLockIds.includes(coreId)
  ) return "curseLock";
  if (reasons.has("unidentified-held")) return "powder";
  if (
    reasons.has("combat-score-not-higher") ||
    reasons.has("economy-below-95pct") ||
    reasons.has("economy-ev-not-higher") ||
    reasons.has("economy-core-retained") ||
    reasons.has("score-not-higher")
  ) return "score";
  return "other";
}

function countCoreMetrics(results) {
  const distribution = { 0: 0, 1: 0, 2: 0, "3+": 0 };
  const reasons = emptyReasonCounts();
  let coreEncounterRuns = 0;
  let coreEquippedRuns = 0;
  let coreEquipmentFound = 0;
  let equipmentFound = 0;
  let cursedCoreEquipmentFound = 0;
  const curseGeneration = {
    core: { generated: 0, cursed: 0 },
    nonCore: { generated: 0, cursed: 0 }
  };

  results.forEach(result => {
    const finalCoreIds = Array.isArray(result.finalCoreIds)
      ? result.finalCoreIds
      : (result.finalCoreId ? [result.finalCoreId] : []);
    const bucket = finalCoreIds.length >= 3 ? "3+" : String(finalCoreIds.length);
    distribution[bucket]++;
    coreEncounterRuns += Number(result.coreEncounteredIds.length > 0);
    coreEquippedRuns += Number(finalCoreIds.length > 0);
    coreEquipmentFound += result.coreEquipmentFound;
    equipmentFound += result.equipmentFound;
    cursedCoreEquipmentFound += result.cursedCoreEquipmentFound;
    Object.entries(result.curseGeneration || {}).forEach(([group, counts]) => {
      curseGeneration[group].generated += counts.generated;
      curseGeneration[group].cursed += counts.cursed;
    });
    result.coreEncounteredIds.forEach(coreId => {
      if (finalCoreIds.includes(coreId)) return;
      reasons[getCoreReason(result, coreId)]++;
    });
  });

  return {
    encounter: wilson(coreEncounterRuns, results.length),
    equipped: wilson(coreEquippedRuns, results.length),
    retention: wilson(coreEquippedRuns, coreEncounterRuns),
    distribution: Object.fromEntries(
      Object.entries(distribution).map(([bucket, count]) => [
        bucket,
        wilson(count, results.length)
      ])
    ),
    nonEquipment: {
      total: Object.values(reasons).reduce((sum, count) => sum + count, 0),
      reasons: Object.fromEntries(
        Object.entries(reasons).map(([key, count]) => [
          key,
          wilson(count, Object.values(reasons).reduce((sum, value) => sum + value, 0))
        ])
      )
    },
    equipment: {
      coreFound: coreEquipmentFound,
      equipmentFound,
      coreShare: wilson(coreEquipmentFound, equipmentFound),
      cursedCoreEquipmentFound
    },
    curseGeneration
  };
}

function milestoneMetrics(results, floor) {
  const entrants = results.filter(result => result.reachedFloor >= floor).length;
  const breakthroughs = results.filter(result => result.reachedFloor > floor).length;
  const deaths = results.filter(result => result.deathFloor === floor).length;
  return {
    entrant: wilson(entrants, results.length),
    breakthrough: wilson(breakthroughs, entrants),
    death: wilson(deaths, entrants)
  };
}

function summarizeEquipmentTelemetry(results) {
  const byFloor = {};
  let replacements = 0;
  let upgrades = 0;
  let scoreBefore = 0;
  let scoreAfter = 0;
  let eventCount = 0;
  let lockBlocks = 0;
  const lockBlockRuns = new Set();
  results.forEach(result => {
    (result.equipmentTelemetry || []).forEach(event => {
      const floor = String(event.floor);
      if (!byFloor[floor]) {
        byFloor[floor] = {
          events: 0,
          replacements: 0,
          cursedOld: 0,
          lockBlocks: 0,
          scoreBefore: 0,
          scoreAfter: 0
        };
      }
      const floorSummary = byFloor[floor];
      if (event.type === "lock-block") {
        floorSummary.lockBlocks++;
        lockBlocks++;
        lockBlockRuns.add(result);
        return;
      }
      floorSummary.events++;
      floorSummary.replacements += Number(event.replacement);
      floorSummary.cursedOld += Number(event.oldCursed);
      floorSummary.scoreBefore += event.scoreBefore;
      floorSummary.scoreAfter += event.scoreAfter;
      replacements += Number(event.replacement);
      upgrades++;
      scoreBefore += event.scoreBefore;
      scoreAfter += event.scoreAfter;
      eventCount++;
    });
  });
  Object.values(byFloor).forEach(summary => {
    summary.replacementRate = summary.replacements / summary.events;
    summary.cursedOldRate = summary.cursedOld / summary.events;
    summary.meanScoreBefore = summary.scoreBefore / summary.events;
    summary.meanScoreAfter = summary.scoreAfter / summary.events;
    delete summary.scoreBefore;
    delete summary.scoreAfter;
  });
  return {
    runs: results.length,
    averageLockBlocks: lockBlocks / Math.max(1, results.length),
    lockBlockRunRate: wilson(lockBlockRuns.size, results.length),
    averageUpgrades: upgrades / Math.max(1, results.length),
    averageReplacements: replacements / Math.max(1, results.length),
    replacementRate: wilson(replacements, upgrades),
    meanScoreBefore: eventCount ? scoreBefore / eventCount : null,
    meanScoreAfter: eventCount ? scoreAfter / eventCount : null,
    byFloor
  };
}

function summarizeScenario(scenario) {
  const scoringProfile = (() => {
    resetSimulationRandom(SEED);
    return calibrateCoreScoringProfile(
      CALIBRATION_RUNS,
      {},
      IDENTIFICATION_POLICY,
      scenario.workshop
    );
  })();
  resetSimulationRandom(SEED);
  const results = [];
  for (let runIndex = 0; runIndex < RUNS; runIndex++) {
    results.push(simulateRun({
      className: SIM_CLASSES[runIndex % SIM_CLASSES.length],
      startFloor: 1,
      targetDepth: 20,
      runIndex,
      seriesId: "depth-20",
      scoringProfile,
      scenario: { ...scenario, identificationPolicy: IDENTIFICATION_POLICY },
      workshop: scenario.workshop,
      collectEquipmentTelemetry: COLLECT_EQUIPMENT_TELEMETRY
    }));
  }

  const reachedFloors = results.map(result => result.reachedFloor);
  const bankedMaterials = results.map(result => result.bankedMaterials);
  const materialEvPerTime = results.map(result =>
    result.timeCost > 0 ? result.bankedMaterials / result.timeCost : 0
  );
  const powderAcquired = results.map(result => result.identificationPowderAcquired);
  const powderUsed = results.map(result => result.identificationPowderUsed);
  const powderRemaining = results.map(result => result.identificationPowderRemaining);

  const summary = {
    runs: RUNS,
    calibrationRuns: CALIBRATION_RUNS,
    mean: {
      reachedFloor: meanInterval(reachedFloors),
      bankedMaterialEv: meanInterval(bankedMaterials),
      materialEvPerTime: meanInterval(materialEvPerTime),
      powderAcquired: meanInterval(powderAcquired),
      powderUsed: meanInterval(powderUsed),
      powderRemaining: meanInterval(powderRemaining)
    },
    materialEvPerTimeRatio: bankedMaterials.reduce((sum, value) => sum + value, 0) /
      Math.max(1, results.reduce((sum, result) => sum + result.timeCost, 0)),
    b5: milestoneMetrics(results, 5),
    b10: milestoneMetrics(results, 10),
    powderDepleted: wilson(
      results.filter(result => result.identificationPowderDepleted).length,
      results.length
    ),
    core: countCoreMetrics(results)
  };
  if (COLLECT_EQUIPMENT_TELEMETRY) {
    summary.equipmentTelemetry = summarizeEquipmentTelemetry(results);
  }
  return summary;
}

const scenarios = Object.fromEntries(
  SCENARIO_IDS.map(scenarioId => {
    const scenario = getScenarioById(scenarioId);
    return [scenarioId, summarizeScenario(scenario)];
  })
);

const output = {
  issue: 433,
  kind: "ceiling",
  condition: CONDITION_ID,
  seed: SEED,
  identificationPolicy: IDENTIFICATION_POLICY,
  startingPowder: process.env.IDENTIFICATION_STARTING_POWDER || "default",
  curseOverrides: {
    base: process.env.SIM_CURSE_BASE_CHANCE_OVERRIDE || null,
    perFloor: process.env.SIM_CURSE_CHANCE_PER_FLOOR_OVERRIDE || null,
    max: process.env.SIM_CURSE_MAX_CHANCE_OVERRIDE || null,
    coreBonus: process.env.SIM_CURSE_CORE_BONUS_OVERRIDE || null,
    detectBase: process.env.SIM_CURSE_DETECT_BASE_OVERRIDE || null,
    detectDecay: process.env.SIM_CURSE_DETECT_DECAY_OVERRIDE || null,
    detectMin: process.env.SIM_CURSE_DETECT_MIN_OVERRIDE || null
  },
  curseLockMode: process.env.SIM_CURSE_LOCK_MODE || "current",
  coreScoreDropTolerance: process.env.SIM_CORE_SCORE_DROP_TOLERANCE || "0",
  scenarios
};
if (COLLECT_EQUIPMENT_TELEMETRY) {
  output.equipmentTelemetry = Object.fromEntries(
    Object.entries(scenarios).map(([scenarioId, summary]) => [
      scenarioId,
      summary.equipmentTelemetry
    ])
  );
}
console.log(JSON.stringify(output, null, 2));
