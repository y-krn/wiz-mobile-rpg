// sim-scope: run — production-backed B1F starting-kit survival diagnostic
/* global console, process */

import "../simulations/simulation_preflight.js";
import fs from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { requireRunnerProvenance } from "./measurement_provenance.js";
import { printEnvSignatureBanner, readSimScopeDeclaration } from "./measurement_env_signature.js";

export const RUNNER_VERSION = "issue1141-flee-entry-diagnostics-v1";
export const SCHEMA_VERSION = 2;
export const STARTING_KIT_IDS = Object.freeze(["vanguard", "scout", "devotion", "arcana"]);
export const POLICY_IDS = Object.freeze(["fight", "flee-threshold"]);
export const DEFAULT_RUNS = 1000;
export const DEFAULT_SEED = 1139;
export const DEFAULT_FLEE_HP_THRESHOLD = 0.20;

const RUNNER_PATH = "scratch/measurements/issue1139_starting_kit_diagnostic.js";
const PRODUCTION_PATHS = Object.freeze([
  "scratch/simulations/sim_depth_material_ev.js",
  "src/state/initial_state.js",
  "src/data/encounters.js",
  "src/combat_ui/encounter.js",
  "src/combat_logic/round.js",
  "src/combat_logic/monster_traits.js",
  "src/combat_logic/targeting.js",
  "src/combat_logic/damage.js"
]);

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const [key, inlineValue] = arg.slice(2).split("=", 2);
    const value = inlineValue ?? argv[++index];
    options[key] = value;
  }
  return options;
}

const CLI_OPTIONS = parseArgs(process.argv.slice(2));
process.env.SIM_SEED = String(CLI_OPTIONS.seed ?? DEFAULT_SEED);

const {
  simulateRun,
  resetSimulationRandom
} = await import("../simulations/sim_depth_material_ev.js");

function assertOneOf(value, values, label) {
  if (!values.includes(value)) throw new Error(`${label} must be ${values.join("|")}: ${value}`);
}

function parsePositiveInteger(value, label, { minimum = 1 } = {}) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum) {
    throw new Error(`${label} must be an integer >= ${minimum}: ${value}`);
  }
  return parsed;
}

function parseRate(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`${label} must be a number in [0,1]: ${value}`);
  }
  return parsed;
}

function baseMonsterName(name) {
  return String(name).replace(/\s[A-Z]$/, "");
}

function compositionKey(names) {
  return names.map(baseMonsterName).sort().join(" + ");
}

function increment(map, key, amount = 1) {
  map[key] = (map[key] || 0) + amount;
}

function createDistribution() {
  return { count: 0, values: [] };
}

function addDistribution(distribution, value) {
  if (Number.isFinite(value)) {
    distribution.count++;
    distribution.values.push(value);
  }
}

function finalizeDistribution(distribution) {
  const values = [...distribution.values].sort((left, right) => left - right);
  if (values.length === 0) {
    return { count: 0, average: null, p50: null, p95: null, min: null, max: null };
  }
  const percentile = rate => {
    const position = (values.length - 1) * rate;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    return lower === upper
      ? values[lower]
      : values[lower] + (values[upper] - values[lower]) * (position - lower);
  };
  return {
    count: values.length,
    average: values.reduce((sum, value) => sum + value, 0) / values.length,
    p50: percentile(0.50),
    p95: percentile(0.95),
    min: values[0],
    max: values.at(-1)
  };
}

function createCompositionRecord() {
  return {
    encounters: 0,
    runsWithEncounter: 0,
    deathRunsWithEncounter: 0,
    deaths: 0,
    outcomes: {},
    rounds: createDistribution(),
    damageReceived: createDistribution(),
    hpAfterCombat: createDistribution(),
    entryHpRate: createDistribution(),
    entryMpRate: createDistribution(),
    encounterOrdinal: createDistribution(),
    fleeSelected: 0,
    fleeExecuted: 0,
    fleeSelectedButNotExecuted: 0,
    fleePartingAttackCount: 0,
    fleeSurvived: 0,
    fleeDiedFromPartingAttack: 0,
    partingAttackDamage: createDistribution(),
    splitOnDeathTriggers: 0,
    splitOnDeathSpawned: 0,
    guardAdjacentTriggers: 0,
    guardedCount: 0
  };
}

