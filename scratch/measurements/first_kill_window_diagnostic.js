// sim-scope: run — production-backed B1F first-kill / kill-window diagnostic
/* global console, process */

import "../simulations/simulation_preflight.js";
import fs from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  createFirstKillAggregate,
  finalizeFirstKillAggregate,
  observeFirstKillWindow
} from "./first_kill_observation.js";
import { runFixedCombatDiagnostic } from "./fixed_combat_composition_diagnostic.js";
import { requireRunnerProvenance } from "./measurement_provenance.js";
import { printEnvSignatureBanner, readSimScopeDeclaration } from "./measurement_env_signature.js";
import { runDiagnostic } from "./starting_kit_diagnostic.js";

export const RUNNER_VERSION = "issue1210-first-kill-window-v1";
export const SCHEMA_VERSION = 1;
export const DEFAULT_RUNS = 1000;
export const DEFAULT_SEED = 1205;
export const FIXED_COMBAT_SEED = 1151;

const RUNNER_PATH = "scratch/measurements/first_kill_window_diagnostic.js";
const PRODUCTION_PATHS = Object.freeze([
  "scratch/measurements/starting_kit_diagnostic.js",
  "scratch/measurements/fixed_combat_composition_diagnostic.js",
  "scratch/measurements/first_kill_observation.js",
  "scratch/simulations/sim_depth_material_ev.js",
  "src/combat_logic/round.js",
  "src/combat_logic/targeting.js",
  "src/combat_logic/damage.js",
  "src/data/encounters.js",
  "src/data/monsters.js"
]);

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

function positiveInteger(value, label, minimum = 1) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum) {
    throw new Error(`${label} must be an integer >= ${minimum}: ${value}`);
  }
  return parsed;
}

function summarize(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (sorted.length === 0) {
    return { count: 0, average: null, p25: null, p50: null, p75: null, p95: null, min: null, max: null };
  }
  const percentile = rate => {
    const position = (sorted.length - 1) * rate;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    return lower === upper
      ? sorted[lower]
      : sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
  };
  return {
    count: sorted.length,
    average: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    p25: percentile(0.25),
    p50: percentile(0.50),
    p75: percentile(0.75),
    p95: percentile(0.95),
    min: sorted[0],
    max: sorted.at(-1)
  };
}

function increment(map, key) {
  if (!key) return;
  map[key] = (map[key] || 0) + 1;
}

function summarizeRows(rows, totalEnemyActions = null) {
  const aggregate = createFirstKillAggregate();
  const compositions = {};
  rows.forEach(row => {
    observeFirstKillWindow(aggregate, row.firstKillWindow);
    increment(compositions, row.initialCompositionKey);
  });
  return {
    encounters: rows.length,
    outcomes: rows.reduce((map, row) => {
      increment(map, row.outcome);
      return map;
    }, {}),
    deaths: rows.filter(row => row.outcome === "death").length,
    deathTruncation: {
      deathsWithoutFirstKill: rows.filter(row =>
        row.outcome === "death" && !row.firstKillWindow.firstKillObserved
      ).length
    },
    totalEnemyActions: totalEnemyActions || summarize(rows.map(row => row.enemyActionCount)),
    enemyActionsBeforeFirstPlayerAction: summarize(
      rows.map(row => row.enemyActionsBeforeFirstPlayerAction)
    ),
    rounds: summarize(rows.map(row => row.combatRounds)),
    compositions,
    firstKillWindow: finalizeFirstKillAggregate(aggregate)
  };
}

function naturalDecomposition(result) {
  const rows = result.encounterExposure.encounterRows.filter(row =>
    row.encounterOrdinal === 1 || row.encounterOrdinal === 2
  );
  const byEncounterOrdinal = {};
  for (const ordinal of [1, 2]) {
    const ordinalRows = rows.filter(row => row.encounterOrdinal === ordinal);
    const cost = result.enemyActionCost.byEncounterOrdinal[String(ordinal)];
    byEncounterOrdinal[String(ordinal)] = {
      all: summarizeRows(ordinalRows, cost.all.enemyActions),
      single: summarizeRows(
        ordinalRows.filter(row => row.rawInitialVisibleEnemyCount === 1),
        cost.single.enemyActions
      ),
      pair: summarizeRows(
        ordinalRows.filter(row => row.rawInitialVisibleEnemyCount >= 2),
        cost.pair.enemyActions
      )
    };
  }
  return {
    source: "production baseline encounterRows + full combat diagnostics",
    byEncounterOrdinal
  };
}

function ratio(left, right) {
  return Number.isFinite(left) && Number.isFinite(right) && right > 0 ? left / right : null;
}

