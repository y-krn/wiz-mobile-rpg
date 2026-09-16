// sim-scope: run — production-backed B1-B5 linked attrition trajectory diagnostic
/* global process */

import { STARTING_KITS } from "../../src/state/initial_state.js";
import {
  STANDARD_BALANCE_CONFIG,
  applyStandardSimulationEnv,
  getStandardSimulationEnv,
  hashConfiguration,
  rateMetric
} from "./balance_measurement.js";
import { printEnvSignatureBanner } from "./measurement_env_signature.js";
import { mergeFleeTelemetry, summarizeFleeTelemetry } from "./flee_telemetry.js";
import {
  EXPLORATION_SUPPORT_IDS,
  REJECTION_REASON_IDS,
  SIDEGRADE_CLASSIFICATIONS,
  summarizeExplorationCandidateActivity,
  summarizeRejectedCandidateCrossTab as summarizeRejectedCandidateCrossTabForRun
} from "./build_progression_audit.js";

export const RUNNER_VERSION = "early-run-attrition-trajectory-v4";
export const SCHEMA_VERSION = 3;
export const DEFAULT_RUNS = 1000;
export const DEFAULT_SEED = 1277;
export const TRAJECTORY_FLOORS = Object.freeze([1, 2, 3, 4, 5]);
export const MEASUREMENT_CUTOFF_FLOOR = 6;
export const STARTING_KIT_IDS = Object.freeze(STARTING_KITS.map(kit => kit.id));
export const CANDIDATE_AUDIT_SAMPLE_LIMIT = 128;
export const CANDIDATE_AUDIT_SAMPLE_POLICY = Object.freeze(
  "first-N candidate events in deterministic condition/runIndex/audit order"
);
export const RUN_EVIDENCE_SAMPLE_LIMIT = 8;
export const RUN_EVIDENCE_SAMPLE_POLICY = Object.freeze(
  "first-N compact run records in deterministic condition/runIndex order"
);
export const RETURN_CONTINUATION_SAMPLE_LIMIT = 8;
export const RETURN_CONTINUATION_SAMPLE_POLICY = Object.freeze(
  "first-N matched T0 Return continuation rows in deterministic runIndex order"
);
export const WORKSHOP_SCENARIO_IDS = Object.freeze([
  "workshop-empty",
  "workshop-complete"
]);
export const TRAJECTORY_POLICIES = Object.freeze({
  t0: Object.freeze({
    id: "t0",
    portalPolicyId: "p0",
    portalHpThreshold: 0.35,
    label: "canonical",
    description: "current P0 semantics; Portal HP-threshold auto-Return at 35%"
  }),
  t1: Object.freeze({
    id: "t1",
    portalPolicyId: "p2",
    portalHpThreshold: null,
    label: "push probe",
    description: "P2 semantics; HP-threshold auto-Return disabled only"
  })
});
export const B2_CHEST_TRAP_POLICIES = Object.freeze({
  t0: Object.freeze({
    ...TRAJECTORY_POLICIES.t0,
    label: "current production",
    description: "current production; B2 chest-trap Cost applies"
  }),
  t1: Object.freeze({
    ...TRAJECTORY_POLICIES.t0,
    id: "t1",
    label: "B2 chest-trap Cost suppressed",
    description: "diagnostic override suppresses B2 chest-trap HP/status Cost only",
    chestTrapCostSuppressionFloor: 2
  })
});
export const MEASUREMENT_TREATMENTS = Object.freeze({
  "portal-policy": Object.freeze({
    id: "portal-policy",
    policies: TRAJECTORY_POLICIES,
    description: "Portal HP-threshold policy comparison"
  }),
  "b2-chest-trap": Object.freeze({
    id: "b2-chest-trap",
    policies: B2_CHEST_TRAP_POLICIES,
    description: "matched B2 chest-trap Cost suppression"
  })
});
export const MEASUREMENT_RUNNER_PATHS = Object.freeze([
  "scratch/measurements/early_run_attrition_trajectory.js",
  "scratch/measurements/measure_early_run_attrition_trajectory.js",
  "scratch/simulations/sim_depth_material_ev.js",
  "scratch/measurements/balance_measurement.js",
  "scratch/measurements/measurement_provenance.js",
  "scratch/measurements/measurement_env_signature.js",
  "scratch/measurements/flee_telemetry.js",
  "src/state/initial_state.js",
  "src/rules/build_snapshot.js",
  "scratch/measurements/build_progression_audit.js",
  "src/rules/chest_rules.js",
  "src/rules/trap_rules.js",
  "src/rules/trap_effect_rules.js",
  "src/run_map_generator.js",
  "src/combat_logic/round.js",
  "src/combat_logic/damage.js",
  "src/combat_logic/status_effects.js"
]);

const COST_SOURCE_IDS = Object.freeze([
  "combat",
  "guardianBoss",
  "floorTrap",
  "chestTrap",
  "poisonStatus",
  "unattributed"
]);
const UNOBSERVED_FIELDS = Object.freeze([
  "enemy-inflicted poison/status damage can be inseparable from combat damage",
  "merchant recovery acquisition is not present in diagnostic rewardEvents",
  "unidentified held candidates have no true-feature delta until production identification permits evaluation",
  "loot reward events and equipment candidate audits have no stable cross-link; Rune supply to equipment evaluation conversion is unobserved"
]);

function integer(value, label, minimum = 1) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum) {
    throw new Error(`${label} must be an integer >= ${minimum}: ${value}`);
  }
  return parsed;
}

function finite(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function quantiles(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) {
    return { n: 0, p10: null, p25: null, p50: null, p75: null, p90: null };
  }
  const at = probability => {
    const position = (sorted.length - 1) * probability;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    return lower === upper
      ? sorted[lower]
      : sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
  };
  return {
    n: sorted.length,
    p10: at(0.10),
    p25: at(0.25),
    p50: at(0.50),
    p75: at(0.75),
    p90: at(0.90)
  };
}

function countByItem(events, itemField = "itemId") {
  return events.reduce((counts, event) => {
    const item = event?.[itemField];
    if (item) counts[item] = (counts[item] || 0) + 1;
    return counts;
  }, {});
}

function sum(values) {
  return values.reduce((total, value) => total + (Number(value) || 0), 0);
}

function emptyCosts() {
  return Object.fromEntries(COST_SOURCE_IDS.map(source => [source, 0]));
}

function costSource(eventSource) {
  if (["normal", "elite"].includes(eventSource)) return "combat";
  if (["boss", "midboss"].includes(eventSource)) return "guardianBoss";
  if (["floor-trap", "flame-trap"].includes(eventSource)) return "floorTrap";
  if (["chest-trap", "secret-room-chest-trap", "from-drop-chest-trap"].includes(eventSource)) {
    return "chestTrap";
  }
  if (eventSource === "poison") return "poisonStatus";
  return "unattributed";
}

function compactCostEvent(event) {
  return {
    source: event.source || "unknown",
    type: event.type || null,
    floor: finite(event.floor),
    step: finite(event.step),
    hpCost: finite(event.hpCost)
  };
}

function groupCostEvents(events) {
  const byFloor = Object.fromEntries(TRAJECTORY_FLOORS.map(floor => [floor, []]));
  const totals = emptyCosts();
  (events || []).forEach(event => {
    const floor = Number(event.floor);
    if (!TRAJECTORY_FLOORS.includes(floor)) return;
    const amount = Math.max(0, Number(event.hpCost) || 0);
    const source = costSource(event.source);
    byFloor[floor].push({ ...compactCostEvent(event), sourceGroup: source });
    totals[source] += amount;
  });
  const incrementalByFloor = {};
  const cumulativeByFloor = {};
  const cumulative = emptyCosts();
  TRAJECTORY_FLOORS.forEach(floor => {
    const incremental = emptyCosts();
    byFloor[floor].forEach(event => {
      incremental[event.sourceGroup] += event.hpCost || 0;
    });
    incrementalByFloor[floor] = incremental;
    COST_SOURCE_IDS.forEach(source => {
      cumulative[source] += incremental[source];
    });
    cumulativeByFloor[floor] = { ...cumulative };
  });
  return { byFloor, incrementalByFloor, cumulativeByFloor, totals };
}

function compactBuildSnapshot(snapshot) {
  if (!snapshot) return null;
  const canonical = snapshot.canonicalBuildSnapshot || (
    snapshot.schemaVersion === 1 && snapshot.weaponProfile ? snapshot : null
  );
  return {
    identity: canonical?.identity || snapshot.identity || null,
    point: snapshot.point || null,
    floor: finite(snapshot.floor),
    level: finite(snapshot.level),
    hp: finite(snapshot.hp),
    maxHp: finite(snapshot.maxHp),
    mp: finite(snapshot.mp),
    maxMp: finite(snapshot.maxMp),
    atk: finite(snapshot.atk),
    def: finite(snapshot.def),
    spells: Array.isArray(snapshot.spells) ? [...snapshot.spells] : [],
    coreIds: Array.isArray(snapshot.coreIds) ? [...snapshot.coreIds] : [],
    combatCoreIds: Array.isArray(snapshot.combatCoreIds) ? [...snapshot.combatCoreIds] : [],
    supportAffixIds: Object.keys(snapshot.supportAffixes || {}).sort(),
    weaponProfile: canonical?.weaponProfile || null,
    weaponHands: canonical?.weaponHands ?? null,
    guardProfileId: canonical?.guardProfileId || null,
    mediumId: canonical?.mediumId || null,
    runeSlotCapacity: canonical?.runeSlotCapacity ?? null,
    activeRuneSpellIds: Array.isArray(canonical?.activeRuneSpellIds)
      ? [...canonical.activeRuneSpellIds]
      : [],
    mainCoreIds: Array.isArray(canonical?.mainCoreIds) ? [...canonical.mainCoreIds] : [],
    auxiliaryCoreIds: Array.isArray(canonical?.auxiliaryCoreIds)
      ? [...canonical.auxiliaryCoreIds]
      : [],
    supportValues: canonical?.supportValues ? { ...canonical.supportValues } : {},
    explorationSupportValues: canonical?.explorationSupportValues
      ? { ...canonical.explorationSupportValues }
      : {},
    effectiveAffixes: Object.fromEntries(
      Object.entries(snapshot.effectiveAffixes || {}).filter(([, value]) => Number(value) !== 0)
    ),
    equipment: Array.isArray(snapshot.equipment)
      ? snapshot.equipment.map(item => ({
          slot: item.slot || null,
          id: item.id || null,
          type: item.type || null,
          rarity: item.rarity || null
        }))
      : []
  };
}

function terminalKind(result) {
  if (result.outcome === "death") return "died";
  if (result.outcome === "retreat" && result.terminationReason === "target-depth") {
    return "syntheticCutoff";
  }
  if (result.outcome === "retreat" && result.terminationReason === "town-portal") {
    return "voluntaryReturn";
  }
  if (result.outcome === "retreat") return "otherTerminal";
  return "otherTerminal";
}

function floorTerminalKind(stage, result) {
  if (stage?.reachedNextFloor) return "reachedNextFloor";
  if (stage?.died) return "died";
  if (stage?.terminalReason === "town-portal") return "voluntaryReturn";
  if (stage?.terminal === "incomplete") return "otherTerminal";
  if (result.outcome === "death" && Number(stage?.floor) === Number(result.deathFloor)) return "died";
  return null;
}

