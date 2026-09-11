// sim-scope: run — production-backed fresh B1F early encounter cause diagnostic
/* global console, process */

import "../simulations/simulation_preflight.js";
import fs from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { requireRunnerProvenance } from "./measurement_provenance.js";
import { printEnvSignatureBanner, readSimScopeDeclaration } from "./measurement_env_signature.js";
import {
  EARLY_COMPOSITION_POLICY_IDS,
  runDiagnostic
} from "./starting_kit_diagnostic.js";
import { runFixedCombatDiagnostic } from "./fixed_combat_composition_diagnostic.js";

export const RUNNER_VERSION = "issue1187-early-encounter-cause-v2";
export const SCHEMA_VERSION = 2;
export const DEFAULT_RUNS = 1000;
export const DEFAULT_SEED = 1187;
export const FIXED_COMBAT_SEED = 1151;

const RUNNER_PATH = "scratch/measurements/early_encounter_cause_diagnostic.js";
const PRODUCTION_PATHS = Object.freeze([
  "scratch/simulations/sim_depth_material_ev.js",
  "scratch/measurements/starting_kit_diagnostic.js",
  "scratch/measurements/fixed_combat_composition_diagnostic.js",
  "src/state/initial_state.js",
  "src/data/monsters.js",
  "src/data/encounters.js",
  "src/combat_ui/encounter.js",
  "src/combat_logic/round.js",
  "src/combat_logic/targeting.js",
  "src/combat_logic/damage.js"
]);

function positiveInteger(value, label, minimum = 1) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum) {
    throw new Error(`${label} must be an integer >= ${minimum}: ${value}`);
  }
  return parsed;
}

function formatRate(value) {
  return value === null || value === undefined ? "—" : `${(value * 100).toFixed(2)}%`;
}

function formatNumber(value) {
  return value === null || value === undefined ? "—" : Number(value).toFixed(2);
}

function earlyView(result, ordinal) {
  return result.earlyActionOpportunity.byEncounterOrdinal[String(ordinal)];
}

function summarizeValues(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (sorted.length === 0) {
    return {
      count: 0,
      average: null,
      p25: null,
      p50: null,
      p75: null,
      min: null,
      max: null
    };
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
    min: sorted[0],
    max: sorted.at(-1)
  };
}

function summarizeEntryRows(rows) {
  const hpBandCounts = {
    "0-25%": 0,
    "26-50%": 0,
    "51-75%": 0,
    ">75%": 0
  };
  for (const row of rows) {
    if (row.hpRateBeforeEncounter <= 0.25) hpBandCounts["0-25%"]++;
    else if (row.hpRateBeforeEncounter <= 0.5) hpBandCounts["26-50%"]++;
    else if (row.hpRateBeforeEncounter <= 0.75) hpBandCounts["51-75%"]++;
    else hpBandCounts[">75%"]++;
  }
  return {
    encounters: rows.length,
    hpRateBeforeEncounter: summarizeValues(rows.map(row => row.hpRateBeforeEncounter)),
    mpRateBeforeEncounter: summarizeValues(rows.map(row => row.mpRateBeforeEncounter)),
    hpBandCounts
  };
}

function summarizeNaturalEntryResource(result) {
  const rows = result.encounterExposure.encounterRows.filter(row =>
    row.encounterOrdinal === 1 || row.encounterOrdinal === 2
  );
  const byEncounterOrdinal = {};
  for (const ordinal of [1, 2]) {
    const ordinalRows = rows.filter(row => row.encounterOrdinal === ordinal);
    byEncounterOrdinal[String(ordinal)] = {
      all: summarizeEntryRows(ordinalRows),
      single: summarizeEntryRows(ordinalRows.filter(row => row.rawInitialVisibleEnemyCount === 1)),
      pair: summarizeEntryRows(ordinalRows.filter(row => row.rawInitialVisibleEnemyCount >= 2))
    };
  }
  return {
    source: "production baseline encounterRows",
    fixedHpBandReference: ["100%", "75%", "50%", "25%"],
    byEncounterOrdinal
  };
}

