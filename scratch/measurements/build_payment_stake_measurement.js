// sim-scope: run — Build Snapshotごとの支払いベクトルをcanonical runで測定する
/* global console, process */

import "../simulations/simulation_preflight.js";
import fs from "node:fs";
import { performance } from "node:perf_hooks";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveMeasurementProvenance } from "./measurement_provenance.js";
import { resolveSimParallelism, runSimTasks } from "../simulations/sim_parallel.js";
import {
  applyStandardSimulationEnv,
  resolveBalanceMeasurementConfig
} from "./balance_measurement.js";

export const ISSUE1100_SCHEMA_VERSION = 2;
export const ISSUE1100_RUNNER_VERSION = "issue1100-build-payment-stake-v1";
const ISSUE1100_NUMERIC_DECISIONS = new Set(["none", "candidate", "not_assessed"]);

const MEASUREMENT_RUNNER_PATHS = [
  "scratch/measurements/build_payment_stake_measurement.js",
  "scratch/measurements/balance_measurement.js",
  "scratch/measurements/build_fixtures.js",
  "scratch/simulations/sim_depth_material_ev.js",
  "scratch/simulations/sim_parallel.js",
  "scratch/measurements/measurement_provenance.js",
  "src/rules/build_snapshot.js",
  "src/rules/object_loot_stake.js",
  "src/state/run_loot.js"
];

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (value === "--output" || value === "--summary" || value === "--decision-file") {
      const next = argv[++index];
      if (!next) throw new Error(`${value} requires a path`);
      const optionName = value === "--decision-file" ? "decisionFile" : value.slice(2);
      options[optionName] = next;
    } else if (value === "--runs" || value === "--calibration-runs" || value === "--seed") {
      const next = argv[++index];
      if (!next) throw new Error(`${value} requires a value`);
      const optionName = value === "--calibration-runs" ? "calibrationRuns" : value.slice(2);
      options[optionName] = Number(next);
    } else if (value === "--help") {
      console.log(
        "Usage: node scratch/measurements/build_payment_stake_measurement.js " +
        "--output /private/tmp/issue1100.json --decision-file evidence/results/issue-1100-build-payment-stake-decision.json " +
        "[--summary /private/tmp/issue1100.md]"
      );
      return null;
    } else {
      throw new Error(`unknown option: ${value}`);
    }
  }
  if (!options.output) {
    throw new Error("--output is required; raw measurements must be explicitly placed in a temporary/results path");
  }
  if (!options.decisionFile) {
    throw new Error("--decision-file is required; classification must be an explicit post-measurement input");
  }
  return options;
}

export function validateIssue1100Decision(decision) {
  if (!decision || !ISSUE1100_NUMERIC_DECISIONS.has(decision.numericBalanceChange)) {
    throw new Error("issue #1100 decision requires numericBalanceChange none/candidate/not_assessed");
  }
  if (!Array.isArray(decision.additionalObservation) || !Array.isArray(decision.balanceIssueCandidates)) {
    throw new Error("issue #1100 decision requires observation and balance issue arrays");
  }
  if (typeof decision.basis !== "string" || !decision.basis.trim()) {
    throw new Error("issue #1100 decision requires a non-empty basis");
  }
  return true;
}

function readDecisionFile(path) {
  let decision;
  try {
    decision = JSON.parse(fs.readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`issue #1100 decision file could not be read: ${error.message}`);
  }
  validateIssue1100Decision(decision);
  return decision;
}

function taskKey(task) {
  return `${task.scenarioId}/${task.fixtureId}`;
}

function buildTasks(config) {
  return config.scenarioIds.flatMap(scenarioId => config.fixtureIds.map(fixtureId => ({
    kind: "scenario",
    scenarioId,
    fixtureId,
    identificationPolicyId: config.identificationPolicy,
    runCount: config.calibrationRuns,
    collectVNextObservability: true,
    scenarioOverrides: {
      collectStage15Diagnostics: true,
      collectCombatFormula: true,
      collectVNextObservability: true
    }
  })));
}

function resultByDepth(taskResult, targetDepth) {
  const result = taskResult?.results?.find(candidate => candidate.targetDepth === targetDepth);
  if (!result) throw new Error(`missing issue #1100 depth result: B${targetDepth}`);
  if (!result.buildPayment) throw new Error(`missing build payment aggregate: B${targetDepth}`);
  return result;
}

