// sim-scope: run
/* global process, console */

import "./simulation_preflight.js";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
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
const MEASUREMENT_SIDE = process.env.BLEEDING_MEASUREMENT_SIDE || "candidate";

function requireCommitSha(value, envName) {
  if (typeof value !== "string" || !/^[0-9a-f]{40}$/.test(value)) {
    throw new Error(`${envName} must be a 40-character lowercase commit SHA`);
  }
  try {
    const resolved = execFileSync("git", ["rev-parse", "--verify", `${value}^{commit}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
    if (resolved !== value) throw new Error(`resolved to ${resolved}`);
  } catch (error) {
    throw new Error(`${envName} is not a commit in the measurement repository: ${error.message}`);
  }
  return value;
}

const SOURCE_COMMIT = requireCommitSha(
  process.env.BLEEDING_SOURCE_CODE_SHA || MEASUREMENT_PROVENANCE?.sourceCommit,
  "BLEEDING_SOURCE_CODE_SHA"
);
const RUNNER_COMMIT = requireCommitSha(
  process.env.BLEEDING_RUNNER_COMMIT || MEASUREMENT_PROVENANCE?.sourceCommit,
  "BLEEDING_RUNNER_COMMIT"
);
const PROVENANCE_BASE_REF = MEASUREMENT_PROVENANCE?.baseRef || null;
const PROVENANCE_BASE_COMMIT = MEASUREMENT_PROVENANCE?.baseCommit || null;
const PROVENANCE_BASE_REF_REASON = MEASUREMENT_PROVENANCE?.baseRefReason || null;
const PROVENANCE_TEST_FIXTURE = MEASUREMENT_PROVENANCE?.testFixture || null;
const ORIGIN_MAIN_ANCESTOR = MEASUREMENT_PROVENANCE?.originMainAncestor ?? null;
const STALE_TREE_ALLOWED = MEASUREMENT_PROVENANCE?.staleTreeAllowed ?? null;

if (!["base", "candidate"].includes(MEASUREMENT_SIDE)) {
  throw new Error(`BLEEDING_MEASUREMENT_SIDE must be base|candidate: ${MEASUREMENT_SIDE}`);
}

function numberOrZero(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function createZeroBleedingTelemetry() {
  return {
    applied: 0, refresh: 0, failed: 0, resisted: 0, triggered: 0,
    damageContribution: 0, expired: 0, cleared: 0, bossEvents: 0,
    midbossEvents: 0, sources: {}, builds: {}, clearReasons: {}
  };
}

function addCounts(target, source) {
  Object.entries(source || {}).forEach(([key, value]) => {
    target[key] = (target[key] || 0) + numberOrZero(value);
  });
}

function summarizeBuildState(row, bleedingAffixValue) {
  const snapshots = Array.isArray(row.buildSnapshots) ? row.buildSnapshots : [];
  const producerSnapshots = snapshots.filter(snapshot =>
    Number(snapshot.supportAffixes?.bleedingAtk || 0) > 0
  );
  const finalSnapshot = snapshots.at(-1) || null;
  return {
    snapshotCount: snapshots.length,
    producerSnapshotCount: producerSnapshots.length,
    producerObserved: producerSnapshots.length > 0,
    producerValueMax: producerSnapshots.reduce(
      (max, snapshot) => Math.max(max, Number(snapshot.supportAffixes?.bleedingAtk || 0)),
      0
    ),
    finalProducerObserved: Boolean(finalSnapshot?.supportAffixes?.bleedingAtk),
    finalCombatBuildScore: finalSnapshot?.combatBuildScore ?? null,
    finalCoreCount: Array.isArray(finalSnapshot?.coreIds) ? finalSnapshot.coreIds.length : null,
    producerMode: bleedingAffixValue === null
      ? "natural-source-selection-measured"
      : "forced-calibration-bypasses-natural-source-selection"
  };
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
      workshop: { ranks: {} },
      collectBuildSnapshots: true
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
  const buildStates = [];
  const metrics = rows.map(row => {
    const rowBleeding = row.bleedingTelemetry || createZeroBleedingTelemetry();
    ["applied", "refresh", "failed", "resisted", "triggered", "damageContribution", "expired", "cleared", "bossEvents", "midbossEvents"]
      .forEach(key => { bleeding[key] += numberOrZero(rowBleeding[key]); });
    addCounts(bleeding.sources, rowBleeding.sources);
    addCounts(bleeding.builds, rowBleeding.builds);
    addCounts(bleeding.clearReasons, rowBleeding.clearReasons);
    buildStates.push(summarizeBuildState(row, bleedingAffixValue));
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
  const buildScoreValues = buildStates
    .map(state => state.finalCombatBuildScore)
    .filter(value => Number.isFinite(value));
  const coreCountValues = buildStates
    .map(state => state.finalCoreCount)
    .filter(value => Number.isFinite(value));
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
      sourceFoundPerRun: means(metrics.map(row => row.sourceFound)),
      buildSelection: {
        producerMode: buildStates[0]?.producerMode || null,
        producerObservedRuns: buildStates.filter(state => state.producerObserved).length,
        finalProducerObservedRuns: buildStates.filter(state => state.finalProducerObserved).length,
        producerSnapshotRate: buildStates.reduce((sum, state) => sum + state.producerSnapshotCount, 0) /
          Math.max(1, buildStates.reduce((sum, state) => sum + state.snapshotCount, 0)),
        finalCombatBuildScore: uncertainty(buildScoreValues),
        finalCoreCount: uncertainty(coreCountValues),
        naturalSourceSelection: bleedingAffixValue === null ? "measured" : "unexecuted/omitted"
      }
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
      midbossEventRate: bleeding.midbossEvents / Math.max(1, bleeding.applied + bleeding.refresh),
      clearReasons: { ...bleeding.clearReasons }
    },
    measurement: {
      side: MEASUREMENT_SIDE,
      sourceCommit: SOURCE_COMMIT,
      runnerCommit: RUNNER_COMMIT,
      provenanceBaseRef: PROVENANCE_BASE_REF,
      provenanceBaseCommit: PROVENANCE_BASE_COMMIT,
      provenanceBaseRefReason: PROVENANCE_BASE_REF_REASON,
      provenanceTestFixture: PROVENANCE_TEST_FIXTURE,
      originMainAncestor: ORIGIN_MAIN_ANCESTOR,
      staleTreeAllowed: STALE_TREE_ALLOWED
    }
  };
}

await mkdir("scratch/results", { recursive: true });
const measurement = {
  issue: 793,
  measurementSide: MEASUREMENT_SIDE,
  sourceCommit: SOURCE_COMMIT,
  runnerCommit: RUNNER_COMMIT,
  provenanceBaseRef: PROVENANCE_BASE_REF,
  provenanceBaseCommit: PROVENANCE_BASE_COMMIT,
  provenanceBaseRefReason: PROVENANCE_BASE_REF_REASON,
  provenanceTestFixture: PROVENANCE_TEST_FIXTURE,
  originMainAncestor: ORIGIN_MAIN_ANCESTOR,
  staleTreeAllowed: STALE_TREE_ALLOWED,
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
    base: "clean base-SHA source with no bleeding producer route",
    candidate: "candidate source with forced bleeding producer calibration affix",
    naturalSourceSelection: "measured only for no-forcing cases; forced cases omit this choice"
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
if (MEASUREMENT_SIDE === "base") {
  measurement.cases.push(summarizeCase("base/no-producer", 0, null, scoringProfile, N));
} else {
  measurement.cases.push(summarizeCase("candidate/no-producer", 0, null, scoringProfile, N));
  CANDIDATES.forEach(candidate => {
    measurement.cases.push(summarizeCase(`candidate/forced-producer/payoff-${candidate}`, candidate, 100, scoringProfile, N));
  });
  measurement.cases.push(summarizeCase("candidate/natural-loot-reachability", 2, null, scoringProfile, CALIBRATION_N));
}

const outputPath = "scratch/results/issue-793-bleeding-measurement.json";
fs.writeFileSync(outputPath, `${JSON.stringify(measurement, null, 2)}\n`);
console.log(`ISSUE793_MEASUREMENT_JSON=${JSON.stringify(measurement)}`);
