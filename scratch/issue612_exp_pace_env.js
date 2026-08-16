const SMOKE = process.env.ISSUE612_SMOKE === "1";
const SCENARIO_IDS = SMOKE
  ? ["workshop-complete"]
  : [
      "workshop-empty",
      "workshop-stats",
      "workshop-gear",
      "workshop-blood-wand",
      "workshop-blood-wand-spells",
      "workshop-complete"
    ];

export const ISSUE612_FIXED_ENV = Object.freeze({
  BLOOD_WAND_HP_PAYMENT_MIN_RATE: "0.50",
  DEPARTURE_CRAFT_IDS:
    "TOWN_PORTAL,HEAL_POTION,HEAL_POTION,HEAL_POTION,HEAL_POTION,ANTIDOTE,GUARD_POTION",
  ELITE_POLICY: "avoid",
  FLEE_HP_THRESHOLD: "0.20",
  FLEE_POLICY: "ev",
  HEAL_POTION_MERCHANT_POLICY: "missing",
  HEAL_POTION_THRESHOLD: "0.55",
  IDENTIFICATION_COST_OVERRIDE: "1",
  IDENTIFICATION_POLICY: "powder",
  IDENTIFICATION_STARTING_POWDER: "2",
  PORTAL_HP_THRESHOLD: "0.35",
  PORTAL_MAX_HEAL_POTIONS: "0",
  PORTAL_MIN_FLOOR: "3",
  SIM_440_CONDITION: "current",
  SIM_CORE_SCORE_DROP_TOLERANCE: "0",
  SIM_DIALMA_CANDIDATE: "1",
  SIM_EQUIPMENT_POLICY: "individual-score",
  SIM_EQUIPMENT_SLOT_AFFIX_MODE: "retain",
  SIM_EQUIPMENT_SLOT_MODE: "standard",
  SIM_INDEPENDENT_RUN_RANDOM: "1",
  SIM_MATCHING_DEFINITION: "exact",
  SIM_MADI_COST: "",
  SIM_MADI_HEAL_MAX: "",
  SIM_MADI_HEAL_MIN: "",
  SIM_PRESET: "",
  SIM_RACE_BIAS: "",
  SIM_RUNS: SMOKE ? "1" : "500",
  SIM_SEED: "461",
  SIM_SCENARIOS: SCENARIO_IDS.join(","),
  SIM_SUPPORT_SUPPLY_CEILING: "none",
  STATUS_CURE_HP_THRESHOLD: "0.35",
  STATUS_CURE_MERCHANT_POLICY: "missing",
  STATUS_CURE_POLICY: "smart",
  TRAP_AVOIDANCE_POLICY: "ev",
  TRAP_DAMAGE_MULTIPLIER: "1",
  TRAP_POLICY: "conservative",
  SIM_EXPLORATION_FACTOR: "1.4",
  SIM_MAP_STATS: "0",
  SIM_DAMAGE_PROBE: "0",
  SIM_CALIBRATION_RUNS: SMOKE ? "1" : "100"
});

for (const [key, value] of Object.entries(ISSUE612_FIXED_ENV)) {
  if (process.env[key] === undefined) {
    process.env[key] = value;
    continue;
  }
  if (process.env[key] !== value) {
    throw new Error(`Issue #612 fixed env mismatch: ${key}=${process.env[key]}`);
  }
}