function compactFloor(
  stage,
  result,
  groupedCosts,
  rewardEvents,
  recoveryEvents,
  encounters,
  diagnosticEncounters,
  candidateAuditSummary
) {
  if (!stage) return null;
  const floor = Number(stage.floor);
  const floorCosts = groupedCosts.incrementalByFloor[floor] || emptyCosts();
  const floorEncounters = encounters.filter(encounter => Number(encounter.floor) === floor);
  const floorDiagnosticEncounters = (diagnosticEncounters || []).filter(
    encounter => Number(encounter.floor) === floor
  );
  const flee = mergeFleeTelemetry(floorDiagnosticEncounters.map((diagnostic, index) =>
    summarizeFleeTelemetry({
      identity: floorEncounters[index],
      diagnostic
    })
  ));
  // An empty full-diagnostic floor is an observed zero, not missing telemetry.
  flee.observed = Array.isArray(diagnosticEncounters);
  const floorRewards = rewardEvents.filter(event => Number(event.floor) === floor);
  const floorRecovery = recoveryEvents.filter(event => Number(event.floor) === floor);
  const cumulative = groupedCosts.cumulativeByFloor[floor] || emptyCosts();
  const entry = {
    hp: finite(stage.entryHp),
    maxHp: finite(stage.entryMaxHp),
    hpRatio: finite(stage.entryHpRatio),
    mp: finite(stage.entryMp),
    maxMp: finite(stage.entryMaxMp),
    mpRatio: finite(stage.entryMpRatio),
    recoveryRemaining: finite(stage.entryRecoveryRemaining),
    cureItems: stage.entryCureItems ? { ...stage.entryCureItems } : null,
    status: stage.entryStatus || null,
    build: compactBuildSnapshot(stage.entryBuildSnapshot),
    cumulativeSteps: finite(stage.entryCumulativeSteps),
    cumulativeCombatCount: finite(stage.entryCumulativeCombatCount)
  };
  const exit = {
    hp: finite(stage.exitHp),
    maxHp: finite(stage.exitMaxHp),
    hpRatio: finite(stage.exitHpRatio),
    mp: finite(stage.exitMp),
    maxMp: finite(stage.exitMaxMp),
    mpRatio: finite(stage.exitMpRatio),
    recoveryRemaining: finite(stage.exitRecoveryRemaining),
    cureItems: stage.exitCureItems ? { ...stage.exitCureItems } : null,
    status: stage.exitStatus || null,
    build: compactBuildSnapshot(stage.exitBuildSnapshot),
    cumulativeSteps: finite(stage.exitCumulativeSteps),
    cumulativeCombatCount: finite(stage.exitCumulativeCombatCount)
  };
  const buildShiftCount = (result.equipmentTelemetry || []).filter(event =>
    Number(event.floor) === floor && event.type === "swap"
  ).length;
  const candidateActivity = candidateAuditSummary?.byFloor?.[String(floor)] || null;
  const loot = {
    opportunities: floorRewards.length,
    equipmentOpportunities: floorRewards.filter(event => event.category === "equipment").length,
    buildOpportunities: floorRewards.filter(event => ["equipment", "rune"].includes(event.category)).length
  };
  loot.supply = {
    observed: true,
    meaningfulOpportunities: floorRewards.filter(event => event.meaningful === true).length,
    lootEvents: floorRewards.length,
    equipmentOpportunities: loot.equipmentOpportunities,
    runeOpportunities: floorRewards.filter(event => event.category === "rune").length,
    buildOpportunities: loot.buildOpportunities
  };
  if (candidateActivity) {
    loot.equipmentDecisionActivity = {
      observed: true,
      evaluationEvents: candidateActivity.evaluationEvents,
      evaluableEvents: candidateActivity.evaluableEvents,
      qualifiedEvents: candidateActivity.qualifiedEvents,
      selectedEvents: candidateActivity.selectedEvents,
      observableBuildChanges: buildShiftCount
    };
    loot.candidateEvaluationActivity = {
      observed: true,
      candidateCount: candidateActivity.candidateCount,
      evaluable: candidateActivity.evaluable,
      qualifies: candidateActivity.qualifies,
      selected: candidateActivity.selected,
      categories: candidateAuditSummary.explorationCandidateActivity
        .byFloor[String(floor)]?.categories || {}
    };
  }
  return {
    floor,
    entered: true,
    entry,
    incrementalCost: {
      ...floorCosts,
      combatDamageHp: floorCosts.combat + floorCosts.guardianBoss,
      guardianBossDamageHp: floorCosts.guardianBoss,
      floorTrapDamageHp: floorCosts.floorTrap,
      chestTrapDamageHp: floorCosts.chestTrap,
      poisonStatusDamageHp: floorCosts.poisonStatus,
      fleePartingDamageHp: flee.observed ? flee.partingAttackDamageHp : null,
      mpSpent: finite(stage.mpSpent),
      hpRecovered: finite(stage.healing),
      mpRecovered: finite(stage.mpRecovered),
      recoveryItemAcquired: countByItem(floorRewards.filter(event =>
        ["HEAL_POTION", "GREATER_HEAL", "MANA_POTION", "HOLY_WATER", "ETHER"].includes(event.itemId)
      )),
      recoveryItemUsed: countByItem(floorRecovery),
      combatCount: finite(stage.encounters),
      combatRounds: finite(stage.rounds),
      enemyActionCount: finite(stage.enemyActions),
      fleeAttempts: flee.observed ? flee.fleeSelected : finite(stage.fleeActions),
      fleeExecutions: flee.observed ? flee.fleeExecuted : null,
      fleeSelectedButNotExecuted: flee.observed ? flee.fleeSelectedButNotExecuted : null,
      fleePartingAttackCount: flee.observed ? flee.fleePartingAttackCount : null,
      fleeSurvived: flee.observed ? flee.fleeSurvived : null,
      fleeDiedFromPartingAttack: flee.observed ? flee.fleeDiedFromPartingAttack : null,
      steps: finite(stage.steps)
    },
    cumulativeCostBySource: { ...cumulative },
    recovery: {
      healingHp: finite(stage.healing),
      healingMp: finite(stage.mpRecovered),
      itemAcquired: countByItem(floorRewards.filter(event =>
        ["HEAL_POTION", "GREATER_HEAL", "MANA_POTION", "HOLY_WATER", "ETHER"].includes(event.itemId)
      )),
      itemUsed: countByItem(floorRecovery)
    },
    loot,
    build: {
      meaningfulLootOpportunity: floorRewards.some(event => event.meaningful === true),
      equipmentOpportunity: floorRewards.some(event => event.category === "equipment"),
      buildChange: buildShiftCount > 0,
      buildShiftCount
    },
    exit,
    waterfall: {
      reachedNextFloor: Boolean(stage.reachedNextFloor),
      died: Boolean(stage.died),
      voluntaryReturn: floorTerminalKind(stage, result) === "voluntaryReturn",
      otherTerminal: floorTerminalKind(stage, result) === "otherTerminal"
    },
    terminal: floorTerminalKind(stage, result),
    terminalReason: stage.terminalReason || null,
    observedEncounterCount: floorEncounters.length
  };
}

function equipmentBySlot(snapshot) {
  return Object.fromEntries((snapshot?.equipment || []).map(item => [item.slot, item.id]));
}

function checkpointMaturity(start, snapshot, cumulativeEquipmentSwaps) {
  if (!start || !snapshot) {
    return {
      status: "unreachable",
      changedEquipmentSlots: null,
      cumulativeEquipmentSwaps: null,
      buildIdentityChanged: null
    };
  }
  const startEquipment = equipmentBySlot(start);
  const checkpointEquipment = equipmentBySlot(snapshot);
  const slots = new Set([...Object.keys(startEquipment), ...Object.keys(checkpointEquipment)]);
  return {
    status: "observed",
    changedEquipmentSlots: [...slots].filter(slot =>
      (startEquipment[slot] || null) !== (checkpointEquipment[slot] || null)
    ).length,
    cumulativeEquipmentSwaps,
    buildIdentityChanged: start.identity !== snapshot.identity
  };
}

function compactBuildCheckpoints(result, floors) {
  const start = compactBuildSnapshot(result.startingBuildSnapshot);
  const terminal = compactBuildSnapshot(result.diagnostics?.finalBuild || result.endingBuildSnapshot);
  const checkpoints = {
    runStart: {
      checkpoint: "runStart",
      status: start ? "observed" : "unobserved",
      floor: 1,
      build: start,
      maturity: checkpointMaturity(start, start, 0)
    }
  };
  [2, 3, 4, 5].forEach(floor => {
    const snapshot = floors[floor]?.entry?.build || null;
    checkpoints[`B${floor}Entry`] = {
      checkpoint: `B${floor}Entry`,
      status: snapshot ? "observed" : "unreachable",
      floor,
      build: snapshot,
      maturity: checkpointMaturity(
        start,
        snapshot,
        (result.equipmentTelemetry || []).filter(event =>
          event.type === "swap" && Number(event.floor) < floor
        ).length
      )
    };
  });
  checkpoints.terminal = {
    checkpoint: "terminal",
    status: terminal ? "observed" : "unobserved",
    floor: Number.isFinite(Number(result.deathFloor ?? result.endFloor))
      ? Number(result.deathFloor ?? result.endFloor)
      : null,
    build: terminal,
    maturity: checkpointMaturity(
      start,
      terminal,
      (result.equipmentTelemetry || []).filter(event => event.type === "swap").length
    )
  };
  return checkpoints;
}

function emptyCandidateAuditFloorSummary() {
  return {
    evaluationEvents: 0,
    evaluableEvents: 0,
    qualifiedEvents: 0,
    selectedEvents: 0,
    candidateCount: 0,
    evaluable: 0,
    qualifies: 0,
    selected: 0
  };
}

function summarizeCandidateAudit(result) {
  if (!Array.isArray(result.equipmentCandidateAudit)) return null;
  const explorationCandidateActivity = summarizeExplorationCandidateActivity(
    result.equipmentCandidateAudit,
    TRAJECTORY_FLOORS
  );
  const rejectedCandidateCrossTab = summarizeRejectedCandidateCrossTabForRun(
    result.equipmentCandidateAudit,
    TRAJECTORY_FLOORS
  );
  TRAJECTORY_FLOORS.forEach(floor => {
    const categories = explorationCandidateActivity.byFloor[String(floor)]?.categories || {};
    explorationCandidateActivity.byFloor[String(floor)].categories = Object.fromEntries(
      Object.entries(categories).filter(([, metric]) => metric.candidateCount > 0)
    );
  });
  const byFloor = Object.fromEntries(
    TRAJECTORY_FLOORS.map(floor => [String(floor), emptyCandidateAuditFloorSummary()])
  );
  const rejectedClassifications = {};
  let evaluableRejectedCandidateCount = 0;
  let qualifiedRejectedCandidateCount = 0;
  let selectedEvents = 0;
  result.equipmentCandidateAudit.forEach(audit => {
    const floor = byFloor[String(audit.floor)];
    if (floor) {
      floor.evaluationEvents++;
      floor.evaluableEvents += Number(Boolean(audit.evaluableCandidate));
      floor.qualifiedEvents += Number(Boolean(audit.evaluableCandidate && audit.qualifies));
      floor.selectedEvents += Number(Boolean(audit.selected));
      floor.candidateCount++;
      floor.evaluable += Number(Boolean(audit.evaluableCandidate));
      floor.qualifies += Number(Boolean(audit.evaluableCandidate && audit.qualifies));
      floor.selected += Number(Boolean(audit.evaluableCandidate && audit.selected));
    }
    selectedEvents += Number(Boolean(audit.selected));
    if (!audit.evaluableCandidate || audit.selected) return;
    evaluableRejectedCandidateCount++;
    qualifiedRejectedCandidateCount += Number(Boolean(audit.qualifies));
    (audit.sidegradeClassifications || []).forEach(id => {
      rejectedClassifications[id] = (rejectedClassifications[id] || 0) + 1;
    });
  });
  const swaps = (result.equipmentTelemetry || []).filter(event => event.type === "swap");
  const selectedAuditIds = new Set(
    result.equipmentCandidateAudit.filter(audit => audit.selected).map(audit => audit.id)
  );
  const swapAuditIds = swaps.map(event => event.candidateAuditId).filter(Boolean);
  const selectedSwapIds = new Set(swapAuditIds);
  const unmatchedSelectedAuditIds = [...selectedAuditIds].filter(id => !selectedSwapIds.has(id));
  const unmatchedSwapAuditIds = [...selectedSwapIds].filter(id => !selectedAuditIds.has(id));
  return {
    status: "observed",
    evaluationEvents: result.equipmentCandidateAudit.length,
    evaluableEvents: result.equipmentCandidateAudit.filter(audit => audit.evaluableCandidate).length,
    qualifiedEvents: result.equipmentCandidateAudit.filter(audit =>
      audit.evaluableCandidate && audit.qualifies
    ).length,
    selectedEvents,
    evaluableRejectedCandidateCount,
    qualifiedRejectedCandidateCount,
    rejectedClassifications,
    explorationCandidateActivity,
    rejectedCandidateCrossTab,
    byFloor,
    selectedCandidateSwapConsistency: {
      pass: selectedAuditIds.size === swaps.length &&
        unmatchedSelectedAuditIds.length === 0 &&
        unmatchedSwapAuditIds.length === 0,
      selectedCandidateCount: selectedAuditIds.size,
      swapTelemetryCount: swaps.length,
      unmatchedSelectedAuditCount: unmatchedSelectedAuditIds.length,
      unmatchedSwapTelemetryCount: unmatchedSwapAuditIds.length
    }
  };
}

