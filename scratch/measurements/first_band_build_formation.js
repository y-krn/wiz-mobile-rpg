// sim-scope: run — production-backed First Band Build Formation diagnostic
/* global console, process */

import "../simulations/simulation_preflight.js";
import fs from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { STARTING_KITS } from "../../src/state/initial_state.js";
import { MEDIUMS } from "../../src/data/magic.js";
import { getEncounterPoolForFloor } from "../../src/data.js";
import { MATERIAL_TYPES } from "../../src/data/materials.js";
import { getCharacterEquipmentLoad } from "../../src/rules/equipment_load.js";
import {
  getDepartureCraftCost,
  purchaseDepartureCraft,
  getWorkshopGrants
} from "../../src/systems/workshop.js";
import {
  applyStandardSimulationEnv,
  getStandardSimulationEnv,
  STANDARD_BALANCE_CONFIG,
  hashConfiguration
} from "./balance_measurement.js";
import {
  compactRun,
  compareObservationInvariance,
  createCandidateAuditSampleCollector,
  createRunEvidenceSampleCollector,
  projectGameplayRecord
} from "./early_run_attrition_trajectory.js";
import { expectedAutoBestWeapon } from "./preparation_power_factorial.js";
import { CANONICAL_EQUIPMENT_UPDATE_POLICY_ID } from "../simulations/sim_depth_material_ev.js";
import { requireRunnerProvenance } from "./measurement_provenance.js";
import { printEnvSignatureBanner } from "./measurement_env_signature.js";
import { summarizeFleeTelemetry } from "./flee_telemetry.js";
import { getMilestoneBossRule } from "../../src/rules/boss_rules.js";

export const RUNNER_VERSION = "first-band-build-formation-v1";
export const SCHEMA_VERSION = 1;
export const DEFAULT_RUNS = 1000;
export const DEFAULT_SEED = 1277;
export const TARGET_DEPTH = 6;
export const MEASUREMENT_ID = "first-band-build-formation";
export const TRANSITION_MEASUREMENT_ID = "first-band-transition-recovery";
export const LEVEL_UP_MEASUREMENT_ID = "first-band-levelup-recovery";
export const KIT_IDS = Object.freeze(STARTING_KITS.map(kit => kit.id));
export const ARM_IDS = Object.freeze(["P0B1", "P0B0", "P1B1", "P1B0"]);
export const TRANSITION_ARM_IDS = Object.freeze(["R15A", "R25A", "R35A", "R35F"]);
export const LEVEL_UP_ARM_IDS = Object.freeze(["F0A", "P20A", "H5A", "H5F"]);
export const CHECKPOINTS = Object.freeze([2, 3, 4, 5]);
export const RUN_SAMPLE_LIMIT = 8;
export const BUILD_IDENTITY_SAMPLE_LIMIT = 32;
export const BUILD_IDENTITY_SAMPLE_PER_KIT_LIMIT = 8;
export const CANDIDATE_SAMPLE_LIMIT = 128;
export const WORKSHOP_SCENARIO_ID = "workshop-complete";
export const CANONICAL_ADAPTIVE_POLICY_ID = CANONICAL_EQUIPMENT_UPDATE_POLICY_ID;
export const ARCANA_WEAPON_MODE = "arcana-weapon-diagnostic";
export const ARCANA_WEAPON_MEASUREMENT_ID = "first-band-arcana-weapon-diagnostic";
export const ARCANA_MP_SUPPLY_MODE = "arcana-mp-supply-diagnostic";
export const ARCANA_MP_SUPPLY_MEASUREMENT_ID = "first-band-arcana-mp-supply-diagnostic";
export const B5_WALL_MODE = "b5-wall-diagnostic";
export const B5_WALL_MEASUREMENT_ID = "first-band-b5-wall-diagnostic";
export const B5_WALL_ARM_IDS = Object.freeze(["C", "F", "G", "FG"]);
export const B5_GUARDIAN_RETRY_MODE = "b5-guardian-retry-diagnostic";
export const B5_GUARDIAN_RETRY_MEASUREMENT_ID = "first-band-b5-guardian-retry-diagnostic";
export const B5_GUARDIAN_RETRY_ARM_IDS = Object.freeze(["C", "R"]);
export const B5_GUARDIAN_FLEE_EV_MODE = "b5-guardian-flee-ev-diagnostic";
export const B5_GUARDIAN_FLEE_EV_MEASUREMENT_ID = "first-band-b5-guardian-flee-ev-diagnostic";
export const B5_GUARDIAN_FLEE_EV_ARM_IDS = Object.freeze(["C"]);
export const GUARDIAN_STR_FIGHT_SAMPLE_LIMIT = 2;
export const ARCANA_KIT_IDS = Object.freeze(["arcana"]);
const GUARDIAN_OPENING_ITEM_KEYS = Object.freeze([
  "GUARD_POTION",
  "STR_POTION",
  "HASTE_POTION"
]);
const GUARDIAN_TRANSITION_TERM_KEYS = Object.freeze([
  "expectedTurnsToWin",
  "survivalTurns",
  "turnDeficit",
  "currentHp",
  "hpRate",
  "totalEnemyHp",
  "playerDefense",
  "incomingDamagePerRound",
  "playerDamagePerRound",
  "maxRecovery",
  "recoverySurvivalTurns"
]);
const GUARDIAN_TRANSITION_SAMPLE_DECISIONS = Object.freeze(["fight", "recover", "flee"]);

const DEFAULT_WEAPON_BY_KIT = Object.freeze({
  vanguard: "SHORT_SWORD",
  scout: "DAGGER",
  devotion: "MACE",
  arcana: "WAND"
});
const RECIPE_IDS = Object.freeze({
  portal: "TOWN_PORTAL",
  heal: "HEAL_POTION",
  antidote: "ANTIDOTE",
  guard: "GUARD_POTION"
});
const ARM_DEFINITIONS = Object.freeze({
  P0B1: Object.freeze({ id: "P0B1", preparationId: "P0", buildId: "B1", healPotions: 4, fixed: false }),
  P0B0: Object.freeze({ id: "P0B0", preparationId: "P0", buildId: "B0", healPotions: 4, fixed: true }),
  P1B1: Object.freeze({ id: "P1B1", preparationId: "P1", buildId: "B1", healPotions: 12, fixed: false }),
  P1B0: Object.freeze({ id: "P1B0", preparationId: "P1", buildId: "B0", healPotions: 12, fixed: true })
});
const TRANSITION_ARM_DEFINITIONS = Object.freeze({
  R15A: Object.freeze({ id: "R15A", preparationId: "P0", buildId: "A", healPotions: 4, fixed: false, recoveryRate: 0.15 }),
  R25A: Object.freeze({ id: "R25A", preparationId: "P0", buildId: "A", healPotions: 4, fixed: false, recoveryRate: 0.25 }),
  R35A: Object.freeze({ id: "R35A", preparationId: "P0", buildId: "A", healPotions: 4, fixed: false, recoveryRate: 0.35 }),
  R35F: Object.freeze({ id: "R35F", preparationId: "P0", buildId: "F", healPotions: 4, fixed: true, recoveryRate: 0.35 })
});
const LEVEL_UP_ARM_DEFINITIONS = Object.freeze({
  F0A: Object.freeze({ id: "F0A", preparationId: "P0", buildId: "A", healPotions: 4, fixed: false, recoveryRate: 0.25, levelUpRecoveryRate: 0, levelUpRecoveryFlatHp: 0 }),
  P20A: Object.freeze({ id: "P20A", preparationId: "P0", buildId: "A", healPotions: 4, fixed: false, recoveryRate: 0.25, levelUpRecoveryRate: 0.20, levelUpRecoveryFlatHp: 0 }),
  H5A: Object.freeze({ id: "H5A", preparationId: "P0", buildId: "A", healPotions: 4, fixed: false, recoveryRate: 0.25, levelUpRecoveryRate: 0, levelUpRecoveryFlatHp: 5 }),
  H5F: Object.freeze({ id: "H5F", preparationId: "P0", buildId: "F", healPotions: 4, fixed: true, recoveryRate: 0.25, levelUpRecoveryRate: 0, levelUpRecoveryFlatHp: 5 })
});
const ARCANA_WEAPON_ARM_DEFINITIONS = Object.freeze({
  C: Object.freeze({
    id: "C",
    preparationId: "P0",
    buildId: "canonical-adaptive",
    healPotions: 4,
    startingWeapon: "WAND",
    fixed: false,
    lockedEquipmentSlots: []
  }),
  W: Object.freeze({
    id: "W",
    preparationId: "P0",
    buildId: "wand-halito-weapon-lock",
    healPotions: 4,
    startingWeapon: "WAND",
    fixed: false,
    lockedEquipmentSlots: ["weapon"]
  }),
  R: Object.freeze({
    id: "R",
    preparationId: "P0",
    buildId: "rapier-weapon-lock",
    healPotions: 4,
    startingWeapon: "RAPIER",
    fixed: false,
    lockedEquipmentSlots: ["weapon"]
  })
});
const ARCANA_MP_SUPPLY_ARM_DEFINITIONS = Object.freeze({
  W0: Object.freeze({
    id: "W0",
    preparationId: "P0",
    buildId: "wand-halito-mana-0",
    healPotions: 4,
    additionalManaPotions: 0,
    startingWeapon: "WAND",
    fixed: false,
    lockedEquipmentSlots: ["weapon"]
  }),
  W1: Object.freeze({
    id: "W1",
    preparationId: "P0",
    buildId: "wand-halito-mana-1",
    healPotions: 4,
    additionalManaPotions: 1,
    startingWeapon: "WAND",
    fixed: false,
    lockedEquipmentSlots: ["weapon"]
  }),
  W2: Object.freeze({
    id: "W2",
    preparationId: "P0",
    buildId: "wand-halito-mana-2",
    healPotions: 4,
    additionalManaPotions: 2,
    startingWeapon: "WAND",
    fixed: false,
    lockedEquipmentSlots: ["weapon"]
  }),
  R: Object.freeze({
    id: "R",
    preparationId: "P0",
    buildId: "rapier-mana-0",
    healPotions: 4,
    additionalManaPotions: 0,
    startingWeapon: "RAPIER",
    fixed: false,
    lockedEquipmentSlots: ["weapon"]
  })
});
const B5_WALL_ARM_DEFINITIONS = Object.freeze({
  C: Object.freeze({ id: "C", preparationId: "P0", buildId: "current", healPotions: 4, fixed: false }),
  F: Object.freeze({ id: "F", preparationId: "P0", buildId: "b5-flame-disabled", healPotions: 4, fixed: false, b5FlameTrapDisabled: true }),
  G: Object.freeze({ id: "G", preparationId: "P0", buildId: "b5-guardian-no-flee", healPotions: 4, fixed: false, b5GuardianFleeDisabled: true }),
  FG: Object.freeze({ id: "FG", preparationId: "P0", buildId: "b5-flame-disabled-guardian-no-flee", healPotions: 4, fixed: false, b5FlameTrapDisabled: true, b5GuardianFleeDisabled: true })
});
const B5_GUARDIAN_RETRY_ARM_DEFINITIONS = Object.freeze({
  C: Object.freeze({ id: "C", preparationId: "P0", buildId: "current", healPotions: 4, fixed: false }),
  R: Object.freeze({ id: "R", preparationId: "P0", buildId: "b5-guardian-fracture-checkpoint", healPotions: 4, fixed: false, b5GuardianRetryCheckpoint: true })
});
const LEGACY_LEVEL_UP_ARM_DEFINITIONS = Object.freeze({
  L0A: Object.freeze({ id: "L0A", preparationId: "P0", buildId: "A", healPotions: 4, fixed: false, recoveryRate: 0.25, levelUpRecoveryRate: 0 }),
  L20A: Object.freeze({ id: "L20A", preparationId: "P0", buildId: "A", healPotions: 4, fixed: false, recoveryRate: 0.25, levelUpRecoveryRate: 0.20 })
});

function getMeasurementMode(mode) {
  if (mode === ARCANA_WEAPON_MODE) {
    return {
      id: ARCANA_WEAPON_MEASUREMENT_ID,
      runnerVersion: "first-band-build-formation-v5",
      armIds: Object.freeze(["C", "W", "R"]),
      armDefinitions: ARCANA_WEAPON_ARM_DEFINITIONS,
      preparationPotions: [4],
      kitIds: ARCANA_KIT_IDS
    };
  }
  if (mode === ARCANA_MP_SUPPLY_MODE) {
    return {
      id: ARCANA_MP_SUPPLY_MEASUREMENT_ID,
      runnerVersion: "first-band-build-formation-v6",
      armIds: Object.freeze(["W0", "W1", "W2", "R"]),
      armDefinitions: ARCANA_MP_SUPPLY_ARM_DEFINITIONS,
      preparationPotions: [4],
      kitIds: ARCANA_KIT_IDS
    };
  }
  if (mode === B5_WALL_MODE) {
    return {
      id: B5_WALL_MEASUREMENT_ID,
      runnerVersion: "first-band-build-formation-v7",
      armIds: B5_WALL_ARM_IDS,
      armDefinitions: B5_WALL_ARM_DEFINITIONS,
      preparationPotions: [4],
      kitIds: KIT_IDS
    };
  }
  if (mode === B5_GUARDIAN_RETRY_MODE) {
    return {
      id: B5_GUARDIAN_RETRY_MEASUREMENT_ID,
      runnerVersion: "first-band-build-formation-v8",
      armIds: B5_GUARDIAN_RETRY_ARM_IDS,
      armDefinitions: B5_GUARDIAN_RETRY_ARM_DEFINITIONS,
      preparationPotions: [4],
      kitIds: KIT_IDS
    };
  }
  if (mode === B5_GUARDIAN_FLEE_EV_MODE) {
    return {
      id: B5_GUARDIAN_FLEE_EV_MEASUREMENT_ID,
      runnerVersion: "first-band-build-formation-v12",
      armIds: B5_GUARDIAN_FLEE_EV_ARM_IDS,
      armDefinitions: { C: B5_GUARDIAN_RETRY_ARM_DEFINITIONS.C },
      preparationPotions: [4],
      kitIds: KIT_IDS
    };
  }
  if (mode === "transition-recovery") {
    return {
      id: TRANSITION_MEASUREMENT_ID,
      runnerVersion: "first-band-build-formation-v2",
      armIds: TRANSITION_ARM_IDS,
      armDefinitions: TRANSITION_ARM_DEFINITIONS,
      preparationPotions: [4],
      kitIds: KIT_IDS
    };
  }
  if (mode === "levelup-recovery") {
    return {
      id: LEVEL_UP_MEASUREMENT_ID,
      runnerVersion: "first-band-build-formation-v4",
      armIds: LEVEL_UP_ARM_IDS,
      armDefinitions: LEVEL_UP_ARM_DEFINITIONS,
      preparationPotions: [4],
      kitIds: KIT_IDS
    };
  }
  if (mode !== "build-formation") throw new Error(`unknown first-band mode: ${mode}`);
  return {
    id: MEASUREMENT_ID,
    runnerVersion: RUNNER_VERSION,
    armIds: ARM_IDS,
    armDefinitions: ARM_DEFINITIONS,
    preparationPotions: [4, 12],
    kitIds: KIT_IDS
  };
}
const PRODUCTION_PATHS = Object.freeze([
  "scratch/simulations/sim_depth_material_ev.js",
  "scratch/simulations/sim_recovery_policy.js",
  "scratch/measurements/early_run_attrition_trajectory.js",
  "scratch/measurements/first_band_build_formation.js",
  "scratch/measurements/flee_telemetry.js",
  "scratch/measurements/preparation_power_factorial.js",
  "scratch/measurements/build_progression_audit.js",
  "src/state/initial_state.js",
  "src/systems/workshop.js",
  "src/rules/craft_rules.js",
  "src/rules/build_snapshot.js",
  "src/rules/boss_rules.js",
  "src/combat_logic/turn_order.js",
  "src/run_map_generator.js"
]);

function rate(count, denominator) {
  return denominator > 0 ? count / denominator : null;
}

function finite(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function quantiles(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return { n: 0, p50: null };
  const position = (sorted.length - 1) * 0.5;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return { n: sorted.length, p50: sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower) };
}

function metric(values) {
  const observed = values.filter(Number.isFinite);
  return {
    observedN: observed.length,
    total: observed.reduce((sum, value) => sum + value, 0),
    meanPerEntrant: observed.length ? observed.reduce((sum, value) => sum + value, 0) / observed.length : null,
    p50: quantiles(observed).p50
  };
}

function quantileValue(values, fraction) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function metricWithQuartiles(values) {
  const observed = values.filter(Number.isFinite);
  return {
    ...metric(observed),
    p25: quantileValue(observed, 0.25),
    p75: quantileValue(observed, 0.75)
  };
}

function countValues(values, limit = BUILD_IDENTITY_SAMPLE_LIMIT) {
  const counts = {};
  values.filter(Boolean).forEach(value => { counts[value] = (counts[value] || 0) + 1; });
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return {
    distribution: Object.fromEntries(entries.slice(0, limit)),
    otherCount: entries.slice(limit).reduce((sum, [, count]) => sum + count, 0),
    uniqueCount: entries.length
  };
}

function structuralBuild(snapshot) {
  if (!snapshot) return null;
  const canonical = snapshot.canonicalBuildSnapshot || snapshot;
  const equipment = Object.fromEntries((snapshot.equipment || []).map(item => [item.slot, item.id]));
  return {
    identity: canonical.identity || snapshot.identity || null,
    weapon: {
      id: equipment.weapon || null,
      behavior: canonical.weaponProfile || null,
      hands: canonical.weaponHands ?? null
    },
    guardProfile: canonical.guardProfileId || null,
    medium: canonical.mediumId || null,
    runeSlots: canonical.runeSlotCapacity ?? null,
    activeRunes: [...(canonical.activeRuneSpellIds || [])],
    coreAxes: {
      main: [...(canonical.mainCoreIds || [])],
      auxiliary: [...(canonical.auxiliaryCoreIds || [])]
    },
    supportAxes: { ...(canonical.supportValues || {}) },
    explorationSupportAxes: { ...(canonical.explorationSupportValues || {}) }
  };
}

function recipesFor(healPotions, additionalManaPotions = 0) {
  return [
    RECIPE_IDS.portal,
    ...Array(healPotions).fill(RECIPE_IDS.heal),
    RECIPE_IDS.antidote,
    RECIPE_IDS.guard,
    ...Array(additionalManaPotions).fill("MANA_POTION")
  ];
}

function deriveBank(recipeIds) {
  const payment = getDepartureCraftCost(recipeIds);
  const bank = Object.fromEntries(MATERIAL_TYPES.map(material => [material, payment.typed[material] || 0]));
  if (payment.any > 0) bank[MATERIAL_TYPES[0]] += payment.any;
  return { bank };
}

function preparationSpec(arm) {
  const additionalManaPotions = arm.additionalManaPotions || 0;
  const recipeIds = recipesFor(arm.healPotions, additionalManaPotions);
  const { bank } = deriveBank(recipesFor(12, additionalManaPotions));
  const expectedCost = purchaseDepartureCraft(bank, recipeIds);
  if (!expectedCost?.ok) throw new Error("production departure craft bank derivation failed");
  return {
    id: arm.preparationId,
    startingWeaponMode: arm.preparationId === "P0" ? "kit-default" : "canonical-workshop-auto-best",
    healPotions: arm.healPotions,
    additionalManaPotions,
    recipeIds,
    materials: { ...bank },
    expectedPayment: { ...expectedCost.cost },
    manaPotionPayment: getDepartureCraftCost(
      Array(additionalManaPotions).fill("MANA_POTION")
    )
  };
}

function getStartingEquipmentLoad(snapshot) {
  const equipment = Object.fromEntries(
    (snapshot?.equipment || []).map(item => [item.slot, item.id])
  );
  return getCharacterEquipmentLoad({ equipment });
}

function startingBagUsed(result, workshop) {
  const consumables = Object.values(result.startingConsumables || {})
    .reduce((sum, value) => sum + Number(value || 0), 0);
  return consumables + getWorkshopGrants(workshop).returnItems.length + (result.departureCraft?.items?.length || 0);
}

function preparationRecord(result, arm, kitId, workshop, initialBank, expectedWeapon, expectedPayment) {
  const snapshot = result.startingBuildSnapshot;
  const weapon = snapshot?.equipment?.find(item => item.slot === "weapon");
  const canonical = snapshot?.canonicalBuildSnapshot || {};
  const payment = { ...(result.departureCraft?.cost || {}) };
  const postPurchaseBank = Object.fromEntries(MATERIAL_TYPES.map(material => [
    material,
    (initialBank[material] || 0) - (payment[material] || 0)
  ]));
  const used = startingBagUsed(result, workshop);
  return {
    kit: kitId,
    expectedStartingWeapon: expectedWeapon,
    startingWeapon: weapon?.id || null,
    startingWeaponMode: arm.preparationId === "P0" ? "kit-default" : "canonical-workshop-auto-best",
    weaponAtk: weapon?.atk ?? null,
    weaponHands: canonical.weaponHands ?? null,
    equipmentLoad: getStartingEquipmentLoad(snapshot),
    weaponBehavior: canonical.weaponProfile || null,
    guardProfile: canonical.guardProfileId || null,
    medium: canonical.mediumId || null,
    runeSlots: canonical.runeSlotCapacity ?? null,
    activeRunes: [...(canonical.activeRuneSpellIds || [])],
    startingMp: snapshot?.mp ?? null,
    maxMp: snapshot?.maxMp ?? null,
    healPotions: arm.healPotions,
    additionalManaPotions: arm.additionalManaPotions || 0,
    supplies: { TOWN_PORTAL: 1, HEAL_POTION: arm.healPotions, ANTIDOTE: 1, GUARD_POTION: 1 },
    departureCraft: {
      recipeIds: [...(result.departureCraft?.recipeIds || [])],
      payment,
      expectedPayment: { ...expectedPayment },
      purchaseSource: result.departureCraft?.purchaseSource || null,
      initialBank: { ...initialBank },
      postPurchaseBank
    },
    manaPotionPayment: getDepartureCraftCost(
      Array(arm.additionalManaPotions || 0).fill("MANA_POTION")
    ),
    startingBagUsed: used,
    startingBagFree: 20 - used
  };
}

export function normalizeBossTrace(trace = [], finalBattle = null) {
  const bossEvents = trace.filter(item => item?.type === "boss");
  const resultEvents = bossEvents.filter(item => typeof item.result === "string");
  return {
    actualBossEventArrival: bossEvents.some(item => item.encounterAllowed === true),
    bossCombatResultEventCount: resultEvents.length,
    fleeEventCount: resultEvents.filter(item => item.result === "flee").length,
    victoryEventCount: resultEvents.filter(item => item.result === "victory").length,
    deathEventCount: resultEvents.filter(item => item.result === "death").length,
    combatStart: resultEvents.length > 0 || Number(finalBattle?.attempts?.length || 0) > 0,
    retryRevisit: resultEvents.length >= 2
  };
}

