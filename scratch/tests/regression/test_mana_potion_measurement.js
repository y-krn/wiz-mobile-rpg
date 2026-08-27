/* global process */

process.env.SIM_SKIP_PROVENANCE = "1";
process.env.SIM_RUNS = "1";
process.env.DEPARTURE_CRAFT_IDS = "";

const { getScenarioById, simulateRun } = await import("../../simulations/sim_depth_material_ev.js");

const failures = [];
function check(condition, message) {
  if (!condition) failures.push(message);
}

const bank = {
  "魔石片": 3,
  "呪布": 1,
  "硬い皮": 1,
  "獣の牙": 1,
  "黒角": 2,
  "骨片": 2,
  "霊粉": 1
};
const scenario = {
  ...getScenarioById("legacy-no-portal"),
  departureCraftMeasurement: true,
  departureCraftMaterialsAreActualBank: true,
  departureCraftMaterials: bank,
  simDiagnosticLevel: "off"
};

const priest = simulateRun({
  className: "Priest",
  startFloor: 1,
  targetDepth: 1,
  runIndex: 0,
  seriesId: "issue648-measurement-test",
  scoringProfile: null,
  scenario,
  workshop: scenario.workshop
});
const fighter = simulateRun({
  className: "Fighter",
  startFloor: 1,
  targetDepth: 1,
  runIndex: 0,
  seriesId: "issue648-measurement-test",
  scoringProfile: null,
  scenario,
  workshop: scenario.workshop
});

check(
  priest.departureCraftCraftedByRecipe.MANA_POTION === 1,
  "Priest did not purchase one affordable MANA_POTION"
);
check(
  priest.manaPotionsAcquiredBySource.departureCraft === 1,
  "MANA_POTION departure source was not recorded"
);
check(
  priest.departureCraftPotentialByRecipe.HEAL_POTION === 1 &&
    priest.departureCraftPotentialByRecipe.GREATER_HEAL === 1 &&
    priest.departureCraftPotentialByRecipe.HOLY_WATER === 1,
  "counterfactual craftability did not use the shared craft rules"
);
check(
  fighter.departureCraftCraftedByRecipe.MANA_POTION === 0 &&
    fighter.departureCraftPotentialByRecipe.MANA_POTION === 1,
  "non-caster demand policy did not separate actual purchase from affordance"
);
check(
  priest.manaPotionThreshold === 0.55,
  "MANA_POTION threshold did not reach simulateRun"
);

if (failures.length > 0) {
  failures.forEach(message => console.error(`[FAIL] ${message}`));
  process.exit(1);
}

console.log("[PASS] Issue #648 departure craft and source wiring");
