// sim-scope: run — Phase 4j-E8 matched-seed full-run B+C diagnostic
/* global console, process */

import "../simulations/simulation_preflight.js";
import fs from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { requireRunnerProvenance } from "./measurement_provenance.js";
import { readSimScopeDeclaration } from "./measurement_env_signature.js";

export const RUNNER_VERSION = "progression-exp-combined-run-diagnostic-v1";
export const SCHEMA_VERSION = 1;
export const RUNNER_PATH = "scratch/measurements/progression_exp_combined_run_diagnostic.js";
export const DEFAULT_RUNS = 200;
export const DEFAULT_SEED = 1727;
export const MIN_CONFIDENT_SUBCOHORT = 30;
export const CONTEXTS = Object.freeze([
  Object.freeze({ id: "continuous-B1", startFloor: 1, targetDepth: 21 }),
  Object.freeze({ id: "selected-B10", startFloor: 10, targetDepth: 11 }),
  Object.freeze({ id: "selected-B20", startFloor: 20, targetDepth: 21 })
]);
export const ARMS = Object.freeze({
  "current-control": Object.freeze({
    tabletPolicy: "read-first-reached",
    tabletOutcomeCandidate: "current",
    expAwardCandidate: "production"
  }),
  "combined-b+c": Object.freeze({
    tabletPolicy: "read-first-reached",
    tabletOutcomeCandidate: "fixed-c",
    expAwardCandidate: "phase4j-b"
  })
});
const PRODUCTION_PATHS = Object.freeze([
  RUNNER_PATH,
  "scratch/simulations/sim_depth_material_ev.js",
  "scratch/measurements/progression_exp_award_integration.js",
  "scratch/measurements/progression_exp_award_paired_inventory.js",
  "scratch/measurements/progression_exp_award_lifecycle.js",
  "src/combat_ui/encounter.js",
  "src/combat_logic.js",
  "src/combat_logic/round.js",
  "src/data/monsters.js",
  "src/data/progression.js",
  "src/rules/depth_scaling.js",
  "src/seed_rng.js",
  "src/systems/leveling.ts"
]);

const { getScenarioById, resetSimulationRandom, simulateRun } =
  await import("../simulations/sim_depth_material_ev.js");

function positiveInteger(value, name, minimum = 1) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum) {
    throw new Error(`${name} must be an integer >= ${minimum}: ${value}`);
  }
  return number;
}

export function deriveWorldSeed(rootSeed, contextId, runIndex) {
  return `phase4j-e8:${rootSeed}:${contextId}:${runIndex}`;
}