function observeEncounter(record, identity, diagnostic, encounterRow) {
  record.encounters++;
  increment(record.outcomes, identity.outcome || "unknown");
  addDistribution(record.rounds, identity.rounds);
  addDistribution(record.damageReceived, identity.totalNormalDamage);
  addDistribution(record.hpAfterCombat, identity.hpAfter);
  addDistribution(record.entryHpRate, encounterRow.hpRateBeforeEncounter);
  addDistribution(record.entryMpRate, encounterRow.mpRateBeforeEncounter);
  addDistribution(record.encounterOrdinal, encounterRow.encounterOrdinal);

  const logs = (diagnostic?.rounds || []).flatMap(round => round.log || []);
  const fleeRounds = diagnostic?.rounds || [];
  const fleeSelected = fleeRounds.filter(round => round.fleeSelected === true).length;
  const fleeExecuted = fleeRounds.filter(round => round.fleeExecuted === true).length;
  const fleePartingAttackCount = fleeRounds.filter(round => round.fleePartingAttack === true).length;
  record.fleeSelected += fleeSelected;
  record.fleeExecuted += fleeExecuted;
  record.fleeSelectedButNotExecuted += Math.max(0, fleeSelected - fleeExecuted);
  record.fleePartingAttackCount += fleePartingAttackCount;
  record.fleeSurvived += Number(fleeExecuted > 0 && identity.outcome === "flee");
  record.fleeDiedFromPartingAttack += Number(
    fleeExecuted > 0 && fleePartingAttackCount > 0 && identity.outcome === "death"
  );
  logs.forEach(message => {
    if (message.includes("庇った！")) {
      record.guardAdjacentTriggers++;
      record.guardedCount++;
    }
    const splitMatch = message.match(/(\d+)体に分裂/);
    if (splitMatch) {
      record.splitOnDeathTriggers++;
      record.splitOnDeathSpawned += Number(splitMatch[1]);
    }
    const partingMatch = message.match(/追撃！.*?(\d+)のダメージ/);
    if (partingMatch) addDistribution(record.partingAttackDamage, Number(partingMatch[1]));
  });
}

function finalizeCompositionRecord(record, runs, totalEncounters, totalDeaths) {
  const encounters = Math.max(1, record.encounters);
  return {
    encounters: record.encounters,
    encounterRatePerRun: record.encounters / runs,
    encounterShare: totalEncounters > 0 ? record.encounters / totalEncounters : 0,
    runsWithEncounter: record.runsWithEncounter,
    runExposureRate: record.runsWithEncounter / runs,
    deathRunsWithEncounter: record.deathRunsWithEncounter,
    deaths: record.deaths,
    conditionalDeathRate: record.runsWithEncounter > 0
      ? record.deathRunsWithEncounter / record.runsWithEncounter
      : null,
    encounterLethalityRate: record.encounters > 0 ? record.deaths / encounters : null,
    deathContributionRate: totalDeaths > 0 ? record.deaths / totalDeaths : 0,
    outcomes: { ...record.outcomes },
    averageRoundsPerEncounter: record.rounds.count > 0
      ? record.rounds.values.reduce((sum, value) => sum + value, 0) / record.rounds.count
      : null,
    rounds: finalizeDistribution(record.rounds),
    damageReceived: finalizeDistribution(record.damageReceived),
    hpAfterCombat: finalizeDistribution(record.hpAfterCombat),
    entryHpRate: finalizeDistribution(record.entryHpRate),
    entryMpRate: finalizeDistribution(record.entryMpRate),
    encounterOrdinal: finalizeDistribution(record.encounterOrdinal),
    fleeSelected: record.fleeSelected,
    fleeExecuted: record.fleeExecuted,
    fleeSelectedButNotExecuted: record.fleeSelectedButNotExecuted,
    fleePartingAttackCount: record.fleePartingAttackCount,
    fleeSurvived: record.fleeSurvived,
    fleeDiedFromPartingAttack: record.fleeDiedFromPartingAttack,
    fleeSurvivalRate: record.fleeExecuted > 0 ? record.fleeSurvived / record.fleeExecuted : null,
    partingAttackDamage: finalizeDistribution(record.partingAttackDamage),
    splitOnDeath: {
      triggers: record.splitOnDeathTriggers,
      spawnedCount: record.splitOnDeathSpawned
    },
    guardAdjacent: {
      triggers: record.guardAdjacentTriggers,
      guardedCount: record.guardedCount
    }
  };
}