export function compactRun(
  result,
  { scenarioId, startingKitId, policyId, runIndex, worldSeed, candidateSampleCollector = null }
) {
  const diagnostics = result.diagnostics || {};
  const groupedCosts = groupCostEvents(diagnostics.costEvents || []);
  const stages = result.stage15Diagnostics?.byFloor || {};
  const encounters = Array.isArray(result.encounterIdentityLog) ? result.encounterIdentityLog : [];
  const rewardEvents = Array.isArray(diagnostics.rewardEvents) ? diagnostics.rewardEvents : [];
  const recoveryEvents = Array.isArray(diagnostics.recoveryEvents) ? diagnostics.recoveryEvents : [];
  const diagnosticEncounters = Array.isArray(diagnostics.encounters)
    ? diagnostics.encounters
    : null;
  const candidateAuditSummary = summarizeCandidateAudit(result);
  candidateSampleCollector?.addAll(result.equipmentCandidateAudit || [], runIndex);
  const chestTrapCostAudit = Array.isArray(result.chestTrapCostAudit)
    ? result.chestTrapCostAudit.map(event => ({ ...event }))
    : [];
  const chestLootEvents = Array.isArray(result.chestLootEvents)
    ? result.chestLootEvents.map(event => structuredClone(event))
    : [];
  const floors = Object.fromEntries(TRAJECTORY_FLOORS.map(floor => [floor, compactFloor(
    stages[String(floor)],
    result,
    groupedCosts,
    rewardEvents,
    recoveryEvents,
    encounters,
    diagnosticEncounters,
    candidateAuditSummary
  )]));
  const outcome = terminalKind(result);
  const finalFloor = Number(result.deathFloor ?? result.endFloor ?? result.reachedFloor);
  const finalObservedFloor = Number.isFinite(finalFloor)
    ? (groupedCosts.incrementalByFloor[finalFloor]
      ? finalFloor
      : Math.min(TRAJECTORY_FLOORS.at(-1), Math.max(TRAJECTORY_FLOORS[0], finalFloor)))
    : null;
  const finalFloorCost = groupedCosts.incrementalByFloor[finalObservedFloor] || emptyCosts();
  const compacted = {
    scenarioId,
    startingKitId,
    policyId,
    runIndex,
    worldSeed,
    outcome,
    reachedFloor: finite(result.reachedFloor),
    terminalFloor: Number.isFinite(finalFloor) ? finalFloor : null,
    returnFloor: outcome === "voluntaryReturn" ? finite(result.reachedFloor) : null,
    terminalCause: outcome === "died"
      ? result.runDiagnostics?.deathCauseCategory || result.deathCause || result.runDiagnostics?.deathCause || "unknown"
      : outcome === "voluntaryReturn"
        ? result.runDiagnostics?.retreatReason || "unknown"
        : result.terminationReason || outcome,
    terminalReason: result.terminationReason || null,
    terminalState: {
      hp: finite(result.finalHp),
      maxHp: finite(result.finalMaxHp),
      hpRatio: finite(result.finalHpRate),
      mp: finite(result.finalMp),
      maxMp: finite(result.finalMaxMp),
      mpRatio: finite(result.finalMpRate),
      recoveryRemaining: finite(result.runDiagnostics?.recoveryPotionsRemaining),
      status: result.runDiagnostics?.statusAtEnd || null
    },
    cumulativeCostBySource: { ...groupedCosts.totals },
    cumulativeCombatDamageHp: groupedCosts.totals.combat + groupedCosts.totals.guardianBoss,
    cumulativeFloorTrapDamageHp: groupedCosts.totals.floorTrap,
    cumulativeChestTrapDamageHp: groupedCosts.totals.chestTrap,
    cumulativePoisonStatusDamageHp: groupedCosts.totals.poisonStatus,
    finalObservedFloor,
    finalFloorIncrementalCost: {
      ...finalFloorCost,
      combatDamageHp: finalFloorCost.combat + finalFloorCost.guardianBoss,
      floorTrapDamageHp: finalFloorCost.floorTrap,
      chestTrapDamageHp: finalFloorCost.chestTrap,
      poisonStatusDamageHp: finalFloorCost.poisonStatus
    },
    chestLootEvents,
    chestTrapCostAudit,
    b2ChestTrapReceived: chestTrapCostAudit.some(event => Number(event.floor) === 2),
    lastCostEvents: (diagnostics.costEvents || []).slice(-3).map(compactCostEvent),
    floors,
    totalSteps: finite(result.steps),
    totalCombatCount: finite(result.battles),
    totalCombatRounds: finite(result.combatRounds),
    build: {
      starting: compactBuildSnapshot(result.startingBuildSnapshot),
      ending: compactBuildSnapshot(result.diagnostics?.finalBuild || result.endingBuildSnapshot),
      shiftCount: (result.equipmentTelemetry || []).filter(event => event.type === "swap").length
    },
  };
  if (candidateAuditSummary) {
    compacted.equipmentCandidateAuditSummary = candidateAuditSummary;
    compacted.buildCheckpoints = compactBuildCheckpoints(result, floors);
  }
  return compacted;
}

export function createCandidateAuditSampleCollector(limit = CANDIDATE_AUDIT_SAMPLE_LIMIT) {
  if (!Number.isInteger(limit) || limit < 0) {
    throw new Error(`candidate audit sample limit must be a non-negative integer: ${limit}`);
  }
  const retained = [];
  let totalCount = 0;
  return {
    addAll(audits, runIndex) {
      audits.forEach(audit => {
        totalCount++;
        if (retained.length >= limit) return;
        retained.push({
          runIndex,
          audit: structuredClone(audit)
        });
      });
    },
    finalize() {
      return {
        policy: CANDIDATE_AUDIT_SAMPLE_POLICY,
        limit,
        totalCount,
        retainedCount: retained.length,
        droppedCount: totalCount - retained.length,
        events: retained
      };
    }
  };
}

export function createRunEvidenceSampleCollector(limit = RUN_EVIDENCE_SAMPLE_LIMIT) {
  if (!Number.isInteger(limit) || limit < 0) {
    throw new Error(`run evidence sample limit must be a non-negative integer: ${limit}`);
  }
  const retained = [];
  let totalCount = 0;
  return {
    add(record) {
      totalCount++;
      if (retained.length < limit) retained.push(structuredClone(record));
    },
    finalize() {
      return {
        policy: RUN_EVIDENCE_SAMPLE_POLICY,
        limit,
        totalCount,
        retainedCount: retained.length,
        droppedCount: totalCount - retained.length,
        runs: retained
      };
    }
  };
}

export function projectGameplayRecord(record) {
  const projected = structuredClone(record);
  delete projected.equipmentCandidateAuditSummary;
  delete projected.buildCheckpoints;
  delete projected.equipmentDecisionTelemetryConsistency;
  Object.values(projected.floors || {}).forEach(floor => {
    if (floor?.loot) {
      delete floor.loot.equipmentDecisionActivity;
      delete floor.loot.candidateEvaluationActivity;
    }
  });
  return projected;
}

export function compareObservationInvariance(auditOff, auditOn) {
  const off = projectGameplayRecord(auditOff);
  const on = projectGameplayRecord(auditOn);
  return {
    pass: JSON.stringify(off) === JSON.stringify(on),
    comparedFields: [
      "loot",
      "encounter",
      "equipment swap",
      "outcome",
      "reached floors",
      "terminal state"
    ],
    auditOff: {
      outcome: auditOff.outcome,
      reachedFloor: auditOff.reachedFloor,
      equipmentSwapCount: auditOff.build?.shiftCount || 0
    },
    auditOn: {
      outcome: auditOn.outcome,
      reachedFloor: auditOn.reachedFloor,
      equipmentSwapCount: auditOn.build?.shiftCount || 0
    }
  };
}

export function matchedKey(record) {
  if (!Number.isInteger(record?.runIndex) || typeof record?.worldSeed !== "string" || !record.worldSeed) {
    throw new Error("matched trajectory record is missing runIndex/worldSeed");
  }
  return JSON.stringify([record.runIndex, record.worldSeed]);
}

export function buildMatchedTrajectory(baselineRecords, candidateRecords) {
  const index = (records, label) => {
    const byKey = new Map();
    const byRunIndex = new Map();
    records.forEach(record => {
      const key = matchedKey(record);
      if (byKey.has(key)) throw new Error(`matched trajectory duplicate ${label} key: ${key}`);
      byKey.set(key, record);
      byRunIndex.set(record.runIndex, [...(byRunIndex.get(record.runIndex) || []), record.worldSeed]);
    });
    return { byKey, byRunIndex };
  };
  const baseline = index(baselineRecords, "baseline");
  const candidate = index(candidateRecords, "candidate");
  if (baseline.byKey.size !== candidate.byKey.size) {
    throw new Error(`matched trajectory missing record: baseline=${baseline.byKey.size} candidate=${candidate.byKey.size}`);
  }
  const joined = [];
  baselineRecords.forEach(left => {
    const key = matchedKey(left);
    const right = candidate.byKey.get(key);
    if (!right) {
      if (candidate.byRunIndex.has(left.runIndex)) {
        throw new Error(`matched trajectory worldSeed mismatch for runIndex ${left.runIndex}`);
      }
      throw new Error(`matched trajectory missing candidate key: ${key}`);
    }
    joined.push({ baseline: left, candidate: right });
  });
  candidateRecords.forEach(right => {
    const key = matchedKey(right);
    if (!baseline.byKey.has(key)) {
      if (baseline.byRunIndex.has(right.runIndex)) {
        throw new Error(`matched trajectory worldSeed mismatch for runIndex ${right.runIndex}`);
      }
      throw new Error(`matched trajectory missing baseline key: ${key}`);
    }
  });
  return joined;
}

function addCounts(target, key, amount = 1) {
  target[key] = (target[key] || 0) + amount;
}

function makeWaterfall(records, floor) {
  const entrants = records.map(record => record.floors[floor]).filter(Boolean);
  entrants.forEach(row => {
    const terminalFlags = [
      row.waterfall.reachedNextFloor,
      row.waterfall.died,
      row.waterfall.voluntaryReturn,
      row.waterfall.otherTerminal
    ].filter(Boolean);
    if (terminalFlags.length !== 1) {
      throw new Error(`floor waterfall terminal partition failed at B${floor}: ${JSON.stringify(row.waterfall)}`);
    }
  });
  const counts = {
    entered: entrants.length,
    reachedNextFloor: entrants.filter(row => row.waterfall.reachedNextFloor).length,
    died: entrants.filter(row => row.waterfall.died).length,
    voluntaryReturn: entrants.filter(row => row.waterfall.voluntaryReturn).length,
    otherTerminal: entrants.filter(row => row.waterfall.otherTerminal).length
  };
  const partition = counts.reachedNextFloor + counts.died + counts.voluntaryReturn + counts.otherTerminal;
  if (partition !== counts.entered) {
    throw new Error(`floor waterfall invariant failed at B${floor}: ${JSON.stringify(counts)}`);
  }
  return {
    ...counts,
    invariant: {
      pass: true,
      equation: "entered = reachedNextFloor + died + voluntaryReturn + otherTerminal"
    },
    conditionalNextFloorReach: rateMetric(counts.reachedNextFloor, counts.entered),
    conditionalDeath: rateMetric(counts.died, counts.entered),
    conditionalReturn: rateMetric(counts.voluntaryReturn, counts.entered)
  };
}

function distributionForFloors(records, floor) {
  const rows = records.map(record => record.floors[floor]).filter(Boolean);
  const values = field => quantiles(rows.map(row => Number(field(row))).filter(Number.isFinite));
  const incrementalCostTotalBySource = Object.fromEntries(COST_SOURCE_IDS.map(source => [
    source,
    sum(rows.map(row => row.incrementalCost[source]))
  ]));
  const totalIncrementalCost = sum(Object.values(incrementalCostTotalBySource));
  const costDistribution = Object.fromEntries(COST_SOURCE_IDS.map(source => [
    source,
    {
      incremental: quantiles(rows.map(row => row.incrementalCost[source]).filter(Number.isFinite)),
      cumulative: quantiles(rows.map(row => row.cumulativeCostBySource[source]).filter(Number.isFinite))
    }
  ]));
  const deathCauses = {};
  rows.filter(row => row.waterfall.died).forEach(row => {
    const cause = row.terminalCause || "unknown";
    deathCauses[cause] = (deathCauses[cause] || 0) + 1;
  });
  return {
    entrants: rows.length,
    entryHp: values(row => row.entry.hp),
    exitHp: values(row => row.exit.hp),
    entryHpRatio: values(row => row.entry.hpRatio),
    entryMpRatio: values(row => row.entry.mpRatio),
    exitHpRatio: values(row => row.exit.hpRatio),
    exitMpRatio: values(row => row.exit.mpRatio),
    recoveryRemainingEntry: values(row => row.entry.recoveryRemaining),
    recoveryRemainingExit: values(row => row.exit.recoveryRemaining),
    recoveryUsed: values(row => Object.values(row.recovery?.itemUsed || {})
      .reduce((total, amount) => total + amount, 0)),
    recoveredHp: values(row => row.recovery?.healingHp),
    combatDamageHp: values(row => row.incrementalCost.combatDamageHp),
    chestTrapDamageHp: values(row => row.incrementalCost.chestTrapDamageHp),
    floorTrapDamageHp: values(row => row.incrementalCost.floorTrapDamageHp),
    poisonStatusDamageHp: values(row => row.incrementalCost.poisonStatusDamageHp),
    deathCauses,
    lootOpportunities: sum(rows.map(row => row.loot?.opportunities)),
    equipmentOpportunities: sum(rows.map(row => row.loot?.equipmentOpportunities)),
    buildOpportunities: sum(rows.map(row => row.loot?.buildOpportunities)),
    lootSupply: {
      status: rows.length > 0 ? "observed" : "unreachable",
      lootEvents: sum(rows.map(row => row.loot?.supply?.lootEvents)),
      meaningfulOpportunities: sum(rows.map(row => row.loot?.supply?.meaningfulOpportunities)),
      equipmentOpportunities: sum(rows.map(row => row.loot?.supply?.equipmentOpportunities)),
      runeOpportunities: sum(rows.map(row => row.loot?.supply?.runeOpportunities)),
      buildOpportunities: sum(rows.map(row => row.loot?.supply?.buildOpportunities))
    },
    equipmentDecisionActivity: summarizeEquipmentDecisionRows(rows),
    buildChanges: sum(rows.map(row => row.build?.buildShiftCount)),
    encountersPerFloor: values(row => row.incrementalCost.combatCount),
    stepsPerFloor: values(row => row.incrementalCost.steps),
    incrementalCost: costDistribution,
    incrementalCostTotalBySource,
    dominantIncrementalCostSource: totalIncrementalCost > 0
      ? COST_SOURCE_IDS.slice().sort((left, right) =>
        incrementalCostTotalBySource[right] - incrementalCostTotalBySource[left]
      )[0]
      : null
  };
}

const BUILD_CHECKPOINT_IDS = Object.freeze(["runStart", "B2Entry", "B3Entry", "B4Entry", "B5Entry", "terminal"]);

function rate(count, denominator) {
  return Number.isFinite(Number(denominator)) && denominator > 0
    ? count / denominator
    : null;
}

function summarizeDistribution(rows, getter) {
  return quantiles(rows.map(getter).filter(Number.isFinite));
}

function summarizeGrowth(rows, field) {
  return {
    absolute: summarizeDistribution(rows, row => row.build?.[field]),
    delta: summarizeDistribution(rows, row =>
      Number(row.build?.[field]) - Number(row.start?.[field])
    ),
    startRatio: summarizeDistribution(rows, row => {
      const start = Number(row.start?.[field]);
      const current = Number(row.build?.[field]);
      return Number.isFinite(start) && start !== 0 ? current / start : null;
    })
  };
}