function buildCase(task, taskResult, targetDepth) {
  const result = resultByDepth(taskResult, targetDepth);
  const fixtureId = task.fixtureId;
  return {
    fixtureId,
    scenarioId: task.scenarioId,
    scenario: result.label,
    workshop: result.workshop,
    targetDepth,
    runs: result.buildPayment.runs,
    startingBuildSnapshot: result.startingBuildSnapshotsByFixtureId?.[fixtureId] || null,
    endingBuildSnapshotDistribution:
      result.endingBuildSnapshotDistributionByFixtureId?.[fixtureId] || null,
    outcome: {
      outcomeDistribution: { ...result.outcomeCounts },
      deathCauseDistribution: result.runDiagnostics?.deathCauseDistribution || {},
      endFloorDistribution: result.runDiagnostics?.endFloorDistribution || {},
      reachedTargetRuns: result.entrantsByFloor?.[targetDepth] || 0,
      breakthroughRuns: result.breakthroughsByFloor?.[targetDepth] || 0,
      returnRuns: result.outcomeCounts?.retreat || 0,
      deathRuns: result.outcomeCounts?.death || 0,
      deepestFloorMean: result.averageReachedFloor,
      finalHp: result.buildPayment.resources.finalHp,
      finalMp: result.buildPayment.resources.finalMp
    },
    payment: result.buildPayment
  };
}

export function buildIssue1100Report({ config, provenance, taskResults, execution, determinism, decision }) {
  validateIssue1100Decision(decision);
  const tasks = buildTasks(config);
  const resultsByKey = new Map(tasks.map((task, index) => [taskKey(task), taskResults[index]]));
  const cases = config.scenarioIds.flatMap(scenarioId => config.targetDepths.flatMap(targetDepth =>
    config.fixtureIds.map(fixtureId => {
      const task = { scenarioId, fixtureId };
      return buildCase(task, resultsByKey.get(taskKey(task)), targetDepth);
    })
  ));
  return {
    schemaVersion: ISSUE1100_SCHEMA_VERSION,
    measurement: {
      runnerVersion: ISSUE1100_RUNNER_VERSION,
      question: "各Build Snapshotがcanonical runで安く/高く支払う資源と行動を実測する",
      scope: "observation-only; no win-rate equalization, recommendation, or balance tuning",
      sourceCommit: provenance?.sourceCommit || null,
      productionBaselineSha: provenance?.gameplaySourceCommit || null,
      measurementRunnerCommit: provenance?.measurementRunnerCommit || null,
      measurementRunnerPaths: provenance?.measurementRunnerPaths || MEASUREMENT_RUNNER_PATHS,
      measurementRunnerDiffSha256: provenance?.measurementRunnerDiffSha256 || null,
      baseRef: provenance?.baseRef || "origin/main",
      originMainAncestor: provenance?.originMainAncestor ?? null,
      workingTreeClean: provenance?.workingTreeClean ?? null,
      comparisonKey: config.comparisonKey,
      determinism
    },
    config: {
      profile: config.profile,
      seed: config.seed,
      runs: config.runs,
      calibrationRuns: config.calibrationRuns,
      identificationPolicy: config.identificationPolicy,
      fixtureIds: [...config.fixtureIds],
      scenarioIds: [...config.scenarioIds],
      targetDepths: [...config.targetDepths],
      seedPolicy: config.seedPolicy,
      simulationEnv: config.simulationEnv
    },
    execution,
    modeling: {
      modeled: [
        "canonical outcome/death cause/deepest floor",
        "attack/spell/guard/item/flee/noop actions, combat rounds",
        "HP damage/healing, MP spent/starvation, bounded terminal MP rate and over-max diagnostic, Guard physical mitigation/status resistance",
        "fixture Rune cast mix/unused sockets, Core/Support exposure/adoption/firing",
        "exploration Support resolved values and observed-use proxies",
        "equipment exposure/adoption/discard/build shift, final bag occupancy",
        "Portal Push/Return/Wing decisions and use-time HP/MP/inventory/material state",
        "production unconfirmed object-loot stake composition at reward, Portal, Wing salvage, and terminal boundaries",
        "found/bagged/consumed/discarded/left/banked/salvaged/lost lifecycle counts keyed by production loot IDs"
      ],
      omitted: [
        "item value proxy",
        "qualitative player recommendation or balance tuning"
      ],
      interpretation: "object-loot stake uses production loot IDs for both adopted ledger entries and pending discarded/left outcomes"
    },
    decision: {
      numericBalanceChange: decision.numericBalanceChange,
      additionalObservation: [...decision.additionalObservation],
      balanceIssueCandidates: [...decision.balanceIssueCandidates],
      basis: decision.basis
    },
    cases
  };
}

