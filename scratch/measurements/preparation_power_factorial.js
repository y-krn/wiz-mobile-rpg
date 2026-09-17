// sim-scope: run — production-backed preparation-power 2×2 factorial diagnostic
/* global console, process */

import "../simulations/simulation_preflight.js";
import fs from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { ITEMS } from "../../src/data/items.js";
import { MATERIAL_TYPES } from "../../src/data/materials.js";
import { getCharacterEquipmentLoad } from "../../src/rules/equipment_load.js";
import { getWorkshopGrants } from "../../src/systems/workshop.js";
import { applyStandardSimulationEnv, getStandardSimulationEnv, STANDARD_BALANCE_CONFIG, hashConfiguration } from "./balance_measurement.js";
import { printEnvSignatureBanner, readSimScopeDeclaration } from "./measurement_env_signature.js";
import { requireRunnerProvenance } from "./measurement_provenance.js";

export const RUNNER_VERSION = "issue1328-preparation-power-factorial-v2";
export const SCHEMA_VERSION = 2;
export const DEFAULT_RUNS = 1000;
export const DEFAULT_SEED = 1277;
export const TARGET_DEPTH = 6;
export const RUN_EVIDENCE_SAMPLE_LIMIT = 8;
export const CANDIDATE_SAMPLE_LIMIT = 128;
export const STARTING_KIT_IDS = Object.freeze(["vanguard", "scout", "devotion", "arcana"]);
export const CONDITION_IDS = Object.freeze(["W0R0", "W1R0", "W0R12", "W1R12"]);
export const INITIAL_MATERIAL_BANK = Object.freeze(Object.fromEntries(
  MATERIAL_TYPES.map(material => [material, {
    "硬い皮": 12,
    "獣の牙": 12
  }[material] || 0])
));

const DEFAULT_WEAPON_BY_KIT = Object.freeze({
  vanguard: "SHORT_SWORD",
  scout: "DAGGER",
  devotion: "MACE",
  arcana: "WAND"
});
const WORKSHOP_SCENARIO_ID = "workshop-complete";
const POTION_RECIPE_ID = "HEAL_POTION";
const KIT_WEAPON_TYPES = new Set(["weapon"]);

const PRODUCTION_PATHS = Object.freeze([
  "scratch/simulations/sim_depth_material_ev.js",
  "scratch/measurements/preparation_power_factorial.js",
  "scratch/measurements/balance_measurement.js",
  "src/state/initial_state.js",
  "src/systems/workshop.js",
  "src/rules/craft_rules.js",
  "src/rules/equipment_load.js",
  "src/rules/build_snapshot.js",
  "src/rules/recovery_rules.js",
  "src/combat_logic/round.js",
  "src/combat_logic/damage.js",
  "src/combat_logic/item_resolution.js",
  "src/run_map_generator.js"
]);

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (!arg.startsWith("--")) throw new Error(`unknown argument: ${arg}`);
    const [key, inlineValue] = arg.slice(2).split("=", 2);
    const value = inlineValue ?? argv[++index];
    if (value === undefined) throw new Error(`--${key} requires a value`);
    options[key] = value;
  }
  return options;
}

function integer(value, label, minimum = 1) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum) {
    throw new Error(`${label} must be an integer >= ${minimum}: ${value}`);
  }
  return parsed;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function counts(value, keys = MATERIAL_TYPES) {
  return Object.fromEntries(keys.map(key => [key, Number(value?.[key] || 0)]));
}

function equalJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function metricSummary(values) {
  const observed = values.filter(Number.isFinite);
  return {
    total: observed.reduce((sum, value) => sum + value, 0),
    meanPerEntrant: mean(observed),
    p50: quantiles(observed).p50
  };
}

function rate(count, total) {
  return total ? count / total : null;
}

function sumNestedCounts(rows, field) {
  const total = {};
  rows.forEach(row => {
    Object.entries(row.materials[field] || {}).forEach(([key, value]) => {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        total[key] ||= {};
        Object.entries(value).forEach(([nestedKey, nestedValue]) => {
          total[key][nestedKey] = (total[key][nestedKey] || 0) + Number(nestedValue || 0);
        });
      } else {
        total[key] = (total[key] || 0) + Number(value || 0);
      }
    });
  });
  return total;
}

function quantiles(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return { n: 0, p10: null, p50: null, p90: null };
  const at = probability => {
    const position = (sorted.length - 1) * probability;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    return lower === upper
      ? sorted[lower]
      : sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
  };
  return { n: sorted.length, p10: at(0.10), p50: at(0.50), p90: at(0.90) };
}

function conditionDefinition(id) {
  const weaponMode = id.startsWith("W1") ? "canonical-auto-best" : "kit-default";
  const potionCount = id.endsWith("R12") ? 12 : 0;
  return Object.freeze({
    id,
    weaponMode,
    recoveryMode: potionCount ? "departure-craft-HEAL_POTION-12" : "none",
    potionCount,
    departureCraft: Object.freeze(Array(potionCount).fill(POTION_RECIPE_ID))
  });
}

