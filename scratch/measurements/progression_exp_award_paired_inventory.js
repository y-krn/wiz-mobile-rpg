// sim-scope: run — paired production and Phase 4j-B EXP award inventory
/* global console, process */

import "../simulations/simulation_preflight.js";
import fs from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { BIOMES, MONSTERS } from "../../src/data.js";
import { ENCOUNTER_SIZE_WEIGHTS } from "../../src/data/encounters.js";
import { EXP_LEVELS } from "../../src/data/progression.js";
import {
  BOSS_FLOORS,
  DEFAULT_RUNS,
  DEFAULT_SEED,
  FLOORS,
  generateProductionExpAwardRow,
  projectFunding,
  runProgressionExpAwardInventory
} from "./progression_exp_award_inventory.js";
import { requireRunnerProvenance } from "./measurement_provenance.js";
import { readSimScopeDeclaration } from "./measurement_env_signature.js";

export const RUNNER_VERSION = "progression-exp-award-paired-inventory-v1";
export const SCHEMA_VERSION = 1;
export const RUNNER_PATH = "scratch/measurements/progression_exp_award_paired_inventory.js";
const SPECIAL_UNITS = Object.freeze({ rare: 1.75, elite: 2, midboss: 2, boss: 3 });
const PRODUCTION_PATHS = Object.freeze([
  RUNNER_PATH,
  "scratch/measurements/progression_exp_award_inventory.js",
  "src/combat_ui/encounter.js",
  "src/data/biomes.js",
  "src/data/encounters.js",
  "src/data/floor_trials.js",
  "src/data/monsters.js",
  "src/data/progression.js",
  "src/rules/boss_rules.js",
  "src/rules/depth_scaling.js",
  "src/rules/encounter_rules.js",
  "src/rules/floor_trials.js",
  "src/seed_rng.js",
  "src/systems/leveling.ts"
]);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function classifyAwardKind({ boss = false, elite = false, midboss = false, rare = false } = {}) {
  if (boss) return "boss";
  if (elite) return "elite";
  if (midboss) return "midboss";
  if (rare) return "rare";
  return "ordinary";
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function getBiomeMedianExp(floor) {
  const biomeIndex = Math.floor((floor - 1) / 5);
  const biome = BIOMES[biomeIndex];
  if (!biome) throw new Error(`biome missing for floor ${floor}`);
  const normalTemplates = biome.enemyPool.map(name => MONSTERS.find(monster => monster.name === name));
  if (normalTemplates.some(template => !template)) throw new Error(`missing normal encounter template for ${biome.id}`);
  const expValues = normalTemplates
    .filter(template => !template.treasureRare && !template.isBoss && !template.isMidboss)
    .map(template => template.exp);
  if (!expValues.length || expValues.some(exp => !Number.isFinite(exp) || exp < 0)) {
    throw new Error(`invalid biome template EXP for ${biome.id}`);
  }
  const value = median(expValues);
  if (!(value > 0)) throw new Error(`non-positive biome median EXP for ${biome.id}`);
  return value;
}

function standardEncounterSize(floor) {
  const localFloor = ((floor - 1) % 5) + 1;
  const weights = ENCOUNTER_SIZE_WEIGHTS[localFloor];
  if (!Array.isArray(weights) || !weights.length || weights.some(weight => !Number.isFinite(weight) || weight < 0)) {
    throw new Error(`invalid pre-trial encounter-size weights at floor ${floor}`);
  }
  let bestIndex = 0;
  for (let index = 1; index < weights.length; index++) {
    if (weights[index] > weights[bestIndex]) bestIndex = index;
  }
  return bestIndex + 1;
}

export function calculateCandidateAward({ floor, kind, monsters = [], encounterSize = monsters.length } = {}) {
  if (!Number.isInteger(floor) || floor < 1 || floor > 30) throw new Error(`floor outside current biome range: ${floor}`);
  const band = clamp(Math.floor((floor - 1) / 5), 0, 5);
  const bandReward = 1 + 0.04 * band;
  let biomeMedianExp = null;
  let standardSize = null;
  let templateThreat = null;
  let sizePressure = null;
  let ordinaryWeight = null;
  let totalAward;

  if (kind === "ordinary") {
    if (!Array.isArray(monsters) || monsters.length === 0 || encounterSize !== monsters.length) {
      throw new Error("ordinary candidate requires the full initially generated encounter");
    }
    if (monsters.some(monster => !Number.isFinite(monster.templateExp) || monster.templateExp < 0)) {
      throw new Error("ordinary encounter has invalid template EXP");
    }
    biomeMedianExp = getBiomeMedianExp(floor);
    standardSize = standardEncounterSize(floor);
    const meanThreat = monsters.reduce((sum, monster) => sum + monster.templateExp / biomeMedianExp, 0) / monsters.length;
    templateThreat = clamp(meanThreat, 0.8, 1.25);
    sizePressure = clamp(encounterSize / standardSize, 0.75, 1.35);
    ordinaryWeight = clamp(templateThreat * sizePressure, 0.75, 1.5);
    totalAward = Math.round(40 * ordinaryWeight * bandReward);
  } else {
    const units = SPECIAL_UNITS[kind];
    if (units === undefined) throw new Error(`unknown candidate encounter kind: ${kind}`);
    totalAward = Math.round(40 * units * bandReward);
  }

  if (!Number.isFinite(totalAward) || totalAward < 0) throw new Error("candidate award is not finite and non-negative");
  const funding = projectFunding(totalAward);
  if (kind !== "boss" && (funding.resultingLevel !== 1 || funding.prefundedLevels !== 0)) {
    throw new Error(`${kind} candidate violates fresh Level funding bound at B${floor}`);
  }
  if (kind === "boss" && (funding.resultingLevel > 2 || funding.prefundedLevels !== 0)) {
    throw new Error(`Boss candidate violates one-Level/no-prefund bound at B${floor}`);
  }
  return {
    kind,
    band,
    bandReward,
    biomeMedianExp,
    standardSize,
    templateThreat,
    sizePressure,
    ordinaryWeight,
    totalAward,
    soloShare: Math.round(totalAward / 1),
    levelFunding: {
      initialLevel: 1,
      initialExp: 0,
      levelAfterOneProductionCheck: funding.resultingLevel,
      fundedThroughLevel: funding.fundedThroughLevel,
      prefundedLevels: funding.prefundedLevels,
      nextUnsatisfiedThreshold: funding.nextUnsatisfiedThreshold,
      expRemainingToNextThreshold: funding.nextUnsatisfiedThreshold === null
        ? null : Math.max(0, funding.nextUnsatisfiedThreshold - totalAward)
    }
  };
}

function pairRow(row, { boss = false } = {}) {
  const kind = classifyAwardKind({ boss, rare: row.rare });
  const candidate = calculateCandidateAward({
    floor: row.floor,
    kind,
    monsters: row.monsters,
    encounterSize: row.encounterSize
  });
  return {
    ...row,
    encounterKind: boss ? "boss-reference" : row.encounterKind,
    production: {
      totalAward: row.finalSoloCombatExpAward,
      soloShare: Math.round(row.finalSoloCombatExpAward / 1),
      levelFunding: row.levelFunding
    },
    candidate,
    pairedDelta: candidate.soloShare - row.finalSoloCombatExpAward
  };
}

function quantile(values, probability) {
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  return sorted[lower] + (sorted[Math.ceil(position)] - sorted[lower]) * (position - lower);
}

function distribution(rows, pick) {
  const values = rows.map(pick);
  return {
    n: values.length,
    p10: quantile(values, 0.1),
    p50: quantile(values, 0.5),
    p90: quantile(values, 0.9),
    min: Math.min(...values),
    max: Math.max(...values)
  };
}

function summarize(rows) {
  const funded = values => values.reduce((result, value) => {
    result[String(value)] = (result[String(value)] || 0) + 1;
    return result;
  }, {});
  return {
    n: rows.length,
    productionAward: distribution(rows, row => row.production.soloShare),
    candidateAward: distribution(rows, row => row.candidate.soloShare),
    pairedDeltaCandidateMinusProduction: distribution(rows, row => row.pairedDelta),
    productionPrefundedLevels: funded(rows.map(row => row.production.levelFunding.prefundedLevels)),
    candidatePrefundedLevels: funded(rows.map(row => row.candidate.levelFunding.prefundedLevels))
  };
}

export async function runProgressionExpAwardPairedInventory({
  runs = DEFAULT_RUNS,
  seed = DEFAULT_SEED,
  allowSmallRunCount = false
} = {}) {
  const production = await runProgressionExpAwardInventory({ runs, seed, allowSmallRunCount });
  const observations = production.observations.map(row => pairRow(row));
  const bossReferences = production.bossReferences.map(row => pairRow(row, { boss: true }));
  const summaries = [];
  for (const floor of FLOORS) {
    for (const kind of ["ordinary", "rare"]) {
      const rows = observations.filter(row => row.floor === floor && row.candidate.kind === kind);
      if (rows.length) summaries.push({ floor, encounterKind: kind, ...summarize(rows) });
    }
  }
  return {
    runnerVersion: RUNNER_VERSION,
    schemaVersion: SCHEMA_VERSION,
    status: "diagnostic-only",
    configuration: {
      ...production.configuration,
      profile: "progression-exp-award-paired-inventory",
      comparison: "paired same generated encounter; current production EXP vs the single Phase 4j-B candidate",
      candidateOnly: true,
      candidateProductionIntegrated: false,
      bossReferencesAreSurvivalSamples: false,
      ordinaryEncounterDefinition: "full initially generated encounter before combat",
      survivorSharePolicy: "Math.round(totalEncounterExp / 1)",
      productionRunnerVersion: "progression-exp-award-inventory-v1",
      expThresholds: EXP_LEVELS
    },
    observations,
    summaries,
    overall: summarize(observations),
    bossReferences
  };
}

function makeSummary(report) {
  const fmt = value => `${value.p10} / ${value.p50} / ${value.p90} / ${value.min} / ${value.max}`;
  const lines = [
    "# Paired production / Phase 4j-B combat EXP award inventory",
    "",
    `- Profile: progression-exp-award-paired-inventory; N=${report.configuration.runs}/floor; seed=${report.configuration.seed}; raw included`,
    "- Same production-generated encounter and seed on both award paths; no combat executed.",
    "- Full initially generated encounter is measured before combat. Fled monsters and split-child settlement are outside scope.",
    "- Boss rows are exact EXP references, not Boss survival samples.",
    "- Tablet EXP from `src/menu/explore_actions.js` remains a separate noncombat source and is unchanged.",
    "",
    "| Floor | Kind | N | Production p10 / p50 / p90 / min / max | Candidate p10 / p50 / p90 / min / max | Paired delta p10 / p50 / p90 / min / max |",
    "| --- | --- | ---: | --- | --- | --- |"
  ];
  for (const summary of report.summaries) {
    lines.push(`| B${summary.floor} | ${summary.encounterKind} | ${summary.n} | ${fmt(summary.productionAward)} | ${fmt(summary.candidateAward)} | ${fmt(summary.pairedDeltaCandidateMinusProduction)} |`);
  }
  lines.push("", "## Boss references", "", "| Floor | Production EXP | Candidate EXP | Candidate resulting Level | Candidate prefunded Levels |", "| ---: | ---: | ---: | ---: | ---: |");
  for (const row of report.bossReferences) {
    lines.push(`| B${row.floor} | ${row.production.soloShare} | ${row.candidate.soloShare} | ${row.candidate.levelFunding.levelAfterOneProductionCheck} | ${row.candidate.levelFunding.prefundedLevels} |`);
  }
  lines.push("");
  return lines.join("\n");
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index++) {
    const [key, inline] = argv[index].replace(/^--/, "").split("=", 2);
    values[key] = inline ?? argv[++index];
  }
  return values;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.output || !options.summary || !options.manifest) throw new Error("--output, --summary, and --manifest are required");
  const runs = Number(options.runs || DEFAULT_RUNS);
  if (!Number.isInteger(runs) || runs < 30) throw new Error(`runs must be an integer >= 30: ${options.runs}`);
  const provenance = requireRunnerProvenance({ fetchOriginMain: false, measurementRunnerPaths: PRODUCTION_PATHS });
  const report = await runProgressionExpAwardPairedInventory({ runs, seed: Number(options.seed || DEFAULT_SEED) });
  report.measurement = {
    scope: readSimScopeDeclaration(import.meta.url)?.name || "run",
    sourceCommit: provenance?.sourceCommit || null,
    gameplaySourceCommit: provenance?.gameplaySourceCommit || null,
    measurementRunnerCommit: provenance?.measurementRunnerCommit || null,
    measurementRunnerPaths: provenance?.measurementRunnerPaths || PRODUCTION_PATHS,
    measurementRunnerDiffSha256: provenance?.measurementRunnerDiffSha256 || null,
    originMainAncestor: provenance?.originMainAncestor ?? null,
    workingTreeClean: provenance?.workingTreeClean ?? null,
    workflow: {
      repository: process.env.MEASUREMENT_REPOSITORY || null,
      runId: process.env.MEASUREMENT_WORKFLOW_RUN_ID || null,
      runAttempt: process.env.MEASUREMENT_RUN_ATTEMPT || null,
      runUrl: process.env.MEASUREMENT_WORKFLOW_RUN_URL || null
    }
  };
  fs.writeFileSync(resolve(options.output), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(resolve(options.summary), `${makeSummary(report)}\n`);
  fs.writeFileSync(resolve(options.manifest), `${JSON.stringify({ schemaVersion: SCHEMA_VERSION, status: "success", runner: RUNNER_VERSION, source: report.measurement, configuration: report.configuration }, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
}