export function validateIssue1100Report(report) {
  if (report?.schemaVersion !== ISSUE1100_SCHEMA_VERSION) {
    throw new Error(`issue #1100 schema version mismatch: ${report?.schemaVersion}`);
  }
  const config = report.config;
  if (!config || config.runs < 500) throw new Error("issue #1100 requires N>=500");
  validateIssue1100Decision(report.decision);
  const expectedKeys = new Set(
    config.scenarioIds.flatMap(scenarioId => config.targetDepths.flatMap(targetDepth =>
      config.fixtureIds.map(fixtureId => `${scenarioId}/${targetDepth}/${fixtureId}`)
    ))
  );
  const actualKeys = new Set((report.cases || []).map(measuredCase =>
    `${measuredCase.scenarioId}/${measuredCase.targetDepth}/${measuredCase.fixtureId}`
  ));
  if (actualKeys.size !== expectedKeys.size || [...expectedKeys].some(key => !actualKeys.has(key))) {
    throw new Error("issue #1100 fixture/scenario/depth coverage is incomplete");
  }
  const distributions = [
    "combat.rounds", "resources.damageTakenHp", "resources.healingHp", "resources.mpSpent",
    "resources.finalHp", "resources.finalMp", "resources.finalMpOverMax", "guard.mitigationHp", "guard.mitigationEvents",
    "guard.statusMitigationEvents", "loot.finalBagSlots"
  ];
  (report.cases || []).forEach(measuredCase => {
    if (measuredCase.runs !== config.runs) {
      throw new Error(`issue #1100 N mismatch: ${measuredCase.scenarioId}/${measuredCase.fixtureId}`);
    }
    const outcomeCount = Object.values(measuredCase.outcome?.outcomeDistribution || {})
      .reduce((sum, count) => sum + count, 0);
    if (outcomeCount !== config.runs) throw new Error("issue #1100 outcome count mismatch");
    if (!measuredCase.startingBuildSnapshot?.identity) {
      throw new Error("issue #1100 starting Build Snapshot is missing");
    }
    const endingSnapshots = measuredCase.endingBuildSnapshotDistribution;
    if (!endingSnapshots || endingSnapshots.runs !== config.runs) {
      throw new Error("issue #1100 ending Build Snapshot distribution N mismatch");
    }
    const endingSnapshotCount = Object.values(endingSnapshots.byIdentity || {})
      .reduce((sum, entry) => sum + (entry.count || 0), 0);
    if (endingSnapshotCount !== config.runs) {
      throw new Error("issue #1100 ending Build Snapshot identity counts mismatch");
    }
    distributions.forEach(path => {
      const value = path.split(".").reduce((current, key) => current?.[key], measuredCase.payment);
      if (!value || value.n !== config.runs) {
        throw new Error(`issue #1100 distribution N mismatch: ${path}`);
      }
    });
    if (measuredCase.payment.guard.statusMitigationSource !== "combatFormulaTelemetry.statusMitigations") {
      throw new Error("issue #1100 status mitigation provenance is not production combat telemetry");
    }
    ["hpRate", "mpRate", "inventorySlots", "inventoryFreeSlots", "carriedMaterials"]
      .forEach(name => {
        const value = measuredCase.payment.terminalResourceState?.[name];
        if (!value || value.n !== config.runs) {
          throw new Error(`issue #1100 terminal resource distribution N mismatch: ${name}`);
        }
      });
    if (!measuredCase.payment.terminalResourceState?.mpOverMax ||
        measuredCase.payment.terminalResourceState.mpOverMax.n !== config.runs) {
      throw new Error("issue #1100 terminal resource distribution N mismatch: mpOverMax");
    }
    const stake = measuredCase.payment.stake;
    if (!stake || stake.schemaVersion !== 1 ||
        stake.ownershipSource !== "currentRun.unbankedObjectLoot" ||
        stake.identitySource !== "currentRun.unbankedObjectLoot[].id") {
      throw new Error("issue #1100 production object-loot stake provenance is missing");
    }
    const terminalBefore = stake.points?.terminal_settlement_before;
    const wingBefore = stake.points?.wing_salvage_before;
    const terminalAfter = stake.points?.terminal_settlement_after;
    if (!terminalBefore || !wingBefore || !terminalAfter ||
        terminalAfter.events !== config.runs ||
        terminalAfter.unconfirmedObjectCount?.n !== config.runs ||
        terminalBefore.events + wingBefore.events !== config.runs ||
        terminalBefore.unconfirmedObjectCount?.n !== terminalBefore.events ||
        wingBefore.unconfirmedObjectCount?.n !== wingBefore.events) {
      throw new Error("issue #1100 terminal/Wing stake distribution N mismatch");
    }
    ["pending_reward_resolution", "push_decision", "portal_decision", "wing_salvage_before"].forEach(pointId => {
      const point = stake.points?.[pointId];
      if (!point || point.events < 0 || point.unconfirmedObjectCount?.n !== point.events) {
        throw new Error(`issue #1100 stake point is invalid: ${pointId}`);
      }
    });
    const lifecycle = stake.lifecycle;
    if (lifecycle?.status !== "production_ledger_and_pending_disposition" ||
        !Array.isArray(lifecycle.omittedStages) ||
        lifecycle.omittedStages.length !== 0 ||
        !["found", "bagged", "consumed", "discarded", "left", "banked", "salvaged", "lost"]
          .every(stage => Number.isFinite(lifecycle.counts?.[stage]) && lifecycle.counts[stage] >= 0) ||
        !Object.entries(lifecycle.counts || {}).every(([, count]) => Number.isFinite(count) && count >= 0)) {
      throw new Error("issue #1100 object-loot lifecycle provenance is invalid");
    }
    const portal = measuredCase.payment.portal || {};
    const portalEventCount = (Number(portal.useEvents) || 0) + (Number(portal.milestoneDecisions) || 0);
    ["hpRate", "mpRate", "inventorySlots", "inventoryFreeSlots", "carriedMaterials"]
      .forEach(name => {
        const value = measuredCase.payment.portal?.resourceState?.[name];
        if (!value || value.n !== portalEventCount) {
          throw new Error(`issue #1100 Portal resource distribution missing: ${name}`);
        }
      });
    ["resources.finalHpRate", "resources.finalMpRate", "terminalResourceState.hpRate", "terminalResourceState.mpRate"]
      .forEach(path => {
        const value = path.split(".").reduce((current, key) => current?.[key], measuredCase.payment);
        if (!value || value.min < 0 || value.max > 1) {
          throw new Error(`issue #1100 bounded resource rate violation: ${path}`);
        }
      });
  });
  if (report.measurement?.determinism?.checked && !report.measurement.determinism.matching) {
    throw new Error("issue #1100 determinism check failed");
  }
  return true;
}

