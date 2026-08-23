// sim-scope: run
/* global console, process */

import { createHash } from "node:crypto";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";
import { isMainThread } from "node:worker_threads";

const IS_TEST_PROCESS = basename(process.argv[1] || "").startsWith("test_");
const IS_SMOKE_PROCESS = process.env.ISSUE706_SMOKE === "1";

// The documented Issue #706 measurement is intentionally independent of the
// caller's shell. These values must exist before sim_depth_material_ev.js is
// imported because that module resolves its policy constants at module load.
// Test entrypoints retain their fixtures. Smoke retains only its explicit
// caller-controlled seed and run counts so it remains a small check; all
// simulation policy and sensitivity inputs are still fixed.
const ISSUE706_MEASUREMENT_DEFAULTS = Object.freeze({
  SIM_SEED: "231",
  SIM_RUNS: "500",
  SIM_CALIBRATION_RUNS: "100",
  DEPARTURE_CRAFT_IDS:
    "TOWN_PORTAL,HEAL_POTION,HEAL_POTION,HEAL_POTION,HEAL_POTION,ANTIDOTE,GUARD_POTION",
  STATUS_CURE_POLICY: "ev",
  FLEE_POLICY: "ev",
  TRAP_POLICY: "conservative",
  IDENTIFICATION_POLICY: "powder",
  TRAP_AVOIDANCE_POLICY: "ev",
  TRAP_DAMAGE_MULTIPLIER: "1",
  IDENTIFICATION_STARTING_POWDER: "2",
  IDENTIFICATION_COST_OVERRIDE: "1",
  STATUS_CURE_HP_THRESHOLD: "1",
  STATUS_CURE_MERCHANT_POLICY: "missing",
  HEAL_POTION_MERCHANT_POLICY: "missing",
  FLEE_HP_THRESHOLD: "0.20",
  HEAL_POTION_THRESHOLD: "0.55",
  MANA_POTION_THRESHOLD: "0.55",
  PORTAL_HP_THRESHOLD: "0.35",
  PORTAL_MAX_HEAL_POTIONS: "0",
  PORTAL_MIN_FLOOR: "3",
  ELITE_POLICY: "avoid",
  BLOOD_WAND_HP_PAYMENT_MIN_RATE: "0.50",
  SIM_CORE_SCORE_DROP_TOLERANCE: "0",
  SIM_440_CONDITION: "current",
  SIM_ISSUE646_CAMP_LEVEL: "",
  SIM_INDEPENDENT_RUN_RANDOM: "1",
  SIM_737_DAMAGE_AUDIT: "0",
  SIM_728_HIT_EVASION: "0",
  SIM_DIALMA_CANDIDATE: "1",
  SIM_MADI_CANDIDATE: "1",
  SIM_MADI_HEAL_MIN: "",
  SIM_MADI_HEAL_MAX: "",
  SIM_MADI_COST: "",
  SIM_MERCHANT_MANA_COST: "",
  SIM_MERCHANT_EYE_DROPS: "0",
  SIM_MERCHANT_RETURN_WING: "0",
  SIM_MERCHANT_RETURN_WING_COST: "",
  SIM_RETURN_WING_MODE: "special",
  SIM_SCENARIOS: "",
  SIM_PRESET: "",
  SIM_CORE_ENCOUNTER_CEILING: "",
  SIM_CORE_WORKSHOP_GATE: "",
  SIM_SUPPORT_SUPPLY_CEILING: "none",
  SIM_EQUIPMENT_SLOT_MODE: "standard",
  SIM_EQUIPMENT_SLOT_AFFIX_MODE: "retain",
  SIM_AFFIXLESS_DUPLICATE_COUNT: "2",
  SIM_AFFIXLESS_DUPLICATE_SLOT: "",
  SIM_EQUIPMENT_POLICY: "individual-score",
  SIM_MATCHING_DEFINITION: "exact",
  SIM_CURSE_LOCK_MODE: "current",
  SIM_EXPLORATION_FACTOR: "1.4",
  SIM_MAP_STATS: "0",
  SIM_DAMAGE_PROBE: "0",
  ISSUE538_SPELL_POLICY: "",
  SIM_EXPLORE_SPELLS: "",
  SIM_CURSE_BASE_CHANCE_OVERRIDE: "",
  SIM_CURSE_CHANCE_PER_FLOOR_OVERRIDE: "",
  SIM_CURSE_MAX_CHANCE_OVERRIDE: "",
  SIM_CURSE_CORE_BONUS_OVERRIDE: "",
  SIM_CURSE_DETECT_BASE_OVERRIDE: "",
  SIM_CURSE_DETECT_DECAY_OVERRIDE: "",
  SIM_CURSE_DETECT_MIN_OVERRIDE: "",
  CI: ""
});
const ISSUE706_SMOKE_PRESERVED_KEYS = Object.freeze([
  "SIM_SEED",
  "SIM_RUNS",
  "SIM_CALIBRATION_RUNS"
]);
const ISSUE706_OMITTED_ENV_KEYS = Object.freeze([
  "SIM_PARALLEL",
  "SIM_MAP_CACHE_ENTRIES",
  "TRAP_BONUS_OVERRIDE"
]);
const ISSUE706_PROVENANCE_OVERRIDE_KEYS = Object.freeze([
  "SIM_SKIP_PROVENANCE",
  "SIM_ALLOW_STALE_TREE",
  "SIM_PROVENANCE_BASE_REF",
  "SIM_PROVENANCE_BASE_COMMIT",
  "SIM_PROVENANCE_BASE_REF_REASON",
  "SIM_PROVENANCE_TEST_FIXTURE"
]);
if (!IS_TEST_PROCESS) {
  const preservedKeys = new Set(IS_SMOKE_PROCESS ? ISSUE706_SMOKE_PRESERVED_KEYS : []);
  for (const [key, value] of Object.entries(ISSUE706_MEASUREMENT_DEFAULTS)) {
    if (!preservedKeys.has(key)) process.env[key] = value;
  }
  for (const key of ISSUE706_OMITTED_ENV_KEYS) delete process.env[key];
  for (const key of ISSUE706_PROVENANCE_OVERRIDE_KEYS) delete process.env[key];
}
const sim = await import("./sim_depth_material_ev.js");