function scenarioFor(baseScenario, condition, startingKitId) {
  const scenario = {
    ...baseScenario,
    startingKit: startingKitId,
    startingHealPotions: 0,
    departureCraft: [...condition.departureCraft],
    departureCraftMaterialsAreActualBank: true,
    departureCraftMaterials: { ...INITIAL_MATERIAL_BANK },
    departureCraftMeasurement: true,
    collectStage15Diagnostics: true,
    simDiagnosticLevel: "full"
  };
  if (condition.weaponMode === "kit-default") {
    scenario.startingGearChoice = DEFAULT_WEAPON_BY_KIT[startingKitId];
  }
  return scenario;
}

function getStartingEquipmentLoad(snapshot) {
  const equipment = Object.fromEntries(
    (snapshot?.equipment || []).map(item => [item.slot, item.id])
  );
  return getCharacterEquipmentLoad({ equipment });
}

function getStartingBagUsed(result, workshop) {
  const startingConsumables = Object.values(result.startingConsumables || {})
    .reduce((sum, value) => sum + Number(value || 0), 0);
  const returnItems = getWorkshopGrants(workshop).returnItems.filter(Boolean).length;
  const departureItems = result.departureCraft?.items?.length || 0;
  return startingConsumables + returnItems + departureItems;
}

function expectedAutoBestWeapon(workshop, kitId) {
  const current = DEFAULT_WEAPON_BY_KIT[kitId];
  const candidates = getWorkshopGrants(workshop).startingGear
    .map(itemId => ITEMS[itemId])
    .filter(item => item && KIT_WEAPON_TYPES.has(item.type));
  const best = [...candidates].sort((left, right) => (right.atk || 0) - (left.atk || 0))[0];
  return best && (best.atk || 0) > (ITEMS[current]?.atk || 0) ? best.id : current;
}

function buildStartingPreparation(result, condition, startingKitId, workshop) {
  const snapshot = result.startingBuildSnapshot;
  const weapon = snapshot?.equipment?.find(item => item.slot === "weapon") || null;
  const canonical = snapshot?.canonicalBuildSnapshot || {};
  const startingBagUsed = getStartingBagUsed(result, workshop);
  const requestedPotions = result.departureCraft?.items?.filter(item => item === POTION_RECIPE_ID).length || 0;
  const startingPotionCount = Number(result.startingConsumables?.healPotions || 0) + requestedPotions;
  return {
    startingKit: startingKitId,
    startingWeapon: weapon?.id || null,
    weaponAtk: weapon?.atk ?? null,
    weaponBehavior: canonical.weaponProfile || null,
    equipmentLoad: getStartingEquipmentLoad(snapshot),
    medium: { present: Boolean(canonical.mediumId), id: canonical.mediumId || null },
    runeSlots: canonical.runeSlotCapacity || 0,
    activeRunes: [...(canonical.activeRuneSpellIds || [])],
    startingHp: snapshot?.hp ?? null,
    startingMaxHp: snapshot?.maxHp ?? null,
    startingMp: snapshot?.mp ?? null,
    startingMaxMp: snapshot?.maxMp ?? null,
    startingPotionCount,
    startingBagUsed,
    startingBagFree: 20 - startingBagUsed,
    workshopStartingGearApplied: result.workshopEffects?.startingGearApplied || null,
    workshopStartingGearCandidates: [...(result.workshopEffects?.startingGearCandidates || [])],
    workshopAffixIds: [...(result.workshopEffects?.affixIds || [])],
    workshopSpellIds: [...(result.workshopEffects?.spellIds || [])]
  };
}

function compactFloor(floor) {
  return {
    entryHpRatio: floor.entryHpRatio,
    exitHpRatio: floor.exitHpRatio,
    entryRecoveryRemaining: floor.entryRecoveryRemaining,
    exitRecoveryRemaining: floor.exitRecoveryRemaining,
    healPotionUses: floor.healPotionUses,
    hpRecovered: floor.healing,
    combatCount: floor.encounters,
    rounds: floor.rounds,
    enemyActions: floor.enemyActions,
    combatHpDamage: floor.normalDamage,
    equipmentOpportunities: floor.equipmentDrops,
    equipmentSwaps: floor.equipmentChanges
  };
}

function compactLoot(result) {
  const lifecycle = result.buildPayment?.stake?.lifecycle?.counts || {};
  const rejectionByCategory = counts(result.pickupRejectionsByCategory, ["item", "equipment", "material"]);
  const settlement = result.objectLootSettlement || {};
  const swaps = (result.equipmentTelemetry || []).filter(event => event.type === "swap");
  const buildChanges = swaps.filter(event => {
    const before = new Set(event.oldMainAxisIds || []);
    const after = new Set(event.candidateMainAxisIds || []);
    return before.size !== after.size || [...before].some(id => !after.has(id));
  }).length;
  return {
    acquired: lifecycle.found ?? null,
    bagged: lifecycle.bagged ?? null,
    inventoryRejectionsByCategory: rejectionByCategory,
    equipmentOpportunities: Number(result.equipmentFound || 0),
    equipmentSwaps: swaps.length,
    buildChanges,
    endingBagUsed: result.finalInventorySlots ?? null,
    endingBagFree: result.finalInventorySlots == null ? null : 20 - result.finalInventorySlots,
    returnObjectLoot: {
      banked: settlement.banked?.length ?? 0,
      salvaged: settlement.salvaged?.length ?? 0,
      discarded: settlement.discarded?.length ?? 0,
      lost: settlement.lost?.length ?? 0,
      left: settlement.left?.length ?? 0
    }
  };
}