function createAggregate(runs) {
  return {
    runs,
    outcomes: {},
    deaths: 0,
    b2Arrivals: 0,
    deepestFloor: createDistribution(),
    steps: createDistribution(),
    combatCount: createDistribution(),
    encounterCount: 0,
    fleeSelected: 0,
    fleeExecuted: 0,
    fleeSelectedButNotExecuted: 0,
    fleePartingAttackCount: 0,
    fleeSurvived: 0,
    fleeDiedFromPartingAttack: 0,
    rounds: createDistribution(),
    damageReceived: createDistribution(),
    hpAfterCombat: createDistribution(),
    partingAttackDamage: createDistribution(),
    splitOnDeathTriggers: 0,
    splitOnDeathSpawned: 0,
    guardAdjacentTriggers: 0,
    guardedCount: 0,
    deathCauses: {},
    compositions: {},
    enemies: {},
    encounterRows: []
  };
}

function createEncounterRow(runIndex, encounterOrdinal, identity, diagnostic) {
  const enemyNames = (identity.enemyNames || []).map(baseMonsterName);
  const hpBeforeEncounter = diagnostic?.startHp ?? identity.hpBefore ?? null;
  const maxHpBeforeEncounter = diagnostic?.startMaxHp ?? null;
  const mpBeforeEncounter = diagnostic?.startMp ?? identity.mpBefore ?? null;
  const maxMpBeforeEncounter = diagnostic?.startMaxMp ?? null;
  const hpRateBeforeEncounter = Number.isFinite(hpBeforeEncounter) && Number.isFinite(maxHpBeforeEncounter)
    ? hpBeforeEncounter / Math.max(1, maxHpBeforeEncounter)
    : null;
  const mpRateBeforeEncounter = Number.isFinite(mpBeforeEncounter) && Number.isFinite(maxMpBeforeEncounter)
    ? mpBeforeEncounter / Math.max(1, maxMpBeforeEncounter)
    : null;
  const rounds = diagnostic?.rounds || [];
  const fleeSelected = rounds.filter(round => round.fleeSelected === true).length;
  const fleeExecuted = rounds.filter(round => round.fleeExecuted === true).length;
  const fleePartingAttackCount = rounds.filter(round => round.fleePartingAttack === true).length;
  return {
    runIndex,
    encounterOrdinal,
    floor: identity.floor ?? diagnostic?.floor ?? null,
    type: identity.type ?? diagnostic?.type ?? null,
    initialCompositionKey: compositionKey(identity.enemyNames || []),
    initialCompositionEnemyNames: enemyNames,
    outcome: identity.outcome || diagnostic?.result || "unknown",
    hpBeforeEncounter,
    maxHpBeforeEncounter,
    hpRateBeforeEncounter,
    mpBeforeEncounter,
    maxMpBeforeEncounter,
    mpRateBeforeEncounter,
    fleeSelected,
    fleeExecuted,
    fleeSelectedButNotExecuted: Math.max(0, fleeSelected - fleeExecuted),
    fleePartingAttackCount,
    fleeSurvived: Number(fleeExecuted > 0 && identity.outcome === "flee"),
    fleeDiedFromPartingAttack: Number(
      fleeExecuted > 0 && fleePartingAttackCount > 0 && identity.outcome === "death"
    )
  };
}