function numericSeed(worldSeed) {
  let hash = 2166136261;
  for (const character of worldSeed) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function quantile(values, probability) {
  const ordered = [...values].sort((left, right) => left - right);
  if (!ordered.length) return null;
  const position = (ordered.length - 1) * probability;
  const lower = Math.floor(position);
  return ordered[lower] + (ordered[Math.ceil(position)] - ordered[lower]) * (position - lower);
}

export function distribution(values) {
  const finite = values.filter(Number.isFinite);
  return {
    n: finite.length,
    mean: finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null,
    p10: quantile(finite, 0.10),
    p50: quantile(finite, 0.50),
    p90: quantile(finite, 0.90)
  };
}

function increment(map, key, amount = 1) {
  map[key] = (map[key] || 0) + amount;
}

function relevantIdentityGaps(gaps = {}) {
  return Object.fromEntries(Object.entries(gaps).filter(([reason]) =>
    /identity|order|unsupported|ambiguous/i.test(reason)));
}

function describeRun(result, context, armId, runIndex, worldSeed) {
  const candidateObservations = result.combatExpCandidate?.observations || [];
  const validSettlements = candidateObservations.filter(observation =>
    observation.result === "victory" && observation.settlementCoverageValid === true);
  const nonVictorySettlements = candidateObservations.filter(observation =>
    observation.result !== "victory");
  const candidateSettlementMismatches = candidateObservations.filter(observation =>
    observation.awardMode === "phase4j-b" && observation.result === "victory" &&
    (observation.expectedCandidateSettlementBudget === null ||
      observation.combatOnlyLedgerDelta !== observation.expectedCandidateSettlementBudget ||
      observation.characterCombatExpDelta !== observation.expectedCandidateSettlementBudget));
  const settlementDriftGaps = candidateObservations.flatMap(observation =>
    (observation.settlementCoverageGaps || []).filter(gap =>
      /lifecycle-settlement-drift|identity|order/i.test(gap)));
  const identityGaps = relevantIdentityGaps(result.combatExpCandidate?.coverageGaps);
  const sourceCombatExp = Number(result.expGainedBySource?.combat || 0);
  const sourceTabletExp = Number(result.expGainedBySource?.tablet || 0);
  const characterExpSourceMismatch = result.characterExpGained !== sourceCombatExp + sourceTabletExp;
  const tabletLedgerDelta = Number(result.tabletCombatLedgerDelta || 0);
  const expByKind = {};
  for (const observation of candidateObservations) increment(expByKind, observation.kind || "unknown");

  const encounterRows = result.diagnostics?.encounters || [];
  const fleeFires = (result.encounterIdentityLog || []).filter(entry => entry.outcome === "flee").length;
  const splitFires = encounterRows.reduce((sum, encounter) => {
    const initialCount = Number(encounter.generatedInitialVisibleEnemyCount || encounter.initialVisibleEnemyCount || 0);
    return sum + Number(initialCount > 0 && (encounter.endEnemyHp || []).length > initialCount &&
      (encounter.monsters || []).some(monster => monster.traits?.includes("splitOnDeath")));
  }, 0);
  const summonFires = encounterRows.reduce((sum, encounter) => sum +
    (encounter.rounds || []).flatMap(round => round.enemyActionEvents || [])
      .filter(action => action.executed && action.traitSources?.includes("summonAlly")).length, 0);
  const coverageGaps = result.combatExpCandidate?.coverageGaps || {};

  return {
    contextId: context.id,
    startFloor: context.startFloor,
    targetDepth: context.targetDepth,
    arm: armId,
    runIndex,
    rootSeed: null,
    worldSeed,
    outcome: result.outcome,
    terminationReason: result.terminationReason,
    reachedFloor: result.reachedFloor,
    reachedTarget: result.reachedFloor >= context.targetDepth,
    deathFloor: result.deathFloor,
    deathCause: result.deathSnapshot?.cause || null,
    finalLevel: result.finalLevel,
    levelUps: candidateObservations.reduce((sum, observation) => sum + Number(observation.levelUps || 0), 0),
    combatExp: sourceCombatExp,
    tabletExp: sourceTabletExp,
    characterExp: result.characterExpGained,
    levelUpRecoveryHp: candidateObservations.reduce((sum, observation) =>
      sum + Number(observation.levelUpRecoveryHp || 0), 0),
    tablet: {
      generated: result.tabletExposure.generatedCount,
      reached: result.tabletExposure.uniqueReachedLocationCount,
      read: result.tabletExposure.readCount,
      outcomes: result.tabletExposure.encounters.reduce((counts, event) => {
        if (event.selection === "read") increment(counts, event.outcome || "missing-outcome");
        return counts;
      }, {}),
      combatLedgerDelta: tabletLedgerDelta
    },
    bObservations: { total: candidateObservations.length, byKind: expByKind },
    settlements: {
      valid: validSettlements.length,
      nonVictory: nonVictorySettlements.length,
      candidateBudgetMismatch: candidateSettlementMismatches.length
    },
    lifecycle: {
      fleeFires,
      splitFires,
      summonFires,
      settlementDriftGaps,
      identityGaps,
      sourceAccountingMismatch: characterExpSourceMismatch,
      coverageGaps
    },
    validity: {
      lifecycleSettlementDrift: settlementDriftGaps.length > 0 ||
        Object.keys(coverageGaps).some(gap => /lifecycle-settlement-drift/i.test(gap)),
      characterExpSourceAccountingMismatch: characterExpSourceMismatch,
      tabletCombatLedgerDeltaNonZero: tabletLedgerDelta !== 0,
      unexpectedIdentityOrderFailClosed: Object.keys(identityGaps).length > 0,
      validCandidateSettlementLedgerMismatch: candidateSettlementMismatches.length > 0
    }
  };
}

function summarizeGroup(rows) {
  const outcomeCounts = {};
  const reachedCounts = { reached: 0, notReached: 0 };
  const deathFloors = {};
  const deathCauses = {};
  const tabletOutcomes = {};
  const bKinds = {};
  for (const row of rows) {
    increment(outcomeCounts, row.outcome || "unknown");
    increment(reachedCounts, row.reachedTarget ? "reached" : "notReached");
    if (row.deathFloor !== null) increment(deathFloors, row.deathFloor);
    if (row.deathCause) increment(deathCauses, row.deathCause);
    for (const [key, count] of Object.entries(row.tablet.outcomes)) increment(tabletOutcomes, key, count);
    for (const [key, count] of Object.entries(row.bObservations.byKind)) increment(bKinds, key, count);
  }
  return {
    n: rows.length,
    outcome: { counts: outcomeCounts, rates: Object.fromEntries(Object.entries(outcomeCounts).map(([key, count]) => [key, count / rows.length])) },
    reach: { counts: reachedCounts, rate: rows.length ? reachedCounts.reached / rows.length : null },
    death: { count: outcomeCounts.death || 0, floors: deathFloors, causes: deathCauses },
    finalLevel: distribution(rows.map(row => row.finalLevel)),
    levelUps: distribution(rows.map(row => row.levelUps)),
    combatExp: distribution(rows.map(row => row.combatExp)),
    tabletExp: distribution(rows.map(row => row.tabletExp)),
    characterExp: distribution(rows.map(row => row.characterExp)),
    levelUpRecoveryHp: distribution(rows.map(row => row.levelUpRecoveryHp)),
    tablet: {
      generated: rows.reduce((sum, row) => sum + row.tablet.generated, 0),
      reached: rows.reduce((sum, row) => sum + row.tablet.reached, 0),
      read: rows.reduce((sum, row) => sum + row.tablet.read, 0),
      outcomes: tabletOutcomes
    },
    bObservations: { total: rows.reduce((sum, row) => sum + row.bObservations.total, 0), byKind: bKinds },
    settlements: {
      valid: rows.reduce((sum, row) => sum + row.settlements.valid, 0),
      nonVictory: rows.reduce((sum, row) => sum + row.settlements.nonVictory, 0),
      candidateBudgetMismatch: rows.reduce((sum, row) => sum + row.settlements.candidateBudgetMismatch, 0)
    },
    lifecycle: {
      fleeFires: rows.reduce((sum, row) => sum + row.lifecycle.fleeFires, 0),
      splitFires: rows.reduce((sum, row) => sum + row.lifecycle.splitFires, 0),
      summonFires: rows.reduce((sum, row) => sum + row.lifecycle.summonFires, 0),
      settlementDriftGaps: rows.reduce((sum, row) => sum + row.lifecycle.settlementDriftGaps.length, 0),
      sourceAccountingMismatches: rows.filter(row => row.lifecycle.sourceAccountingMismatch).length,
      identityOrderFailClosed: rows.reduce((sum, row) => sum + Object.values(row.lifecycle.identityGaps).reduce((total, count) => total + count, 0), 0)
    },
    invalidRuns: rows.filter(row => Object.values(row.validity).some(Boolean)).length
  };
}

function matchedSeedSummary(rows) {
  const bySeed = new Map();
  for (const row of rows) {
    const pair = bySeed.get(`${row.contextId}/${row.runIndex}`) || {};
    pair[row.arm] = row;
    bySeed.set(`${row.contextId}/${row.runIndex}`, pair);
  }
  const transitions = {};
  const reachedFloorDeltas = [];
  const finalLevelDeltas = [];
  const combatExpDeltas = [];
  const tabletExpDeltas = [];
  const characterExpDeltas = [];
  let newDeaths = 0;
  let deathsAvoided = 0;
  for (const pair of bySeed.values()) {
    const control = pair["current-control"];
    const combined = pair["combined-b+c"];
    if (!control || !combined) continue;
    increment(transitions, `${control.outcome}->${combined.outcome}`);
    reachedFloorDeltas.push(combined.reachedFloor - control.reachedFloor);
    finalLevelDeltas.push(combined.finalLevel - control.finalLevel);
    combatExpDeltas.push(combined.combatExp - control.combatExp);
    tabletExpDeltas.push(combined.tabletExp - control.tabletExp);
    characterExpDeltas.push(combined.characterExp - control.characterExp);
    newDeaths += Number(combined.outcome === "death" && control.outcome !== "death");
    deathsAvoided += Number(control.outcome === "death" && combined.outcome !== "death");
  }
  return {
    comparison: "matched-seed; full-run outcomes are not paired because run state and RNG can diverge",
    n: reachedFloorDeltas.length,
    outcomeTransition: transitions,
    reachedFloorDelta: distribution(reachedFloorDeltas),
    finalLevelDelta: distribution(finalLevelDeltas),
    combatExpDelta: distribution(combatExpDeltas),
    tabletExpDelta: distribution(tabletExpDeltas),
    characterExpDelta: distribution(characterExpDeltas),
    newDeath: newDeaths,
    deathAvoided: deathsAvoided
  };
}

export async function runProgressionExpCombinedRunDiagnostic({
  runs = DEFAULT_RUNS,
  seed = DEFAULT_SEED,
  allowSmallRunCount = false
} = {}) {
  const count = positiveInteger(runs, "runs", allowSmallRunCount ? 1 : DEFAULT_RUNS);
  const rootSeed = positiveInteger(seed, "seed");
  const rows = [];
  const baseScenario = getScenarioById("legacy-no-portal");
  for (const context of CONTEXTS) {
    for (let runIndex = 0; runIndex < count; runIndex++) {
      const worldSeed = deriveWorldSeed(rootSeed, context.id, runIndex);
      for (const [armId, arm] of Object.entries(ARMS)) {
        resetSimulationRandom(numericSeed(worldSeed));
        const result = simulateRun({
          className: "Fighter",
          startFloor: context.startFloor,
          targetDepth: context.targetDepth,
          runIndex,
          seriesId: `phase4j-e8:${context.id}`,
          scoringProfile: null,
          scenario: {
            ...baseScenario,
            ...arm,
            collectEncounterIdentities: true,
            simDiagnosticLevel: "full"
          },
          workshop: { ranks: {} },
          worldSeed,
          collectDiagnostics: true
        });
        const row = describeRun(result, context, armId, runIndex, worldSeed);
        row.rootSeed = rootSeed;
        rows.push(row);
      }
    }
  }
  const groups = {};
  for (const context of CONTEXTS) {
    groups[context.id] = {};
    for (const armId of Object.keys(ARMS)) {
      const selected = rows.filter(row => row.contextId === context.id && row.arm === armId);
      groups[context.id][armId] = summarizeGroup(selected);
    }
  }
  const invalidRows = rows.filter(row => Object.values(row.validity).some(Boolean));
  const expectedN = DEFAULT_RUNS;
  const sampleCountValid = count === expectedN && CONTEXTS.every(context =>
    Object.keys(ARMS).every(arm => rows.filter(row => row.contextId === context.id && row.arm === arm).length === expectedN));
  return {
    runnerVersion: RUNNER_VERSION,
    schemaVersion: SCHEMA_VERSION,
    measurementId: "progression-exp-combined-run-diagnostic",
    evidenceScope: "diagnostic",
    confidencePolicy: {
      minimumSubcohort: MIN_CONFIDENT_SUBCOHORT,
      belowMinimum: "counts-only; no conclusion"
    },
    configuration: {
      runsPerContextArm: count,
      seed: rootSeed,
      contexts: CONTEXTS,
      arms: ARMS,
      scenario: "legacy-no-portal with the same non-arm policy for both arms",
      className: "Fighter",
      matchedSeedKey: ["root seed", "context id", "run index"],
      fullRunComparison: "matched-seed; not paired",
      expectedRunsPerContextArm: expectedN
    },
    validity: {
      valid: invalidRows.length === 0 && sampleCountValid,
      invalidRunCount: invalidRows.length,
      sampleCountValid,
      invalidRunKeys: invalidRows.map(row => `${row.contextId}/${row.arm}/${row.runIndex}`),
      invalidReasons: {
        lifecycleSettlementDrift: invalidRows.filter(row => row.validity.lifecycleSettlementDrift).length,
        characterExpSourceAccountingMismatch: invalidRows.filter(row => row.validity.characterExpSourceAccountingMismatch).length,
        tabletCombatLedgerDeltaNonZero: invalidRows.filter(row => row.validity.tabletCombatLedgerDeltaNonZero).length,
        unexpectedIdentityOrderFailClosed: invalidRows.filter(row => row.validity.unexpectedIdentityOrderFailClosed).length,
        validCandidateSettlementLedgerMismatch: invalidRows.filter(row => row.validity.validCandidateSettlementLedgerMismatch).length,
        provenance: null,
        sampleCount: sampleCountValid ? 0 : 1
      }
    },
    groups,
    matchedSeed: Object.fromEntries(CONTEXTS.map(context => [context.id,
      matchedSeedSummary(rows.filter(row => row.contextId === context.id))])),
    observations: rows
  };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const [key, inlineValue] = arg.slice(2).split("=", 2);
    options[key] = inlineValue ?? argv[++index];
  }
  return options;
}

