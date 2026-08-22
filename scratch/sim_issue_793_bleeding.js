// sim-scope: run
/* global process, console */

import fs from "node:fs";
import { mkdir } from "node:fs/promises";
import {
  SIM_CLASSES,
  MEASUREMENT_PROVENANCE,
  simulateRun,
  runCoreCalibrationTask
} from "./sim_depth_material_ev.js";

const N = Math.max(1, Number(process.env.BLEEDING_SIM_N || 20));
const CALIBRATION_N = Math.max(1, Number(process.env.BLEEDING_CALIBRATION_N || Math.min(N, 10)));
const SEED_POLICY = "SIM_INDEPENDENT_RUN_RANDOM=1; SIM_SEED from runner environment; same class/runIndex/seriesId across cases";
const CANDIDATES = [1, 2, 3];
const TARGET_DEPTH = 20;
const SERIES_ID = "issue-793-bleeding-matched-v1";

function numberOrZero(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function createZeroBleedingTelemetry() {
  return {
    applied: 0, refresh: 0, failed: 0, resisted: 0, triggered: 0,
    damageContribution: 0, expired: 0, cleared: 0, bossEvents: 0,
    midbossEvents: 0, sources: {}, builds: {}
  };
}

function addCounts(target, source) {
  Object.entries(source || {}).forEach(([key, value]) => {
    target[key] = (target[key] || 0) + numberOrZero(value);
  });
}

function summarizeCase(label, payoffDamage, bleedingAffixValue, scoringProfile, runCount = N) {
  const rows = [];
  for (let runIndex = 0; runIndex < runCount; runIndex++) {
    const className = SIM_CLASSES[runIndex % SIM_CLASSES.length];
    rows.push(simulateRun({
      className,
      startFloor: 1,
      targetDepth: TARGET_DEPTH,
      runIndex,
      seriesId: SERIES_ID,
      scoringProfile,
      scenario: {
        bleedingPayoffDamage: payoffDamage,
        ...(bleedingAffixValue === null ? {} : { bleedingAffixValue })
      },
      workshop: { ranks: {} }
    }));
  }

  const means = values => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  const uncertainty = values => {
    if (values.length < 2) return { n: values.length, mean: means(values), sd: null, se95: null };
    const mean = means(values);
    const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (values.length - 1);
    const sd = Math.sqrt(variance);
    return { n: values.length, mean, sd, se95: 1.96 * sd / Math.sqrt(values.length) };
  };

  const bleeding = createZeroBleedingTelemetry();
  const metrics = rows.map(row => {
    const rowBleeding = row.bleedingTelemetry || createZeroBleedingTelemetry();
    ["applied", "refresh", "failed", "resisted", "triggered", "damageContribution", "expired", "cleared", "bossEvents", "midbossEvents"]
      .forEach(key => { bleeding[key] += numberOrZero(rowBleeding[key]); });
    addCounts(bleeding.sources, rowBleeding.sources);
    addCounts(bleeding.builds, rowBleeding.builds);
    return {
      reachedFloor: numberOrZero(row.reachedFloor),
      survived: Number(row.survived),
      died: Number(row.died),
      equipmentFound: numberOrZero(row.equipmentFound),
      b5Reach: Number(row.reachedFloor >= 5),
      b5Breakthrough: Number(row.reachedFloor > 5),
      b10Reach: Number(row.reachedFloor >= 10),
      b10Breakthrough: Number(row.reachedFloor > 10),
      sourceFound: numberOrZero(row.supportAffixFoundById?.bleedingAtk)
    };
  });
  return {
    label,
    payoffDamage,
    bleedingAffixValue,
    runs: runCount,
    metrics: {
      reachedFloor: uncertainty(metrics.map(row => row.reachedFloor)),
      survivalRate: means(metrics.map(row => row.survived)),
      deathRate: means(metrics.map(row => row.died)),
      b5ReachRate: means(metrics.map(row => row.b5Reach)),
      b5BreakthroughRate: means(metrics.map(row => row.b5Breakthrough)),
      b10ReachRate: means(metrics.map(row => row.b10Reach)),
      b10BreakthroughRate: means(metrics.map(row => row.b10Breakthrough)),
      equipmentFoundPerRun: means(metrics.map(row => row.equipmentFound)),
      sourceFoundPerRun: means(metrics.map(row => row.sourceFound))
    },
    bleeding: {
      ...bleeding,
      applicationsPerRun: bleeding.applied / runCount,
      refreshesPerRun: bleeding.refresh / runCount,
      failedPerRun: bleeding.failed / runCount,
      resistedPerRun: bleeding.resisted / runCount,
      triggersPerRun: bleeding.triggered / runCount,
      damageContributionPerRun: bleeding.damageContribution / runCount,
      expiriesPerRun: bleeding.expired / runCount,
      clearsPerRun: bleeding.cleared / runCount,
      bossEventRate: bleeding.bossEvents / Math.max(1, bleeding.applied + bleeding.refresh),
      midbossEventRate: bleeding.midbossEvents / Math.max(1, bleeding.applied + bleeding.refresh)
    }
  };
}

await mkdir("scratch/results", { recursive: true });
const measurement = {
  issue: 793,
  sourceCommit: process.env.BLEEDING_SOURCE_CODE_SHA || MEASUREMENT_PROVENANCE?.sourceCommit || null,
  runnerCommit: MEASUREMENT_PROVENANCE?.sourceCommit || null,
  originMainAncestor: MEASUREMENT_PROVENANCE?.originMainAncestor ?? null,
  staleTreeAllowed: MEASUREMENT_PROVENANCE?.staleTreeAllowed ?? null,
  runner: `node ${process.version}; scratch/sim_issue_793_bleeding.js`,
  seedPolicy: SEED_POLICY,
  dataset: "current src data; generateRunFloor-driven simulateRun; solo classes",
  targetDepth: TARGET_DEPTH,
  n: N,
  calibrationN: CALIBRATION_N,
  configuration: {
    candidateSweep: CANDIDATES,
    durationTurns: 3,
    producer: "bleedingAtk weapon support",
    forcedProducerCalibrationValue: 100,
    baseline: "same real-run runner/config with no bleeding producer route in base SHA",
    after: "same real-run runner/config with bleeding producer calibration affix"
  },
  modeled: [
    "generateRunFloor-driven floor traversal",
    "real run combat round resolution, equipment scoring, rewards, retreat and status-cure policy",
    "normal direct physical hit producer/consumer path"
  ],
  omitted: [
    "manual UI timing and live analytics transport",
    "natural loot-selection policy for the forced-producer calibration case",
    "Vulnerable and all other new statuses"
  ],
  cases: []
};

const scoringProfile = runCoreCalibrationTask({
  policyId: "powder",
  scenarioId: null,
  runCount: CALIBRATION_N
}).profile;
measurement.cases.push(summarizeCase("baseline/no-producer", 0, null, scoringProfile, N));
CANDIDATES.forEach(candidate => {
  measurement.cases.push(summarizeCase(`after/forced-producer/payoff-${candidate}`, candidate, 100, scoringProfile, N));
});
measurement.cases.push(summarizeCase("after/natural-loot-reachability", 2, null, scoringProfile, CALIBRATION_N));

const outputPath = "scratch/results/issue-793-bleeding-measurement.json";
fs.writeFileSync(outputPath, `${JSON.stringify(measurement, null, 2)}\n`);
console.log(`ISSUE793_MEASUREMENT_JSON=${JSON.stringify(measurement)}`);
