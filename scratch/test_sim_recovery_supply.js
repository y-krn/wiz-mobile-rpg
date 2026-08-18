/* global console, process */

const failures = [];
const {
  calibrateCoreScoringProfile,
  getScenarioById,
  parseHealPotionMerchantPolicy,
  resetSimulationRandom,
  simulateRun
} = await import("./sim_depth_material_ev.js");

function check(condition, message) {
  if (!condition) failures.push(message);
}

check(
  JSON.stringify(parseHealPotionMerchantPolicy("never")) ===
    JSON.stringify({ id: "never", maxPurchases: 0 }),
  "never policy should disable purchases"
);
check(
  JSON.stringify(parseHealPotionMerchantPolicy("missing")) ===
    JSON.stringify({ id: "missing", maxPurchases: 1 }),
  "missing policy should retain one-purchase behavior"
);
check(
  JSON.stringify(parseHealPotionMerchantPolicy("up-to-8")) ===
    JSON.stringify({ id: "up-to-8", maxPurchases: 8 }),
  "up-to-N policy should parse the run purchase cap"
);

try {
  parseHealPotionMerchantPolicy("up-to-21");
  failures.push("up-to-21 should be rejected by the inventory-sized cap");
} catch {
  // expected
}

const smokeScenario = getScenarioById("workshop-empty");
const smokeProfile = calibrateCoreScoringProfile(
  1,
  smokeScenario,
  "powder",
  smokeScenario.workshop
);
resetSimulationRandom(499);
const smokeResult = simulateRun({
  className: "Fighter",
  startFloor: 1,
  targetDepth: 3,
  runIndex: 0,
  seriesId: "recovery-supply-hook-test",
  scoringProfile: smokeProfile,
  scenario: {
    ...smokeScenario,
    chestHealPotionExtraChance: 0.5,
    chestHealPotionReplacementChance: 0.5,
    enemyHealPotionDropChance: 0.5,
    // Keep this hook smoke test alive and trap-independent after combat-balance
    // changes; it is not intended to measure the depth model.
    trapPolicy: "disabled",
    chestTrapPolicy: "disabled",
    threatOverride: { startFloor: 1, atkMultiplier: 0.1 },
    extraCampFloors: [1],
    extraCampRecoveryRate: 0.2,
    extraCampTimeCost: 3
  },
  workshop: smokeScenario.workshop
});
check(
  smokeResult.pickupRejectionsBySource?.material === 0 &&
    smokeResult.pickupRejectionsByCategory?.material === 0,
  "materials must remain outside the inventory rejection path"
);
check(
  smokeResult.chestHealPotionExtraGenerated > 0 &&
    smokeResult.chestHealPotionReplacementGenerated > 0 &&
    smokeResult.enemyHealPotionExtraGenerated > 0,
  "chest extra/replacement and enemy generation hooks should execute"
);
check(
  smokeResult.extraCampRestCount > 0 && smokeResult.extraCampTimeCost === 3,
  "candidate C camp hook should execute and charge time"
);
check(
  Object.hasOwn(smokeResult, "damageHpBySource") &&
    Object.hasOwn(smokeResult, "lastDamageEvent") &&
    Object.hasOwn(smokeResult, "deathEncounterType"),
  "damage-source telemetry should expose terminal-event fields"
);
check(
  Object.hasOwn(smokeResult, "recoveryPotionDepletedFloor") &&
    Object.hasOwn(smokeResult, "recoveryPotionShortageFloor"),
  "recovery-potion timing telemetry should expose depletion fields"
);

if (failures.length > 0) {
  failures.forEach(message => console.error(`[FAIL] ${message}`));
  process.exit(1);
}

console.log("[PASS] recovery supply hooks and merchant policy parser");