function diagnose(natural) {
  const pair = natural.byEncounterOrdinal["1"].pair;
  const single = natural.byEncounterOrdinal["1"].single;
  const pairWindow = pair.firstKillWindow;
  const singleWindow = single.firstKillWindow;
  const pairActionRatio = ratio(pair.totalEnemyActions.p50, single.totalEnemyActions.p50);
  const playerKillWindowRatio = ratio(
    pairWindow.playerActionsBeforeFirstKill.p50,
    singleWindow.playerActionsBeforeFirstKill.p50
  );
  const pairExtraActionShare = ratio(
    pairWindow.extraActionCount.average,
    pair.totalEnemyActions.average
  );
  const pairPreKillShare = ratio(
    pairWindow.enemyActionsBeforeFirstKill.average,
    pair.totalEnemyActions.average
  );
  const pairFirstInsertion = pair.enemyActionsBeforeFirstPlayerAction.p50;
  const extraActionDominant = Number.isFinite(pairExtraActionShare) && pairExtraActionShare >= 0.25;
  const killWindowDominant = Number.isFinite(playerKillWindowRatio) && playerKillWindowRatio >= 1.5;
  const orderingDominant = Number.isFinite(pairFirstInsertion) && pairFirstInsertion >= 2 &&
    Number.isFinite(pairPreKillShare) && pairPreKillShare >= 0.5 && !killWindowDominant;
  const actorExposureDominant = Number.isFinite(pairActionRatio) && pairActionRatio >= 2 &&
    !killWindowDominant && !extraActionDominant && !orderingDominant;
  const primary = actorExposureDominant
    ? "A-actor-exposure-dominant"
    : killWindowDominant
      ? "B-kill-window-prolongation-dominant"
      : extraActionDominant
        ? "C-extra-action-source-dominant"
        : orderingDominant
          ? "D-initiative-ordering-interaction-dominant"
          : "E-mixed-no-clean-shared-rule";
  const nextProductionAxis = primary.startsWith("A-")
    ? "shared target-removal / action-economy scheduling rule"
    : primary.startsWith("B-")
      ? "one first-kill window axis identified from the paired composition path"
      : primary.startsWith("C-")
        ? "the observed extra-action source and its shared scheduling rule"
        : primary.startsWith("D-")
          ? "the shared pre-first-player-action ordering rule"
          : "clean candidateなし; #1184 manual Build/death-cause axis";
  return {
    primary,
    nextProductionAxis,
    metrics: {
      pairSingleEnemyActionP50Ratio: pairActionRatio,
      pairSinglePlayerActionsBeforeFirstKillP50Ratio: playerKillWindowRatio,
      pairExtraActionShare,
      pairPreFirstKillEnemyActionShare: pairPreKillShare,
      pairEnemyActionsBeforeFirstPlayerActionP50: pairFirstInsertion,
      pairFirstKillObservationRate: pairWindow.firstKillObservationRate,
      singleFirstKillObservationRate: singleWindow.firstKillObservationRate
    },
    rule: "Diagnostic classification only; no production numeric tuning follows from this report."
  };
}

function fixedConnection(fixed) {
  return Object.fromEntries(["100", "50"].map(hpBandId => [hpBandId,
    fixed.cases
      .filter(testCase => testCase.hpBandId === hpBandId && testCase.policy === "fight")
      .map(testCase => ({
        compositionId: testCase.compositionId,
        risk: testCase.risk,
        runs: testCase.runs,
        outcomes: testCase.outcomes,
        clearRate: testCase.clearRate,
        enemyActionCount: testCase.enemyActionCount,
        firstKillWindow: testCase.firstKillWindow
      }))
  ]));
}

