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
export const ARCANA_KIT_IDS = Object.freeze(["arcana"]);

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
  "scratch/measurements/early_run_attrition_trajectory.js",
  "scratch/measurements/first_band_build_formation.js",
  "scratch/measurements/preparation_power_factorial.js",
  "scratch/measurements/build_progression_audit.js",
  "src/state/initial_state.js",
  "src/systems/workshop.js",
  "src/rules/craft_rules.js",
  "src/rules/build_snapshot.js",
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

function recipesFor(healPotions) {
  return [
    RECIPE_IDS.portal,
    ...Array(healPotions).fill(RECIPE_IDS.heal),
    RECIPE_IDS.antidote,
    RECIPE_IDS.guard
  ];
}

function deriveBank(recipeIds) {
  const payment = getDepartureCraftCost(recipeIds);
  const bank = Object.fromEntries(MATERIAL_TYPES.map(material => [material, payment.typed[material] || 0]));
  if (payment.any > 0) bank[MATERIAL_TYPES[0]] += payment.any;
  return { bank };
}

function preparationSpec(arm) {
  const recipeIds = recipesFor(arm.healPotions);
  const { bank } = deriveBank(recipesFor(12));
  const expectedCost = purchaseDepartureCraft(bank, recipeIds);
  if (!expectedCost?.ok) throw new Error("production departure craft bank derivation failed");
  return {
    id: arm.preparationId,
    startingWeaponMode: arm.preparationId === "P0" ? "kit-default" : "canonical-workshop-auto-best",
    healPotions: arm.healPotions,
    recipeIds,
    materials: { ...bank },
    expectedPayment: { ...expectedCost.cost }
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
    supplies: { TOWN_PORTAL: 1, HEAL_POTION: arm.healPotions, ANTIDOTE: 1, GUARD_POTION: 1 },
    departureCraft: {
      recipeIds: [...(result.departureCraft?.recipeIds || [])],
      payment,
      expectedPayment: { ...expectedPayment },
      purchaseSource: result.departureCraft?.purchaseSource || null,
      initialBank: { ...initialBank },
      postPurchaseBank
    },
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

export function normalizeB5(result, record) {
  const entrant = Boolean(result.b5Entrant);
  if (!entrant) return { status: "unreachable" };
  const route = (result.specialRouteFloors || []).find(item => Number(item.floor) === 5);
  const bossBattle = (result.specialBattles || []).find(item => item.type === "boss" && Number(item.floor) === 5);
  const bossEncounter = (result.diagnostics?.encounters || []).find(item =>
    Number(item.floor) === 5 && item.type === "boss"
  );
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
    b6Transition: reachedB6
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
  record.b5 = normalizeB5(result, record);
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
        mpStart: metric(values(item => item.incrementalCost.mpStart)),
        mpSpent: metric(values(item => item.incrementalCost.combatMpSpent)),
        mpEnd: metric(values(item => item.incrementalCost.mpEnd)),
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
    b6Transition: { count: count(item => item.b6Transition), rate: rate(count(item => item.b6Transition), entrants.length) }
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
  if (actual.departureCraft.purchaseSource !== "actual-meta-bank") {
    throw new Error(`${arm.id}/${kitId}: departure craft did not use actual payment path`);
  }
  if (actual.departureCraft.recipeIds.length !== arm.healPotions + 3 || actual.startingBagUsed > 20 || actual.startingBagFree < 0) {
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
  applyStandardSimulationEnv({ ...STANDARD_BALANCE_CONFIG, seed, runs });
  const {
    simulateRun,
    getScenarioById,
    getArcanaWeaponScoreAudit,
    resetSimulationRandom
  } = await import("../simulations/sim_depth_material_ev.js");
  const baseScenario = getScenarioById(WORKSHOP_SCENARIO_ID);
  const preparations = Object.fromEntries(modeDefinition.preparationPotions.map(healPotions => {
    const arm = { preparationId: healPotions === 4 ? "P0" : "P1", healPotions };
    return [arm.preparationId, preparationSpec(arm)];
  }));
  const runOne = ({
    arm,
    kitId,
    runIndex,
    audit = true,
    samples,
    includeTransitionRecoveryRate = true,
    includeLevelUpRecoveryRate = true,
    includeLevelUpRecoveryFlatHp = true
  }) => {
    const prep = preparations[arm.preparationId];
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
      simDiagnosticLevel: "full"
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
      const invariant = compareObservationInvariance(projectGameplayRecord(auditOff), projectGameplayRecord(auditOn));
      observationInvariance[key] = invariant;
      if (!invariant.pass) throw new Error(`observation invariance failed: ${key}`);
    }
  }

  const armReports = {};
  for (const armId of modeDefinition.armIds) {
    const arm = modeDefinition.armDefinitions[armId];
    const byKit = {};
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
    }
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
    const preparation = preparations[arm.preparationId];
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
        semantics: arm.fixed ? "fixed equipment diagnostic intervention" : "adaptive canonical simulation equipment-update policy",
        requestedPolicy: arm.fixed ? "fixed" : CANONICAL_ADAPTIVE_POLICY_ID,
        effectivePolicyIds: [...new Set(allRows.map(row => row.build.equipmentUpdatePolicy))]
      },
      byKit,
      overview,
      overviewReconciliation,
      samples: { runs: armRunSamples.finalize(), candidates: armCandidateSamples.finalize() },
      smoke: { runsPerKit: runs, kitCount: modeDefinition.kitIds.length, totalRuns: allRows.length }
    };
  }

  const overview = Object.fromEntries(modeDefinition.armIds.map(id => [id, armReports[id].overview]));
  const comparisons = mode === ARCANA_WEAPON_MODE
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
      : null,
    worldSeedTemplate: "run-difficulty:{seed}:{runIndex}",
    identityBoundary: "HP/MP/bag/floor/starting-kit excluded from Build Snapshot identity",
    artifactPolicy: {
      fullRunRecords: "omitted",
      representativeRunsPerArm: RUN_SAMPLE_LIMIT,
      buildIdentitySamplesPerArm: BUILD_IDENTITY_SAMPLE_LIMIT,
      candidateSamplesPerArm: CANDIDATE_SAMPLE_LIMIT,
      rawEncounterIdentities: "omitted"
    },
    comparisonSemantics: mode === ARCANA_WEAPON_MODE
      ? "Cross-arm C/W/R treatment comparisons use matched initial conditions; no post-divergence same-seed path/encounter/loot/trap parity claim"
      : "Only within-arm treatment deltas are decision comparisons; no post-divergence same-seed path/encounter/loot/trap parity claim",
    armSemantics: mode === ARCANA_WEAPON_MODE
      ? {
          C: "Arcana Standard Preparation WAND + HALITO; canonical adaptive; weapon swappable",
          W: "Arcana Standard Preparation WAND + HALITO; weapon slot locked; other slots adaptive",
          R: "Arcana Standard Preparation RAPIER; no Medium/Rune; weapon slot locked; other slots adaptive"
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
    baselineParity
  };
  if (mode === ARCANA_WEAPON_MODE) {
    const sanityBase = {
      ...baseScenario,
      startingKit: "arcana",
      startingHealPotions: 0,
      startingAntidotes: 0,
      startingGuardPotions: 0,
      startingTownPortals: 0,
      departureCraft: [...preparations.P0.recipeIds],
      departureCraftMaterialsAreActualBank: true,
      departureCraftMaterials: { ...preparations.P0.materials },
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
      `- determinism=${report.determinism.pass}; observation invariance=${report.observationInvariance.pass}; production balance change=false; Heavy N=500/arm not run.`,
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
      "- no production src/ balance change; raw run records omitted; heavy N=500 is not run by pre-PR smoke."
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
      "- transition recovery and Potion recovery are separate fields; no production src/ balance change; heavy N=1000 is not run by pre-PR smoke."
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
    "- No scalar Build Power or production src/ balance change; N=1000 heavy is not run by pre-PR smoke."
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