function summaryMarkdown(report) {
  const lines = [
    "# Phase 4j-E8 combined B+C full-run diagnostic",
    "",
    `- Measurement: ${report.measurementId}; seed=${report.configuration.seed}; N=${report.configuration.runsPerContextArm}/context/arm`,
    "- Comparison: matched-seed; outcomes after divergence are not paired",
    `- Valid: ${report.validity.valid}; invalid runs=${report.validity.invalidRunCount}; sample-count valid=${report.validity.sampleCountValid}`,
    "- Subcohorts below N=30: counts only; no conclusion",
    ""
  ];
  for (const context of CONTEXTS) {
    lines.push(`## ${context.id}`, "");
    for (const arm of Object.keys(ARMS)) {
      const row = report.groups[context.id][arm];
      lines.push(`- ${arm}: N=${row.n}; outcome=${JSON.stringify(row.outcome.counts)}; reached=${row.reach.counts.reached}; deaths=${row.death.count}; final Level p10/p50/p90=${[row.finalLevel.p10, row.finalLevel.p50, row.finalLevel.p90].join("/")}; combat/tablet/character EXP mean=${[row.combatExp.mean, row.tabletExp.mean, row.characterExp.mean].join("/")}; tablet reads=${row.tablet.read}; B kinds=${JSON.stringify(row.bObservations.byKind)}; valid/non-victory settlements=${row.settlements.valid}/${row.settlements.nonVictory}`);
    }
    lines.push(`- Matched-seed transitions: ${JSON.stringify(report.matchedSeed[context.id].outcomeTransition)}`, "");
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const runs = positiveInteger(options.runs || DEFAULT_RUNS, "runs", options["allow-small-run-count"] === "true" ? 1 : DEFAULT_RUNS);
  const seed = positiveInteger(options.seed || DEFAULT_SEED, "seed");
  if (!options.output || !options.summary || !options.manifest) {
    throw new Error("--output, --summary, and --manifest are required");
  }
  const provenance = requireRunnerProvenance({ fetchOriginMain: false, measurementRunnerPaths: [...PRODUCTION_PATHS] });
  const report = await runProgressionExpCombinedRunDiagnostic({
    runs,
    seed,
    allowSmallRunCount: options["allow-small-run-count"] === "true"
  });
  report.measurement = {
    scope: readSimScopeDeclaration(import.meta.url)?.name || "run",
    sourceCommit: provenance?.sourceCommit || null,
    gameplaySourceCommit: provenance?.gameplaySourceCommit || null,
    measurementRunnerCommit: provenance?.measurementRunnerCommit || null,
    measurementRunnerPaths: provenance?.measurementRunnerPaths || [...PRODUCTION_PATHS],
    measurementRunnerDiffSha256: provenance?.measurementRunnerDiffSha256 || null,
    originMainAncestor: provenance?.originMainAncestor ?? false,
    workingTreeClean: provenance?.workingTreeClean ?? false,
    workflow: {
      repository: process.env.MEASUREMENT_REPOSITORY || null,
      runId: process.env.MEASUREMENT_WORKFLOW_RUN_ID || null,
      runAttempt: process.env.MEASUREMENT_RUN_ATTEMPT || null,
      runUrl: process.env.MEASUREMENT_WORKFLOW_RUN_URL || null
    }
  };
  report.validity.valid = report.validity.valid && Boolean(provenance);
  report.validity.invalidReasons.provenance = provenance ? 0 : 1;
  fs.writeFileSync(resolve(options.output), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(resolve(options.summary), summaryMarkdown(report));
  fs.writeFileSync(resolve(options.manifest), `${JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    status: report.validity.valid ? "success" : "invalid",
    runner: RUNNER_VERSION,
    source: report.measurement,
    configuration: report.configuration,
    validity: report.validity
  }, null, 2)}\n`);
  if (!report.validity.valid) throw new Error("measurement invalid: validity gates failed");
}

export { summaryMarkdown };

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
