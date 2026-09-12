// sim-scope: run — production-backed shared ordinary enemy action-slot probe
/* global console, process */

import "../simulations/simulation_preflight.js";
import fs from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { requireRunnerProvenance } from "./measurement_provenance.js";
import { printEnvSignatureBanner, readSimScopeDeclaration } from "./measurement_env_signature.js";
import { deriveFirstKillWindow } from "./first_kill_observation.js";
import { BUILD_FIXTURE_IDS } from "./build_fixtures.js";
import { getEncounterDefinitions } from "./build_sensitivity_measurement.js";

export const RUNNER_VERSION = "issue1214-shared-enemy-action-slot-v1";
export const SCHEMA_VERSION = 1;
export const DEFAULT_RUNS = 1000;
export const DEFAULT_DEEP_RUNS = 100;
export const DEFAULT_SEED = "1214-shared-slot";
export const PRIMARY_DEPTH = 2;
export const DEEP_DEPTHS = Object.freeze([8, 18, 30]);
export const POPULATIONS = Object.freeze(["fight", "visible-multi-enemy-flee"]);
export const CONDITIONS = Object.freeze([
  Object.freeze({ id: "C0_baseline", label: "pre-change production semantics", policy: { productionSharedNormalEnemyActionSlot: false, measurementDisableSharedNormalEnemyActionSlot: true } }),
  Object.freeze({ id: "C1_total_enemy_action_cap", label: "existing upper-bound total enemy-turn cap", policy: { productionSharedNormalEnemyActionSlot: false, measurementDisableSharedNormalEnemyActionSlot: true, measurementMaxEnemyActionsPerRound: 1 } }),
  Object.freeze({ id: "C2_shared_normal_enemy_action_slot", label: "production shared ordinary slot; selected actor may keep trait extra", policy: { productionSharedNormalEnemyActionSlot: true, measurementSharedNormalEnemyActionSlot: true } })
]);

const RUNNER_PATH = "scratch/measurements/shared_enemy_action_slot_measurement.js";
const PRODUCTION_PATHS = Object.freeze([
  "scratch/simulations/sim_depth_material_ev.js",
  "src/combat_logic/round.js",
  "src/combat_logic/monster_traits.js",
  "src/combat_ui/combat_start.js",
  "src/combat_ui/encounter.js",
  "src/data/monsters.js",
  "src/data/encounters.js"
]);

const { simulateRun } = await import("../simulations/sim_depth_material_ev.js");

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
  if (!Number.isInteger(parsed) || parsed < minimum) throw new Error(`${label} must be an integer >= ${minimum}: ${value}`);
  return parsed;
}

function distribution() { return []; }
function add(values, value) { if (Number.isFinite(value)) values.push(value); }
function rate(count, denominator) { return denominator > 0 ? count / denominator : null; }

