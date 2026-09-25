import assert from "node:assert/strict";

import {
  ARMS,
  CONTEXTS,
  DEFAULT_RUNS,
  DEFAULT_SEED,
  deriveWorldSeed,
  describeRun,
  distribution,
  RUNNER_PATH,
  runProgressionExpCombinedRunDiagnostic,
  summarizeGroup
} from "../../../scratch/measurements/progression_exp_combined_run_diagnostic.js";
import { MEASUREMENT_IDS, resolveRunnerInvocation } from "../../../scratch/measurements/run_balance_measurement.js";
import {
  assertValidSimulationManifest,
  classifySimulationRunner,
  SIMULATION_RUNNER_INVENTORY
} from "../../../scratch/simulations/simulation_manifest.js";

assert.equal(DEFAULT_RUNS, 200);
assert.equal(DEFAULT_SEED, 1727);
assert.deepEqual(CONTEXTS.map(({ id, startFloor, targetDepth }) => [id, startFloor, targetDepth]), [
  ["continuous-B1", 1, 21],
  ["selected-B10", 10, 11],
  ["selected-B20", 20, 21]
]);
assert.deepEqual(Object.keys(ARMS), ["current-control", "combined-b+c"]);
assert.deepEqual(ARMS["current-control"], {
  tabletPolicy: "read-first-reached", tabletOutcomeCandidate: "current", expAwardCandidate: "production"
});
assert.deepEqual(ARMS["combined-b+c"], {
  tabletPolicy: "read-first-reached", tabletOutcomeCandidate: "fixed-c", expAwardCandidate: "phase4j-b"
});
assert.equal(deriveWorldSeed(1727, "continuous-B1", 0), "phase4j-e8:1727:continuous-B1:0");
assert.notEqual(deriveWorldSeed(1727, "continuous-B1", 0), deriveWorldSeed(1727, "continuous-B1", 1));
assert.deepEqual(distribution([1, 2, 3]), { n: 3, mean: 2, p10: 1.2, p50: 2, p90: 2.8 });
assert.ok(MEASUREMENT_IDS.includes("progression-exp-combined-run-diagnostic"));
assert.doesNotThrow(() => assertValidSimulationManifest());
assert.ok(SIMULATION_RUNNER_INVENTORY.some(entry => entry.path === RUNNER_PATH));
assert.equal(classifySimulationRunner(RUNNER_PATH)?.lifecycle, "reusable");
assert.equal(classifySimulationRunner(RUNNER_PATH)?.scope, "run");
assert.equal(resolveRunnerInvocation({
  measurement: "progression-exp-combined-run-diagnostic",
  purpose: "N=1 regression smoke",
  output_dir: "/tmp/progression-exp-combined-run-test"
}).runner, RUNNER_PATH);

function syntheticResult({
  outcome = "retreat",
  deathEncounterType = null,
  identityOutcome = null,
  observations = [],
  tablet = {}
} = {}) {
  return {
    outcome,
    terminationReason: "target-depth",
    reachedFloor: 1,
    deathFloor: outcome === "death" ? 1 : null,
    deathEncounterType,
    deathSnapshot: null,
    finalLevel: 1,
    characterExpGained: 0,
    expGainedBySource: { combat: 0, tablet: 0 },
    tabletCombatLedgerDelta: 0,
    combatExpCandidate: { observations, coverageGaps: {} },
    encounterIdentityLog: identityOutcome ? [{ outcome: identityOutcome }] : [],
    diagnostics: { encounters: [] },
    tabletExposure: {
      generatedCount: 0,
      uniqueReachedLocationCount: 0,
      readCount: 0,
      encounters: [],
      ...tablet
    }
  };
}

const playerFlee = describeRun(syntheticResult({
  identityOutcome: "flee",
  observations: [{ initialFledIndices: [] }]
}), CONTEXTS[0], "combined-b+c", 0, "seed-player-flee");
assert.equal(playerFlee.lifecycle.playerFleeCount, 1);
assert.equal(playerFlee.lifecycle.enemyInitialOwnerFleeCount, 0);

const enemyFlee = describeRun(syntheticResult({
  observations: [{ initialFledIndices: [0, 2] }]
}), CONTEXTS[0], "combined-b+c", 1, "seed-enemy-flee");
assert.equal(enemyFlee.lifecycle.enemyInitialOwnerFleeCount, 2);
const fleeSummary = summarizeGroup([playerFlee, enemyFlee]).lifecycle;
assert.equal(fleeSummary.enemyInitialOwnerFleeCount, 2);
assert.equal(fleeSummary.playerFleeCount, 1);

const rawHpDelta = describeRun(syntheticResult({
  observations: [
    { initialFledIndices: [], rawMaxHpBefore: 20, rawMaxHpAfter: 25 },
    { initialFledIndices: [], rawMaxHpBefore: 25, rawMaxHpAfter: 23 }
  ]
}), CONTEXTS[0], "combined-b+c", 2, "seed-raw-hp");
assert.equal(rawHpDelta.levelRawMaxHpIncrease, 3);

const tabletDeath = describeRun(syntheticResult({
  outcome: "death",
  deathEncounterType: "tablet-trap",
  tablet: {
    generatedCount: 2,
    uniqueReachedLocationCount: 1,
    readCount: 1,
    encounters: [{ selection: "read", outcome: "trap" }]
  }
}), CONTEXTS[0], "combined-b+c", 3, "seed-tablet-death");
const combatDeath = describeRun(syntheticResult({
  outcome: "death",
  deathEncounterType: "normal",
  tablet: {
    generatedCount: 2,
    uniqueReachedLocationCount: 2,
    readCount: 1,
    encounters: [{ selection: "read", outcome: "success" }]
  }
}), CONTEXTS[0], "combined-b+c", 4, "seed-combat-death");
assert.equal(tabletDeath.tablet.death, true);
assert.equal(combatDeath.tablet.death, false);
const tabletSummary = summarizeGroup([tabletDeath, combatDeath]).tablet;
assert.equal(tabletSummary.reachedRate, 0.75);
assert.equal(tabletSummary.readRate, 2 / 3);
assert.equal(tabletSummary.deathCount, 1);
assert.equal(tabletSummary.deathRate, 0.5);
assert.deepEqual(summarizeGroup([rawHpDelta]).levelRawMaxHpIncrease, {
  n: 1, mean: 3, p10: 3, p50: 3, p90: 3
});

const report = await runProgressionExpCombinedRunDiagnostic({ runs: 1, seed: DEFAULT_SEED, allowSmallRunCount: true });
const repeated = await runProgressionExpCombinedRunDiagnostic({ runs: 1, seed: DEFAULT_SEED, allowSmallRunCount: true });
assert.deepEqual(report, repeated);
assert.equal(report.configuration.runsPerContextArm, 1);
assert.equal(report.validity.sampleCountValid, false);
assert.equal(report.validity.invalidRunCount, 0);
assert.deepEqual(Object.keys(report.groups), CONTEXTS.map(context => context.id));
assert.deepEqual(Object.keys(report.groups["continuous-B1"]), Object.keys(ARMS));
for (const context of CONTEXTS) {
  assert.equal(report.matchedSeed[context.id].n, 1);
  const [control, combined] = Object.values(ARMS).map((_, index) =>
    report.observations.filter(row => row.contextId === context.id)[index]);
  assert.equal(control.worldSeed, combined.worldSeed);
  assert.equal(control.rootSeed, DEFAULT_SEED);
  assert.equal(control.runIndex, combined.runIndex);
}

console.log("[PASS] Phase 4j-E8 matched-seed N=1 full-run regression and measurement wiring");