function observeRun(aggregate, result, runIndex) {
  increment(aggregate.outcomes, result.outcome || "unknown");
  aggregate.deaths += Number(result.outcome === "death");
  aggregate.b2Arrivals += Number(result.reachedFloor >= 2);
  addDistribution(aggregate.deepestFloor, result.reachedFloor);
  addDistribution(aggregate.steps, result.steps);
  const encounters = result.encounterIdentityLog || [];
  addDistribution(aggregate.combatCount, encounters.length);
  aggregate.encounterCount += encounters.length;

  const diagnostics = result.diagnostics?.encounters || [];
  const diagnosticsByOrdinal = new Map(diagnostics.map((diagnostic, index) => [index, diagnostic]));
  const runCompositionKeys = new Set();
  const runEnemyNames = new Set();
  encounters.forEach((identity, index) => {
    const key = compositionKey(identity.enemyNames || []);
    const composition = aggregate.compositions[key] ||= createCompositionRecord();
    const diagnostic = diagnosticsByOrdinal.get(index);
    const encounterRow = createEncounterRow(runIndex, index + 1, identity, diagnostic);
    aggregate.encounterRows.push(encounterRow);
    runCompositionKeys.add(key);
    observeEncounter(composition, identity, diagnostic, encounterRow);
    if (identity.outcome === "death") {
      composition.deaths++;
    }

    const enemyNames = new Set((identity.enemyNames || []).map(baseMonsterName));
    enemyNames.forEach(enemy => {
      runEnemyNames.add(enemy);
      const enemyRecord = aggregate.enemies[enemy] ||= createCompositionRecord();
      observeEncounter(enemyRecord, identity, diagnostic, encounterRow);
      if (identity.outcome === "death") enemyRecord.deaths++;
    });
    aggregate.fleeSelected += encounterRow.fleeSelected;
    aggregate.fleeExecuted += encounterRow.fleeExecuted;
    aggregate.fleeSelectedButNotExecuted += encounterRow.fleeSelectedButNotExecuted;
    aggregate.fleePartingAttackCount += encounterRow.fleePartingAttackCount;
    aggregate.fleeSurvived += encounterRow.fleeSurvived;
    aggregate.fleeDiedFromPartingAttack += encounterRow.fleeDiedFromPartingAttack;
    addDistribution(aggregate.rounds, identity.rounds);
    addDistribution(aggregate.damageReceived, identity.totalNormalDamage);
    addDistribution(aggregate.hpAfterCombat, identity.hpAfter);
    (diagnostic?.rounds || []).flatMap(round => round.log || []).forEach(message => {
      const partingMatch = message.match(/追撃！.*?(\d+)のダメージ/);
      if (partingMatch) addDistribution(aggregate.partingAttackDamage, Number(partingMatch[1]));
      const splitMatch = message.match(/(\d+)体に分裂/);
      if (splitMatch) {
        aggregate.splitOnDeathTriggers++;
        aggregate.splitOnDeathSpawned += Number(splitMatch[1]);
      }
      if (message.includes("庇った！")) {
        aggregate.guardAdjacentTriggers++;
        aggregate.guardedCount++;
      }
    });
  });
  runCompositionKeys.forEach(key => {
    aggregate.compositions[key].runsWithEncounter++;
    if (result.outcome === "death") aggregate.compositions[key].deathRunsWithEncounter++;
  });
  runEnemyNames.forEach(enemy => {
    // Enemy records are encounter-level records. Count a run as exposed once
    // per run even when a composition contains a duplicate enemy.
    aggregate.enemies[enemy].runsWithEncounter++;
    if (result.outcome === "death") aggregate.enemies[enemy].deathRunsWithEncounter++;
  });
  if (result.outcome === "death") {
    increment(aggregate.deathCauses, result.runDiagnostics?.deathCauseCategory || "unknown");
  }
}