function percentile(sorted, fraction) {
  if (sorted.length === 0) return null;
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return lower === upper ? sorted[lower] : sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function summarize(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  return {
    count: sorted.length,
    average: sorted.length ? sorted.reduce((sum, value) => sum + value, 0) / sorted.length : null,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    min: sorted[0] ?? null,
    max: sorted.at(-1) ?? null
  };
}

function increment(map, key, amount = 1) {
  if (!key) return;
  map[key] = (map[key] || 0) + amount;
}

function createEncounterAggregate() {
  return {
    encounters: 0, singles: 0, pairs: 0,
    enemyActions: distribution(), singleEnemyActions: distribution(), pairEnemyActions: distribution(),
    preFirstKillEnemyActions: distribution(), singlePreFirstKillEnemyActions: distribution(), pairPreFirstKillEnemyActions: distribution(),
    postFirstKillEnemyActions: distribution(), playerActionsBeforeFirstKill: distribution(),
    firstKillRounds: distribution(), normalDamage: distribution(), entryHp: distribution(),
    postCombatHp: distribution(), outcomes: {}, compositions: {}, extraActionCount: 0, traitFirings: {}
  };
}

function finalizeEncounterAggregate(value) {
  return {
    encounters: value.encounters,
    singleRate: rate(value.singles, value.encounters),
    pairRate: rate(value.pairs, value.encounters),
    enemyActions: summarize(value.enemyActions),
    singleEnemyActions: summarize(value.singleEnemyActions),
    pairEnemyActions: summarize(value.pairEnemyActions),
    preFirstKillEnemyActions: summarize(value.preFirstKillEnemyActions),
    singlePreFirstKillEnemyActions: summarize(value.singlePreFirstKillEnemyActions),
    pairPreFirstKillEnemyActions: summarize(value.pairPreFirstKillEnemyActions),
    postFirstKillEnemyActions: summarize(value.postFirstKillEnemyActions),
    playerActionsBeforeFirstKill: summarize(value.playerActionsBeforeFirstKill),
    firstKillRounds: summarize(value.firstKillRounds),
    normalDamage: summarize(value.normalDamage),
    entryHp: summarize(value.entryHp),
    postCombatHp: summarize(value.postCombatHp),
    outcomes: { ...value.outcomes },
    compositions: Object.fromEntries(Object.entries(value.compositions).sort((left, right) => right[1] - left[1])),
    extraActionCount: value.extraActionCount,
    traitFirings: { ...value.traitFirings }
  };
}

function createCaseAggregate() {
  return {
    runs: 0, deaths: 0, reachedTarget: 0, meaningfulRewardRuns: 0, buildOpportunityRuns: 0,
    encountersByOrdinal: { 1: createEncounterAggregate(), 2: createEncounterAggregate() },
    flee: { selected: 0, executed: 0, preempted: 0, survived: 0, partingAttackDeaths: 0 }
  };
}

function observeEncounter(target, identity, diagnostic) {
  if (!identity || !diagnostic || diagnostic.type !== "normal") return;
  const enemyCount = Number(diagnostic.initialVisibleEnemyCount || identity.enemyNames?.length || 0);
  const window = deriveFirstKillWindow({ identity, diagnostic });
  target.encounters++;
  target.singles += Number(enemyCount === 1);
  target.pairs += Number(enemyCount >= 2);
  add(target.enemyActions, identity.enemyActions);
  add(enemyCount === 1 ? target.singleEnemyActions : target.pairEnemyActions, identity.enemyActions);
  add(target.normalDamage, identity.totalNormalDamage);
  add(target.entryHp, identity.hpBeforeRatio);
  add(target.postCombatHp, identity.hpAfterRatio);
  increment(target.outcomes, identity.outcome);
  increment(target.compositions, [...(identity.enemyNames || [])].sort().join(" + "));
  add(target.preFirstKillEnemyActions, window.enemyActionsBeforeFirstKill);
  add(enemyCount === 1 ? target.singlePreFirstKillEnemyActions : target.pairPreFirstKillEnemyActions, window.enemyActionsBeforeFirstKill);
  add(target.postFirstKillEnemyActions, window.enemyActionsAfterFirstKill);
  add(target.playerActionsBeforeFirstKill, window.playerActionsBeforeFirstKill);
  add(target.firstKillRounds, window.firstKillRound);
  target.extraActionCount += window.extraActionCount || 0;
  for (const round of diagnostic.rounds || []) {
    for (const event of round.enemyActionEvents || []) {
      for (const source of event.traitSources || []) increment(target.traitFirings, source);
    }
  }
}

function observeRun(target, result, targetDepth) {
  target.runs++;
  target.deaths += Number(result.died === true);
  target.reachedTarget += Number(result.reachedFloor >= targetDepth);
  const rewards = result.diagnostics?.rewardEvents || [];
  target.meaningfulRewardRuns += Number(rewards.some(reward => reward.meaningful === true));
  target.buildOpportunityRuns += Number(Number(result.equipmentFound) > 0 || rewards.some(reward => reward.category === "equipment"));
  const identities = (result.encounterIdentityLog || []).filter(identity => identity.type === "normal");
  const diagnostics = (result.diagnostics?.encounters || []).filter(diagnostic => diagnostic.type === "normal");
  for (let index = 0; index < Math.min(identities.length, diagnostics.length); index++) {
    const ordinal = index + 1;
    if (ordinal <= 2) observeEncounter(target.encountersByOrdinal[ordinal], identities[index], diagnostics[index]);
    for (const round of diagnostics[index].rounds || []) {
      target.flee.selected += Number(round.fleeSelected === true);
      target.flee.executed += Number(round.fleeExecuted === true);
      target.flee.preempted += Number(round.fleeSelected === true && round.fleeExecuted !== true);
      target.flee.survived += Number(round.fleeExecuted === true && result.died !== true);
      target.flee.partingAttackDeaths += Number(round.fleePartingAttack === true && result.died === true);
    }
  }
}

function finalizeCaseAggregate(value) {
  return {
    runs: value.runs,
    deathRate: rate(value.deaths, value.runs),
    targetReachRate: rate(value.reachedTarget, value.runs),
    meaningfulRewardReachRate: rate(value.meaningfulRewardRuns, value.runs),
    buildOpportunityReachRate: rate(value.buildOpportunityRuns, value.runs),
    byEncounterOrdinal: { 1: finalizeEncounterAggregate(value.encountersByOrdinal[1]), 2: finalizeEncounterAggregate(value.encountersByOrdinal[2]) },
    flee: {
      ...value.flee,
      executionRate: rate(value.flee.executed, value.flee.selected),
      selectionSurvivalRate: rate(value.flee.survived, value.flee.selected),
      executionSurvivalRate: rate(value.flee.survived, value.flee.executed)
    }
  };
}

function scenarioFor(condition, population, fixedMonsterNames = null) {
  return {
    startingKit: "vanguard", departureCraft: [], consumablesAtDeparture: "none",
    startingHealPotions: 0, startingGreaterHeals: 0, startingManaPotions: 0,
    startingHolyWater: 0, startingAntidotes: 0, startingGuardPotions: 0,
    ignoreWorkshopReturnItems: true, fleePolicy: population === "fight" ? "never" : population,
    collectEncounterIdentities: true, collectStage15Diagnostics: true, simDiagnosticLevel: "full",
    ...(fixedMonsterNames ? {
      fixedCombat: { monsterNames: [...fixedMonsterNames], entryHpRatio: 1, entryMpRatio: 1 }
    } : {}),
    ...condition.policy
  };
}

function runPopulation({ runs, seed, condition, population, startFloor = 1, targetDepth, fixtureId = null, fixedMonsterNames = null, series }) {
  const aggregate = createCaseAggregate();
  for (let runIndex = 0; runIndex < runs; runIndex++) {
    const result = simulateRun({
      ...(fixtureId ? { fixtureId } : { className: "Fighter" }),
      startFloor, targetDepth, runIndex, seriesId: series, scoringProfile: null,
      scenario: scenarioFor(condition, population, fixedMonsterNames), workshop: { ranks: {} },
      worldSeed: `issue1214:${seed}:${series}:${population}:${runIndex}`,
      collectDiagnostics: true, collectCombatFormula: false
    });
    observeRun(aggregate, result, targetDepth);
  }
  return finalizeCaseAggregate(aggregate);
}

export function runSharedEnemyActionSlotMeasurement({ runs = DEFAULT_RUNS, deepRuns = DEFAULT_DEEP_RUNS, seed = DEFAULT_SEED } = {}) {
  const primary = {};
  for (const condition of CONDITIONS) {
    primary[condition.id] = {};
    for (const population of POPULATIONS) {
      primary[condition.id][population] = runPopulation({ runs, seed, condition, population, targetDepth: PRIMARY_DEPTH, series: "primary" });
    }
  }
  const deep = {};
  const encounterDefinitions = getEncounterDefinitions();
  for (const depth of DEEP_DEPTHS) {
    deep[`B${depth}`] = {};
    for (const condition of CONDITIONS) {
      deep[`B${depth}`][condition.id] = {};
      for (const fixtureId of BUILD_FIXTURE_IDS) {
        deep[`B${depth}`][condition.id][fixtureId] = {};
        for (const encounter of encounterDefinitions) {
          deep[`B${depth}`][condition.id][fixtureId][encounter.id] = runPopulation({
            runs: deepRuns, seed, condition, population: "never", startFloor: depth, targetDepth: depth + 1,
            fixtureId, fixedMonsterNames: encounter.monsterNames,
            series: `deep:B${depth}:${fixtureId}:${encounter.id}`
          });
        }
      }
    }
  }
  return {
    configuration: {
      runs, deepRuns, seed, primaryDepth: PRIMARY_DEPTH, deepDepths: [...DEEP_DEPTHS],
      populations: [...POPULATIONS], buildFixtures: [...BUILD_FIXTURE_IDS],
      deepEncounterFixtures: getEncounterDefinitions().map(encounter => encounter.id),
      seedPolicy: "same world seed per condition × population × run index; deep cells add depth × fixture",
      candidateSemantics: "all living enemies roll initiative; earliest ordinary actor owns one shared ordinary slot; its trait extra remains attached; skipped turns do not bank"
    },
    conditions: CONDITIONS.map(({ id, label, policy }) => ({ id, label, policy })), primary, deep
  };
}

function buildReport(result, provenance, options) {
  return {
    schemaVersion: SCHEMA_VERSION, runnerVersion: RUNNER_VERSION,
    question: "Does an exact shared ordinary enemy action slot reduce pair actor exposure without flattening composition, traits, flee choice, rewards, or build sensitivity?",
    evidenceScope: "run",
    measurement: {
      scope: readSimScopeDeclaration(import.meta.url)?.name || "run", purpose: options.purpose || null,
      requestedRef: options.ref || null, sourceCommit: provenance?.sourceCommit || null,
      gameplaySourceCommit: provenance?.gameplaySourceCommit || null, measurementRunnerCommit: provenance?.measurementRunnerCommit || null,
      measurementRunnerPaths: provenance?.measurementRunnerPaths || [RUNNER_PATH, ...PRODUCTION_PATHS],
      measurementRunnerDiffSha256: provenance?.measurementRunnerDiffSha256 || null,
      originMainAncestor: provenance?.originMainAncestor ?? null, staleTreeAllowed: provenance?.staleTreeAllowed ?? null,
      workingTreeClean: provenance?.workingTreeClean ?? null, productionPaths: [...PRODUCTION_PATHS],
      environmentHash: printEnvSignatureBanner({ runnerVersion: RUNNER_VERSION, schemaVersion: SCHEMA_VERSION, seed: result.configuration.seed, runs: result.configuration.runs, deepRuns: result.configuration.deepRuns, conditions: result.conditions.map(condition => condition.id), depths: result.configuration.deepDepths, fixtures: result.configuration.buildFixtures }, { label: "issue1214 shared-slot env" })
    },
    ...result
  };
}

function format(value) { return value === null || value === undefined ? "—" : typeof value === "number" ? value.toFixed(3) : String(value); }

function buildSummary(report) {
  const lines = [
    "# Issue #1214 shared ordinary enemy action-slot measurement", "",
    `- runner: \`${report.runnerVersion}\` / schema ${report.schemaVersion}`,
    `- source SHA: \`${report.measurement.sourceCommit || "not recorded"}\`; origin/main ancestor: ${report.measurement.originMainAncestor}`,
    `- primary: fresh vanguard B1F→B2, N=${report.configuration.runs}, matched C0/C1/C2; flee is a separate population`,
    `- deep fixed-support regression: B8/B18/B30 × ${report.configuration.buildFixtures.length} build fixtures × ${report.configuration.deepEncounterFixtures.length} production compositions, N=${report.configuration.deepRuns} per cell`, "",
    "## Primary ordinal 1/2", "",
    "| Condition | Population | E1 single/pair | E1 enemy actions p50 | E1 pre-kill p50 | E2 pair enemy actions p50 | Death | Reward reach | Build opportunity |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"
  ];
  for (const condition of report.conditions) for (const population of POPULATIONS) {
    const value = report.primary[condition.id][population];
    const e1 = value.byEncounterOrdinal[1];
    const e2 = value.byEncounterOrdinal[2];
    lines.push(`| ${condition.id} | ${population} | ${format(e1.singleRate)} / ${format(e1.pairRate)} | ${format(e1.pairEnemyActions.p50)} | ${format(e1.pairPreFirstKillEnemyActions.p50)} | ${format(e2.pairEnemyActions.p50)} | ${format(value.deathRate)} | ${format(value.meaningfulRewardReachRate)} | ${format(value.buildOpportunityReachRate)} |`);
  }
  lines.push(
    "", "## Candidate fidelity checks", "",
    "- C1 is retained only as the historical upper-bound probe; it is not a production candidate.",
    "- C2 preserves encounter composition identity and initiative rolls; only ordinary enemy scheduling is changed.",
    "- C2 `multiAction` extra actions are attached to the selected ordinary-slot owner and reported separately.",
    "- Flee selected/executed/preempted/survival and meaningful reward/build opportunity are reported in the JSON record.",
    "", "## Reproduction", "",
    `node scratch/measurements/shared_enemy_action_slot_measurement.js --runs ${report.configuration.runs} --deep-runs ${report.configuration.deepRuns} --seed ${report.configuration.seed} --output <json> --summary <md> --manifest <json>`,
    "", "## Provenance", "", `- production paths: ${report.measurement.productionPaths.join(", ")}`, `- environment hash: \`${report.measurement.environmentHash}\``
  );
  return `${lines.join("\n")}\n`;
}

function buildManifest(report, options) {
  return {
    schemaVersion: report.schemaVersion, status: "success", runner: report.runnerVersion,
    source: report.measurement, configuration: report.configuration, conditions: report.conditions,
    purpose: options.purpose || null,
    workflow: { repository: process.env.MEASUREMENT_REPOSITORY || null, runId: process.env.MEASUREMENT_WORKFLOW_RUN_ID || null, runUrl: process.env.MEASUREMENT_WORKFLOW_RUN_URL || null, requestedRef: options.ref || process.env.MEASUREMENT_REQUESTED_REF || null, generatedAt: new Date().toISOString() }
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const runs = positiveInteger(options.runs || DEFAULT_RUNS, "runs", DEFAULT_RUNS);
  const deepRuns = positiveInteger(options["deep-runs"] || DEFAULT_DEEP_RUNS, "deep-runs");
  const seed = options.seed || DEFAULT_SEED;
  if (!options.output || !options.summary || !options.manifest) throw new Error("--output, --summary, and --manifest are required");
  const provenance = requireRunnerProvenance({ fetchOriginMain: false, measurementRunnerPaths: [RUNNER_PATH, ...PRODUCTION_PATHS] });
  const result = runSharedEnemyActionSlotMeasurement({ runs, deepRuns, seed });
  const report = buildReport(result, provenance, options);
  fs.writeFileSync(resolve(options.output), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(resolve(options.summary), buildSummary(report));
  fs.writeFileSync(resolve(options.manifest), `${JSON.stringify(buildManifest(report, options), null, 2)}\n`);
  console.log(`Wrote Issue #1214 measurement: ${resolve(options.output)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
