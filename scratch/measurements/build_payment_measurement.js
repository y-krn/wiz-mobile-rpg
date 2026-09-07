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

export const ISSUE1096_SCHEMA_VERSION = 1;
export const ISSUE1096_RUNNER_VERSION = "issue1096-build-payment-v1";
const ISSUE1096_NUMERIC_DECISIONS = new Set(["none", "candidate", "not_assessed"]);

const MEASUREMENT_RUNNER_PATHS = [
  "scratch/measurements/build_payment_measurement.js",
  "scratch/measurements/balance_measurement.js",
  "scratch/measurements/build_fixtures.js",
  "scratch/simulations/sim_depth_material_ev.js",
  "scratch/simulations/sim_parallel.js",
  "scratch/measurements/measurement_provenance.js",
  "src/rules/build_snapshot.js"
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
        "Usage: node scratch/measurements/build_payment_measurement.js " +
        "--output /private/tmp/issue1096.json --decision-file evidence/results/issue-1096-build-payment-decision.json " +
        "[--summary /private/tmp/issue1096.md]"
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

export function validateIssue1096Decision(decision) {
  if (!decision || !ISSUE1096_NUMERIC_DECISIONS.has(decision.numericBalanceChange)) {
    throw new Error("issue #1096 decision requires numericBalanceChange none/candidate/not_assessed");
  }
  if (!Array.isArray(decision.additionalObservation) || !Array.isArray(decision.balanceIssueCandidates)) {
    throw new Error("issue #1096 decision requires observation and balance issue arrays");
  }
  if (typeof decision.basis !== "string" || !decision.basis.trim()) {
    throw new Error("issue #1096 decision requires a non-empty basis");
  }
  return true;
}

function readDecisionFile(path) {
  let decision;
  try {
    decision = JSON.parse(fs.readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`issue #1096 decision file could not be read: ${error.message}`);
  }
  validateIssue1096Decision(decision);
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
  if (!result) throw new Error(`missing issue #1096 depth result: B${targetDepth}`);
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

export function buildIssue1096Report({ config, provenance, taskResults, execution, determinism, decision }) {
  validateIssue1096Decision(decision);
  const tasks = buildTasks(config);
  const resultsByKey = new Map(tasks.map((task, index) => [taskKey(task), taskResults[index]]));
  const cases = config.scenarioIds.flatMap(scenarioId => config.targetDepths.flatMap(targetDepth =>
    config.fixtureIds.map(fixtureId => {
      const task = { scenarioId, fixtureId };
      return buildCase(task, resultsByKey.get(taskKey(task)), targetDepth);
    })
  ));
  return {
    schemaVersion: ISSUE1096_SCHEMA_VERSION,
    measurement: {
      runnerVersion: ISSUE1096_RUNNER_VERSION,
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
        "Portal Push/Return/Wing decisions and use-time HP/MP/inventory/material state"
      ],
      omitted: [
        "production object-loot ownership for Rune/Core/Support",
        "unconfirmed object-loot count/value at Portal use",
        "qualitative player recommendation or balance tuning"
      ],
      interpretation: "equipment-affix Core/Support metrics are observed ownership proxies; Rune object-loot lifecycle remains not_modeled"
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

export function validateIssue1096Report(report) {
  if (report?.schemaVersion !== ISSUE1096_SCHEMA_VERSION) {
    throw new Error(`issue #1096 schema version mismatch: ${report?.schemaVersion}`);
  }
  const config = report.config;
  if (!config || config.runs < 500) throw new Error("issue #1096 requires N>=500");
  validateIssue1096Decision(report.decision);
  const expectedKeys = new Set(
    config.scenarioIds.flatMap(scenarioId => config.targetDepths.flatMap(targetDepth =>
      config.fixtureIds.map(fixtureId => `${scenarioId}/${targetDepth}/${fixtureId}`)
    ))
  );
  const actualKeys = new Set((report.cases || []).map(measuredCase =>
    `${measuredCase.scenarioId}/${measuredCase.targetDepth}/${measuredCase.fixtureId}`
  ));
  if (actualKeys.size !== expectedKeys.size || [...expectedKeys].some(key => !actualKeys.has(key))) {
    throw new Error("issue #1096 fixture/scenario/depth coverage is incomplete");
  }
  const distributions = [
    "combat.rounds", "resources.damageTakenHp", "resources.healingHp", "resources.mpSpent",
    "resources.finalHp", "resources.finalMp", "resources.finalMpOverMax", "guard.mitigationHp", "guard.mitigationEvents",
    "guard.statusMitigationEvents", "loot.finalBagSlots"
  ];
  (report.cases || []).forEach(measuredCase => {
    if (measuredCase.runs !== config.runs) {
      throw new Error(`issue #1096 N mismatch: ${measuredCase.scenarioId}/${measuredCase.fixtureId}`);
    }
    const outcomeCount = Object.values(measuredCase.outcome?.outcomeDistribution || {})
      .reduce((sum, count) => sum + count, 0);
    if (outcomeCount !== config.runs) throw new Error("issue #1096 outcome count mismatch");
    if (!measuredCase.startingBuildSnapshot?.identity) {
      throw new Error("issue #1096 starting Build Snapshot is missing");
    }
    const endingSnapshots = measuredCase.endingBuildSnapshotDistribution;
    if (!endingSnapshots || endingSnapshots.runs !== config.runs) {
      throw new Error("issue #1096 ending Build Snapshot distribution N mismatch");
    }
    const endingSnapshotCount = Object.values(endingSnapshots.byIdentity || {})
      .reduce((sum, entry) => sum + (entry.count || 0), 0);
    if (endingSnapshotCount !== config.runs) {
      throw new Error("issue #1096 ending Build Snapshot identity counts mismatch");
    }
    distributions.forEach(path => {
      const value = path.split(".").reduce((current, key) => current?.[key], measuredCase.payment);
      if (!value || value.n !== config.runs) {
        throw new Error(`issue #1096 distribution N mismatch: ${path}`);
      }
    });
    if (measuredCase.payment.guard.statusMitigationSource !== "combatFormulaTelemetry.statusMitigations") {
      throw new Error("issue #1096 status mitigation provenance is not production combat telemetry");
    }
    ["hpRate", "mpRate", "inventorySlots", "inventoryFreeSlots", "carriedMaterials"]
      .forEach(name => {
        const value = measuredCase.payment.terminalResourceState?.[name];
        if (!value || value.n !== config.runs) {
          throw new Error(`issue #1096 terminal resource distribution N mismatch: ${name}`);
        }
      });
    if (!measuredCase.payment.terminalResourceState?.mpOverMax ||
        measuredCase.payment.terminalResourceState.mpOverMax.n !== config.runs) {
      throw new Error("issue #1096 terminal resource distribution N mismatch: mpOverMax");
    }
    const portal = measuredCase.payment.portal || {};
    const portalEventCount = (Number(portal.useEvents) || 0) + (Number(portal.milestoneDecisions) || 0);
    ["hpRate", "mpRate", "inventorySlots", "inventoryFreeSlots", "carriedMaterials"]
      .forEach(name => {
        const value = measuredCase.payment.portal?.resourceState?.[name];
        if (!value || value.n !== portalEventCount) {
          throw new Error(`issue #1096 Portal resource distribution missing: ${name}`);
        }
      });
    ["resources.finalHpRate", "resources.finalMpRate", "terminalResourceState.hpRate", "terminalResourceState.mpRate"]
      .forEach(path => {
        const value = path.split(".").reduce((current, key) => current?.[key], measuredCase.payment);
        if (!value || value.min < 0 || value.max > 1) {
          throw new Error(`issue #1096 bounded resource rate violation: ${path}`);
        }
      });
  });
  if (report.measurement?.determinism?.checked && !report.measurement.determinism.matching) {
    throw new Error("issue #1096 determinism check failed");
  }
  return true;
}

function formatNumber(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : "—";
}

function caseSummaryRow(measuredCase) {
  const payment = measuredCase.payment;
  return `| ${measuredCase.scenarioId} | B${measuredCase.targetDepth} | ${measuredCase.fixtureId} | ` +
    `${JSON.stringify(measuredCase.outcome.outcomeDistribution)} | ` +
    `${formatNumber(payment.combat.rounds.mean)} | ${formatNumber(payment.resources.mpSpent.mean)} | ` +
    `${formatNumber(payment.resources.damageTakenHp.mean)} | ${formatNumber(payment.guard.mitigationHp.mean)} | ` +
    `${formatNumber(payment.loot.equipmentAdopted / Math.max(1, measuredCase.runs))} | ` +
    `${payment.portal.useEvents}`;
}

export function renderIssue1096Markdown(report) {
  const lines = [
    "# Issue #1096 Build Snapshot payment measurement",
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
    "| scenario | depth | fixture | outcomes | combat rounds/run | MP spent/run | damage HP/run | Guard mitigation HP/run | equipment adopted/run | Portal uses |",
    "|---|---:|---|---|---:|---:|---:|---:|---:|---:|",
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
    "Rune/Core/Support object-loot ownership and unconfirmed Portal loot are explicitly `not_modeled`; equipment-affix exposure/adoption/firing fields are retained as observed proxies and must not be read as production object-loot telemetry."
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
  if (!determinism.matching) throw new Error("issue #1096 determinism probe failed");
  const decision = readDecisionFile(resolve(options.decisionFile));
  const report = buildIssue1096Report({ config, provenance, taskResults, execution, determinism, decision });
  validateIssue1096Report(report);
  const outputPath = resolve(options.output);
  fs.mkdirSync(dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  if (options.summary) {
    const summaryPath = resolve(options.summary);
    fs.mkdirSync(dirname(summaryPath), { recursive: true });
    fs.writeFileSync(summaryPath, renderIssue1096Markdown(report));
  }
  console.log(`Wrote issue #1096 build payment measurement: ${outputPath}`);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const options = parseArgs(process.argv.slice(2));
  if (options) await runMeasurement(options);
}
