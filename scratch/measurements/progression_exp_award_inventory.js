// sim-scope: run — production encounter EXP and prefunded Level inventory
/* global console, process */

import "../simulations/simulation_preflight.js";
import fs from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { generateEncounter } from "../../src/combat_ui/encounter.js";
import { MONSTERS } from "../../src/data/monsters.js";
import { EXP_LEVELS } from "../../src/data/progression.js";
import { getDepthScaling } from "../../src/rules/depth_scaling.js";
import { checkCharLevelUp } from "../../src/systems/leveling.ts";
import { createRng } from "../../src/seed_rng.js";
import { requireRunnerProvenance } from "./measurement_provenance.js";
import { readSimScopeDeclaration } from "./measurement_env_signature.js";

export const RUNNER_VERSION = "progression-exp-award-inventory-v1";
export const SCHEMA_VERSION = 1;
export const DEFAULT_RUNS = 200;
export const DEFAULT_SEED = 1703;
export const FLOORS = Object.freeze([1, 5, 10, 20, 30]);
export const BOSS_FLOORS = Object.freeze([5, 10, 20, 30]);
export const RUNNER_PATH = "scratch/measurements/progression_exp_award_inventory.js";
const PRODUCTION_PATHS = Object.freeze([
  RUNNER_PATH,
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

function positiveInteger(value, name, minimum = 1) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum) {
    throw new Error(`${name} must be an integer >= ${minimum}: ${value}`);
  }
  return number;
}

function templateFor(instance) {
  const name = instance.name.replace(/\s[A-Z]$/, "");
  const template = MONSTERS.find(monster => monster.name === name);
  if (!template) throw new Error(`production encounter template not found: ${instance.name}`);
  return template;
}

function projectFunding(exp) {
  const probe = { level: 1, exp, hp: 20, maxHp: 20 };
  const startingLevel = probe.level;
  const levelUpApplied = checkCharLevelUp(probe);
  let fundedThroughLevel = 1;
  for (let level = 2; level < EXP_LEVELS.length; level++) {
    if (exp < EXP_LEVELS[level]) break;
    fundedThroughLevel = level;
  }
  const nextLevel = fundedThroughLevel + 1;
  const nextThreshold = nextLevel < EXP_LEVELS.length ? EXP_LEVELS[nextLevel] : null;
  return {
    resultingLevel: probe.level,
    levelUpApplied,
    fundedThroughLevel,
    prefundedLevels: fundedThroughLevel - probe.level,
    nextUnsatisfiedThreshold: nextThreshold,
    expRemainingToNextThreshold: nextThreshold === null ? null : Math.max(0, nextThreshold - exp),
    startingLevel
  };
}

function generateRow({ floor, runIndex, worldSeed, boss = false }) {
  const encounterSeed = `${worldSeed}:encounter`;
  const result = generateEncounter(
    { floor, currentRun: { runSeed: worldSeed } },
    boss,
    false,
    false,
    null,
    createRng(encounterSeed)
  );
  const monsters = result.monsters.map(instance => {
    const template = templateFor(instance);
    return {
      name: instance.name,
      templateExp: template.exp,
      scaledExp: instance.exp,
      isRare: Boolean(instance.isRare)
    };
  });
  const templateExpSum = monsters.reduce((sum, monster) => sum + monster.templateExp, 0);
  const scaledExpSum = monsters.reduce((sum, monster) => sum + monster.scaledExp, 0);
  const rewardMultiplier = getDepthScaling(floor).reward * (boss ? 1.2 : 1);
  const expectedScaledExp = monsters.reduce((sum, monster) => {
    const template = templateFor({ name: monster.name });
    return sum + Math.max(1, Math.round(template.exp * rewardMultiplier));
  }, 0);
  if (scaledExpSum !== expectedScaledExp) {
    throw new Error(`production EXP decomposition mismatch at B${floor}, run ${runIndex}`);
  }
  const soloCombatExpAward = Math.round(scaledExpSum / 1);
  const templateFunding = projectFunding(templateExpSum);
  const scaledFunding = projectFunding(soloCombatExpAward);
  return {
    floor,
    band: Math.floor((floor - 1) / 5),
    runIndex,
    worldSeed,
    encounterSeed,
    encounterKind: boss ? "boss-reference" : result.isRare ? "rare" : "ordinary",
    rare: result.isRare,
    trial: result.trial ? { bandIndex: result.trial.bandIndex, mainId: result.trial.mainId, subId: result.trial.subId } : null,
    encounterSize: monsters.length,
    monsterIdentities: monsters.map(monster => monster.name),
    monsters,
    templateExpSum,
    productionRewardMultiplier: rewardMultiplier,
    scaledExpSum,
    finalSoloCombatExpAward: soloCombatExpAward,
    levelFunding: {
      initialLevel: 1,
      initialExp: 0,
      levelAfterOneProductionCheck: scaledFunding.resultingLevel,
      fundedThroughLevel: scaledFunding.fundedThroughLevel,
      prefundedLevels: scaledFunding.prefundedLevels,
      nextUnsatisfiedThreshold: scaledFunding.nextUnsatisfiedThreshold,
      expRemainingToNextThreshold: scaledFunding.expRemainingToNextThreshold
    },
    templateFunding: {
      levelAfterOneProductionCheck: templateFunding.resultingLevel,
      templateFundedThroughLevel: templateFunding.fundedThroughLevel,
      templatePrefundedLevels: templateFunding.prefundedLevels,
      nextUnsatisfiedThreshold: templateFunding.nextUnsatisfiedThreshold,
      expRemainingToNextThreshold: templateFunding.expRemainingToNextThreshold
    }
  };
}