export async function runFirstKillWindowDiagnostic({
  runs = DEFAULT_RUNS,
  seed = DEFAULT_SEED,
  fixedRuns = runs,
  fixedSeed = FIXED_COMBAT_SEED,
  allowSmallRunCount = false
} = {}) {
  const minimum = allowSmallRunCount ? 1 : DEFAULT_RUNS;
  const normalizedRuns = positiveInteger(runs, "runs", minimum);
  const normalizedFixedRuns = positiveInteger(fixedRuns, "fixedRuns", minimum);
  const normalizedSeed = positiveInteger(seed, "seed");
  const normalizedFixedSeed = positiveInteger(fixedSeed, "fixedSeed");
  const baseline = await runDiagnostic({
    startingKit: "vanguard",
    policy: "fight",
    earlyCompositionPolicy: "baseline",
    runs: normalizedRuns,
    seed: normalizedSeed,
    allowSmallRunCount: true
  });
  const fixed = await runFixedCombatDiagnostic({
    runs: normalizedFixedRuns,
    seed: normalizedFixedSeed,
    startingKit: "vanguard",
    allowSmallRunCount: true
  });
  const natural = naturalDecomposition(baseline);
  return {
    question: "B1F ordinal 1/2 pair enemy action Cost を actor exposure・first-kill window・post-kill tail・extra action・ordering に分解する",
    evidenceScope: "run",
    configuration: {
      startingKit: "vanguard",
      floorStart: 1,
      targetFloor: 2,
      runs: normalizedRuns,
      seed: normalizedSeed,
      fixedCombatRuns: normalizedFixedRuns,
      fixedCombatSeed: normalizedFixedSeed,
      naturalPolicy: "production-auto fight; no departure consumable or craft",
      worldSeedTemplate: "issue-1176:{seed}:{runIndex}",
      fixedWorldSeedTemplate: "issue-1151:{seed}:{hpBandId}:{compositionId}:{runIndex}",
      productionSemantics: "production encounter, combat, initiative, targeting, trait, status, summon, and settlement paths",
      omitted: [
        "manual player comprehension and qualitative next-trial hypothesis",
        "fixed-combat map traversal and encounter frequency",
        "production numeric tuning"
      ]
    },
    natural,
    fixedHpConnection: fixedConnection(fixed),
    diagnosis: diagnose(natural),
    sourceRunners: {
      natural: baseline.runnerVersion,
      fixed: fixed.runnerVersion
    }
  };
}

function format(value, digits = 2) {
  return value === null || value === undefined ? "—" : Number(value).toFixed(digits);
}

function formatRate(value) {
  return value === null || value === undefined ? "—" : `${(value * 100).toFixed(2)}%`;
}

function buildSummary(report) {
  const lines = [
    "# Issue #1210 fresh B1F first-kill / kill-window diagnostic",
    "",
    `- runner: \`${report.runnerVersion}\` / schema: ${report.schemaVersion}`,
    `- source SHA: \`${report.measurement.sourceCommit || "not recorded"}\``,
    `- natural: vanguard B1F ordinal 1/2; N=${report.configuration.runs}; seed=${report.configuration.seed}`,
    `- fixed connection: HP 100% / 50%; N=${report.configuration.fixedCombatRuns}; seed=${report.configuration.fixedCombatSeed}`,
    "",
    "## Natural single / pair decomposition",
    "",
    "| Ordinal | Group | Encounters / deaths | First kill observed | Enemy actions total p50 | Before first kill p50 | After first kill p50 | Player actions before kill p50 | Player actions after kill p50 | Extra action count avg |",
    "| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"
  ];
  for (const ordinal of ["1", "2"]) {
    for (const group of ["all", "single", "pair"]) {
      const row = report.natural.byEncounterOrdinal[ordinal][group];
      const window = row.firstKillWindow;
      lines.push(
        `| ${ordinal} | ${group} | ${row.encounters} / ${row.deaths} | ${formatRate(window.firstKillObservationRate)} | ` +
        `${format(row.totalEnemyActions.p50)} | ${format(window.enemyActionsBeforeFirstKill.p50)} | ` +
        `${format(window.enemyActionsAfterFirstKill.p50)} | ${format(window.playerActionsBeforeFirstKill.p50)} | ` +
        `${format(window.playerActionsAfterFirstKill.p50)} | ${format(window.extraActionCount.average)} |`
      );
    }
  }
  lines.push(
    "",
    "## Pair composition identity and living-enemy transitions",
    "",
    "Pair rows preserve the production composition key. Transitions are derived from production kill logs; no synthetic enemy or independent combat model is used.",
    "",
    "| Ordinal | Pair composition counts | Living transitions | Extra-action sources | Extra-action owners |",
    "| ---: | --- | --- | --- | --- |"
  );
  for (const ordinal of ["1", "2"]) {
    const row = report.natural.byEncounterOrdinal[ordinal].pair;
    const window = row.firstKillWindow;
    lines.push(
      `| ${ordinal} | ${Object.entries(row.compositions).map(([key, count]) => `${key}×${count}`).join("; ") || "unobserved"} | ` +
      `${Object.entries(window.killTransitions).map(([key, count]) => `${key}×${count}`).join("; ") || "unobserved"} | ` +
      `${Object.entries(window.extraActionSources).map(([key, count]) => `${key}×${count}`).join("; ") || "unobserved"} | ` +
      `${Object.entries(window.extraActionOwners).map(([key, count]) => `${key}×${count}`).join("; ") || "unobserved"} |`
    );
  }
  lines.push(
    "",
    "## Fixed HP connection",
    "",
    "| HP | Risk | Composition | Clear | First kill observed | Before first kill p50 | After first kill p50 | Deaths without first kill |",
    "| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: |"
  );
  for (const hp of ["100", "50"]) {
    for (const testCase of report.fixedHpConnection[hp]) {
      const window = testCase.firstKillWindow;
      lines.push(
        `| ${hp}% | ${testCase.risk} | ${testCase.compositionId} | ${formatRate(testCase.clearRate)} | ` +
        `${formatRate(window.firstKillObservationRate)} | ${format(window.enemyActionsBeforeFirstKill.p50)} | ` +
        `${format(window.enemyActionsAfterFirstKill.p50)} | ${window.noFirstKill} |`
      );
    }
  }
  lines.push(
    "",
    "## Decision",
    "",
    `- classification: **${report.diagnosis.primary}**`,
    `- next production axis (one): **${report.diagnosis.nextProductionAxis}**`,
    `- pair/single total enemy-action p50 ratio: ${format(report.diagnosis.metrics.pairSingleEnemyActionP50Ratio)}; ` +
      `player-action-before-first-kill ratio: ${format(report.diagnosis.metrics.pairSinglePlayerActionsBeforeFirstKillP50Ratio)}`,
    `- pair extra-action share: ${formatRate(report.diagnosis.metrics.pairExtraActionShare)}; ` +
      `pair pre-first-kill enemy-action share: ${formatRate(report.diagnosis.metrics.pairPreFirstKillEnemyActionShare)}`,
    "- first-kill and post-kill values are conditioned on observed first kills; no-first-kill death rows remain explicit survivor/death truncation evidence.",
    "- diagnostic only: no enemy HP, damage, encounter pool, recovery, initiative value, gear, or global modifier changed."
  );
  return `${lines.join("\n")}\n`;
}

