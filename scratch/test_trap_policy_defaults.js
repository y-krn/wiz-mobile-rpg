delete process.env.TRAP_POLICY;
delete process.env.SIM_PRESET;

const {
  DEFAULT_FLOOR_TRAP_POLICY_ID,
  DEFAULT_TRAP_POLICY_ID,
  getScenarioById,
  simulateRun
} = await import("./sim_depth_material_ev.js");

const failures = [];
function check(label, actual, expected) {
  if (actual !== expected) failures.push(`${label}: expected ${expected}, got ${actual}`);
}

check("default chest policy", DEFAULT_TRAP_POLICY_ID, "legacy");
check("default floor policy", DEFAULT_FLOOR_TRAP_POLICY_ID, "conservative");

const result = simulateRun({
  className: "Fighter",
  startFloor: 1,
  targetDepth: 1,
  runIndex: 0,
  seriesId: "trap-policy-defaults",
  scoringProfile: null,
  scenario: getScenarioById("legacy-no-portal"),
  workshop: { ranks: {} }
});
check("sim floor policy", result.trapPolicy, "conservative");
check("sim chest policy", result.chestTrapPolicy, "legacy");

const explicitResult = simulateRun({
  className: "Fighter",
  startFloor: 1,
  targetDepth: 1,
  runIndex: 0,
  seriesId: "trap-policy-explicit",
  scoringProfile: null,
  scenario: {
    ...getScenarioById("legacy-no-portal"),
    trapPolicy: "conservative"
  },
  workshop: { ranks: {} }
});
check("explicit floor policy", explicitResult.trapPolicy, "conservative");
check("explicit chest policy", explicitResult.chestTrapPolicy, "conservative");

if (failures.length > 0) {
  failures.forEach(failure => console.error(`[FAIL] ${failure}`));
  process.exit(1);
}

console.log("[PASS] trap policy defaults and simulation state");
