const {
  calculateChestDisarmActionEv,
  calculateChestDisarmEvThreshold,
  calculateChestDisarmChance,
  calculateDisarmRate,
  calculateFloorDisarmEvThreshold,
  calculateFloorTrapActionExpectedDamage,
  calculateFloorTrapAvoidanceEv,
  calculateDetectRate,
  CHEST_WEAKENED_RISK_MULTIPLIER,
  FORCE_DAMAGE_MULTIPLIER,
  PARTIAL_SUCCESS_BAND,
  PITFALL_EDGE_BONUS
} = await import("../../../src/rules/trap_rules.js");

console.log("=== TRAP RULES VERIFICATION ===");

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    console.error(`FAIL: ${label} — expected ${expected}, got ${actual}`);
    process.exit(1);
  }
  console.log(`- ${label}: ${actual}`);
}

function assertClose(actual, expected, label) {
  if (Math.abs(actual - expected) > 1e-9) {
    console.error(`FAIL: ${label} — expected ${expected}, got ${actual}`);
    process.exit(1);
  }
  console.log(`- ${label}: ${actual}`);
}

console.log("\n[1] Universal disarm rate:");
assertEqual(calculateDisarmRate({ className: "Thief", level: 1, floor: 1 }), 85, "Thief-shaped caller B1");
assertEqual(calculateDisarmRate({ className: "Fighter", level: 99, floor: 1 }), 85, "Fighter-shaped caller B1");
assertEqual(calculateDisarmRate({ className: "Mage", level: 1, floor: 10 }), 37, "Mage-shaped caller B10");
assertEqual(calculateDisarmRate({ className: "Ninja", level: 20, floor: 20 }), 5, "Ninja-shaped caller B20");
assertEqual(calculateDisarmRate({ className: "Thief", level: 30, floor: 1, difficulty: 0 }), 95, "universal upper clamp");
assertEqual(calculateDisarmRate({ className: "Thief", level: 1, floor: 60 }), 5, "universal lower clamp");

console.log("\n[2] Build bonus and chest chance:");
assertEqual(
  calculateDisarmRate({ className: "Fighter", level: 1, floor: 1, affixBonus: 10 }),
  95,
  "universal B1 +10 affix"
);
assertEqual(
  calculateDisarmRate({ className: "Thief", level: 1, floor: 1, affixBonus: 50 }),
  95,
  "affix cannot exceed upper clamp"
);
assertEqual(calculateChestDisarmChance(), 0.25, "universal chest base chance");
assertEqual(calculateChestDisarmChance({ className: "Thief" }), 0.25, "class-shaped chest caller is ignored");
assertEqual(calculateChestDisarmChance({ trapBonus: 0.10 }), 0.35, "chest trapBonus");
assertEqual(calculateChestDisarmChance({ className: "Fighter", blind: true }), 0.125, "blind halves universal chest chance");

console.log("\n[3] Detect rate:");
assertEqual(calculateDetectRate({ floor: 1 }), 1, "B1 detect");
assertEqual(calculateDetectRate({ floor: 11 }), 1, "B11 detect");
assertEqual(calculateDetectRate({ floor: 30 }), 1, "B30 detect (clamped)");
assertEqual(calculateDetectRate({ floor: 15, scoutBonus: 0.30 }), 1, "B15 scout bonus no longer changes detect");
assertEqual(calculateDetectRate({ floor: 20 }), 1, "B20 detect");
assertEqual(calculateDetectRate({ floor: 20, scoutBonus: 0.15 }), 1, "B20 scout bonus no longer changes detect");
assertEqual(calculateDetectRate({ floor: 20, scoutBonus: 0.30 }), 1, "B20 full scout bonus no longer changes detect");

console.log("\n[4] Constants:");
assertEqual(FORCE_DAMAGE_MULTIPLIER, 0.5, "force damage multiplier");
assertEqual(PARTIAL_SUCCESS_BAND, 15, "partial success band");
assertEqual(PITFALL_EDGE_BONUS, 20, "pitfall edge bonus");

console.log("\n[5] EV disarm thresholds:");
assertClose(
  calculateFloorDisarmEvThreshold({ trapType: "damage" }),
  (100 - PARTIAL_SUCCESS_BAND) * (1 - FORCE_DAMAGE_MULTIPLIER),
  "non-pitfall threshold without scout"
);
assertClose(
  calculateFloorDisarmEvThreshold({ trapType: "pitfall" }),
  100 * (1 - FORCE_DAMAGE_MULTIPLIER),
  "pitfall threshold without scout"
);
assertClose(
  calculateChestDisarmEvThreshold(),
  1 - CHEST_WEAKENED_RISK_MULTIPLIER,
  "chest representative threshold"
);
assertClose(
  calculateChestDisarmEvThreshold({
    fullRiskMultiplier: 1,
    weakenedRiskMultiplier: 0.5,
    contentValue: 1,
    forcedContentLossRate: 0.30
  }),
  0.20,
  "usable content loss lowers chest threshold"
);
assertEqual(
  calculateChestDisarmActionEv({
    successRate: 0.25,
    fullRisk: 1,
    weakenedRisk: 0.5,
    contentValue: 1,
    forcedContentLossRate: 0.30
  }).action,
  "direct",
  "content EV can select direct below representative threshold"
);
assertEqual(
  calculateChestDisarmActionEv({
    successRate: 0.85,
    fullRisk: 1,
    weakenedRisk: 0.5,
    kitCount: 1,
    futureChestCount: 1
  }).action,
  "direct",
  "single kit is reserved for the next chest"
);
assertEqual(
  calculateChestDisarmActionEv({
    successRate: 0.25,
    fullRisk: 1,
    weakenedRisk: 0.5,
    kitCount: 1,
    futureChestCount: 0
  }).action,
  "kit",
  "kit is used when no future chest remains"
);
assertEqual(
  calculateChestDisarmActionEv({
    successRate: 0.25,
    fullRisk: 1,
    weakenedRisk: 0.5,
    kitCount: 2,
    futureChestCount: 1
  }).action,
  "kit",
  "surplus kit can be spent"
);

console.log("\n[6] Trap action and avoidance EV:");
const nonPitfallThreshold = calculateFloorDisarmEvThreshold({ trapType: "damage" });
const forceExpectedDamage = calculateFloorTrapActionExpectedDamage({
  action: "force",
  trapType: "damage",
  fullDamage: 10,
  weakenedDamage: 10 * FORCE_DAMAGE_MULTIPLIER
});
assertClose(
  calculateFloorTrapActionExpectedDamage({
    action: "disarm",
    trapType: "damage",
    successRate: nonPitfallThreshold,
    fullDamage: 10,
    weakenedDamage: 10 * FORCE_DAMAGE_MULTIPLIER
  }),
  forceExpectedDamage,
  "disarm threshold equals force expected damage"
);
const cheapDetour = calculateFloorTrapAvoidanceEv({
  encounterChances: [0.04, 0.04],
  expectedDamagePerEncounter: 100,
  directExpectedDamage: 10
});
assertEqual(cheapDetour.shouldAvoid, true, "cheap detour is selected");
assertClose(cheapDetour.expectedEncounters, 0.08, "detour encounter expectation");
assertEqual(
  calculateFloorTrapAvoidanceEv({
    encounterChances: [0.04],
    expectedDamagePerEncounter: null,
    directExpectedDamage: 10
  }).shouldAvoid,
  false,
  "detour without combat estimate is rejected"
);

console.log("\n=== ALL TRAP RULES TESTS PASSED ===");
