// sim-scope: run
/* global console, process */

import { pathToFileURL } from "node:url";
import { runSimTasks } from "./sim_parallel.js";

const sim = await import("./sim_depth_material_ev.js");
const { AFFIX_BALANCE } = await import("../src/data/affixes.js");

const SCENARIO_IDS = [
  "workshop-empty",
  "workshop-stats",
  "workshop-gear",
  "workshop-blood-wand",
  "workshop-blood-wand-spells",
  "workshop-core-pools",
  "workshop-complete"
];
const CONDITION = process.env.SIM_437_CONDITION || "current";
const IDENTIFICATION_POLICY = process.env.IDENTIFICATION_POLICY || "powder";
const ENV = sim.getResolvedSimulationEnv();
const RUNS = Math.max(1, Number(ENV.SIM_RUNS || 500));
const CALIBRATION_RUNS = Math.max(
  1,
  Number(ENV.SIM_CALIBRATION_RUNS || RUNS)
);
const SEED = Number(ENV.SIM_SEED || 231) >>> 0;

function addBudget(budgets, amount) {
  return budgets.map((budget, floor) => floor === 0 ? budget : budget + amount);
}

function applyCondition() {
  if (CONDITION === "current") return;

  if (CONDITION === "core2-no-budget") {
    AFFIX_BALANCE.rollComposition.rare.core = 2;
    AFFIX_BALANCE.rollComposition.epic.core = 2;
    return;
  }

  if (CONDITION === "core2-budgeted") {
    AFFIX_BALANCE.rollComposition.rare.core = 2;
    AFFIX_BALANCE.rollComposition.epic.core = 2;
    AFFIX_BALANCE.budgetsByRarityAndFloor.rare = addBudget(
      AFFIX_BALANCE.budgetsByRarityAndFloor.rare,
      10
    );
    AFFIX_BALANCE.budgetsByRarityAndFloor.epic = addBudget(
      AFFIX_BALANCE.budgetsByRarityAndFloor.epic,
      10
    );
    return;
  }

  if (CONDITION.startsWith("rare-chance-")) {
    const chance = Number(CONDITION.slice("rare-chance-".length));
    if (!Number.isFinite(chance) || chance < 0 || chance > 1) {
      throw new Error(`invalid rare chance condition: ${CONDITION}`);
    }
    AFFIX_BALANCE.rollComposition.rare.coreChance = chance;
    return;
  }

  if (CONDITION === "magic-core") {
    AFFIX_BALANCE.rollComposition.magic.core = 1;
    AFFIX_BALANCE.budgetsByRarityAndFloor.magic = [0, 10, 10, 10, 10, 10];
    return;
  }

  throw new Error(
    `SIM_437_CONDITION must be current|core2-no-budget|core2-budgeted|` +
    `rare-chance-0..1|magic-core: ${CONDITION}`
  );
}

applyCondition();

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
  const mean = values.reduce((sum, value) => sum + value, 0) /
    Math.max(1, values.length);
  if (values.length < 2) {
    return { mean, low: null, high: null, trials: values.length, uncertain: true };
  }
  const variance = values.reduce(
    (sum, value) => sum + ((value - mean) ** 2),
    0
  ) / (values.length - 1);
  const margin = 1.96 * Math.sqrt(variance / values.length);
  return {
    mean,
    low: mean - margin,
    high: mean + margin,
    trials: values.length,
    uncertain: values.length < 30
  };
}

function formatMeanInterval(interval, digits = 2) {
  if (interval.low === null) return `${interval.mean.toFixed(digits)} [未確定; N=${interval.trials}]`;
  return `${interval.mean.toFixed(digits)} [` +
    `${interval.low.toFixed(digits)},${interval.high.toFixed(digits)}; N=${interval.trials}]`;
}

function emptyReasonCounts() {
  return { powder: 0, score: 0, curseLock: 0, replacement: 0, other: 0 };
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
    result.coreEncounteredIds.forEach(coreId => {
      if (finalCoreIds.includes(coreId)) return;
      reasons[getCoreReason(result, coreId)]++;
    });
  });

  const nonEquipmentTotal = Object.values(reasons).reduce((sum, count) => sum + count, 0);
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
      total: nonEquipmentTotal,
      reasons: Object.fromEntries(
        Object.entries(reasons).map(([key, count]) => [
          key,
          wilson(count, nonEquipmentTotal)
        ])
      )
    },
    equipment: {
      coreFound: coreEquipmentFound,
      equipmentFound,
      coreShare: wilson(coreEquipmentFound, equipmentFound),
      cursedCoreEquipmentFound
    }
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