function buildReport(result, provenance, options) {
  const scope = readSimScopeDeclaration(import.meta.url)?.name || "run";
  const environmentHash = printEnvSignatureBanner({
    runnerVersion: RUNNER_VERSION,
    schemaVersion: SCHEMA_VERSION,
    seed: result.configuration.seed,
    runs: result.configuration.runs,
    fixedSeed: result.configuration.fixedCombatSeed,
    fixedRuns: result.configuration.fixedCombatRuns
  }, { label: "issue1210 first-kill env" });
  return {
    schemaVersion: SCHEMA_VERSION,
    runnerVersion: RUNNER_VERSION,
    measurement: {
      scope,
      purpose: options.purpose || null,
      requestedRef: options.ref || null,
      sourceCommit: provenance?.sourceCommit || null,
      gameplaySourceCommit: provenance?.gameplaySourceCommit || null,
      measurementRunnerCommit: provenance?.measurementRunnerCommit || null,
      measurementRunnerPaths: provenance?.measurementRunnerPaths || [RUNNER_PATH, ...PRODUCTION_PATHS],
      measurementRunnerDiffSha256: provenance?.measurementRunnerDiffSha256 || null,
      originMainAncestor: provenance?.originMainAncestor ?? null,
      staleTreeAllowed: provenance?.staleTreeAllowed ?? null,
      workingTreeClean: provenance?.workingTreeClean ?? null,
      productionPaths: [...PRODUCTION_PATHS],
      environmentHash
    },
    ...result
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const runs = positiveInteger(options.runs || DEFAULT_RUNS, "runs", DEFAULT_RUNS);
  const fixedRuns = positiveInteger(options["fixed-runs"] || runs, "fixedRuns", DEFAULT_RUNS);
  const seed = positiveInteger(options.seed || DEFAULT_SEED, "seed");
  const fixedSeed = positiveInteger(options["fixed-seed"] || FIXED_COMBAT_SEED, "fixedSeed");
  if (!options.output || !options.summary || !options.manifest) {
    throw new Error("--output, --summary, and --manifest are required");
  }
  const provenance = requireRunnerProvenance({
    fetchOriginMain: false,
    measurementRunnerPaths: [RUNNER_PATH, ...PRODUCTION_PATHS]
  });
  const result = await runFirstKillWindowDiagnostic({ runs, seed, fixedRuns, fixedSeed });
  const report = buildReport(result, provenance, options);
  fs.writeFileSync(resolve(options.output), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(resolve(options.summary), buildSummary(report));
  fs.writeFileSync(resolve(options.manifest), `${JSON.stringify({
    schemaVersion: report.schemaVersion,
    status: "success",
    runner: report.runnerVersion,
    source: report.measurement,
    configuration: report.configuration,
    purpose: options.purpose || null,
    workflow: {
      repository: process.env.MEASUREMENT_REPOSITORY || null,
      runId: process.env.MEASUREMENT_WORKFLOW_RUN_ID || null,
      runUrl: process.env.MEASUREMENT_WORKFLOW_RUN_URL || null,
      requestedRef: options.ref || process.env.MEASUREMENT_REQUESTED_REF || null,
      generatedAt: new Date().toISOString()
    }
  }, null, 2)}\n`);
  console.log(`Wrote Issue #1210 diagnostic: ${resolve(options.output)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
