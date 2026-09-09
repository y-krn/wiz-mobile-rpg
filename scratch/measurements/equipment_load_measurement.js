// sim-scope: run — production-backed equipment-load initiative and B1F diagnostic
/* global console, process */

import "../simulations/simulation_preflight.js";
import fs from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { getCharacterEquipmentLoad } from "../../src/rules/equipment_load.js";
import { createStartingKitCharacter } from "../../src/state/initial_state.js";
import { runCombatRoundCalculation } from "../../src/combat_logic.js";
import { createBuildFixture } from "./build_fixtures.js";
import { LOADOUTS, runFixedCombatDiagnostic } from "./fixed_combat_composition_diagnostic.js";
import { requireRunnerProvenance } from "./measurement_provenance.js";
import { printEnvSignatureBanner, readSimScopeDeclaration } from "./measurement_env_signature.js";

export const RUNNER_VERSION = "issue1170-equipment-load-v2";
export const SCHEMA_VERSION = 2;
export const DEFAULT_RUNS = 1000;
export const DEFAULT_SEED = 1170;
export const ENEMY_COUNTS = Object.freeze([1, 2, 3]);
export const FIRST_STRIKE_VARIANTS = Object.freeze([
  Object.freeze({ id: "none", label: "FirstStrikeなし", accessory: null }),
  Object.freeze({ id: "production", label: "production FirstStrikeあり", accessory: "SWIFT_BAND" })
]);
const RUNNER_PATH = "scratch/measurements/equipment_load_measurement.js";
const PRODUCTION_PATHS = Object.freeze([
  "src/data/items.js",
  "src/rules/equipment_load.js",
  "src/rules/item_rules.js",
  "src/combat_logic/round.js",
  "src/combat_logic/damage.js",
  "scratch/measurements/fixed_combat_composition_diagnostic.js",
  "scratch/simulations/sim_depth_material_ev.js"
]);

const { resetSimulationRandom, simulateRun, getScenarioById } =
  await import("../simulations/sim_depth_material_ev.js");

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

function positiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(label + " must be an integer >= 1: " + value);
  }
  return parsed;
}

function loadoutCharacter(loadoutId, firstStrike) {
  const fixtureId = LOADOUTS[loadoutId].fixtureId;
  const character = fixtureId
    ? createBuildFixture(fixtureId)
    : createStartingKitCharacter("vanguard");
  character.equipment.accessory = firstStrike.accessory;
  character.hp = character.maxHp;
  character.status = "ok";
  return character;
}

function combatFixture(loadoutId, firstStrike, enemyCount) {
  return {
    party: [loadoutCharacter(loadoutId, firstStrike)],
    combatState: {
      monsters: Array.from({ length: enemyCount }, (_, index) => ({
        name: "initiative target " + (index + 1),
        hp: 999,
        maxHp: 999,
        atk: 0,
        def: 0,
        status: "ok",
        buffs: []
      })),
      roundNumber: 1,
      phase: "choose_actions"
    },
    inventory: [],
    firstKills: [],
    codex: null,
    currentRun: { itemsFound: [], equipmentFound: [], deathLogs: [] },
    floorChestsTotal: [],
    roamingMonsters: [],
    floor: 1
  };
}

function increment(map, key, amount = 1) {
  map[key] = (map[key] || 0) + amount;
}

function initiativeMatrix(runs, seed) {
  const cases = [];
  for (const loadoutId of Object.keys(LOADOUTS)) {
    for (const firstStrike of FIRST_STRIKE_VARIANTS) {
      for (const enemyCount of ENEMY_COUNTS) {
        resetSimulationRandom(seed);
        const counts = { first: 0, after: 0, notExecuted: 0, enemyActions: 0 };
        const loadClass = getCharacterEquipmentLoad(
          loadoutCharacter(loadoutId, FIRST_STRIKE_VARIANTS[0])
        ).class;
        for (let runIndex = 0; runIndex < runs; runIndex++) {
          const result = runCombatRoundCalculation(
            combatFixture(loadoutId, firstStrike, enemyCount),
            { actions: [{ type: "defend", actorIdx: 0 }] }
          );
          const player = result.actionObservations.find(observation => observation.actor === "char");
          if (player?.order === 0 && player.executed) counts.first++;
          else if (player?.executed) counts.after++;
          else counts.notExecuted++;
          counts.enemyActions += result.actionObservations
            .filter(observation => observation.actor === "monster").length;
        }
        cases.push({
          loadoutId,
          loadClass,
          firstStrike: firstStrike.id,
          enemyCount,
          runs,
          firstPlayerBeforeAnyEnemyRate: counts.first / runs,
          afterEnemyActionRate: counts.after / runs,
          notExecutedBeforeEndRate: counts.notExecuted / runs,
          averageEnemyActions: counts.enemyActions / runs
        });
      }
    }
  }
  return cases;
}