function formatNumber(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : "—";
}

function caseSummaryRow(measuredCase) {
  const payment = measuredCase.payment;
  const stake = payment.stake;
  const settlementBefore = stake.points.wing_salvage_before.events > 0
    ? stake.points.wing_salvage_before
    : stake.points.terminal_settlement_before;
  return `| ${measuredCase.scenarioId} | B${measuredCase.targetDepth} | ${measuredCase.fixtureId} | ` +
    `${JSON.stringify(measuredCase.outcome.outcomeDistribution)} | ` +
    `${formatNumber(payment.combat.rounds.mean)} | ${formatNumber(payment.resources.mpSpent.mean)} | ` +
    `${formatNumber(payment.resources.damageTakenHp.mean)} | ${formatNumber(payment.guard.mitigationHp.mean)} | ` +
    `${formatNumber(payment.loot.equipmentAdopted / Math.max(1, measuredCase.runs))} | ` +
    `${formatNumber(stake.points.push_decision.unconfirmedObjectCount.mean)} | ` +
    `${formatNumber(settlementBefore.unconfirmedObjectCount.mean)} | ` +
    `${stake.lifecycle.counts.banked}/${stake.lifecycle.counts.salvaged}/${stake.lifecycle.counts.lost} | ` +
    `${payment.portal.useEvents}`;
}

