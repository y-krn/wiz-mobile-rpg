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
// Test entrypoints and ISSUE706_SMOKE=1 are exempt so they can retain their
// existing fixtures or explicitly request a small caller-defined run; this
// runner's measurement main() is not executed for test entrypoints.
const ISSUE706_MEASUREMENT_DEFAULTS = Object.freeze({
  SIM_SEED: "231",
  SIM_RUNS: "500",
  SIM_CALIBRATION_RUNS: "100",
  STATUS_CURE_POLICY: "ev",
  FLEE_POLICY: "ev",
  TRAP_POLICY: "conservative",
  IDENTIFICATION_POLICY: "powder",
  DEPARTURE_CRAFT_IDS:
    "TOWN_PORTAL,HEAL_POTION,HEAL_POTION,HEAL_POTION,HEAL_POTION,ANTIDOTE,GUARD_POTION"
});
if (!IS_TEST_PROCESS && !IS_SMOKE_PROCESS) {
  for (const [key, value] of Object.entries(ISSUE706_MEASUREMENT_DEFAULTS)) {
    process.env[key] = value;
  }
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
    config: sim.getResolvedSimulationEnv(),
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
