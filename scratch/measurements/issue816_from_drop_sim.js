// sim-scope: run — measure the existing source-backed fromDrop chest path and its smash decisions
/* global process */

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

process.env.SIM_SEED ||= "816";
process.env.SIM_INDEPENDENT_RUN_RANDOM ||= "1";
const { SIM_CLASSES, MEASUREMENT_PROVENANCE, simulateRun } =
  await import("../simulations/sim_depth_material_ev.js");

const RUNS_PER_CLASS = Math.max(1, Number(process.env.ISSUE816_SIM_N || 500));
const TARGET_DEPTH = Math.max(2, Number(process.env.ISSUE816_SIM_TARGET_DEPTH || 10));
const SEED = Number(process.env.SIM_SEED || 816);
const SCENARIO = Object.freeze({
  chestTrapPolicy: process.env.ISSUE816_CHEST_POLICY || "legacy",
  trapPolicy: process.env.ISSUE816_TRAP_POLICY || "conservative"
});

const SUM_FIELDS = Object.freeze([
  "generated", "opened", "inspected", "inspectSuccesses", "inspectFailures",
  "rewardsAwarded", "rewardsLost", "trapsTriggered", "mainTownPortalRewards", "specialTownPortalRewards"
]);
const ACTIONS = Object.freeze(["inspect", "open", "disarm", "trap_kit", "smash", "leave"]);
const DECISION_ACTIONS = Object.freeze(["open", "disarm", "trap_kit", "smash", "leave"]);
const SOURCES = Object.freeze(["ordinary", "secretRoom", "fromDrop"]);

function wilsonInterval(successes, trials, z = 1.96) {
  if (trials <= 0) return null;
  const p = successes / trials;
  const z2 = z * z;
  const denominator = 1 + z2 / trials;
  const center = (p + z2 / (2 * trials)) / denominator;
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * trials)) / trials) / denominator;
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

function createSourceTotals() {
  return Object.fromEntries(SOURCES.map(source => [source, {
    ...Object.fromEntries(SUM_FIELDS.map(field => [field, 0])),
    actions: Object.fromEntries(ACTIONS.map(action => [action, 0])),
    runsWithSource: 0,
    lethalRuns: 0
  }]));
}

function addRun(target, result) {
  SOURCES.forEach(source => {
    const fromRun = result.chestPath?.[source];
    if (!fromRun?.generated) return;
    const totals = target[source];
    totals.runsWithSource++;
    SUM_FIELDS.forEach(field => { totals[field] += fromRun[field] || 0; });
    ACTIONS.forEach(action => { totals.actions[action] += fromRun.actions?.[action] || 0; });
    if (source === "fromDrop" && result.deathEncounterType === "from-drop-chest-trap") {
      totals.lethalRuns++;
    }
  });
}

function finalizeSourceTotals(totals) {
  return Object.fromEntries(SOURCES.map(source => {
    const value = totals[source];
    const choices = DECISION_ACTIONS.reduce((sum, action) => sum + value.actions[action], 0);
    return [source, {
      ...value,
      smashRate: {
        successes: value.actions.smash,
        trials: choices,
        estimate: choices > 0 ? value.actions.smash / choices : null,
        ci95: wilsonInterval(value.actions.smash, choices),
        confidence: choices >= 30 ? "sufficient" : choices > 0 ? "low-n" : "unobserved"
      },
      actionsPerChest: Object.fromEntries(
        ACTIONS.map(action => [action, value.generated > 0 ? value.actions[action] / value.generated : null])
      )
    }];
  }));
}

export function runFromDropSimulation() {
  const totals = createSourceTotals();
  const outcomes = { retreat: 0, death: 0, abandon: 0 };
  for (const className of SIM_CLASSES) {
    for (let runIndex = 0; runIndex < RUNS_PER_CLASS; runIndex++) {
      const result = simulateRun({
        className,
        startFloor: 1,
        targetDepth: TARGET_DEPTH,
        runIndex,
        seriesId: "issue-816-from-drop",
        scoringProfile: null,
        scenario: SCENARIO,
        workshop: { ranks: {} }
      });
      outcomes[result.outcome] = (outcomes[result.outcome] || 0) + 1;
      addRun(totals, result);
    }
  }
  return {
    schemaVersion: 1,
    issue: 816,
    runner: "scratch/measurements/issue816_from_drop_sim.js",
    measurement: {
      sourceCommit: MEASUREMENT_PROVENANCE?.sourceCommit || execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
      gameplaySourceCommit: MEASUREMENT_PROVENANCE?.gameplaySourceCommit || null,
      simulatorRunnerCommit: MEASUREMENT_PROVENANCE?.measurementRunnerCommit || null,
      simulatorRunnerPaths: MEASUREMENT_PROVENANCE?.measurementRunnerPaths || ["scratch/simulations/sim_depth_material_ev.js"],
      measurementRunnerDiffSha256: MEASUREMENT_PROVENANCE?.measurementRunnerDiffSha256 || null,
      seed: SEED,
      seedPolicy: "SIM_INDEPENDENT_RUN_RANDOM=1; each class/run uses the canonical simulator run seed",
      runsPerClass: RUNS_PER_CLASS,
      totalRuns: RUNS_PER_CLASS * SIM_CLASSES.length,
      targetDepth: TARGET_DEPTH,
      classes: [...SIM_CLASSES],
      configuration: SCENARIO,
      modeledMechanisms: [
        "generateRunFloor-backed traversal",
        "combat-generated fromDrop chest creation",
        "source-backed chest rewards, trap resolution, and smash-equivalent action policy"
      ],
      omittedMechanisms: [
        "live UI timing and manual input timing",
        "live telemetry transport"
      ]
    },
    outcomes,
    sources: finalizeSourceTotals(totals),
    decision: "fromDrop smash is measured in the canonical run simulator; live player selection remains an observational telemetry question"
  };
}

if (process.argv[1] && process.argv[1].endsWith("issue816_from_drop_sim.js")) {
  const report = runFromDropSimulation();
  const outputPath = process.env.ISSUE816_SIM_OUTPUT || null;
  if (outputPath) writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
