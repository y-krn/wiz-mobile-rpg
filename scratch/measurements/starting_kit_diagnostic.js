// sim-scope: run — production-backed B1F starting-kit survival diagnostic
/* global console, process */

import "../simulations/simulation_preflight.js";
import fs from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { getCharacterEquipmentLoad } from "../../src/rules/equipment_load.js";
import { createStartingKitCharacter } from "../../src/state/initial_state.js";
import { requireRunnerProvenance } from "./measurement_provenance.js";
import { printEnvSignatureBanner, readSimScopeDeclaration } from "./measurement_env_signature.js";

export const RUNNER_VERSION = "issue1196-continuation-resource-v2";
export const SCHEMA_VERSION = 6;
export const STARTING_KIT_IDS = Object.freeze(["vanguard", "scout", "devotion", "arcana"]);
export const EARLY_COMPOSITION_POLICY_IDS = Object.freeze([
  "baseline",
  "suppress-first-multi",
  "suppress-first-two-multi"
]);
export const POLICY_IDS = Object.freeze([
  "fight",
  "flee-threshold",
  "visible-multi-enemy-flee"
]);
export const RECOVERY_POLICY_IDS = Object.freeze(["production", "early-use"]);
export const RECOVERY_RESOURCE_IDS = Object.freeze([
  "HEAL_POTION",
  "GREATER_HEAL",
  "HOLY_WATER",
  "MANA_POTION",
  "ETHER"
]);
export const EARLY_RECOVERY_HP_THRESHOLD = 0.70;
export const DEFAULT_RUNS = 1000;
export const DEFAULT_SEED = 1139;
export const DEFAULT_FLEE_HP_THRESHOLD = 0.20;

