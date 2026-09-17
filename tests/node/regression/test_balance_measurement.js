import assert from "node:assert/strict";
import {
  BALANCE_MEASUREMENT_SCHEMA_VERSION,
  REGRESSION_RULES,
  STANDARD_BALANCE_CONFIG,
  createStandardMeasurementShard,
  compareBalanceMeasurements,
  createStandardSimulationTasks,
  mergeStandardMeasurementShards,
  rateMetric,
  resolveBalanceMeasurementConfig,
  resolveStandardMeasurementShard
} from "../../../scratch/measurements/balance_measurement.js";

import fs from "node:fs";
import path from "node:path";

const defaults = resolveBalanceMeasurementConfig({}, {});
assert.equal(defaults.runs, 500);
assert.equal(defaults.calibrationRuns, 100);
assert.equal(defaults.seed, 843);
assert.deepEqual(defaults.fixtureIds, [...STANDARD_BALANCE_CONFIG.fixtureIds]);
assert.deepEqual(defaults.scenarioIds, [...STANDARD_BALANCE_CONFIG.scenarioIds]);
assert.deepEqual(defaults.targetDepths, [...STANDARD_BALANCE_CONFIG.targetDepths]);
assert.throws(() => resolveBalanceMeasurementConfig({ runs: 499 }, {}), /N>=500/);

const standardTasks = createStandardSimulationTasks(defaults);
assert.equal(standardTasks.length, 12);
assert.deepEqual(
  standardTasks.map(task => `${task.scenarioId}/${task.fixtureId}`),
  defaults.scenarioIds.flatMap(scenarioId => defaults.fixtureIds.map(fixtureId => `${scenarioId}/${fixtureId}`))
);
assert.deepEqual(
  resolveStandardMeasurementShard(defaults, { shardIndex: 0, shardCount: 12 }),
  { shardIndex: 0, shardCount: 12, tasks: [standardTasks[0]] }
);
assert.throws(
  () => resolveStandardMeasurementShard(defaults, { shardIndex: 12, shardCount: 12 }),
  /shard-index must be an integer in \[0, 12\)/
);

const syntheticTaskResults = standardTasks.map((task, index) => ({
  task,
  result: {
    results: defaults.targetDepths.map(targetDepth => ({
      targetDepth,
      runs: defaults.runs,
      entrantsByFloor: Object.fromEntries(defaults.targetDepths.map(depth => [depth, defaults.runs - index])),
      breakthroughsByFloor: Object.fromEntries(defaults.targetDepths.map(depth => [depth, index])),
      deathsByFloor: Object.fromEntries(defaults.targetDepths.map(depth => [depth, 0])),
      retreatsByFloor: Object.fromEntries(defaults.targetDepths.map(depth => [depth, 0])),
      mean95CI: {
        bankedMaterialEv: "1 [1,1; N=500]",
        materialEvPerTime: "2 [2,2; N=500]",
        materialAcquired: "3 [3,3; N=500]",
        materialConsumed: "4 [4,4; N=500]",
        reachedFloor: "5 [5,5; N=500]"
      },
      outcomeCounts: {},
      averageTimeCost: 1,
      averageMaterialAcquired: 3,
      averageMaterialConsumed: 4,
      bankedMaterialEv: 1,
      materialEvPerTime: 2,
      runDiagnostics: {},
      endingBuildSnapshotDistributionByFixtureId: { [task.fixtureId]: {} }
    }))
  }
}));
const syntheticProvenance = {
  baseCommit: "a".repeat(40),
  sourceCommit: "b".repeat(40),
  measurementRunnerCommit: "c".repeat(40),
  measurementRunnerDiffSha256: "d".repeat(64),
  originMainAncestor: true,
  staleTreeAllowed: false,
  workingTreeClean: true,
  measurementRunnerPaths: ["scratch/measurements/measure_balance.js"]
};
const fullSynthetic = mergeStandardMeasurementShards({
  config: defaults,
  provenance: syntheticProvenance,
  shards: [createStandardMeasurementShard({
    config: defaults,
    provenance: syntheticProvenance,
    shardIndex: 0,
    shardCount: 1,
    taskResults: syntheticTaskResults
  })],
  execution: { taskCount: 12, parallelism: 4, wallClockMs: 1, cpuTimeMs: 1 }
});
const splitSynthetic = mergeStandardMeasurementShards({
  config: defaults,
  provenance: syntheticProvenance,
  shards: syntheticTaskResults.map((taskResult, shardIndex) => createStandardMeasurementShard({
    config: defaults,
    provenance: syntheticProvenance,
    shardIndex,
    shardCount: 12,
    taskResults: [taskResult]
  })),
  execution: { taskCount: 12, parallelism: 4, wallClockMs: 2, cpuTimeMs: 2 }
});
assert.deepEqual(
  {
    measurement: { ...fullSynthetic.measurement, execution: undefined },
    cases: fullSynthetic.cases
  },
  {
    measurement: { ...splitSynthetic.measurement, execution: undefined },
    cases: splitSynthetic.cases
  }
);