function finalizeAggregate(aggregate, configuration) {
  const totalDeaths = aggregate.deaths;
  const finalizeRecords = records => Object.fromEntries(
    Object.entries(records)
      .sort(([left], [right]) => left.localeCompare(right, "ja"))
      .map(([key, record]) => [
        key,
        finalizeCompositionRecord(record, aggregate.runs, aggregate.encounterCount, totalDeaths)
      ])
  );
  return {
    runs: aggregate.runs,
    runOutcome: {
      outcomes: { ...aggregate.outcomes },
      b1DeathRate: totalDeaths / aggregate.runs,
      b2ArrivalRate: aggregate.b2Arrivals / aggregate.runs,
      b1BreakthroughRate: aggregate.b2Arrivals / aggregate.runs,
      fleeSurvivalRate: aggregate.fleeExecuted > 0
        ? aggregate.fleeSurvived / aggregate.fleeExecuted
        : null,
      fleeSelected: aggregate.fleeSelected,
      fleeExecuted: aggregate.fleeExecuted,
      fleeSelectedButNotExecuted: aggregate.fleeSelectedButNotExecuted,
      fleePartingAttackCount: aggregate.fleePartingAttackCount,
      fleeSurvived: aggregate.fleeSurvived,
      fleeDiedFromPartingAttack: aggregate.fleeDiedFromPartingAttack,
      averageDeepestFloor: aggregate.deepestFloor.values.reduce((sum, value) => sum + value, 0) / aggregate.runs,
      averageSteps: aggregate.steps.values.reduce((sum, value) => sum + value, 0) / aggregate.runs,
      averageCombatCount: aggregate.combatCount.values.reduce((sum, value) => sum + value, 0) / aggregate.runs
    },
    encounterExposure: {
      enemyEncounterCount: aggregate.encounterCount,
      enemyEncounterRatePerRun: aggregate.encounterCount / aggregate.runs,
      compositionCount: Object.keys(aggregate.compositions).length,
      encounterRows: aggregate.encounterRows,
      byEnemy: finalizeRecords(aggregate.enemies),
      byComposition: finalizeRecords(aggregate.compositions)
    },
    deathContribution: {
      totalDeaths,
      causeDistribution: Object.fromEntries(Object.entries(aggregate.deathCauses).map(([key, count]) => [
        key,
        { count, rate: totalDeaths > 0 ? count / totalDeaths : 0 }
      ])),
      byEnemy: Object.fromEntries(Object.entries(finalizeRecords(aggregate.enemies)).map(([key, record]) => [key, {
        deaths: record.deaths,
        conditionalDeathRate: record.conditionalDeathRate,
        encounterLethalityRate: record.encounterLethalityRate,
        deathContributionRate: record.deathContributionRate
      }])),
      byComposition: Object.fromEntries(Object.entries(finalizeRecords(aggregate.compositions)).map(([key, record]) => [key, {
        deaths: record.deaths,
        conditionalDeathRate: record.conditionalDeathRate,
        encounterLethalityRate: record.encounterLethalityRate,
        deathContributionRate: record.deathContributionRate
      }]))
    },
    combatCost: {
      rounds: finalizeDistribution(aggregate.rounds),
      damageReceived: finalizeDistribution(aggregate.damageReceived),
      hpAfterCombat: finalizeDistribution(aggregate.hpAfterCombat),
      fleeSelected: aggregate.fleeSelected,
      fleeExecuted: aggregate.fleeExecuted,
      fleeSelectedButNotExecuted: aggregate.fleeSelectedButNotExecuted,
      fleePartingAttackCount: aggregate.fleePartingAttackCount,
      fleeSurvived: aggregate.fleeSurvived,
      fleeDiedFromPartingAttack: aggregate.fleeDiedFromPartingAttack,
      fleeSurvivalRate: aggregate.fleeExecuted > 0
        ? aggregate.fleeSurvived / aggregate.fleeExecuted
        : null,
      fleePartingAttackDamage: finalizeDistribution(aggregate.partingAttackDamage),
      splitOnDeath: {
        triggers: aggregate.splitOnDeathTriggers,
        spawnedCount: aggregate.splitOnDeathSpawned
      },
      guardAdjacent: {
        triggers: aggregate.guardAdjacentTriggers,
        guardedCount: aggregate.guardedCount
      }
    },
    configuration
  };
}

export function createDiagnosticScenario({ startingKit, policy, fleeHpThreshold }) {
  assertOneOf(startingKit, STARTING_KIT_IDS, "startingKit");
  assertOneOf(policy, POLICY_IDS, "policy");
  const threshold = parseRate(fleeHpThreshold, "fleeHpThreshold");
  return {
    startingKit,
    startingHealPotions: 0,
    startingGreaterHeals: 0,
    startingManaPotions: 0,
    startingHolyWater: 0,
    startingAntidotes: 0,
    startingGuardPotions: 0,
    departureCraft: [],
    ignoreWorkshopReturnItems: true,
    useTownPortal: false,
    allowChestTownPortal: false,
    collectEncounterIdentities: true,
    simDiagnosticLevel: "full",
    fleePolicy: policy === "fight" ? "never" : "threshold",
    fleeHpThreshold: policy === "fight" ? null : threshold,
    consumablesAtDeparture: "none"
  };
}