function normalizeGuardianRetry(result) {
  const diagnostic = result.b5GuardianRetry;
  if (!diagnostic) return null;
  const attempts = (diagnostic.attempts || []).map(attempt => ({
    attempt: finite(attempt.attempt),
    result: attempt.result || null,
    retry: Boolean(attempt.retry),
    rounds: finite(attempt.rounds),
    qualifyingFlee: Boolean(attempt.qualifyingFlee),
    checkpointApplied: Boolean(attempt.checkpointApplied),
    bossStartHp: finite(attempt.bossStartHp),
    bossStartMaxHp: finite(attempt.bossStartMaxHp),
    bossStartHpRate: finite(attempt.bossStartHpRate),
    bossHpAtFlee: finite(attempt.bossHpAtFlee),
    bossHpAtFleeRate: finite(attempt.bossHpAtFleeRate),
    playerHpAtFlee: finite(attempt.playerHpAtFlee),
    playerHpAtFleeRate: finite(attempt.playerHpAtFleeRate),
    guardBreakCount: finite(attempt.guardBreakCount),
    actionTypes: [...(attempt.actionTypes || [])],
    bossStartGuardBroken: Boolean(attempt.bossStartGuardBroken),
    bossStartExposureTurns: finite(attempt.bossStartExposureTurns)
  }));
  return {
    enabled: Boolean(diagnostic.enabled),
    checkpointRate: finite(diagnostic.checkpointRate),
    checkpointEarned: Boolean(diagnostic.checkpointEarned),
    checkpointEarnedCount: finite(diagnostic.checkpointEarnedCount),
    checkpointAppliedCount: finite(diagnostic.checkpointAppliedCount),
    attempts
  };
}

function normalizeGuardianTraceAction(action) {
  return action
    ? {
        type: action.type || null,
        itemKey: action.itemKey || null,
        spellName: action.spellName || null
      }
    : null;
}

function projectGuardianTransitionTerms(observation) {
  const terms = observation?.terms || {};
  return Object.fromEntries(GUARDIAN_TRANSITION_TERM_KEYS.map(key => [key, finite(terms[key])]));
}

function subtractGuardianTransitionTerms(before, after) {
  return Object.fromEntries(GUARDIAN_TRANSITION_TERM_KEYS.map(key => [
    key,
    before[key] === null || after[key] === null ? null : after[key] - before[key]
  ]));
}

function guardianBoundaryState(terms) {
  if (terms.expectedTurnsToWin === null || terms.survivalTurns === null) return null;
  return terms.expectedTurnsToWin <= terms.survivalTurns;
}

function projectGuardianTransitionObservation(observation) {
  return {
    attempt: finite(observation?.attempt),
    playerDecisionIndex: finite(observation?.playerDecisionIndex),
    decision: observation?.decision || null,
    reason: observation?.reason || null,
    selectedAction: normalizeGuardianTraceAction(observation?.actualAction),
    executed: typeof observation?.executed === "boolean" ? observation.executed : null,
    executedAction: normalizeGuardianTraceAction(observation?.executedAction),
    eligibleOpeningItemKey: observation?.eligibleOpeningItemKey || null,
    fleeDeferredByOpening: Boolean(observation?.fleeDeferredByOpening)
  };
}

export function buildGuardianDecisionTransitions(trace, kitId = null) {
  const transitions = [];
  for (let index = 0; index < (trace || []).length - 1; index++) {
    const from = trace[index];
    const to = trace[index + 1];
    if (
      String(from?.attempt) !== String(to?.attempt) ||
      Number(to?.playerDecisionIndex) !== Number(from?.playerDecisionIndex) + 1
    ) continue;

    const before = projectGuardianTransitionTerms(from);
    const after = projectGuardianTransitionTerms(to);
    const fromObservation = projectGuardianTransitionObservation(from);
    const toObservation = projectGuardianTransitionObservation(to);
    const openingItemKey = fromObservation.executed === true &&
      fromObservation.executedAction?.type === "item" &&
      GUARDIAN_OPENING_ITEM_KEYS.includes(fromObservation.executedAction.itemKey)
      ? fromObservation.executedAction.itemKey
      : null;
    const boundaryBefore = guardianBoundaryState(before);
    const boundaryAfter = guardianBoundaryState(after);
    transitions.push({
      kit: kitId || from?.kit || to?.kit || null,
      attempt: fromObservation.attempt,
      from: fromObservation,
      to: toObservation,
      openingItemKey,
      eligibleOpeningItemKey: fromObservation.eligibleOpeningItemKey,
      fleeDeferredByOpening: fromObservation.fleeDeferredByOpening,
      before,
      after,
      delta: subtractGuardianTransitionTerms(before, after),
      boundaryBefore,
      boundaryAfter,
      boundaryCrossed: boundaryBefore !== null && boundaryAfter !== null &&
        boundaryBefore !== boundaryAfter
    });
  }
  return transitions;
}

function compactGuardianTransition(transition) {
  return {
    kit: transition.kit,
    attempt: transition.attempt,
    openingItemKey: transition.openingItemKey,
    eligibleOpeningItemKey: transition.eligibleOpeningItemKey,
    fleeDeferredByOpening: transition.fleeDeferredByOpening,
    from: transition.from,
    to: transition.to,
    before: transition.before,
    after: transition.after,
    delta: transition.delta,
    boundaryBefore: transition.boundaryBefore,
    boundaryAfter: transition.boundaryAfter,
    boundaryCrossed: transition.boundaryCrossed
  };
}

export function summarizeGuardianOpeningTransitions(transitions) {
  return Object.fromEntries(GUARDIAN_OPENING_ITEM_KEYS.map(itemKey => {
    const rows = (transitions || []).filter(item => item.openingItemKey === itemKey);
    const boundaryCrossingCount = rows.filter(item => item.boundaryCrossed).length;
    const representativeTransitions = GUARDIAN_TRANSITION_SAMPLE_DECISIONS
      .map(decision => rows.find(item => item.to.decision === decision))
      .filter(Boolean)
      .map(compactGuardianTransition);
    return [itemKey, {
      executedTransitionCount: eventCount(rows.length, (transitions || []).length),
      nextDecision: countRateBy(rows.map(item => item.to.decision || "unknown"), rows.length),
      nextReason: countRateBy(rows.map(item => item.to.reason || "unknown"), rows.length),
      termBefore: Object.fromEntries(GUARDIAN_TRANSITION_TERM_KEYS.map(term => [
        term,
        distribution90(rows.map(item => finite(item.before[term])))
      ])),
      termAfter: Object.fromEntries(GUARDIAN_TRANSITION_TERM_KEYS.map(term => [
        term,
        distribution90(rows.map(item => finite(item.after[term])))
      ])),
      termDelta: Object.fromEntries(GUARDIAN_TRANSITION_TERM_KEYS.map(term => [
        term,
        distribution90(rows.map(item => finite(item.delta[term])))
      ])),
      boundaryCrossing: eventCount(boundaryCrossingCount, rows.length),
      representativeTransitions
    }];
  }));
}

function guardianActionKey(action) {
  return action?.type === "item"
    ? `item:${action.itemKey || "unknown"}`
    : action?.type === "spell"
      ? `spell:${action.spellName || "unknown"}`
      : action?.type || "unknown";
}

function guardianAttemptOutcome(result) {
  if (result === "victory") return "victory";
  if (result === "flee") return "laterFlee";
  if (result === "death") return "death";
  return result || "unobserved";
}

function sumFinite(values) {
  return values.filter(Number.isFinite).reduce((sum, value) => sum + value, 0);
}

export function buildGuardianStrFightCohorts(result, kitId = null, runIndex = null) {
  const trace = result?.b5GuardianFleeEvDiagnostic?.decisionTrace || [];
  const bossBattle = (result?.specialBattles || []).find(item =>
    item.type === "boss" && Number(item.floor) === 5
  );
  const bossAttempts = new Map((bossBattle?.attempts || []).map(attempt => [
    String(attempt.attempt),
    attempt
  ]));
  const bossDiagnostics = (result?.diagnostics?.encounters || [])
    .filter(item => Number(item.floor) === 5 && item.type === "boss");
  const traceByAttempt = new Map();
  trace.forEach((observation, index) => {
    const key = String(observation.attempt);
    const rows = traceByAttempt.get(key) || [];
    rows.push({ observation, index });
    traceByAttempt.set(key, rows);
  });
  const cohorts = [];
  traceByAttempt.forEach((rows, attemptKey) => {
    rows.forEach(({ observation, index: traceIndex }, rowIndex) => {
      const next = rows[rowIndex + 1]?.observation || null;
      if (
        observation.decision !== "flee" ||
        observation.executed !== true ||
        observation.executedAction?.type !== "item" ||
        observation.executedAction.itemKey !== "STR_POTION" ||
        !next ||
        next.decision !== "fight" ||
        Number(next.playerDecisionIndex) !== Number(observation.playerDecisionIndex) + 1
      ) return;

      const attempt = bossAttempts.get(attemptKey) || null;
      const attemptNumber = Number(observation.attempt);
      const encounter = bossDiagnostics[attemptNumber - 1] || null;
      const continuationTrace = rows
        .slice(rowIndex + 1)
        .map(item => item.observation);
      const transitionRound = finite(next.round);
      const continuationRounds = (encounter?.rounds || []).filter(round =>
        transitionRound !== null && Number(round.round) >= transitionRound
      );
      const fleeTelemetry = summarizeFleeTelemetry({
        identity: { outcome: attempt?.result || null },
        diagnostic: { rounds: continuationRounds }
      });
      const terminalEnemy = encounter?.endEnemyHp?.find(enemy =>
        enemy.name === "デーモンガード"
      ) || encounter?.endEnemyHp?.[0] || null;
      const transitionHp = finite(next.hp?.current);
      const terminalHp = finite(encounter?.endHp);
      const transitionMp = finite(next.mp?.current);
      const terminalMp = finite(encounter?.endMp);
      const transitionGuardianHp = finite(next.guardian?.currentHp);
      const terminalGuardianHp = finite(terminalEnemy?.hp) ?? (
        attempt?.result === "victory" ? 0 : null
      );
      const pairedComparison = (result?.b5GuardianFleeEvDiagnostic?.strFightPairs || [])
        .find(pair =>
          Number(pair.attempt) === attemptNumber &&
          Number(pair.productionDecisionIndex) === Number(next.playerDecisionIndex)
        ) || null;
      const itemCounts = {};
      const spellCounts = {};
      continuationRounds
        .filter(round => round.playerActionExecuted === true)
        .forEach(round => {
          if (round.action === "item" && round.itemKey) {
            itemCounts[round.itemKey] = (itemCounts[round.itemKey] || 0) + 1;
          }
          if (round.action === "spell" && round.spellName) {
            spellCounts[round.spellName] = (spellCounts[round.spellName] || 0) + 1;
          }
        });
      const mpSpent = sumFinite(continuationRounds
        .filter(round => round.playerActionExecuted === true && round.action === "spell")
        .map(round => {
          const before = finite(round.mpBefore);
          const after = finite(round.mpAfter);
          return before === null || after === null ? null : Math.max(0, before - after);
        }));
      const mpRecovered = sumFinite(continuationRounds
        .filter(round => round.playerActionExecuted === true && round.action === "item" && round.itemKey === "MANA_POTION")
        .map(round => {
          const before = finite(round.mpBefore);
          const after = finite(round.mpAfter);
          return before === null || after === null ? null : Math.max(0, after - before);
        }));
      cohorts.push({
        kit: kitId,
        runIndex,
        attempt: attemptNumber,
        traceIndex,
        rawReason: observation.reason || null,
        transitionRound,
        terminalOutcome: guardianAttemptOutcome(attempt?.result),
        additionalDecisions: continuationTrace.length,
        additionalRounds: continuationRounds.length,
        decisionCounts: Object.fromEntries(["recovery", "fight", "flee"].map(decision => [
          decision,
          continuationTrace.filter(item =>
            item.decision === (decision === "recovery" ? "recover" : decision)
          ).length
        ])),
        executedActionCounts: Object.fromEntries(
          continuationTrace
            .filter(item => item.executed === true && item.executedAction)
            .reduce((counts, item) => {
              const key = guardianActionKey(item.executedAction);
              counts.set(key, (counts.get(key) || 0) + 1);
              return counts;
            }, new Map())
        ),
        executedFleeActions: continuationTrace.filter(item =>
          item.executed === true && item.executedAction?.type === "run"
        ).length,
        fleePartingAttackCount: fleeTelemetry.fleePartingAttackCount,
        partingAttackDamageHp: fleeTelemetry.partingAttackDamageHp,
        fleeDiedFromPartingAttack: fleeTelemetry.fleeDiedFromPartingAttack,
        transition: {
          hp: transitionHp,
          mp: transitionMp,
          guardianHp: transitionGuardianHp
        },
        terminal: {
          hp: terminalHp,
          mp: terminalMp,
          guardianHp: terminalGuardianHp
        },
        pairedComparison: pairedComparison ? structuredClone(pairedComparison) : null,
        guardianDamage: transitionGuardianHp === null || terminalGuardianHp === null
          ? null
          : Math.max(0, transitionGuardianHp - terminalGuardianHp),
        hpDelta: transitionHp === null || terminalHp === null ? null : terminalHp - transitionHp,
        hpLoss: transitionHp === null || terminalHp === null
          ? null
          : Math.max(0, transitionHp - terminalHp),
        mpDelta: transitionMp === null || terminalMp === null ? null : terminalMp - transitionMp,
        mpLoss: transitionMp === null || terminalMp === null
          ? null
          : Math.max(0, transitionMp - terminalMp),
        resources: {
          itemCounts,
          spellCounts,
          mpSpent,
          mpRecovered
        }
      });
    });
  });
  return cohorts;
}

function normalizeGuardianFleeEv(result, kitId, runIndex = null) {
  const diagnostic = result.b5GuardianFleeEvDiagnostic;
  if (!diagnostic) return null;
  const decisionTrace = (diagnostic.decisionTrace || []).map(observation => ({
    ...observation,
    kit: kitId,
    terms: { ...(observation.terms || {}) },
    hp: observation.hp ? { ...observation.hp } : null,
    mp: observation.mp ? { ...observation.mp } : null,
    stock: { ...(observation.stock || {}) },
    actualAction: observation.actualAction ? { ...observation.actualAction } : null,
    executedAction: observation.executedAction ? { ...observation.executedAction } : null,
    recovery: observation.recovery ? {
      ...observation.recovery,
      diosPayment: observation.recovery.diosPayment
        ? { ...observation.recovery.diosPayment }
        : null
    } : null,
    preferredAction: observation.preferredAction ? {
      ...observation.preferredAction,
      payment: observation.preferredAction.payment
        ? { ...observation.preferredAction.payment }
        : null
    } : null,
    offensiveSpell: observation.offensiveSpell ? {
      ...observation.offensiveSpell,
      names: [...(observation.offensiveSpell.names || [])]
    } : null,
    guardian: observation.guardian ? { ...observation.guardian } : null,
    productionBossRule: observation.productionBossRule
      ? { ...observation.productionBossRule }
      : null
  }));
  return {
    enabled: Boolean(diagnostic.enabled),
    observations: (diagnostic.observations || []).map(observation => ({
      ...observation,
      kit: kitId,
      terms: { ...(observation.terms || {}) },
      hp: observation.hp ? { ...observation.hp } : null,
      mp: observation.mp ? { ...observation.mp } : null,
      stock: { ...(observation.stock || {}) },
      recovery: observation.recovery ? {
        ...observation.recovery,
        diosPayment: observation.recovery.diosPayment
          ? { ...observation.recovery.diosPayment }
          : null
      } : null,
      preferredAction: observation.preferredAction ? {
        ...observation.preferredAction,
        payment: observation.preferredAction.payment
          ? { ...observation.preferredAction.payment }
          : null
      } : null,
      offensiveSpell: observation.offensiveSpell ? {
        ...observation.offensiveSpell,
        names: [...(observation.offensiveSpell.names || [])]
      } : null,
      guardian: observation.guardian ? { ...observation.guardian } : null,
      productionBossRule: observation.productionBossRule
        ? { ...observation.productionBossRule }
        : null
    })),
    strFightCohorts: buildGuardianStrFightCohorts(result, kitId, runIndex),
    strFightPairs: (diagnostic.strFightPairs || []).map(pair => ({
      ...structuredClone(pair),
      kit: kitId,
      runIndex
    })),
    decisionTrace,
    transitions: buildGuardianDecisionTransitions(decisionTrace, kitId)
  };
}

function normalizeGuardianActionSequence(result) {
  const bossBattle = (result.specialBattles || []).find(item =>
    item.type === "boss" && Number(item.floor) === 5
  );
  const traceByAttempt = {};
  const trace = result.b5GuardianFleeEvDiagnostic?.decisionTrace || [];
  trace.forEach(item => {
    const key = String(item.attempt);
    traceByAttempt[key] ||= [];
    traceByAttempt[key].push(item);
  });
  const actionKey = action => action?.type === "item"
    ? `item:${action.itemKey || "unknown"}`
    : action?.type === "spell"
      ? `spell:${action.spellName || "unknown"}`
      : action?.type || "unknown";
  const normalizeAction = action => action
    ? {
        type: action.type || null,
        itemKey: action.itemKey || null,
        spellName: action.spellName || null
      }
    : null;
  const sequencePattern = (actions, result, fleeIndex) => result === "flee" && fleeIndex >= 0
    ? actions.length ? actions.join(" -> ") + " -> run" : "run"
    : result || "unknown";
  return (bossBattle?.attempts || []).map(attempt => {
    const attemptTrace = traceByAttempt[String(attempt.attempt)] || [];
    const actionSignatures = (attempt.actionSignatures || attemptTrace.map(item => item.actualAction))
      .map(normalizeAction);
    const executedActionSignatures = (
      attempt.executedActionSignatures || attemptTrace.map(item => item.executedAction)
    ).map(normalizeAction);
    const selectedFleeIndex = actionSignatures.findIndex(action => action?.type === "run");
    const executedFleeIndex = executedActionSignatures.findIndex(action => action?.type === "run");
    const selectedFleeTrace = selectedFleeIndex >= 0 ? attemptTrace[selectedFleeIndex] : null;
    const executedFleeTrace = executedFleeIndex >= 0 ? attemptTrace[executedFleeIndex] : null;
    const selectedActionsBeforeFlee = selectedFleeIndex >= 0
      ? actionSignatures.slice(0, selectedFleeIndex).map(actionKey)
      : [];
    const executedActionsBeforeFlee = executedFleeIndex >= 0
      ? executedActionSignatures.slice(0, executedFleeIndex).filter(Boolean).map(actionKey)
      : [];
    const selectedOpeningItemsBeforeFlee = selectedActionsBeforeFlee
      .filter(action => ["item:GUARD_POTION", "item:STR_POTION", "item:HASTE_POTION"].includes(action))
      .map(action => action.slice("item:".length));
    const executedOpeningItemsBeforeFlee = executedActionsBeforeFlee
      .filter(action => ["item:GUARD_POTION", "item:STR_POTION", "item:HASTE_POTION"].includes(action))
      .map(action => action.slice("item:".length));
    const guardianDamageBeforeFlee = attempt.result === "flee" &&
      Number.isFinite(Number(attempt.bossStartHp)) && Number.isFinite(Number(attempt.bossHpAtFlee))
      ? Number(attempt.bossStartHp) - Number(attempt.bossHpAtFlee)
      : null;
    return {
      attempt: finite(attempt.attempt),
      result: attempt.result || null,
      rounds: finite(attempt.rounds),
      actionTypes: [...(attempt.actionTypes || [])],
      actionSignatures,
      executedActionSignatures,
      selectedFirstAction: actionSignatures[0] ? { ...actionSignatures[0] } : null,
      executedFirstAction: executedActionSignatures.find(Boolean)
        ? { ...executedActionSignatures.find(Boolean) }
        : null,
      actualFirstAction: actionSignatures[0] ? { ...actionSignatures[0] } : null,
      selectedFleeDecisionIndex: selectedFleeTrace
        ? finite(selectedFleeTrace.playerDecisionIndex)
        : selectedFleeIndex >= 0 ? selectedFleeIndex + 1 : null,
      executedFleeDecisionIndex: executedFleeTrace
        ? finite(executedFleeTrace.playerDecisionIndex)
        : executedFleeIndex >= 0 ? executedFleeIndex + 1 : null,
      fleeDecisionIndex: executedFleeTrace
        ? finite(executedFleeTrace.playerDecisionIndex)
        : executedFleeIndex >= 0 ? executedFleeIndex + 1 : null,
      selectedFleeRound: selectedFleeTrace
        ? finite(selectedFleeTrace.round)
        : selectedFleeIndex >= 0 ? selectedFleeIndex + 1 : null,
      executedFleeRound: executedFleeTrace
        ? finite(executedFleeTrace.round)
        : executedFleeIndex >= 0 ? executedFleeIndex + 1 : null,
      fleeRound: executedFleeTrace
        ? finite(executedFleeTrace.round)
        : executedFleeIndex >= 0 ? executedFleeIndex + 1 : null,
      selectedActionsBeforeFlee,
      executedActionsBeforeFlee,
      actionsBeforeFlee: selectedActionsBeforeFlee,
      selectedActionsBeforeFleePattern: sequencePattern(
        selectedActionsBeforeFlee,
        attempt.result,
        selectedFleeIndex
      ),
      executedActionsBeforeFleePattern: sequencePattern(
        executedActionsBeforeFlee,
        attempt.result,
        executedFleeIndex
      ),
      actionsBeforeFleePattern: sequencePattern(
        selectedActionsBeforeFlee,
        attempt.result,
        selectedFleeIndex
      ),
      selectedOpeningItemsBeforeFlee,
      openingItemsBeforeFlee: selectedOpeningItemsBeforeFlee,
      openingItemsUsedBeforeFlee: executedOpeningItemsBeforeFlee,
      bossStartHp: finite(attempt.bossStartHp),
      bossHpAtFlee: finite(attempt.bossHpAtFlee),
      bossHpAtFleeRate: finite(attempt.bossHpAtFleeRate),
      guardianDamageBeforeFlee,
      playerHpAtFlee: finite(attempt.playerHpAtFlee),
      playerHpAtFleeRate: finite(attempt.playerHpAtFleeRate),
      decisionTrace: attemptTrace.map(item => ({ ...item }))
    };
  });
}

function normalizeInventoryCounts(inventory) {
  return Object.fromEntries(
    Object.entries(inventory || {}).sort(([left], [right]) => left.localeCompare(right))
  );
}

function normalizeEquipment(snapshot) {
  return (snapshot?.equipment || [])
    .map(item => ({ slot: item.slot || null, id: item.id || null }))
    .sort((left, right) => String(left.slot).localeCompare(String(right.slot)) || String(left.id).localeCompare(String(right.id)));
}

function normalizeB5Entry(result, route) {
  const stage = result.stage15Diagnostics?.byFloor?.["5"] || null;
  const build = stage?.entryBuildSnapshot || null;
  const reached = Boolean(result.b5Entrant);
  if (!reached) {
    return {
      status: "unreachable",
      reached,
      reachedFloor: finite(result.reachedFloor),
      outcome: result.outcome || null,
      terminalReason: result.terminationReason || null
    };
  }
  return {
    status: "observed",
    reached,
    hp: finite(stage?.entryHp),
    maxHp: finite(stage?.entryMaxHp),
    mp: finite(stage?.entryMp),
    maxMp: finite(stage?.entryMaxMp),
    inventorySlots: Object.values(stage?.entryInventory || {}).reduce((sum, count) => sum + Number(count || 0), 0),
    inventory: normalizeInventoryCounts(stage?.entryInventory),
    healPotion: finite(stage?.entryHealPotionRemaining),
    equipment: normalizeEquipment(build),
    buildSnapshot: structuralBuild(build),
    routeRelevantState: route ? {
      floorSteps: finite(route.floorSteps),
      routeDistance: finite(route.routeDistance),
      bossExitDistance: finite(route.bossExitDistance),
      bossToStairsDistance: finite(route.bossToStairsDistance),
      naturalBossToStairsDistance: finite(route.naturalBossToStairsDistance),
      routeEventTypes: [...(route.routeEventTypes || [])],
      routeEventDistances: [...(route.routeEventDistances || [])],
      milestoneForced: Boolean(route.milestoneForced)
    } : null
  };
}