function createB1FAggregate(loadoutId, runs, loadClassOverride = null) {
  return {
    loadoutId,
    loadClass: loadClassOverride || getCharacterEquipmentLoad(
      loadoutCharacter(loadoutId, FIRST_STRIKE_VARIANTS[0])
    ).class,
    runs,
    b2Arrivals: 0,
    deaths: 0,
    encounters: 0,
    fleeSelected: 0,
    fleeExecuted: 0,
    fleeSelectedButNotExecuted: 0,
    fleePartingAttackCount: 0,
    fleeSurvived: 0,
    fleeDiedFromPartingAttack: 0,
    steps: 0,
    combatRounds: 0,
    trapDamageHp: 0,
    poisonApplications: 0,
    encounterOutcomes: {},
    encounterCompositions: {}
  };
}

function observeB1F(aggregate, result) {
  aggregate.b2Arrivals += Number(result.reachedFloor >= 2);
  aggregate.deaths += Number(result.died);
  aggregate.encounters += result.encounterIdentityLog?.length || 0;
  aggregate.steps += result.steps || 0;
  aggregate.combatRounds += result.combatRounds || 0;
  aggregate.trapDamageHp += result.trapDamageHp || 0;
  aggregate.poisonApplications += result.statusObservations?.byStatus?.poisoned?.applications || 0;
  for (const identity of result.encounterIdentityLog || []) {
    increment(aggregate.encounterOutcomes, identity.outcome || "unknown");
    increment(aggregate.encounterCompositions, identity.enemyCompositionKey || "unknown");
  }
  for (const [encounterIndex, diagnostic] of (result.diagnostics?.encounters || []).entries()) {
    const selected = (diagnostic.rounds || []).filter(round => round.fleeSelected === true).length;
    const executed = (diagnostic.rounds || []).filter(round => round.fleeExecuted === true).length;
    const parting = (diagnostic.rounds || []).filter(round => round.fleePartingAttack === true).length;
    aggregate.fleeSelected += selected;
    aggregate.fleeExecuted += executed;
    aggregate.fleeSelectedButNotExecuted += Math.max(0, selected - executed);
    aggregate.fleePartingAttackCount += parting;
    const outcome = result.encounterIdentityLog?.[encounterIndex]?.outcome;
    aggregate.fleeSurvived += Number(executed > 0 && outcome === "flee");
    aggregate.fleeDiedFromPartingAttack += Number(
      executed > 0 && parting > 0 && outcome === "death"
    );
  }
}

function finalizeB1FAggregate(aggregate) {
  const { runs } = aggregate;
  return {
    ...aggregate,
    b2ArrivalRate: aggregate.b2Arrivals / runs,
    deathRate: aggregate.deaths / runs,
    encounterRate: aggregate.encounters / runs,
    fleeSelectionRate: aggregate.fleeSelected / runs,
    fleeExecutionRate: aggregate.fleeExecuted / runs,
    fleeSelectionToSurvivalRate: aggregate.fleeSelected > 0
      ? aggregate.fleeSurvived / aggregate.fleeSelected
      : null,
    fleeExecutionSurvivalRate: aggregate.fleeExecuted > 0
      ? aggregate.fleeSurvived / aggregate.fleeExecuted
      : null,
    fleePartingDeathRate: aggregate.fleeExecuted > 0
      ? aggregate.fleeDiedFromPartingAttack / aggregate.fleeExecuted
      : null,
    averageSteps: aggregate.steps / runs,
    averageCombatRounds: aggregate.combatRounds / runs,
    averageTrapDamageHp: aggregate.trapDamageHp / runs,
    poisonApplicationRate: aggregate.poisonApplications / runs
  };
}