function compactRun(result, condition, startingKitId, worldSeed, workshop) {
  const floors = result.stage15Diagnostics?.byFloor || {};
  return {
    condition: condition.id,
    startingKit: startingKitId,
    runIndex: result.runIndex ?? null,
    worldSeed,
    preparation: buildStartingPreparation(result, condition, startingKitId, workshop),
    outcome: {
      outcome: result.outcome,
      terminationReason: result.terminationReason,
      death: Boolean(result.died),
      voluntaryReturn: result.outcome === "retreat" && result.terminationReason === "town-portal",
      reachedFloor: result.reachedFloor,
      deepestFloor: result.reachedFloor,
      b6Cutoff: result.outcome === "retreat" && result.terminationReason === "target-depth" && result.reachedFloor >= TARGET_DEPTH
    },
    combat: {
      count: result.battles,
      rounds: result.combatRounds,
      enemyActions: Object.values(floors).reduce((sum, floor) => sum + (floor.enemyActions || 0), 0),
      enemyDamageTurns: result.incomingHitTurns,
      hpDamage: result.combatDamageHp,
      damageBySource: counts(result.damageHpBySource, ["normal", "elite", "midboss", "boss", "floor-trap", "chest-trap"])
    },
    recovery: {
      floors: Object.fromEntries(Object.entries(floors).map(([floor, value]) => [floor, compactFloor(value)])),
      potionUsed: result.healPotionsUsed,
      hpRecovered: result.recoveryHealing?.total?.actualHp ?? null,
      b2ExitB3Entry: {
        observed: Boolean(floors["2"]?.exitHpRatio != null && floors["3"]?.entryHpRatio != null),
        b2ExitPotionRemaining: floors["2"]?.exitRecoveryRemaining ?? null,
        b3EntryPotionRemaining: floors["3"]?.entryRecoveryRemaining ?? null,
        b2ExitHpRatio: floors["2"]?.exitHpRatio ?? null,
        b3EntryHpRatio: floors["3"]?.entryHpRatio ?? null
      }
    },
    loot: compactLoot(result),
    materials: {
      initialBank: { ...INITIAL_MATERIAL_BANK },
      departureCraftPayment: counts(result.departureCraft?.cost),
      postPurchaseBank: counts(INITIAL_MATERIAL_BANK),
      finalBank: counts(result.metaMaterials),
      departureCraftPurchaseSource: result.departureCraft?.purchaseSource || null,
      departureCraftRecipeCount: result.departureCraft?.recipeIds?.length || 0,
      acquiredBySource: clone(result.materialSourceCounts || {}),
      consumedByMerchant: clone(result.materialConsumedByMerchant || {})
    }
  };
}

function reconcileMaterialPayment(row, condition) {
  const expectedPayment = condition.potionCount
    ? { "硬い皮": condition.potionCount, "獣の牙": condition.potionCount }
    : {};
  const actualPayment = counts(row.materials.departureCraftPayment);
  const normalizedExpectedPayment = counts(expectedPayment);
  if (!equalJson(actualPayment, normalizedExpectedPayment)) {
    throw new Error(`${row.condition}/${row.startingKit}: departure craft payment mismatch`);
  }
  const postPurchaseBank = counts(INITIAL_MATERIAL_BANK);
  Object.entries(actualPayment).forEach(([material, amount]) => {
    postPurchaseBank[material] -= amount;
  });
  row.materials.postPurchaseBank = postPurchaseBank;
  if (Object.values(postPurchaseBank).some(value => value < 0)) {
    throw new Error(`${row.condition}/${row.startingKit}: negative post-purchase bank`);
  }
}

function validatePreparation(row, condition, workshop) {
  const expectedWeapon = condition.weaponMode === "kit-default"
    ? DEFAULT_WEAPON_BY_KIT[row.startingKit]
    : expectedAutoBestWeapon(workshop, row.startingKit);
  if (row.preparation.startingWeapon !== expectedWeapon) {
    throw new Error(`${row.condition}/${row.startingKit}: starting weapon mismatch`);
  }
  if (row.preparation.startingPotionCount !== condition.potionCount) {
    throw new Error(`${row.condition}/${row.startingKit}: starting potion count mismatch`);
  }
  if (row.materials.departureCraftPurchaseSource !== "actual-meta-bank" ||
      row.materials.departureCraftRecipeCount !== condition.potionCount) {
    throw new Error(`${row.condition}/${row.startingKit}: departure craft did not use the expected purchase path`);
  }
  if (row.preparation.startingBagUsed > 20 || row.preparation.startingBagFree < 0) {
    throw new Error(`${row.condition}/${row.startingKit}: 20-slot starting inventory invariant failed`);
  }
  reconcileMaterialPayment(row, condition);
}