export function normalizeB5(result, record, kitId = null, runIndex = null) {
  const entrant = Boolean(result.b5Entrant);
  const route = (result.specialRouteFloors || []).find(item => Number(item.floor) === 5);
  if (!entrant) {
    return {
      status: "unreachable",
      guardianRetry: normalizeGuardianRetry(result),
      guardianFleeEv: normalizeGuardianFleeEv(result, kitId, runIndex),
      guardianActionSequence: normalizeGuardianActionSequence(result),
      entryParity: normalizeB5Entry(result, route)
    };
  }
  const bossBattle = (result.specialBattles || []).find(item => item.type === "boss" && Number(item.floor) === 5);
  const bossEncounters = (result.diagnostics?.encounters || []).filter(item =>
    Number(item.floor) === 5 && item.type === "boss"
  );
  const bossEncounter = bossEncounters[0];
  const bossTrace = (result.milestoneEventTrace || []).filter(item =>
    Number(item.floor) === 5 && item.type === "boss"
  );
  const routeBossDetected = Number(route?.detectedBosses || 0) > 0;
  const bossTraceSummary = normalizeBossTrace(bossTrace, bossBattle);
  const milestonePortalVisit = (result.milestoneEventTrace || []).some(item =>
    Number(item.floor) === 5 && item.type === "return_portal" && item.gateOpen === true
  );
  const terminalReason = record.terminalReason || result.terminationReason || null;
  const bossStarted = bossTraceSummary.combatStart;
  const reachedB6 = Number(result.reachedFloor) >= 6;
  const guardBreakCount = bossEncounters
    .flatMap(encounter => encounter.rounds || [])
    .flatMap(round => round.log || [])
    .filter(message => String(message).includes("装甲が砕け")).length;
  const ratio = (value, max) => Number.isFinite(Number(value)) && Number.isFinite(Number(max)) && Number(max) > 0
    ? Number(value) / Number(max)
    : null;
  return {
    status: "observed",
    flameTrap: {
      eligibleSteps: finite(result.flameTrapEligibleSteps),
      triggerCount: finite(result.flameTrapActivations),
      warningOrAvoidCount: finite(result.flameTrapDisarmed),
      warningCount: null,
      hpDamage: finite(result.flameTrapDamageHp),
      mitigatedDamage: null,
      terminalDeaths: finite(result.flameTrapDeaths),
      schedule: "production flame-trap effect; simulator B5 step scheduling is approximate"
    },
    boss: {
      routeBossDetected,
      ...bossTraceSummary,
      combatStart: bossStarted,
      arrivalHp: metric([finite(bossEncounter?.startHp)]),
      arrivalHpRatio: metric([ratio(bossEncounter?.startHp, bossEncounter?.startMaxHp)]),
      arrivalMp: metric([finite(bossEncounter?.startMp)]),
      arrivalMpRatio: metric([ratio(bossEncounter?.startMp, bossEncounter?.startMaxMp)]),
      remainingHealPotion: metric([finite(bossEncounter?.startHealPotions)]),
      buildAtArrival: structuralBuild(bossBattle?.firstBuild),
      victory: bossTraceSummary.victoryEventCount > 0,
      flee: bossTraceSummary.fleeEventCount > 0,
      death: bossTraceSummary.deathEventCount > 0,
      retry: bossTraceSummary.retryRevisit,
      guardBreakCount: metric([guardBreakCount]),
      guardBreak: guardBreakCount > 0,
      notReached: !bossTraceSummary.actualBossEventArrival
    },
    townPortalReturnBeforeBoss: terminalReason === "town-portal" && !bossTraceSummary.actualBossEventArrival,
    townPortalReturnAfterBossAttemptBeforeB6: terminalReason === "town-portal" &&
      bossTraceSummary.bossCombatResultEventCount > 0 && !reachedB6,
    milestonePortalVisit,
    milestonePortalReturnAfterGuardian: terminalReason === "milestone_portal" &&
      milestonePortalVisit && bossTraceSummary.victoryEventCount > 0,
    // Legacy fields remain for aggregate compatibility; the decision view uses
    // the explicit terminal-reason fields above.
    returnBeforeBoss: record.outcome.voluntaryReturn && !bossStarted,
    returnAfterBossBeforeB6: record.outcome.voluntaryReturn && bossStarted && !reachedB6,
    b6Transition: reachedB6,
    guardianRetry: normalizeGuardianRetry(result),
    guardianFleeEv: normalizeGuardianFleeEv(result, kitId, runIndex),
    guardianActionSequence: normalizeGuardianActionSequence(result),
    entryParity: normalizeB5Entry(result, route)
  };
}

function checkEnemyActions(record) {
  Object.values(record.floors || {}).forEach(floor => {
    const rounds = floor?.incrementalCost?.combatRounds;
    const damage = floor?.incrementalCost?.combatDamageHp;
    const enemyActions = floor?.incrementalCost?.enemyActionCount;
    if ((rounds > 0 || damage > 0) && damage > 0 && enemyActions === 0) {
      throw new Error(`enemyActions observation silently zero at B${floor.floor}`);
    }
  });
}

function compactDiagnostic(result, context) {
  const record = compactRun(result, context);
  const lifecycle = result.buildPayment?.stake?.lifecycle?.counts || {};
  record.outcome = {
    kind: record.outcome,
    death: record.outcome === "died",
    voluntaryReturn: record.outcome === "voluntaryReturn",
    otherTerminal: !["died", "voluntaryReturn"].includes(record.outcome),
    reached: Object.fromEntries([2, 3, 4, 5, 6].map(floor => [floor, Number(record.reachedFloor) >= floor])),
    deepestFloor: record.reachedFloor
  };
  if (context.arcanaWeaponDiagnostic) {
    const audits = new Map((result.equipmentCandidateAudit || []).map(audit => [audit.id, audit]));
    const swaps = (result.equipmentTelemetry || []).filter(event =>
      event.type === "swap" && event.slot === "weapon"
    );
    const firstIndex = swaps.findIndex(event => {
      const audit = audits.get(event.candidateAuditId);
      const currentId = audit?.currentEquipmentId || null;
      return currentId === "WAND" && event.candidateId && !MEDIUMS[event.candidateId];
    });
    if (firstIndex >= 0) {
      const event = swaps[firstIndex];
      const audit = audits.get(event.candidateAuditId);
      const laterMediumReacquisition = swaps.slice(firstIndex + 1).some(candidate =>
        Boolean(MEDIUMS[candidate.candidateId])
      );
      record.mediumAbandonment = {
        firstDeparture: {
          floor: finite(event.floor),
          step: finite(event.step),
          targetWeapon: event.candidateId || null,
          currentScore: finite(audit?.currentScore ?? event.scoreBefore),
          candidateScore: finite(audit?.candidateScore ?? event.scoreAfter),
          atkDelta: finite(audit?.atkDelta),
          maxMPDelta: finite(audit?.maxMpDelta),
          mediumLoss: true,
          activeRuneRemoval: [...(audit?.activeRuneSpellChange?.removed || [])]
        },
        laterMediumReacquisition
      };
    } else {
      record.mediumAbandonment = null;
    }
  }
  record.loot = {
    acquired: finite(lifecycle.found),
    bagged: finite(lifecycle.bagged),
    inventoryRejections: { ...(result.pickupRejectionsByCategory || {}) },
    bagOccupancyAtEnd: finite(result.finalInventorySlots),
    equipmentLootAcquired: finite(result.equipmentFound)
  };
  const manaEvents = (result.diagnostics?.recoveryEvents || [])
    .filter(event => event.itemId === "MANA_POTION");
  const manaAcquiredBySource = { ...(result.manaPotionsAcquiredBySource || {}) };
  const manaConsumedBySource = { ...(result.manaPotionsConsumedBySource || {}) };
  const manaAcquired = Object.values(manaAcquiredBySource).reduce((sum, value) => sum + Number(value || 0), 0);
  const manaConsumed = Object.values(manaConsumedBySource).reduce((sum, value) => sum + Number(value || 0), 0);
  const manaRemaining = Number(result.finalManaPotions || 0);
  const terminalLoss = Math.max(0, manaAcquired - manaConsumed - manaRemaining);
  record.manaPotionLifecycle = {
    departureRequested: Number(result.departureCraft?.recipeIds?.filter(id => id === "MANA_POTION").length || 0),
    departureCrafted: Number(result.departureCraft?.items?.filter(id => id === "MANA_POTION").length || 0),
    acquiredTotal: manaAcquired,
    acquiredBySource: manaAcquiredBySource,
    consumedTotal: manaConsumed,
    consumedBySource: manaConsumedBySource,
    consumedInCombat: Number(result.manaPotionsUsedInCombat || 0),
    consumedPostCombat: Number(result.manaPotionsUsedPostCombat || 0),
    firstConsumption: manaEvents.length > 0
      ? { floor: finite(manaEvents[0].floor), step: finite(manaEvents[0].step), context: manaEvents[0].context || null }
      : null,
    actualMpRecovered: manaEvents.reduce((sum, event) => sum + Number(event.mpRecovered || 0), 0),
    capWaste: manaEvents.reduce((sum, event) => sum + Math.max(
      0,
      Number(event.mpBefore || 0) + 3 - Number(event.maxMp || 0)
    ), 0),
    remainingAtEntry: Object.fromEntries([2, 3, 4, 5].map(floor => [
      `B${floor}`,
      finite(record.floors[floor]?.entry?.manaPotionRemaining)
    ])),
    remainingAtTermination: finite(result.finalManaPotions),
    terminalLoss,
    reconciliation: manaAcquired === manaConsumed + manaRemaining + terminalLoss
  };
  record.b5 = normalizeB5(result, record, context.startingKitId, context.runIndex);
  if (context.b5Intervention) {
    record.b5.intervention = {
      flameTrapDisabled: context.b5Intervention.b5FlameTrapDisabled === true,
      guardianFleeDisabled: context.b5Intervention.b5GuardianFleeDisabled === true,
      guardianRetryCheckpoint: context.b5Intervention.b5GuardianRetryCheckpoint === true
    };
  }
  record.transitionRecovery = (result.floorTransitionRecovery || []).map(event => ({
    fromFloor: finite(event.fromFloor),
    toFloor: finite(event.toFloor),
    source: event.source || null,
    hpBefore: finite(event.hpBefore),
    hpAfter: finite(event.hpAfter),
    maxHp: finite(event.maxHp),
    requestedHp: finite(event.requestedHp),
    actualHealedHp: finite(event.actualHealedHp),
    actualHealedRate: finite(event.actualHealedRate),
    cappedByMaxHp: Boolean(event.cappedByMaxHp),
    reachedMaxHp: Boolean(event.reachedMaxHp),
    maxHpOverage: finite(event.maxHpOverage)
  }));
  checkEnemyActions(record);
  return record;
}

function compareGuardianObservationInvariance(observationOff, observationOn) {
  const stripDiagnostic = record => {
    const copy = structuredClone(record);
    if (copy.b5) delete copy.b5.guardianFleeEv;
    return copy;
  };
  const result = compareObservationInvariance(
    stripDiagnostic(observationOff),
    stripDiagnostic(observationOn)
  );
  return {
    ...result,
    comparedFields: [...result.comparedFields, "Guardian action sequence", "Guardian outcome"]
  };
}

function summarizeTransitionRecovery(rows) {
  return Object.fromEntries([2, 3, 4, 5, 6].map(toFloor => {
    const events = rows.flatMap(row => row.transitionRecovery || [])
      .filter(event => event.toFloor === toFloor);
    const numeric = field => metric(events.map(event => event[field]).filter(Number.isFinite));
    const capCount = events.filter(event => event.cappedByMaxHp).length;
    const maxCount = events.filter(event => event.reachedMaxHp).length;
    return [toFloor, {
      status: events.length ? "observed" : "unreachable",
      entrantN: events.length,
      sourceCounts: Object.fromEntries(["stairs", "pitfall"].map(source => [
        source,
        events.filter(event => event.source === source).length
      ])),
      hpBefore: numeric("hpBefore"),
      hpAfter: numeric("hpAfter"),
      actualHealedHp: numeric("actualHealedHp"),
      actualHealedRate: numeric("actualHealedRate"),
      capAtFull: { count: capCount, rate: rate(capCount, events.length) },
      reachedMaxHp: { count: maxCount, rate: rate(maxCount, events.length) },
      maxHpOverage: numeric("maxHpOverage")
    }];
  }));
}

function buildCheckpoints(rows, floor) {
  const observedRows = rows.filter(row => {
    const checkpoint = row.buildCheckpoints?.[`B${floor}Entry`];
    return checkpoint?.status === "observed" && checkpoint.build;
  });
  const observed = observedRows.map(row => row.buildCheckpoints[`B${floor}Entry`]);
  const identities = observed.map(item => item.build.identity);
  const swaps = observed.map(item => item.maturity.cumulativeEquipmentSwaps);
  const changed = observed.filter(item => item.maturity.buildIdentityChanged).length;
  const structural = observed.map(item => structuralBuild(item.build));
  const swapCounts = observedRows.map(row => {
    const swaps = (row.equipmentDecisionTrace || []).filter(event => event.floor < floor);
    return {
      weapon: swaps.filter(event => event.slot === "weapon").length,
      nonWeapon: swaps.filter(event => event.slot !== "weapon").length
    };
  });
  const first = structural[0] || null;
  const candidateSummaries = rows.map(row => row.equipmentCandidateAuditSummary).filter(Boolean);
  const opportunities = candidateSummaries.reduce((sum, summary) => sum + [1, 2, 3, 4]
    .filter(candidateFloor => candidateFloor < floor)
    .reduce((floorSum, candidateFloor) => floorSum + (summary.byFloor?.[String(candidateFloor)]?.evaluationEvents || 0), 0), 0);
  const rejectedClassifications = {};
  candidateSummaries.forEach(summary => Object.entries(summary.rejectedClassifications || {}).forEach(([id, count]) => {
    rejectedClassifications[id] = (rejectedClassifications[id] || 0) + count;
  }));
  return {
    status: observed.length ? "observed" : "unreachable",
    entrantN: observed.length,
    changedFromDeparture: { count: changed, rate: rate(changed, observed.length) },
    equipmentSwapCount: metric(swaps),
    weaponSwapCount: metric(swapCounts.map(item => item.weapon)),
    nonWeaponSwapCount: metric(swapCounts.map(item => item.nonWeapon)),
    weaponIdentity: countValues(structural.map(item => item.weapon.id)),
    weaponBehavior: countValues(structural.map(item => item.weapon.behavior)),
    guardProfile: countValues(structural.map(item => item.guardProfile)),
    medium: countValues(structural.map(item => item.medium)),
    runeSlots: countValues(structural.map(item => item.runeSlots)),
    activeRunes: countValues(structural.flatMap(item => item.activeRunes)),
    coreAxes: countValues(structural.map(item => JSON.stringify(item.coreAxes))),
    supportAxes: countValues(structural.map(item => JSON.stringify(item.supportAxes))),
    structuralBuildIdentity: countValues(identities),
    buildIdentitySample: [...new Set(identities)].slice(0, BUILD_IDENTITY_SAMPLE_PER_KIT_LIMIT),
    changeSemantics: {
      status: candidateSummaries.length ? "observed" : "unobserved",
      basis: "existing build_progression_audit candidate observations",
      opportunities,
      acceptedSwaps: swaps.filter(Number.isFinite).reduce((sum, value) => sum + value, 0),
      reinforcement: "unobserved",
      costConversion: "unobserved",
      directionChange: "unobserved",
      rejectedCandidateClassifications: rejectedClassifications,
      unobservedReason: "existing helper classifies candidate tradeoffs, not these three semantic labels"
    },
    example: first
  };
}

function combatCheckpoints(rows) {
  return Object.fromEntries([1, 2, 3, 4, 5].map(floor => {
    const entered = rows.map(row => row.floors?.[floor]).filter(Boolean);
    const values = field => entered.map(item => field(item)).filter(Number.isFinite);
    return [floor, {
      observedEntrantN: entered.length,
      encounterCount: metric(values(item => item.incrementalCost.combatCount)),
      rounds: metric(values(item => item.incrementalCost.combatRounds)),
      enemyActions: metric(values(item => item.incrementalCost.enemyActionCount)),
      combatHpDamage: metric(values(item => item.incrementalCost.combatDamageHp)),
      spellTelemetry: {
        combatCount: metric(values(item => item.incrementalCost.combatCount)),
        rounds: metric(values(item => item.incrementalCost.combatRounds)),
        enemyActions: metric(values(item => item.incrementalCost.enemyActionCount)),
        fightActions: metric(values(item => item.incrementalCost.physicalFightActions)),
        spellActions: metric(values(item => item.incrementalCost.spellActions)),
        physicalDamage: metric(values(item => item.incrementalCost.physicalDamage)),
        spellDamage: metric(values(item => item.incrementalCost.spellDamage)),
        halitoCasts: metric(values(item => item.incrementalCost.spellCastsBySpell?.HALITO || 0)),
        mpStart: metricWithQuartiles(values(item => item.incrementalCost.mpStart)),
        mpSpent: metric(values(item => item.incrementalCost.combatMpSpent)),
        mpEnd: metricWithQuartiles(values(item => item.incrementalCost.mpEnd)),
        spellOpportunityRounds: metric(values(item => item.incrementalCost.spellOpportunityRounds)),
        eligibleSpellSelected: metric(values(item => item.incrementalCost.eligibleSpellSelected)),
        eligibleFightFallback: metric(values(item => item.incrementalCost.eligibleFightFallback)),
        fallbackReasons: mergeCountMaps(entered.map(item => item.incrementalCost.fallbackReasons)),
        mpZeroCombatCount: metric(values(item => item.incrementalCost.mpZeroCombatCount)),
        mpZeroCombatShare: rate(
          entered.reduce((sum, item) => sum + Number(item.incrementalCost.mpZeroCombatCount || 0), 0),
          entered.reduce((sum, item) => sum + Number(item.incrementalCost.combatCount || 0), 0)
        )
      },
      potionUsed: metric(values(item => Object.values(item.recovery?.itemUsed || {})
        .reduce((sum, amount) => sum + Number(amount || 0), 0))),
      hpRecovered: metric(values(item => item.recovery?.healingHp)),
      entryHp: metric(values(item => item.entry.hp)),
      entryHpRatio: metric(values(item => item.entry.hpRatio)),
      entryMp: metric(values(item => item.entry.mp)),
      entryMpRatio: metric(values(item => item.entry.mpRatio)),
      remainingHealPotion: metric(values(item => item.entry.recoveryRemaining))
    }];
  }));
}

function recoveryCheckpoints(rows) {
  return Object.fromEntries([1, 2, 3, 4, 5].map(floor => {
    const entered = rows.map(row => row.floors?.[floor]).filter(Boolean);
    const itemUsed = entered.map(item => Number(item.recovery?.itemUsed?.HEAL_POTION || 0));
    return [floor, {
      entrantN: entered.length,
      entryHp: metric(entered.map(item => item.entry?.hp).filter(Number.isFinite)),
      entryHpRatio: metric(entered.map(item => item.entry?.hpRatio).filter(Number.isFinite)),
      entryHealPotionRemaining: metric(entered.map(item => item.entry?.healPotionRemaining).filter(Number.isFinite)),
      potionUsed: metric(itemUsed),
      potionRecoveryHp: metric(entered.map(item => item.recovery?.healPotionRecoveryHp).filter(Number.isFinite)),
      floorTransitionRecoveryHp: metric(entered.map(item => item.recovery?.floorTransitionRecoveryHp).filter(Number.isFinite)),
      naturalLevelGrowthHp: metric(entered.map(item => item.recovery?.naturalLevelGrowthHp).filter(Number.isFinite)),
      productionExtraLevelUpRecoveryHp: metric(entered.map(item => item.recovery?.productionExtraLevelUpRecoveryHp).filter(Number.isFinite)),
      percentageExtraLevelUpRecoveryHp: metric(entered.map(item => item.recovery?.percentageExtraLevelUpRecoveryHp).filter(Number.isFinite)),
      flatExtraLevelUpRecoveryHp: metric(entered.map(item => item.recovery?.flatExtraLevelUpRecoveryHp).filter(Number.isFinite)),
      totalObservedRecoveryHp: metric(entered.map(item => item.recovery?.totalObservedRecoveryHp).filter(Number.isFinite))
    }];
  }));
}

function mergeCountMaps(items) {
  const counts = {};
  items.forEach(item => Object.entries(item || {}).forEach(([key, value]) => {
    counts[key] = (counts[key] || 0) + Number(value || 0);
  }));
  return counts;
}

function levelProgressionCheckpoints(rows) {
  return Object.fromEntries([1, 2, 3, 4, 5].map(floor => {
    const entered = rows.map(row => row.floors?.[floor]).filter(Boolean);
    const progression = entered.map(item => item.progression || {});
    const fullHpInvalidCount = metric(entered.map(item =>
      Number(item.recovery?.percentageExtraLevelUpRecoveryCappedAtFullCount || 0) +
      Number(item.recovery?.flatExtraLevelUpRecoveryCappedAtFullCount || 0)
    ));
    const levelUpCount = metric(progression.map(item => item.levelUpCount).filter(Number.isFinite));
    return [floor, {
      entrantN: entered.length,
      entryLevel: metric(entered.map(item => item.entry?.level).filter(Number.isFinite)),
      levelUpCount,
      fromToLevel: mergeCountMaps(progression.map(item => item.fromToLevel)),
      expGained: metric(progression.map(item => item.expGained).filter(Number.isFinite)),
      naturalHpGrowth: metric(entered.map(item => item.recovery?.naturalLevelGrowthHp).filter(Number.isFinite)),
      productionExtraHpRecovery: metric(entered.map(item => item.recovery?.productionExtraLevelUpRecoveryHp).filter(Number.isFinite)),
      percentageRequestedHp: metric(entered.map(item => item.recovery?.percentageExtraLevelUpRecoveryRequestedHp).filter(Number.isFinite)),
      percentageActualHp: metric(entered.map(item => item.recovery?.percentageExtraLevelUpRecoveryHp).filter(Number.isFinite)),
      flatRequestedHp: metric(entered.map(item => item.recovery?.flatExtraLevelUpRecoveryRequestedHp).filter(Number.isFinite)),
      flatActualHp: metric(entered.map(item => item.recovery?.flatExtraLevelUpRecoveryHp).filter(Number.isFinite)),
      fullHpInvalidCount,
      fullHpInvalidRate: rate(fullHpInvalidCount.total, levelUpCount.total),
      cumulativePercentageRecovery: metric(entered.map(item => item.recovery?.percentageExtraLevelUpRecoveryHp).filter(Number.isFinite)),
      cumulativeFlatRecovery: metric(entered.map(item => item.recovery?.flatExtraLevelUpRecoveryHp).filter(Number.isFinite))
    }];
  }));
}