const RUNNER_PATH = "scratch/measurements/starting_kit_diagnostic.js";
const PRODUCTION_PATHS = Object.freeze([
  "scratch/simulations/sim_depth_material_ev.js",
  "src/state/initial_state.js",
  "src/state/inventory_state.js",
  "src/state/run_loot.js",
  "src/data.js",
  "src/rules/item_rules.js",
  "src/rules/equipment_load.js",
  "src/data/encounters.js",
  "src/data/items.js",
  "src/rules/chest_rules.js",
  "src/rules/recovery_rules.js",
  "src/systems/item_effects.js",
  "src/combat_ui/encounter.js",
  "src/combat_logic/item_resolution.js",
  "src/combat_logic/rewards.js",
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

export function getDiagnosticWorldSeed(seed, runIndex) {
  return `issue-1176:${seed}:${runIndex}`;
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

const EARLY_SURVIVAL_ORDINALS = Object.freeze([1, 2, 3]);

function createEarlyProgression() {
  return {
    survival: Object.fromEntries(EARLY_SURVIVAL_ORDINALS.map(ordinal => [ordinal, {
      encountered: 0,
      survived: 0
    }])),
    deathEncounterOrdinal: {}
  };
}

function createActionOpportunityRecord() {
  return {
    encountered: 0,
    generatedPairEncounters: 0,
    effectivePairEncounters: 0,
    generatedPairRuns: 0,
    effectivePairRuns: 0,
    deaths: 0,
    deathBeforeFirstPlayerAction: 0,
    firstPlayerActionExecuted: 0,
    firstPlayerActionNotExecuted: 0,
    playerBeforeAnyEnemy: 0,
    afterEnemyAction: 0,
    unobserved: 0,
    enemyActionsBeforeFirstPlayerAction: createDistribution(),
    damageBeforeFirstPlayerAction: createDistribution()
  };
}

function finalizeActionOpportunity(record, runs) {
  return {
    encountered: record.encountered,
    encounteredRate: record.encountered / runs,
    generatedPairEncounters: record.generatedPairEncounters,
    generatedPairEncounterRate: record.encountered > 0
      ? record.generatedPairEncounters / record.encountered
      : null,
    effectivePairEncounters: record.effectivePairEncounters,
    effectivePairEncounterRate: record.encountered > 0
      ? record.effectivePairEncounters / record.encountered
      : null,
    generatedPairRunRate: record.generatedPairRuns / runs,
    effectivePairRunRate: record.effectivePairRuns / runs,
    deaths: record.deaths,
    deathBeforeFirstPlayerAction: record.deathBeforeFirstPlayerAction,
    deathBeforeFirstPlayerActionRate: record.deaths > 0
      ? record.deathBeforeFirstPlayerAction / record.deaths
      : null,
    firstPlayerActionExecuted: record.firstPlayerActionExecuted,
    firstPlayerActionNotExecuted: record.firstPlayerActionNotExecuted,
    firstPlayerActionExecutionRate: record.encountered > 0
      ? record.firstPlayerActionExecuted / record.encountered
      : null,
    playerBeforeAnyEnemy: record.playerBeforeAnyEnemy,
    afterEnemyAction: record.afterEnemyAction,
    unobserved: record.unobserved,
    enemyActionsBeforeFirstPlayerAction: finalizeDistribution(
      record.enemyActionsBeforeFirstPlayerAction
    ),
    damageBeforeFirstPlayerAction: finalizeDistribution(
      record.damageBeforeFirstPlayerAction
    )
  };
}

function observeActionOpportunity(record, encounterRow) {
  record.encountered++;
  record.generatedPairEncounters += Number(encounterRow.rawInitialVisibleEnemyCount >= 2);
  record.effectivePairEncounters += Number(encounterRow.initialVisibleEnemyCount >= 2);
  record.deaths += Number(encounterRow.outcome === "death");
  const timing = encounterRow.firstPlayerActionExecutionTiming;
  if (timing === "player-before-any-enemy") record.playerBeforeAnyEnemy++;
  else if (timing === "after-enemy-action") record.afterEnemyAction++;
  else if (timing === "not-executed-before-end") record.firstPlayerActionNotExecuted++;
  else record.unobserved++;
  record.firstPlayerActionExecuted += Number(encounterRow.firstPlayerActionExecuted);
  record.deathBeforeFirstPlayerAction += Number(
    encounterRow.outcome === "death" && !encounterRow.firstPlayerActionExecuted
  );
  addDistribution(
    record.enemyActionsBeforeFirstPlayerAction,
    encounterRow.enemyActionsBeforeFirstPlayerAction
  );
  addDistribution(
    record.damageBeforeFirstPlayerAction,
    encounterRow.damageBeforeFirstPlayerAction
  );
}

function firstEvent(events, predicate) {
  return events.find(predicate) || null;
}

function createOpportunityRecord() {
  return {
    runsWithOpportunity: 0,
    deathsBeforeOpportunity: 0,
    firstEncounterOrdinal: createDistribution(),
    firstStep: createDistribution()
  };
}

function observeOpportunity(record, event, runDied) {
  if (event) {
    record.runsWithOpportunity++;
    addDistribution(record.firstEncounterOrdinal, event.encounterOrdinal);
    addDistribution(record.firstStep, event.step);
  } else if (runDied) {
    record.deathsBeforeOpportunity++;
  }
}

function finalizeOpportunity(record, runs, totalDeaths) {
  return {
    runsWithOpportunity: record.runsWithOpportunity,
    opportunityRate: record.runsWithOpportunity / runs,
    deathsBeforeOpportunity: record.deathsBeforeOpportunity,
    deathBeforeOpportunityRate: totalDeaths > 0
      ? record.deathsBeforeOpportunity / totalDeaths
      : null,
    firstEncounterOrdinal: finalizeDistribution(record.firstEncounterOrdinal),
    firstStep: finalizeDistribution(record.firstStep)
  };
}

function createResourceFunnelRecord() {
  return {
    runsWithAcquisition: 0,
    runsUsable: 0,
    runsUsed: 0,
    runsCarriedUnused: 0,
    acquiredUnits: 0,
    usedUnits: 0,
    actualHpRecovered: 0,
    actualMpRecovered: 0,
    firstEncounterOrdinal: createDistribution(),
    firstStep: createDistribution(),
    firstItemById: {},
    acquiredBySource: {},
    exposure: {
      single: createDistribution(),
      pair: createDistribution(),
      unobserved: createDistribution()
    }
  };
}

function finalizeResourceFunnelRecord(record, runs) {
  return {
    runsWithAcquisition: record.runsWithAcquisition,
    acquisitionRate: record.runsWithAcquisition / runs,
    runsUsable: record.runsUsable,
    usableRate: record.runsUsable / runs,
    runsUsed: record.runsUsed,
    usedRate: record.runsUsed / runs,
    runsCarriedUnused: record.runsCarriedUnused,
    carriedUnusedRate: record.runsCarriedUnused / runs,
    acquiredUnits: record.acquiredUnits,
    usedUnits: record.usedUnits,
    actualHpRecovered: record.actualHpRecovered,
    actualMpRecovered: record.actualMpRecovered,
    firstEncounterOrdinal: finalizeDistribution(record.firstEncounterOrdinal),
    firstStep: finalizeDistribution(record.firstStep),
    firstItemById: { ...record.firstItemById },
    acquiredBySource: { ...record.acquiredBySource },
    exposure: Object.fromEntries(
      Object.entries(record.exposure).map(([exposure, distribution]) => [
        exposure,
        finalizeDistribution(distribution)
      ])
    )
  };
}

function createContinuationResourceRecord() {
  return Object.fromEntries(
    [2, 3].map(ordinal => [String(ordinal), {
      runsObserved: 0,
      cohortRuns: 0,
      cohortEndedBeforeArrival: 0,
      cohortDeathsBeforeArrival: 0,
      resourceOpportunityRuns: 0,
      byItem: Object.fromEntries(
        RECOVERY_RESOURCE_IDS.map(itemId => [itemId, createResourceFunnelRecord()])
      ),
      rows: []
    }])
  );
}

function itemCount(snapshot, itemId) {
  return Number(snapshot?.[itemId]) || 0;
}

export function isEventBeforeTargetEncounter(event, targetOrdinal, fromOrdinal) {
  const ordinal = Number(event?.encounterOrdinal);
  return Number.isInteger(ordinal) && ordinal >= fromOrdinal && ordinal < targetOrdinal;
}

function isEventBeforeTargetBoundary(event, targetOrdinal, targetRow = null) {
  if (!isEventBeforeTargetEncounter(event, targetOrdinal, 0)) return false;
  return !targetRow || Number(event.step) <= Number(targetRow.startStep);
}

export function isEventBetweenEncounters(event, fromRow, nextRow = null) {
  const ordinal = Number(event?.encounterOrdinal);
  if (!fromRow || ordinal !== Number(fromRow.encounterOrdinal)) return false;
  const step = Number(event.step);
  if (!Number.isFinite(step) || step < Number(fromRow.endStep)) return false;
  return !nextRow || step <= Number(nextRow.startStep);
}

function summarizeRecoveryEvent(event) {
  return event && {
    itemId: event.itemId,
    context: event.context,
    floor: event.floor,
    step: event.step,
    encounterOrdinal: event.encounterOrdinal,
    hpRecovered: event.hpRecovered,
    mpRecovered: event.mpRecovered
  };
}

function createHpBandCounts() {
  return Object.fromEntries(["100", "75", "50", "25"].map(id => [id, 0]));
}

function hpBandId(hpRate) {
  if (!Number.isFinite(hpRate)) return null;
  if (hpRate >= 0.875) return "100";
  if (hpRate >= 0.625) return "75";
  if (hpRate >= 0.375) return "50";
  return "25";
}

function recordResourceFunnel(record, acquisitions, uses, usableCount, exposure) {
  const acquired = acquisitions.length;
  const used = uses.length;
  const usable = acquisitions.some(event => event.playerUsableAtAcquisition === true)
    || uses.length > 0
    || usableCount > 0;
  if (acquired > 0) record.runsWithAcquisition++;
  if (usable) record.runsUsable++;
  if (used > 0) record.runsUsed++;
  if (usableCount > 0) record.runsCarriedUnused++;
  record.acquiredUnits += acquired;
  record.usedUnits += used;
  record.actualHpRecovered += uses.reduce((sum, event) => sum + (event.hpRecovered || 0), 0);
  record.actualMpRecovered += uses.reduce((sum, event) => sum + (event.mpRecovered || 0), 0);
  if (acquisitions[0]) {
    addDistribution(record.firstEncounterOrdinal, acquisitions[0].encounterOrdinal);
    addDistribution(record.firstStep, acquisitions[0].step);
    record.firstItemById[acquisitions[0].itemId] =
      (record.firstItemById[acquisitions[0].itemId] || 0) + 1;
  }
  acquisitions.forEach(event => {
    record.acquiredBySource[event.source] =
      (record.acquiredBySource[event.source] || 0) + 1;
  });
  addDistribution(record.exposure[exposure], usableCount);
}

function observeContinuationResources(
  aggregate,
  result,
  encounterRows,
  rewardEvents,
  runIndex
) {
  const recoveryEvents = result.diagnostics?.recoveryEvents || [];
  const costEvents = result.diagnostics?.costEvents || [];
  [2, 3].forEach(targetOrdinal => {
    const fromRow = encounterRows[targetOrdinal - 2];
    const targetRow = encounterRows[targetOrdinal - 1];
    if (!fromRow || fromRow.outcome === "death") return;
    const bucket = aggregate.continuationResource[String(targetOrdinal)];
    bucket.cohortRuns++;
    if (targetRow) bucket.runsObserved++;
    else {
      bucket.cohortEndedBeforeArrival++;
      bucket.cohortDeathsBeforeArrival += Number(result.outcome === "death");
    }
    const acquiredBefore = rewardEvents.filter(event =>
      RECOVERY_RESOURCE_IDS.includes(event.itemId) &&
      event.disposition === "bagged" &&
      isEventBeforeTargetBoundary(event, targetOrdinal, targetRow)
    );
    const targetUses = recoveryEvents.filter(event =>
      isEventBeforeTargetBoundary(event, targetOrdinal, targetRow)
    );
    const exposure = targetRow
      ? targetRow.initialVisibleEnemyCount >= 2 ? "pair" : "single"
      : "unobserved";
    const row = {
      runIndex,
      encounterOrdinal: targetOrdinal,
      entryHpRate: targetRow?.hpRateBeforeEncounter ?? null,
      entryMpRate: targetRow?.mpRateBeforeEncounter ?? null,
      exposure,
      reachedTarget: Boolean(targetRow),
      runEndOutcome: targetRow ? null : result.outcome,
      resourceOpportunity: acquiredBefore.length > 0,
      byItem: {}
    };
    if (acquiredBefore.length > 0) bucket.resourceOpportunityRuns++;
    RECOVERY_RESOURCE_IDS.forEach(itemId => {
      const acquisitions = acquiredBefore.filter(event => event.itemId === itemId);
      const uses = targetUses.filter(event => event.itemId === itemId);
      const inventoryCount = itemCount(targetRow?.startRecoveryInventory, itemId);
      const usableCount = targetRow?.startRecoveryEligibility?.[itemId]
        ? inventoryCount
        : 0;
      const record = bucket.byItem[itemId];
      recordResourceFunnel(record, acquisitions, uses, usableCount, exposure);
      row.byItem[itemId] = {
        acquired: acquisitions.length,
        usable: usableCount,
        inventoryCount,
        used: uses.length,
        carriedUnused: Math.max(0, inventoryCount - uses.length),
        actualHpRecovered: uses.reduce((sum, event) => sum + (event.hpRecovered || 0), 0),
        actualMpRecovered: uses.reduce((sum, event) => sum + (event.mpRecovered || 0), 0),
        firstAcquisition: summarizeRecoveryEvent(acquisitions[0])
      };
    });
    bucket.rows.push(row);

    if (!targetRow) {
      bucket.rows.push(row);
      return;
    }
    const band = hpBandId(targetRow.hpRateBeforeEncounter);
    if (band) {
      aggregate.naturalEntryHpBands[band]++;
      const bandRecord = aggregate.naturalEntryHpBandResource[band];
      bandRecord.entries++;
      bandRecord.resourceOpportunityRuns += Number(acquiredBefore.length > 0);
      bandRecord.actualHpRecovered += targetUses.reduce(
        (sum, event) => sum + (event.hpRecovered || 0),
        0
      );
      bandRecord.actualMpRecovered += targetUses.reduce(
        (sum, event) => sum + (event.mpRecovered || 0),
        0
      );
    }
  });

  for (let index = 0; index < encounterRows.length - 1; index++) {
    const current = encounterRows[index];
    const next = encounterRows[index + 1];
    const recoveryBetween = recoveryEvents.filter(event =>
      isEventBetweenEncounters(event, current, next)
    );
    const costBetween = costEvents.filter(event =>
      isEventBetweenEncounters(event, current, next) &&
      event.source !== "combat" &&
      !["normal", "elite", "midboss", "boss"].includes(event.source)
    );
    aggregate.trajectoryRows.push({
      runIndex,
      fromEncounterOrdinal: current.encounterOrdinal,
      toEncounterOrdinal: next.encounterOrdinal,
      fromOutcome: current.outcome,
      postCombatHp: current.hpAfterEncounter,
      nextEntryHp: next.hpBeforeEncounter,
      postCombatHpRate: current.hpAfterEncounter !== null && current.maxHpBeforeEncounter
        ? current.hpAfterEncounter / Math.max(1, current.maxHpBeforeEncounter)
        : null,
      nextEntryHpRate: next.hpRateBeforeEncounter,
      postCombatMp: current.mpAfterEncounter,
      nextEntryMp: next.mpBeforeEncounter,
      explorationCostHp: costBetween.reduce((sum, event) => sum + (event.hpCost || 0), 0),
      explorationCostBySource: costBetween.reduce((counts, event) => {
        counts[event.source] = (counts[event.source] || 0) + (event.hpCost || 0);
        return counts;
      }, {}),
      recoveryHp: recoveryBetween.reduce((sum, event) => sum + (event.hpRecovered || 0), 0),
      recoveryMp: recoveryBetween.reduce((sum, event) => sum + (event.mpRecovered || 0), 0),
      recoveryUses: recoveryBetween.length,
      resourceInventoryAtNextEntry: next.startRecoveryInventory
    });
  }
}

function finalizeContinuationResources(aggregate) {
  return Object.fromEntries(
    Object.entries(aggregate.continuationResource).map(([ordinal, bucket]) => [ordinal, {
      runsObserved: bucket.runsObserved,
      cohortRuns: bucket.cohortRuns,
      cohortArrived: bucket.runsObserved,
      cohortEndedBeforeArrival: bucket.cohortEndedBeforeArrival,
      cohortDeathsBeforeArrival: bucket.cohortDeathsBeforeArrival,
      resourceOpportunityRuns: bucket.resourceOpportunityRuns,
      resourceOpportunityRate: bucket.cohortRuns > 0
        ? bucket.resourceOpportunityRuns / bucket.cohortRuns
        : null,
      observedResourceOpportunityRate: bucket.runsObserved > 0
        ? bucket.resourceOpportunityRuns / bucket.runsObserved
        : null,
      byItem: Object.fromEntries(
        Object.entries(bucket.byItem).map(([itemId, record]) => [
          itemId,
          finalizeResourceFunnelRecord(record, bucket.cohortRuns)
        ])
      ),
      rows: bucket.rows
    }])
  );
}

function finalizeTrajectoryRows(rows) {
  const byTransition = {};
  rows.forEach(row => {
    const key = `${row.fromEncounterOrdinal}->${row.toEncounterOrdinal}`;
    const summary = byTransition[key] ||= {
      count: 0,
      postCombatHp: createDistribution(),
      nextEntryHp: createDistribution(),
      postCombatMp: createDistribution(),
      nextEntryMp: createDistribution(),
      explorationCostHp: createDistribution(),
      recoveryHp: createDistribution(),
      recoveryMp: createDistribution(),
      recoveryUses: createDistribution()
    };
    summary.count++;
    addDistribution(summary.postCombatHp, row.postCombatHp);
    addDistribution(summary.nextEntryHp, row.nextEntryHp);
    addDistribution(summary.postCombatMp, row.postCombatMp);
    addDistribution(summary.nextEntryMp, row.nextEntryMp);
    addDistribution(summary.explorationCostHp, row.explorationCostHp);
    addDistribution(summary.recoveryHp, row.recoveryHp);
    addDistribution(summary.recoveryMp, row.recoveryMp);
    addDistribution(summary.recoveryUses, row.recoveryUses);
  });
  return {
    rows,
    byTransition: Object.fromEntries(
      Object.entries(byTransition).map(([key, summary]) => [key, {
        count: summary.count,
        postCombatHp: finalizeDistribution(summary.postCombatHp),
        nextEntryHp: finalizeDistribution(summary.nextEntryHp),
        postCombatMp: finalizeDistribution(summary.postCombatMp),
        nextEntryMp: finalizeDistribution(summary.nextEntryMp),
        explorationCostHp: finalizeDistribution(summary.explorationCostHp),
        recoveryHp: finalizeDistribution(summary.recoveryHp),
        recoveryMp: finalizeDistribution(summary.recoveryMp),
        recoveryUses: finalizeDistribution(summary.recoveryUses)
      }])
    )
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
    combatRounds: 0,
    trapDamageHp: 0,
    poisonApplications: 0,
    damageHpBySource: {},
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
    initialVisibleEnemyCounts: {},
    encounterRows: [],
    earlyProgression: createEarlyProgression(),
    earlyActionOpportunity: {
      byEncounterOrdinal: Object.fromEntries(
        [1, 2].map(ordinal => [ordinal, createActionOpportunityRecord()])
      )
    },
    rewardOpportunity: {
      meaningfulReward: createOpportunityRecord(),
      objectLoot: createOpportunityRecord(),
      buildChangeOpportunity: createOpportunityRecord(),
      buildChange: createOpportunityRecord(),
      rows: [],
      rewardEventCount: 0
    },
    continuationResource: createContinuationResourceRecord(),
    trajectoryRows: [],
    naturalEntryHpBands: createHpBandCounts(),
    naturalEntryHpBandResource: Object.fromEntries(
      ["100", "75", "50", "25"].map(id => [id, {
        entries: 0,
        resourceOpportunityRuns: 0,
        actualHpRecovered: 0,
        actualMpRecovered: 0
      }])
    )
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
  const firstRound = rounds[0] || null;
  return {
    runIndex,
    encounterOrdinal,
    floor: identity.floor ?? diagnostic?.floor ?? null,
    type: identity.type ?? diagnostic?.type ?? null,
    startStep: diagnostic?.startStep ?? null,
    endStep: diagnostic?.endStep ?? null,
    initialVisibleEnemyCount: diagnostic?.initialVisibleEnemyCount ?? enemyNames.length,
    rawInitialVisibleEnemyCount: diagnostic?.generatedInitialVisibleEnemyCount ?? enemyNames.length,
    earlyCompositionPolicy: diagnostic?.earlyCompositionPolicy || "baseline",
    earlyCompositionSuppressed: diagnostic?.earlyCompositionSuppressed === true,
    initialCompositionKey: compositionKey(identity.enemyNames || []),
    generatedCompositionKey: diagnostic?.generatedCompositionKey || identity.generatedCompositionKey || compositionKey(identity.enemyNames || []),
    effectiveCompositionKey: diagnostic?.effectiveCompositionKey || compositionKey(identity.enemyNames || []),
    earlyCompositionCandidate: diagnostic?.earlyCompositionCandidate || null,
    earlyCompositionCandidateAction: diagnostic?.earlyCompositionCandidateAction || "none",
    earlyCompositionDeferredKey: diagnostic?.earlyCompositionDeferredKey || null,
    earlyCompositionReplacementKey: diagnostic?.earlyCompositionReplacementKey || null,
    earlyCompositionReplacementTrial: diagnostic?.earlyCompositionReplacementTrial || null,
    earlyCompositionReplacementRandomStateBefore: diagnostic?.earlyCompositionReplacementRandomStateBefore ?? null,
    earlyCompositionReplacementRandomStateAfter: diagnostic?.earlyCompositionReplacementRandomStateAfter ?? null,
    generatedTrial: diagnostic?.generatedTrial || identity.generatedTrial || null,
    initialCompositionEnemyNames: enemyNames,
    outcome: identity.outcome || diagnostic?.result || "unknown",
    hpBeforeEncounter,
    maxHpBeforeEncounter,
    hpRateBeforeEncounter,
    hpAfterEncounter: identity.hpAfter ?? diagnostic?.endHp ?? null,
    mpBeforeEncounter,
    maxMpBeforeEncounter,
    mpRateBeforeEncounter,
    mpAfterEncounter: identity.mpAfter ?? diagnostic?.endMp ?? null,
    startRecoveryInventory: diagnostic?.startRecoveryInventory || {},
    startRecoveryEligibility: diagnostic?.startRecoveryEligibility || {},
    endRecoveryInventory: diagnostic?.endRecoveryInventory || {},
    endRecoveryEligibility: diagnostic?.endRecoveryEligibility || {},
    combatRounds: identity.rounds ?? (rounds.length || null),
    enemyActionCount: identity.enemyActions ?? null,
    normalDamage: identity.totalNormalDamage ?? identity.normalDamage ?? null,
    firstPlayerActionExecutionTiming: firstRound?.playerActionExecutionTiming || "unobserved",
    firstPlayerActionExecuted: firstRound?.playerActionExecuted === true,
    enemyActionsBeforeFirstPlayerAction: firstRound?.enemyActionsBeforeFirstPlayerAction ?? null,
    damageBeforeFirstPlayerAction: firstRound?.damageBeforeFirstPlayerAction ?? null,
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
  aggregate.combatRounds += result.combatRounds || 0;
  aggregate.trapDamageHp += result.trapDamageHp || 0;
  aggregate.poisonApplications += result.statusObservations?.byStatus?.poisoned?.applications || 0;
  Object.entries(result.damageHpBySource || {}).forEach(([source, damage]) => {
    aggregate.damageHpBySource[source] = (aggregate.damageHpBySource[source] || 0) + damage;
  });
  const diagnostics = result.diagnostics?.encounters || [];
  const diagnosticsByOrdinal = new Map(diagnostics.map((diagnostic, index) => [index, diagnostic]));
  const encounterRows = encounters.map((identity, index) =>
    createEncounterRow(runIndex, index + 1, identity, diagnosticsByOrdinal.get(index))
  );

  EARLY_SURVIVAL_ORDINALS.forEach(ordinal => {
    const survival = aggregate.earlyProgression.survival[ordinal];
    if (encounters.length < ordinal) return;
    survival.encountered++;
    if (encounters.slice(0, ordinal).every(encounter => encounter.outcome !== "death")) {
      survival.survived++;
    }
  });
  if (result.outcome === "death") {
    const deathEncounter = encounters.findIndex(encounter => encounter.outcome === "death");
    const ordinal = deathEncounter >= 0 ? deathEncounter + 1 : "unknown";
    increment(aggregate.earlyProgression.deathEncounterOrdinal, ordinal);
  }

  const rewardEvents = result.diagnostics?.rewardEvents || [];
  const firstMeaningfulReward = firstEvent(rewardEvents, event => event.meaningful === true);
  const firstObjectLoot = firstEvent(rewardEvents, event => event.objectLoot === true);
  const firstBuildChangeOpportunity = firstEvent(
    rewardEvents,
    event => event.category === "equipment" && event.disposition === "bagged"
  );
  const firstBuildChange = firstEvent(
    result.equipmentTelemetry || [],
    event => event.type === "swap"
  );
  observeOpportunity(
    aggregate.rewardOpportunity.meaningfulReward,
    firstMeaningfulReward,
    result.outcome === "death"
  );
  observeOpportunity(
    aggregate.rewardOpportunity.objectLoot,
    firstObjectLoot,
    result.outcome === "death"
  );
  observeOpportunity(
    aggregate.rewardOpportunity.buildChangeOpportunity,
    firstBuildChangeOpportunity,
    result.outcome === "death"
  );
  observeOpportunity(
    aggregate.rewardOpportunity.buildChange,
    firstBuildChange,
    result.outcome === "death"
  );
  aggregate.rewardOpportunity.rewardEventCount += rewardEvents.length;
  const summarizeEvent = event => event && {
    source: event.source,
    disposition: event.disposition,
    floor: event.floor,
    step: event.step,
    encounterOrdinal: event.encounterOrdinal,
    category: event.category,
    itemType: event.itemType,
    isCore: event.isCore,
    objectLoot: event.objectLoot
  };
  aggregate.rewardOpportunity.rows.push({
    runIndex,
    outcome: result.outcome,
    firstMeaningfulReward: summarizeEvent(firstMeaningfulReward),
    firstObjectLoot: summarizeEvent(firstObjectLoot),
    firstBuildChangeOpportunity: summarizeEvent(firstBuildChangeOpportunity),
    firstBuildChange: summarizeEvent(firstBuildChange)
  });
  observeContinuationResources(
    aggregate,
    result,
    encounterRows,
    rewardEvents,
    runIndex
  );
  const runCompositionKeys = new Set();
  const runEnemyNames = new Set();
  encounters.forEach((identity, index) => {
    const key = compositionKey(identity.enemyNames || []);
    const composition = aggregate.compositions[key] ||= createCompositionRecord();
    const diagnostic = diagnosticsByOrdinal.get(index);
    const encounterRow = encounterRows[index];
    const visibleCount = String(encounterRow.initialVisibleEnemyCount);
    const visibleRecord = aggregate.initialVisibleEnemyCounts[visibleCount] ||= {
      encounters: 0,
      deaths: 0
    };
    visibleRecord.encounters++;
    visibleRecord.deaths += Number(identity.outcome === "death");
    aggregate.encounterRows.push(encounterRow);
    if (index < 2) {
      const opportunity = aggregate.earlyActionOpportunity.byEncounterOrdinal[index + 1];
      observeActionOpportunity(opportunity, encounterRow);
      opportunity.generatedPairRuns += Number(encounterRow.rawInitialVisibleEnemyCount >= 2);
      opportunity.effectivePairRuns += Number(encounterRow.initialVisibleEnemyCount >= 2);
    }
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
  const earlyProgression = {
    survival: Object.fromEntries(EARLY_SURVIVAL_ORDINALS.map(ordinal => {
      const record = aggregate.earlyProgression.survival[ordinal];
      return [ordinal, {
        encountered: record.encountered,
        encounteredRate: record.encountered / aggregate.runs,
        survived: record.survived,
        survivedRate: record.survived / aggregate.runs,
        conditionalSurvivalRate: record.encountered > 0
          ? record.survived / record.encountered
          : null
      }];
    })),
    deathEncounterOrdinal: { ...aggregate.earlyProgression.deathEncounterOrdinal }
  };
  const rewardOpportunity = {
    rewardEventCount: aggregate.rewardOpportunity.rewardEventCount,
    byType: {
      meaningfulReward: finalizeOpportunity(
        aggregate.rewardOpportunity.meaningfulReward,
        aggregate.runs,
        totalDeaths
      ),
      objectLoot: finalizeOpportunity(
        aggregate.rewardOpportunity.objectLoot,
        aggregate.runs,
        totalDeaths
      ),
      buildChangeOpportunity: finalizeOpportunity(
        aggregate.rewardOpportunity.buildChangeOpportunity,
        aggregate.runs,
        totalDeaths
      ),
      buildChange: finalizeOpportunity(
        aggregate.rewardOpportunity.buildChange,
        aggregate.runs,
        totalDeaths
      )
    },
    rows: aggregate.rewardOpportunity.rows
  };
  const earlyActionOpportunity = {
    byEncounterOrdinal: Object.fromEntries(
      Object.entries(aggregate.earlyActionOpportunity.byEncounterOrdinal)
        .map(([ordinal, record]) => [ordinal, finalizeActionOpportunity(record, aggregate.runs)])
    )
  };
  const naturalEntryHpBandResource = Object.fromEntries(
    Object.entries(aggregate.naturalEntryHpBandResource).map(([band, record]) => [band, {
      entries: record.entries,
      resourceOpportunityRuns: record.resourceOpportunityRuns,
      resourceOpportunityRate: record.entries > 0
        ? record.resourceOpportunityRuns / record.entries
        : null,
      actualHpRecovered: record.actualHpRecovered,
      actualMpRecovered: record.actualMpRecovered,
      averageHpRecovered: record.entries > 0
        ? record.actualHpRecovered / record.entries
        : null,
      averageMpRecovered: record.entries > 0
        ? record.actualMpRecovered / record.entries
        : null
      }])
  );
  const continuationResource = finalizeContinuationResources(aggregate);
  const linkedTrajectory = finalizeTrajectoryRows(aggregate.trajectoryRows);
  linkedTrajectory.cohortByTransition = Object.fromEntries(
    Object.entries(continuationResource).map(([ordinal, bucket]) => [
      `${Number(ordinal) - 1}->${ordinal}`,
      {
        eligibleRuns: bucket.cohortRuns,
        arrivedRuns: bucket.cohortArrived,
        endedBeforeArrival: bucket.cohortEndedBeforeArrival,
        deathsBeforeArrival: bucket.cohortDeathsBeforeArrival,
        arrivalRate: bucket.cohortRuns > 0
          ? bucket.cohortArrived / bucket.cohortRuns
          : null
      }
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
      averageCombatCount: aggregate.combatCount.values.reduce((sum, value) => sum + value, 0) / aggregate.runs,
      averageCombatRounds: aggregate.combatRounds / aggregate.runs,
      trapDamageHp: aggregate.trapDamageHp,
      poisonApplications: aggregate.poisonApplications
    },
    earlyProgression,
    earlyActionOpportunity,
    rewardOpportunity,
    continuationResource,
    linkedTrajectory,
    naturalEntryHpBands: { ...aggregate.naturalEntryHpBands },
    naturalEntryHpBandResource,
    encounterExposure: {
      enemyEncounterCount: aggregate.encounterCount,
      enemyEncounterRatePerRun: aggregate.encounterCount / aggregate.runs,
      compositionCount: Object.keys(aggregate.compositions).length,
      encounterRows: aggregate.encounterRows,
      byInitialVisibleEnemyCount: Object.fromEntries(
        Object.entries(aggregate.initialVisibleEnemyCounts)
          .sort(([left], [right]) => Number(left) - Number(right))
          .map(([count, record]) => [count, {
            encounters: record.encounters,
            deaths: record.deaths,
            encounterLethalityRate: record.encounters > 0 ? record.deaths / record.encounters : null
          }])
      ),
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
      nonCombat: {
        trapDamageHp: aggregate.trapDamageHp,
        poisonApplications: aggregate.poisonApplications,
        damageHpBySource: { ...aggregate.damageHpBySource }
      },
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

export function createDiagnosticScenario({
  startingKit,
  policy,
  recoveryPolicy = "production",
  fleeHpThreshold,
  earlyCompositionPolicy = "baseline",
  earlyCompositionCandidate = null
}) {
  assertOneOf(startingKit, STARTING_KIT_IDS, "startingKit");
  assertOneOf(policy, POLICY_IDS, "policy");
  assertOneOf(recoveryPolicy, RECOVERY_POLICY_IDS, "recoveryPolicy");
  assertOneOf(
    earlyCompositionPolicy,
    EARLY_COMPOSITION_POLICY_IDS,
    "earlyCompositionPolicy"
  );
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
    fleePolicy: policy === "fight"
      ? "never"
      : policy === "flee-threshold" ? "threshold" : "visible-multi-enemy-flee",
    fleeHpThreshold: policy === "flee-threshold" ? threshold : null,
    ...(recoveryPolicy === "early-use"
      ? { healPotionThreshold: EARLY_RECOVERY_HP_THRESHOLD }
      : {}),
    earlyEncounterMultiEnemyPolicy: earlyCompositionPolicy,
    earlyCompositionCandidate,
    consumablesAtDeparture: "none"
  };
}

export async function runDiagnostic({
  startingKit = "vanguard",
  policy = "fight",
  recoveryPolicy = "production",
  fleeHpThreshold = DEFAULT_FLEE_HP_THRESHOLD,
  runs = DEFAULT_RUNS,
  seed = DEFAULT_SEED,
  earlyCompositionPolicy = "baseline",
  earlyCompositionCandidate = null,
  allowSmallRunCount = false
} = {}) {
  const normalizedRuns = parsePositiveInteger(runs, "runs", { minimum: allowSmallRunCount ? 1 : DEFAULT_RUNS });
  const normalizedSeed = parsePositiveInteger(seed, "seed");
  resetSimulationRandom(normalizedSeed);
  const scenario = createDiagnosticScenario({
    startingKit,
    policy,
    recoveryPolicy,
    fleeHpThreshold,
    earlyCompositionPolicy,
    earlyCompositionCandidate
  });
  const aggregate = createAggregate(normalizedRuns);
  for (let runIndex = 0; runIndex < normalizedRuns; runIndex++) {
    const result = simulateRun({
      className: "Fighter",
      startFloor: 1,
      targetDepth: 2,
      runIndex,
      seriesId: "issue-1196:b1f",
      scoringProfile: null,
      scenario,
      workshop: { ranks: {} },
      worldSeed: getDiagnosticWorldSeed(normalizedSeed, runIndex),
      collectDiagnostics: true,
      collectEquipmentTelemetry: true
    });
    observeRun(aggregate, result, runIndex);
  }
  const configuration = {
    startingKit,
    equipmentLoad: getCharacterEquipmentLoad(createStartingKitCharacter(startingKit)),
    policy,
    recoveryPolicy,
    earlyRecoveryHpThreshold: recoveryPolicy === "early-use"
      ? EARLY_RECOVERY_HP_THRESHOLD
      : null,
    earlyCompositionPolicy,
    earlyCompositionCandidate,
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
    seedPolicy: "simulation RNG reset to seed before run; deterministic policy-independent worldSeed per run",
    worldSeedTemplate: "issue-1176:{seed}:{runIndex}",
    matchedComparisonKey: `${startingKit}:${policy}:${recoveryPolicy}:${normalizedSeed}:${normalizedRuns}`,
    runs: normalizedRuns
  };
  return finalizeAggregate(aggregate, configuration);
}

export async function runMatchedRecoveryPolicies(options = {}) {
  const production = await runDiagnostic({
    ...options,
    recoveryPolicy: "production"
  });
  const earlyUse = await runDiagnostic({
    ...options,
    recoveryPolicy: "early-use"
  });
  return {
    comparisonKey: `${production.configuration.startingKit}:${production.configuration.policy}:${production.configuration.seed}:${production.configuration.runs}`,
    production,
    earlyUse
  };
}

function buildReport({
  result,
  startingKit,
  policy,
  recoveryPolicy,
  fleeHpThreshold,
  earlyCompositionPolicy,
  runs,
  seed,
  provenance,
  purpose,
  requestedRef
}) {
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
    recoveryPolicy,
    fleeHpThreshold,
    earlyCompositionPolicy
  };
  const envHash = printEnvSignatureBanner(environment, { label: "issue1196" });
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
    "# Issue #1196 starting-kit continuation-resource diagnostic",
    "",
    `- runner: \`${report.runnerVersion}\` / schema: ${report.schemaVersion}`,
    `- source SHA: \`${measurement.sourceCommit || "not recorded"}\``,
    `- kit / load / encounter policy / recovery policy / N: \`${result.configuration.startingKit}\` / ${result.configuration.equipmentLoad.label} (${result.configuration.equipmentLoad.class}) / \`${result.configuration.policy}\` / \`${result.configuration.recoveryPolicy}\` / ${result.configuration.runs}`,
    `- seed: ${result.configuration.seed}; consumables at departure: none`,
    "",
    "## Run outcome",
    "",
    `- B1F death rate: ${(outcome.b1DeathRate * 100).toFixed(2)}%`,
    `- B2 arrival / B1 breakthrough: ${(outcome.b2ArrivalRate * 100).toFixed(2)}%`,
    `- flee selected / executed / selected-but-not-executed: ${outcome.fleeSelected} / ${outcome.fleeExecuted} / ${outcome.fleeSelectedButNotExecuted}`,
    `- flee survived / died from parting attack: ${outcome.fleeSurvived} / ${outcome.fleeDiedFromPartingAttack}; execution survival: ${outcome.fleeSurvivalRate === null ? "unobserved" : `${(outcome.fleeSurvivalRate * 100).toFixed(2)}%`}`,
    `- average deepest floor / steps / combat count: ${outcome.averageDeepestFloor.toFixed(3)} / ${outcome.averageSteps.toFixed(2)} / ${outcome.averageCombatCount.toFixed(2)}`,
    `- average combat rounds / trap damage HP / poison applications: ${outcome.averageCombatRounds.toFixed(2)} / ${outcome.trapDamageHp} / ${outcome.poisonApplications}`,
    "",
    "## Early survival curve",
    "",
    ...Object.entries(result.earlyProgression.survival).map(([ordinal, values]) =>
      `- through encounter ${ordinal}: ${values.survived}/${result.runs} survived (${(values.survivedRate * 100).toFixed(2)}%); observed ${values.encountered}/${result.runs}`
    ),
    `- death encounter ordinal: ${JSON.stringify(result.earlyProgression.deathEncounterOrdinal)}`,
    "",
    "## Continuation resources",
    "",
    ...Object.entries(result.continuationResource).map(([ordinal, values]) =>
      `- before encounter ${ordinal}: observed ${values.runsObserved}/${result.runs}; any resource acquired ${values.resourceOpportunityRuns}/${values.runsObserved} (${values.resourceOpportunityRate === null ? "unobserved" : `${(values.resourceOpportunityRate * 100).toFixed(2)}%`})`
    ),
    ...Object.entries(result.linkedTrajectory.byTransition).map(([transition, values]) =>
      `- ${transition}: post-combat HP p50 ${values.postCombatHp.p50 ?? "unobserved"} → next-entry HP p50 ${values.nextEntryHp.p50 ?? "unobserved"}; exploration Cost HP p50 ${values.explorationCostHp.p50 ?? "unobserved"}; recovery HP p50 ${values.recoveryHp.p50 ?? "unobserved"}`
    ),
    `- natural entry HP bands: ${JSON.stringify(result.naturalEntryHpBands)}`,
    "",
    "## First meaningful opportunity",
    "",
    ...Object.entries(result.rewardOpportunity.byType).map(([type, values]) =>
      `- ${type}: ${values.runsWithOpportunity}/${result.runs} runs (${(values.opportunityRate * 100).toFixed(2)}%); deaths before opportunity ${values.deathsBeforeOpportunity}/${result.deathContribution.totalDeaths}`
    ),
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
    "- report is diagnostic evidence only; no balance values are tuned; Build change opportunity and automatic swap are reported separately",
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
  const recoveryPolicy = CLI_OPTIONS["recovery-policy"] || "production";
  const earlyCompositionPolicy =
    CLI_OPTIONS["early-composition-policy"] || "baseline";
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
  assertOneOf(recoveryPolicy, RECOVERY_POLICY_IDS, "recoveryPolicy");
  assertOneOf(
    earlyCompositionPolicy,
    EARLY_COMPOSITION_POLICY_IDS,
    "earlyCompositionPolicy"
  );
  const provenance = requireRunnerProvenance({
    fetchOriginMain: false,
    measurementRunnerPaths: [RUNNER_PATH, ...PRODUCTION_PATHS]
  });
  const result = await runDiagnostic({
    startingKit,
    policy,
    recoveryPolicy,
    fleeHpThreshold,
    earlyCompositionPolicy,
    runs,
    seed
  });
  const report = buildReport({
    result,
    startingKit,
    policy,
    recoveryPolicy,
    fleeHpThreshold,
    earlyCompositionPolicy,
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
  console.log(`Wrote Issue #1196 diagnostic: ${resolve(output)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
