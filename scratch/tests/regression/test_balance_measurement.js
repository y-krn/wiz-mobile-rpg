import assert from "node:assert/strict";
import {
  BALANCE_MEASUREMENT_SCHEMA_VERSION,
  REGRESSION_RULES,
  STANDARD_BALANCE_CONFIG,
  compareBalanceMeasurements,
  rateMetric,
  resolveBalanceMeasurementConfig
} from "../../measurements/balance_measurement.js";

const defaults = resolveBalanceMeasurementConfig({}, {});
assert.equal(defaults.runs, 500);
assert.equal(defaults.calibrationRuns, 100);
assert.equal(defaults.seed, 843);
assert.deepEqual(defaults.classNames, [...STANDARD_BALANCE_CONFIG.classNames]);
assert.deepEqual(defaults.scenarioIds, [...STANDARD_BALANCE_CONFIG.scenarioIds]);
assert.deepEqual(defaults.targetDepths, [...STANDARD_BALANCE_CONFIG.targetDepths]);
assert.throws(() => resolveBalanceMeasurementConfig({ runs: 499 }, {}), /N>=500/);

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

const classMetrics = Object.fromEntries(defaults.classNames.map(className => [className, {
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
    depths: [{ depth: 5, runs: 500, metricsByClass: classMetrics }]
  }]
};
const classPass = compareBalanceMeasurements(classReport, classReport);
assert.equal(classPass.status, "pass");
assert.ok(classPass.metrics.some(metric => metric.key === "workshop-empty.Fighter.B5.reachedRate"));
assert.equal(classPass.metrics.length, defaults.classNames.length * 6);

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