function snowballSummary(rows) {
  const floorSum = (row, field) => Object.values(row.floors || {})
    .reduce((sum, floor) => sum + Number(floor?.incrementalCost?.[field] || 0), 0);
  const levelSum = (row, field) => Object.values(row.floors || {})
    .reduce((sum, floor) => sum + Number(floor?.progression?.[field] || 0), 0);
  return {
    combatCount: metric(rows.map(row => row.totalCombatCount).filter(Number.isFinite)),
    rounds: metric(rows.map(row => row.totalCombatRounds).filter(Number.isFinite)),
    enemyActions: metric(rows.map(row => floorSum(row, "enemyActionCount"))),
    expGained: metric(rows.map(row => row.totalExpGained).filter(Number.isFinite)),
    levelUpCount: metric(rows.map(row => levelSum(row, "levelUpCount"))),
    b3EntryLevel: metric(rows.map(row => row.floors?.[3]?.entry?.level).filter(Number.isFinite)),
    b4EntryLevel: metric(rows.map(row => row.floors?.[4]?.entry?.level).filter(Number.isFinite)),
    b5EntryLevel: metric(rows.map(row => row.floors?.[5]?.entry?.level).filter(Number.isFinite)),
    percentageLevelUpRecoveryTotal: metric(rows.map(row => Object.values(row.floors || {})
      .reduce((sum, floor) => sum + Number(floor?.recovery?.percentageExtraLevelUpRecoveryHp || 0), 0))),
    flatLevelUpRecoveryTotal: metric(rows.map(row => Object.values(row.floors || {})
      .reduce((sum, floor) => sum + Number(floor?.recovery?.flatExtraLevelUpRecoveryHp || 0), 0)))
  };
}

function summarizeB5(rows) {
  const entrants = rows.map(row => row.b5).filter(item => item.status === "observed");
  const count = predicate => entrants.filter(predicate).length;
  const flame = field => metric(entrants.map(item => item.flameTrap[field]).filter(Number.isFinite));
  const boss = field => metric(entrants.map(item => item.boss[field] ? 1 : 0));
  const guardianRetry = summarizeGuardianRetry(entrants);
  return {
    entrantN: entrants.length,
    flameTrap: {
      eligibleSteps: flame("eligibleSteps"),
      triggerCount: flame("triggerCount"),
      triggerRate: rate(count(item => item.flameTrap.triggerCount > 0), entrants.length),
      warningOrAvoidCount: flame("warningOrAvoidCount"),
      warningCount: "unobserved",
      hpDamage: flame("hpDamage"),
      mitigatedDamage: "unobserved",
      terminalDeaths: flame("terminalDeaths"),
      schedule: "production flame-trap effect; simulator B5 step scheduling is approximate"
    },
    boss: {
      routeBossDetected: boss("routeBossDetected"),
      actualBossEventArrival: boss("actualBossEventArrival"),
      combatStart: boss("combatStart"),
      bossCombatResultEventCount: metric(entrants.map(item => item.boss.bossCombatResultEventCount)),
      fleeEventCount: metric(entrants.map(item => item.boss.fleeEventCount)),
      victoryEventCount: metric(entrants.map(item => item.boss.victoryEventCount)),
      deathEventCount: metric(entrants.map(item => item.boss.deathEventCount)),
      guardBreakCount: metric(entrants.map(item => item.boss.guardBreakCount.total)),
      guardBreak: boss("guardBreak"),
      retryRevisit: boss("retryRevisit"),
      arrivalHp: metric(entrants.flatMap(item => item.boss.arrivalHp.p50 == null ? [] : [item.boss.arrivalHp.p50])),
      arrivalHpRatio: metric(entrants.flatMap(item => item.boss.arrivalHpRatio.p50 == null ? [] : [item.boss.arrivalHpRatio.p50])),
      arrivalMp: metric(entrants.flatMap(item => item.boss.arrivalMp.p50 == null ? [] : [item.boss.arrivalMp.p50])),
      arrivalMpRatio: metric(entrants.flatMap(item => item.boss.arrivalMpRatio.p50 == null ? [] : [item.boss.arrivalMpRatio.p50])),
      remainingHealPotion: metric(entrants.flatMap(item => item.boss.remainingHealPotion.p50 == null ? [] : [item.boss.remainingHealPotion.p50])),
      buildAtArrival: countValues(entrants.map(item => item.boss.buildAtArrival?.identity)),
      victory: boss("victory"),
      flee: boss("flee"),
      death: boss("death"),
      retry: boss("retry"),
      notReached: boss("notReached")
    },
    townPortalReturnBeforeBoss: { count: count(item => item.townPortalReturnBeforeBoss), rate: rate(count(item => item.townPortalReturnBeforeBoss), entrants.length) },
    townPortalReturnAfterBossAttemptBeforeB6: { count: count(item => item.townPortalReturnAfterBossAttemptBeforeB6), rate: rate(count(item => item.townPortalReturnAfterBossAttemptBeforeB6), entrants.length) },
    milestonePortalReturnAfterGuardian: { count: count(item => item.milestonePortalReturnAfterGuardian), rate: rate(count(item => item.milestonePortalReturnAfterGuardian), entrants.length) },
    returnBeforeBoss: { count: count(item => item.returnBeforeBoss), rate: rate(count(item => item.returnBeforeBoss), entrants.length) },
    returnAfterBossBeforeB6: { count: count(item => item.returnAfterBossBeforeB6), rate: rate(count(item => item.returnAfterBossBeforeB6), entrants.length) },
    b6Transition: { count: count(item => item.b6Transition), rate: rate(count(item => item.b6Transition), entrants.length) },
    guardianRetry,
    guardianFleeEv: summarizeGuardianFleeEv(entrants)
  };
}

function eventCount(count, denominator) {
  return { count, denominator, rate: rate(count, denominator) };
}

function summarizeGuardianRetry(entrants) {
  const diagnostics = entrants.map(item => item.guardianRetry).filter(Boolean);
  const attempts = diagnostics.flatMap(item => item.attempts || []);
  const flees = attempts.filter(item => item.result === "flee");
  const retries = attempts.filter(item => item.retry);
  const applied = attempts.filter(item => item.checkpointApplied);
  const reset = applied.filter(item => !item.bossStartGuardBroken && item.bossStartExposureTurns === 0);
  const sum = field => attempts.reduce((total, item) => total + Number(item[field] || 0), 0);
  const fleeBossHp = flees.map(item => item.bossHpAtFleeRate).filter(Number.isFinite);
  const fleePlayerHp = flees.map(item => item.playerHpAtFleeRate).filter(Number.isFinite);
  return {
    enabled: diagnostics.some(item => item.enabled),
    checkpointRate: diagnostics.find(item => Number.isFinite(item.checkpointRate))?.checkpointRate ?? null,
    attempts: eventCount(attempts.length, entrants.length),
    flee: eventCount(flees.length, entrants.length),
    retry: eventCount(retries.length, entrants.length),
    fleeToRetry: eventCount(retries.length, flees.length),
    qualifyingFlee: eventCount(flees.filter(item => item.qualifyingFlee).length, flees.length),
    checkpointEarned: eventCount(diagnostics.filter(item => item.checkpointEarned).length, entrants.length),
    checkpointApplied: eventCount(applied.length, retries.length),
    bossHpAtFlee: {
      ...metric(fleeBossHp),
      count: fleeBossHp.length,
      denominator: flees.length
    },
    playerHpAtFlee: {
      ...metric(fleePlayerHp),
      count: fleePlayerHp.length,
      denominator: flees.length
    },
    guardBreak: eventCount(sum("guardBreakCount"), attempts.length),
    victory: eventCount(attempts.filter(item => item.result === "victory").length, entrants.length),
    death: eventCount(attempts.filter(item => item.result === "death").length, entrants.length),
    retryStartAt80: eventCount(applied.filter(item => item.bossStartHpRate === 0.8).length, applied.length),
    guardStateReset: eventCount(reset.length, applied.length),
    checkpointAppliedRunCount: eventCount(diagnostics.filter(item => item.checkpointAppliedCount > 0).length, entrants.length)
  };
}

function distribution90(values) {
  const observed = values.filter(Number.isFinite);
  return {
    n: observed.length,
    p10: quantileValue(observed, 0.10),
    p50: quantileValue(observed, 0.50),
    p90: quantileValue(observed, 0.90)
  };
}

function countRateBy(values, denominator) {
  const counts = {};
  values.forEach(value => {
    const key = String(value);
    counts[key] = (counts[key] || 0) + 1;
  });
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)).map(([key, count]) => [
      key,
      { count, rate: rate(count, denominator) }
    ])
  );
}

function crossTab(rows, leftKey, rightKey) {
  const counts = {};
  rows.forEach(row => {
    const left = String(row[leftKey]);
    const right = String(row[rightKey]);
    counts[left] ||= {};
    counts[left][right] = (counts[left][right] || 0) + 1;
  });
  return Object.fromEntries(Object.entries(counts).map(([left, values]) => [
    left,
    Object.fromEntries(Object.entries(values).map(([right, count]) => [
      right,
      { count, rate: rate(count, rows.length) }
    ]))
  ]));
}

function cohortMetric(values) {
  const observed = values.filter(Number.isFinite);
  return {
    ...distribution90(observed),
    total: sumFinite(observed),
    meanPerCohort: observed.length ? sumFinite(observed) / observed.length : null
  };
}

const GUARDIAN_STR_FIGHT_RESOURCE_KEYS = Object.freeze([
  "HEAL_POTION",
  "GREATER_HEAL",
  "MANA_POTION",
  "GUARD_POTION",
  "STR_POTION",
  "HASTE_POTION",
  "HOLY_WATER",
  "ANTIDOTE"
]);

function summarizeGuardianStrFightRows(cohorts) {
  const decisionKeys = ["recovery", "fight", "flee"];
  const decisionAttempts = Object.fromEntries(decisionKeys.map(key => [
    key,
    cohortMetric(cohorts.map(item => Number(item.decisionCounts?.[key] || 0)))
  ]));
  const resourceUsage = Object.fromEntries(GUARDIAN_STR_FIGHT_RESOURCE_KEYS.map(itemKey => {
    const values = cohorts.map(item => Number(item.resources?.itemCounts?.[itemKey] || 0));
    return [itemKey, {
      ...cohortMetric(values),
      used: eventCount(values.filter(value => value > 0).length, cohorts.length)
    }];
  }));
  const spellUsage = countRateBy(
    cohorts.flatMap(item => Object.keys(item.resources?.spellCounts || {})),
    cohorts.length
  );
  const actionUsage = countRateBy(
    cohorts.flatMap(item => Object.keys(item.executedActionCounts || {})),
    cohorts.length
  );
  return {
    cohortN: cohorts.length,
    additionalDecisions: cohortMetric(cohorts.map(item => item.additionalDecisions)),
    additionalRounds: cohortMetric(cohorts.map(item => item.additionalRounds)),
    guardianDamage: cohortMetric(cohorts.map(item => item.guardianDamage)),
    hpAtTransition: cohortMetric(cohorts.map(item => item.transition?.hp)),
    hpAtTerminal: cohortMetric(cohorts.map(item => item.terminal?.hp)),
    hpLoss: cohortMetric(cohorts.map(item => item.hpLoss)),
    hpDelta: cohortMetric(cohorts.map(item => item.hpDelta)),
    guardianHpAtTransition: cohortMetric(cohorts.map(item => item.transition?.guardianHp)),
    guardianHpAtTerminal: cohortMetric(cohorts.map(item => item.terminal?.guardianHp)),
    mpAtTransition: cohortMetric(cohorts.map(item => item.transition?.mp)),
    mpAtTerminal: cohortMetric(cohorts.map(item => item.terminal?.mp)),
    mpLoss: cohortMetric(cohorts.map(item => item.mpLoss)),
    mpDelta: cohortMetric(cohorts.map(item => item.mpDelta)),
    mpSpent: cohortMetric(cohorts.map(item => item.resources?.mpSpent)),
    mpRecovered: cohortMetric(cohorts.map(item => item.resources?.mpRecovered)),
    decisionAttempts,
    executedFleeActions: cohortMetric(cohorts.map(item => item.executedFleeActions)),
    fleePartingAttackCount: cohortMetric(cohorts.map(item => item.fleePartingAttackCount)),
    partingAttackDamageHp: cohortMetric(cohorts.map(item => item.partingAttackDamageHp)),
    fleeDiedFromPartingAttack: eventCount(
      cohorts.reduce((total, item) => total + item.fleeDiedFromPartingAttack, 0),
      cohorts.length
    ),
    resourceUsage,
    spellUsage,
    executedActionUsage: actionUsage
  };
}

function summarizeGuardianStrFightPairs(pairs) {
  const productionVictory = pairs.filter(pair => pair.production?.outcome === "victory");
  const countRate = predicate => eventCount(
    pairs.filter(predicate).length,
    pairs.length
  );
  const metric = selector => distribution90(pairs.map(pair => Number(selector(pair))));
  return {
    pairN: pairs.length,
    productionOutcome: countRateBy(pairs.map(pair => pair.production?.outcome || "unobserved"), pairs.length),
    immediateFleeOutcome: countRateBy(pairs.map(pair => pair.immediateFlee?.outcome || "unobserved"), pairs.length),
    productionTerminalHp: metric(pair => pair.production?.terminalHp),
    immediateFleeTerminalHp: metric(pair => pair.immediateFlee?.terminalHp),
    productionHpLoss: metric(pair => pair.production?.hpLoss),
    immediateFleeHpLoss: metric(pair => pair.immediateFlee?.hpLoss),
    productionRounds: metric(pair => pair.production?.rounds),
    immediateFleeRounds: metric(pair => pair.immediateFlee?.rounds),
    productionActions: metric(pair => pair.production?.actions),
    immediateFleeActions: metric(pair => pair.immediateFlee?.actions),
    productionGuardianDamage: metric(pair => pair.production?.guardianDamage),
    immediateFleeGuardianDamage: metric(pair => pair.immediateFlee?.guardianDamage),
    productionResourceItemCount: metric(pair => pair.production?.resourcesConsumed?.itemCount),
    immediateFleeResourceItemCount: metric(pair => pair.immediateFlee?.resourcesConsumed?.itemCount),
    productionMpCost: metric(pair => pair.production?.resourcesConsumed?.mp),
    immediateFleeMpCost: metric(pair => pair.immediateFlee?.resourcesConsumed?.mp),
    productionPartingAttackCount: metric(pair => pair.production?.partingAttackCount),
    immediateFleePartingAttackCount: metric(pair => pair.immediateFlee?.partingAttackCount),
    productionPartingDamage: metric(pair => pair.production?.partingDamage),
    immediateFleePartingDamage: metric(pair => pair.immediateFlee?.partingDamage),
    productionPartingDeath: countRate(pair => pair.production?.partingDeath === true),
    immediateFleePartingDeath: countRate(pair => pair.immediateFlee?.partingDeath === true),
    immediateFleeSurvival: countRate(pair => pair.immediateFlee?.survived === true),
    immediateFleePartingDeath: countRate(pair => pair.immediateFlee?.partingDeath === true),
    productionVictoryGained: countRate(pair => pair.pairedDelta?.productionVictoryGained === true),
    productionLaterFleeImmediateFleeHigherHp: countRate(pair =>
      pair.pairedDelta?.avoidableLaterFlee === true
    ),
    productionDeathImmediateFleeSurvived: countRate(pair =>
      pair.pairedDelta?.avoidableDeath === true
    ),
    terminalHpDeltaImmediateFleeMinusProduction: distribution90(
      pairs.map(pair => Number(pair.pairedDelta?.terminalHpImmediateFleeMinusProduction))
    ),
    extraRoundsProductionMinusImmediateFlee: distribution90(
      pairs.map(pair => Number(pair.pairedDelta?.roundsProductionMinusImmediateFlee))
    ),
    extraActionsProductionMinusImmediateFlee: distribution90(
      pairs.map(pair => Number(pair.pairedDelta?.actionsProductionMinusImmediateFlee))
    ),
    extraHpCostProductionMinusImmediateFlee: distribution90(
      pairs.map(pair => Number(pair.pairedDelta?.hpLossProductionMinusImmediateFlee))
    ),
    extraResourceItemCountProductionMinusImmediateFlee: distribution90(
      pairs.map(pair => Number(pair.pairedDelta?.itemCountProductionMinusImmediateFlee))
    ),
    extraMpCostProductionMinusImmediateFlee: distribution90(
      pairs.map(pair => Number(pair.pairedDelta?.mpProductionMinusImmediateFlee))
    ),
    productionVictoryAdditionalCost: {
      pairN: productionVictory.length,
      hp: distribution90(productionVictory.map(pair =>
        Number(pair.pairedDelta?.hpLossProductionMinusImmediateFlee)
      )),
      rounds: distribution90(productionVictory.map(pair =>
        Number(pair.pairedDelta?.roundsProductionMinusImmediateFlee)
      )),
      resources: distribution90(productionVictory.map(pair =>
        Number(pair.pairedDelta?.itemCountProductionMinusImmediateFlee)
      )),
      mp: distribution90(productionVictory.map(pair =>
        Number(pair.pairedDelta?.mpProductionMinusImmediateFlee)
      ))
    },
    samples: pairs.slice(0, GUARDIAN_STR_FIGHT_SAMPLE_LIMIT)
  };
}

function summarizeGuardianStrFightCohort(cohorts) {
  const outcomes = ["victory", "laterFlee", "death"];
  const withPairs = cohorts.map(item => item.pairedComparison).filter(Boolean);
  return {
    cohortN: cohorts.length,
    outcomes: countRateBy(cohorts.map(item => item.terminalOutcome), cohorts.length),
    all: summarizeGuardianStrFightRows(cohorts),
    paired: summarizeGuardianStrFightPairs(withPairs),
    byOutcome: Object.fromEntries(outcomes.map(outcome => {
      const rows = cohorts.filter(item => item.terminalOutcome === outcome);
      return [outcome, {
        ...summarizeGuardianStrFightRows(rows),
        paired: summarizeGuardianStrFightPairs(
          rows.map(item => item.pairedComparison).filter(Boolean)
        ),
        rate: rate(rows.length, cohorts.length)
      }];
    })),
    samples: Object.fromEntries(outcomes.map(outcome => [
      outcome,
      cohorts
        .filter(item => item.terminalOutcome === outcome)
        .slice(0, GUARDIAN_STR_FIGHT_SAMPLE_LIMIT)
    ]))
  };
}

function summarizeGuardianFleeEv(entrants) {
  const observations = entrants.flatMap(item => item.guardianFleeEv?.observations || []);
  const traces = entrants.flatMap(item => item.guardianFleeEv?.decisionTrace || []);
  const transitions = entrants.flatMap(item => item.guardianFleeEv?.transitions || []);
  const attempts = entrants.flatMap(item => item.guardianActionSequence || []);
  const strFightCohorts = entrants.flatMap(item => item.guardianFleeEv?.strFightCohorts || []);
  const flee = observations.filter(item => item.decision === "flee");
  const fleeAttempts = attempts.filter(item => item.result === "flee");
  const decision = item => item.decision || "unknown";
  const reason = item => item.reason || "unknown";
  const metricTerm = path => distribution90(observations.map(item => {
    let value = item;
    path.forEach(key => { value = value?.[key]; });
    return Number(value);
  }));
  const booleanRate = values => ({
    count: values.filter(Boolean).length,
    denominator: values.length,
    rate: rate(values.filter(Boolean).length, values.length)
  });
  const fleeCrossTab = (key, rows = flee) => crossTab(
    rows.map(item => ({ reason: reason(item), value: key.split(".").reduce((value, part) => value?.[part], item) })),
    "reason",
    "value"
  );
  const actionKey = action => action?.type === "item"
    ? `item:${action.itemKey || "unknown"}`
    : action?.type === "spell"
      ? `spell:${action.spellName || "unknown"}`
      : action?.type || "unknown";
  const rawByDecisionIndex = {};
  traces.forEach(item => {
    const key = String(item.playerDecisionIndex);
    rawByDecisionIndex[key] ||= [];
    rawByDecisionIndex[key].push(item);
  });
  const rawDecisionSummary = Object.fromEntries(
    Object.entries(rawByDecisionIndex)
      .sort(([left], [right]) => Number(left) - Number(right))
      .map(([index, rows]) => [index, {
        decisions: countRateBy(rows.map(item => item.decision), rows.length),
        reasons: countRateBy(rows.map(item => item.reason), rows.length),
        fleeDeferredByOpening: eventCount(
          rows.filter(item => item.fleeDeferredByOpening).length,
          rows.length
        )
      }])
  );
  return {
    enabled: entrants.some(item => item.guardianFleeEv?.enabled),
    firstDecisionN: observations.length,
    productionBossRule: observations[0]?.productionBossRule || null,
    decisions: countRateBy(observations.map(decision), observations.length),
    reasons: countRateBy(observations.map(reason), observations.length),
    expectedTurnsToWin: metricTerm(["terms", "expectedTurnsToWin"]),
    survivalTurns: metricTerm(["terms", "survivalTurns"]),
    turnDeficit: metricTerm(["terms", "turnDeficit"]),
    physicalDamageEstimate: metricTerm(["terms", "playerDamagePerRound"]),
    incomingDamage: metricTerm(["terms", "incomingDamagePerRound"]),
    hpRate: metricTerm(["hp", "rate"]),
    mpRate: metricTerm(["mp", "rate"]),
    hpBelowFleeThreshold: booleanRate(observations.map(item => item.terms?.hpBelowFleeThreshold === true)),
    guardPotionAvailable: booleanRate(observations.map(item => item.round1GuardPotionAvailable === true)),
    preferredAction: countRateBy(
      observations.map(item => item.preferredAction?.kind || "none"),
      observations.length
    ),
    preferredSpell: booleanRate(observations.map(item => item.preferredAction?.kind === "spell")),
    preferredFight: booleanRate(observations.map(item => item.preferredAction?.kind === "fight")),
    offensiveSpellPaymentAvailable: booleanRate(observations.map(item =>
      item.preferredAction?.payment?.actionPaymentAvailable === true
    )),
    crossTabs: {
      fleeReasonByHpBelowFleeThreshold: fleeCrossTab("terms.hpBelowFleeThreshold"),
      fleeReasonByGuardAvailability: fleeCrossTab("round1GuardPotionAvailable"),
      fleeReasonByPreferredAction: crossTab(
        flee.map(item => ({ reason: reason(item), value: item.preferredAction?.kind || "none" })),
        "reason",
        "value"
      ),
      fleeReasonByKit: fleeCrossTab("kit"),
      fleeReasonByAttempt: crossTab(
        flee.map(item => ({ reason: reason(item), value: item.retry ? "retry" : "first" })),
        "reason",
        "value"
      )
    },
    attemptsObserved: attempts.length,
    selectedFirstAction: countRateBy(
      attempts.map(item => actionKey(item.selectedFirstAction)),
      attempts.length
    ),
    executedFirstAction: countRateBy(
      attempts.map(item => actionKey(item.executedFirstAction)),
      attempts.length
    ),
    actualFirstAction: countRateBy(
      attempts.map(item => actionKey(item.selectedFirstAction)),
      attempts.length
    ),
    selectedFleeDecisionIndex: distribution90(
      fleeAttempts.map(item => Number(item.selectedFleeDecisionIndex))
    ),
    executedFleeDecisionIndex: distribution90(
      fleeAttempts.map(item => Number(item.executedFleeDecisionIndex))
    ),
    fleeDecisionIndex: distribution90(fleeAttempts.map(item => Number(item.fleeDecisionIndex))),
    selectedFleeRound: distribution90(fleeAttempts.map(item => Number(item.selectedFleeRound))),
    executedFleeRound: distribution90(fleeAttempts.map(item => Number(item.executedFleeRound))),
    fleeRound: distribution90(fleeAttempts.map(item => Number(item.fleeRound))),
    selectedActionsBeforeFlee: countRateBy(
      attempts.map(item => item.selectedActionsBeforeFleePattern),
      attempts.length
    ),
    executedActionsBeforeFlee: countRateBy(
      attempts.map(item => item.executedActionsBeforeFleePattern),
      attempts.length
    ),
    actionsBeforeFlee: countRateBy(
      attempts.map(item => item.selectedActionsBeforeFleePattern),
      attempts.length
    ),
    selectedOpeningItemUsage: countRateBy(
      fleeAttempts.flatMap(item => item.selectedOpeningItemsBeforeFlee),
      attempts.length
    ),
    openingItemUsage: countRateBy(
      fleeAttempts.flatMap(item => item.openingItemsUsedBeforeFlee),
      attempts.length
    ),
    bossHpAtFlee: distribution90(fleeAttempts.map(item => Number(item.bossHpAtFlee))),
    bossHpAtFleeRate: distribution90(fleeAttempts.map(item => Number(item.bossHpAtFleeRate))),
    guardianDamageBeforeFlee: distribution90(
      fleeAttempts.map(item => Number(item.guardianDamageBeforeFlee))
    ),
    playerHpAtFlee: distribution90(fleeAttempts.map(item => Number(item.playerHpAtFlee))),
    playerHpAtFleeRate: distribution90(
      fleeAttempts.map(item => Number(item.playerHpAtFleeRate))
    ),
    rawDecisionByDecisionIndex: rawDecisionSummary,
    fleeDeferredByOpening: eventCount(
      traces.filter(item => item.fleeDeferredByOpening).length,
      traces.filter(item => item.decision === "flee").length
    ),
    transitionsObserved: transitions.length,
    openingTransitionsByItem: summarizeGuardianOpeningTransitions(transitions),
    strFightCohort: summarizeGuardianStrFightCohort(strFightCohorts)
  };
}

