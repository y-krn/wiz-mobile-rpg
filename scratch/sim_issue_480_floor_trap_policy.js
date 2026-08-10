// sim-scope: run — Issue #480 floor-trap-only policy audit
/* global console, process */

import { mkdirSync, writeFileSync } from "node:fs";

if (process.env.SIM_PARALLEL) {
  throw new Error("SIM_PARALLEL must be omitted for Issue #480 audit");
}
if (process.env.SIM_MAP_CACHE_ENTRIES) {
  throw new Error("SIM_MAP_CACHE_ENTRIES must be omitted for Issue #480 audit");
}

const trapPolicy = process.env.TRAP_POLICY;
if (!new Set(["legacy", "conservative"]).has(trapPolicy)) {
  throw new Error("TRAP_POLICY must be legacy or conservative for Issue #480 audit");
}

const RUNS = Math.max(1, Number(process.env.SIM_RUNS || 120));
process.env.SIM_SEED ||= "480";
process.env.SIM_RUNS ||= String(RUNS);
process.env.SIM_CALIBRATION_RUNS ||= "100";
process.env.SIM_SCENARIOS ||= "workshop-complete";
process.env.DEPARTURE_CRAFT_IDS ||= "TOWN_PORTAL,HEAL_POTION,HEAL_POTION,HEAL_POTION,HEAL_POTION,ANTIDOTE,GUARD_POTION";
process.env.IDENTIFICATION_POLICY ||= "powder";
process.env.IDENTIFICATION_STARTING_POWDER ||= "2";
process.env.IDENTIFICATION_COST_OVERRIDE ||= "1";
process.env.FLEE_POLICY ||= "threshold";
process.env.FLEE_HP_THRESHOLD ||= "0.35";
process.env.TRAP_AVOIDANCE_POLICY ||= "ev";
process.env.TRAP_DAMAGE_MULTIPLIER ||= "1";
process.env.STATUS_CURE_POLICY ||= "smart";
process.env.STATUS_CURE_HP_THRESHOLD ||= "0.35";
process.env.STATUS_CURE_MERCHANT_POLICY ||= "missing";
process.env.HEAL_POTION_MERCHANT_POLICY ||= "missing";
process.env.PORTAL_HP_THRESHOLD ||= "0.35";
process.env.PORTAL_MAX_HEAL_POTIONS ||= "0";
process.env.PORTAL_MIN_FLOOR ||= "3";
process.env.ELITE_POLICY ||= "avoid";

const {
  calibrateCoreScoringProfile,
  getScenarioById,
  resetSimulationRandom,
  simulateRun
} = await import("./sim_depth_material_ev.js");

const scenario = {
  ...getScenarioById("workshop-complete"),
  identificationPolicy: "powder",
  trapPolicy,
  // Keep chest behavior fixed at the new default so only floor policy differs.
  chestTrapPolicy: "legacy",
  trapAvoidancePolicy: "ev",
  statusCurePolicy: "smart",
  statusCureHpThreshold: 0.35,
  statusCureMerchantPolicy: "missing",
  healPotionMerchantPolicy: "missing",
  fleeHpThreshold: 0.35,
  elitePolicy: "avoid",
  simDiagnosticLevel: "off"
};

const scoringProfile = calibrateCoreScoringProfile(
  Number(process.env.SIM_CALIBRATION_RUNS),
  { trapPolicy, chestTrapPolicy: "legacy", simDiagnosticLevel: "off" },
  "powder",
  scenario.workshop
);

function meanInterval(values) {
  const n = values.length;
  const mean = values.reduce((sum, value) => sum + value, 0) / n;
  if (n < 2) return { mean, ci95: null, n, status: "未確定" };
  const sumSquares = values.reduce((sum, value) => sum + value * value, 0);
  const variance = Math.max(0, (sumSquares - (mean * mean * n)) / (n - 1));
  const margin = 1.959963984540054 * Math.sqrt(variance / n);
  return {
    mean,
    ci95: [mean - margin, mean + margin],
    n,
    status: n < 30 ? "未確定" : "監査方向"
  };
}

resetSimulationRandom(Number(process.env.SIM_SEED));
const rows = [];
for (let runIndex = 0; runIndex < RUNS; runIndex++) {
  const className = ["Fighter", "Thief", "Priest", "Mage"][runIndex % 4];
  const result = simulateRun({
    className,
    startFloor: 1,
    targetDepth: 20,
    runIndex,
    seriesId: "issue-480-floor-trap-policy",
    scoringProfile,
    scenario,
    workshop: scenario.workshop
  });
  rows.push({
    reachedFloor: result.reachedFloor,
    materialAcquired: result.materialAcquired,
    floorTrapDamageHp: result.trapDamageHpBySource.floor
  });
}

const summary = {
  issue: 480,
  policy: trapPolicy,
  chestPolicy: "legacy",
  scenario: "workshop-complete",
  seed: Number(process.env.SIM_SEED),
  runs: RUNS,
  ci: "95% normal mean CI; N<30 is 未確定",
  interpretation: "direction audit, not a formal #341 default decision",
  endpoint: {
    reachedFloor: meanInterval(rows.map(row => row.reachedFloor)),
    materialAcquired: meanInterval(rows.map(row => row.materialAcquired)),
    floorTrapDamageHp: meanInterval(rows.map(row => row.floorTrapDamageHp))
  }
};

mkdirSync("scratch/results", { recursive: true });
writeFileSync(
  `scratch/results/issue-480-floor-trap-${trapPolicy}.json`,
  `${JSON.stringify(summary, null, 2)}\n`
);
console.log(JSON.stringify(summary, null, 2));