export function aggregateFloor(rows, floor) {
  const values = rows.map(row => row.recovery.floors[String(floor)]).filter(Boolean);
  const average = key => {
    const observed = values.map(value => value[key]).filter(Number.isFinite);
    return { meanPerEntrant: mean(observed), p50: quantiles(observed).p50 };
  };
  return {
    observedEntrantN: values.length,
    entryHpRatio: average("entryHpRatio"),
    exitHpRatio: average("exitHpRatio"),
    entryRecoveryRemaining: average("entryRecoveryRemaining"),
    exitRecoveryRemaining: average("exitRecoveryRemaining"),
    potionUsed: metricSummary(values.map(value => value.healPotionUses)),
    hpRecovered: metricSummary(values.map(value => value.hpRecovered)),
    combatCount: metricSummary(values.map(value => value.combatCount)),
    rounds: metricSummary(values.map(value => value.rounds)),
    enemyActions: metricSummary(values.map(value => value.enemyActions)),
    combatHpDamage: metricSummary(values.map(value => value.combatHpDamage)),
    equipmentOpportunities: metricSummary(values.map(value => value.equipmentOpportunities)),
    equipmentSwaps: metricSummary(values.map(value => value.equipmentSwaps))
  };
}

function aggregateCondition(rows, condition, { includeStartingKitBreakdown = true } = {}) {
  const n = rows.length;
  const reached = floor => rows.filter(row => row.outcome.reachedFloor >= floor).length;
  const outcomes = rows.reduce((result, row) => {
    result[row.outcome.outcome] = (result[row.outcome.outcome] || 0) + 1;
    return result;
  }, {});
  const voluntaryReturn = rows.filter(row => row.outcome.voluntaryReturn).length;
  const b6Cutoff = rows.filter(row => row.outcome.b6Cutoff).length;
  const rejectionTotals = ["item", "equipment", "material"].reduce((result, category) => {
    result[category] = rows.reduce((sum, row) => sum + row.loot.inventoryRejectionsByCategory[category], 0);
    return result;
  }, {});
  const preparationByKit = Object.fromEntries(STARTING_KIT_IDS.map(kitId => {
    const kitRows = rows.filter(row => row.startingKit === kitId);
    const first = kitRows[0]?.preparation || null;
    if (kitRows.some(row => !equalJson(row.preparation, first))) {
      throw new Error(`${condition.id}/${kitId}: preparation changed across run indexes`);
    }
    return [kitId, first];
  }));
  const material = rows[0]?.materials || null;
  const combatTotals = Object.fromEntries(["count", "rounds", "enemyActions", "enemyDamageTurns", "hpDamage"].map(key => [
    key,
    rows.reduce((sum, row) => sum + (Number(row.combat[key]) || 0), 0)
  ]));
  const recoveryTotals = {
    potionUsed: rows.reduce((sum, row) => sum + (Number(row.recovery.potionUsed) || 0), 0),
    hpRecovered: rows.reduce((sum, row) => sum + (Number(row.recovery.hpRecovered) || 0), 0)
  };
  const lootTotals = {
    acquired: rows.reduce((sum, row) => sum + (Number(row.loot.acquired) || 0), 0),
    bagged: rows.reduce((sum, row) => sum + (Number(row.loot.bagged) || 0), 0),
    equipmentOpportunities: rows.reduce((sum, row) => sum + (Number(row.loot.equipmentOpportunities) || 0), 0),
    equipmentSwaps: rows.reduce((sum, row) => sum + (Number(row.loot.equipmentSwaps) || 0), 0),
    buildChanges: rows.reduce((sum, row) => sum + (Number(row.loot.buildChanges) || 0), 0),
    inventoryRejectionsByCategory: { ...rejectionTotals }
  };
  const aggregate = {
    id: condition.id,
    weaponAxis: condition.weaponMode,
    recoveryAxis: condition.recoveryMode,
    runs: n,
    preparation: rows[0]?.preparation || null,
    preparationByKit,
    reach: Object.fromEntries([2, 3, 4, 5, 6].map(floor => [floor, {
      count: reached(floor),
      rate: rate(reached(floor), n)
    }])),
    outcome: {
      counts: outcomes,
      death: rows.filter(row => row.outcome.death).length,
      voluntaryReturn,
      b6Cutoff,
      deepestFloor: quantiles(rows.map(row => row.outcome.deepestFloor)),
      terminationReasons: rows.reduce((result, row) => {
        const key = row.outcome.terminationReason || "unobserved";
        result[key] = (result[key] || 0) + 1;
        return result;
      }, {})
    },
    combat: {
      count: mean(rows.map(row => row.combat.count)),
      rounds: mean(rows.map(row => row.combat.rounds)),
      enemyActions: mean(rows.map(row => row.combat.enemyActions)),
      enemyDamageTurns: mean(rows.map(row => row.combat.enemyDamageTurns)),
      hpDamage: mean(rows.map(row => row.combat.hpDamage)),
      totals: combatTotals,
      damageBySource: Object.fromEntries(["normal", "elite", "midboss", "boss", "floor-trap", "chest-trap"].map(source => [
        source,
        mean(rows.map(row => row.combat.damageBySource[source]))
      ]))
    },
    recovery: {
      potionUsed: mean(rows.map(row => row.recovery.potionUsed)),
      hpRecovered: mean(rows.map(row => row.recovery.hpRecovered).filter(Number.isFinite)),
      totals: recoveryTotals,
      byFloor: Object.fromEntries([1, 2, 3, 4, 5].map(floor => [floor, aggregateFloor(rows, floor)])),
      b2ExitB3Entry: {
        observed: rows.filter(row => row.recovery.b2ExitB3Entry.observed).length,
        b2ExitPotionRemaining: mean(rows.map(row => row.recovery.b2ExitB3Entry.b2ExitPotionRemaining).filter(Number.isFinite)),
        b3EntryPotionRemaining: mean(rows.map(row => row.recovery.b2ExitB3Entry.b3EntryPotionRemaining).filter(Number.isFinite)),
        b2ExitHpRatio: mean(rows.map(row => row.recovery.b2ExitB3Entry.b2ExitHpRatio).filter(Number.isFinite)),
        b3EntryHpRatio: mean(rows.map(row => row.recovery.b2ExitB3Entry.b3EntryHpRatio).filter(Number.isFinite))
      }
    },
    loot: {
      acquired: mean(rows.map(row => row.loot.acquired).filter(Number.isFinite)),
      bagged: mean(rows.map(row => row.loot.bagged).filter(Number.isFinite)),
      inventoryRejectionsByCategory: rejectionTotals,
      equipmentOpportunities: mean(rows.map(row => row.loot.equipmentOpportunities).filter(Number.isFinite)),
      equipmentSwaps: mean(rows.map(row => row.loot.equipmentSwaps)),
      buildChanges: mean(rows.map(row => row.loot.buildChanges)),
      totals: lootTotals,
      endingBagUsed: quantiles(rows.map(row => row.loot.endingBagUsed).filter(Number.isFinite)),
      returnObjectLoot: ["banked", "salvaged", "discarded", "lost", "left"].reduce((result, key) => {
        result[key] = rows.reduce((sum, row) => sum + row.loot.returnObjectLoot[key], 0);
        return result;
      }, {})
    },
    materials: {
      initialBank: { ...INITIAL_MATERIAL_BANK },
      departureCraftPayment: material?.departureCraftPayment || {},
      postPurchaseBank: material?.postPurchaseBank || {},
      departureCraftPurchaseSource: material?.departureCraftPurchaseSource || null,
      departureCraftRecipeCount: material?.departureCraftRecipeCount || 0,
      finalBank: Object.fromEntries(MATERIAL_TYPES.map(materialId => [
        materialId,
        mean(rows.map(row => row.materials.finalBank[materialId]))
      ])),
      acquiredBySource: sumNestedCounts(rows, "acquiredBySource"),
      consumedByMerchant: sumNestedCounts(rows, "consumedByMerchant")
    }
  };
  if (includeStartingKitBreakdown) {
    aggregate.byStartingKit = Object.fromEntries(STARTING_KIT_IDS.map(kitId => {
      const kitRows = rows.filter(row => row.startingKit === kitId);
      return [kitId, aggregateCondition(kitRows, condition, { includeStartingKitBreakdown: false })];
    }));
    aggregate.overviewReconciliation = reconcileKitAggregates(aggregate);
  }
  return aggregate;
}

