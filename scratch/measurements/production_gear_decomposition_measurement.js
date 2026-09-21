// sim-scope: run — production-backed decomposition of B1F gear safety
/* global console, process */

import "../simulations/simulation_preflight.js";
import fs from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { getCharAffixSum, getItemBaseId, getItemData } from "../../src/rules/item_rules.js";
import { getCharDef, getCharWeaponAtk } from "../../src/rules/character_stats.js";
import { getCharacterEquipmentLoad } from "../../src/rules/equipment_load.js";
import { createStartingKitCharacter } from "../../src/state/initial_state.js";
import { COMPOSITIONS } from "./fixed_combat_composition_diagnostic.js";
import { createBuildFixture } from "./build_fixtures.js";
import { requireRunnerProvenance } from "./measurement_provenance.js";
import { printEnvSignatureBanner, readSimScopeDeclaration } from "./measurement_env_signature.js";

export const RUNNER_VERSION = "issue1173-production-gear-decomposition-v1";
export const SCHEMA_VERSION = 1;
export const DEFAULT_RUNS = 1000;
export const DEFAULT_SEED = 1173;
export const FIXED_COMBAT_SEED = 1151;

const RUNNER_PATH = "scratch/measurements/production_gear_decomposition_measurement.js";
const PRODUCTION_PATHS = Object.freeze([
  "scratch/simulations/sim_depth_material_ev.js",
  "scratch/measurements/fixed_combat_composition_diagnostic.js",
  "scratch/measurements/build_fixtures.js",
  "src/data/items.js",
  "src/state/initial_state.js",
  "src/rules/item_rules.js",
  "src/rules/character_stats.js",
  "src/rules/equipment_load.js",
  "src/combat_logic/round.js",
  "src/combat_logic/damage.js",
  "src/combat_logic/turn_order.js"
]);

const { simulateRun } = await import("../simulations/sim_depth_material_ev.js");

// Existing #1170 representatives are kept verbatim. Axis fixtures below are
// diagnostic combinations of production item IDs, not copied stat fixtures.
export const CONDITIONS = Object.freeze([
  { id: "actual-light", axis: "actual", fixtureId: "light-shield", loadMode: "production", label: "actual light" },
  { id: "actual-standard", axis: "actual", fixtureId: null, loadMode: "production", label: "actual standard" },
  { id: "actual-heavy", axis: "actual", fixtureId: "heavy-two-hand", loadMode: "production", label: "actual heavy" },
  { id: "actual-neutral-light", axis: "actual-load-neutral", fixtureId: "light-shield", loadMode: "neutral", label: "actual light / load 0" },
  { id: "actual-neutral-standard", axis: "actual-load-neutral", fixtureId: null, loadMode: "neutral", label: "actual standard / load 0" },
  { id: "actual-neutral-heavy", axis: "actual-load-neutral", fixtureId: "heavy-two-hand", loadMode: "neutral", label: "actual heavy / load 0" },
  { id: "weapon-dagger", axis: "weapon", fixtureId: "issue1173-weapon-dagger", loadMode: "neutral", label: "weapon DAGGER" },
  { id: "weapon-short-sword", axis: "weapon", fixtureId: "issue1173-weapon-short-sword", loadMode: "neutral", label: "weapon SHORT_SWORD" },
  { id: "weapon-claymore", axis: "weapon", fixtureId: "issue1173-weapon-claymore", loadMode: "neutral", label: "weapon CLAYMORE" },
  { id: "armor-explorer-cloak-neutral", axis: "armor", fixtureId: "issue1173-armor-explorer-cloak", loadMode: "neutral", label: "armor EXPLORER_CLOAK / load 0" },
  { id: "armor-leather-armor-neutral", axis: "armor", fixtureId: "issue1173-armor-leather-armor", loadMode: "neutral", label: "armor LEATHER_ARMOR / load 0" },
  { id: "armor-plate-mail-neutral", axis: "armor", fixtureId: "issue1173-armor-plate-mail", loadMode: "neutral", label: "armor PLATE_MAIL / load 0" },
  { id: "armor-explorer-cloak-production", axis: "armor-load", fixtureId: "issue1173-armor-explorer-cloak", loadMode: "production", label: "armor EXPLORER_CLOAK / production load" },
  { id: "armor-leather-armor-production", axis: "armor-load", fixtureId: "issue1173-armor-leather-armor", loadMode: "production", label: "armor LEATHER_ARMOR / production load" },
  { id: "armor-plate-mail-production", axis: "armor-load", fixtureId: "issue1173-armor-plate-mail", loadMode: "production", label: "armor PLATE_MAIL / production load" },
  { id: "shield-none", axis: "shield", fixtureId: "issue1173-shield-none", loadMode: "neutral", label: "shield none / load 0" },
  { id: "shield-buckler", axis: "shield", fixtureId: "issue1173-shield-buckler", loadMode: "neutral", label: "shield BUCKLER / load 0" },
  { id: "shield-small-shield", axis: "shield", fixtureId: "issue1173-shield-small-shield", loadMode: "neutral", label: "shield SMALL_SHIELD / load 0" },
  { id: "shield-large-shield", axis: "shield", fixtureId: "issue1173-shield-large-shield", loadMode: "neutral", label: "shield LARGE_SHIELD / load 0" }
]);