const workflow = fs.readFileSync(path.resolve(".github/workflows/balance-measurement.yml"), "utf8");
assert.match(workflow, /measurement:\n[\s\S]*- build-progression-audit/);
assert.match(workflow, /measure-standard:\n\s+if: inputs\.measurement == 'standard'/);
assert.match(workflow, /measure-other:\n\s+if: inputs\.measurement != 'standard'/);
assert.match(workflow, /measure-standard:\n[\s\S]*timeout-minutes: 20/);
assert.match(workflow, /name: Run standard balance measurement shard[\s\S]*timeout-minutes: 15/);
assert.match(workflow, /fail-fast: false/);
assert.match(workflow, /max-parallel: 4/);
assert.match(workflow, /merge-standard:[\s\S]*download-artifact@v4/);
assert.match(workflow, /merge-standard:[\s\S]*merge_balance_measurement\.js/);
assert.match(workflow, /merge-standard:[\s\S]*name: Upload final CI evidence artifact/);
assert.match(workflow, /if: always\(\)/);
assert.match(workflow, /retention-days: 14/);
assert.match(workflow, /contains\(fromJSON\('\["build-progression-audit", "build-progression-pareto-safe", "preparation-power-factorial"\]'\), inputs\.measurement\) && 45 \|\| 20/);
assert.match(workflow, /contains\(fromJSON\('\["build-progression-audit", "build-progression-pareto-safe", "preparation-power-factorial"\]'\), inputs\.measurement\) && 30 \|\| 15/);
assert.match(workflow, /--job-timeout-minutes/);
assert.match(workflow, /--step-timeout-minutes/);
assert.match(workflow, /N=1000 diagnostic; preparation-power-factorial includes four kits/);
assert.doesNotMatch(
  workflow.slice(workflow.indexOf("  measure-standard:"), workflow.indexOf("  merge-standard:")),
  /--include-raw/
);
assert.match(workflow, /name: Upload standard shard merge input/);
assert.match(workflow, /retention-days: 1/);
assert.match(workflow, /balance-measurement-merge-input-\$\{\{ github\.run_id \}\}/);
assert.match(workflow, /measurement merge-input artifact is temporary and final-merge-only/);
const nonStandardSection = workflow.slice(workflow.indexOf("  measure-other:"));
assert.doesNotMatch(nonStandardSection, /name: Run selected balance measurement[\s\S]*?timeout-minutes: 15\n/);
assert.match(nonStandardSection, /node scratch\/measurements\/run_balance_measurement\.js[\s\S]*tee/);
assert.match(nonStandardSection, /name: Publish durable run summary\n\s+if: always\(\)/);

const rate = rateMetric(50, 100);
assert.equal(rate.estimate, 0.5);
assert.ok(rate.ci95[0] < 0.5 && rate.ci95[1] > 0.5);