function reconcileKitAggregates(overview) {
  const kits = Object.values(overview.byStartingKit);
  const sum = values => values.reduce((total, value) => total + (Number(value) || 0), 0);
  const checks = {
    runs: sum(kits.map(kit => kit.runs)) === overview.runs,
    reach: [2, 3, 4, 5, 6].every(floor => sum(kits.map(kit => kit.reach[floor].count)) === overview.reach[floor].count),
    outcomes: ["death", "voluntaryReturn", "b6Cutoff"].every(key => sum(kits.map(kit => kit.outcome[key])) === overview.outcome[key]),
    combatTotals: Object.keys(overview.combat.totals).every(key => sum(kits.map(kit => kit.combat.totals[key])) === overview.combat.totals[key]),
    recoveryTotals: Object.keys(overview.recovery.totals).every(key => sum(kits.map(kit => kit.recovery.totals[key])) === overview.recovery.totals[key]),
    floorTotals: [1, 2, 3, 4, 5].every(floor => [
      "potionUsed", "hpRecovered", "combatCount", "rounds", "enemyActions", "combatHpDamage",
      "equipmentOpportunities", "equipmentSwaps"
    ].every(key => sum(kits.map(kit => kit.recovery.byFloor[floor][key].total)) === overview.recovery.byFloor[floor][key].total)),
    lootTotals: ["acquired", "bagged", "equipmentOpportunities", "equipmentSwaps", "buildChanges"].every(key =>
      sum(kits.map(kit => kit.loot.totals[key])) === overview.loot.totals[key]),
    inventoryRejections: ["item", "equipment", "material"].every(category =>
      sum(kits.map(kit => kit.loot.totals.inventoryRejectionsByCategory[category])) === overview.loot.totals.inventoryRejectionsByCategory[category])
  };
  return {
    status: Object.values(checks).every(Boolean) ? "PASS" : "FAIL",
    semantics: "overview counts/totals equal the sum of the four starting-kit aggregates; rates and means are recomputed for their observed population",
    checks
  };
}

function observationProjection(row) {
  const recoveryFloors = Object.fromEntries(
    Object.entries(row.recovery.floors).map(([floor, value]) => {
      const gameplay = { ...value };
      delete gameplay.equipmentOpportunities;
      delete gameplay.equipmentSwaps;
      return [floor, gameplay];
    })
  );
  return {
    condition: row.condition,
    startingKit: row.startingKit,
    outcome: row.outcome,
    combat: row.combat,
    recovery: { ...row.recovery, floors: recoveryFloors },
    materials: row.materials
  };
}