async function runB1FCondition(runs, seed, {
  conditionId,
  fleePolicy,
  controlledLoadOnly = false
}) {
  const scenario = {
    ...getScenarioById("legacy-no-portal"),
    startingKit: "vanguard",
    startingHealPotions: 0,
    startingGreaterHeals: 0,
    startingManaPotions: 0,
    startingHolyWater: 0,
    startingAntidotes: 0,
    startingGuardPotions: 0,
    departureCraft: [],
    ignoreWorkshopReturnItems: true,
    useTownPortal: false,
    collectEncounterIdentities: true,
    simDiagnosticLevel: "full",
    fleePolicy,
    fleeHpThreshold: null
  };
  if (controlledLoadOnly) {
    scenario.measurementInitiative = {
      rollSize: 20,
      playerFirstStrikeModifier: 0,
      enemySpeedModifier: 0
    };
  }
  const results = {};
  for (const loadoutId of Object.keys(LOADOUTS)) {
    const aggregate = createB1FAggregate(
      loadoutId,
      runs,
      controlledLoadOnly ? loadoutId : null
    );
    resetSimulationRandom(seed);
    for (let runIndex = 0; runIndex < runs; runIndex++) {
      const fixtureId = controlledLoadOnly
        ? LOADOUTS.standard.fixtureId
        : LOADOUTS[loadoutId].fixtureId;
      const measurementInitiative = controlledLoadOnly
        ? { ...scenario.measurementInitiative, playerLoadModifier: {
          light: 2,
          standard: 0,
          heavy: -2
        }[loadoutId] }
        : null;
      const effectiveScenario = measurementInitiative
        ? { ...scenario, measurementInitiative }
        : scenario;
      const result = simulateRun({
        ...(fixtureId ? { fixtureId } : { className: "Fighter" }),
        startFloor: 1,
        targetDepth: 2,
        runIndex,
        seriesId: "issue-1170:b1f:" + conditionId + ":" + loadoutId,
        scoringProfile: null,
        scenario: effectiveScenario,
        workshop: { ranks: {} },
        // Keep the world stream matched across loadouts. The controlled
        // condition changes only the measurement initiative modifier; the
        // production conditions compare the actual production gear.
        worldSeed: "issue-1170:" + seed + ":b1f:" + conditionId + ":" + runIndex,
        collectDiagnostics: true
      });
      observeB1F(aggregate, result);
    }
    results[loadoutId] = finalizeB1FAggregate(aggregate);
  }
  return results;
}

export async function runEquipmentLoadMeasurement({ runs = DEFAULT_RUNS, seed = DEFAULT_SEED } = {}) {
  const normalizedRuns = positiveInteger(runs, "runs");
  const normalizedSeed = positiveInteger(seed, "seed");
  const loadoutMetadata = Object.values(LOADOUTS).map(loadout => {
    const character = loadoutCharacter(loadout.id, FIRST_STRIKE_VARIANTS[0]);
    return {
      ...loadout,
      loadClass: getCharacterEquipmentLoad(character).class,
      equipment: { ...character.equipment }
    };
  });
  const fixedCombat = {};
  for (const loadoutId of Object.keys(LOADOUTS)) {
    fixedCombat[loadoutId] = await runFixedCombatDiagnostic({
      runs: normalizedRuns,
      seed: normalizedSeed,
      loadoutId
    });
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    runnerVersion: RUNNER_VERSION,
    question: "装備負荷の3段階が行動順とB1F production Costに意味のある差を作るか",
    evidenceScope: "run",
    configuration: {
      runs: normalizedRuns,
      seed: normalizedSeed,
      loadouts: loadoutMetadata,
      enemyCounts: [...ENEMY_COUNTS],
      firstStrikeVariants: FIRST_STRIKE_VARIANTS,
      initiativeRange: [0, 19],
      initiativeTieBreak: "shared-roll fractional part; exact collision keeps insertion order",
      omitted: ["enemy-specific speed identity", "player UI timing", "loot/reward settlement after fixed combat"]
    },
    initiativeMatrix: initiativeMatrix(normalizedRuns, normalizedSeed),
    fixedCombat,
    productionB1F: await runB1FCondition(normalizedRuns, normalizedSeed, {
      conditionId: "production-gear-fight-only",
      fleePolicy: "never"
    }),
    controlledB1F: await runB1FCondition(normalizedRuns, normalizedSeed, {
      conditionId: "controlled-load-only-fight",
      fleePolicy: "never",
      controlledLoadOnly: true
    }),
    productionB1FFlee: await runB1FCondition(normalizedRuns, normalizedSeed, {
      conditionId: "production-gear-visible-multi-enemy-flee",
      fleePolicy: "visible-multi-enemy-flee"
    })
  };
}