function checkpointRows(records, checkpoint) {
  return records.map(record => {
    const checkpointRow = record.buildCheckpoints?.[checkpoint];
    if (!checkpointRow || checkpointRow.status !== "observed" || !checkpointRow.build) return null;
    return {
      record,
      build: checkpointRow.build,
      start: record.buildCheckpoints?.runStart?.build || record.build.starting
    };
  }).filter(Boolean);
}

function buildPopulation(rows, checkpoint) {
  if (checkpoint === "runStart" || checkpoint === "terminal") {
    return {
      entered: rows.length,
      reachedNextFloor: null,
      died: checkpoint === "terminal" ? rows.filter(row => row.record.outcome === "died").length : null,
      voluntaryReturn: checkpoint === "terminal"
        ? rows.filter(row => row.record.outcome === "voluntaryReturn").length
        : null,
      otherTerminal: checkpoint === "terminal"
        ? rows.filter(row => !["died", "voluntaryReturn"].includes(row.record.outcome)).length
        : null,
      condition: checkpoint === "terminal" ? "all run terminal outcomes" : "all run starts"
    };
  }
  const floor = Number(checkpoint.slice(1, 2));
  const floorRows = rows.map(row => row.record.floors?.[floor]).filter(Boolean);
  return {
    entered: rows.length,
    reachedNextFloor: floorRows.filter(row => row.waterfall?.reachedNextFloor).length,
    died: floorRows.filter(row => row.waterfall?.died).length,
    voluntaryReturn: floorRows.filter(row => row.waterfall?.voluntaryReturn).length,
    otherTerminal: floorRows.filter(row => row.waterfall?.otherTerminal).length,
    condition: `B${floor} entrants`
  };
}

function countPositiveSupport(rows, field) {
  return rows.filter(row => Number(row.build?.explorationSupportValues?.[field]) > 0).length;
}

function summarizeBuildCheckpoint(records, checkpoint) {
  const rows = checkpointRows(records, checkpoint);
  const population = buildPopulation(rows, checkpoint);
  const status = rows.length > 0 ? "observed" : "unreachable";
  const supportIds = [...new Set(rows.flatMap(row =>
    Object.entries(row.build?.supportValues || {})
      .filter(([, value]) => Number(value) !== 0)
      .map(([id]) => id)
  ))].sort();
  const coreCompositions = {};
  rows.forEach(row => {
    const main = (row.build?.mainCoreIds || []).join("+") || "none";
    const auxiliary = (row.build?.auxiliaryCoreIds || []).join("+") || "none";
    const key = `main:${main}|auxiliary:${auxiliary}`;
    coreCompositions[key] = (coreCompositions[key] || 0) + 1;
  });
  const maturity = {
    changedEquipmentSlots: summarizeDistribution(rows, row => row.record.buildCheckpoints[checkpoint].maturity.changedEquipmentSlots),
    cumulativeEquipmentSwaps: summarizeDistribution(rows, row => row.record.buildCheckpoints[checkpoint].maturity.cumulativeEquipmentSwaps),
    buildIdentityChanged: rows.filter(row => row.record.buildCheckpoints[checkpoint].maturity.buildIdentityChanged).length,
    buildIdentityChangedRate: rate(
      rows.filter(row => row.record.buildCheckpoints[checkpoint].maturity.buildIdentityChanged).length,
      rows.length
    ),
    coreCount: summarizeDistribution(rows, row =>
      (row.build?.mainCoreIds || []).length + (row.build?.auxiliaryCoreIds || []).length
    ),
    supportCount: summarizeDistribution(rows, row =>
      Object.values(row.build?.supportValues || {}).filter(value => Number(value) !== 0).length
    ),
    supportIds,
    mainCoreIds: [...new Set(rows.flatMap(row => row.build?.mainCoreIds || []))].sort(),
    auxiliaryCoreIds: [...new Set(rows.flatMap(row => row.build?.auxiliaryCoreIds || []))].sort(),
    activeRuneSpellIds: [...new Set(rows.flatMap(row => row.build?.activeRuneSpellIds || []))].sort(),
    spellIds: [...new Set(rows.flatMap(row => row.build?.spells || []))].sort(),
    coreCompositions
  };
  const explorationSupportIds = [...new Set(rows.flatMap(row =>
    Object.keys(row.build?.explorationSupportValues || {})
  ))].sort();
  const explorationSupport = Object.fromEntries(explorationSupportIds.map(id => [id, {
    value: summarizeDistribution(rows, row => row.build?.explorationSupportValues?.[id]),
    holderCount: countPositiveSupport(rows, id),
    holderRate: rate(countPositiveSupport(rows, id), rows.length)
  }]));
  return {
    status,
    population,
    combatGrowth: {
      atk: summarizeGrowth(rows, "atk"),
      def: summarizeGrowth(rows, "def"),
      maxHp: summarizeGrowth(rows, "maxHp"),
      maxMp: summarizeGrowth(rows, "maxMp")
    },
    explorationSafetyGrowth: {
      support: explorationSupport,
      observedSupportIds: explorationSupportIds
    },
    buildMaturity: maturity
  };
}

function summarizeEquipmentDecisionRows(rows) {
  const observedRows = rows.map(row => row.loot?.equipmentDecisionActivity)
    .filter(value => value?.observed);
  if (observedRows.length === 0) {
    return {
      status: "unobserved",
      evaluationEvents: null,
      evaluableEvents: null,
      qualifiedEvents: null,
      selectedEvents: null,
      observableBuildChanges: null
    };
  }
  return {
    status: "observed",
    evaluationEvents: sum(observedRows.map(row => row.evaluationEvents)),
    evaluableEvents: sum(observedRows.map(row => row.evaluableEvents)),
    qualifiedEvents: sum(observedRows.map(row => row.qualifiedEvents)),
    selectedEvents: sum(observedRows.map(row => row.selectedEvents)),
    observableBuildChanges: sum(observedRows.map(row => row.observableBuildChanges)),
    observedRuns: observedRows.length
  };
}

function nullCandidateMetric() {
  return {
    candidateCount: null,
    evaluable: null,
    qualifies: null,
    selected: null,
    affectedRunCount: null,
    affectedRunRate: null
  };
}

function observedCandidateMetric(rows, category, denominator) {
  return {
    candidateCount: sum(rows.map(row => row?.[category]?.candidateCount)),
    evaluable: sum(rows.map(row => row?.[category]?.evaluable)),
    qualifies: sum(rows.map(row => row?.[category]?.qualifies)),
    selected: sum(rows.map(row => row?.[category]?.selected)),
    affectedRunCount: rows.filter(row => (row?.[category]?.candidateCount || 0) > 0).length,
    affectedRunRate: rate(
      rows.filter(row => (row?.[category]?.candidateCount || 0) > 0).length,
      denominator
    )
  };
}

function summarizeCandidateEvaluationActivity(records) {
  const categories = ["positiveExplorationDelta", ...EXPLORATION_SUPPORT_IDS];
  const byFloor = Object.fromEntries(TRAJECTORY_FLOORS.map(floor => {
    const floorRows = records.filter(record => record.floors?.[floor]);
    const summaries = floorRows
      .map(record => record.equipmentCandidateAuditSummary?.explorationCandidateActivity?.byFloor?.[String(floor)])
      .filter(Boolean);
    const base = {
      status: floorRows.length === 0
        ? "unreachable"
        : summaries.length === floorRows.length ? "observed" : "unobserved",
      entrantRunCount: floorRows.length,
      observedRunCount: summaries.length,
      candidateCount: null,
      evaluable: null,
      qualifies: null,
      selected: null,
      affectedRunCount: null,
      affectedRunRate: null,
      categories: Object.fromEntries(categories.map(category => [category, nullCandidateMetric()]))
    };
    if (base.status !== "observed") return [floor, base];
    return [floor, {
      ...base,
      candidateCount: sum(summaries.map(row => row.candidateCount)),
      evaluable: sum(summaries.map(row => row.evaluable)),
      qualifies: sum(summaries.map(row => row.qualifies)),
      selected: sum(summaries.map(row => row.selected)),
      affectedRunCount: summaries.filter(row => row.candidateCount > 0).length,
      affectedRunRate: rate(summaries.filter(row => row.candidateCount > 0).length, floorRows.length),
      categories: Object.fromEntries(categories.map(category => [
        category,
        observedCandidateMetric(summaries.map(row => row.categories || {}), category, floorRows.length)
      ]))
    }];
  }));
  return {
    status: Object.values(byFloor).some(row => row.status === "observed") ? "observed"
      : records.length === 0 ? "unreachable" : "unobserved",
    byFloor
  };
}

function nullRejectedMetric() {
  return {
    rejectedCandidateCount: null,
    affectedRunCount: null,
    affectedRunRate: null
  };
}

function summarizeRejectedCandidateCrossTab(records) {
  const byFloor = Object.fromEntries(TRAJECTORY_FLOORS.map(floor => {
    const floorRows = records.filter(record => record.floors?.[floor]);
    const summaries = floorRows
      .map(record => record.equipmentCandidateAuditSummary?.rejectedCandidateCrossTab?.byFloor?.[String(floor)])
      .filter(Boolean);
    const status = floorRows.length === 0
      ? "unreachable"
      : summaries.length === floorRows.length ? "observed" : "unobserved";
    const byRejectionReason = Object.fromEntries(REJECTION_REASON_IDS.map(reason => [
      reason,
      Object.fromEntries(SIDEGRADE_CLASSIFICATIONS.map(classification => [
        classification,
        nullRejectedMetric()
      ]))
    ]));
    if (status !== "observed") {
      return [floor, {
        status,
        entrantRunCount: floorRows.length,
        observedRunCount: summaries.length,
        byRejectionReason
      }];
    }
    REJECTION_REASON_IDS.forEach(reason => {
      SIDEGRADE_CLASSIFICATIONS.forEach(classification => {
        const cellRows = summaries.map(row =>
          row.byRejectionReason?.[reason]?.[classification] || 0
        );
        const affectedRunCount = cellRows.filter(count => count > 0).length;
        byRejectionReason[reason][classification] = {
          rejectedCandidateCount: sum(cellRows),
          affectedRunCount,
          affectedRunRate: rate(affectedRunCount, floorRows.length)
        };
      });
    });
    return [floor, {
      status,
      entrantRunCount: floorRows.length,
      observedRunCount: summaries.length,
      byRejectionReason
    }];
  }));
  return {
    status: Object.values(byFloor).some(row => row.status === "observed") ? "observed"
      : records.length === 0 ? "unreachable" : "unobserved",
    byFloor
  };
}

function summarizeRejectedCandidates(records, crossTab = summarizeRejectedCandidateCrossTab(records)) {
  const observedRecords = records.filter(record => record.equipmentCandidateAuditSummary);
  if (observedRecords.length === 0) {
    return {
      status: "unobserved",
      evaluableRejectedCandidateCount: 0,
      affectedRunCount: 0,
      classifications: Object.fromEntries([
        "strictUpgrade",
        "combatTradeoff",
        "durabilityTradeoff",
        "safetyTradeoff",
        "buildTradeoff",
        "noMeaningfulGain"
      ].map(id => [id, {
        totalCount: 0,
        affectedRunCount: 0,
        affectedRunRate: rate(0, records.length),
        perRunRate: rate(0, records.length)
      }])),
      crossTab
    };
  }
  const classifications = {};
  const affectedRuns = {};
  let evaluableRejectedCandidateCount = 0;
  let affectedRunCount = 0;
  observedRecords.forEach(record => {
    const summary = record.equipmentCandidateAuditSummary;
    evaluableRejectedCandidateCount += summary.evaluableRejectedCandidateCount;
    if (summary.evaluableRejectedCandidateCount > 0) affectedRunCount++;
    Object.entries(summary.rejectedClassifications || {}).forEach(([id, count]) => {
      classifications[id] = (classifications[id] || 0) + count;
      affectedRuns[id] ||= 0;
      if (count > 0) affectedRuns[id]++;
    });
  });
  const classificationSummary = Object.fromEntries([
    "strictUpgrade",
    "combatTradeoff",
    "durabilityTradeoff",
    "safetyTradeoff",
    "buildTradeoff",
    "noMeaningfulGain"
  ].map(id => [id, {
    totalCount: classifications[id] || 0,
    affectedRunCount: affectedRuns[id] || 0,
    affectedRunRate: rate(affectedRuns[id] || 0, records.length),
    perRunRate: rate(classifications[id] || 0, records.length)
  }]));
  return {
    status: "observed",
    evaluableRejectedCandidateCount,
    affectedRunCount,
    classifications: classificationSummary,
    crossTab
  };
}

function summarizeCandidateSwapConsistency(records) {
  const summaries = records
    .map(record => record.equipmentCandidateAuditSummary?.selectedCandidateSwapConsistency)
    .filter(Boolean);
  if (summaries.length === 0) {
    return {
      status: "unobserved",
      pass: null,
      selectedCandidateCount: null,
      swapTelemetryCount: null,
      unmatchedSelectedAuditCount: null,
      unmatchedSwapTelemetryCount: null
    };
  }
  return {
    status: "observed",
    pass: summaries.every(summary => summary.pass),
    selectedCandidateCount: sum(summaries.map(summary => summary.selectedCandidateCount)),
    swapTelemetryCount: sum(summaries.map(summary => summary.swapTelemetryCount)),
    unmatchedSelectedAuditCount: sum(summaries.map(summary => summary.unmatchedSelectedAuditCount)),
    unmatchedSwapTelemetryCount: sum(summaries.map(summary => summary.unmatchedSwapTelemetryCount))
  };
}

function sumFloorCosts(record) {
  return TRAJECTORY_FLOORS.reduce((totals, floor) => {
    const costs = record.floors[floor]?.incrementalCost || {};
    COST_SOURCE_IDS.forEach(source => {
      totals[source] += Number(costs[source]) || 0;
    });
    return totals;
  }, emptyCosts());
}