function buildComparison(aggregates) {
  const byId = Object.fromEntries(aggregates.map(value => [value.id, value]));
  const diff = (leftId, rightId) => ({
    left: leftId,
    right: rightId,
    semantics: "independent aggregate difference; same runIndex/worldSeed only matches ex-ante setup; no encounter, loot, or path parity claim",
    reachB3: (byId[leftId].reach[3].rate ?? 0) - (byId[rightId].reach[3].rate ?? 0),
    reachB6: (byId[leftId].reach[6].rate ?? 0) - (byId[rightId].reach[6].rate ?? 0),
    deathRate: rate(byId[leftId].outcome.death, byId[leftId].runs) - rate(byId[rightId].outcome.death, byId[rightId].runs),
    averageCombatCount: byId[leftId].combat.count - byId[rightId].combat.count,
    averageEnemyActions: byId[leftId].combat.enemyActions - byId[rightId].combat.enemyActions,
    averageCombatHpDamage: byId[leftId].combat.hpDamage - byId[rightId].combat.hpDamage,
    averagePotionUsed: byId[leftId].recovery.potionUsed - byId[rightId].recovery.potionUsed
  });
  return {
    W1R0_vs_W0R0: diff("W1R0", "W0R0"),
    W0R12_vs_W0R0: diff("W0R12", "W0R0"),
    W1R12_vs_W1R0: diff("W1R12", "W1R0"),
    W1R12_vs_W0R12: diff("W1R12", "W0R12"),
    W1R12_vs_W0R0: diff("W1R12", "W0R0")
  };
}

export async function runMeasurement({ runs = DEFAULT_RUNS, seed = DEFAULT_SEED } = {}) {
  const normalizedRuns = integer(runs, "runs");
  const normalizedSeed = integer(seed, "seed");
  applyStandardSimulationEnv({
    runs: normalizedRuns,
    seed: normalizedSeed,
    calibrationRuns: STANDARD_BALANCE_CONFIG.calibrationRuns
  });
  const { simulateRun, getScenarioById } = await import("../simulations/sim_depth_material_ev.js");
  const baseScenario = getScenarioById(WORKSHOP_SCENARIO_ID);
  const workshop = clone(baseScenario.workshop);
  const conditions = CONDITION_IDS.map(conditionDefinition);
  const rowsByCondition = Object.fromEntries(CONDITION_IDS.map(id => [id, []]));
  const runOne = (condition, startingKitId, runIndex, worldSeed, collectEquipmentTelemetry = true) => {
    const scenario = scenarioFor(baseScenario, condition, startingKitId);
    const result = simulateRun({
      className: "Fighter",
      startFloor: 1,
      targetDepth: TARGET_DEPTH,
      runIndex,
      seriesId: "issue1328:preparation-power-factorial",
      scoringProfile: null,
      scenario,
      workshop,
      worldSeed,
      collectDiagnostics: true,
      collectEquipmentTelemetry
    });
    const row = compactRun({ ...result, runIndex }, condition, startingKitId, worldSeed, workshop);
    validatePreparation(row, condition, workshop);
    return row;
  };
  for (const condition of conditions) {
    for (const startingKitId of STARTING_KIT_IDS) {
      for (let runIndex = 0; runIndex < normalizedRuns; runIndex++) {
        const worldSeed = `issue-1328:${normalizedSeed}:${startingKitId}:${runIndex}`;
        rowsByCondition[condition.id].push(runOne(condition, startingKitId, runIndex, worldSeed));
      }
    }
  }
  const aggregates = conditions.map(condition => aggregateCondition(rowsByCondition[condition.id], condition));
  const deterministicProbe = (() => {
    const condition = conditions[0];
    const first = runOne(condition, STARTING_KIT_IDS[0], 0, `issue-1328:${normalizedSeed}:determinism`);
    const second = runOne(condition, STARTING_KIT_IDS[0], 0, `issue-1328:${normalizedSeed}:determinism`);
    return { status: equalJson(first, second) ? "PASS" : "FAIL", method: "same compact row comparison" };
  })();
  const observationInvariance = (() => {
    const condition = conditions[0];
    const startingKitId = STARTING_KIT_IDS[0];
    const worldSeed = `issue-1328:${normalizedSeed}:${startingKitId}:observation`;
    const left = runOne(condition, startingKitId, 0, worldSeed, true);
    const right = runOne(condition, startingKitId, 0, worldSeed, false);
    return {
      status: equalJson(observationProjection(left), observationProjection(right)) ? "PASS" : "FAIL",
      method: "collectEquipmentTelemetry ON/OFF gameplay projection comparison"
    };
  })();
  return {
    configuration: {
      measurement: "preparation-power-factorial",
      scenario: WORKSHOP_SCENARIO_ID,
      workshopState: workshop,
      kits: [...STARTING_KIT_IDS],
      conditions: conditions.map(condition => ({ ...condition, departureCraft: [...condition.departureCraft] })),
      targetDepth: TARGET_DEPTH,
      runsPerKitPerCondition: normalizedRuns,
      totalRuns: normalizedRuns * STARTING_KIT_IDS.length * conditions.length,
      seed: normalizedSeed,
      initialMaterialBank: { ...INITIAL_MATERIAL_BANK },
      inventoryContract: { capacity: 20, potionSlots: 12, freeSlotsAfterR12PotionPurchase: 8 },
      sameSeedUse: "initial-condition matching only; post-divergence encounter/loot/path parity is not claimed",
      aiAndRecoveryPolicy: "canonical production defaults shared by all conditions",
      productionMutation: false,
      candidateSample: { status: "not_applicable", limit: CANDIDATE_SAMPLE_LIMIT, retained: 0 }
    },
    conditions: aggregates,
    comparisons: buildComparison(aggregates),
    determinism: deterministicProbe,
    observationInvariance,
    evidenceSampling: {
      policy: "first-N compact rows in condition/startingKit/runIndex order",
      limitPerCondition: RUN_EVIDENCE_SAMPLE_LIMIT,
      samples: Object.fromEntries(CONDITION_IDS.map(id => [id, rowsByCondition[id].slice(0, RUN_EVIDENCE_SAMPLE_LIMIT)])),
      rawRunRecordsPersisted: false
    }
  };
}

