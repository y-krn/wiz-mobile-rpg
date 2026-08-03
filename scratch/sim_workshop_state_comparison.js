// sim-scope: run — generateRunFloor-backed via the default import("./sim_depth_material_ev.js")
/* global console, process */

import { pathToFileURL } from "node:url";

const modulePath = process.env.SIM_MODULE_PATH ||
  new URL("./sim_depth_material_ev.js", import.meta.url).pathname;
const sim = await import(pathToFileURL(modulePath).href);

const {
  SIM_CLASSES,
  calibrateCoreScoringProfile,
  getResolvedSimulationEnv,
  getScenarioById,
  resetSimulationRandom,
  simulateRun
} = sim;

const RUNS = Math.max(30, Number(process.env.STATE_COMPARISON_RUNS || 1000));
const CALIBRATION_RUNS = Math.max(
  30,
  Number(process.env.STATE_COMPARISON_CALIBRATION_RUNS || 1000)
);
const STATE_IDS = [
  "workshop-empty",
  "workshop-stats",
  "workshop-gear"
];

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

function rate(successes, trials) {
  const interval = wilson(successes, trials);
  return `${(successes / trials * 100).toFixed(1)}% ` +
    `[${(interval[0] * 100).toFixed(1)},${(interval[1] * 100).toFixed(1)}]`;
}

function meanInterval(values) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) /
    Math.max(1, values.length - 1);
  const margin = 1.96 * Math.sqrt(variance / values.length);
  return `${mean.toFixed(2)} [${(mean - margin).toFixed(2)},${(mean + margin).toFixed(2)}]`;
}

function finalCoreCount(result) {
  if (Array.isArray(result.finalCoreIds)) return result.finalCoreIds.length;
  return result.finalCoreId ? 1 : 0;
}

console.log(`state comparison module=${modulePath}`);
console.log(`runs=${RUNS}, calibration=${CALIBRATION_RUNS}, targetDepth=20, B5突破=reachedFloor>5`);
console.log(`env=${JSON.stringify(getResolvedSimulationEnv())}`);

const scenarios = STATE_IDS.map(stateId => ({
  stateId,
  scenario: getScenarioById(stateId)
}));
const scoringProfiles = new Map();
for (const { stateId, scenario } of scenarios) {
  resetSimulationRandom(Number(process.env.SIM_SEED || 231));
  scoringProfiles.set(stateId, calibrateCoreScoringProfile(
    CALIBRATION_RUNS,
    {},
    "legacy",
    scenario.workshop
  ));
}
// calibrationが本計測の乱数列をずらさないよう、全state共通の先頭へ戻す。
resetSimulationRandom(Number(process.env.SIM_SEED || 231));

for (const { stateId, scenario } of scenarios) {
  const scoringProfile = scoringProfiles.get(stateId);
  const reachedFloors = [];
  let b5Breakthroughs = 0;
  let bankedMaterials = 0;
  let timeCost = 0;
  const coreCounts = {};
  for (let runIndex = 0; runIndex < RUNS; runIndex++) {
    const result = simulateRun({
      className: SIM_CLASSES[runIndex % SIM_CLASSES.length],
      startFloor: 1,
      targetDepth: 20,
      runIndex,
      // depth sim の B20 系列と一致させ、既存 report と同じ乱数列を使う。
      seriesId: "depth-20",
      scoringProfile,
      scenario,
      workshop: scenario.workshop
    });
    reachedFloors.push(result.reachedFloor);
    b5Breakthroughs += Number(result.reachedFloor > 5);
    bankedMaterials += result.bankedMaterials;
    timeCost += result.timeCost;
    const coreCount = finalCoreCount(result);
    coreCounts[coreCount] = (coreCounts[coreCount] || 0) + 1;
  }
  console.log(
    `${stateId}: avgDepth=${meanInterval(reachedFloors)}, ` +
    `B5突破=${rate(b5Breakthroughs, RUNS)}, ` +
    `bank素材EV=${(bankedMaterials / RUNS).toFixed(2)}, ` +
    `素材EV/時間=${(bankedMaterials / Math.max(1, timeCost)).toFixed(4)}, ` +
    `core分布=${Object.entries(coreCounts)
      .sort(([left], [right]) => Number(left) - Number(right))
      .map(([count, runs]) => `${count}=${rate(runs, RUNS)}`)
      .join("/")}`
  );
}