function sensitivityRow(policy, result, baseline) {
  const first = earlyView(result, 1);
  const second = earlyView(result, 2);
  const baselineFirst = earlyView(baseline, 1);
  const baselineSecond = earlyView(baseline, 2);
  const delta = (value, base) => Number.isFinite(value) && Number.isFinite(base)
    ? value - base
    : null;
  return {
    policy,
    b1DeathRate: result.runOutcome.b1DeathRate,
    b2ArrivalRate: result.runOutcome.b2ArrivalRate,
    meaningfulRewardRate: result.rewardOpportunity.byType.meaningfulReward.opportunityRate,
    equipmentOpportunityRate: result.rewardOpportunity.byType.buildChangeOpportunity.opportunityRate,
    encounter1: first,
    encounter2: second,
    delta: {
      b1DeathRate: delta(result.runOutcome.b1DeathRate, baseline.runOutcome.b1DeathRate),
      b2ArrivalRate: delta(result.runOutcome.b2ArrivalRate, baseline.runOutcome.b2ArrivalRate),
      encounter1DeathBeforeFirstPlayerAction: delta(
        first.deathBeforeFirstPlayerActionRate,
        baselineFirst.deathBeforeFirstPlayerActionRate
      ),
      encounter2DeathBeforeFirstPlayerAction: delta(
        second.deathBeforeFirstPlayerActionRate,
        baselineSecond.deathBeforeFirstPlayerActionRate
      )
    }
  };
}

