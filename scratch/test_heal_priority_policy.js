/* global process */

process.env.SIM_SEED = "487";
process.env.SIM_RUNS = "100";

const {
  calibrateCoreScoringProfile,
  getScenarioById,
  resetSimulationRandom,
  simulateRun
} = await import("./sim_depth_material_ev.js");

const RUNS = 100;
const CALIBRATION_RUNS = 100;
const failures = [];

function hashSeed(text) {
  let seed = 2166136261;
  for (let index = 0; index < text.length; index++) {
    seed ^= text.charCodeAt(index);
    seed = Math.imul(seed, 16777619);
  }
  return seed >>> 0;
}

function check(condition, message) {
  if (!condition) failures.push(message);
}

function measure(healPriorityPolicy) {
  const scenario = {
    ...getScenarioById("workshop-complete"),
    fleeHpThreshold: null,
    healPriorityPolicy,
    bloodWandHealPolicy: "reserve-potion",
    simDiagnosticLevel: "off",
    collectHealPriorityDiagnostics: true
  };
  resetSimulationRandom(487);
  const scoringProfile = calibrateCoreScoringProfile(
    CALIBRATION_RUNS,
    scenario,
    "powder",
    scenario.workshop
  );
  const rows = [];
  for (let runIndex = 0; runIndex < RUNS; runIndex++) {
    resetSimulationRandom(hashSeed(`issue487-policy-test:${runIndex}`));
    rows.push(simulateRun({
      className: "Priest",
      startFloor: 1,
      targetDepth: 21,
      runIndex,
      seriesId: "issue487-policy-test",
      scoringProfile,
      scenario,
      workshop: scenario.workshop
    }));
  }
  return rows.reduce((sum, result) => ({
    conflicts: sum.conflicts + result.diosPotionPriorityCases,
    opportunities: sum.opportunities + result.diosPotionPriorityOpportunities,
    diosCasts: sum.diosCasts + result.diosCastCount,
    recoveryPotions: sum.recoveryPotions + result.recoveryPotionsUsed,
    samples: sum.samples + result.diosPotionPriorityEventSamples.length,
    policy: result.healPriorityPolicy,
    bloodWandPolicy: result.bloodWandHealPolicy
  }), {
    conflicts: 0,
    opportunities: 0,
    diosCasts: 0,
    recoveryPotions: 0,
    samples: 0,
    policy: null,
    bloodWandPolicy: null
  });
}

const potionFirst = measure("potion-first");
const diosFirst = measure("dios-first");

check(potionFirst.policy === "potion-first", "potion-first policy did not reach simulateRun");
check(diosFirst.policy === "dios-first", "dios-first policy did not reach simulateRun");
check(
  potionFirst.bloodWandPolicy === "reserve-potion" &&
    diosFirst.bloodWandPolicy === "reserve-potion",
  "blood-wand policy wiring changed unexpectedly"
);
check(potionFirst.opportunities > 0, "no DIOS/potion opportunity was observed");
check(potionFirst.conflicts > 0, "potion-first did not record a DIOS/potion conflict");
check(diosFirst.conflicts === 0, "dios-first still selected a potion during a DIOS conflict");
check(potionFirst.samples > 0, "potion-first did not retain conflict samples");
check(
  potionFirst.recoveryPotions !== diosFirst.recoveryPotions,
  "priority what-if did not change recovery potion consumption"
);
check(
  potionFirst.diosCasts !== diosFirst.diosCasts,
  "priority what-if did not change DIOS cast count"
);

if (failures.length > 0) {
  failures.forEach(failure => console.error(`[FAIL] ${failure}`));
  process.exit(1);
}

console.log(
  `[PASS] heal priority policy: conflicts ${potionFirst.conflicts} -> ${diosFirst.conflicts}; ` +
    `DIOS casts ${potionFirst.diosCasts} -> ${diosFirst.diosCasts}; ` +
    `recovery potions ${potionFirst.recoveryPotions} -> ${diosFirst.recoveryPotions}`
);