function quantile(values, p) {
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  return sorted[lower] + (sorted[Math.ceil(position)] - sorted[lower]) * (position - lower);
}

function distribution(values) {
  return {
    count: values.length,
    p10: quantile(values, 0.10),
    p50: quantile(values, 0.50),
    p90: quantile(values, 0.90),
    min: Math.min(...values),
    max: Math.max(...values)
  };
}

function countValues(values) {
  return values.reduce((counts, value) => {
    counts[String(value)] = (counts[String(value)] || 0) + 1;
    return counts;
  }, {});
}

function summarizeRows(rows) {
  const total = rows.length;
  const prefunded = rows.map(row => row.levelFunding.prefundedLevels);
  return {
    n: total,
    expAward: distribution(rows.map(row => row.finalSoloCombatExpAward)),
    encounterSize: countValues(rows.map(row => row.encounterSize)),
    templateFundedThroughLevel: countValues(rows.map(row => row.templateFunding.templateFundedThroughLevel)),
    scaledFundedThroughLevel: countValues(rows.map(row => row.levelFunding.fundedThroughLevel)),
    templatePrefundedLevels: countValues(rows.map(row => row.templateFunding.templatePrefundedLevels)),
    prefundedLevels: countValues(prefunded),
    prefundedBands: {
      "0": prefunded.filter(value => value === 0).length,
      "1": prefunded.filter(value => value === 1).length,
      "2": prefunded.filter(value => value === 2).length,
      "3+": prefunded.filter(value => value >= 3).length
    },
    prefundedShares: {
      "0": prefunded.filter(value => value === 0).length / total,
      "1": prefunded.filter(value => value === 1).length / total,
      "2": prefunded.filter(value => value === 2).length / total,
      "3+": prefunded.filter(value => value >= 3).length / total
    }
  };
}

export async function runProgressionExpAwardInventory({
  runs = DEFAULT_RUNS,
  seed = DEFAULT_SEED,
  allowSmallRunCount = false
} = {}) {
  const count = positiveInteger(runs, "runs", allowSmallRunCount ? 1 : 30);
  const rootSeed = positiveInteger(seed, "seed");
  const observations = [];
  for (const floor of FLOORS) {
    for (let runIndex = 0; runIndex < count; runIndex++) {
      const worldSeed = `progression-exp-award-inventory:${rootSeed}:B${floor}:${runIndex}`;
      observations.push(generateRow({ floor, runIndex, worldSeed }));
    }
  }
  const summaries = [];
  for (const floor of FLOORS) {
    for (const kind of ["ordinary", "rare"]) {
      const rows = observations.filter(row => row.floor === floor && row.encounterKind === kind);
      if (rows.length) summaries.push({ floor, encounterKind: kind, ...summarizeRows(rows) });
    }
  }
  const bossReferences = BOSS_FLOORS.map(floor => generateRow({
    floor,
    runIndex: null,
    worldSeed: `progression-exp-award-inventory:${rootSeed}:B${floor}:boss-reference`,
    boss: true
  }));
  return {
    runnerVersion: RUNNER_VERSION,
    schemaVersion: SCHEMA_VERSION,
    status: "diagnostic-only",
    configuration: {
      profile: "progression-exp-award-inventory",
      runs: count,
      seed: rootSeed,
      floors: FLOORS,
      regularEncounterSamplesPerFloor: count,
      bossFloors: BOSS_FLOORS,
      debugRaw: true,
      combatExecuted: false,
      soloSurvivorAwardPolicy: "Math.round(sum(non-fled scaled monster EXP) / 1)"
    },
    observations,
    summaries,
    overall: summarizeRows(observations),
    bossReferences
  };
}

