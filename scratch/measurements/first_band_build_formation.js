// sim-scope: run — production-backed First Band Build Formation diagnostic
/* global console, process */

import "../simulations/simulation_preflight.js";
import fs from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { STARTING_KITS } from "../../src/state/initial_state.js";
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
export const KIT_IDS = Object.freeze(STARTING_KITS.map(kit => kit.id));
export const ARM_IDS = Object.freeze(["P0B1", "P0B0", "P1B1", "P1B0"]);
export const CHECKPOINTS = Object.freeze([2, 3, 4, 5]);
export const RUN_SAMPLE_LIMIT = 8;
export const BUILD_IDENTITY_SAMPLE_LIMIT = 32;
export const BUILD_IDENTITY_SAMPLE_PER_KIT_LIMIT = 8;
export const CANDIDATE_SAMPLE_LIMIT = 128;
export const WORKSHOP_SCENARIO_ID = "workshop-complete";
export const CANONICAL_ADAPTIVE_POLICY_ID = CANONICAL_EQUIPMENT_UPDATE_POLICY_ID;

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
  record.loot = {
    acquired: finite(lifecycle.found),
    bagged: finite(lifecycle.bagged),
    inventoryRejections: { ...(result.pickupRejectionsByCategory || {}) },
    bagOccupancyAtEnd: finite(result.finalInventorySlots),
    equipmentLootAcquired: finite(result.equipmentFound)
  };
  record.b5 = normalizeB5(result, record);
  checkEnemyActions(record);
  return record;
}

function buildCheckpoints(rows, floor) {
  const observed = rows.map(row => row.buildCheckpoints?.[`B${floor}Entry`])
    .filter(checkpoint => checkpoint?.status === "observed" && checkpoint.build);
  const identities = observed.map(item => item.build.identity);
  const swaps = observed.map(item => item.maturity.cumulativeEquipmentSwaps);
  const changed = observed.filter(item => item.maturity.buildIdentityChanged).length;
  const structural = observed.map(item => structuralBuild(item.build));
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
    b5: summarizeB5(rows),
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
    ? DEFAULT_WEAPON_BY_KIT[kitId]
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

export async function runMeasurement({ runs = DEFAULT_RUNS, seed = DEFAULT_SEED } = {}) {
  if (!Number.isInteger(runs) || runs < 1) throw new Error(`runs must be a positive integer: ${runs}`);
  if (!Number.isInteger(seed) || seed < 1) throw new Error(`seed must be a positive integer: ${seed}`);
  applyStandardSimulationEnv({ ...STANDARD_BALANCE_CONFIG, seed, runs });
  const { simulateRun, getScenarioById, resetSimulationRandom } = await import("../simulations/sim_depth_material_ev.js");
  const baseScenario = getScenarioById(WORKSHOP_SCENARIO_ID);
  const preparations = Object.fromEntries([4, 12].map(healPotions => {
    const arm = { preparationId: healPotions === 4 ? "P0" : "P1", healPotions };
    return [arm.preparationId, preparationSpec(arm)];
  }));
  const runOne = ({ arm, kitId, runIndex, audit = true, samples }) => {
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
      collectEncounterIdentities: true,
      collectStage15Diagnostics: true,
      simDiagnosticLevel: "full"
    };
    if (arm.preparationId === "P0") scenario.startingGearChoice = DEFAULT_WEAPON_BY_KIT[kitId];
    const raw = simulateRun({
      className: "Fighter",
      startFloor: 1,
      targetDepth: TARGET_DEPTH,
      runIndex,
      seriesId: `${MEASUREMENT_ID}:${arm.id}:${kitId}`,
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
      candidateSampleCollector: samples?.candidate
    });
    const expectedWeapon = arm.preparationId === "P0"
      ? DEFAULT_WEAPON_BY_KIT[kitId]
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
  for (const armId of ARM_IDS) {
    const arm = ARM_DEFINITIONS[armId];
    for (const kitId of KIT_IDS) {
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
  for (const armId of ARM_IDS) {
    const arm = ARM_DEFINITIONS[armId];
    const byKit = {};
    const allRows = [];
    const armRunSamples = createRunEvidenceSampleCollector(RUN_SAMPLE_LIMIT);
    const armCandidateSamples = createCandidateAuditSampleCollector(CANDIDATE_SAMPLE_LIMIT);
    for (const kitId of KIT_IDS) {
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
      smoke: { runsPerKit: runs, kitCount: KIT_IDS.length, totalRuns: allRows.length }
    };
  }

  const overview = Object.fromEntries(ARM_IDS.map(id => [id, armReports[id].overview]));
  const comparisons = [
    comparison(overview.P0B0, overview.P0B1, "P0B1 - P0B0: Standard Prep Build contribution"),
    comparison(overview.P1B0, overview.P1B1, "P1B1 - P1B0: Strong Prep residual Build contribution"),
    comparison(overview.P0B1, overview.P1B1, "P1B1 - P0B1: Preparation effect under adaptive Build"),
    comparison(overview.P0B0, overview.P1B0, "P1B0 - P0B0: Preparation effect with fixed Build")
  ];
  const configuration = {
    measurementId: MEASUREMENT_ID,
    runs,
    seed,
    startingKits: [...KIT_IDS],
    arms: [...ARM_IDS],
    workshop: WORKSHOP_SCENARIO_ID,
    targetDepth: TARGET_DEPTH,
    checkpoints: CHECKPOINTS.map(floor => `B${floor}Entry`),
    sourceOfTruth: "production simulateRun()",
    productionPath: "scratch/simulations/sim_depth_material_ev.js",
    adaptivePolicy: CANONICAL_ADAPTIVE_POLICY_ID,
    fixedPolicy: "fixed",
    worldSeedTemplate: "run-difficulty:{seed}:{runIndex}",
    identityBoundary: "HP/MP/bag/floor/starting-kit excluded from Build Snapshot identity",
    artifactPolicy: {
      fullRunRecords: "omitted",
      representativeRunsPerArm: RUN_SAMPLE_LIMIT,
      buildIdentitySamplesPerArm: BUILD_IDENTITY_SAMPLE_LIMIT,
      candidateSamplesPerArm: CANDIDATE_SAMPLE_LIMIT,
      rawEncounterIdentities: "omitted"
    },
    comparisonSemantics: "Only within-arm treatment deltas are decision comparisons; no post-divergence same-seed path/encounter/loot/trap parity claim"
  };
  return {
    schemaVersion: SCHEMA_VERSION,
    runnerVersion: RUNNER_VERSION,
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
    }
  };
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
      measurementId: MEASUREMENT_ID,
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
    measurementId: MEASUREMENT_ID,
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
    const environment = { ...getStandardSimulationEnv(config), runnerVersion: RUNNER_VERSION };
    printEnvSignatureBanner(environment, { label: "first-band-build-formation env" });
    const result = await runMeasurement({ runs, seed });
    const report = buildReport(result, provenance, options.purpose || null, options.ref || process.env.MEASUREMENT_REQUESTED_REF || null, environment);
    fs.writeFileSync(resolve(options.output), `${JSON.stringify(report)}\n`);
    fs.writeFileSync(resolve(options.summary), buildSummary(report));
    fs.writeFileSync(resolve(options.manifest), `${JSON.stringify(buildManifest(report, process.env.MEASUREMENT_RUN_TYPE || "diagnostic"), null, 2)}\n`);
    console.log(`Wrote ${RUNNER_VERSION}: ${resolve(options.output)}`);
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}