function summarizeMediumAbandonment(rows) {
  const eventRows = rows.filter(row => row.mediumAbandonment);
  const events = eventRows.map(row => row.mediumAbandonment);
  const firstDepartures = events.map(item => item.firstDeparture);
  const laterReacquisitionCount = events.filter(item => item.laterMediumReacquisition).length;
  return {
    status: rows.length ? "observed" : "unobserved",
    runN: rows.length,
    departureCount: events.length,
    departureRate: rate(events.length, rows.length),
    firstDepartureFloor: metric(firstDepartures.map(item => item.floor)),
    firstDepartureStep: metric(firstDepartures.map(item => item.step)),
    targetWeapon: countValues(firstDepartures.map(item => item.targetWeapon)),
    currentScore: metric(firstDepartures.map(item => item.currentScore)),
    candidateScore: metric(firstDepartures.map(item => item.candidateScore)),
    atkDelta: metric(firstDepartures.map(item => item.atkDelta)),
    maxMPDelta: metric(firstDepartures.map(item => item.maxMPDelta)),
    mediumLossCount: firstDepartures.filter(item => item.mediumLoss).length,
    activeRuneRemoval: countValues(firstDepartures.flatMap(item => item.activeRuneRemoval || [])),
    laterMediumReacquisition: {
      count: laterReacquisitionCount,
      rate: rate(laterReacquisitionCount, events.length)
    },
    samples: firstDepartures.slice(0, RUN_SAMPLE_LIMIT).map((item, index) => ({
      runIndex: eventRows[index]?.runIndex ?? null,
      ...item,
      laterMediumReacquisition: events[index].laterMediumReacquisition
    }))
  };
}

function summarizeManaPotionLifecycle(rows) {
  const sourceIds = ["starting", "departureCraft", "combat/drop", "chest", "merchant", "other"];
  const sumField = field => metric(rows.map(row => row.manaPotionLifecycle?.[field]).filter(Number.isFinite));
  const sourceTotal = field => Object.fromEntries(sourceIds.map(source => [
    source,
    metric(rows.map(row => Number(row.manaPotionLifecycle?.[field]?.[source] || 0)))
  ]));
  return {
    status: rows.length ? "observed" : "unobserved",
    departureRequested: sumField("departureRequested"),
    departureCrafted: sumField("departureCrafted"),
    acquiredTotal: sumField("acquiredTotal"),
    acquiredBySource: sourceTotal("acquiredBySource"),
    consumedTotal: sumField("consumedTotal"),
    consumedInCombat: sumField("consumedInCombat"),
    consumedPostCombat: sumField("consumedPostCombat"),
    consumedBySource: sourceTotal("consumedBySource"),
    firstConsumptionFloor: metric(rows.map(row => row.manaPotionLifecycle?.firstConsumption?.floor).filter(Number.isFinite)),
    firstConsumptionStep: metric(rows.map(row => row.manaPotionLifecycle?.firstConsumption?.step).filter(Number.isFinite)),
    actualMpRecovered: sumField("actualMpRecovered"),
    capWaste: sumField("capWaste"),
    remainingAtEntry: Object.fromEntries(["B2", "B3", "B4", "B5"].map(floor => [
      floor,
      metric(rows.map(row => row.manaPotionLifecycle?.remainingAtEntry?.[floor]).filter(Number.isFinite))
    ])),
    remainingAtTermination: sumField("remainingAtTermination"),
    terminalLoss: sumField("terminalLoss"),
    reconciliation: rows.every(row => row.manaPotionLifecycle?.reconciliation === true)
  };
}

function aggregate(rows) {
  const n = rows.length;
  const reaches = floor => rows.filter(row => row.outcome.reached[floor]).length;
  return {
    runs: n,
    reach: Object.fromEntries([2, 3, 4, 5, 6].map(floor => [floor, { count: reaches(floor), rate: rate(reaches(floor), n) }])),
    death: { count: rows.filter(row => row.outcome.death).length, rate: rate(rows.filter(row => row.outcome.death).length, n) },
    voluntaryReturn: { count: rows.filter(row => row.outcome.voluntaryReturn).length, rate: rate(rows.filter(row => row.outcome.voluntaryReturn).length, n) },
    otherTerminal: { count: rows.filter(row => row.outcome.otherTerminal).length, rate: rate(rows.filter(row => row.outcome.otherTerminal).length, n) },
    deepestFloor: quantiles(rows.map(row => Number(row.outcome.deepestFloor))),
    b5ToB6: summarizeB5(rows).b6Transition,
    buildCheckpoints: Object.fromEntries(CHECKPOINTS.map(floor => [floor, buildCheckpoints(rows, floor)])),
    combat: combatCheckpoints(rows),
    recovery: recoveryCheckpoints(rows),
    levelProgression: levelProgressionCheckpoints(rows),
    snowball: snowballSummary(rows),
    transitionRecovery: summarizeTransitionRecovery(rows),
    b5: summarizeB5(rows),
    mediumAbandonment: summarizeMediumAbandonment(rows),
    manaPotionLifecycle: summarizeManaPotionLifecycle(rows),
    loot: {
      acquired: metric(rows.map(row => row.loot.acquired).filter(Number.isFinite)),
      bagged: metric(rows.map(row => row.loot.bagged).filter(Number.isFinite)),
      inventoryRejections: Object.fromEntries([...new Set(rows.flatMap(row => Object.keys(row.loot.inventoryRejections || {})))].map(category => [
        category,
        metric(rows.map(row => Number(row.loot.inventoryRejections?.[category] || 0)))
      ])),
      bagOccupancyAtEnd: metric(rows.map(row => row.loot.bagOccupancyAtEnd).filter(Number.isFinite))
    }
  };
}

function delta(left, right) {
  const result = {};
  ["b3", "b4", "b5", "b6", "death", "voluntaryReturn", "bossActualArrival", "bossStart", "bossVictory", "b5ToB6"].forEach(key => {
    result[key] = finite(right[key]) === null || finite(left[key]) === null ? null : right[key] - left[key];
  });
  return result;
}

function comparison(left, right, label) {
  const scalar = aggregate => ({
    b3: aggregate.reach[3].rate,
    b4: aggregate.reach[4].rate,
    b6: aggregate.reach[6].rate,
    b5: aggregate.reach[5].rate,
    death: aggregate.death.rate,
    voluntaryReturn: aggregate.voluntaryReturn.rate,
    bossActualArrival: aggregate.b5.boss.actualBossEventArrival.meanPerEntrant,
    bossStart: aggregate.b5.boss.combatStart.meanPerEntrant,
    bossVictory: aggregate.b5.boss.victory.meanPerEntrant,
    b5ToB6: aggregate.b5.b6Transition.rate
  });
  const baseline = scalar(left);
  const treatment = scalar(right);
  return { label, baseline, treatment, delta: delta(baseline, treatment) };
}

function b5ComparisonMetrics(aggregate) {
  const b5 = aggregate.b5;
  const entrants = b5.entrantN;
  const rateFromCounts = (count, denominator = entrants) => rate(count, denominator);
  return {
    flameEligibleStepsMeanPerEntrant: b5.flameTrap.eligibleSteps.meanPerEntrant,
    flameTriggerMeanPerEntrant: b5.flameTrap.triggerCount.meanPerEntrant,
    flameTriggerRate: b5.flameTrap.triggerRate,
    flameAvoidRate: rate(b5.flameTrap.warningOrAvoidCount.total, b5.flameTrap.triggerCount.total),
    flameHpDamageMeanPerEntrant: b5.flameTrap.hpDamage.meanPerEntrant,
    flameTerminalDeathRate: rateFromCounts(b5.flameTrap.terminalDeaths.total),
    returnBeforeBossRate: b5.townPortalReturnBeforeBoss.rate,
    entrantToArrivalRate: b5.boss.actualBossEventArrival.meanPerEntrant,
    arrivalToVictoryRate: rate(b5.boss.victoryEventCount.total, b5.boss.actualBossEventArrival.total),
    entrantToB6Rate: b5.b6Transition.rate,
    combatStartRate: b5.boss.combatStart.meanPerEntrant,
    victoryRate: b5.boss.victory.meanPerEntrant,
    fleeRate: b5.boss.flee.meanPerEntrant,
    retryRate: b5.boss.retry.meanPerEntrant,
    deathRate: b5.boss.death.meanPerEntrant,
    guardBreakRate: b5.boss.guardBreak.meanPerEntrant,
    returnAfterBossAttemptBeforeB6Rate: b5.townPortalReturnAfterBossAttemptBeforeB6.rate,
    milestonePortalReturnRate: b5.milestonePortalReturnAfterGuardian.rate,
    bossArrivalHpP50: b5.boss.arrivalHp.p50,
    bossArrivalMpP50: b5.boss.arrivalMp.p50,
    bossArrivalHealPotionP50: b5.boss.remainingHealPotion.p50
  };
}

function subtractMetrics(left, right) {
  return Object.fromEntries(Object.keys(left).map(key => [
    key,
    finite(left[key]) === null || finite(right[key]) === null ? null : left[key] - right[key]
  ]));
}

function b5Comparison(base, treatment, label) {
  const baseline = b5ComparisonMetrics(base);
  const candidate = b5ComparisonMetrics(treatment);
  return { label, baseline, treatment: candidate, delta: subtractMetrics(candidate, baseline) };
}

function b5Interaction(base, flame, guardian, both) {
  const current = b5ComparisonMetrics(base);
  const f = b5ComparisonMetrics(flame);
  const g = b5ComparisonMetrics(guardian);
  const fg = b5ComparisonMetrics(both);
  return {
    label: "FG - F - G + C",
    delta: Object.fromEntries(Object.keys(current).map(key => [
      key,
      [current[key], f[key], g[key], fg[key]].every(value => finite(value) !== null)
        ? fg[key] - f[key] - g[key] + current[key]
        : null
    ]))
  };
}

function preB5ParityProjection(row) {
  return {
    floors: [1, 2, 3, 4].map(floor => row.floors?.[floor] || null),
    b5Entry: row.b5?.entryParity || null
  };
}

function buildB5Parity(armRowsByKit, kitIds, armIds = B5_WALL_ARM_IDS) {
  const baseline = armRowsByKit.C;
  const byArm = {};
  for (const armId of armIds.filter(id => id !== "C")) {
    const byKit = {};
    for (const kitId of kitIds) {
      const currentRows = armRowsByKit[armId]?.[kitId] || [];
      const baselineRows = baseline?.[kitId] || [];
      const mismatches = [];
      currentRows.forEach((row, index) => {
        if (JSON.stringify(preB5ParityProjection(row)) !== JSON.stringify(preB5ParityProjection(baselineRows[index]))) {
          mismatches.push({ runIndex: row.runIndex, baselineRunIndex: baselineRows[index]?.runIndex ?? null });
        }
      });
      byKit[kitId] = {
        pass: currentRows.length === baselineRows.length && mismatches.length === 0,
        comparedRuns: Math.min(currentRows.length, baselineRows.length),
        mismatches: mismatches.slice(0, RUN_SAMPLE_LIMIT)
      };
    }
    byArm[armId] = byKit;
  }
  return {
    pass: Object.values(byArm).every(byKit => Object.values(byKit).every(value => value.pass)),
    comparedFields: ["B1-B4 compact production path", "B5 reached/not reached", "B5 entry HP/maxHP", "B5 entry MP/maxMP", "B5 entry inventory/HEAL_POTION", "B5 entry equipment/Build Snapshot", "B5 route-relevant state"],
    byArm
  };
}

function buildGuardianRetryPairing(armRowsByKit, kitIds) {
  const byKit = {};
  for (const kitId of kitIds) {
    const currentRows = armRowsByKit.C?.[kitId] || [];
    const treatmentRows = armRowsByKit.R?.[kitId] || [];
    const mismatches = [];
    const comparedRuns = Math.min(currentRows.length, treatmentRows.length);
    for (let index = 0; index < comparedRuns; index++) {
      const current = currentRows[index];
      const treatment = treatmentRows[index];
      const treatmentAttempts = treatment.b5?.guardianRetry?.attempts || [];
      const firstAppliedIndex = treatmentAttempts.findIndex(attempt => attempt.checkpointApplied);
      const boundary = firstAppliedIndex >= 0 ? firstAppliedIndex : treatmentAttempts.length;
      const currentAttempts = current.b5?.guardianRetry?.attempts || [];
      const commonAttempts = Math.min(boundary, currentAttempts.length);
      const projection = attempt => ({
        result: attempt.result,
        retry: attempt.retry,
        actionTypes: attempt.actionTypes,
        rounds: attempt.rounds,
        bossStartHp: attempt.bossStartHp,
        bossStartMaxHp: attempt.bossStartMaxHp,
        bossHpAtFlee: attempt.bossHpAtFlee,
        playerHpAtFlee: attempt.playerHpAtFlee,
        guardBreakCount: attempt.guardBreakCount,
        qualifyingFlee: attempt.qualifyingFlee
      });
      for (let attemptIndex = 0; attemptIndex < commonAttempts; attemptIndex++) {
        if (JSON.stringify(projection(currentAttempts[attemptIndex])) !== JSON.stringify(projection(treatmentAttempts[attemptIndex]))) {
          mismatches.push({ runIndex: current.runIndex, attempt: attemptIndex + 1 });
          break;
        }
      }
      if (JSON.stringify(current.b5?.entryParity || null) !== JSON.stringify(treatment.b5?.entryParity || null)) {
        mismatches.push({ runIndex: current.runIndex, boundary: "b5-entry" });
      }
    }
    byKit[kitId] = {
      pass: currentRows.length === treatmentRows.length && mismatches.length === 0,
      comparedRuns,
      mismatches: mismatches.slice(0, RUN_SAMPLE_LIMIT)
    };
  }
  return {
    pass: Object.values(byKit).every(value => value.pass),
    comparedFields: [
      "B1-B4 compact production path",
      "B5 entry HP/MP/inventory/equipment",
      "first Guardian attempt action sequence/outcome",
      "checkpoint application boundary exclusive"
    ],
    byKit
  };
}

function validatePreparation(result, arm, kitId, prep, workshop) {
  const actual = result.preparation;
  const expectedWeapon = arm.preparationId === "P0"
    ? (arm.startingWeapon || DEFAULT_WEAPON_BY_KIT[kitId])
    : expectedAutoBestWeapon(workshop, kitId);
  if (actual.expectedStartingWeapon !== expectedWeapon || actual.startingWeapon !== expectedWeapon) {
    throw new Error(`${arm.id}/${kitId}: starting weapon mismatch expected ${expectedWeapon}, got ${actual.startingWeapon}`);
  }
  if (actual.healPotions !== arm.healPotions || actual.supplies.TOWN_PORTAL !== 1 || actual.supplies.ANTIDOTE !== 1 || actual.supplies.GUARD_POTION !== 1) {
    throw new Error(`${arm.id}/${kitId}: exact preparation mismatch`);
  }
  const expectedMana = arm.additionalManaPotions || 0;
  const actualManaRecipes = actual.departureCraft.recipeIds.filter(id => id === "MANA_POTION").length;
  const actualManaItems = result.manaPotionLifecycle?.departureCrafted || 0;
  if (actual.additionalManaPotions !== expectedMana || actualManaRecipes !== expectedMana || actualManaItems !== expectedMana) {
    throw new Error(`${arm.id}/${kitId}: exact MANA_POTION preparation mismatch`);
  }
  if (actual.departureCraft.purchaseSource !== "actual-meta-bank") {
    throw new Error(`${arm.id}/${kitId}: departure craft did not use actual payment path`);
  }
  if (actual.departureCraft.recipeIds.length !== arm.healPotions + 3 + expectedMana || actual.startingBagUsed > 20 || actual.startingBagFree < 0) {
    throw new Error(`${arm.id}/${kitId}: preparation/bag invariant failed`);
  }
  const expected = purchaseDepartureCraft(prep.materials, prep.recipeIds);
  if (!expected.ok || JSON.stringify(expected.cost) !== JSON.stringify(actual.departureCraft.payment) ||
      JSON.stringify(expected.cost) !== JSON.stringify(actual.departureCraft.expectedPayment)) {
    throw new Error(`${arm.id}/${kitId}: production payment reconciliation failed`);
  }
  if (!workshop) throw new Error("workshop missing");
}

