// sim-scope: run — #654 paired trap-affix supply and equipped-rate measurement
/* global console, process */

import { CLASS_PASSIVES } from "../src/data/classes.js";
import { ITEMS } from "../src/data/items.js";
import { calculateFloorTrapSuccessRate } from "../src/rules/trap_rules.js";
import { getBuildSnapshot } from "./measurement_utils.js";

const {
  MEASUREMENT_PROVENANCE,
  SIM_CLASSES,
  calibrateCoreScoringProfile,
  getScenarioById,
  resetSimulationRandom,
  simulateRun
} = await import("./sim_depth_material_ev.js");

const RUNS = 500;
const CALIBRATION_RUNS = 100;
const TARGET_DEPTH = 20;
const FLOOR = 5;
const SCENARIO_ID = "workshop-complete";

function increment(counts, value) {
  const key = String(value);
  counts[key] = (counts[key] || 0) + 1;
}

function summarize(values) {
  const counts = {};
  values.forEach(value => increment(counts, value));
  return {
    n: values.length,
    counts,
    rates: Object.fromEntries(
      Object.entries(counts).map(([value, count]) => [value, count / Math.max(1, values.length)])
    )
  };
}

function getTrapInvestment(snapshot, className) {
  if (!snapshot) return 0;
  const supportAffixes = snapshot.supportAffixes || {};
  const supportBonus = Number(supportAffixes.trapBonus || 0);
  const baseBonus = (snapshot.equipment || []).reduce(
    (sum, item) => sum + Number(ITEMS[item.id]?.trapBonus || 0),
    0
  );
  const classBonus = Number(CLASS_PASSIVES[className]?.bonuses?.trapBonus || 0);
  return supportBonus + baseBonus + classBonus;
}

function snapshotRow(snapshot, className) {
  if (!snapshot) return null;
  const trapBonus = Number(snapshot.supportAffixes?.trapBonus || 0);
  const trapInvestment = getTrapInvestment(snapshot, className);
  return {
    floor: snapshot.floor,
    level: snapshot.level,
    trapBonus,
    trapInvestment,
    disarmRate: calculateFloorTrapSuccessRate({
      trap: { type: "damage" },
      className,
      level: snapshot.level,
      floor: FLOOR,
      affixBonus: trapInvestment
    })
  };
}

const scenario = {
  ...getScenarioById(SCENARIO_ID),
  departureCraftMeasurement: true,
  identificationPolicy: "powder"
};
const scoringProfile = calibrateCoreScoringProfile(
  CALIBRATION_RUNS,
  {},
  "powder",
  scenario.workshop
);

resetSimulationRandom(Number(process.env.SIM_SEED || 231));
const rows = [];
const supply = {
  equipmentFound: 0,
  trapBonusItemsFound: 0,
  trapBonusFoundByValue: {}
};

for (let runIndex = 0; runIndex < RUNS; runIndex++) {
  const className = SIM_CLASSES[runIndex % SIM_CLASSES.length];
  const result = simulateRun({
    className,
    startFloor: 1,
    targetDepth: TARGET_DEPTH,
    runIndex,
    seriesId: "issue654-trap-distribution",
    scoringProfile,
    scenario,
    workshop: scenario.workshop,
    collectBuildSnapshots: true
  });
  supply.equipmentFound += result.equipmentFound;
  supply.trapBonusItemsFound += result.trapBonusItemsFound;
  Object.entries(result.trapBonusFoundByValue).forEach(([value, count]) => {
    supply.trapBonusFoundByValue[value] = (supply.trapBonusFoundByValue[value] || 0) + count;
  });

  const b5 = getBuildSnapshot(result, FLOOR);
  const finalSnapshot = result.buildSnapshots?.at(-1) || null;
  rows.push({
    pairId: `${className}:${runIndex}`,
    className,
    reachedFloor: result.reachedFloor,
    b5: snapshotRow(b5, className),
    final: snapshotRow(finalSnapshot, className),
    trapDisarmAttempts: result.trapDisarmAttempts,
    trapDisarmSuccesses: result.trapDisarmSuccesses
  });
}

const b5Rows = rows.filter(row => row.b5);
const finalRows = rows.filter(row => row.final);
const summarizeSnapshots = (snapshotRows, key) => summarize(
  snapshotRows.map(row => Number(row[key]?.disarmRate || 0))
);
const summarizeOwned = (snapshotRows, key) => {
  const values = snapshotRows.map(row => Number(row[key]?.trapInvestment || 0));
  const withTrapAffix = snapshotRows.filter(row =>
    Number(row[key]?.trapBonus || 0) > 0
  ).length;
  return {
    ...summarize(values),
    withTrapAffix,
    withTrapAffixRate: withTrapAffix / Math.max(1, values.length)
  };
};

console.log(JSON.stringify({
  measurement: {
    sourceCommit: MEASUREMENT_PROVENANCE?.sourceCommit || null,
    originMainAncestor: MEASUREMENT_PROVENANCE?.originMainAncestor ?? null,
    seed: Number(process.env.SIM_SEED || 231),
    runs: RUNS,
    calibrationRuns: CALIBRATION_RUNS,
    scenario: SCENARIO_ID,
    targetDepth: TARGET_DEPTH,
    simParallel: process.env.SIM_PARALLEL || "<omitted>"
  },
  supply,
  b5Entrants: {
    n: b5Rows.length,
    equipped: summarizeOwned(b5Rows, "b5"),
    disarmRate: summarizeSnapshots(b5Rows, "b5")
  },
  finalSnapshot: {
    n: finalRows.length,
    equipped: summarizeOwned(finalRows, "final"),
    disarmRate: summarizeSnapshots(finalRows, "final")
  },
  rows
}));
