// sim-scope: run
/* global console, process */

import {
  calibrateCoreScoringProfile,
  getResolvedSimulationEnv,
  getScenarioById,
  resetSimulationRandom,
  simulateRun
} from "./sim_depth_material_ev.js";
import { ITEMS } from "../src/data/items.js";
import { purchaseWorkshopNode } from "../src/systems/workshop.js";

const RUNS = Math.max(30, Number(process.env.STARTING_GEAR_SWEEP_RUNS || 1000));
const CALIBRATION_RUNS = Math.max(
  30,
  Number(process.env.STARTING_GEAR_SWEEP_CALIBRATION_RUNS || 1000)
);
const SEED = Number(process.env.SIM_SEED || 231) >>> 0;
const IDENTIFICATION_POLICY = getResolvedSimulationEnv().IDENTIFICATION_POLICY || "legacy";
const CANDIDATES = ["DAGGER", "MACE", "SHORT_SWORD", "FIGHTER_SABER", "LONG_SWORD"];

function wilson(successes, trials) {
  const z = 1.96;
  const rate = successes / Math.max(1, trials);
  const denominator = 1 + (z * z) / trials;
  const center = (rate + (z * z) / (2 * trials)) / denominator;
  const margin = z * Math.sqrt(
    (rate * (1 - rate) + (z * z) / (4 * trials)) / trials
  ) / denominator;
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

function formatRate(successes, trials) {
  if (trials <= 0) return "未観測 [N=0]";
  const interval = wilson(successes, trials);
  const uncertain = trials < 30 ? " 未確定" : "";
  return `${(successes / trials * 100).toFixed(1)}% ` +
    `[${(interval[0] * 100).toFixed(1)},${(interval[1] * 100).toFixed(1)}; N=${trials}]${uncertain}`;
}

function formatMean(values) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) /
    Math.max(1, values.length - 1);
  const margin = 1.96 * Math.sqrt(variance / values.length);
  return `${mean.toFixed(2)} [${(mean - margin).toFixed(2)},${(mean + margin).toFixed(2)}; N=${values.length}]`;
}

const baseScenario = getScenarioById("workshop-gear");
const purchased = purchaseWorkshopNode(
  { "獣の牙": 4, "鉄片": 2 },
  { ranks: {} },
  "gear_fighter_saber"
);
if (!purchased.ok || purchased.workshop.ranks.gear_fighter_saber !== 1) {
  throw new Error("startingGear sweep must use purchaseWorkshopNode for gear_fighter_saber");
}
const workshop = {
  ranks: {
    ...baseScenario.workshop.ranks,
    gear_fighter_saber: purchased.workshop.ranks.gear_fighter_saber
  }
};

resetSimulationRandom(SEED);
const scoringProfile = calibrateCoreScoringProfile(
  CALIBRATION_RUNS,
  {},
  IDENTIFICATION_POLICY,
  workshop
);

console.log(
  `startingGear sweep: class=Fighter, targetDepth=20, runs=${RUNS}, ` +
  `calibration=${CALIBRATION_RUNS}, seed=${SEED}, ` +
  `IDENTIFICATION_POLICY=${IDENTIFICATION_POLICY}`
);
console.log("候補 | atk | 攻撃差 | 平均到達階(95%CI) | B5突破率(95%CI) | B5死亡率(95%CI) | bank/run | 素材EV/時間 | 実装上の装備開始率(95%CI)");

for (const candidateId of CANDIDATES) {
  const candidate = ITEMS[candidateId];
  if (!candidate || !candidate.classes.includes("Fighter")) {
    throw new Error(`invalid Fighter candidate: ${candidateId}`);
  }
  resetSimulationRandom(SEED);
  const reachedFloors = [];
  let b5Entrants = 0;
  let b5Breakthroughs = 0;
  let b5Deaths = 0;
  let bankedMaterials = 0;
  let timeCost = 0;
  for (let runIndex = 0; runIndex < RUNS; runIndex++) {
    const result = simulateRun({
      className: "Fighter",
      startFloor: 1,
      targetDepth: 20,
      runIndex,
      seriesId: "starting-gear-sweep",
      scoringProfile,
      scenario: {
        ...baseScenario,
        identificationPolicy: IDENTIFICATION_POLICY,
        startingGearCandidatesOverride: [candidateId],
        startingGearChoice: candidateId
      },
      workshop
    });
    reachedFloors.push(result.reachedFloor);
    b5Entrants += Number(result.reachedFloor >= 5);
    b5Breakthroughs += Number(result.reachedFloor > 5);
    b5Deaths += Number(result.deathFloor === 5);
    bankedMaterials += result.bankedMaterials;
    timeCost += result.timeCost;
  }
  resetSimulationRandom(SEED);
  let automaticallyApplied = 0;
  for (let runIndex = 0; runIndex < RUNS; runIndex++) {
    const result = simulateRun({
      className: "Fighter",
      startFloor: 1,
      targetDepth: 20,
      runIndex,
      seriesId: "starting-gear-sweep-usage",
      scoringProfile,
      scenario: {
        ...baseScenario,
        identificationPolicy: IDENTIFICATION_POLICY,
        startingGearCandidatesOverride: [candidateId]
      },
      workshop
    });
    automaticallyApplied += Number(result.workshopEffects.startingGearApplied === candidateId);
  }
  console.log(
    `${candidateId} | ${candidate.atk} | ${candidate.atk - ITEMS.SHORT_SWORD.atk} | ` +
    `${formatMean(reachedFloors)} | ${formatRate(b5Breakthroughs, RUNS)} | ` +
    `${formatRate(b5Deaths, b5Entrants)} | ${(bankedMaterials / RUNS).toFixed(2)} | ` +
    `${(bankedMaterials / Math.max(1, timeCost)).toFixed(4)} | ` +
    `${formatRate(automaticallyApplied, RUNS)}`
  );
}