export async function runMeasurement({ runs = DEFAULT_RUNS, seed = DEFAULT_SEED, mode = "build-formation" } = {}) {
  if (!Number.isInteger(runs) || runs < 1) throw new Error(`runs must be a positive integer: ${runs}`);
  if (!Number.isInteger(seed) || seed < 1) throw new Error(`seed must be a positive integer: ${seed}`);
  const modeDefinition = getMeasurementMode(mode);
  if (mode === B5_GUARDIAN_FLEE_EV_MODE) {
    const rule = getMilestoneBossRule(5, "デーモンガード", { isBoss: true });
    if (
      rule?.breakHpRate !== 0.80 ||
      rule?.exposureTurns !== 4 ||
      rule?.exposureDamageMultiplier !== 1.50
    ) {
      throw new Error("production B5 Guardian rule values changed");
    }
  }
  applyStandardSimulationEnv({ ...STANDARD_BALANCE_CONFIG, seed, runs });
  const {
    simulateRun,
    getScenarioById,
    getArcanaWeaponScoreAudit,
    resetSimulationRandom
  } = await import("../simulations/sim_depth_material_ev.js");
  const baseScenario = getScenarioById(WORKSHOP_SCENARIO_ID);
  const preparations = Object.fromEntries(modeDefinition.armIds.map(armId => {
    const arm = modeDefinition.armDefinitions[armId] || {
      id: armId,
      preparationId: modeDefinition.preparationPotions.includes(4) ? "P0" : "P1",
      healPotions: modeDefinition.preparationPotions[0]
    };
    return [armId, preparationSpec(arm)];
  }));
  const runOne = ({
    arm,
    kitId,
    runIndex,
    audit = true,
    guardianEvObservation = mode === B5_GUARDIAN_FLEE_EV_MODE,
    samples,
    includeTransitionRecoveryRate = true,
    includeLevelUpRecoveryRate = true,
    includeLevelUpRecoveryFlatHp = true
  }) => {
    const prep = preparations[arm.id] || preparationSpec(arm);
    const worldSeed = `run-difficulty:${seed}:${runIndex}`;
    const scenario = {
      ...baseScenario,
      startingKit: kitId,
      startingHealPotions: 0,
      startingAntidotes: 0,
      startingGuardPotions: 0,
      startingTownPortals: 0,
      departureCraft: [...prep.recipeIds],
      departureCraftMaterialsAreActualBank: true,
      departureCraftMaterials: { ...prep.materials },
      departureCraftMeasurement: true,
      equipmentUpdatePolicy: arm.fixed ? "fixed" : CANONICAL_ADAPTIVE_POLICY_ID,
      lockedEquipmentSlots: [...(arm.lockedEquipmentSlots || [])],
      collectEncounterIdentities: true,
      collectStage15Diagnostics: true,
      simDiagnosticLevel: "full",
      b5FlameTrapDisabled: arm.b5FlameTrapDisabled === true,
      b5GuardianFleeDisabled: arm.b5GuardianFleeDisabled === true,
      b5GuardianRetryCheckpoint: arm.b5GuardianRetryCheckpoint === true,
      b5GuardianRetryObservation: mode === B5_GUARDIAN_RETRY_MODE,
      b5GuardianFleeEvObservation: guardianEvObservation
    };
    if (arm.recoveryRate !== undefined && includeTransitionRecoveryRate) {
      scenario.floorTransitionRecoveryRate = arm.recoveryRate;
    }
    if (arm.levelUpRecoveryRate !== undefined && includeLevelUpRecoveryRate) {
      scenario.levelUpRecoveryRate = arm.levelUpRecoveryRate;
    }
    if (arm.levelUpRecoveryFlatHp !== undefined && includeLevelUpRecoveryFlatHp) {
      scenario.levelUpRecoveryFlatHp = arm.levelUpRecoveryFlatHp;
    }
    if (arm.preparationId === "P0") {
      scenario.startingGearChoice = arm.startingWeapon || DEFAULT_WEAPON_BY_KIT[kitId];
    }
    const raw = simulateRun({
      className: "Fighter",
      startFloor: 1,
      targetDepth: TARGET_DEPTH,
      runIndex,
      seriesId: `${modeDefinition.id}:${arm.id}:${kitId}`,
      scenario,
      workshop: baseScenario.workshop,
      worldSeed,
      collectDiagnostics: true,
      collectBuildSnapshots: true,
      collectEquipmentTelemetry: true,
      collectEquipmentCandidateAudit: audit
    });
    const compact = compactDiagnostic(raw, {
      scenarioId: WORKSHOP_SCENARIO_ID,
      startingKitId: kitId,
      policyId: arm.fixed ? "fixed" : CANONICAL_ADAPTIVE_POLICY_ID,
      runIndex,
      worldSeed,
      b5Intervention: arm,
      candidateSampleCollector: samples?.candidate,
      arcanaWeaponDiagnostic: mode === ARCANA_WEAPON_MODE
    });
    const expectedWeapon = arm.preparationId === "P0"
      ? (arm.startingWeapon || DEFAULT_WEAPON_BY_KIT[kitId])
      : expectedAutoBestWeapon(baseScenario.workshop, kitId);
    compact.preparation = preparationRecord(
      raw,
      arm,
      kitId,
      baseScenario.workshop,
      prep.materials,
      expectedWeapon,
      prep.expectedPayment
    );
    validatePreparation(compact, arm, kitId, prep, baseScenario.workshop);
    samples?.runs.add(compact);
    return compact;
  };

  const determinism = {};
  const observationInvariance = {};
  for (const armId of modeDefinition.armIds) {
    const arm = modeDefinition.armDefinitions[armId];
    for (const kitId of modeDefinition.kitIds) {
      const key = `${armId}/${kitId}`;
      resetSimulationRandom(seed);
      const first = runOne({ arm, kitId, runIndex: 0 });
      resetSimulationRandom(seed);
      const second = runOne({ arm, kitId, runIndex: 0 });
      determinism[key] = JSON.stringify(first) === JSON.stringify(second);
      if (!determinism[key]) throw new Error(`determinism probe failed: ${key}`);
      resetSimulationRandom(seed);
      const auditOff = runOne({ arm, kitId, runIndex: 0, audit: false });
      resetSimulationRandom(seed);
      const auditOn = runOne({ arm, kitId, runIndex: 0, audit: true });
      const invariant = mode === B5_GUARDIAN_FLEE_EV_MODE
        ? compareGuardianObservationInvariance(auditOff, auditOn)
        : compareObservationInvariance(projectGameplayRecord(auditOff), projectGameplayRecord(auditOn));
      observationInvariance[key] = invariant;
      if (!invariant.pass) throw new Error(`observation invariance failed: ${key}`);
    }
  }

  const armReports = {};
  const parityRowsByArm = {};
  for (const armId of modeDefinition.armIds) {
    const arm = modeDefinition.armDefinitions[armId];
    const byKit = {};
    const rowsByKit = {};
    const allRows = [];
    const armRunSamples = createRunEvidenceSampleCollector(RUN_SAMPLE_LIMIT);
    const armCandidateSamples = createCandidateAuditSampleCollector(CANDIDATE_SAMPLE_LIMIT);
    for (const kitId of modeDefinition.kitIds) {
      const rows = [];
      resetSimulationRandom(seed);
      for (let runIndex = 0; runIndex < runs; runIndex++) {
        const row = runOne({ arm, kitId, runIndex, samples: { runs: armRunSamples, candidate: armCandidateSamples } });
        rows.push(row);
        allRows.push(row);
      }
      byKit[kitId] = {
        preparation: rows[0]?.preparation || null,
        aggregate: aggregate(rows)
      };
      rowsByKit[kitId] = rows;
    }
    parityRowsByArm[armId] = rowsByKit;
    const overview = aggregate(allRows);
    const overviewReconciliation = {
      runs: Object.values(byKit).reduce((sum, kit) => sum + kit.aggregate.runs, 0) === overview.runs,
      reach: [2, 3, 4, 5, 6].every(floor => Object.values(byKit)
        .reduce((sum, kit) => sum + kit.aggregate.reach[floor].count, 0) === overview.reach[floor].count),
      outcomes: ["death", "voluntaryReturn", "otherTerminal"].every(field => Object.values(byKit)
        .reduce((sum, kit) => sum + kit.aggregate[field].count, 0) === overview[field].count),
      b5Entrants: Object.values(byKit).reduce((sum, kit) => sum + kit.aggregate.b5.entrantN, 0) === overview.b5.entrantN
    };
    if (!Object.values(overviewReconciliation).every(Boolean)) {
      throw new Error(`${armId}: overview/by-kit reconciliation failed`);
    }
    overview.buildIdentitySample = [...new Set(allRows.flatMap(row => CHECKPOINTS
      .map(floor => row.buildCheckpoints?.[`B${floor}Entry`]?.build?.identity)
      .filter(Boolean)))].slice(0, BUILD_IDENTITY_SAMPLE_LIMIT);
    const preparation = preparations[arm.id];
    armReports[armId] = {
      id: armId,
      preparation: {
        id: arm.preparationId,
        semantics: arm.preparationId === "P0" ? "Standard Preparation" : "Strong Preparation",
        startingWeaponMode: preparation.startingWeaponMode,
        supplies: { TOWN_PORTAL: 1, HEAL_POTION: arm.healPotions, ANTIDOTE: 1, GUARD_POTION: 1 },
        recipeIds: [...preparation.recipeIds],
        derivedInitialMaterialBank: { ...preparation.materials }
      },
      build: {
        id: arm.buildId,
        semantics: mode === B5_WALL_MODE
          ? "canonical adaptive equipment policy; B5-only diagnostic intervention"
          : arm.fixed ? "fixed equipment diagnostic intervention" : "adaptive canonical simulation equipment-update policy",
        requestedPolicy: arm.fixed ? "fixed" : CANONICAL_ADAPTIVE_POLICY_ID,
        effectivePolicyIds: [...new Set(allRows.map(row => row.build.equipmentUpdatePolicy))]
      },
      intervention: [B5_WALL_MODE, B5_GUARDIAN_RETRY_MODE].includes(mode)
        ? {
            flameTrapDisabled: arm.b5FlameTrapDisabled === true,
            guardianFleeDisabled: arm.b5GuardianFleeDisabled === true,
            guardianRetryCheckpoint: arm.b5GuardianRetryCheckpoint === true
          }
        : null,
      byKit,
      overview,
      overviewReconciliation,
      samples: { runs: armRunSamples.finalize(), candidates: armCandidateSamples.finalize() },
      smoke: { runsPerKit: runs, kitCount: modeDefinition.kitIds.length, totalRuns: allRows.length }
    };
  }

  const preB5Parity = [B5_WALL_MODE, B5_GUARDIAN_RETRY_MODE].includes(mode)
    ? buildB5Parity(parityRowsByArm, modeDefinition.kitIds, modeDefinition.armIds)
    : null;
  if (preB5Parity && !preB5Parity.pass) throw new Error("B5 pre-intervention parity failed");
  const guardianRetryPairing = mode === B5_GUARDIAN_RETRY_MODE
    ? buildGuardianRetryPairing(parityRowsByArm, modeDefinition.kitIds)
    : null;
  if (guardianRetryPairing && !guardianRetryPairing.pass) {
    throw new Error("B5 Guardian checkpoint pairing failed");
  }

  const overview = Object.fromEntries(modeDefinition.armIds.map(id => [id, armReports[id].overview]));
  const comparisons = mode === B5_WALL_MODE
    ? [
        comparison(overview.C, overview.F, "F - C: B5 flame diagnostic disabled"),
        comparison(overview.C, overview.G, "G - C: B5 Guardian flee disabled"),
        comparison(overview.C, overview.FG, "FG - C: both B5 interventions")
      ]
    : mode === B5_GUARDIAN_RETRY_MODE
    ? [comparison(overview.C, overview.R, "R - C: B5 Guardian 80% fracture checkpoint")]
    : mode === B5_GUARDIAN_FLEE_EV_MODE
    ? []
    : mode === ARCANA_MP_SUPPLY_MODE
    ? [
        comparison(overview.W0, overview.W1, "W1 - W0: one additional production MANA_POTION"),
        comparison(overview.W1, overview.W2, "W2 - W1: second additional production MANA_POTION"),
        comparison(overview.W0, overview.W2, "W2 - W0: two additional production MANA_POTION"),
        comparison(overview.W0, overview.R, "R - W0: RAPIER baseline - WAND + HALITO baseline"),
        comparison(overview.W1, overview.R, "R - W1: RAPIER baseline - WAND + HALITO + one MANA_POTION"),
        comparison(overview.W2, overview.R, "R - W2: RAPIER baseline - WAND + HALITO + two MANA_POTION")
      ]
    : mode === ARCANA_WEAPON_MODE
    ? [
        comparison(overview.W, overview.R, "R - W: RAPIER weapon lock - WAND + HALITO weapon lock"),
        comparison(overview.C, overview.W, "C - W: canonical adaptive - WAND + HALITO weapon lock"),
        comparison(overview.C, overview.R, "C - R: canonical adaptive - RAPIER weapon lock")
      ]
    : mode === "transition-recovery"
    ? [
        comparison(overview.R15A, overview.R25A, "R25A - R15A: 25% - 15% transition recovery"),
        comparison(overview.R15A, overview.R35A, "R35A - R15A: 35% - 15% transition recovery"),
        comparison(overview.R25A, overview.R35A, "R35A - R25A: 35% - 25% transition recovery"),
        comparison(overview.R35F, overview.R35A, "R35A - R35F: adaptive - fixed at 35%")
      ]
    : mode === "levelup-recovery"
      ? [
        comparison(overview.F0A, overview.H5A, "H5A - F0A: additional flat +5 counterfactual - production baseline"),
        comparison(overview.F0A, overview.P20A, "P20A - F0A: additional percentage 20% counterfactual - production baseline"),
        comparison(overview.P20A, overview.H5A, "H5A - P20A: additional flat +5 counterfactual - additional percentage 20%"),
        comparison(overview.H5F, overview.H5A, "H5A - H5F: adaptive - fixed Build at additional flat +5")
      ]
      : [
        comparison(overview.P0B0, overview.P0B1, "P0B1 - P0B0: Standard Prep Build contribution"),
        comparison(overview.P1B0, overview.P1B1, "P1B1 - P1B0: Strong Prep residual Build contribution"),
        comparison(overview.P0B1, overview.P1B1, "P1B1 - P0B1: Preparation effect under adaptive Build"),
        comparison(overview.P0B0, overview.P1B0, "P1B0 - P0B0: Preparation effect with fixed Build")
      ];
  const b5Comparisons = mode === B5_WALL_MODE
    ? {
        "F-C": b5Comparison(overview.C, overview.F, "F - C"),
        "G-C": b5Comparison(overview.C, overview.G, "G - C"),
        "FG-C": b5Comparison(overview.C, overview.FG, "FG - C"),
        interaction: b5Interaction(overview.C, overview.F, overview.G, overview.FG)
      }
    : mode === B5_GUARDIAN_RETRY_MODE
    ? { "R-C": b5Comparison(overview.C, overview.R, "R - C") }
    : null;
  let baselineParity = null;
  if (mode === "transition-recovery" || mode === "levelup-recovery") {
    const arm = mode === "transition-recovery"
      ? modeDefinition.armDefinitions.R25A
      : modeDefinition.armDefinitions.F0A;
    const byKit = {};
    for (const kitId of modeDefinition.kitIds) {
      if (mode === "transition-recovery") {
        resetSimulationRandom(seed);
        const explicit = runOne({ arm, kitId, runIndex: 0, includeTransitionRecoveryRate: true });
        resetSimulationRandom(seed);
        const omitted = runOne({ arm, kitId, runIndex: 0, includeTransitionRecoveryRate: false });
        byKit[kitId] = compareObservationInvariance(omitted, explicit);
      } else {
        const f0a = modeDefinition.armDefinitions.F0A;
        const p20a = modeDefinition.armDefinitions.P20A;
        const l0a = LEGACY_LEVEL_UP_ARM_DEFINITIONS.L0A;
        const l20a = LEGACY_LEVEL_UP_ARM_DEFINITIONS.L20A;
        const r25a = TRANSITION_ARM_DEFINITIONS.R25A;
        resetSimulationRandom(seed);
        const f0aBaseline = runOne({ arm: f0a, kitId, runIndex: 0 });
        resetSimulationRandom(seed);
        const legacyL0a = runOne({ arm: l0a, kitId, runIndex: 0 });
        resetSimulationRandom(seed);
        const p20aBaseline = runOne({ arm: p20a, kitId, runIndex: 0 });
        resetSimulationRandom(seed);
        const legacyL20a = runOne({ arm: l20a, kitId, runIndex: 0 });
        resetSimulationRandom(seed);
        const omitted = runOne({
          arm: f0a,
          kitId,
          runIndex: 0,
          includeLevelUpRecoveryRate: false,
          includeLevelUpRecoveryFlatHp: false
        });
        resetSimulationRandom(seed);
        const transitionBaseline = runOne({
          arm: r25a,
          kitId,
          runIndex: 0,
          includeLevelUpRecoveryRate: false
        });
        byKit[kitId] = {
          f0aVsL0a: compareObservationInvariance(f0aBaseline, legacyL0a),
          p20aVsL20a: compareObservationInvariance(p20aBaseline, legacyL20a),
          omittedVsZero: compareObservationInvariance(omitted, f0aBaseline),
          r25aVsF0a: compareObservationInvariance(transitionBaseline, f0aBaseline)
        };
      }
    }
    baselineParity = {
      pass: mode === "transition-recovery"
        ? Object.values(byKit).every(value => value.pass)
        : Object.values(byKit).every(value =>
          value.f0aVsL0a.pass &&
          value.p20aVsL20a.pass &&
          value.omittedVsZero.pass &&
          value.r25aVsF0a.pass
        ),
      byKit,
      comparedFields: mode === "transition-recovery"
        ? Object.values(byKit)[0]?.comparedFields || []
        : Object.values(byKit)[0]?.f0aVsL0a.comparedFields || [],
      semantics: mode === "transition-recovery"
        ? "floorTransitionRecoveryRate omitted vs explicit 0.25"
        : "F0A == legacy L0A; P20A == legacy L20A; R25A == F0A; flat omitted == explicit 0"
    };
    if (!baselineParity.pass) throw new Error("baseline parity failed");
  }
  const configuration = {
    measurementId: modeDefinition.id,
    mode,
    runs,
    seed,
    startingKits: [...modeDefinition.kitIds],
    arms: [...modeDefinition.armIds],
    workshop: WORKSHOP_SCENARIO_ID,
    targetDepth: TARGET_DEPTH,
    checkpoints: CHECKPOINTS.map(floor => `B${floor}Entry`),
    sourceOfTruth: "production simulateRun()",
    productionPath: "scratch/simulations/sim_depth_material_ev.js",
    adaptivePolicy: CANONICAL_ADAPTIVE_POLICY_ID,
    fixedPolicy: "fixed",
    transitionRecoveryRates: ["transition-recovery", "levelup-recovery"].includes(mode)
      ? Object.fromEntries(modeDefinition.armIds.map(id => [id, modeDefinition.armDefinitions[id].recoveryRate]))
      : null,
    levelUpRecoveryRates: mode === "levelup-recovery"
      ? Object.fromEntries(modeDefinition.armIds.map(id => [id, modeDefinition.armDefinitions[id].levelUpRecoveryRate]))
      : null,
    levelUpRecoveryFlatHp: mode === "levelup-recovery"
      ? Object.fromEntries(modeDefinition.armIds.map(id => [id, modeDefinition.armDefinitions[id].levelUpRecoveryFlatHp]))
      : null,
    preparation: ["transition-recovery", "levelup-recovery"].includes(mode)
      ? { name: "Standard Preparation", startingWeaponMode: "kit-default", healPotions: 4 }
      : mode === ARCANA_MP_SUPPLY_MODE
        ? { name: "Standard Preparation + departure MANA capability probe", startingWeaponMode: "explicit arm weapon", healPotions: 4, additionalManaPotions: { W0: 0, W1: 1, W2: 2, R: 0 } }
        : mode === B5_WALL_MODE
          ? { name: "Standard Preparation", startingWeaponMode: "kit-default", healPotions: 4, recovery: "current production recovery", manaRecipe: "current production MANA recipe" }
        : mode === B5_GUARDIAN_RETRY_MODE
          ? { name: "Standard Preparation", startingWeaponMode: "kit-default", healPotions: 4, recovery: "current production recovery", manaRecipe: "current production MANA recipe" }
        : mode === B5_GUARDIAN_FLEE_EV_MODE
          ? { name: "Standard Preparation", startingWeaponMode: "kit-default", healPotions: 4, recovery: "current production recovery", manaRecipe: "current production MANA recipe" }
        : null,
    worldSeedTemplate: "run-difficulty:{seed}:{runIndex}",
    identityBoundary: "HP/MP/bag/floor/starting-kit excluded from Build Snapshot identity",
    artifactPolicy: {
      fullRunRecords: "omitted",
      representativeRunsPerArm: RUN_SAMPLE_LIMIT,
      buildIdentitySamplesPerArm: BUILD_IDENTITY_SAMPLE_LIMIT,
      candidateSamplesPerArm: CANDIDATE_SAMPLE_LIMIT,
      pairedSamplesPerArm: GUARDIAN_STR_FIGHT_SAMPLE_LIMIT,
      rawEncounterIdentities: "omitted"
    },
    comparisonSemantics: mode === B5_WALL_MODE
      ? "B1-B4 exact paired parity and B5-entry parity are asserted; F/G/FG interventions begin at B5; no post-intervention path/RNG parity claim"
      : mode === B5_GUARDIAN_RETRY_MODE
      ? "C/R B1-B4 and B5-entry parity are asserted; first Guardian attempt is paired through the checkpoint-application boundary; no post-application path/RNG parity claim"
      : mode === B5_GUARDIAN_FLEE_EV_MODE
      ? "C=current only; B5 Guardian first player EV evaluation observed once per attempt; STR→fight pairs clone the post-STR branch state and restore the production RNG around production flee resolver execution; observation ON/OFF compares outcome, action sequence, and RNG invariance"
      : mode === ARCANA_WEAPON_MODE
      ? "Cross-arm C/W/R treatment comparisons use matched initial conditions; no post-divergence same-seed path/encounter/loot/trap parity claim"
      : mode === ARCANA_MP_SUPPLY_MODE
        ? "W1/W2 differ from W0 only by production departure-craft MANA_POTION recipe count; cross-arm post-divergence path/encounter/loot/trap parity is not claimed"
      : "Only within-arm treatment deltas are decision comparisons; no post-divergence same-seed path/encounter/loot/trap parity claim",
    armSemantics: mode === B5_WALL_MODE
      ? {
          C: "current production B5 behavior",
          F: "C + B5 flame trap disabled in diagnostic only",
          G: "C + flee disabled after B5 Guardian combat starts; pre-boss Return unchanged",
          FG: "F + G"
        }
      : mode === B5_GUARDIAN_RETRY_MODE
      ? {
          C: "current production B5 behavior; checkpoint observation only",
          R: "C + B5 デーモンガード 80% fracture checkpoint on successful qualifying flee; run-local, non-stacking; guard reset"
        }
      : mode === B5_GUARDIAN_FLEE_EV_MODE
      ? { C: "current production B5 behavior; first Guardian EV decision observation only" }
      : mode === ARCANA_WEAPON_MODE
      ? {
          C: "Arcana Standard Preparation WAND + HALITO; canonical adaptive; weapon swappable",
          W: "Arcana Standard Preparation WAND + HALITO; weapon slot locked; other slots adaptive",
          R: "Arcana Standard Preparation RAPIER; no Medium/Rune; weapon slot locked; other slots adaptive"
        }
      : mode === ARCANA_MP_SUPPLY_MODE
        ? {
            W0: "Arcana Standard Preparation WAND + HALITO; weapon slot locked; non-weapon slots adaptive; additional departure MANA_POTION 0",
            W1: "W0 + exactly one production departure-craft MANA_POTION",
            W2: "W0 + exactly two production departure-craft MANA_POTION",
            R: "Arcana Standard Preparation RAPIER; no Medium/Rune; weapon slot locked; non-weapon slots adaptive; additional departure MANA_POTION 0"
          }
      : null
  };
  const result = {
    schemaVersion: SCHEMA_VERSION,
    runnerVersion: modeDefinition.runnerVersion,
    configuration,
    comparisonKey: hashConfiguration(configuration),
    arms: armReports,
    primaryComparisons: comparisons,
    determinism: {
      pass: Object.values(determinism).every(Boolean),
      byCase: determinism
    },
    observationInvariance: {
      pass: Object.values(observationInvariance).every(value => value.pass),
      byCase: observationInvariance
    },
    baselineParity,
    preB5Parity,
    b5Comparisons,
    guardianRetryPairing
  };
  if (mode === ARCANA_MP_SUPPLY_MODE) {
    const bridgePairs = [
      ["W0", "W"],
      ["R", "R"]
    ];
    const bridgeByArm = {};
    for (const [currentArmId, legacyArmId] of bridgePairs) {
      const currentArm = modeDefinition.armDefinitions[currentArmId];
      const legacyArm = ARCANA_WEAPON_ARM_DEFINITIONS[legacyArmId];
      resetSimulationRandom(seed);
      const current = runOne({ arm: currentArm, kitId: "arcana", runIndex: 0 });
      resetSimulationRandom(seed);
      const legacy = runOne({ arm: legacyArm, kitId: "arcana", runIndex: 0 });
      const parity = compareObservationInvariance(current, legacy);
      bridgeByArm[currentArmId] = {
        pass: parity.pass,
        comparedFields: parity.comparedFields,
        legacyArm: legacyArmId,
        currentAdditionalManaPotions: currentArm.additionalManaPotions || 0,
        legacyAdditionalManaPotions: legacyArm.additionalManaPotions || 0
      };
    }
    result.baselineParity = {
      pass: Object.values(bridgeByArm).every(item => item.pass),
      byArm: bridgeByArm,
      semantics: "N=1 deterministic bridge: W0 == #1350 W; R == #1350 R; no scenario difference beyond MANA_POTION addition axis"
    };
    if (!result.baselineParity.pass) throw new Error("arcana MP supply baseline bridge failed");
  }
  if (mode === ARCANA_WEAPON_MODE || mode === ARCANA_MP_SUPPLY_MODE) {
    const sanityPreparation = mode === ARCANA_MP_SUPPLY_MODE ? preparations.W0 : preparations.W;
    const sanityBase = {
      ...baseScenario,
      startingKit: "arcana",
      startingHealPotions: 0,
      startingAntidotes: 0,
      startingGuardPotions: 0,
      startingTownPortals: 0,
      departureCraft: [...sanityPreparation.recipeIds],
      departureCraftMaterialsAreActualBank: true,
      departureCraftMaterials: { ...sanityPreparation.materials },
      departureCraftMeasurement: true,
      collectEncounterIdentities: true,
      collectStage15Diagnostics: true,
      simDiagnosticLevel: "full",
      fleePolicy: "never",
      fixedCombat: {
        monsterNames: [getEncounterPoolForFloor(1)[0]],
        entryHpRatio: 1,
        entryMpRatio: 1
      }
    };
    const runSanity = (weapon, key) => {
      resetSimulationRandom(seed);
      const raw = simulateRun({
        className: "Fighter",
        startFloor: 1,
        targetDepth: 2,
        runIndex: 0,
        seriesId: `arcana-combat-sanity:${key}`,
        scenario: { ...sanityBase, startingGearChoice: weapon },
        workshop: baseScenario.workshop,
        worldSeed: `arcana-combat-sanity:${seed}:matched`,
        collectDiagnostics: true,
        collectBuildSnapshots: true
      });
      const encounter = raw.diagnostics?.encounters?.[0];
      const firstRound = encounter?.rounds?.[0] || null;
      const rounds = encounter?.rounds || [];
      const playerDamage = (actionType) => rounds.reduce((sum, round) => sum +
        (round.log || []).reduce((roundSum, message) => {
          if (!message.startsWith("[味方]") || !message.includes("ダメージ")) return roundSum;
          if (actionType === "spell" && !message.includes("唱えた")) return roundSum;
          if (actionType === "fight" && !message.includes("攻撃")) return roundSum;
          const match = message.match(/に(\d+)の[^！。]*ダメージ/);
          return roundSum + (match ? Number(match[1]) : 0);
        }, 0), 0);
      return {
        weapon,
        activeRune: raw.startingBuildSnapshot?.canonicalBuildSnapshot?.activeRuneSpellIds || [],
        selectedAction: firstRound ? {
          type: firstRound.action,
          spellName: firstRound.spellName || null
        } : null,
        mpPayment: firstRound ? {
          start: firstRound.mpBefore,
          spent: Math.max(0, firstRound.mpBefore - rounds.at(-1).mpAfter),
          end: rounds.at(-1).mpAfter
        } : null,
        damage: {
          physical: playerDamage("fight"),
          spell: playerDamage("spell")
        },
        rounds: rounds.length,
        incomingDamage: raw.combatDamageHp ?? null
      };
    };
    const wandSanity = runSanity("WAND", "wand");
    const rapierSanity = runSanity("RAPIER", "rapier");
    const repeatWandSanity = runSanity("WAND", "wand");
    result.scoringAudit = getArcanaWeaponScoreAudit();
    result.combatSanity = {
      productionEnemy: sanityBase.fixedCombat.monsterNames[0],
      wand: wandSanity,
      rapier: rapierSanity,
      determinism: JSON.stringify(wandSanity) === JSON.stringify(repeatWandSanity)
    };
  }
  return result;
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (!arg.startsWith("--")) throw new Error(`unknown argument: ${arg}`);
    const [key, inline] = arg.slice(2).split("=", 2);
    const value = inline ?? argv[++index];
    if (value === undefined) throw new Error(`--${key} requires a value`);
    options[key] = value;
  }
  return options;
}