function summarizeLootBuild(records) {
  const chestEvents = records.reduce((total, record) => total + (record.chestLootEvents?.length || 0), 0);
  const lootOpportunities = records.reduce((total, record) => total + Object.values(record.floors)
    .reduce((floorTotal, floor) => floorTotal + (floor?.loot?.opportunities || 0), 0), 0);
  const equipmentOpportunities = records.reduce((total, record) => total + Object.values(record.floors)
    .reduce((floorTotal, floor) => floorTotal + (floor?.loot?.equipmentOpportunities || 0), 0), 0);
  const buildOpportunities = records.reduce((total, record) => total + Object.values(record.floors)
    .reduce((floorTotal, floor) => floorTotal + (floor?.loot?.buildOpportunities || 0), 0), 0);
  const buildChanges = records.reduce((total, record) => total + record.build.shiftCount, 0);
  const endingBuildSnapshots = {};
  records.forEach(record => {
    const identity = record.build.ending?.identity || "unknown";
    endingBuildSnapshots[identity] = (endingBuildSnapshots[identity] || 0) + 1;
  });
  return {
    runs: records.length,
    chestEvents,
    lootOpportunities,
    equipmentOpportunities,
    buildOpportunities,
    buildChanges,
    buildChangeRuns: records.filter(record => record.build.shiftCount > 0).length,
    endingBuildSnapshots,
    definitions: {
      lootOpportunities: "accepted or explicitly left/discarded meaningful reward events",
      equipmentOpportunities: "reward events with category=equipment",
      buildOpportunities: "equipment or rune reward events",
      buildChanges: "production equipmentTelemetry swap events"
    }
  };
}

function summarizeChestTrapCostAudit(records) {
  const events = records.flatMap(record => record.chestTrapCostAudit || [])
    .filter(event => Number(event.floor) === 2);
  return {
    events: events.length,
    generatedDamageHp: sum(events.map(event => event.generatedDamageHp)),
    appliedDamageHp: sum(events.map(event => event.appliedDamageHp)),
    generatedStatusApplications: sum(events.map(event => event.generatedStatusApplications)),
    appliedStatusApplications: sum(events.map(event => event.appliedStatusApplications)),
    suppressedEvents: events.filter(event => event.suppressed).length,
    allSuppressed: events.length > 0 && events.every(event => event.suppressed),
    appliedCostZero: events.every(event => event.appliedDamageHp === 0 &&
      event.appliedStatusApplications === 0)
  };
}

export function aggregateCondition(records) {
  const waterfall = Object.fromEntries(TRAJECTORY_FLOORS.map(floor => [floor, makeWaterfall(records, floor)]));
  const candidateEvaluationActivity = summarizeCandidateEvaluationActivity(records);
  const rejectedCandidateCrossTab = summarizeRejectedCandidateCrossTab(records);
  const outcomeCounts = {};
  const terminalCauses = {};
  records.forEach(record => {
    addCounts(outcomeCounts, record.outcome);
    addCounts(terminalCauses, record.terminalCause || "unknown");
    const floorCosts = sumFloorCosts(record);
    COST_SOURCE_IDS.forEach(source => {
      if (Math.abs(floorCosts[source] - record.cumulativeCostBySource[source]) > 1e-9) {
        throw new Error(`incremental cost invariant failed for run ${record.runIndex}, source ${source}`);
      }
    });
  });
  const returnRecords = records.filter(record => record.outcome === "voluntaryReturn");
  const totalCost = COST_SOURCE_IDS.reduce((total, source) =>
    total + sum(records.map(record => record.cumulativeCostBySource[source])), 0);
  const sourceTotals = Object.fromEntries(COST_SOURCE_IDS.map(source => [
    source,
    sum(records.map(record => record.cumulativeCostBySource[source]))
  ]));
  return {
    runs: records.length,
    outcomeCounts,
    terminalCauses,
    waterfall,
    distributions: Object.fromEntries(TRAJECTORY_FLOORS.map(floor => [
      floor,
      distributionForFloors(records, floor)
    ])),
    buildProgression: Object.fromEntries(BUILD_CHECKPOINT_IDS.map(checkpoint => [
      checkpoint,
      summarizeBuildCheckpoint(records, checkpoint)
    ])),
    candidateEvaluationActivity,
    rejectedCandidates: summarizeRejectedCandidates(records, rejectedCandidateCrossTab),
    selectedCandidateSwapConsistency: summarizeCandidateSwapConsistency(records),
    lootBuild: summarizeLootBuild(records),
    b2ChestTrapCostAudit: summarizeChestTrapCostAudit(records),
    cumulativeCostBySource: sourceTotals,
    dominantIncrementalCostSource: totalCost > 0
      ? COST_SOURCE_IDS.slice().sort((left, right) => sourceTotals[right] - sourceTotals[left])[0]
      : null,
    buildChangeRuns: records.filter(record => record.build.shiftCount > 0).length,
    returnRuns: returnRecords.length,
    terminalDistribution: Object.fromEntries(
      records.map(record => [record.outcome, (outcomeCounts[record.outcome] || 0)])
    )
  };
}

function continuationReach(candidate) {
  const reachedFloor = Number(candidate.reachedFloor);
  return {
    b4: Number.isFinite(reachedFloor) && reachedFloor >= 4,
    b5: Number.isFinite(reachedFloor) && reachedFloor >= 5,
    b6: candidate.outcome === "syntheticCutoff" && reachedFloor >= MEASUREMENT_CUTOFF_FLOOR
  };
}

function continuationTerminalCategory(returnFloor, candidate) {
  if (["death", "died"].includes(candidate.outcome)) {
    const delta = Number(candidate.terminalFloor) - Number(returnFloor);
    if (delta === 0) return "same-floor death";
    if (delta === 1) return "+1 floor death";
    if (delta >= 2) return "+2 floors death";
  }
  return "otherTerminal";
}

function difference(left, right) {
  return finite(Number(right) - Number(left));
}

export function buildReturnContinuation(
  baselineRecords,
  candidateRecords,
  { sampleLimit = RETURN_CONTINUATION_SAMPLE_LIMIT } = {}
) {
  if (!Number.isInteger(sampleLimit) || sampleLimit < 0) {
    throw new Error(`return continuation sample limit must be a non-negative integer: ${sampleLimit}`);
  }
  const joined = buildMatchedTrajectory(baselineRecords, candidateRecords)
    .filter(({ baseline }) => baseline.outcome === "voluntaryReturn");
  const reach = { b4: 0, b5: 0, b6: 0 };
  const terminal = {
    sameFloorDeath: 0,
    oneFloorDeath: 0,
    twoPlusFloorDeath: 0,
    otherTerminal: 0
  };
  const rows = [];
  joined.forEach(({ baseline, candidate }) => {
    const returnFloor = Number(baseline.returnFloor);
    const additionalCost = Object.fromEntries(COST_SOURCE_IDS.map(source => [
      source,
      difference(baseline.cumulativeCostBySource[source], candidate.cumulativeCostBySource[source])
    ]));
    const candidateReach = continuationReach(candidate);
    Object.entries(candidateReach).forEach(([key, reached]) => {
      if (reached) reach[key]++;
    });
    const terminalCategory = continuationTerminalCategory(returnFloor, candidate);
    terminal[{
      "same-floor death": "sameFloorDeath",
      "+1 floor death": "oneFloorDeath",
      "+2 floors death": "twoPlusFloorDeath",
      otherTerminal: "otherTerminal"
    }[terminalCategory]]++;
    const row = {
      runIndex: baseline.runIndex,
      worldSeed: baseline.worldSeed,
      t0ReturnFloor: baseline.returnFloor,
      t0ReturnHp: baseline.terminalState.hp,
      t0ReturnMp: baseline.terminalState.mp,
      t0RecoveryRemaining: baseline.terminalState.recoveryRemaining,
      t1TerminalFloor: candidate.terminalFloor,
      additionalFloorsReached: Math.max(0, Number(candidate.reachedFloor) - returnFloor),
      additionalSteps: difference(baseline.totalSteps, candidate.totalSteps),
      additionalCombats: difference(baseline.totalCombatCount, candidate.totalCombatCount),
      additionalCombatDamage: additionalCost.combat + additionalCost.guardianBoss,
      additionalFloorTrapDamage: additionalCost.floorTrap,
      additionalChestTrapDamage: additionalCost.chestTrap,
      additionalPoisonStatusDamage: additionalCost.poisonStatus,
      t1TerminalCause: candidate.terminalCause,
      t1TerminalHp: candidate.terminalState.hp,
      t1TerminalMp: candidate.terminalState.mp,
      reach: candidateReach,
      terminalCategory,
      category: terminalCategory,
      lastCostEvents: candidate.lastCostEvents
    };
    if (rows.length < sampleLimit) rows.push(row);
  });
  return {
    runs: joined.length,
    reach,
    terminal,
    categories: Object.fromEntries([
      ["same-floor death", terminal.sameFloorDeath],
      ["+1 floor death", terminal.oneFloorDeath],
      ["+2 floors death", terminal.twoPlusFloorDeath],
      ["otherTerminal", terminal.otherTerminal]
    ]),
    rowSample: {
      policy: RETURN_CONTINUATION_SAMPLE_POLICY,
      limit: sampleLimit,
      totalCount: joined.length,
      retainedCount: rows.length,
      droppedCount: joined.length - rows.length
    },
    rows,
    sameFloorDeath: terminal.sameFloorDeath,
    oneFloorDeath: terminal.oneFloorDeath,
    twoPlusFloorDeath: terminal.twoPlusFloorDeath,
    b4Reach: reach.b4,
    b5Reach: reach.b5,
    b6Cutoff: reach.b6
  };
}

function reachMetric(records, floor) {
  const count = records.filter(record => Number(record.reachedFloor) >= floor).length;
  return { count, rate: rateMetric(count, records.length) };
}

function summarizeMatchedConversion(joined, label) {
  const sameTerminal = joined.filter(({ baseline, candidate }) => baseline.outcome === candidate.outcome).length;
  return {
    label,
    runs: joined.length,
    b3Reach: reachMetric(joined.map(pair => pair.candidate), 3),
    b4Reach: reachMetric(joined.map(pair => pair.candidate), 4),
    b5Reach: reachMetric(joined.map(pair => pair.candidate), 5),
    b6Cutoff: {
      count: joined.filter(({ candidate }) => candidate.outcome === "syntheticCutoff" &&
        Number(candidate.reachedFloor) >= MEASUREMENT_CUTOFF_FLOOR).length,
      rate: rateMetric(joined.filter(({ candidate }) => candidate.outcome === "syntheticCutoff" &&
        Number(candidate.reachedFloor) >= MEASUREMENT_CUTOFF_FLOOR).length, joined.length)
    },
    sameTerminal: { count: sameTerminal, rate: rateMetric(sameTerminal, joined.length) }
  };
}

export function buildMatchedConversions(baselineRecords, candidateRecords) {
  const joined = buildMatchedTrajectory(baselineRecords, candidateRecords);
  const b2Deaths = joined.filter(({ baseline }) => baseline.floors[2]?.waterfall?.died ||
    (baseline.outcome === "died" && baseline.terminalFloor === 2));
  const b3Deaths = joined.filter(({ baseline }) => baseline.floors[3]?.waterfall?.died ||
    (baseline.outcome === "died" && baseline.terminalFloor === 3));
  const b2TrapSubset = joined.filter(({ baseline }) => baseline.b2ChestTrapReceived);
  const b2TrapDeaths = b2TrapSubset.filter(({ baseline }) => baseline.floors[2]?.waterfall?.died ||
    (baseline.outcome === "died" && baseline.terminalFloor === 2));
  return {
    all: summarizeMatchedConversion(joined, "all matched runs"),
    t0B2DeathToT1: summarizeMatchedConversion(b2Deaths, "T0 B2 death → T1 continuation"),
    t0B3DeathToT1: summarizeMatchedConversion(b3Deaths, "T0 B3 death → T1 deeper reach"),
    t0B2ChestTrapSubset: summarizeMatchedConversion(b2TrapSubset, "T0 received a chest trap in B2"),
    t0B2ChestTrapDeathSubset: summarizeMatchedConversion(b2TrapDeaths, "T0 B2 death after receiving a B2 chest trap"),
    returnContinuation: buildReturnContinuation(baselineRecords, candidateRecords)
  };
}

function comparableChestEvent(event) {
  return {
    floor: event.floor,
    source: event.source,
    x: event.x,
    y: event.y,
    trap: event.trap,
    action: event.action,
    generatedItems: event.generatedItems
  };
}

function chestIdentity(event) {
  if (![event.floor, event.x, event.y].every(Number.isInteger) || !event.source) return null;
  return JSON.stringify([event.floor, event.source, event.x, event.y]);
}