export async function runDiagnostic({
  startingKit = "vanguard",
  policy = "fight",
  fleeHpThreshold = DEFAULT_FLEE_HP_THRESHOLD,
  runs = DEFAULT_RUNS,
  seed = DEFAULT_SEED,
  allowSmallRunCount = false
} = {}) {
  const normalizedRuns = parsePositiveInteger(runs, "runs", { minimum: allowSmallRunCount ? 1 : DEFAULT_RUNS });
  const normalizedSeed = parsePositiveInteger(seed, "seed");
  resetSimulationRandom(normalizedSeed);
  const scenario = createDiagnosticScenario({ startingKit, policy, fleeHpThreshold });
  const aggregate = createAggregate(normalizedRuns);
  for (let runIndex = 0; runIndex < normalizedRuns; runIndex++) {
    const result = simulateRun({
      className: "Fighter",
      startFloor: 1,
      targetDepth: 2,
      runIndex,
      seriesId: `issue-1139:${startingKit}:${policy}`,
      scoringProfile: null,
      scenario,
      workshop: { ranks: {} },
      worldSeed: `issue-1139:${normalizedSeed}:${startingKit}:${policy}:${runIndex}`,
      collectDiagnostics: true
    });
    observeRun(aggregate, result, runIndex);
  }
  const configuration = {
    startingKit,
    policy,
    fleeHpThreshold: scenario.fleeHpThreshold,
    floorStart: 1,
    targetFloor: 2,
    consumablesAtDeparture: "none",
    enemyPool: "production",
    encounterRate: "production",
    encounterComposition: "production",
    combatResolver: "production",
    combatActionPolicy: "production-auto",
    targetPolicy: "production-auto",
    fleeResolver: "production",
    seed: normalizedSeed,
    seedPolicy: "simulation RNG reset to seed before run; deterministic worldSeed per run",
    runs: normalizedRuns
  };
  return finalizeAggregate(aggregate, configuration);
}

function buildReport({ result, startingKit, policy, fleeHpThreshold, runs, seed, provenance, purpose, requestedRef }) {
  const scope = readSimScopeDeclaration(import.meta.url)?.name || "run";
  const environment = {
    scope,
    runnerVersion: RUNNER_VERSION,
    schemaVersion: SCHEMA_VERSION,
    node: process.version,
    seed,
    runs,
    startingKit,
    policy,
    fleeHpThreshold
  };
  const envHash = printEnvSignatureBanner(environment, { label: "issue1139" });
  return {
    schemaVersion: SCHEMA_VERSION,
    runnerVersion: RUNNER_VERSION,
    measurement: {
      scope,
      purpose: purpose || null,
      requestedRef: requestedRef || null,
      sourceCommit: provenance?.sourceCommit || null,
      gameplaySourceCommit: provenance?.gameplaySourceCommit || null,
      measurementRunnerCommit: provenance?.measurementRunnerCommit || null,
      measurementRunnerPaths: provenance?.measurementRunnerPaths || [RUNNER_PATH, ...PRODUCTION_PATHS],
      measurementRunnerDiffSha256: provenance?.measurementRunnerDiffSha256 || null,
      originMainAncestor: provenance?.originMainAncestor ?? null,
      staleTreeAllowed: provenance?.staleTreeAllowed ?? null,
      workingTreeClean: provenance?.workingTreeClean ?? null,
      productionPaths: [...PRODUCTION_PATHS],
      environmentHash: envHash
    },
    result
  };
}