function buildReport(result, provenance, purpose, requestedRef, environment) {
  return {
    measurement: {
      measurementId: result.configuration.measurementId,
      schemaVersion: result.schemaVersion,
      runnerVersion: result.runnerVersion,
      purpose,
      requestedRef,
      sourceCommit: provenance.sourceCommit,
      gameplaySourceCommit: provenance.gameplaySourceCommit,
      measurementRunnerCommit: provenance.measurementRunnerCommit,
      measurementRunnerPaths: PRODUCTION_PATHS,
      baseRef: provenance.baseRef,
      baseCommit: provenance.baseCommit,
      originMainAncestor: provenance.originMainAncestor,
      staleTreeAllowed: provenance.staleTreeAllowed,
      workingTreeClean: provenance.workingTreeClean,
      environmentSignature: environment,
      productionBalanceChange: false
    },
    ...result
  };
}

export function buildSummary(report) {
  if (report.configuration.mode === B5_GUARDIAN_FLEE_EV_MODE) {
    const diagnosticLine = (label, aggregate) => {
      const ev = aggregate.b5.guardianFleeEv;
      return `- ${label}: first-decision N=${ev.firstDecisionN}; fight/recover/flee=${JSON.stringify(ev.decisions)}; reasons=${JSON.stringify(ev.reasons)}; expectedTurnsToWin p10/p50/p90=${JSON.stringify(ev.expectedTurnsToWin)}; survivalTurns=${JSON.stringify(ev.survivalTurns)}; turnDeficit=${JSON.stringify(ev.turnDeficit)}; physicalDamageEstimate=${JSON.stringify(ev.physicalDamageEstimate)}; incomingDamage=${JSON.stringify(ev.incomingDamage)}; HP/MP rate=${JSON.stringify(ev.hpRate)}/${JSON.stringify(ev.mpRate)}; hpBelowFlee=${JSON.stringify(ev.hpBelowFleeThreshold)}; GUARD_POTION=${JSON.stringify(ev.guardPotionAvailable)}; preferred=${JSON.stringify(ev.preferredAction)}; preferredSpell/fight=${JSON.stringify(ev.preferredSpell)}/${JSON.stringify(ev.preferredFight)}; offensivePayment=${JSON.stringify(ev.offensiveSpellPaymentAvailable)}`;
    };
    const crossTabLine = (label, aggregate) => `- ${label} cross-tab: ${JSON.stringify(aggregate.b5.guardianFleeEv.crossTabs)}`;
      const traceLine = (label, aggregate) => {
      const ev = aggregate.b5.guardianFleeEv;
      return `- ${label} trace: attempts=${ev.attemptsObserved}; selectedFirst=${JSON.stringify(ev.selectedFirstAction)}; executedFirst=${JSON.stringify(ev.executedFirstAction)}; selectedFleeIndex=${JSON.stringify(ev.selectedFleeDecisionIndex)}; executedFleeIndex=${JSON.stringify(ev.executedFleeDecisionIndex)}; selectedFleeRound=${JSON.stringify(ev.selectedFleeRound)}; executedFleeRound=${JSON.stringify(ev.executedFleeRound)}; selectedBeforeFlee=${JSON.stringify(ev.selectedActionsBeforeFlee)}; executedBeforeFlee=${JSON.stringify(ev.executedActionsBeforeFlee)}; selectedOpening=${JSON.stringify(ev.selectedOpeningItemUsage)}; openingUsed=${JSON.stringify(ev.openingItemUsage)}; bossHp%=${JSON.stringify(ev.bossHpAtFleeRate)}; guardianDamage=${JSON.stringify(ev.guardianDamageBeforeFlee)}; playerHp%=${JSON.stringify(ev.playerHpAtFleeRate)}; rawByIndex=${JSON.stringify(ev.rawDecisionByDecisionIndex)}; fleeDeferredByOpening=${JSON.stringify(ev.fleeDeferredByOpening)}; transitions=${ev.transitionsObserved}; openingTransitions=${JSON.stringify(ev.openingTransitionsByItem)}`;
    };
    const strFightLine = (label, aggregate) => {
      const cohort = aggregate.b5.guardianFleeEv.strFightCohort;
      return `- ${label} STR→fight cohort: N=${cohort.cohortN}; outcomes=${JSON.stringify(cohort.outcomes)}; paired=${JSON.stringify(cohort.paired)}; all=${JSON.stringify(cohort.all)}; byOutcome=${JSON.stringify(cohort.byOutcome)}; samples=${JSON.stringify(cohort.samples)}`;
    };
    const lines = [
      "# First Band B5 Guardian flee EV diagnostic",
      "",
      `- measurement: ${report.configuration.measurementId}; C=current only; N=${report.configuration.runs}/kit; seed=${report.configuration.seed}; production balance change=false; raw run records omitted; Heavy=not run`,
      `- production boss rule: ${JSON.stringify(report.arms.C.overview.b5.guardianFleeEv.productionBossRule)}; observation ON/OFF outcome/action/RNG invariance=${report.observationInvariance.pass ? "PASS" : "FAIL"}; determinism=${report.determinism.pass ? "PASS" : "FAIL"}`,
      "",
      "## Aggregate",
      "",
      diagnosticLine("C", report.arms.C.overview),
      crossTabLine("C", report.arms.C.overview),
      traceLine("C", report.arms.C.overview),
      strFightLine("C", report.arms.C.overview),
      "",
      "## Kit",
      "",
      ...KIT_IDS.map(kitId => [
        diagnosticLine(`C/${kitId}`, report.arms.C.byKit[kitId].aggregate),
        crossTabLine(`C/${kitId}`, report.arms.C.byKit[kitId].aggregate),
        traceLine(`C/${kitId}`, report.arms.C.byKit[kitId].aggregate),
        strFightLine(`C/${kitId}`, report.arms.C.byKit[kitId].aggregate)
      ]).flat(),
      "",
      "- evaluator terms/reasons are observation-only; production policy, action ordering, thresholds, checkpoints, and RNG path unchanged."
    ];
    return `${lines.join("\n")}\n`;
  }
  if (report.configuration.mode === B5_GUARDIAN_RETRY_MODE) {
    const event = value => `${value.count}/${value.denominator}`;
    const display = value => value == null ? "unobserved" : value;
    const outcomeLine = (armId, aggregate, label = armId) => {
      const b5 = aggregate.b5;
      const retry = b5.guardianRetry;
      return `- ${label}: B5 entrants=${b5.entrantN}; attempts/flee/retry=${event(retry.attempts)}/${event(retry.flee)}/${event(retry.retry)}; flee→retry=${event(retry.fleeToRetry)}; qualifying flee=${event(retry.qualifyingFlee)}; earned/applied=${event(retry.checkpointEarned)}/${event(retry.checkpointApplied)}; bossHP%/playerHP% at flee p50=${display(retry.bossHpAtFlee.p50)}/${display(retry.playerHpAtFlee.p50)} n=${retry.bossHpAtFlee.count}/${retry.bossHpAtFlee.denominator}; guardBreak/victory/death=${event(retry.guardBreak)}/${event(retry.victory)}/${event(retry.death)}; Return before/after/milestonePortal=${b5.townPortalReturnBeforeBoss.count}/${b5.entrantN}/${b5.townPortalReturnAfterBossAttemptBeforeB6.count}/${b5.entrantN}/${b5.milestonePortalReturnAfterGuardian.count}/${b5.entrantN}; B6=${b5.b6Transition.count}/${b5.entrantN}`;
    };
    const armLines = B5_GUARDIAN_RETRY_ARM_IDS.map(armId => outcomeLine(armId, report.arms[armId].overview));
    const kitLines = B5_GUARDIAN_RETRY_ARM_IDS.flatMap(armId =>
      report.configuration.startingKits.map(kitId => outcomeLine(
        armId,
        report.arms[armId].byKit[kitId].aggregate,
        `${armId}/${kitId}`
      ))
    );
    return [
      "# First Band B5 Guardian fracture checkpoint diagnostic",
      "",
      `- measurement: ${report.configuration.measurementId}; N=${report.configuration.runs}/kit/arm; seed=${report.configuration.seed}; target=B6; production balance change=false; raw run records omitted; Heavy=not run`,
      "- C=current; R=B5 デーモンガード only: successful qualifying flee earns one run-local 80% checkpoint; retry applies exactly 80%; below-80% carryover and stacking prohibited.",
      "- LAHALITO / break 80% / exposure 4 / 1.5x unchanged; retry start guardBroken=false / exposure=0.",
      "- C/R B1-B4, B5 entry, and pre-checkpoint Guardian attempt pairing asserted; post-application path/RNG parity not claimed.",
      "",
      "## Aggregate",
      "",
      ...armLines,
      "",
      "## Kit",
      "",
      ...kitLines,
      "",
      `- R-C: ${JSON.stringify(report.b5Comparisons?.["R-C"]?.delta || null)}`,
      `- pre-B5 parity: ${report.preB5Parity?.pass ? "PASS" : "FAIL"}; guardian pairing: ${report.guardianRetryPairing?.pass ? "PASS" : "FAIL"}`,
      `- determinism: ${report.determinism.pass ? "PASS" : "FAIL"}; observation invariance: ${report.observationInvariance.pass ? "PASS" : "FAIL"}; smoke/diagnostic evidence, no distributional claim.`
    ].join("\n") + "\n";
  }
  if (report.configuration.mode === B5_WALL_MODE) {
    const display = value => value == null ? "unobserved" : value;
    const rateDisplay = value => value == null ? "unobserved" : `${Math.round(value * 100)}%`;
    const outcomeLine = armId => {
      const aggregate = report.arms[armId].overview;
      const b5 = aggregate.b5;
      const boss = b5.boss;
      return `- ${armId}: entrants=${b5.entrantN}; flame eligible/trigger mean-per-entrant/trigger rate/damage=${display(b5.flameTrap.eligibleSteps.meanPerEntrant)}/${display(b5.flameTrap.triggerCount.meanPerEntrant)}/${rateDisplay(b5.flameTrap.triggerRate)}/${display(b5.flameTrap.hpDamage.meanPerEntrant)}; boss arrival/start/victory/flee/retry/death=${rateDisplay(boss.actualBossEventArrival.meanPerEntrant)}/${rateDisplay(boss.combatStart.meanPerEntrant)}/${rateDisplay(boss.victory.meanPerEntrant)}/${rateDisplay(boss.flee.meanPerEntrant)}/${rateDisplay(boss.retry.meanPerEntrant)}/${rateDisplay(boss.death.meanPerEntrant)}; guardBreak=${rateDisplay(boss.guardBreak.meanPerEntrant)}; Return before/after=${rateDisplay(b5.townPortalReturnBeforeBoss.rate)}/${rateDisplay(b5.townPortalReturnAfterBossAttemptBeforeB6.rate)}; B6=${rateDisplay(b5.b6Transition.rate)}`;
    };
    const comparisonLine = key => {
      const item = report.b5Comparisons[key];
      return `- ${key}: ${JSON.stringify(item.delta)}`;
    };
    return [
      "# First Band B5 wall diagnostic",
      "",
      `- measurement: ${report.configuration.measurementId}; N=${report.configuration.runs}/kit/arm; seed=${report.configuration.seed}; target=B6; workshop=${report.configuration.workshop}; production balance change=false; raw run records omitted`,
      "- C=current; F=B5 flame diagnostic disabled; G=B5 Guardian combat後のみflee禁止; FG=F+G.",
      "- B1-B4 and B5-entry pairing is asserted. Post-B5 path/RNG parity is not claimed.",
      "",
      "## Arms",
      "",
      ...B5_WALL_ARM_IDS.map(outcomeLine),
      "",
      "## B5 comparison rate differences",
      "",
      ...["F-C", "G-C", "FG-C", "interaction"].map(comparisonLine),
      "",
      `- pre-B5 parity: ${report.preB5Parity?.pass ? "PASS" : "FAIL"}; compared=${JSON.stringify(report.preB5Parity?.comparedFields || [])}`,
      `- determinism: ${report.determinism.pass ? "PASS" : "FAIL"}; observation invariance: ${report.observationInvariance.pass ? "PASS" : "FAIL"}; smoke only, no distributional claim.`
    ].join("\n") + "\n";
  }
  if (report.configuration.mode === ARCANA_MP_SUPPLY_MODE) {
    const display = value => value == null ? "unobserved" : value;
    const rateDisplay = value => value == null ? "unobserved" : `${Math.round(value * 100)}%`;
    const outcomeLine = armId => {
      const aggregate = report.arms[armId].overview;
      return `${armId}: reach B2/B3/B4/B5/B6=${[2, 3, 4, 5, 6].map(floor => rateDisplay(aggregate.reach[floor].rate)).join("/")}; death=${rateDisplay(aggregate.death.rate)}; Return=${rateDisplay(aggregate.voluntaryReturn.rate)}; deepest p50=${display(aggregate.deepestFloor.p50)}; B5→B6=${rateDisplay(aggregate.b5.b6Transition.rate)}`;
    };
    const spellLine = (armId, floor) => {
      const spell = report.arms[armId].overview.combat[floor].spellTelemetry;
      const entry = report.arms[armId].overview.recovery[floor];
      return `B${floor} combat=${display(spell.combatCount.meanPerEntrant)} rounds=${display(spell.rounds.meanPerEntrant)} enemy=${display(spell.enemyActions.meanPerEntrant)} fight=${display(spell.fightActions.meanPerEntrant)} spell=${display(spell.spellActions.meanPerEntrant)} HALITO=${display(spell.halitoCasts.meanPerEntrant)} physicalDmg=${display(spell.physicalDamage.meanPerEntrant)} spellDmg=${display(spell.spellDamage.meanPerEntrant)} MP start p25/p50/p75=${display(spell.mpStart.p25)}/${display(spell.mpStart.p50)}/${display(spell.mpStart.p75)} spent=${display(spell.mpSpent.meanPerEntrant)} end p25/p50/p75=${display(spell.mpEnd.p25)}/${display(spell.mpEnd.p50)}/${display(spell.mpEnd.p75)} opportunity/selected/fallback=${display(spell.spellOpportunityRounds.meanPerEntrant)}/${display(spell.eligibleSpellSelected.meanPerEntrant)}/${display(spell.eligibleFightFallback.meanPerEntrant)} MP0=${display(spell.mpZeroCombatCount.total)}/${rateDisplay(spell.mpZeroCombatShare)} entryHP=${display(entry.entryHp.p50)} HEAL=${display(entry.entryHealPotionRemaining.p50)} used=${display(entry.potionUsed.meanPerEntrant)}`;
    };
    const lifecycleLine = armId => {
      const lifecycle = report.arms[armId].overview.manaPotionLifecycle;
      const sources = Object.fromEntries(Object.entries(lifecycle.acquiredBySource).map(([source, value]) => [source, value.total]));
      return `${armId}: requested/crafted=${lifecycle.departureRequested.total}/${lifecycle.departureCrafted.total}; acquired=${lifecycle.acquiredTotal.total} source=${JSON.stringify(sources)}; consumed=${lifecycle.consumedTotal.total} combat/post=${lifecycle.consumedInCombat.total}/${lifecycle.consumedPostCombat.total}; first floor/step=${display(lifecycle.firstConsumptionFloor.p50)}/${display(lifecycle.firstConsumptionStep.p50)}; recovered/capWaste=${lifecycle.actualMpRecovered.total}/${lifecycle.capWaste.total}; remaining B2/B3/B4/B5=${["B2", "B3", "B4", "B5"].map(floor => display(lifecycle.remainingAtEntry[floor].p50)).join("/")}; termination/lost=${display(lifecycle.remainingAtTermination.p50)}/${lifecycle.terminalLoss.total}; reconciliation=${lifecycle.reconciliation ? "PASS" : "FAIL"}`;
    };
    const buildLine = armId => {
      const aggregate = report.arms[armId].overview;
      return `${armId}: ${[2, 3, 4, 5].map(floor => { const checkpoint = aggregate.buildCheckpoints[floor]; return `B${floor} weaponSwaps=${display(checkpoint.weaponSwapCount.total)} nonWeaponSwaps=${display(checkpoint.nonWeaponSwapCount.total)} identityChanged=${rateDisplay(checkpoint.changedFromDeparture.rate)}`; }).join("; ")}`;
    };
    const b5Line = armId => {
      const aggregate = report.arms[armId].overview;
      const boss = aggregate.b5.boss;
      return `${armId}: entrants=${aggregate.b5.entrantN}; guardian route/arrival/start/victory/death=${boss.routeBossDetected.total}/${boss.actualBossEventArrival.total}/${boss.combatStart.total}/${boss.victoryEventCount.total}/${boss.deathEventCount.total}; Return before/after=${aggregate.b5.townPortalReturnBeforeBoss.count}/${aggregate.b5.townPortalReturnAfterBossAttemptBeforeB6.count}; entryHP/MP=${display(boss.arrivalHp.p50)}/${display(boss.arrivalMp.p50)}`;
    };
    const preparationLine = armId => {
      const preparation = report.arms[armId].byKit.arcana.preparation;
      return `${armId}: weapon=${preparation.startingWeapon}; Medium=${preparation.medium || "none"}; Rune=${preparation.activeRunes.join(",") || "none"}; maxMP=${preparation.maxMp}; startMP=${preparation.startingMp}; manaRecipes=${preparation.additionalManaPotions}; manaPayment=${JSON.stringify(preparation.manaPotionPayment)}`;
    };
    const lines = [
      "# First Band Arcana MP supply diagnostic",
      "",
      `- measurement: ${report.configuration.measurementId}; configured runs=${report.configuration.runs}/arm; seed=${report.configuration.seed}; target=B6; workshop=${report.configuration.workshop}; successful completion=true`,
      "- W0: WAND + HALITO, weapon slot locked, non-weapon slots adaptive, additional departure MANA_POTION 0.",
      "- W1/W2: W0 plus exactly one/two production departure-craft MANA_POTION; Standard Preparation items retained.",
      "- R: RAPIER, no Medium/Rune, weapon slot locked, non-weapon slots adaptive, additional departure MANA_POTION 0.",
      "- production simulateRun path; raw full-run records omitted; production balance change=false.",
      "",
      "## Preparation and bridge",
      "",
      ...["W0", "W1", "W2", "R"].map(preparationLine),
      `- N=1 bridge: ${report.baselineParity?.pass ? "PASS" : "FAIL"}; ${JSON.stringify(report.baselineParity?.byArm || {})}`,
      "",
      "## Outcomes",
      "",
      ...["W0", "W1", "W2", "R"].map(outcomeLine),
      "",
      "## B2-B5 Build checkpoints",
      "",
      ...["W0", "W1", "W2", "R"].map(buildLine),
      "",
      "## B5 guardian decomposition",
      "",
      ...["W0", "W1", "W2", "R"].map(b5Line),
      "",
      "## Spell / MP telemetry",
      "",
      ...["W0", "W1", "W2", "R"].flatMap(armId => [
        `### ${armId}`,
        ...[1, 2, 3, 4, 5].map(floor => `- ${spellLine(armId, floor)}; fallback reasons=${JSON.stringify(report.arms[armId].overview.combat[floor].spellTelemetry.fallbackReasons)}`)
      ]),
      "",
      "## MANA_POTION lifecycle",
      "",
      ...["W0", "W1", "W2", "R"].map(lifecycleLine),
      "",
      "## Comparisons",
      "",
      ...report.primaryComparisons.map(item => `- ${item.label}: B3/B4/death=${["b3", "b4", "death"].map(key => display(item.delta[key])).join("/")}; B5/B6=${display(item.delta.b5)}/${display(item.delta.b6)}`),
      "",
      `- determinism=${report.determinism.pass ? "PASS" : "FAIL"}; observation invariance=${report.observationInvariance.pass ? "PASS" : "FAIL"}; configured runs=${report.configuration.runs}/arm; successful completion=true.`
    ];
    return `${lines.join("\n")}\n`;
  }
  if (report.configuration.mode === ARCANA_WEAPON_MODE) {
    const display = value => value == null ? "unobserved" : value;
    const rateDisplay = value => value == null ? "unobserved" : `${Math.round(value * 100)}%`;
    const score = report.scoringAudit;
    const scoreLine = item => `ATK=${display(item.weaponAtk)} MP=${display(item.maxMP)} Medium=${item.medium || "none"} RuneSlots=${display(item.runeSlots)} active=${item.activeRunes.join(",") || "none"} base=${display(item.baseEquipmentScore)} total=${display(item.totalScore)}`;
    const outcomeLine = armId => {
      const aggregate = report.arms[armId].overview;
      return `${armId}: reach B2/B3/B4/B5/B6=${[2, 3, 4, 5, 6].map(floor => rateDisplay(aggregate.reach[floor].rate)).join("/")}; death=${rateDisplay(aggregate.death.rate)}; Return=${rateDisplay(aggregate.voluntaryReturn.rate)}; deepest p50=${display(aggregate.deepestFloor.p50)}; B5→B6=${rateDisplay(aggregate.b5.b6Transition.rate)}`;
    };
    const spellLine = (armId, floor) => {
      const spell = report.arms[armId].overview.combat[floor].spellTelemetry;
      return `B${floor} combat=${display(spell.combatCount.meanPerEntrant)} rounds=${display(spell.rounds.meanPerEntrant)} enemy=${display(spell.enemyActions.meanPerEntrant)} fight=${display(spell.fightActions.meanPerEntrant)} spell=${display(spell.spellActions.meanPerEntrant)} HALITO=${display(spell.halitoCasts.meanPerEntrant)} physicalDmg=${display(spell.physicalDamage.meanPerEntrant)} spellDmg=${display(spell.spellDamage.meanPerEntrant)} MP=${display(spell.mpStart.p50)}/${display(spell.mpSpent.meanPerEntrant)}/${display(spell.mpEnd.p50)} opportunity=${display(spell.spellOpportunityRounds.meanPerEntrant)} selected=${display(spell.eligibleSpellSelected.meanPerEntrant)} fallback=${display(spell.eligibleFightFallback.meanPerEntrant)} MP0share=${rateDisplay(spell.mpZeroCombatShare)}`;
    };
    const b5Line = armId => {
      const b5 = report.arms[armId].overview.b5;
      const boss = b5.boss;
      return `${armId}: entrant=${b5.entrantN}; flame=${b5.flameTrap.triggerCount.total}; boss route/arrival/start/victory/death=${boss.routeBossDetected.total}/${boss.actualBossEventArrival.total}/${boss.combatStart.total}/${boss.victoryEventCount.total}/${boss.deathEventCount.total}; Return before/after=${b5.townPortalReturnBeforeBoss.count}/${b5.townPortalReturnAfterBossAttemptBeforeB6.count}; entryHP p50=${display(b5.boss.arrivalHp.p50)} potion=${display(b5.boss.remainingHealPotion.p50)}`;
    };
    const lines = [
      "# First Band Arcana weapon diagnostic",
      "",
      `- measurement: ${report.configuration.measurementId}; N=${report.configuration.runs}/arm; seed=${report.configuration.seed}; target=B6; workshop=${report.configuration.workshop}`,
      "- C: WAND + HALITO, canonical adaptive, weapon swappable.",
      "- W: WAND + HALITO, weapon slot locked, non-weapon slots adaptive.",
      "- R: RAPIER, no Medium/Rune, weapon slot locked, non-weapon slots adaptive.",
      "- Standard Preparation; production recovery baseline; Arcana only; production simulateRun/auto-action; raw full-run records omitted.",
      "",
      "## Score audit",
      "",
      `- WAND + HALITO: ${scoreLine(score.wand)}`,
      `- RAPIER: ${scoreLine(score.rapier)}`,
      `- structural delta R-W: ${JSON.stringify(score.structuralDelta)}; score delta=${JSON.stringify(score.scoreDelta)}`,
      "",
      "## Outcomes",
      "",
      ...["C", "W", "R"].map(outcomeLine),
      "",
      "## B2-B5 Build checkpoints",
      "",
      ...["C", "W", "R"].map(armId => `- ${armId}: ${[2, 3, 4, 5].map(floor => { const checkpoint = report.arms[armId].overview.buildCheckpoints[floor]; return `B${floor} swaps p50=${display(checkpoint.equipmentSwapCount.p50)} weaponSwaps=${display(checkpoint.weaponSwapCount.p50)} nonWeaponSwaps=${display(checkpoint.nonWeaponSwapCount.p50)} changed=${rateDisplay(checkpoint.changedFromDeparture.rate)} weapon=${JSON.stringify(checkpoint.weaponIdentity.distribution)}`; }).join("; ")}`),
      "",
      "## B5 decomposition",
      "",
      ...["C", "W", "R"].map(b5Line),
      "",
      "## W spell-use telemetry",
      "",
      ...[1, 2, 3, 4, 5].map(floor => `- ${spellLine("W", floor)}; fallback reasons=${JSON.stringify(report.arms.W.overview.combat[floor].spellTelemetry.fallbackReasons)}`),
      "",
      "## C Medium abandonment",
      "",
      `- ${JSON.stringify(report.arms.C.overview.mediumAbandonment)}`,
      "",
      "## Combat sanity",
      "",
      `- enemy=${report.combatSanity.productionEnemy}; W=${JSON.stringify(report.combatSanity.wand)}; R=${JSON.stringify(report.combatSanity.rapier)}; determinism=${report.combatSanity.determinism}`,
      "",
      `- determinism=${report.determinism.pass}; observation invariance=${report.observationInvariance.pass}; production balance change=false; configured runs=${report.configuration.runs}/arm; successful completion=true.`,
      ""
    ];
    return lines.join("\n");
  }
  if (report.configuration.measurementId === LEVEL_UP_MEASUREMENT_ID) {
    const display = value => value == null ? "unobserved" : value;
    const rateDisplay = value => value == null ? "unobserved" : `${Math.round(value * 100)}%`;
    const comparisonLine = item => [
      `B3/B4/B5/B6 ${["b3", "b4", "b5", "b6"].map(key => display(item.delta[key])).join("/")}`,
      `death/Return ${display(item.delta.death)}/${display(item.delta.voluntaryReturn)}`,
      `boss arrival/start/victory ${["bossActualArrival", "bossStart", "bossVictory"].map(key => display(item.delta[key])).join("/")}`,
      `B5→B6 ${display(item.delta.b5ToB6)}`
    ].join("; ");
    const levelLine = (aggregate, floor) => {
      const level = aggregate.levelProgression[floor];
      const recovery = aggregate.recovery[floor];
      return `B${floor} entry level p50=${display(level.entryLevel.p50)}; entry HP/ratio=${display(recovery.entryHp.p50)}/${rateDisplay(recovery.entryHpRatio.p50)}; level-ups=${display(level.levelUpCount.meanPerEntrant)}; from/to=${JSON.stringify(level.fromToLevel)}; natural HP=${display(level.naturalHpGrowth.meanPerEntrant)}; production fixed +5 extra HP=${display(level.productionExtraHpRecovery.meanPerEntrant)}; additional percentage requested/actual=${display(level.percentageRequestedHp.meanPerEntrant)}/${display(level.percentageActualHp.meanPerEntrant)}; additional flat requested/actual=${display(level.flatRequestedHp.meanPerEntrant)}/${display(level.flatActualHp.meanPerEntrant)}; full-invalid=${display(level.fullHpInvalidCount.total)}/${rateDisplay(level.fullHpInvalidRate)}; cumulative additional percentage/flat=${display(level.cumulativePercentageRecovery.meanPerEntrant)}/${display(level.cumulativeFlatRecovery.meanPerEntrant)}; total recovery=${display(recovery.totalObservedRecoveryHp.meanPerEntrant)}`;
    };
    const snowballLine = aggregate => {
      const item = aggregate.snowball;
      return `combat=${display(item.combatCount.meanPerEntrant)}; rounds=${display(item.rounds.meanPerEntrant)}; enemy actions=${display(item.enemyActions.meanPerEntrant)}; EXP=${display(item.expGained.meanPerEntrant)}; level-ups=${display(item.levelUpCount.meanPerEntrant)}; B3/B4/B5 entry level=${display(item.b3EntryLevel.p50)}/${display(item.b4EntryLevel.p50)}/${display(item.b5EntryLevel.p50)}; percentage/flat extra HP=${display(item.percentageLevelUpRecoveryTotal.meanPerEntrant)}/${display(item.flatLevelUpRecoveryTotal.meanPerEntrant)}`;
    };
    const b5Line = armId => {
      const aggregate = report.arms[armId].overview;
      const boss = aggregate.b5.boss;
      const b5 = aggregate.b5;
      return `${armId}: flame=${aggregate.b5.flameTrap.triggerCount.total}; route=${boss.routeBossDetected.total}; actual arrival=${boss.actualBossEventArrival.total}; result events=${boss.bossCombatResultEventCount.total}; victory=${boss.victoryEventCount.total}; flee=${boss.fleeEventCount.total}; retry/revisit=${boss.retryRevisit.total}; death=${boss.deathEventCount.total}; town-portal before boss=${b5.townPortalReturnBeforeBoss.count}; town-portal after boss attempt=${b5.townPortalReturnAfterBossAttemptBeforeB6.count}; milestone Portal return=${b5.milestonePortalReturnAfterGuardian.count}; B6=${b5.b6Transition.count}`;
    };
    const lines = [
      "# First Band level-up recovery",
      "",
      `- measurement: ${LEVEL_UP_MEASUREMENT_ID}; N=${report.configuration.runs}/kit/arm; seed=${report.configuration.seed}; workshop=${report.configuration.workshop}`,
      "- Standard Preparation fixed: kit-default weapon; TOWN_PORTAL ×1; HEAL_POTION ×4; ANTIDOTE ×1; GUARD_POTION ×1; floor transition recovery=25%",
      `- exact level-up rates: ${JSON.stringify(report.configuration.levelUpRecoveryRates)}; flat HP: ${JSON.stringify(report.configuration.levelUpRecoveryFlatHp)}; transition rates: ${JSON.stringify(report.configuration.transitionRecoveryRates)}; adaptive=${report.configuration.adaptivePolicy}; fixed=${report.configuration.fixedPolicy}`,
      "",
      "## Level progression and recovery",
      "",
      ...report.configuration.arms.flatMap(armId => KIT_IDS.map(kitId => {
        const aggregate = report.arms[armId].byKit[kitId].aggregate;
        return `- ${armId}/${kitId}: ${[1, 2, 3, 4, 5].map(floor => levelLine(aggregate, floor)).join("; ")}`;
      })),
      "",
      "## Potion replacement and snowball proxy",
      "",
      ...report.configuration.arms.map(armId => `- ${armId}: ${snowballLine(report.arms[armId].overview)}; production fixed +5 extra HP B3/B4/B5=${[3, 4, 5].map(floor => display(report.arms[armId].overview.recovery[floor].productionExtraLevelUpRecoveryHp.meanPerEntrant)).join("/")}; additional percentage/flat B3/B4/B5=${[3, 4, 5].map(floor => `${display(report.arms[armId].overview.recovery[floor].percentageExtraLevelUpRecoveryHp.meanPerEntrant)}/${display(report.arms[armId].overview.recovery[floor].flatExtraLevelUpRecoveryHp.meanPerEntrant)}`).join("/")}; Potion used B3/B4/B5=${[3, 4, 5].map(floor => display(report.arms[armId].overview.recovery[floor].potionUsed.meanPerEntrant)).join("/")}`),
      "",
      "## Build checkpoints",
      "",
      ...report.configuration.arms.flatMap(armId => KIT_IDS.map(kitId => {
        const aggregate = report.arms[armId].byKit[kitId].aggregate;
        return `- ${armId}/${kitId}: ${[2, 3, 4, 5].map(floor => `B${floor} changed=${rateDisplay(aggregate.buildCheckpoints[floor].changedFromDeparture.rate)}; swap p50=${display(aggregate.buildCheckpoints[floor].equipmentSwapCount.p50)}; identity=${aggregate.buildCheckpoints[floor].structuralBuildIdentity.uniqueCount}`).join("; ")}`;
      })),
      "",
      "## B5 guardian decomposition",
      "",
      ...report.configuration.arms.map(b5Line),
      "",
      "## Comparisons",
      "",
      ...report.primaryComparisons.map(item => `- ${item.label}: ${comparisonLine(item)}`),
      `- bridge parity F0A/L0A, P20A/L20A, R25A/F0A, flat omitted/0: ${report.baselineParity?.pass ? "PASS" : "FAIL"}`,
      "",
      `- determinism: ${report.determinism.pass ? "PASS" : "FAIL"}; observation invariance: ${report.observationInvariance.pass ? "PASS" : "FAIL"}`,
      "- production fixed +5 level-up recovery is applied by production reward resolution; rate/flat fields are additional counterfactuals applied after that path and before post-combat Potion decision; farming incentive is not proven by this non-farming simulator.",
      "- no production src/ balance change; raw run records omitted; configured runs and successful completion are reported above."
    ];
    return `${lines.join("\n")}\n`;
  }
  if (report.configuration.measurementId === TRANSITION_MEASUREMENT_ID) {
    const display = value => value == null ? "unobserved" : value;
    const rateDisplay = value => value == null ? "unobserved" : `${Math.round(value * 100)}%`;
    const comparisonLine = item => [
      `B3/B4/B5/B6 ${["b3", "b4", "b5", "b6"].map(key => display(item.delta[key])).join("/")}`,
      `death/Return ${display(item.delta.death)}/${display(item.delta.voluntaryReturn)}`,
      `boss arrival/start/victory ${["bossActualArrival", "bossStart", "bossVictory"].map(key => display(item.delta[key])).join("/")}`,
      `B5→B6 ${display(item.delta.b5ToB6)}`
    ].join("; ");
    const transitionLine = (aggregate, toFloor) => {
      const item = aggregate.transitionRecovery[toFloor];
      return `B${toFloor - 1}→B${toFloor} N=${item.entrantN}; before p50=${display(item.hpBefore.p50)}; after p50=${display(item.hpAfter.p50)}; healed p50=${display(item.actualHealedHp.p50)}; rate p50=${rateDisplay(item.actualHealedRate.p50)}; cap=${item.capAtFull.count}/${rateDisplay(item.capAtFull.rate)}`;
    };
    const lines = [
      "# First Band transition recovery",
      "",
      `- measurement: ${TRANSITION_MEASUREMENT_ID}; N=${report.configuration.runs}/kit/arm; seed=${report.configuration.seed}; workshop=${report.configuration.workshop}`,
      "- Standard Preparation fixed: kit-default weapon; TOWN_PORTAL ×1; HEAL_POTION ×4; ANTIDOTE ×1; GUARD_POTION ×1; workshop-complete",
      `- exact rates: ${JSON.stringify(report.configuration.transitionRecoveryRates)}; adaptive=${report.configuration.adaptivePolicy}; fixed=${report.configuration.fixedPolicy}`,
      "",
      "## Transition recovery",
      "",
      ...report.configuration.arms.flatMap(armId => [
        `### ${armId}`,
        ...KIT_IDS.map(kitId => {
          const aggregate = report.arms[armId].byKit[kitId].aggregate;
          return `- ${kitId}: ${[2, 3, 4, 5, 6].map(toFloor => transitionLine(aggregate, toFloor)).join("; ")}`;
        })
      ]),
      "",
      "## Potion and entry recovery",
      "",
      ...report.configuration.arms.flatMap(armId => KIT_IDS.map(kitId => {
        const aggregate = report.arms[armId].byKit[kitId].aggregate;
        return `- ${armId}/${kitId}: ${[1, 2, 3, 4, 5].map(floor => {
          const item = aggregate.recovery[floor];
          return `B${floor} entry=${display(item.entryHealPotionRemaining.p50)}; potion used=${display(item.potionUsed.meanPerEntrant)}; potion HP=${display(item.potionRecoveryHp.meanPerEntrant)}; transition HP=${display(item.floorTransitionRecoveryHp.meanPerEntrant)}`;
        }).join("; ")}`;
      })),
      "",
      "## Build checkpoints",
      "",
      ...report.configuration.arms.flatMap(armId => KIT_IDS.map(kitId => {
        const aggregate = report.arms[armId].byKit[kitId].aggregate;
        return `- ${armId}/${kitId}: ${[2, 3, 4, 5].map(floor => `B${floor} changed=${rateDisplay(aggregate.buildCheckpoints[floor].changedFromDeparture.rate)}; swap p50=${display(aggregate.buildCheckpoints[floor].equipmentSwapCount.p50)}; identity=${aggregate.buildCheckpoints[floor].structuralBuildIdentity.uniqueCount}`).join("; ")}`;
      })),
      "",
      "## B5 guardian decomposition",
      "",
      ...report.configuration.arms.map(armId => {
        const boss = report.arms[armId].overview.b5.boss;
        const b5 = report.arms[armId].overview.b5;
        return `- ${armId}: flame trigger=${report.arms[armId].overview.b5.flameTrap.triggerCount.total}; flame HP=${report.arms[armId].overview.b5.flameTrap.hpDamage.total}; route=${boss.routeBossDetected.total}; actual arrival=${boss.actualBossEventArrival.total}; result events=${boss.bossCombatResultEventCount.total}; victory=${boss.victoryEventCount.total}; flee=${boss.fleeEventCount.total}; retry/revisit=${boss.retryRevisit.total}; death=${boss.deathEventCount.total}; town-portal before boss=${b5.townPortalReturnBeforeBoss.count}; town-portal after boss attempt=${b5.townPortalReturnAfterBossAttemptBeforeB6.count}; milestone Portal return=${b5.milestonePortalReturnAfterGuardian.count}; B6=${b5.b6Transition.count}`;
      }),
      "",
      "## Comparisons",
      "",
      ...report.primaryComparisons.map(item => `- ${item.label}: ${comparisonLine(item)}`),
      `- R25 parity: ${report.baselineParity?.pass ? "PASS" : "FAIL"} (${report.baselineParity?.semantics || "unobserved"})`,
      "",
      `- determinism: ${report.determinism.pass ? "PASS" : "FAIL"}; observation invariance: ${report.observationInvariance.pass ? "PASS" : "FAIL"}`,
      "- transition recovery and Potion recovery are separate fields; no production src/ balance change; configured runs and successful completion are reported above."
    ];
    return `${lines.join("\n")}\n`;
  }
  const display = value => value == null ? "unobserved" : value;
  const rateDisplay = value => value == null ? "unobserved" : `${Math.round(value * 100)}%`;
  const preparationLines = ["P0B1", "P1B1"].flatMap(armId => KIT_IDS.map(kitId => {
    const preparation = report.arms[armId].byKit[kitId].preparation;
    return `- ${armId}: ${kitId} expected/actual ${preparation.expectedStartingWeapon}/${preparation.startingWeapon}; ATK ${display(preparation.weaponAtk)}; hands ${display(preparation.weaponHands)}; load ${display(preparation.equipmentLoad?.class)}; Medium ${display(preparation.medium)}; Rune ${display(preparation.runeSlots)}/${preparation.activeRunes.join(",") || "none"}; MP ${display(preparation.startingMp)}/${display(preparation.maxMp)}`;
  }));
  const formationLines = ARM_IDS.flatMap(armId => KIT_IDS.map(kitId => {
    const aggregate = report.arms[armId].byKit[kitId].aggregate;
    const checkpoints = [2, 3, 4, 5].map(floor => {
      const checkpoint = aggregate.buildCheckpoints[floor];
      return `B${floor} ${rateDisplay(checkpoint.changedFromDeparture.rate)}/${display(checkpoint.equipmentSwapCount.p50)}`;
    }).join("; ");
    const reach = [2, 3, 4, 5, 6].map(floor => `${aggregate.reach[floor].count}/${rateDisplay(aggregate.reach[floor].rate)}`).join("/");
    return `- ${armId}/${kitId}: ${checkpoints}; reach ${reach}`;
  }));
  const comparisonLine = item => [
    `B3/B4/B5/B6 ${["b3", "b4", "b5", "b6"].map(key => display(item.delta[key])).join("/")}`,
    `death/Return ${display(item.delta.death)}/${display(item.delta.voluntaryReturn)}`,
    `boss arrival/start/victory ${["bossActualArrival", "bossStart", "bossVictory"].map(key => display(item.delta[key])).join("/")}`,
    `B5→B6 ${display(item.delta.b5ToB6)}`
  ].join("; ");
  const [p0Build, p1Build, p1Preparation, p0Preparation] = report.primaryComparisons;
  const lines = [
    "# First Band formation",
    "",
    `- measurement: ${MEASUREMENT_ID}; N=${report.configuration.runs}/kit/arm; seed=${report.configuration.seed}; workshop=${report.configuration.workshop}`,
    `- production path: ${report.configuration.productionPath}; adaptive=${report.configuration.adaptivePolicy}; fixed=${report.configuration.fixedPolicy}`,
    "",
    "## First Band formation",
    "",
    "compact cell = changed-from-departure rate / equipment-swap p50",
    ...formationLines,
    "",
    "## Preparation provenance",
    "",
    "P0/P1 provenance is shared by B0/B1; expected P1 weapon is independently derived from workshop grants + item data.",
    ...preparationLines,
    "",
    "## Build usefulness",
    "",
    "Build identity distributions are structural only: weapon identity/behavior, Guard, Medium, Rune slots/active Runes, Core and Support axes. HP, MP, bag, floor, and starting-kit are excluded.",
    `- P0B1 - P0B0: ${comparisonLine(p0Build)}`,
    `- P1B1 - P1B0: ${comparisonLine(p1Build)}`,
    "",
    "## Preparation interaction",
    "",
    `- P1B1 - P0B1: ${comparisonLine(p1Preparation)}`,
    `- P1B0 - P0B0: ${comparisonLine(p0Preparation)}`,
    "",
    "## B5 flame trap",
    "",
    ...ARM_IDS.map(armId => `- ${armId}: entrants=${report.arms[armId].overview.b5.entrantN}; trigger=${report.arms[armId].overview.b5.flameTrap.triggerCount.total}; HP damage p50=${report.arms[armId].overview.b5.flameTrap.hpDamage.p50 ?? "unobserved"}; schedule approximate`),
    "",
    "## B5 guardian",
    "",
    ...ARM_IDS.map(armId => {
      const boss = report.arms[armId].overview.b5.boss;
      const b5 = report.arms[armId].overview.b5;
      return `- ${armId}: route detected=${boss.routeBossDetected.total}; actual arrival=${boss.actualBossEventArrival.total}; combat start=${boss.combatStart.total}; result events=${boss.bossCombatResultEventCount.total}; victory=${boss.victoryEventCount.total}; flee=${boss.fleeEventCount.total}; retry/revisit=${boss.retryRevisit.total}; death=${boss.deathEventCount.total}; town-portal before boss=${b5.townPortalReturnBeforeBoss.count}; town-portal after boss attempt=${b5.townPortalReturnAfterBossAttemptBeforeB6.count}; milestone Portal return after guardian=${b5.milestonePortalReturnAfterGuardian.count}; B6=${b5.b6Transition.count}`;
    }),
    "",
    "## B5→B6",
    "",
    ...ARM_IDS.map(armId => `- ${armId}: ${JSON.stringify(report.arms[armId].overview.b5.b6Transition)}`),
    "",
    `- determinism: ${report.determinism.pass ? "PASS" : "FAIL"}; observation invariance: ${report.observationInvariance.pass ? "PASS" : "FAIL"}`,
    "- enemyActions uses authoritative encounter telemetry with collectEncounterIdentities=true; raw encounter identities omitted.",
    "- B5 flame trap uses the production effect; step scheduling is an explicit approximation.",
    "- No scalar Build Power or production src/ balance change; configured runs and successful completion are reported above."
  ];
  return `${lines.join("\n")}\n`;
}