export function buildMatchedChestComparison(baselineRecords, candidateRecords) {
  const joined = buildMatchedTrajectory(baselineRecords, candidateRecords);
  const exogenous = {
    sharedEvents: 0,
    mismatches: 0,
    missingCandidateEvents: 0,
    placementMismatches: 0,
    lootMismatches: 0,
    trapMismatches: 0,
    actionMismatches: 0,
    stateMismatches: 0
  };
  const endogenous = {
    sharedEvents: 0,
    mismatches: 0,
    placementMismatches: 0,
    lootMismatches: 0,
    trapMismatches: 0,
    actionMismatches: 0,
    postTreatmentIdentityComparisons: 0,
    postTreatmentIdentityMismatches: 0
  };
  let baselineEventsTotal = 0;
  let candidateEventsTotal = 0;
  joined.forEach(({ baseline, candidate }) => {
    const baselineEvents = baseline.chestLootEvents || [];
    const candidateEvents = candidate.chestLootEvents || [];
    baselineEventsTotal += baselineEvents.length;
    candidateEventsTotal += candidateEvents.length;
    const candidateByOrdinal = new Map(candidateEvents.map(event => [event.ordinal, event]));
    const candidateByIdentity = new Map();
    candidateEvents.forEach(event => {
      const identity = chestIdentity(event);
      if (identity) candidateByIdentity.set(identity, [
        ...(candidateByIdentity.get(identity) || []),
        event
      ]);
    });
    const treatmentOrdinal = baseline.chestTrapCostAudit
      ?.filter(event => Number(event.floor) === 2 && Number.isInteger(event.ordinal))
      .map(event => event.ordinal)
      .sort((left, right) => left - right)[0] ?? null;
    const compareEvent = (event, candidateEvent, target) => {
      const placementEqual = event.floor === candidateEvent.floor &&
        event.source === candidateEvent.source &&
        event.x === candidateEvent.x &&
        event.y === candidateEvent.y;
      const lootEqual = JSON.stringify(event.generatedItems) === JSON.stringify(candidateEvent.generatedItems);
      const trapEqual = event.trap === candidateEvent.trap;
      const actionEqual = event.action === candidateEvent.action;
      target.sharedEvents++;
      if (!placementEqual) target.placementMismatches++;
      if (!lootEqual) target.lootMismatches++;
      if (!trapEqual) target.trapMismatches++;
      if (!actionEqual) target.actionMismatches++;
      if (JSON.stringify(comparableChestEvent(event)) !== JSON.stringify(comparableChestEvent(candidateEvent))) {
        target.mismatches++;
      }
    };
    baselineEvents.forEach(event => {
      const isPreTreatment = treatmentOrdinal === null || event.ordinal <= treatmentOrdinal;
      const target = isPreTreatment ? exogenous : endogenous;
      const candidateEvent = candidateByOrdinal.get(event.ordinal);
      if (!candidateEvent) {
        if (isPreTreatment) target.missingCandidateEvents++;
        return;
      }
      compareEvent(event, candidateEvent, target);
      if (!isPreTreatment) {
        const identity = chestIdentity(event);
        const identityMatches = identity ? candidateByIdentity.get(identity) || [] : [];
        identityMatches.forEach(identityEvent => {
          endogenous.postTreatmentIdentityComparisons++;
          if (event.trap !== identityEvent.trap ||
            JSON.stringify(event.generatedItems) !== JSON.stringify(identityEvent.generatedItems)) {
            endogenous.postTreatmentIdentityMismatches++;
          }
        });
      }
    });
    const b1Baseline = JSON.stringify(baseline.floors[1] || null);
    const b1Candidate = JSON.stringify(candidate.floors[1] || null);
    const b2EntryBaseline = JSON.stringify(baseline.floors[2]?.entry || null);
    const b2EntryCandidate = JSON.stringify(candidate.floors[2]?.entry || null);
    exogenous.stateMismatches += Number(b1Baseline !== b1Candidate);
    exogenous.stateMismatches += Number(b2EntryBaseline !== b2EntryCandidate);
    if (treatmentOrdinal === null && baselineEvents.length !== candidateEvents.length) {
      exogenous.missingCandidateEvents += Math.abs(baselineEvents.length - candidateEvents.length);
    }
  });
  const exogenousMismatch = exogenous.mismatches +
    exogenous.missingCandidateEvents + exogenous.stateMismatches;
  const totalExogenousMismatch = exogenousMismatch;
  return {
    matchedRuns: joined.length,
    baselineEvents: baselineEventsTotal,
    candidateEvents: candidateEventsTotal,
    countEqual: baselineEventsTotal === candidateEventsTotal,
    exogenousMismatch: totalExogenousMismatch,
    exogenous,
    endogenous,
    pass: totalExogenousMismatch === 0,
    note: "B1/B2-entry and chest events through the first T0 B2 trap are exogenous parity checks; post-treatment chest exposure divergence is reported, not failed"
  };
}

function worldSeedFor(seed, runIndex) {
  return `run-difficulty:${seed}:${runIndex}`;
}

function normalizeOptions({
  runs,
  seed,
  startingKitIds,
  scenarioIds,
  treatment = "portal-policy",
  allowSmallRunCount = false,
  collectEquipmentCandidateAudit = false
} = {}) {
  const minimum = allowSmallRunCount ? 1 : DEFAULT_RUNS;
  const normalizedRuns = integer(runs ?? DEFAULT_RUNS, "runs", minimum);
  const normalizedSeed = integer(seed ?? DEFAULT_SEED, "seed");
  const kits = [...(startingKitIds || STARTING_KIT_IDS)];
  const scenarios = [...(scenarioIds || WORKSHOP_SCENARIO_IDS)];
  if (!kits.length || kits.some(id => !STARTING_KIT_IDS.includes(id))) {
    throw new Error(`startingKitIds must be drawn from ${STARTING_KIT_IDS.join("|")}`);
  }
  if (!scenarios.length || scenarios.some(id => !WORKSHOP_SCENARIO_IDS.includes(id))) {
    throw new Error(`scenarioIds must be drawn from ${WORKSHOP_SCENARIO_IDS.join("|")}`);
  }
  if (!Object.hasOwn(MEASUREMENT_TREATMENTS, treatment)) {
    throw new Error(`treatment must be ${Object.keys(MEASUREMENT_TREATMENTS).join("|")}: ${treatment}`);
  }
  return {
    runs: normalizedRuns,
    seed: normalizedSeed,
    startingKitIds: kits,
    scenarioIds: scenarios,
    treatment,
    collectEquipmentCandidateAudit: Boolean(collectEquipmentCandidateAudit)
  };
}

export async function runMeasurement(options = {}) {
  const config = normalizeOptions(options);
  const treatment = MEASUREMENT_TREATMENTS[config.treatment];
  applyStandardSimulationEnv({
    ...STANDARD_BALANCE_CONFIG,
    seed: config.seed,
    runs: config.runs
  });
  const { getScenarioById, resetSimulationRandom, simulateRun } =
    await import("../simulations/sim_depth_material_ev.js");
  const runOne = ({
    scenarioId,
    startingKitId,
    policy,
    runIndex,
    audit = config.collectEquipmentCandidateAudit,
    candidateSampleCollector = null
  }) => {
    const baseScenario = getScenarioById(scenarioId);
    const worldSeed = worldSeedFor(config.seed, runIndex);
    const result = simulateRun({
      className: "Fighter",
      startFloor: 1,
      targetDepth: MEASUREMENT_CUTOFF_FLOOR,
      runIndex,
      seriesId: `early-run-attrition:${scenarioId}:${startingKitId}`,
      scoringProfile: null,
      scenario: {
        ...baseScenario,
        startingKit: startingKitId,
        portalPolicyId: policy.portalPolicyId,
        portalHpThreshold: policy.portalHpThreshold,
        chestTrapCostSuppressionFloor: policy.chestTrapCostSuppressionFloor ?? null,
        collectEncounterIdentities: true,
        collectStage15Diagnostics: true,
        simDiagnosticLevel: "full"
      },
      workshop: baseScenario.workshop,
      worldSeed,
      collectDiagnostics: true,
      collectBuildSnapshots: true,
      collectEquipmentTelemetry: true,
      collectEquipmentCandidateAudit: audit
    });
    return compactRun(result, {
      scenarioId,
      startingKitId,
      policyId: policy.id,
      runIndex,
      worldSeed,
      candidateSampleCollector
    });
  };

  const determinism = {};
  const observationInvariance = {};
  const probe = {
    scenarioId: config.scenarioIds[0],
    startingKitId: config.startingKitIds[0],
    runIndex: 0
  };
  for (const policy of Object.values(treatment.policies)) {
    resetSimulationRandom(config.seed);
    const first = runOne({ ...probe, policy });
    resetSimulationRandom(config.seed);
    const second = runOne({ ...probe, policy });
    determinism[policy.id] = {
      pass: JSON.stringify(first) === JSON.stringify(second),
      comparedRun: {
        scenarioId: probe.scenarioId,
        startingKitId: probe.startingKitId,
        runIndex: probe.runIndex,
        worldSeed: worldSeedFor(config.seed, probe.runIndex)
      }
    };
    if (!determinism[policy.id].pass) throw new Error(`trajectory determinism probe failed: ${policy.id}`);
    if (config.collectEquipmentCandidateAudit) {
      resetSimulationRandom(config.seed);
      const auditOff = runOne({ ...probe, policy, audit: false });
      resetSimulationRandom(config.seed);
      const auditOn = runOne({ ...probe, policy, audit: true });
      observationInvariance[policy.id] = compareObservationInvariance(auditOff, auditOn);
      if (!observationInvariance[policy.id].pass) {
        throw new Error(`equipment candidate audit changed gameplay result: ${policy.id}`);
      }
    }
  }

  const cases = [];
  for (const scenarioId of config.scenarioIds) {
    for (const startingKitId of config.startingKitIds) {
      const records = {};
      const candidateSampleCollectors = {
        t0: config.collectEquipmentCandidateAudit
          ? createCandidateAuditSampleCollector()
          : null,
        t1: config.collectEquipmentCandidateAudit
          ? createCandidateAuditSampleCollector()
          : null
      };
      const runEvidenceSampleCollectors = {
        t0: createRunEvidenceSampleCollector(),
        t1: createRunEvidenceSampleCollector()
      };
      const t0Policy = treatment.policies.t0;
      const t1Policy = treatment.policies.t1;
      resetSimulationRandom(config.seed);
      records.t0 = [];
      for (let runIndex = 0; runIndex < config.runs; runIndex++) {
        const record = runOne({
          scenarioId,
          startingKitId,
          policy: t0Policy,
          runIndex,
          candidateSampleCollector: candidateSampleCollectors.t0
        });
        records.t0.push(record);
        runEvidenceSampleCollectors.t0.add(record);
      }
      resetSimulationRandom(config.seed);
      records.t1 = [];
      for (let runIndex = 0; runIndex < config.runs; runIndex++) {
        const record = runOne({
          scenarioId,
          startingKitId,
          policy: t1Policy,
          runIndex,
          candidateSampleCollector: candidateSampleCollectors.t1
        });
        records.t1.push(record);
        runEvidenceSampleCollectors.t1.add(record);
      }
      const t0 = records.t0;
      const t1 = records.t1;
      const t0Aggregate = aggregateCondition(t0);
      const t1Aggregate = aggregateCondition(t1);
      const t0CandidateAuditSample = candidateSampleCollectors.t0?.finalize() || null;
      const t1CandidateAuditSample = candidateSampleCollectors.t1?.finalize() || null;
      const t0RunEvidenceSample = runEvidenceSampleCollectors.t0.finalize();
      const t1RunEvidenceSample = runEvidenceSampleCollectors.t1.finalize();
      const matchedConversions = buildMatchedConversions(t0, t1);
      cases.push({
        scenarioId,
        startingKitId,
        policies: {
          t0: {
            ...treatment.policies.t0,
            aggregate: t0Aggregate,
            candidateAuditSample: t0CandidateAuditSample,
            runEvidenceSample: t0RunEvidenceSample
          },
          t1: {
            ...treatment.policies.t1,
            aggregate: t1Aggregate,
            candidateAuditSample: t1CandidateAuditSample,
            runEvidenceSample: t1RunEvidenceSample
          }
        },
        matchedConversions,
        matchedChestComparison: buildMatchedChestComparison(t0, t1),
        returnContinuation: matchedConversions.returnContinuation
      });
    }
  }
  const configuration = {
    runs: config.runs,
    seed: config.seed,
    startFloor: 1,
    observedFloors: [...TRAJECTORY_FLOORS],
    measurementCutoff: "B6",
    startingKitIds: config.startingKitIds,
    scenarioIds: config.scenarioIds,
    treatment: treatment.id,
    candidateAudit: config.collectEquipmentCandidateAudit,
    runEvidenceSampleLimit: RUN_EVIDENCE_SAMPLE_LIMIT,
    returnContinuationSampleLimit: RETURN_CONTINUATION_SAMPLE_LIMIT,
    treatmentDescription: treatment.description,
    policies: Object.values(treatment.policies).map(policy => ({ ...policy })),
    matchedIdentity: hashConfiguration({
      source: "production-simulateRun",
      seed: config.seed,
      runs: config.runs,
      startingKitIds: config.startingKitIds,
      scenarioIds: config.scenarioIds,
      observedFloors: TRAJECTORY_FLOORS,
      measurementCutoff: MEASUREMENT_CUTOFF_FLOOR,
      worldSeedTemplate: "run-difficulty:{seed}:{runIndex}",
      treatment: treatment.id,
      policies: Object.values(treatment.policies),
      matchedKey: "runIndex + worldSeed"
    }),
    seedPolicy: "same production worldSeed per runIndex across T0/T1; simulator RNG reset per condition",
    sourceOfTruth: "src/state/initial_state.js STARTING_KITS",
    productionPath: "scratch/simulations/sim_depth_material_ev.js simulateRun",
    costAttribution: "diagnostics.costEvents grouped by floor; unseparable sources remain null/unobserved",
    classNameBridge: "Fighter is a scratch-only simulator entry shim; scenario.startingKit creates production kit state"
  };
  return {
    schemaVersion: SCHEMA_VERSION,
    runnerVersion: RUNNER_VERSION,
    configuration,
    comparisonKey: hashConfiguration(configuration),
    determinism: {
      pass: Object.values(determinism).every(value => value.pass),
      byPolicy: determinism,
      treatment: treatment.id
    },
    observationInvariance,
    cases
  };
}

