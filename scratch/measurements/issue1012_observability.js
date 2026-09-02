// sim-scope: run — deterministic vNext observability acceptance measurement using the canonical run simulator
/* global console, process */

import "../simulations/simulation_preflight.js";
import fs from "node:fs";
import { dirname, resolve } from "node:path";
import { resolveMeasurementProvenance } from "./measurement_provenance.js";

function parseArgs(argv) {
  const options = { runs: 500, seed: 1012, scenario: "workshop-empty", classes: "" };
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (["--output", "--summary", "--scenario", "--classes", "--runs", "--seed"].includes(value)) {
      const next = argv[++index];
      if (!next) throw new Error(`${value} requires a value`);
      const key = value.slice(2);
      options[key] = ["runs", "seed"].includes(key) ? Number(next) : next;
    } else if (value === "--help") {
      console.log("Usage: node scratch/measurements/issue1012_observability.js --output /private/tmp/issue1012.json [--summary /private/tmp/issue1012.md] [--runs 500] [--scenario workshop-empty] [--classes Mage]");
      process.exit(0);
    } else {
      throw new Error(`unknown option: ${value}`);
    }
  }
  if (!options.output) throw new Error("--output is required; raw measurements must be explicitly placed in a temporary/results path");
  if (!Number.isInteger(options.runs) || options.runs < 1) throw new Error("--runs must be a positive integer");
  if (!Number.isInteger(options.seed) || options.seed < 0) throw new Error("--seed must be a non-negative integer");
  return options;
}

function buildObservation(result, className) {
  return {
    className,
    targetDepth: result.targetDepth,
    routePolicy: result.routePolicy || "partial_information_exploration",
    exploration: result.vnextObservability?.exploration || {},
    portal: {
      milestonePortalPolicy: result.milestonePortalPolicy,
      visits: result.milestonePortalVisits,
      returns: result.milestonePortalRetreats,
      townPortalUseRate: result.townPortalUseRate
    },
    build: result.vnextObservability?.equipment || {
      swapEvents: null,
      buildShiftEvents: null
    },
    elite: {
      policy: result.elitePolicy,
      averageEncounters: result.averageEliteEncounters,
      victoryRate: result.eliteVictoryRate,
      fleeRate: result.eliteFleeRate,
      deathRate: result.eliteDeathRate,
      averageAvoidDetourSteps: result.averageEliteAvoidDetourSteps
    },
    loot: result.vnextObservability?.objectLootLifecycle || {
      status: "not_modeled",
      reason: "canonical simulator tracks equipment/material outcomes but not production object-loot ownership"
    },
    deathLoss: {
      status: "not_modeled",
      reason: "object-loot loss is a production telemetry lifecycle outcome, not a canonical simulator outcome"
    }
  };
}

export function buildIssue1012Report({ options, provenance, observations }) {
  return {
    measurement: {
      issue: 1012,
      schemaVersion: 2,
      runner: "issue1012_observability",
      sourceCommit: provenance?.sourceCommit || null,
      gameplaySourceCommit: provenance?.gameplaySourceCommit || null,
      measurementRunnerCommit: provenance?.measurementRunnerCommit || null,
      measurementRunnerPaths: provenance?.measurementRunnerPaths || null,
      measurementRunnerDiffSha256: provenance?.measurementRunnerDiffSha256 || null,
      seed: options.seed,
      runsPerClass: options.runs,
      scenario: options.scenario,
      classes: options.classes.split(",").map(value => value.trim()).filter(Boolean),
      priorMeasurementPolicy: "does_not_restart_issue_990"
    },
    eventSchema: [
      "run_start", "stairs_discovered", "floor_exploration", "valuable_location",
      "loot_lifecycle", "equipment_decision", "build_shift", "portal_decision",
      "elite_decision", "run_end"
    ],
    observations
  };
}

const options = parseArgs(process.argv.slice(2));
process.env.SIM_RUNS = String(options.runs);
process.env.SIM_CALIBRATION_RUNS = String(options.runs);
process.env.SIM_SEED = String(options.seed);
process.env.SIM_INDEPENDENT_RUN_RANDOM = "1";

const provenance = process.env.SIM_SKIP_PROVENANCE === "1"
  ? null
  : resolveMeasurementProvenance({
      fetchOriginMain: false,
      measurementRunnerPaths: [
        "scratch/measurements/issue1012_observability.js",
        "scratch/measurements/measurement_provenance.js",
        "scratch/simulations/sim_depth_material_ev.js",
        "scratch/simulations/simulation_manifest.js"
      ]
    });
const { getScenarioById, runCalibratedDepthSimulationTask, SIM_CLASSES } =
  await import("../simulations/sim_depth_material_ev.js");
const scenario = getScenarioById(options.scenario);
const requestedClasses = options.classes.split(",").map(value => value.trim()).filter(Boolean);
const classNames = requestedClasses.length > 0 ? requestedClasses : SIM_CLASSES;
classNames.forEach(className => {
  if (!SIM_CLASSES.includes(className)) throw new Error(`unknown simulation class: ${className}`);
});
options.classes = classNames.join(",");

const observations = [];
for (const className of classNames) {
  const task = runCalibratedDepthSimulationTask({
    kind: "scenario",
    scenarioId: scenario.id,
    identificationPolicyId: "powder",
    className,
    runCount: options.runs,
    collectVNextObservability: true,
    scenarioOverrides: {
      routePolicy: "partial_information_exploration",
      personaPolicy: {
        exploration: {
          budgetMultiplier: 2.5,
          budgetExtraSteps: 10,
          afterStairsSteps: 4
        }
      }
    }
  }, {});
  task.results.forEach(result => observations.push(buildObservation(result, className)));
}

const report = buildIssue1012Report({ options, provenance, observations });
const outputPath = resolve(options.output);
fs.mkdirSync(dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
if (options.summary) {
  const summaryPath = resolve(options.summary);
  fs.mkdirSync(dirname(summaryPath), { recursive: true });
  fs.writeFileSync(summaryPath, [
    "# Issue #1012 observability measurement",
    "",
    `- source commit: \`${report.measurement.sourceCommit}\``,
    `- gameplay source commit: \`${report.measurement.gameplaySourceCommit}\``,
    `- N=${report.measurement.runsPerClass}, seed=${report.measurement.seed}, scenario=${report.measurement.scenario}`,
    `- classes: ${report.measurement.classes.join(", ")}`,
    "- production object-loot ownership loss is intentionally reported as `not_modeled`; it is measured by `loot_lifecycle` production events.",
    "- this runner uses the canonical simulator and does not restart Issue #990.",
    ""
  ].join("\n"));
}
console.log(`Wrote Issue #1012 observability measurement: ${outputPath}`);