function buildManifest(report, runType = "diagnostic") {
  return {
    schemaVersion: report.schemaVersion,
    measurementId: report.measurement.measurementId,
    runner: report.runnerVersion,
    runType,
    status: "success",
    purpose: report.measurement.purpose,
    source: report.measurement,
    artifact: { files: ["measurement.json", "measurement.md", "manifest.json"] },
    provenance: report.measurement
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const runs = Number(options.runs || DEFAULT_RUNS);
    const seed = Number(options.seed || DEFAULT_SEED);
    if (!options.output || !options.summary || !options.manifest) {
      throw new Error("--output, --summary, and --manifest are required");
    }
    const config = { runs, seed, calibrationRuns: STANDARD_BALANCE_CONFIG.calibrationRuns };
    applyStandardSimulationEnv(config);
    const provenance = requireRunnerProvenance({ fetchOriginMain: false, measurementRunnerPaths: [...PRODUCTION_PATHS] });
    const mode = options.mode || "build-formation";
    const modeDefinition = getMeasurementMode(mode);
    const environment = { ...getStandardSimulationEnv(config), runnerVersion: modeDefinition.runnerVersion };
    printEnvSignatureBanner(environment, { label: "first-band-build-formation env" });
    const result = await runMeasurement({ runs, seed, mode });
    const report = buildReport(result, provenance, options.purpose || null, options.ref || process.env.MEASUREMENT_REQUESTED_REF || null, environment);
    fs.writeFileSync(resolve(options.output), `${JSON.stringify(report)}\n`);
    fs.writeFileSync(resolve(options.summary), buildSummary(report));
    fs.writeFileSync(resolve(options.manifest), `${JSON.stringify(buildManifest(report, process.env.MEASUREMENT_RUN_TYPE || "diagnostic"), null, 2)}\n`);
    console.log(`Wrote ${result.runnerVersion}: ${resolve(options.output)}`);
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}