export function buildReport(result, provenance = null, environmentSignature = null, {
  purpose = null,
  requestedRef = null,
  measurementId = "early-run-attrition"
} = {}) {
  const cases = (result.cases || []).map(testCase => ({
    ...testCase,
    policies: Object.fromEntries(Object.entries(testCase.policies || {}).map(([policyId, policy]) => {
      const boundedPolicy = { ...policy };
      delete boundedPolicy.records;
      return [policyId, boundedPolicy];
    }))
  }));
  const determinism = {
    pass: Boolean(result.determinism?.pass),
    byPolicy: Object.fromEntries(Object.entries(result.determinism?.byPolicy || {}).map(([policyId, value]) => [
      policyId,
      {
        pass: Boolean(value.pass),
        comparedRun: value.comparedRun || null
      }
    ])),
    treatment: result.determinism?.treatment || null
  };
  return {
    measurement: {
      measurementId,
      schemaVersion: result.schemaVersion,
      runnerVersion: result.runnerVersion,
      purpose,
      requestedRef,
      sourceCommit: provenance?.sourceCommit || null,
      gameplaySourceCommit: provenance?.gameplaySourceCommit || null,
      measurementRunnerCommit: provenance?.measurementRunnerCommit || null,
      measurementRunnerPaths: provenance?.measurementRunnerPaths || [...MEASUREMENT_RUNNER_PATHS],
      measurementRunnerDiffSha256: provenance?.measurementRunnerDiffSha256 || null,
      baseRef: provenance?.baseRef || null,
      baseCommit: provenance?.baseCommit || null,
      originMainAncestor: provenance?.originMainAncestor ?? null,
      staleTreeAllowed: provenance?.staleTreeAllowed ?? null,
      workingTreeClean: provenance?.workingTreeClean ?? null,
      environmentSignature,
      environmentSignatureHash: environmentSignature ? hashConfiguration(environmentSignature) : null,
      productionMechanism: "simulateRun",
      rawTracePolicy:
        "full compact run records are transient; report retains aggregate evidence plus bounded deterministic run/candidate/continuation samples and last-three cost events",
      candidateAuditSamplePolicy: CANDIDATE_AUDIT_SAMPLE_POLICY,
      candidateAuditSampleLimit: CANDIDATE_AUDIT_SAMPLE_LIMIT,
      runEvidenceSamplePolicy: RUN_EVIDENCE_SAMPLE_POLICY,
      runEvidenceSampleLimit: RUN_EVIDENCE_SAMPLE_LIMIT,
      returnContinuationSamplePolicy: RETURN_CONTINUATION_SAMPLE_POLICY,
      returnContinuationSampleLimit: RETURN_CONTINUATION_SAMPLE_LIMIT,
      unobserved: [...UNOBSERVED_FIELDS]
    },
    configuration: result.configuration,
    comparisonKey: result.comparisonKey,
    determinism,
    observationInvariance: result.observationInvariance,
    cases,
    interpretation: {
      candidates: [
        "A — B1 combat-dominated",
        "B — B2 carry-over attrition-dominated",
        "C — B3–B5 trap/exploration-dominated",
        "D — recovery exhaustion-dominated",
        "E — mixed",
        "F — instrumentation-limited"
      ],
      decision: "human review after durable N>=1000 measurement; no automatic balance classification",
      productionRecommendation: "none; T1 is a causal probe, not a production candidate",
      nextAxis: "select at most one follow-up axis from measured evidence"
    }
  };
}

function fmt(value, digits = 2) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : "—";
}

function pct(metric) {
  return metric?.estimate === null || metric?.estimate === undefined
    ? "—"
    : `${(metric.estimate * 100).toFixed(1)}%`;
}

function waterfallCell(row) {
  return `${row.entered}/${row.reachedNextFloor}/${row.died}/${row.voluntaryReturn}/${row.otherTerminal}`;
}

function distributionCell(distribution, suffix = "") {
  if (!distribution || distribution.n === 0) return "unobserved";
  return `${fmt(distribution.p10)} / ${fmt(distribution.p50)} / ${fmt(distribution.p90)}${suffix}`;
}

function rateCell(value) {
  return Number.isFinite(Number(value)) ? `${(Number(value) * 100).toFixed(1)}%` : "unobserved";
}

export function rankBuildCompositions(compositions, limit = 8) {
  return Object.entries(compositions || {})
    .sort(([leftKey, leftCount], [rightKey, rightCount]) =>
      Number(rightCount) - Number(leftCount) || leftKey.localeCompare(rightKey)
    )
    .slice(0, limit);
}

function buildProgressionLines(policy) {
  const progression = policy.aggregate.buildProgression;
  const checkpointRows = BUILD_CHECKPOINT_IDS.map(checkpoint => {
    const row = progression[checkpoint];
    const population = row.population;
    const combat = row.combatGrowth;
    const safety = row.explorationSafetyGrowth.support;
    const maturity = row.buildMaturity;
    const trapBonus = safety.trapBonus;
    const trapGuard = safety.trapGuard;
    const checkpointLabel = checkpoint === "runStart"
      ? "Run Start"
      : checkpoint === "terminal" ? "Terminal" : checkpoint;
    return `| ${checkpointLabel} | ${population.condition} | ${population.entered} | ${population.reachedNextFloor ?? "—"} | ${population.died ?? "—"} | ${population.voluntaryReturn ?? "—"} | ${population.otherTerminal ?? "—"} | ${distributionCell(combat.atk.delta)} | ${distributionCell(combat.def.delta)} | ${distributionCell(combat.maxHp.delta)} | ${distributionCell(combat.maxMp.delta)} | ${distributionCell(trapBonus?.value)} | ${trapGuard ? `${trapGuard.holderCount}/${population.entered} (${rateCell(trapGuard.holderRate)})` : "unobserved"} | ${distributionCell(maturity.changedEquipmentSlots)} | ${distributionCell(maturity.cumulativeEquipmentSwaps)} | ${rateCell(maturity.buildIdentityChangedRate)} |`;
  });
  const supplyRows = TRAJECTORY_FLOORS.map(floor => {
    const supply = policy.aggregate.distributions[floor].lootSupply;
    return `| B${floor} | ${supply.status} | ${supply.lootEvents} | ${supply.meaningfulOpportunities} | ${supply.equipmentOpportunities} | ${supply.runeOpportunities} | ${supply.buildOpportunities} |`;
  });
  const decisionRows = TRAJECTORY_FLOORS.map(floor => {
    const activity = policy.aggregate.distributions[floor].equipmentDecisionActivity;
    return `| B${floor} | ${activity.status} | ${activity.evaluationEvents ?? "—"} | ${activity.evaluableEvents ?? "—"} | ${activity.qualifiedEvents ?? "—"} | ${activity.selectedEvents ?? "—"} | ${activity.observableBuildChanges ?? "—"} |`;
  });
  const candidateActivity = policy.aggregate.candidateEvaluationActivity;
  const candidateActivityRows = TRAJECTORY_FLOORS.flatMap(floor => {
    const activity = candidateActivity?.byFloor?.[String(floor)];
    return Object.entries(activity?.categories || {}).map(([category, metric]) =>
      `| B${floor} | ${category} | ${activity.status} | ${metric.candidateCount ?? "—"} | ${metric.evaluable ?? "—"} | ${metric.qualifies ?? "—"} | ${metric.selected ?? "—"} | ${metric.affectedRunCount ?? "—"} | ${rateCell(metric.affectedRunRate)} |`
    );
  });
  const rejected = policy.aggregate.rejectedCandidates;
  const sidegradeRows = Object.entries(rejected.classifications).map(([id, values]) =>
    `| ${id} | ${values.totalCount} | ${values.affectedRunCount} | ${rateCell(values.affectedRunRate)} | ${rateCell(values.perRunRate)} |`
  );
  const rejectionCrossTabRows = TRAJECTORY_FLOORS.flatMap(floor => {
    const floorCrossTab = rejected.crossTab?.byFloor?.[String(floor)];
    return REJECTION_REASON_IDS.flatMap(reason => SIDEGRADE_CLASSIFICATIONS.map(classification => {
      const metric = floorCrossTab?.byRejectionReason?.[reason]?.[classification];
      return metric?.rejectedCandidateCount > 0
        ? `| B${floor} | ${reason} | ${classification} | ${metric.rejectedCandidateCount} | ${metric.affectedRunCount} | ${rateCell(metric.affectedRunRate)} |`
        : null;
    }).filter(Boolean));
  });
  const strictUpgradeReasons = rejectionCrossTabRows
    .filter(row => row.includes("| strictUpgrade |"))
    .map(row => row.replace(/^\| /, "").replace(/ \|/g, "").split(" | ").slice(0, 4).join(" / "))
    .join(", ") || "observed zero";
  const b2 = progression.B2Entry;
  const b3 = progression.B3Entry;
  const composition = rankBuildCompositions(progression.B5Entry.buildMaturity.coreCompositions)
    .map(([key, count]) => `${key}=${count}`)
    .join(", ") || "unobserved";
  return [
    "",
    `## Build progression audit — ${policy.id}`,
    "",
    "Population uses each checkpoint entrant; B2/B3/B4/B5 are conditional populations, not only terminal survivors.",
    "Combat Growth = ATK / DEF / max HP / max MP relative to Run Start.",
    "Exploration Safety Growth = Build Snapshot exploration Support values and holder rates; it is not folded into Combat Growth.",
    "Build Maturity = changed equipment slots, cumulative swaps, Core / Support / Rune / spell composition, and Build Snapshot identity.",
    "Loot supply and equipment decision activity are reported separately; no loot-to-candidate conversion rate is claimed because reward events and candidate audits have no stable cross-link.",
    "",
    "| checkpoint | population | entered | next | died | Return | other | ΔATK p10/p50/p90 | ΔDEF p10/p50/p90 | ΔmaxHP p10/p50/p90 | ΔmaxMP p10/p50/p90 | trapBonus p10/p50/p90 | trapGuard holders | changed slots p10/p50/p90 | swaps p10/p50/p90 | identity changed |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | --- | --- | --- | --- | --- | ---: |",
    ...checkpointRows,
    "",
    "Build maturity composition observed at B5 entrants (top 8): " + composition,
    `B2 entrant → B3 entrant: ${b2.population.entered} → ${b3.population.entered}; B2 Build state is summarized above before the B3 selection population.`,
    `Core IDs observed at B5: ${(progression.B5Entry.buildMaturity.mainCoreIds || []).join(", ") || "unobserved"} / ${(progression.B5Entry.buildMaturity.auxiliaryCoreIds || []).join(", ") || "unobserved"}; Support IDs: ${(progression.B5Entry.buildMaturity.supportIds || []).join(", ") || "unobserved"}; active Rune IDs: ${(progression.B5Entry.buildMaturity.activeRuneSpellIds || []).join(", ") || "unobserved"}; spell IDs: ${(progression.B5Entry.buildMaturity.spellIds || []).join(", ") || "unobserved"}.`,
    "",
    "### Loot supply",
    "",
    "| floor | status | loot events | meaningful | equipment | Rune | build-category |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: |",
    ...supplyRows,
    "",
    "### Equipment decision activity (not a conversion funnel)",
    "",
    "| floor | status | evaluation events | evaluable events | qualified events | selected events | observable Build changes |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: |",
    ...decisionRows,
    "",
    "### Exploration Support candidate evaluation activity (not a conversion funnel)",
    "",
    "Candidate count is evaluation-event count; support rows count an event once per positive support delta. affected-run rate denominator is floor entrants.",
    "| floor | category | status | candidate count | evaluable | qualifies | selected | affected runs | affected-run rate |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...candidateActivityRows,
    "",
    `- selected candidate ↔ swap telemetry: ${policy.aggregate.selectedCandidateSwapConsistency.status === "observed" ? (policy.aggregate.selectedCandidateSwapConsistency.pass ? "PASS" : "FAIL") : "unobserved"}; selected=${policy.aggregate.selectedCandidateSwapConsistency.selectedCandidateCount ?? "—"}; swaps=${policy.aggregate.selectedCandidateSwapConsistency.swapTelemetryCount ?? "—"}`,
    "",
    "### Rejected candidate sidegrade classification",
    "",
    `- status: ${rejected.status}; rejected evaluable candidates=${rejected.evaluableRejectedCandidateCount}; affected runs=${rejected.affectedRunCount}`,
    "",
    "| classification | total count | affected runs | affected-run rate | per-run rate |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...sidegradeRows,
    "",
    "| floor | rejection reason | sidegrade classification | rejected candidate count | affected runs | affected-run rate |",
    "| --- | --- | --- | ---: | ---: | ---: |",
    ...(rejectionCrossTabRows.length ? rejectionCrossTabRows : ["| — | observed zero | — | 0 | 0 | 0.0% |"]),
    "",
    `strictUpgrade rejected reason cross-tab: ${strictUpgradeReasons}`,
    "Classifications describe candidate features independently of greedy selection; they do not recommend an equipment choice.",
    "Candidate activity counts are evaluation events; the same candidate can be re-evaluated while the existing greedy loop converges. They are not loot conversion counts or unique item counts.",
    "Rune supply is observed separately; Rune-to-equipment evaluation linkage is unobserved.",
    "observed zero is represented by numeric zero; unobserved candidate features are null/status=unobserved; unreachable checkpoints keep status=unreachable.",
    "Combat Growth and Exploration Safety Growth remain separate axes; no weighted Build Power score is reported.",
    "Diagnostic hypotheses for human review only: Loot starvation, Quality starvation, Decision-model problem, Healthy Build progression / insufficient survival, and Survivorship bottleneck. No automatic threshold or single diagnosis is applied."
  ];
}

