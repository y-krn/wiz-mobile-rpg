const {
  isDisarmAptClass,
  calculateDisarmRate,
  calculateDetectRate,
  FORCE_DAMAGE_MULTIPLIER,
  PARTIAL_SUCCESS_BAND,
  PITFALL_EDGE_BONUS
} = await import("../src/rules/trap_rules.js");

console.log("=== TRAP RULES VERIFICATION ===");

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    console.error(`FAIL: ${label} — expected ${expected}, got ${actual}`);
    process.exit(1);
  }
  console.log(`- ${label}: ${actual}`);
}

console.log("\n[1] Aptitude class detection:");
for (const cls of ["Thief", "Ninja", "Ranger"]) {
  assertEqual(isDisarmAptClass(cls), true, `${cls} is apt`);
}
for (const cls of ["Fighter", "Mage", "Priest", "Bishop", "Lord", "Samurai"]) {
  assertEqual(isDisarmAptClass(cls), false, `${cls} is not apt`);
}

console.log("\n[2] Disarm rate (apt):");
assertEqual(calculateDisarmRate({ className: "Thief", level: 1, floor: 1 }), 81, "Thief lv1 B1");
assertEqual(calculateDisarmRate({ className: "Thief", level: 10, floor: 10 }), 72, "Thief lv10 B10");
assertEqual(calculateDisarmRate({ className: "Ninja", level: 20, floor: 20 }), 62, "Ninja lv20 B20");
assertEqual(calculateDisarmRate({ className: "Thief", level: 30, floor: 1 }), 90, "apt upper clamp");
assertEqual(calculateDisarmRate({ className: "Thief", level: 1, floor: 60 }), 20, "apt lower clamp");

console.log("\n[3] Disarm rate (non-apt):");
assertEqual(calculateDisarmRate({ className: "Fighter", level: 1, floor: 1 }), 41, "Fighter lv1 B1");
assertEqual(calculateDisarmRate({ className: "Fighter", level: 10, floor: 10 }), 27, "Fighter lv10 B10");
assertEqual(calculateDisarmRate({ className: "Mage", level: 20, floor: 20 }), 12, "Mage lv20 B20");
assertEqual(calculateDisarmRate({ className: "Fighter", level: 60, floor: 1 }), 60, "non-apt upper clamp");
assertEqual(calculateDisarmRate({ className: "Fighter", level: 1, floor: 30 }), 5, "non-apt lower clamp");

console.log("\n[4] Affix bonus:");
assertEqual(
  calculateDisarmRate({ className: "Fighter", level: 1, floor: 1, affixBonus: 10 }),
  51,
  "Fighter lv1 B1 +10 affix"
);
assertEqual(
  calculateDisarmRate({ className: "Thief", level: 1, floor: 1, affixBonus: 50 }),
  90,
  "affix cannot exceed upper clamp"
);

console.log("\n[5] Detect rate:");
assertEqual(calculateDetectRate({ floor: 1 }), 0.85, "B1 detect");
assertEqual(calculateDetectRate({ floor: 11 }), 0.7, "B11 detect");
assertEqual(calculateDetectRate({ floor: 30 }), 0.6, "B30 detect (clamped)");

console.log("\n[6] Constants:");
assertEqual(FORCE_DAMAGE_MULTIPLIER, 0.5, "force damage multiplier");
assertEqual(PARTIAL_SUCCESS_BAND, 15, "partial success band");
assertEqual(PITFALL_EDGE_BONUS, 20, "pitfall edge bonus");

console.log("\n=== ALL TRAP RULES TESTS PASSED ===");