function makeSummary(report) {
  const expCells = summary => `${summary.expAward.p10} / ${summary.expAward.p50} / ${summary.expAward.p90} / ${summary.expAward.min} / ${summary.expAward.max}`;
  const distributionCells = values => Object.entries(values).sort(([left], [right]) => Number(left) - Number(right)).map(([key, value]) => `${key}:${value}`).join(", ");
  return [
    "# Production EXP award / prefunded Level inventory",
    "",
    `- profile: progression-exp-award-inventory; N=${report.configuration.runs}/floor; seed=${report.configuration.seed}; debug_raw=true`,
    "- production generateEncounter / encounter weights / trial / rare selection / scaleEnemyForDepth; combat not executed",
    "- EXP p10 / p50 / p90 / min / max",
    "",
    "| Floor | Kind | N | EXP p10 / p50 / p90 / min / max | Encounter size | Template funded Level | Scaled funded Level | Prefunded 0 / 1 / 2 / 3+ |",
    "| ---: | --- | ---: | --- | --- | --- | --- | --- |",
    ...report.summaries.map(row => `| B${row.floor} | ${row.encounterKind} | ${row.n} | ${expCells(row)} | ${distributionCells(row.encounterSize)} | ${distributionCells(row.templateFundedThroughLevel)} | ${distributionCells(row.scaledFundedThroughLevel)} | ${["0", "1", "2", "3+"].map(key => `${row.prefundedBands[key]} (${(row.prefundedShares[key] * 100).toFixed(1)}%)`).join(" / ")} |`),
    "",
    "## Rare vs ordinary totals",
    "",
    ...["ordinary", "rare"].map(kind => {
      const rows = report.observations.filter(row => row.encounterKind === kind);
      return `- ${kind}: N=${rows.length}; ${rows.length ? expCells({ expAward: distribution(rows.map(row => row.finalSoloCombatExpAward)) }) : "no observations"}`;
    }),
    "",
    "## Boss references",
    "",
    "| Floor | Boss | Template EXP | Reward multiplier | Final EXP | Funded through | Result after one check | Prefunded | Next threshold / EXP remaining |",
    "| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
    ...report.bossReferences.map(row => `| B${row.floor} | ${row.monsterIdentities[0]} | ${row.templateExpSum} | ${row.productionRewardMultiplier} | ${row.finalSoloCombatExpAward} | Lv${row.levelFunding.fundedThroughLevel} | Lv${row.levelFunding.levelAfterOneProductionCheck} | ${row.levelFunding.prefundedLevels} | ${row.levelFunding.nextUnsatisfiedThreshold ?? "max"} / ${row.levelFunding.expRemainingToNextThreshold ?? "—"} |`),
    "",
    "Raw per-observation monster EXP and funding projections are in measurement.json. Boss rows are exact references, excluded from N samples.",
    ""
  ].join("\n");
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
  const runs = positiveInteger(options.runs || DEFAULT_RUNS, "runs");
  if (runs < 30 && process.env.CI === "true") throw new Error("CI measurement requires N=200");
  const provenance = requireRunnerProvenance({ fetchOriginMain: false, measurementRunnerPaths: PRODUCTION_PATHS });
  const report = await runProgressionExpAwardInventory({ runs, seed: options.seed || DEFAULT_SEED });
  const measurement = {
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
  report.measurement = measurement;
  fs.writeFileSync(resolve(options.output), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(resolve(options.summary), `${makeSummary(report)}\n`);
  fs.writeFileSync(resolve(options.manifest), `${JSON.stringify({ schemaVersion: SCHEMA_VERSION, status: "success", runner: RUNNER_VERSION, source: measurement, configuration: report.configuration }, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
}