function buildReport(result, provenance) {
  const environmentHash = printEnvSignatureBanner({
    runnerVersion: RUNNER_VERSION,
    schemaVersion: SCHEMA_VERSION,
    seed: result.configuration.seed,
    runs: result.configuration.runs,
    loadouts: result.configuration.loadouts.map(loadout => loadout.id),
    enemyCounts: result.configuration.enemyCounts,
    firstStrikeVariants: result.configuration.firstStrikeVariants.map(variant => variant.id)
  }, { label: "issue1170 equipment-load env" });
  return {
    ...result,
    measurement: {
      scope: readSimScopeDeclaration(import.meta.url)?.name || "run",
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
    decision: {
      firstStrikeInteraction: "measured with production SWIFT_BAND and no permanent player/enemy priority",
      enemySpeedIdentity: "deferred; all enemies use the common baseline",
      issue1160: "reassess after this production B1F evidence"
    }
  };
}

function b1fSummaryRows(groups) {
  return Object.values(groups).map(row =>
    "| " + row.loadoutId + " (" + ({ light: "速い", standard: "標準", heavy: "遅い" }[row.loadClass]) + ") | " +
    (row.b2ArrivalRate * 100).toFixed(2) + "% | " +
    (row.deathRate * 100).toFixed(2) + "% | " + row.encounterRate.toFixed(3) +
    " | " + row.averageSteps.toFixed(2) + " | " + row.averageTrapDamageHp.toFixed(2) +
    " | " + row.poisonApplicationRate.toFixed(3) + " |"
  );
}

function b1fFleeSummaryRows(groups) {
  return Object.values(groups).map(row =>
    "| " + row.loadoutId + " (" + ({ light: "速い", standard: "標準", heavy: "遅い" }[row.loadClass]) + ") | " +
    row.fleeSelected + " | " + row.fleeExecuted + " | " + row.fleeSurvived +
    " | " + row.fleeDiedFromPartingAttack + " | " +
    (row.fleeSelectionToSurvivalRate * 100).toFixed(2) + "% | " +
    (row.fleeExecutionSurvivalRate * 100).toFixed(2) + "% |"
  );
}

function buildSummary(report) {
  const lines = [
    "# Equipment load diagnostic (#1170)",
    "",
    "- runner: " + report.runnerVersion + "; source SHA: " +
      (report.measurement.sourceCommit || "not recorded"),
    "- N=" + report.configuration.runs + "; seed=" + report.configuration.seed +
      "; initiative=" + report.configuration.initiativeRange.join("–"),
    "",
    "## Initiative matrix",
    "",
    "| Load | FirstStrike | Enemies | Player before any enemy | After enemy | Not executed |",
    "| --- | --- | ---: | ---: | ---: | ---: |",
    ...report.initiativeMatrix.map(row =>
      "| " + row.loadoutId + " (" + ({ light: "速い", standard: "標準", heavy: "遅い" }[row.loadClass]) + ") | " + row.firstStrike + " | " +
      row.enemyCount + " | " + (row.firstPlayerBeforeAnyEnemyRate * 100).toFixed(2) +
      "% | " + (row.afterEnemyActionRate * 100).toFixed(2) + "% | " +
      (row.notExecutedBeforeEndRate * 100).toFixed(2) + "% |"
    ),
    "",
    "## Production B1F",
    "",
    "| Load | B2 arrival | Death | Encounters/run | Avg steps | Trap damage/run | Poison applications/run |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...b1fSummaryRows(report.productionB1F),
    "",
    "## Controlled B1F (same gear; load-only initiative)",
    "",
    "| Load modifier | B2 arrival | Death | Encounters/run | Avg steps | Trap damage/run | Poison applications/run |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...b1fSummaryRows(report.controlledB1F),
    "",
    "## Production B1F flee funnel",
    "",
    "| Load | Selected | Executed | Survived | Parting-attack death | Selected→survived | Executed→survived |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...b1fFleeSummaryRows(report.productionB1FFlee),
    "",
    "## B1F encounter distribution",
    "",
    "| Load | Enemy composition | Encounters |",
    "| --- | --- | ---: |",
    ...Object.values(report.productionB1F).flatMap(row =>
      Object.entries(row.encounterCompositions).sort(([left], [right]) => left.localeCompare(right)).map(([composition, count]) =>
        "| " + row.loadoutId + " | " + composition + " | " + count + " |"
      )
    ),
    "",
    "## Interpretation boundary",
    "",
    "- Fixed combat uses the existing #1151 six-composition pair set and production resolver.",
    "- B1F uses production map traversal, encounter generation, combat, traps, and exploration status observation.",
    "- Controlled B1F keeps the standard production gear and changes only the measurement-only initiative modifier.",
    "- Production B1F flee funnel uses the existing visible-multi-enemy-flee policy; selection, execution, survival, and parting-attack death are reported separately.",
    "- Equal win rates are not a target; the diagnostic checks whether light or heavy becomes an unconditional best choice.",
    "- #1160 remains a post-measurement decision, not part of this implementation."
  ];
  return lines.join("\n") + "\n";
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const runs = positiveInteger(options.runs || DEFAULT_RUNS, "runs");
  const seed = positiveInteger(options.seed || DEFAULT_SEED, "seed");
  if (!options.output || !options.summary) throw new Error("--output and --summary are required");
  const provenance = requireRunnerProvenance({
    fetchOriginMain: false,
    measurementRunnerPaths: [RUNNER_PATH, ...PRODUCTION_PATHS]
  });
  const result = await runEquipmentLoadMeasurement({ runs, seed });
  const report = buildReport(result, provenance);
  fs.writeFileSync(resolve(options.output), JSON.stringify(report, null, 2) + "\n");
  fs.writeFileSync(resolve(options.summary), buildSummary(report));
  console.log("Wrote Issue #1170 equipment-load measurement: " + resolve(options.output));
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