const POLICIES = Object.freeze([
  Object.freeze({ id: "fight", fleePolicy: "never" }),
  Object.freeze({ id: "visible-multi-enemy-flee", fleePolicy: "visible-multi-enemy-flee" })
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

function percentile(values, probability) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (sorted.length === 0) return null;
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return lower === upper
    ? sorted[lower]
    : sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function summarize(values) {
  const finite = values.filter(Number.isFinite);
  return {
    count: finite.length,
    mean: finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null,
    p50: percentile(finite, 0.5),
    p95: percentile(finite, 0.95),
    min: finite.length ? Math.min(...finite) : null,
    max: finite.length ? Math.max(...finite) : null
  };
}

function increment(map, key, amount = 1) {
  map[key] = (map[key] || 0) + amount;
}

function characterForCondition(condition) {
  return condition.fixtureId
    ? createBuildFixture(condition.fixtureId)
    : createStartingKitCharacter("vanguard");
}

function itemSummary(item) {
  const data = getItemData(item);
  return data ? {
    id: getItemBaseId(item),
    type: data.type,
    atk: data.atk || 0,
    def: data.def || 0,
    hands: data.hands || 0,
    loadClass: data.loadClass || null,
    guardProfile: data.guardProfile || null
  } : null;
}

function equipmentSummary(condition) {
  const character = characterForCondition(condition);
  return {
    fixtureId: condition.fixtureId,
    loadMode: condition.loadMode,
    load: getCharacterEquipmentLoad(character),
    atk: getCharWeaponAtk(character),
    def: getCharDef(character),
    firstStrike: {
      present: getCharAffixSum(character, "firstStrike") > 0,
      value: getCharAffixSum(character, "firstStrike")
    },
    slots: {
      weapon: itemSummary(character.equipment.weapon),
      armor: itemSummary(character.equipment.armor),
      shield: itemSummary(character.equipment.shield)
    }
  };
}

function createAccumulator(definition) {
  return {
    conditionId: definition.conditionId,
    policy: definition.policy,
    runs: 0,
    clear: 0,
    death: 0,
    flee: 0,
    outcomes: {},
    damageTaken: [],
    postClearHp: [],
    rounds: [],
    enemyActions: [],
    playerBeforeAnyEnemy: 0,
    firstPlayerActions: 0,
    enemyActionsBeforeFirstPlayerAction: [],
    damageBeforeFirstPlayerAction: [],
    fleeSelected: 0,
    fleeExecuted: 0,
    fleeSelectedButNotExecuted: 0,
    fleeSurvived: 0,
    fleePartingAttackCount: 0,
    fleeDiedFromPartingAttack: 0,
    compositionOutcomes: {}
  };
}

function observeEncounter(accumulator, identity, diagnostic, rawOutcome = null) {
  if (!identity) return;
  const outcome = rawOutcome || identity.outcome || "unobserved";
  const normalizedOutcome = outcome === "victory" ? "clear" : outcome;
  increment(accumulator.outcomes, normalizedOutcome);
  accumulator.clear += Number(normalizedOutcome === "clear");
  accumulator.death += Number(normalizedOutcome === "death");
  accumulator.flee += Number(normalizedOutcome === "flee");
  accumulator.damageTaken.push(Number(identity.totalNormalDamage));
  if (normalizedOutcome === "clear") accumulator.postClearHp.push(Number(identity.hpAfter));
  accumulator.rounds.push(Number(identity.rounds));
  accumulator.enemyActions.push(Number(identity.enemyActions));
  const rounds = diagnostic?.rounds || [];
  const firstRound = rounds[0];
  accumulator.playerBeforeAnyEnemy += Number(
    firstRound?.playerActionExecutionTiming === "player-before-any-enemy"
  );
  accumulator.firstPlayerActions += Number(firstRound?.playerActionExecuted === true);
  accumulator.enemyActionsBeforeFirstPlayerAction.push(Number(firstRound?.enemyActionsBeforeFirstPlayerAction));
  accumulator.damageBeforeFirstPlayerAction.push(Number(firstRound?.damageBeforeFirstPlayerAction));
  const selected = rounds.filter(round => round.fleeSelected === true).length;
  const executed = rounds.filter(round => round.fleeExecuted === true).length;
  const parting = rounds.filter(round => round.fleePartingAttack === true).length;
  accumulator.fleeSelected += selected;
  accumulator.fleeExecuted += executed;
  accumulator.fleeSelectedButNotExecuted += Math.max(0, selected - executed);
  accumulator.fleePartingAttackCount += parting;
  accumulator.fleeSurvived += Number(executed > 0 && normalizedOutcome === "flee");
  accumulator.fleeDiedFromPartingAttack += Number(
    executed > 0 && parting > 0 && normalizedOutcome === "death"
  );
  increment(accumulator.compositionOutcomes, identity.enemyCompositionKey || "unknown");
}

function finalizeAccumulator(accumulator) {
  const runs = accumulator.runs;
  return {
    conditionId: accumulator.conditionId,
    policy: accumulator.policy,
    runs,
    outcomes: { ...accumulator.outcomes },
    clearRate: accumulator.clear / Math.max(1, runs),
    deathRate: accumulator.death / Math.max(1, runs),
    fleeRate: accumulator.flee / Math.max(1, runs),
    damageTaken: summarize(accumulator.damageTaken),
    postClearHp: summarize(accumulator.postClearHp),
    rounds: summarize(accumulator.rounds),
    enemyActions: summarize(accumulator.enemyActions),
    playerBeforeAnyEnemyRate: accumulator.playerBeforeAnyEnemy / Math.max(1, runs),
    firstPlayerActionRate: accumulator.firstPlayerActions / Math.max(1, runs),
    enemyActionsBeforeFirstPlayerAction: summarize(accumulator.enemyActionsBeforeFirstPlayerAction),
    damageBeforeFirstPlayerAction: summarize(accumulator.damageBeforeFirstPlayerAction),
    fleeSelected: accumulator.fleeSelected,
    fleeExecuted: accumulator.fleeExecuted,
    fleeSelectedButNotExecuted: accumulator.fleeSelectedButNotExecuted,
    fleeSurvived: accumulator.fleeSurvived,
    fleePartingAttackCount: accumulator.fleePartingAttackCount,
    fleeDiedFromPartingAttack: accumulator.fleeDiedFromPartingAttack,
    fleeSelectedToSurvivalRate: accumulator.fleeSelected
      ? accumulator.fleeSurvived / accumulator.fleeSelected
      : null,
    fleeExecutedToSurvivalRate: accumulator.fleeExecuted
      ? accumulator.fleeSurvived / accumulator.fleeExecuted
      : null,
    fleePartingDeathRate: accumulator.fleeExecuted
      ? accumulator.fleeDiedFromPartingAttack / accumulator.fleeExecuted
      : null,
    compositionOutcomes: { ...accumulator.compositionOutcomes }
  };
}

function scenarioFor(condition, policy) {
  const scenario = {
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
    allowChestTownPortal: false,
    collectEncounterIdentities: true,
    collectStage15Diagnostics: true,
    simDiagnosticLevel: "full",
    fleePolicy: policy.fleePolicy,
    fleeHpThreshold: null,
    consumablesAtDeparture: "none"
  };
  if (condition.loadMode === "neutral") {
    scenario.measurementInitiative = {
      rollSize: 20,
      playerFirstStrikeModifier: 0,
      enemySpeedModifier: 0,
      playerLoadModifier: 0
    };
  }
  return scenario;
}

function runArgs(condition, scenario, seed, runIndex, seriesId, fixedCombat = null) {
  return {
    ...(condition.fixtureId ? { fixtureId: condition.fixtureId } : { className: "Fighter" }),
    startFloor: 1,
    targetDepth: 2,
    runIndex,
    seriesId,
    scoringProfile: null,
    scenario: fixedCombat ? { ...scenario, fixedCombat } : scenario,
    workshop: { ranks: {} },
    worldSeed: `issue-1173:${seed}:${fixedCombat ? "fixed" : "b1f"}:${fixedCombat ? fixedCombat.monsterNames.join("+") : "world"}:${runIndex}`,
    collectDiagnostics: true,
    collectCombatFormula: true
  };
}

async function runFixedCombat(condition, runs, seed) {
  const policyResults = {};
  for (const policy of POLICIES) {
    const cases = [];
    const overall = createAccumulator({ conditionId: condition.id, policy: policy.id });
    for (const composition of COMPOSITIONS) {
      const accumulator = createAccumulator({ conditionId: condition.id, policy: policy.id });
      for (let runIndex = 0; runIndex < runs; runIndex++) {
        const result = simulateRun(runArgs(
          condition,
          scenarioFor(condition, policy),
          seed,
          runIndex,
          `issue-1173:fixed:${condition.id}:${policy.id}`,
          { monsterNames: [...composition.names], entryHpRatio: 1, entryMpRatio: 1 }
        ));
        accumulator.runs++;
        observeEncounter(
          accumulator,
          result.encounterIdentityLog?.[0],
          result.diagnostics?.encounters?.[0],
          result.fixedCombatResult
        );
        overall.runs++;
        observeEncounter(
          overall,
          result.encounterIdentityLog?.[0],
          result.diagnostics?.encounters?.[0],
          result.fixedCombatResult
        );
      }
      cases.push({
        compositionId: composition.id,
        risk: composition.risk,
        monsterNames: [...composition.names],
        ...finalizeAccumulator(accumulator)
      });
    }
    policyResults[policy.id] = {
      cases,
      aggregate: finalizeAccumulator(overall)
    };
  }
  return policyResults;
}

async function runB1F(condition, runs, seed) {
  const results = {};
  for (const policy of POLICIES) {
    const accumulator = createAccumulator({ conditionId: condition.id, policy: policy.id });
    let b2Arrivals = 0;
    let runDeaths = 0;
    let steps = 0;
    let trapDamage = 0;
    let poisonApplications = 0;
    for (let runIndex = 0; runIndex < runs; runIndex++) {
      const result = simulateRun(runArgs(
        condition,
        scenarioFor(condition, policy),
        seed,
        runIndex,
        `issue-1173:b1f:${condition.id}:${policy.id}`
      ));
      b2Arrivals += Number(result.reachedFloor >= 2);
      runDeaths += Number(result.died);
      steps += Number(result.steps) || 0;
      trapDamage += Number(result.trapDamageHp) || 0;
      poisonApplications += result.statusObservations?.byStatus?.poisoned?.applications || 0;
      const identities = result.encounterIdentityLog || [];
      const diagnostics = result.diagnostics?.encounters || [];
      identities.forEach((identity, index) => observeEncounter(accumulator, identity, diagnostics[index]));
      accumulator.runs++;
    }
    const finalized = finalizeAccumulator(accumulator);
    results[policy.id] = {
      ...finalized,
      b2Arrivals,
      b2ArrivalRate: b2Arrivals / Math.max(1, runs),
      runDeaths,
      runDeathRate: runDeaths / Math.max(1, runs),
      steps: summarize(Array(runs).fill(steps / Math.max(1, runs))),
      trapDamageHp: trapDamage / Math.max(1, runs),
      poisonApplications: poisonApplications / Math.max(1, runs)
    };
  }
  return results;
}

function classify(result) {
  const actualLight = result.b1f["actual-light"]?.fight;
  const actualHeavy = result.b1f["actual-heavy"]?.fight;
  const neutralLight = result.b1f["actual-neutral-light"]?.fight;
  const neutralHeavy = result.b1f["actual-neutral-heavy"]?.fight;
  const weapon = ["weapon-dagger", "weapon-short-sword", "weapon-claymore"].map(id => result.fixed[id]?.fight?.aggregate);
  const armor = ["armor-explorer-cloak-neutral", "armor-leather-armor-neutral", "armor-plate-mail-neutral"].map(id => result.fixed[id]?.fight?.aggregate);
  const shield = ["shield-none", "shield-buckler", "shield-small-shield", "shield-large-shield"].map(id => result.fixed[id]?.fight?.aggregate);
  const range = (rows, field) => {
    const values = rows.map(row => row?.[field]?.mean).filter(Number.isFinite);
    return values.length > 1 ? Math.max(...values) - Math.min(...values) : null;
  };
  const initiativeDelta = actualHeavy && neutralHeavy
    ? actualHeavy.b2ArrivalRate - neutralHeavy.b2ArrivalRate
    : null;
  const heavyLightB1fDelta = actualHeavy && actualLight
    ? actualHeavy.b2ArrivalRate - actualLight.b2ArrivalRate
    : null;
  const weaponRoundRange = range(weapon, "rounds");
  const weaponDamageRange = range(weapon, "damageTaken");
  const armorDamageRange = range(armor, "damageTaken");
  const shieldDamageRange = range(shield, "damageTaken");
  const fixedCombatRange = Math.max(
    range(weapon, "clearRate") || 0,
    range(armor, "clearRate") || 0,
    range(shield, "clearRate") || 0
  );
  let primary = "E-horizontal-tradeoff-or-mixed";
  if (Number.isFinite(weaponRoundRange) && weaponRoundRange >= 1 && Number.isFinite(weaponDamageRange) && weaponDamageRange >= 5) {
    primary = "A-weapon-kill-speed";
  } else if (Number.isFinite(armorDamageRange) && armorDamageRange >= 5 || Number.isFinite(shieldDamageRange) && shieldDamageRange >= 5) {
    primary = "B-armor-or-guard";
  } else if (Number.isFinite(fixedCombatRange) && fixedCombatRange < 0.2 && Number.isFinite(heavyLightB1fDelta) && heavyLightB1fDelta >= 0.2) {
    primary = "D-exploration-interaction";
  } else if (Number.isFinite(heavyLightB1fDelta) && heavyLightB1fDelta >= 0.2 && Number.isFinite(initiativeDelta) && initiativeDelta >= 0.1) {
    primary = "C-combined-gear";
  }
  return {
    primary,
    confidence: result.configuration.runs >= 500 ? "diagnostic-distribution" : "fixture-smoke-only",
    evidence: {
      actualHeavyMinusLightB2ArrivalRate: heavyLightB1fDelta,
      actualHeavyMinusNeutralHeavyB2ArrivalRate: initiativeDelta,
      weaponRoundsMeanRange: weaponRoundRange,
      weaponDamageTakenMeanRange: weaponDamageRange,
      armorDamageTakenMeanRange: armorDamageRange,
      shieldDamageTakenMeanRange: shieldDamageRange,
      fixedCombatClearRateRange: fixedCombatRange
    },
    rule: "Classification is a bounded diagnostic heuristic; no tuning follows automatically."
  };
}

export async function runProductionGearDecompositionMeasurement({
  runs = DEFAULT_RUNS,
  seed = DEFAULT_SEED,
  fixedSeed = FIXED_COMBAT_SEED,
  allowSmallRunCount = false
} = {}) {
  const minimum = allowSmallRunCount ? 1 : DEFAULT_RUNS;
  const normalizedRuns = positiveInteger(runs, "runs", minimum);
  const normalizedSeed = positiveInteger(seed, "seed");
  const normalizedFixedSeed = positiveInteger(fixedSeed, "fixedSeed");
  const gear = Object.fromEntries(CONDITIONS.map(condition => [condition.id, {
    ...condition,
    equipment: equipmentSummary(condition)
  }]));
  const fixed = {};
  const b1f = {};
  for (const condition of CONDITIONS) {
    fixed[condition.id] = await runFixedCombat(condition, normalizedRuns, normalizedFixedSeed);
    b1f[condition.id] = await runB1F(condition, normalizedRuns, normalizedSeed);
  }
  const result = {
    schemaVersion: SCHEMA_VERSION,
    runnerVersion: RUNNER_VERSION,
    question: "production gear performance difference at B1F is decomposed into initiative, weapon, armor/Guard, composite gear, exploration interaction, or horizontal tradeoff",
    evidenceScope: "run",
    configuration: {
      runs: normalizedRuns,
      seed: normalizedSeed,
      fixedCombatSeed: normalizedFixedSeed,
      fixedCompositionIds: COMPOSITIONS.map(composition => composition.id),
      fixedCompositionCount: COMPOSITIONS.length,
      fixedEntryHpRatio: 1,
      policies: POLICIES.map(policy => policy.id),
      conditions: CONDITIONS.map(condition => condition.id),
      matchedWorldSeed: "same seed/run index within B1F; same seed/composition/run index within fixed combat",
      productionSemantics: "production item identity, hand occupancy, Guard, damage, initiative, encounter, movement, trap, poison, flee, and settlement paths",
      omitted: ["loot selection as a treatment", "starting kit changes", "#1176 heavy kit finalization", "N=1000 result from this PR"]
    },
    gear,
    fixed,
    b1f
  };
  return { ...result, decision: classify(result) };
}

function formatRate(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : "—";
}

function buildSummary(report) {
  const lines = [
    "# Production gear decomposition diagnostic (#1173)",
    "",
    `- runner: \`${report.runnerVersion}\`; N=${report.configuration.runs}; B1F seed=${report.configuration.seed}; fixed seed=${report.configuration.fixedCombatSeed}`,
    `- decision: **${report.decision.primary}** (${report.decision.confidence})`,
    "- #1170 absolute values are not reused; actual production representatives are remeasured on current main.",
    "",
    "## Gear identity",
    "",
    "| condition | weapon | armor | shield | ATK | DEF | hands | load | FirstStrike |",
    "| --- | --- | --- | --- | ---: | ---: | ---: | --- | --- |",
    ...Object.values(report.gear).map(condition => {
      const slots = condition.equipment.slots;
      return `| ${condition.id} | ${slots.weapon?.id || "none"} | ${slots.armor?.id || "none"} | ${slots.shield?.id || "none"} | ${condition.equipment.atk} | ${condition.equipment.def} | ${slots.weapon?.hands || 0}/${slots.shield?.hands || 0} | ${condition.equipment.load.class} (${condition.equipment.load.initiativeModifier}) | ${condition.equipment.firstStrike.present ? "yes" : "no"} |`;
    }),
    "",
    "## B1F production path",
    "",
    "| condition | fight B2 | fight death | fight damage mean | fight rounds mean | fight player-before-enemy | flee selected/executed/survived/parting death | steps | trap HP | poison |",
    "| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: |",
    ...Object.values(report.b1f).map((condition, index) => {
      const fight = condition.fight;
      const flee = condition["visible-multi-enemy-flee"];
      return `| ${Object.keys(report.b1f)[index]} | ${formatRate(fight.b2ArrivalRate)} | ${formatRate(fight.runDeathRate)} | ${fight.damageTaken.mean?.toFixed(2) ?? "—"} | ${fight.rounds.mean?.toFixed(2) ?? "—"} | ${formatRate(fight.playerBeforeAnyEnemyRate)} | ${flee.fleeSelected}/${flee.fleeExecuted}/${flee.fleeSurvived}/${flee.fleeDiedFromPartingAttack} | ${condition.fight.steps.mean?.toFixed(2) ?? "—"} | ${condition.fight.trapDamageHp.toFixed(2)} | ${condition.fight.poisonApplications.toFixed(3)} |`;
    }),
    "",
    "## Fixed #1151 representative six-pair path",
    "",
    "- `fight` and `visible-multi-enemy-flee` are separate. Metrics include clear/death, damage, post-clear HP, rounds, enemy actions, first action timing, and flee funnel.",
    ...Object.entries(report.fixed).map(([conditionId, policies]) => {
      const fight = policies.fight.aggregate;
      const flee = policies["visible-multi-enemy-flee"].aggregate;
      return `- ${conditionId}: fight clear ${formatRate(fight.clearRate)}, damage p50 ${fight.damageTaken.p50 ?? "—"}, post-clear HP p50 ${fight.postClearHp.p50 ?? "—"}; flee ${flee.fleeSelected}/${flee.fleeExecuted}/${flee.fleeSurvived}/${flee.fleeDiedFromPartingAttack}`;
    }),
    "",
    "## A–E disposition",
    "",
    `- primary: ${report.decision.primary}`,
    `- evidence: ${JSON.stringify(report.decision.evidence)}`,
    "- no production balance, gear stat, starting kit, or heavy-kit decision changed."
  ];
  return `${lines.join("\n")}\n`;
}

function buildReport(result, provenance, options) {
  const environmentHash = printEnvSignatureBanner({
    runnerVersion: RUNNER_VERSION,
    schemaVersion: SCHEMA_VERSION,
    runs: result.configuration.runs,
    seed: result.configuration.seed,
    fixedCombatSeed: result.configuration.fixedCombatSeed,
    conditions: result.configuration.conditions
  }, { label: "issue1173 production-gear decomposition env" });
  return {
    ...result,
    measurement: {
      scope: readSimScopeDeclaration(import.meta.url)?.name || "run",
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
    }
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const runs = positiveInteger(options.runs || DEFAULT_RUNS, "runs", DEFAULT_RUNS);
  const seed = positiveInteger(options.seed || DEFAULT_SEED, "seed");
  const fixedSeed = positiveInteger(options["fixed-seed"] || FIXED_COMBAT_SEED, "fixed-seed");
  if (!options.output || !options.summary || !options.manifest) {
    throw new Error("--output, --summary, and --manifest are required");
  }
  const provenance = requireRunnerProvenance({
    fetchOriginMain: false,
    measurementRunnerPaths: [RUNNER_PATH, ...PRODUCTION_PATHS]
  });
  const result = await runProductionGearDecompositionMeasurement({ runs, seed, fixedSeed });
  const report = buildReport(result, provenance, options);
  fs.writeFileSync(resolve(options.output), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(resolve(options.summary), buildSummary(report));
  fs.writeFileSync(resolve(options.manifest), `${JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    status: "success",
    runner: RUNNER_VERSION,
    source: report.measurement,
    configuration: report.configuration,
    decision: report.decision,
    workflow: {
      repository: process.env.MEASUREMENT_REPOSITORY || null,
      runId: process.env.MEASUREMENT_WORKFLOW_RUN_ID || null,
      runUrl: process.env.MEASUREMENT_WORKFLOW_RUN_URL || null,
      generatedAt: new Date().toISOString()
    }
  }, null, 2)}\n`);
  console.log(`Wrote Issue #1173 production gear decomposition: ${resolve(options.output)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
