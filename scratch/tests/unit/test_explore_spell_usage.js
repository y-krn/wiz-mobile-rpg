/* global process */

process.env.SIM_SEED = "5992";
process.env.SIM_RUNS = "48";
process.env.SIM_CALIBRATION_RUNS = "12";
process.env.SIM_INDEPENDENT_RUN_RANDOM = "1";
process.env.SIM_EXPLORE_SPELLS = "on";

const {
  calibrateCoreScoringProfile,
  getScenarioById,
  resetSimulationRandom,
  simulateRun
} = await import("../../simulations/sim_depth_material_ev.js");

const RUNS = 48;
const failures = [];

function hashSeed(text) {
  let seed = 2166136261;
  for (const character of text) {
    seed ^= character.codePointAt(0);
    seed = Math.imul(seed, 16777619);
  }
  return seed >>> 0;
}

function check(condition, message) {
  if (!condition) failures.push(message);
}

const scenario = {
  ...getScenarioById("workshop-complete"),
  simDiagnosticLevel: "off"
};
const scoringProfile = calibrateCoreScoringProfile(
  12,
  scenario,
  "powder",
  scenario.workshop
);
const usageTotals = {
  MILWA: 0,
  LOMILWA: 0,
  MASFEAL: 0,
  DUMAPIC: 0
};
let lightActiveSteps = 0;
let masfealActiveSteps = 0;

for (let runIndex = 0; runIndex < RUNS; runIndex++) {
  const className = runIndex % 2 === 0 ? "Priest" : "Mage";
  resetSimulationRandom(hashSeed(`issue599-explore-spells:${className}:${runIndex}`));
  const result = simulateRun({
    className,
    startFloor: 1,
    targetDepth: 20,
    runIndex,
    seriesId: "issue599-explore-spells",
    scoringProfile,
    scenario,
    workshop: scenario.workshop
  });
  for (const spellName of Object.keys(usageTotals)) {
    usageTotals[spellName] += result.explorationSpellUsage?.[spellName] || 0;
  }
  lightActiveSteps += result.lightActiveSteps || 0;
  masfealActiveSteps += result.masfealActiveSteps || 0;
}

check(usageTotals.MILWA > 0, "MILWA was never cast");
check(usageTotals.LOMILWA > 0, "LOMILWA was never cast");
check(usageTotals.MASFEAL > 0, "MASFEAL was never cast");
check(usageTotals.DUMAPIC === 0, "DUMAPIC unexpectedly affected exploration");
check(lightActiveSteps > 0, "light was never active");
check(masfealActiveSteps > 0, "MASFEAL was never active");

if (failures.length > 0) {
  failures.forEach(failure => console.error(`[FAIL] ${failure}`));
  process.exit(1);
}

console.log(
  `[PASS] exploration spell usage: MILWA=${usageTotals.MILWA}, ` +
    `LOMILWA=${usageTotals.LOMILWA}, MASFEAL=${usageTotals.MASFEAL}`
);