function buildSummary(report) {
  const { measurement, result } = report;
  const outcome = result.runOutcome;
  const topDeaths = Object.entries(result.deathContribution.byComposition)
    .filter(([, value]) => value.deaths > 0)
    .sort(([, left], [, right]) => right.deathContributionRate - left.deathContributionRate)
    .slice(0, 10);
  return [
    "# Starting kit early-run diagnostic",
    "",
    `- runner: \`${report.runnerVersion}\` / schema: ${report.schemaVersion}`,
    `- source SHA: \`${measurement.sourceCommit || "not recorded"}\``,
    `- kit / policy / N: \`${result.configuration.startingKit}\` / \`${result.configuration.policy}\` / ${result.configuration.runs}`,
    `- seed: ${result.configuration.seed}; consumables at departure: none`,
    "",
    "## Run outcome",
    "",
    `- B1F death rate: ${(outcome.b1DeathRate * 100).toFixed(2)}%`,
    `- B2 arrival / B1 breakthrough: ${(outcome.b2ArrivalRate * 100).toFixed(2)}%`,
    `- flee selected / executed / selected-but-not-executed: ${outcome.fleeSelected} / ${outcome.fleeExecuted} / ${outcome.fleeSelectedButNotExecuted}`,
    `- flee survived / died from parting attack: ${outcome.fleeSurvived} / ${outcome.fleeDiedFromPartingAttack}; execution survival: ${outcome.fleeSurvivalRate === null ? "unobserved" : `${(outcome.fleeSurvivalRate * 100).toFixed(2)}%`}`,
    `- average deepest floor / steps / combat count: ${outcome.averageDeepestFloor.toFixed(3)} / ${outcome.averageSteps.toFixed(2)} / ${outcome.averageCombatCount.toFixed(2)}`,
    "",
    "## Death contribution candidates",
    "",
    topDeaths.length === 0
      ? "- no B1F deaths observed"
      : topDeaths.map(([key, value]) => `- ${key}: ${value.deaths} deaths; conditional death (exposed run) ${(value.conditionalDeathRate * 100).toFixed(2)}%; encounter lethality ${(value.encounterLethalityRate * 100).toFixed(2)}%; contribution ${(value.deathContributionRate * 100).toFixed(2)}%`),
    "",
    "## Production fidelity",
    "",
    `- enemy encounters: ${result.encounterExposure.enemyEncounterCount} (${result.encounterExposure.enemyEncounterRatePerRun.toFixed(3)} per run)`,
    "- enemy pool, encounter rate, composition generation, combat, flee, split, and guard behavior are delegated to the production-backed simulator",
    "- report is diagnostic evidence only; no balance values are tuned",
    "",
    "## Provenance",
    "",
    `- production paths: ${measurement.productionPaths.join(", ")}`,
    `- environment hash: \`${measurement.environmentHash}\``
  ].flat().join("\n") + "\n";
}

function buildManifest(report, options) {
  return {
    schemaVersion: report.schemaVersion,
    status: "success",
    runner: report.runnerVersion,
    source: report.measurement,
    configuration: report.result.configuration,
    purpose: options.purpose || null,
    workflow: {
      repository: process.env.MEASUREMENT_REPOSITORY || null,
      runId: process.env.MEASUREMENT_WORKFLOW_RUN_ID || null,
      runUrl: process.env.MEASUREMENT_WORKFLOW_RUN_URL || null,
      requestedRef: options.requestedRef || process.env.MEASUREMENT_REQUESTED_REF || null,
      generatedAt: new Date().toISOString()
    }
  };
}

async function main() {
  const startingKit = CLI_OPTIONS["starting-kit"] || "vanguard";
  const policy = CLI_OPTIONS.policy || "fight";
  const runs = parsePositiveInteger(CLI_OPTIONS.runs || DEFAULT_RUNS, "runs", { minimum: DEFAULT_RUNS });
  const seed = parsePositiveInteger(CLI_OPTIONS.seed || DEFAULT_SEED, "seed");
  const fleeHpThreshold = parseRate(CLI_OPTIONS["flee-hp-threshold"] || DEFAULT_FLEE_HP_THRESHOLD, "fleeHpThreshold");
  const output = CLI_OPTIONS.output;
  const summary = CLI_OPTIONS.summary;
  const manifest = CLI_OPTIONS.manifest;
  if (!output || !summary || !manifest) {
    throw new Error("--output, --summary, and --manifest are required");
  }
  assertOneOf(startingKit, STARTING_KIT_IDS, "startingKit");
  assertOneOf(policy, POLICY_IDS, "policy");
  const provenance = requireRunnerProvenance({
    fetchOriginMain: false,
    measurementRunnerPaths: [RUNNER_PATH, ...PRODUCTION_PATHS]
  });
  const result = await runDiagnostic({ startingKit, policy, fleeHpThreshold, runs, seed });
  const report = buildReport({
    result,
    startingKit,
    policy,
    fleeHpThreshold,
    runs,
    seed,
    provenance,
    purpose: CLI_OPTIONS.purpose,
    requestedRef: CLI_OPTIONS.ref
  });
  fs.writeFileSync(resolve(output), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(resolve(summary), buildSummary(report));
  fs.writeFileSync(resolve(manifest), `${JSON.stringify(buildManifest(report, {
    purpose: CLI_OPTIONS.purpose,
    requestedRef: CLI_OPTIONS.ref
  }), null, 2)}\n`);
  console.log(`Wrote Issue #1141 diagnostic: ${resolve(output)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