export function buildSummary(report) {
  const lines = [
    "# Early run attrition trajectory",
    "",
    `- source SHA: \`${report.measurement.sourceCommit || "not recorded"}\`; runner: \`${report.measurementRunnerCommit || report.measurement.measurementRunnerCommit || "not recorded"}\`; schema: ${report.runnerVersion || report.measurement.runnerVersion}`,
    `- N=${report.configuration.runs}/condition; seed=${report.configuration.seed}; observed B1–B5; B6 is a synthetic measurement cutoff, never voluntary Return`,
    report.configuration.treatment === "b2-chest-trap"
      ? "- T0 = current production; T1 = B2 chest-trap HP/status Cost suppressed at application boundary only"
      : "- T0 = current P0 / Portal HP threshold 35%; T1 = P2 push probe / HP-threshold auto-Return disabled only",
    `- matched identity: \`${report.configuration.matchedIdentity}\`; key = \`(runIndex, worldSeed)\``,
    `- determinism: ${report.determinism.pass ? "PASS" : "FAIL"}`,
    "",
    "Waterfall cell = entered / next / death / Return / other terminal.",
    "",
    "| workshop / kit / policy | floor | waterfall | entry HP p50 | entry MP p50 | dominant incremental source |",
    "| --- | --- | ---: | ---: | ---: | --- |"
  ];
  report.cases.forEach(testCase => {
    Object.values(testCase.policies).forEach(policy => {
      TRAJECTORY_FLOORS.forEach(floor => {
        const waterfall = policy.aggregate.waterfall[floor];
        const distribution = policy.aggregate.distributions[floor];
        lines.push(
          `| ${testCase.scenarioId} / ${testCase.startingKitId} / ${policy.id} | B${floor} | ${waterfallCell(waterfall)} | ${pct(Number.isFinite(distribution.entryHpRatio.p50) ? { estimate: distribution.entryHpRatio.p50 } : null)} | ${pct(Number.isFinite(distribution.entryMpRatio.p50) ? { estimate: distribution.entryMpRatio.p50 } : null)} | ${distribution.dominantIncrementalCostSource || "—"} |`
        );
      });
      const continuation = policy.id === "t1" ? testCase.returnContinuation : null;
      if (continuation) {
        lines.push(
          `| ${testCase.scenarioId} / ${testCase.startingKitId} / T0 Return → T1 | cohort | ${continuation.runs} | reach B4 ${continuation.reach.b4}; B5 ${continuation.reach.b5}; B6 ${continuation.reach.b6} | same-floor death ${continuation.terminal.sameFloorDeath} | +1 floor death ${continuation.terminal.oneFloorDeath} | +2 floors death ${continuation.terminal.twoPlusFloorDeath}; other ${continuation.terminal.otherTerminal} |`
        );
      }
      if (report.configuration.treatment === "b2-chest-trap" && policy.id === "t1") {
        const t0 = testCase.policies.t0.aggregate;
        const t1 = testCase.policies.t1.aggregate;
        const t1Audit = t1.b2ChestTrapCostAudit;
        const conversions = testCase.matchedConversions;
        lines.push(
          "",
          `### ${testCase.scenarioId} / ${testCase.startingKitId} — B2 attrition and matched conversion`,
          "",
          `- T0 B2 HP p50: entry ${fmt(t0.distributions[2].entryHp.p50)} → exit ${fmt(t0.distributions[2].exitHp.p50)}; T1: entry ${fmt(t1.distributions[2].entryHp.p50)} → exit ${fmt(t1.distributions[2].exitHp.p50)}`,
          `- T0 B2 recovery p50: entry ${fmt(t0.distributions[2].recoveryRemainingEntry.p50)} → exit ${fmt(t0.distributions[2].recoveryRemainingExit.p50)}; T1: entry ${fmt(t1.distributions[2].recoveryRemainingEntry.p50)} → exit ${fmt(t1.distributions[2].recoveryRemainingExit.p50)}`,
          `- B2 damage p50 T0/T1: combat ${fmt(t0.distributions[2].combatDamageHp.p50)}/${fmt(t1.distributions[2].combatDamageHp.p50)}, chest trap ${fmt(t0.distributions[2].chestTrapDamageHp.p50)}/${fmt(t1.distributions[2].chestTrapDamageHp.p50)}, floor trap ${fmt(t0.distributions[2].floorTrapDamageHp.p50)}/${fmt(t1.distributions[2].floorTrapDamageHp.p50)}, poison/status ${fmt(t0.distributions[2].poisonStatusDamageHp.p50)}/${fmt(t1.distributions[2].poisonStatusDamageHp.p50)}`,
          `- T1 B2 chest-trap Cost audit: events ${t1Audit.events}; applied HP ${fmt(t1Audit.appliedDamageHp)}; applied status ${fmt(t1Audit.appliedStatusApplications)}; measured zero=${t1Audit.appliedCostZero ? "yes" : "no"}; observed trap events=${t1Audit.events > 0 ? "yes" : "no"}`,
          `- B2 death causes T0/T1: ${JSON.stringify(t0.distributions[2].deathCauses)}/${JSON.stringify(t1.distributions[2].deathCauses)}`,
          `- Matched T0 B2 death → T1 reach: B3 ${conversions.t0B2DeathToT1.b3Reach.count}/${conversions.t0B2DeathToT1.runs}, B4 ${conversions.t0B2DeathToT1.b4Reach.count}/${conversions.t0B2DeathToT1.runs}, B5 ${conversions.t0B2DeathToT1.b5Reach.count}/${conversions.t0B2DeathToT1.runs}, B6 cutoff ${conversions.t0B2DeathToT1.b6Cutoff.count}/${conversions.t0B2DeathToT1.runs}`,
          `- Matched T0 B3 death → T1 deeper: B4 ${conversions.t0B3DeathToT1.b4Reach.count}/${conversions.t0B3DeathToT1.runs}; T0 Return → T1 continuation rows ${conversions.returnContinuation.runs}; same terminal ${conversions.all.sameTerminal.count}/${conversions.all.runs}`,
          `- T0 B2 chest-trap received subset: ${conversions.t0B2ChestTrapSubset.runs} runs; B5 reach ${conversions.t0B2ChestTrapSubset.b5Reach.count}/${conversions.t0B2ChestTrapSubset.runs}; T0 B2 death subset ${conversions.t0B2ChestTrapDeathSubset.runs} runs`,
          `- Exogenous/world parity: ${testCase.matchedChestComparison.pass ? "PASS" : "FAIL"}; B1/B2-entry state mismatches=${testCase.matchedChestComparison.exogenous.stateMismatches}; pre-treatment chest shared=${testCase.matchedChestComparison.exogenous.sharedEvents}; mismatches=${testCase.matchedChestComparison.exogenous.mismatches}; missing=${testCase.matchedChestComparison.exogenous.missingCandidateEvents}`,
          `- Endogenous/post-treatment chest exposure divergence (expected/allowed): T0/T1 chest events=${testCase.matchedChestComparison.baselineEvents}/${testCase.matchedChestComparison.candidateEvents}; shared=${testCase.matchedChestComparison.endogenous.sharedEvents}; mismatches=${testCase.matchedChestComparison.endogenous.mismatches} (placement ${testCase.matchedChestComparison.endogenous.placementMismatches}, loot ${testCase.matchedChestComparison.endogenous.lootMismatches}, trap ${testCase.matchedChestComparison.endogenous.trapMismatches}, action ${testCase.matchedChestComparison.endogenous.actionMismatches}); same-identity trap/loot mismatches=${testCase.matchedChestComparison.endogenous.postTreatmentIdentityMismatches}/${testCase.matchedChestComparison.endogenous.postTreatmentIdentityComparisons}`,
          `- Loot/build T0: chests ${t0.lootBuild.chestEvents}, loot ${t0.lootBuild.lootOpportunities}, equipment ${t0.lootBuild.equipmentOpportunities}, build ${t0.lootBuild.buildOpportunities}, shifts ${t0.lootBuild.buildChanges}; T1: chests ${t1.lootBuild.chestEvents}, loot ${t1.lootBuild.lootOpportunities}, equipment ${t1.lootBuild.equipmentOpportunities}, build ${t1.lootBuild.buildOpportunities}, shifts ${t1.lootBuild.buildChanges}`,
          `- Ending Build Snapshot identities T0/T1: ${Object.keys(t0.lootBuild.endingBuildSnapshots).length}/${Object.keys(t1.lootBuild.endingBuildSnapshots).length}`
        );
      }
      if (report.measurement.measurementId === "build-progression-audit") {
        lines.push(...buildProgressionLines(policy));
      }
    });
  });
  lines.push(
    "",
    "## Interpretation boundary",
    "",
    report.configuration.treatment === "b2-chest-trap"
      ? "- 暫定解釈: A（B2 chest trap dominant）〜E（Instrumentation-limited）を人手判定。固定閾値による自動判定なし。chest matched comparison が FAIL の場合、E寄りとしてB3以降の因果解釈を保留。"
      : "- Interpretation: human review of measured evidence; no automatic balance classification.",
    report.configuration.treatment === "b2-chest-trap"
      ? "- 判定軸: A=罠抑制でB2/B3+改善、B=combat等との混合、C=B2局所、D=差小、E=RNG divergence/識別不足。"
      : null,
    "- This is production-path diagnostic evidence, not balance tuning or a player-facing difficulty tier.",
    "- `combat`, `guardianBoss`, `floorTrap`, `chestTrap`, and `poisonStatus` are grouped only from emitted production cost events. Flee/parting and inseparable in-combat status damage remain unobserved rather than zero.",
    "- No raw combat log is persisted; each run keeps floor state, aggregate costs, terminal state, build snapshots, and at most the last three compact cost events.",
    "- T1 is a matched causal probe and is not a production recommendation."
  );
  if (report.measurement.measurementId === "build-progression-audit") {
    const invarianceValues = Object.values(report.observationInvariance || {});
    const invarianceStatus = invarianceValues.length === 0
      ? "unobserved"
      : invarianceValues.every(value => value.pass) ? "PASS" : "FAIL";
    lines.splice(6, 0, `- observation invariance (candidate audit ON/OFF): ${invarianceStatus}`);
  }
  return lines.filter(line => line !== null).join("\n");
}

export function buildManifest(report, { runType = "diagnostic" } = {}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    status: "success",
    baselineCandidate: false,
    runType,
    purpose: report.measurement.purpose,
    source: {
      sourceSha: report.measurement.sourceCommit,
      gameplaySourceSha: report.measurement.gameplaySourceCommit,
      runnerSha: report.measurement.measurementRunnerCommit,
      runnerVersion: report.measurement.runnerVersion,
      schemaVersion: report.measurement.schemaVersion,
      paths: report.measurement.measurementRunnerPaths
    },
    provenance: {
      baseRef: report.measurement.baseRef,
      baseCommit: report.measurement.baseCommit,
      originMainAncestor: report.measurement.originMainAncestor,
      staleTreeAllowed: report.measurement.staleTreeAllowed,
      workingTreeClean: report.measurement.workingTreeClean,
      measurementRunnerDiffSha256: report.measurement.measurementRunnerDiffSha256,
      runEvidenceSampling: report.cases.flatMap(testCase =>
        Object.entries(testCase.policies).map(([policyId, policy]) => ({
          scenarioId: testCase.scenarioId,
          startingKitId: testCase.startingKitId,
          policyId,
          ...(policy.runEvidenceSample
            ? {
                policy: policy.runEvidenceSample.policy,
                limit: policy.runEvidenceSample.limit,
                totalCount: policy.runEvidenceSample.totalCount,
                retainedCount: policy.runEvidenceSample.retainedCount,
                droppedCount: policy.runEvidenceSample.droppedCount
              }
            : { status: "unobserved" })
        }))
      ),
      candidateAuditSampling: report.cases.flatMap(testCase =>
        Object.entries(testCase.policies).map(([policyId, policy]) => ({
          scenarioId: testCase.scenarioId,
          startingKitId: testCase.startingKitId,
          policyId,
          ...(policy.candidateAuditSample
            ? {
                policy: policy.candidateAuditSample.policy,
                limit: policy.candidateAuditSample.limit,
                totalCount: policy.candidateAuditSample.totalCount,
                retainedCount: policy.candidateAuditSample.retainedCount,
                droppedCount: policy.candidateAuditSample.droppedCount
              }
            : { status: "unobserved" })
        }))
      )
    },
    configuration: report.configuration,
    environment: {
      signature: report.measurement.environmentSignature,
      signatureHash: report.measurement.environmentSignatureHash
    },
    matching: {
      identity: report.configuration.matchedIdentity,
      keyFields: ["runIndex", "worldSeed"],
      duplicateMissingMismatch: "fail-fast",
      candidateOrderIndependent: true
    },
    cutoff: {
      floor: MEASUREMENT_CUTOFF_FLOOR,
      semantics: "synthetic measurement cutoff; never voluntary Return"
    },
    artifactPolicy: {
      rawCombatLog: "omitted",
      boundedTerminalCostEvents: 3,
      fullRunRecords: "omitted",
      runEvidenceSampleLimit: RUN_EVIDENCE_SAMPLE_LIMIT,
      returnContinuationSampleLimit: RETURN_CONTINUATION_SAMPLE_LIMIT
    },
    workflow: {
      repository: process.env.MEASUREMENT_REPOSITORY || null,
      runId: process.env.MEASUREMENT_WORKFLOW_RUN_ID || null,
      url: process.env.MEASUREMENT_WORKFLOW_RUN_URL || null,
      requestedRef: report.measurement.requestedRef || null
    }
  };
}

export function printMeasurementEnvSignature(config) {
  return printEnvSignatureBanner(getStandardSimulationEnv(config), { label: "trajectory env" });
}