export function renderIssue1100Markdown(report) {
  const lines = [
    "# Issue #1100 Build Snapshot payment measurement",
    "",
    `- runner: \`${report.measurement.runnerVersion}\` (schema v${report.schemaVersion})`,
    `- source commit: \`${report.measurement.sourceCommit}\``,
    `- production baseline SHA: \`${report.measurement.productionBaselineSha}\``,
    `- origin/main ancestor: \`${report.measurement.originMainAncestor}\`; clean tree: \`${report.measurement.workingTreeClean}\``,
    `- N=${report.config.runs}/fixture, calibration=${report.config.calibrationRuns}, seed=${report.config.seed}`,
    `- fixtures: ${report.config.fixtureIds.join(", ")}`,
    `- scenarios: ${report.config.scenarioIds.join(", ")}; depths: ${report.config.targetDepths.map(depth => `B${depth}`).join(", ")}`,
    `- determinism: ${report.measurement.determinism.checked ? (report.measurement.determinism.matching ? "pass" : "FAIL") : "not checked"}`,
    "",
    "The table reports per-run means for payment dimensions; the JSON record retains quantiles and counts.",
    "",
    "| scenario | depth | fixture | outcomes | combat rounds/run | MP spent/run | damage HP/run | Guard mitigation HP/run | equipment adopted/run | Push stake/run | settlement-before stake/run | banked/salvaged/lost | Portal uses |",
    "|---|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---|---:|",
    ...report.cases.map(caseSummaryRow),
    "",
    "## Decision",
    "",
    `- Numeric balance change: **${report.decision.numericBalanceChange}**.`,
    `- Additional observation: ${report.decision.additionalObservation.join("; ")}.`,
    `- Balance Issue candidates: ${report.decision.balanceIssueCandidates.length ? report.decision.balanceIssueCandidates.join(", ") : "none from this observation pass"}.`,
    "",
    "## Modeling boundary",
    "",
    "Object-loot stake is production-backed by `currentRun.unbankedObjectLoot` plus production pending loot IDs for explicit discarded/left outcomes; it carries composition, location, Rune supply, Core/Support/Main/Aux, reinforce/convert/pivot, unknown/curse, bag occupancy, and lifecycle counts. Item value proxy remains outside this run's emitted evidence."
  ];
  return `${lines.join("\n")}\n`;
}

async function runMeasurement(options) {
  const config = resolveBalanceMeasurementConfig(options);
  applyStandardSimulationEnv(config);
  const provenance = resolveMeasurementProvenance({
    fetchOriginMain: false,
    measurementRunnerPaths: MEASUREMENT_RUNNER_PATHS
  });
  const { IDENTIFICATION_BALANCE } = await import("../../src/rules/identification_rules.js");
  process.env.IDENTIFICATION_STARTING_POWDER = String(IDENTIFICATION_BALANCE.startingPowder);
  process.env.IDENTIFICATION_COST_OVERRIDE = String(IDENTIFICATION_BALANCE.identifyCost);
  const { runCalibratedDepthSimulationTask } = await import("../simulations/sim_depth_material_ev.js");
  const tasks = buildTasks(config);
  const startedAt = performance.now();
  const startedResourceUsage = process.resourceUsage();
  const taskResults = await runSimTasks({
    moduleUrl: new URL("../simulations/sim_depth_material_ev.js", import.meta.url).href,
    exportName: "runCalibratedDepthSimulationTask",
    runTask: runCalibratedDepthSimulationTask,
    tasks,
    context: {},
    mapGeneratorExportName: "generateSharedRunFloor"
  });
  const firstTaskResults = await runSimTasks({
    moduleUrl: new URL("../simulations/sim_depth_material_ev.js", import.meta.url).href,
    exportName: "runCalibratedDepthSimulationTask",
    runTask: runCalibratedDepthSimulationTask,
    tasks: [tasks[0]],
    context: {},
    mapGeneratorExportName: "generateSharedRunFloor"
  });
  const endedResourceUsage = process.resourceUsage();
  const execution = {
    taskCount: tasks.length,
    determinismProbeTaskCount: 1,
    parallelism: resolveSimParallelism(tasks.length),
    wallClockMs: Math.round(performance.now() - startedAt),
    cpuTimeMs: Math.round(
      (endedResourceUsage.userCPUTime - startedResourceUsage.userCPUTime +
        endedResourceUsage.systemCPUTime - startedResourceUsage.systemCPUTime) / 1000
    )
  };
  const deterministicProjection = taskResult => JSON.stringify({
    profile: taskResult.profile,
    results: taskResult.results
  });
  const determinism = {
    checked: true,
    taskKey: taskKey(tasks[0]),
    matching: deterministicProjection(taskResults[0]) === deterministicProjection(firstTaskResults[0]),
    policy: "same seed/config/task repeated with canonical runner"
  };
  if (!determinism.matching) throw new Error("issue #1100 determinism probe failed");
  const decision = readDecisionFile(resolve(options.decisionFile));
  const report = buildIssue1100Report({ config, provenance, taskResults, execution, determinism, decision });
  validateIssue1100Report(report);
  const outputPath = resolve(options.output);
  fs.mkdirSync(dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  if (options.summary) {
    const summaryPath = resolve(options.summary);
    fs.mkdirSync(dirname(summaryPath), { recursive: true });
    fs.writeFileSync(summaryPath, renderIssue1100Markdown(report));
  }
  console.log(`Wrote issue #1100 build payment measurement: ${outputPath}`);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const options = parseArgs(process.argv.slice(2));
  if (options) await runMeasurement(options);
}