function report({ breakthrough = 0.5, death = 0.1, banked = 10, ev = 0.2 } = {}) {
  const metric = (estimate, kind = "mean") => kind === "rate"
    ? rateMetric(estimate * 500, 500)
    : { kind, estimate, trials: 500, ci95: [estimate - 0.01, estimate + 0.01] };
  return {
    measurement: {
      schemaVersion: BALANCE_MEASUREMENT_SCHEMA_VERSION,
      comparisonKey: defaults.comparisonKey,
      sourceCommit: "a".repeat(40),
      productionBaselineSha: "b".repeat(40)
    },
    cases: [{
      scenarioId: "workshop-empty",
      depths: [{
        depth: 5,
        metrics: {
          reachedRate: metric(0.8, "rate"),
          breakthroughRate: metric(breakthrough, "rate"),
          deathRate: metric(death, "rate"),
          retreatRate: metric(0.9, "rate"),
          bankedMaterialsPerRun: metric(banked),
          materialEvPerTime: metric(ev)
        }
      }]
    }]
  };
}

const pass = compareBalanceMeasurements(report(), report());
assert.equal(pass.status, "pass");
assert.ok(pass.metrics.every(metric => metric.status === "pass"));

const fixtureMetrics = Object.fromEntries(defaults.fixtureIds.map(fixtureId => [fixtureId, {
  reachedRate: rateMetric(400, 500),
  breakthroughRate: rateMetric(250, 500),
  deathRate: rateMetric(50, 400),
  retreatRate: rateMetric(350, 400),
  bankedMaterialsPerRun: { kind: "mean", estimate: 10, trials: 500, ci95: [9.99, 10.01] },
  materialEvPerTime: { kind: "mean", estimate: 0.2, trials: 500, ci95: [0.19, 0.21] }
}]));
const classReport = {
  ...report(),
  cases: [{
    scenarioId: "workshop-empty",
    depths: [{ depth: 5, runs: 500, metricsByFixtureId: fixtureMetrics }]
  }]
};
const classPass = compareBalanceMeasurements(classReport, classReport);
assert.equal(classPass.status, "pass");
assert.ok(classPass.metrics.some(metric => metric.key === "workshop-empty.light-shield.B5.reachedRate"));
assert.equal(classPass.metrics.length, defaults.fixtureIds.length * 6);

const uncertain = compareBalanceMeasurements(report(), report({ breakthrough: 0.43 }));
assert.equal(uncertain.status, "uncertain");
assert.equal(uncertain.metrics.find(metric => metric.key.endsWith("breakthroughRate")).status, "uncertain");

const fail = compareBalanceMeasurements(report(), report({ breakthrough: 0.20 }));
assert.equal(fail.status, "fail");
assert.equal(fail.metrics.find(metric => metric.key.endsWith("breakthroughRate")).status, "fail");

const unobserved = report();
unobserved.cases[0].depths[0].metrics.deathRate = rateMetric(0, 0);
const unobservedComparison = compareBalanceMeasurements(report(), unobserved);
assert.equal(unobservedComparison.status, "uncertain");
assert.equal(unobservedComparison.metrics.find(metric => metric.key.endsWith("deathRate")).status, "unobserved");

const lowN = report();
lowN.cases[0].depths[0].metrics.deathRate = rateMetric(1, 1);
const lowNComparison = compareBalanceMeasurements(report(), lowN);
assert.equal(lowNComparison.status, "uncertain");
assert.equal(lowNComparison.metrics.find(metric => metric.key.endsWith("deathRate")).status, "uncertain");

assert.equal(REGRESSION_RULES.deathRate.direction, "lower");
assert.throws(
  () => compareBalanceMeasurements(report(), { ...report(), measurement: { ...report().measurement, comparisonKey: "different" } }),
  /configuration mismatch/
);
console.log("[PASS] standard balance measurement schema, CI, and comparison checks");