export function buildReport(result, provenance, environmentSignature, { purpose = null, requestedRef = null } = {}) {
  const scope = readSimScopeDeclaration(import.meta.url)?.name || "run";
  const environment = {
    ...environmentSignature,
    scope,
    runnerVersion: RUNNER_VERSION,
    schemaVersion: SCHEMA_VERSION,
    targetDepth: TARGET_DEPTH,
    conditions: CONDITION_IDS,
    kits: STARTING_KIT_IDS
  };
  const environmentHash = printEnvSignatureBanner(environment, { label: "issue1328" });
  return {
    schemaVersion: SCHEMA_VERSION,
    runnerVersion: RUNNER_VERSION,
    measurement: {
      id: "preparation-power-factorial",
      scope,
      purpose,
      requestedRef,
      sourceCommit: provenance?.sourceCommit || null,
      gameplaySourceCommit: provenance?.gameplaySourceCommit || null,
      measurementRunnerCommit: provenance?.measurementRunnerCommit || null,
      measurementRunnerPaths: provenance?.measurementRunnerPaths || [...PRODUCTION_PATHS],
      measurementRunnerDiffSha256: provenance?.measurementRunnerDiffSha256 || null,
      baseRef: provenance?.baseRef || null,
      baseCommit: provenance?.baseCommit || null,
      originMainAncestor: provenance?.originMainAncestor ?? null,
      staleTreeAllowed: provenance?.staleTreeAllowed ?? null,
      workingTreeClean: provenance?.workingTreeClean ?? null,
      productionPaths: [...PRODUCTION_PATHS],
      environmentHash
    },
    result
  };
}

function format(value) {
  return value == null ? "unobserved" : typeof value === "number" ? value.toFixed(3) : String(value);
}

function formatRate(value) {
  return value == null ? "unobserved" : `${(value * 100).toFixed(1)}%`;
}

function inventoryRejectionTotal(aggregate) {
  return Object.values(aggregate.loot.inventoryRejectionsByCategory)
    .reduce((sum, value) => sum + value, 0);
}