function summarizeScenario(scenario, results) {
  const reachedFloors = results.map(result => result.reachedFloor);
  const bankedMaterials = results.map(result => result.bankedMaterials);
  const materialEvPerTime = results.map(result =>
    result.timeCost > 0 ? result.bankedMaterials / result.timeCost : 0
  );
  const powderAcquired = results.map(result => result.identificationPowderAcquired);
  const powderUsed = results.map(result => result.identificationPowderUsed);
  const powderRemaining = results.map(result => result.identificationPowderRemaining);
  const reached = meanInterval(reachedFloors);
  const banked = meanInterval(bankedMaterials);
  const evPerTime = meanInterval(materialEvPerTime);
  const acquired = meanInterval(powderAcquired);
  const used = meanInterval(powderUsed);
  const remaining = meanInterval(powderRemaining);
  const core = countCoreMetrics(results);

  return {
    targetDepth: 20,
    averageReachedFloor: reached.mean,
    averageReachedFloor95CI: formatMeanInterval(reached),
    bankedMaterialEv: banked.mean,
    bankedMaterialEv95CI: formatMeanInterval(banked),
    materialEvPerTime: evPerTime.mean,
    materialEvPerTime95CI: formatMeanInterval(evPerTime, 4),
    b5: milestoneMetrics(results, 5),
    b10: milestoneMetrics(results, 10),
    coreEncounter: core.encounter,
    coreEquipped: core.equipped,
    coreRetention: core.retention,
    coreEquipmentShare: core.equipment.coreShare,
    coreCountDistribution: core.distribution,
    coreNonEquipment: core.nonEquipment,
    powder: {
      acquired: acquired.mean,
      acquired95CI: formatMeanInterval(acquired),
      consumed: used.mean,
      consumed95CI: formatMeanInterval(used),
      remaining: remaining.mean,
      remaining95CI: formatMeanInterval(remaining),
      depleted: wilson(
        results.filter(result => result.identificationPowderDepleted).length,
        results.length
      )
    },
    workshop: scenario.workshop
  };
}

export function runTask(task, { scoringProfilesByScenario }) {
  const scenario = sim.getScenarioById(task.scenarioId);
  const scoringProfile = scoringProfilesByScenario[
    `${IDENTIFICATION_POLICY}:${task.scenarioId}`
  ];
  sim.resetSimulationRandom(SEED);
  const results = [];
  for (let runIndex = 0; runIndex < RUNS; runIndex++) {
    results.push(sim.simulateRun({
      className: sim.SIM_CLASSES[runIndex % sim.SIM_CLASSES.length],
      startFloor: 1,
      targetDepth: 20,
      runIndex,
      seriesId: "depth-20",
      scoringProfile,
      scenario: { ...scenario, identificationPolicy: IDENTIFICATION_POLICY },
      workshop: scenario.workshop,
      collectEquipmentTelemetry: false
    }));
  }
  return results;
}

async function main() {
  const scenarios = SCENARIO_IDS.map(id => sim.getScenarioById(id));
  const scoringProfilesByScenario = {};
  for (const scenario of scenarios) {
    sim.resetSimulationRandom(SEED);
    scoringProfilesByScenario[`${IDENTIFICATION_POLICY}:${scenario.id}`] =
      sim.calibrateCoreScoringProfile(
        CALIBRATION_RUNS,
        {},
        IDENTIFICATION_POLICY,
        scenario.workshop
      );
  }

  const taskResults = await runSimTasks({
    moduleUrl: import.meta.url,
    exportName: "runTask",
    runTask,
    tasks: scenarios.map(scenario => ({
      scenarioId: scenario.id,
      identificationPolicyId: IDENTIFICATION_POLICY
    })),
    context: { scoringProfilesByScenario }
  });

  const output = {
    issue: 437,
    condition: CONDITION,
    seed: SEED,
    runs: RUNS,
    calibrationRuns: CALIBRATION_RUNS,
    identificationPolicy: IDENTIFICATION_POLICY,
    resolvedSimulationEnv: ENV,
    affixBalance: {
      rollComposition: AFFIX_BALANCE.rollComposition,
      budgetsByRarityAndFloor: AFFIX_BALANCE.budgetsByRarityAndFloor
    },
    scenarios: Object.fromEntries(
      scenarios.map((scenario, index) => [
        scenario.id,
        summarizeScenario(scenario, taskResults[index])
      ])
    )
  };
  console.log(JSON.stringify(output, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