const RUNS = Math.max(1, Number(process.env.SIM_RUNS || 500));
const CALIBRATION_RUNS = Math.max(1, Number(process.env.SIM_CALIBRATION_RUNS || 100));
const TARGET_DEPTH = 6;
const FLOORS = [1, 2, 3, 4, 5];
const CLASSES = ["Fighter", "Thief", "Priest", "Mage"];
const SCENARIO_IDS = [
  "workshop-empty",
  "workshop-stats",
  "workshop-gear",
  "workshop-blood-wand",
  "workshop-blood-wand-spells",
  "workshop-complete"
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

const ISSUE706_DIRECT_CONFIG_KEYS = Object.freeze([
  "SIM_PRESET",
  "SIM_CORE_ENCOUNTER_CEILING",
  "SIM_CORE_WORKSHOP_GATE",
  "SIM_SUPPORT_SUPPLY_CEILING",
  "SIM_EQUIPMENT_SLOT_MODE",
  "SIM_EQUIPMENT_SLOT_AFFIX_MODE",
  "SIM_AFFIXLESS_DUPLICATE_COUNT",
  "SIM_AFFIXLESS_DUPLICATE_SLOT",
  "SIM_EQUIPMENT_POLICY",
  "SIM_MATCHING_DEFINITION",
  "SIM_CURSE_LOCK_MODE",
  "SIM_EXPLORATION_FACTOR",
  "SIM_MAP_STATS",
  "SIM_DAMAGE_PROBE",
  "TRAP_BONUS_OVERRIDE",
  "ISSUE538_SPELL_POLICY",
  "SIM_EXPLORE_SPELLS",
  "SIM_CURSE_BASE_CHANCE_OVERRIDE",
  "SIM_CURSE_CHANCE_PER_FLOOR_OVERRIDE",
  "SIM_CURSE_MAX_CHANCE_OVERRIDE",
  "SIM_CURSE_CORE_BONUS_OVERRIDE",
  "SIM_CURSE_DETECT_BASE_OVERRIDE",
  "SIM_CURSE_DETECT_DECAY_OVERRIDE",
  "SIM_CURSE_DETECT_MIN_OVERRIDE"
]);

function getResolvedIssue706Config() {
  return {
    ...sim.getResolvedSimulationEnv(),
    ...Object.fromEntries(ISSUE706_DIRECT_CONFIG_KEYS.map(key => [
      key,
      process.env[key] ?? ""
    ])),
    SIM_PARALLEL: "<omitted; runtime default>",
    SIM_MAP_CACHE_ENTRIES: "<omitted; runtime default 1024>",
    SIM_SKIP_PROVENANCE: "<omitted>",
    SIM_ALLOW_STALE_TREE: "<omitted>",
    SIM_PROVENANCE_OVERRIDES: "<omitted>"
  };
}

function wilson(successes, trials) {
  if (trials === 0) return { successes, trials, estimate: null, low: null, high: null };
  const z = 1.959963984540054;
  const p = successes / trials;
  const denominator = 1 + (z * z) / trials;
  const center = (p + (z * z) / (2 * trials)) / denominator;
  const halfWidth = z * Math.sqrt(
    p * (1 - p) / trials + (z * z) / (4 * trials * trials)
  ) / denominator;
  return {
    successes,
    trials,
    estimate: p,
    low: Math.max(0, center - halfWidth),
    high: Math.min(1, center + halfWidth)
  };
}

function createFloorBuckets(factory) {
  return Object.fromEntries(FLOORS.map(floor => [String(floor), factory()]));
}

function createCountBuckets() {
  return createFloorBuckets(() => ({}));
}

function increment(bucket, key, amount = 1) {
  bucket[key] = (bucket[key] || 0) + amount;
}

function baseMonsterName(name) {
  return String(name).replace(/ [A-Z]$/, "");
}

function recordEncounterDistribution(summary, encounter) {
  const floor = Number(encounter.floor);
  if (!FLOORS.includes(floor)) return;
  const type = encounter.type || "unknown";
  increment(summary.encounterTypesByFloor[String(floor)], type);
  if (type !== "normal") return;
  summary.normalEncounterCountByFloor[String(floor)]++;
  encounter.monsters.forEach(monster => {
    increment(summary.normalMonsterCountsByFloor[String(floor)], baseMonsterName(monster.name));
    (monster.statuses || []).forEach(status => {
      if (["blind", "sleep"].includes(status)) {
        increment(summary.statusCapableMonsterCountsByFloor[String(floor)], status);
      }
    });
  });
}

function recordStatusLog(summary, encounter) {
  const floor = Number(encounter.floor);
  if (!FLOORS.includes(floor)) return;
  for (const round of encounter.rounds || []) {
    for (const message of round.log || []) {
      if (message.includes("盲目状態になった")) {
        summary.statusApplicationsByFloor[String(floor)].blind++;
      }
      if (message.includes("眠りに落ちた")) {
        summary.statusApplicationsByFloor[String(floor)].sleep++;
      }
    }
  }
}

function createSummary() {
  return {
    runs: 0,
    runsByClass: Object.fromEntries(CLASSES.map(className => [className, 0])),
    encounterTypesByFloor: createCountBuckets(),
    normalEncounterCountByFloor: Object.fromEntries(FLOORS.map(floor => [String(floor), 0])),
    normalMonsterCountsByFloor: createCountBuckets(),
    statusCapableMonsterCountsByFloor: createCountBuckets(),
    statusApplicationsByFloor: createFloorBuckets(() => ({ blind: 0, sleep: 0 })),
    encounterRunsByFloor: Object.fromEntries(FLOORS.map(floor => [String(floor), 0])),
    entrantRunsByFloor: Object.fromEntries(FLOORS.map(floor => [String(floor), 0])),
    deathRunsByFloor: Object.fromEntries(FLOORS.map(floor => [String(floor), 0])),
    retreatRunsByFloor: Object.fromEntries(FLOORS.map(floor => [String(floor), 0])),
    outcomeCounts: { retreat: 0, death: 0, abandon: 0, other: 0 },
    reachedFloor: []
  };
}

function mergeSummary(target, source) {
  target.runs += source.runs;
  CLASSES.forEach(className => {
    target.runsByClass[className] += source.runsByClass[className];
  });
  FLOORS.forEach(floor => {
    const key = String(floor);
    Object.entries(source.encounterTypesByFloor[key]).forEach(([name, count]) => {
      increment(target.encounterTypesByFloor[key], name, count);
    });
    target.normalEncounterCountByFloor[key] += source.normalEncounterCountByFloor[key];
    Object.entries(source.normalMonsterCountsByFloor[key]).forEach(([name, count]) => {
      increment(target.normalMonsterCountsByFloor[key], name, count);
    });
    Object.entries(source.statusCapableMonsterCountsByFloor[key]).forEach(([name, count]) => {
      increment(target.statusCapableMonsterCountsByFloor[key], name, count);
    });
    target.statusApplicationsByFloor[key].blind += source.statusApplicationsByFloor[key].blind;
    target.statusApplicationsByFloor[key].sleep += source.statusApplicationsByFloor[key].sleep;
    target.encounterRunsByFloor[key] += source.encounterRunsByFloor[key];
    target.entrantRunsByFloor[key] += source.entrantRunsByFloor[key];
    target.deathRunsByFloor[key] += source.deathRunsByFloor[key];
    target.retreatRunsByFloor[key] += source.retreatRunsByFloor[key];
  });
  Object.keys(target.outcomeCounts).forEach(key => {
    target.outcomeCounts[key] += source.outcomeCounts[key];
  });
  target.reachedFloor.push(...source.reachedFloor);
}

function summarizeRates(summary) {
  const statusRateDenominators = Object.fromEntries(FLOORS.map(floor => {
    const key = String(floor);
    return [key, summary.encounterRunsByFloor[key]];
  }));
  const statusApplicationRates = Object.fromEntries(FLOORS.map(floor => {
    const key = String(floor);
    const denominator = statusRateDenominators[key];
    return [key, {
      denominator,
      blindPerEncounterRun: wilson(summary.statusApplicationsByFloor[key].blind, denominator),
      sleepPerEncounterRun: wilson(summary.statusApplicationsByFloor[key].sleep, denominator)
    }];
  }));
  const b1Death = summary.deathRunsByFloor["1"];
  const b1Retreat = summary.retreatRunsByFloor["1"];
  const b1Entrants = summary.entrantRunsByFloor["1"];
  const b5Deaths = summary.deathRunsByFloor["5"];
  const b5Entrants = summary.entrantRunsByFloor["5"];
  return {
    statusApplicationRates,
    b1Outcome: {
      entrants: wilson(b1Entrants, summary.runs),
      death: wilson(b1Death, b1Entrants),
      retreat: wilson(b1Retreat, b1Entrants)
    },
    b5Outcome: {
      entrants: wilson(b5Entrants, summary.runs),
      death: wilson(b5Deaths, b5Entrants),
      retreat: wilson(summary.retreatRunsByFloor["5"], b5Entrants)
    },
    b10Arrival: null
  };
}

async function main() {
  if (!isMainThread && !IS_TEST_PROCESS) return;
  const result = {
    schema: "issue706-depth-enemy-pools-v1",
    sourceCommit: sim.MEASUREMENT_PROVENANCE?.sourceCommit || null,
    originMainAncestor: sim.MEASUREMENT_PROVENANCE?.originMainAncestor ?? null,
    staleTreeAllowed: sim.MEASUREMENT_PROVENANCE?.staleTreeAllowed ?? null,
    runner: "scratch/issue706_depth_enemy_pools.js -> scratch/sim_depth_material_ev.js simulateRun",
    seed: Number(process.env.SIM_SEED || 231),
    runsPerScenario: RUNS,
    calibrationRuns: CALIBRATION_RUNS,
    targetDepth: TARGET_DEPTH,
    classes: CLASSES,
    scenarioIds: SCENARIO_IDS,
    simParallel: "omitted; runtime default",
    config: getResolvedIssue706Config(),
    modeled: [
      "generateRunFloor-driven real traversal",
      "current four-class simulateRun combat, rewards, level-up, flee, retreat, death",
      "current status-cure EV policy and equipment scoring",
      "floor-level normal and special encounter diagnostics"
    ],
    omitted: [
      "manual player input and UI timing",
      "optional merchant purchases outside configured policy",
      "encounter-level causal attribution beyond observed status/death outcomes"
    ],
    scenarios: {}
  };

  for (const scenarioId of SCENARIO_IDS) {
    const scenario = sim.getScenarioById(scenarioId);
    const scoringProfile = sim.calibrateCoreScoringProfile(
      CALIBRATION_RUNS,
      {},
      "powder",
      scenario.workshop
    );
    const summary = createSummary();
    for (let runIndex = 0; runIndex < RUNS; runIndex++) {
      const className = CLASSES[runIndex % CLASSES.length];
      const run = sim.simulateRun({
        className,
        startFloor: 1,
        targetDepth: TARGET_DEPTH,
        runIndex,
        seriesId: "depth-6",
        scoringProfile,
        scenario: {
          ...scenario,
          departureCraftMeasurement: true,
          simDiagnosticLevel: "full"
        },
        workshop: scenario.workshop,
        collectDiagnostics: true
      });
      summary.runs++;
      summary.runsByClass[className]++;
      summary.reachedFloor.push(run.reachedFloor);
      if (Object.hasOwn(summary.outcomeCounts, run.outcome)) {
        summary.outcomeCounts[run.outcome]++;
      } else {
        summary.outcomeCounts.other++;
      }
      for (const floor of FLOORS) {
        const key = String(floor);
        if (run.reachedFloor >= floor) summary.entrantRunsByFloor[key]++;
        if (run.deathFloor === floor) summary.deathRunsByFloor[key]++;
        if (run.outcome === "retreat" && run.reachedFloor === floor) {
          summary.retreatRunsByFloor[key]++;
        }
      }
      for (const encounter of run.diagnostics?.encounters || []) {
        const floor = Number(encounter.floor);
        if (FLOORS.includes(floor)) summary.encounterRunsByFloor[String(floor)]++;
        recordEncounterDistribution(summary, encounter);
        recordStatusLog(summary, encounter);
      }
    }
    result.scenarios[scenarioId] = {
      workshop: scenario.workshop,
      summary,
      rates: summarizeRates(summary)
    };
  }

  const output = `${JSON.stringify(result)}\n`;
  console.log(output.trim());
  console.error(`ISSUE706_JSON_SHA256=${sha256(output)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