export function buildSummary(report) {
  const { measurement, result } = report;
  const conditionById = Object.fromEntries(result.conditions.map(condition => [condition.id, condition]));
  const lines = [
    "# Issue #1328 preparation-power factorial",
    "",
    `- runner: \`${report.runnerVersion}\`; source SHA: \`${measurement.sourceCommit || "unrecorded"}\`; environment: \`${measurement.environmentHash}\``,
    `- scenario: \`${result.configuration.scenario}\`; N per kit/condition: ${result.configuration.runsPerKitPerCondition}; total runs: ${result.configuration.totalRuns}`,
    `- initial bank: ${JSON.stringify(result.configuration.initialMaterialBank)}; inventory: ${result.configuration.inventoryContract.capacity} slots; R12 uses ${result.configuration.inventoryContract.potionSlots} slots`,
    "- same seed is used only for initial-condition matching; encounter, loot, and path parity after divergence are not claimed",
    "",
    "## Overview",
    "",
    ...result.conditions.map(condition =>
      `- ${condition.id}: B2/B3/B4/B5/B6 ${[2, 3, 4, 5, 6].map(floor => formatRate(condition.reach[floor].rate)).join("/")}; death ${formatRate(rate(condition.outcome.death, condition.runs))}; voluntary Return ${condition.outcome.voluntaryReturn}; B6 cutoff ${condition.outcome.b6Cutoff}; deepest p50 ${format(condition.outcome.deepestFloor.p50)}`
    ),
    "",
    "## Preparation details",
    "",
    ...STARTING_KIT_IDS.map(kitId => {
      const w0 = result.conditions[0].preparationByKit[kitId];
      const w1 = result.conditions[1].preparationByKit[kitId];
      return `- ${kitId}: W0 ${w0.startingWeapon}/${w0.weaponAtk} ${w0.weaponBehavior}, load ${w0.equipmentLoad.class}, medium ${w0.medium.present ? w0.medium.id : "none"}, Rune ${w0.runeSlots}/${w0.activeRunes.join(",") || "none"}, MP ${w0.startingMaxMp}; W1 ${w1.startingWeapon}/${w1.weaponAtk} ${w1.weaponBehavior}, load ${w1.equipmentLoad.class}, medium ${w1.medium.present ? w1.medium.id : "none"}, Rune ${w1.runeSlots}/${w1.activeRunes.join(",") || "none"}, MP ${w1.startingMaxMp}`;
    }),
    "",
    "## Kit × condition decision view",
    "",
    "Each floor metric is reported as total / entrant mean / entrant p50. The lines below use run-level means; B3 entry values are observed entrant means.",
    "",
    ...STARTING_KIT_IDS.flatMap(kitId => [
      `### ${kitId}`,
      ...CONDITION_IDS.map(conditionId => {
        const condition = conditionById[conditionId].byStartingKit[kitId];
        const b3Entry = condition.recovery.b2ExitB3Entry;
        return `- ${conditionId}: reach B3/B4/B5/B6 ${[3, 4, 5, 6].map(floor => `${condition.reach[floor].count}/${formatRate(condition.reach[floor].rate)}`).join("/")}; death/Return/cutoff ${condition.outcome.death}/${condition.outcome.voluntaryReturn}/${condition.outcome.b6Cutoff}; enemy actions ${format(condition.combat.enemyActions)}; rounds ${format(condition.combat.rounds)}; combat HP damage ${format(condition.combat.hpDamage)}; B3 entry HP ${format(b3Entry.b3EntryHpRatio)}; B3 entry potions ${format(b3Entry.b3EntryPotionRemaining)}; potion used ${format(condition.recovery.potionUsed)}; HP recovered ${format(condition.recovery.hpRecovered)}; loot acquired/bagged ${format(condition.loot.acquired)}/${format(condition.loot.bagged)}; inventory rejection ${inventoryRejectionTotal(condition)}; equipment opportunities/swaps ${format(condition.loot.equipmentOpportunities)}/${format(condition.loot.equipmentSwaps)}; Build changes ${format(condition.loot.buildChanges)}; ending bag ${format(condition.loot.endingBagUsed.p50)}`;
      })
    ]),
    "",
    "## Invariants",
    "",
    `- determinism: ${result.determinism.status}; observation invariance: ${result.observationInvariance.status}`,
    `- R0/R12 starting potions: ${result.conditions.map(condition => `${condition.id}=${condition.preparationByKit.vanguard.startingPotionCount}`).join(", ")}`,
    `- B6 cutoff is separate from voluntary Return: ${result.conditions.every(condition => condition.outcome.b6Cutoff + condition.outcome.voluntaryReturn <= condition.runs) ? "PASS" : "FAIL"}; overview/kit reconciliation: ${result.conditions.every(condition => condition.overviewReconciliation.status === "PASS") ? "PASS" : "FAIL"}`,
    "- production balance values are not modified; this runner reports diagnostic evidence only",
    "- no raw run records persisted; representative compact samples are capped at 8 per condition; candidate sample is not applicable"
  ];
  return `${lines.join("\n")}\n`;
}

export function buildManifest(report, { runType = "diagnostic" } = {}) {
  return {
    schemaVersion: report.schemaVersion,
    status: "success",
    baselineCandidate: false,
    runType,
    purpose: report.measurement.purpose,
    source: report.measurement,
    configuration: report.result.configuration,
    evidenceSampling: report.result.evidenceSampling,
    workflow: {
      repository: process.env.MEASUREMENT_REPOSITORY || null,
      runId: process.env.MEASUREMENT_WORKFLOW_RUN_ID || null,
      runUrl: process.env.MEASUREMENT_WORKFLOW_RUN_URL || null,
      requestedRef: report.measurement.requestedRef,
      generatedAt: new Date().toISOString()
    }
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const runs = integer(options.runs || DEFAULT_RUNS, "runs");
  const seed = integer(options.seed || DEFAULT_SEED, "seed");
  const output = options.output;
  const summary = options.summary;
  const manifest = options.manifest;
  if (!output || !summary || !manifest) {
    throw new Error("--output, --summary, and --manifest are required");
  }
  const config = { runs, seed, calibrationRuns: STANDARD_BALANCE_CONFIG.calibrationRuns };
  applyStandardSimulationEnv(config);
  const provenance = requireRunnerProvenance({
    fetchOriginMain: false,
    measurementRunnerPaths: [...PRODUCTION_PATHS]
  });
  const environmentSignature = {
    ...getStandardSimulationEnv(config),
    runnerVersion: RUNNER_VERSION,
    configurationHash: hashConfiguration({ config, conditions: CONDITION_IDS, kits: STARTING_KIT_IDS })
  };
  const result = await runMeasurement({ runs, seed });
  const report = buildReport(result, provenance, environmentSignature, {
    purpose: options.purpose || process.env.MEASUREMENT_PURPOSE || null,
    requestedRef: options.ref || process.env.MEASUREMENT_REQUESTED_REF || null
  });
  fs.writeFileSync(resolve(output), `${JSON.stringify(report)}\n`);
  fs.writeFileSync(resolve(summary), buildSummary(report));
  fs.writeFileSync(resolve(manifest), `${JSON.stringify(buildManifest(report, {
    runType: process.env.MEASUREMENT_RUN_TYPE || "diagnostic"
  }), null, 2)}\n`);
  console.log(`Wrote ${RUNNER_VERSION}: ${resolve(output)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