export async function runEarlyEncounterCauseDiagnostic({
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
  const results = {};
  for (const policy of EARLY_COMPOSITION_POLICY_IDS) {
    results[policy] = await runDiagnostic({
      startingKit: "vanguard",
      policy: "fight",
      earlyCompositionPolicy: policy,
      runs: normalizedRuns,
      seed: normalizedSeed,
      allowSmallRunCount: true
    });
  }
  const fleeDiagnostic = await runDiagnostic({
    startingKit: "vanguard",
    policy: "visible-multi-enemy-flee",
    earlyCompositionPolicy: "baseline",
    runs: normalizedRuns,
    seed: normalizedSeed,
    allowSmallRunCount: true
  });
  const fixedCombat = await runFixedCombatDiagnostic({
    runs: normalizedFixedRuns,
    seed: normalizedFixedSeed,
    startingKit: "vanguard",
    allowSmallRunCount: true
  });
  const baseline = results.baseline;
  return {
    question: "fresh B1F の最初の1〜2戦で活路を閉じる主因を、編成数・composition・entry resource・first action・fight/flee に分解する",
    evidenceScope: "run",
    configuration: {
      startingKit: "vanguard",
      floorStart: 1,
      targetFloor: 2,
      runs: normalizedRuns,
      seed: normalizedSeed,
      fixedCombatRuns: normalizedFixedRuns,
      fixedCombatSeed: normalizedFixedSeed,
      earlyCompositionPolicies: [...EARLY_COMPOSITION_POLICY_IDS],
      fleePolicy: "visible-multi-enemy-flee",
      worldSeedTemplate: "issue-1176:{seed}:{runIndex}",
      fixedWorldSeedTemplate: "issue-1151:{seed}:{hpBandId}:{compositionId}:{runIndex}",
      baselinePolicy: "production",
      modeledPlayerPolicy: "production-auto fight; no departure consumables or craft",
      productionSemantics: "production encounter generation, initiative, combat, flee, loot, and reward paths",
      omitted: [
        "manual player comprehension or qualitative next-trial hypothesis",
        "fixed-combat map traversal and encounter frequency",
        "production numeric tuning"
      ]
    },
    runs: results,
    fleeDiagnostic,
    sensitivity: Object.fromEntries(
      EARLY_COMPOSITION_POLICY_IDS.map(policy => [
        policy,
        sensitivityRow(policy, results[policy], baseline)
      ])
    ),
    naturalEntryResource: summarizeNaturalEntryResource(baseline),
    fixedCombat
  };
}

function buildReport(result, provenance, options) {
  const scope = readSimScopeDeclaration(import.meta.url)?.name || "run";
  const environmentHash = printEnvSignatureBanner({
    runnerVersion: RUNNER_VERSION,
    schemaVersion: SCHEMA_VERSION,
    seed: result.configuration.seed,
    runs: result.configuration.runs,
    fixedCombatSeed: result.configuration.fixedCombatSeed,
    fixedCombatRuns: result.configuration.fixedCombatRuns,
    policies: EARLY_COMPOSITION_POLICY_IDS
  }, { label: "issue1187 early-encounter env" });
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

function buildSummary(report) {
  const {
    measurement,
    configuration,
    sensitivity,
    naturalEntryResource,
    fleeDiagnostic,
    fixedCombat
  } = report;
  const lines = [
    "# Issue #1187 fresh B1F early-encounter cause diagnostic",
    "",
    `- runner: \`${report.runnerVersion}\` / schema: ${report.schemaVersion}`,
    `- source SHA: \`${measurement.sourceCommit || "not recorded"}\``,
    `- primary: ${configuration.startingKit}; N=${configuration.runs}; seed=${configuration.seed}`,
    `- fixed #1151 reuse: N=${configuration.fixedCombatRuns} per case; seed=${configuration.fixedCombatSeed}`,
    "",
    "## Matched run-level sensitivity",
    "",
    "| Policy | B1F death | B2 arrival | Meaningful reward | Equipment opportunity | E1 raw pair / effective pair | E1 death before first action | E2 raw pair / effective pair | E2 death before first action |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"
  ];
  for (const policy of EARLY_COMPOSITION_POLICY_IDS) {
    const row = sensitivity[policy];
    lines.push(
      `| ${policy} | ${formatRate(row.b1DeathRate)} | ${formatRate(row.b2ArrivalRate)} | ` +
      `${formatRate(row.meaningfulRewardRate)} | ${formatRate(row.equipmentOpportunityRate)} | ` +
      `${formatRate(row.encounter1.generatedPairRunRate)} / ${formatRate(row.encounter1.effectivePairRunRate)} | ` +
      `${row.encounter1.deathBeforeFirstPlayerAction}/${row.encounter1.deaths} (${formatRate(row.encounter1.deathBeforeFirstPlayerActionRate)}) | ` +
      `${formatRate(row.encounter2.generatedPairRunRate)} / ${formatRate(row.encounter2.effectivePairRunRate)} | ` +
      `${row.encounter2.deathBeforeFirstPlayerAction}/${row.encounter2.deaths} (${formatRate(row.encounter2.deathBeforeFirstPlayerActionRate)}) |`
      );
  }
  lines.push(
    "",
    "Rates in the pair columns are run-level exposure among encounter ordinal 1/2; raw pair is before the measurement-only counterfactual and effective pair is after it.",
    "",
    "## First action opportunity",
    "",
    "| Policy | Ordinal | Encounters | Player before enemy | After enemy | Not executed | Enemy actions before first action p50 | Damage before first action p50 |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"
  );
  for (const policy of EARLY_COMPOSITION_POLICY_IDS) {
    for (const ordinal of [1, 2]) {
      const row = sensitivity[policy][`encounter${ordinal}`];
      lines.push(
        `| ${policy} | ${ordinal} | ${row.encountered} | ${row.playerBeforeAnyEnemy} | ` +
        `${row.afterEnemyAction} | ${row.firstPlayerActionNotExecuted} | ` +
        `${formatNumber(row.enemyActionsBeforeFirstPlayerAction.p50)} | ` +
        `${formatNumber(row.damageBeforeFirstPlayerAction.p50)} |`
      );
    }
  }
  lines.push(
    "",
    "## Production fight / flee comparison",
    "",
    `| Fight B1F death | Fight B2 arrival | Flee selected | Flee executed | Preempted | Flee survived | Parting-attack deaths | Execution survival |`,
    "| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    `| ${formatRate(report.runs.baseline.runOutcome.b1DeathRate)} | ${formatRate(report.runs.baseline.runOutcome.b2ArrivalRate)} | ` +
      `${fleeDiagnostic.runOutcome.fleeSelected} | ${fleeDiagnostic.runOutcome.fleeExecuted} | ` +
      `${fleeDiagnostic.runOutcome.fleeSelectedButNotExecuted} | ${fleeDiagnostic.runOutcome.fleeSurvived} | ` +
      `${fleeDiagnostic.runOutcome.fleeDiedFromPartingAttack} | ${formatRate(fleeDiagnostic.runOutcome.fleeSurvivalRate)} |`,
    "",
    "The flee row uses the same issue-1176 world-seed template and production flee resolver; it is a counterfactual policy comparison, not a recommended default."
  );
  lines.push(
    "",
    "## Natural-run entry resource by ordinal and composition",
    "",
    "These are production baseline encounter rows. Single/pair is grouped by raw generated visible enemy count before any counterfactual suppression.",
    "",
    "| Ordinal | Group | Encounters | HP p25 / p50 / p75 | MP p25 / p50 / p75 | HP ≤25 / 26–50 / 51–75 / >75 |",
    "| ---: | --- | ---: | ---: | ---: | ---: |"
  );
  for (const ordinal of [1, 2]) {
    for (const group of ["all", "single", "pair"]) {
      const row = naturalEntryResource.byEncounterOrdinal[String(ordinal)][group];
      lines.push(
        `| ${ordinal} | ${group} | ${row.encounters} | ` +
        `${formatRate(row.hpRateBeforeEncounter.p25)} / ${formatRate(row.hpRateBeforeEncounter.p50)} / ${formatRate(row.hpRateBeforeEncounter.p75)} | ` +
        `${formatRate(row.mpRateBeforeEncounter.p25)} / ${formatRate(row.mpRateBeforeEncounter.p50)} / ${formatRate(row.mpRateBeforeEncounter.p75)} | ` +
        `${row.hpBandCounts["0-25%"]} / ${row.hpBandCounts["26-50%"]} / ${row.hpBandCounts["51-75%"]} / ${row.hpBandCounts[">75%"]} |`
      );
    }
  }
  lines.push(
    "",
    "The natural ordinal-2 population is concentrated around the fixed 25%–75% HP bands, while ordinal 1 is mostly above 75%; MP quartiles remain full for both ordinals."
  );
  const hp100Fight = fixedCombat.contrasts.find(contrast => contrast.hpBandId === "100");
  const hp25Fight = fixedCombat.contrasts.find(contrast => contrast.hpBandId === "25");
  lines.push(
    "",
    "## Fixed #1151 composition × entry-resource reuse",
    "",
    "| Entry HP | High-risk fight clear | Low-risk fight clear | Low − high | High-risk immediate-flee selection→survival | Low-risk immediate-flee selection→survival |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    ...[hp100Fight, hp25Fight].filter(Boolean).map(row =>
      `| ${row.hpBandId}% | ${formatRate(row.highRiskFightClearRate)} | ${formatRate(row.lowRiskFightClearRate)} | ` +
      `${formatRate(row.lowMinusHighFightClearRate)} | ${formatRate(row.highRiskImmediateFleeSelectionToSurvivalRate)} | ` +
      `${formatRate(row.lowRiskImmediateFleeSelectionToSurvivalRate)} |`
    ),
    "",
    "## Decision boundary",
    "",
    "- This report separates measured early exposure, composition/resource sensitivity, action opportunity, and flee execution; it does not select a production value.",
    "- If early pair suppression moves death-before-action and early survival together while reward opportunity remains reachable, the next production Issue is early encounter composition cadence, not a global enemy nerf or 2-enemy ban.",
    "- If fixed high/low pair differences persist at matched entry HP, composition pool/order is a separate follow-up; if HP bands dominate, prioritize between-fight resource/recovery diagnosis.",
    "- Fight/flee uses the production resolver, including preemption and parting attacks. A flee result is not treated as free safety.",
    "",
    "## Provenance and limits",
    "",
    `- production paths: ${measurement.productionPaths.join(", ")}`,
    `- environment hash: \`${measurement.environmentHash}\``,
    "- raw JSON and manifests are measurement artifacts; no raw dumps are committed by the runner."
  );
  return `${lines.join("\n")}\n`;
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
  const result = await runEarlyEncounterCauseDiagnostic({
    runs,
    seed,
    fixedRuns,
    fixedSeed
  });
  const report = buildReport(result, provenance, options);
  fs.writeFileSync(resolve(options.output), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(resolve(options.summary), buildSummary(report));
  fs.writeFileSync(resolve(options.manifest), `${JSON.stringify({
    schemaVersion: report.schemaVersion,
    status: "success",
    runner: report.runnerVersion,
    source: report.measurement,
    configuration: report.configuration,
    policyIds: EARLY_COMPOSITION_POLICY_IDS,
    purpose: options.purpose || null,
    workflow: {
      repository: process.env.MEASUREMENT_REPOSITORY || null,
      runId: process.env.MEASUREMENT_WORKFLOW_RUN_ID || null,
      runUrl: process.env.MEASUREMENT_WORKFLOW_RUN_URL || null,
      requestedRef: options.ref || process.env.MEASUREMENT_REQUESTED_REF || null,
      generatedAt: new Date().toISOString()
    }
  }, null, 2)}\n`);
  console.log(`Wrote Issue #1187 diagnostic: ${resolve(options.output)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
