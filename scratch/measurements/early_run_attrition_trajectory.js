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

export const RUNNER_VERSION = "early-run-attrition-trajectory-v1";
export const SCHEMA_VERSION = 1;
export const DEFAULT_RUNS = 1000;
export const DEFAULT_SEED = 1277;
export const TRAJECTORY_FLOORS = Object.freeze([1, 2, 3, 4, 5]);
export const MEASUREMENT_CUTOFF_FLOOR = 6;
export const STARTING_KIT_IDS = Object.freeze(STARTING_KITS.map(kit => kit.id));
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
export const MEASUREMENT_RUNNER_PATHS = Object.freeze([
  "scratch/measurements/early_run_attrition_trajectory.js",
  "scratch/measurements/measure_early_run_attrition_trajectory.js",
  "scratch/simulations/sim_depth_material_ev.js",
  "scratch/measurements/balance_measurement.js",
  "scratch/measurements/measurement_provenance.js",
  "scratch/measurements/measurement_env_signature.js",
  "src/state/initial_state.js",
  "src/rules/build_snapshot.js",
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
  "flee/parting damage is not separately emitted by production telemetry",
  "enemy-inflicted poison/status damage can be inseparable from combat damage",
  "merchant recovery acquisition is not present in diagnostic rewardEvents"
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
  return {
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

function compactFloor(stage, result, groupedCosts, rewardEvents, recoveryEvents, encounters) {
  if (!stage) return null;
  const floor = Number(stage.floor);
  const floorCosts = groupedCosts.incrementalByFloor[floor] || emptyCosts();
  const floorEncounters = encounters.filter(encounter => Number(encounter.floor) === floor);
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
      fleePartingDamageHp: null,
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
      fleeAttempts: finite(stage.fleeActions),
      fleeExecutions: floorEncounters.filter(encounter => encounter.outcome === "flee").length,
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

function compactRun(result, { scenarioId, startingKitId, policyId, runIndex, worldSeed }) {
  const diagnostics = result.diagnostics || {};
  const groupedCosts = groupCostEvents(diagnostics.costEvents || []);
  const stages = result.stage15Diagnostics?.byFloor || {};
  const encounters = Array.isArray(result.encounterIdentityLog) ? result.encounterIdentityLog : [];
  const rewardEvents = Array.isArray(diagnostics.rewardEvents) ? diagnostics.rewardEvents : [];
  const recoveryEvents = Array.isArray(diagnostics.recoveryEvents) ? diagnostics.recoveryEvents : [];
  const floors = Object.fromEntries(TRAJECTORY_FLOORS.map(floor => [floor, compactFloor(
    stages[String(floor)],
    result,
    groupedCosts,
    rewardEvents,
    recoveryEvents,
    encounters
  )]));
  const outcome = terminalKind(result);
  const finalFloor = Number(result.deathFloor ?? result.endFloor ?? result.reachedFloor);
  const finalObservedFloor = Number.isFinite(finalFloor)
    ? (groupedCosts.incrementalByFloor[finalFloor]
      ? finalFloor
      : Math.min(TRAJECTORY_FLOORS.at(-1), Math.max(TRAJECTORY_FLOORS[0], finalFloor)))
    : null;
  const finalFloorCost = groupedCosts.incrementalByFloor[finalObservedFloor] || emptyCosts();
  return {
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
    lastCostEvents: (diagnostics.costEvents || []).slice(-3).map(compactCostEvent),
    floors,
    totalSteps: finite(result.steps),
    totalCombatCount: finite(result.battles),
    totalCombatRounds: finite(result.combatRounds),
    build: {
      starting: compactBuildSnapshot(result.startingBuildSnapshot),
      ending: compactBuildSnapshot(result.endingBuildSnapshot),
      shiftCount: (result.equipmentTelemetry || []).filter(event => event.type === "swap").length
    },
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
  return {
    entrants: rows.length,
    entryHpRatio: values(row => row.entry.hpRatio),
    entryMpRatio: values(row => row.entry.mpRatio),
    exitHpRatio: values(row => row.exit.hpRatio),
    exitMpRatio: values(row => row.exit.mpRatio),
    recoveryRemainingEntry: values(row => row.entry.recoveryRemaining),
    recoveryRemainingExit: values(row => row.exit.recoveryRemaining),
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

function sumFloorCosts(record) {
  return TRAJECTORY_FLOORS.reduce((totals, floor) => {
    const costs = record.floors[floor]?.incrementalCost || {};
    COST_SOURCE_IDS.forEach(source => {
      totals[source] += Number(costs[source]) || 0;
    });
    return totals;
  }, emptyCosts());
}

export function aggregateCondition(records) {
  const waterfall = Object.fromEntries(TRAJECTORY_FLOORS.map(floor => [floor, makeWaterfall(records, floor)]));
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

export function buildReturnContinuation(baselineRecords, candidateRecords) {
  const joined = buildMatchedTrajectory(baselineRecords, candidateRecords)
    .filter(({ baseline }) => baseline.outcome === "voluntaryReturn");
  const reach = { b4: 0, b5: 0, b6: 0 };
  const terminal = {
    sameFloorDeath: 0,
    oneFloorDeath: 0,
    twoPlusFloorDeath: 0,
    otherTerminal: 0
  };
  const rows = joined.map(({ baseline, candidate }) => {
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
    return {
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
  });
  return {
    runs: rows.length,
    reach,
    terminal,
    categories: Object.fromEntries([
      ["same-floor death", terminal.sameFloorDeath],
      ["+1 floor death", terminal.oneFloorDeath],
      ["+2 floors death", terminal.twoPlusFloorDeath],
      ["otherTerminal", terminal.otherTerminal]
    ]),
    rows,
    sameFloorDeath: terminal.sameFloorDeath,
    oneFloorDeath: terminal.oneFloorDeath,
    twoPlusFloorDeath: terminal.twoPlusFloorDeath,
    b4Reach: reach.b4,
    b5Reach: reach.b5,
    b6Cutoff: reach.b6
  };
}

function worldSeedFor(seed, runIndex) {
  return `run-difficulty:${seed}:${runIndex}`;
}

function normalizeOptions({ runs, seed, startingKitIds, scenarioIds, allowSmallRunCount = false } = {}) {
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
  return { runs: normalizedRuns, seed: normalizedSeed, startingKitIds: kits, scenarioIds: scenarios };
}

export async function runMeasurement(options = {}) {
  const config = normalizeOptions(options);
  applyStandardSimulationEnv({
    ...STANDARD_BALANCE_CONFIG,
    seed: config.seed,
    runs: config.runs
  });
  const { getScenarioById, resetSimulationRandom, simulateRun } =
    await import("../simulations/sim_depth_material_ev.js");
  const runOne = ({ scenarioId, startingKitId, policy, runIndex }) => {
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
        collectEncounterIdentities: true,
        collectStage15Diagnostics: true,
        simDiagnosticLevel: "full"
      },
      workshop: baseScenario.workshop,
      worldSeed,
      collectDiagnostics: true,
      collectBuildSnapshots: true,
      collectEquipmentTelemetry: true
    });
    return compactRun(result, {
      scenarioId,
      startingKitId,
      policyId: policy.id,
      runIndex,
      worldSeed
    });
  };

  const determinism = {};
  const probe = {
    scenarioId: config.scenarioIds[0],
    startingKitId: config.startingKitIds[0],
    runIndex: 0
  };
  for (const policy of Object.values(TRAJECTORY_POLICIES)) {
    resetSimulationRandom(config.seed);
    const first = runOne({ ...probe, policy });
    resetSimulationRandom(config.seed);
    const second = runOne({ ...probe, policy });
    determinism[policy.id] = {
      pass: JSON.stringify(first) === JSON.stringify(second),
      first,
      second
    };
    if (!determinism[policy.id].pass) throw new Error(`trajectory determinism probe failed: ${policy.id}`);
  }

  const cases = [];
  for (const scenarioId of config.scenarioIds) {
    for (const startingKitId of config.startingKitIds) {
      const records = {};
      for (const policy of Object.values(TRAJECTORY_POLICIES)) {
        resetSimulationRandom(config.seed);
        records[policy.id] = [];
        for (let runIndex = 0; runIndex < config.runs; runIndex++) {
          records[policy.id].push(runOne({ scenarioId, startingKitId, policy, runIndex }));
        }
      }
      const t0 = records.t0;
      const t1 = records.t1;
      cases.push({
        scenarioId,
        startingKitId,
        policies: {
          t0: { ...TRAJECTORY_POLICIES.t0, aggregate: aggregateCondition(t0), records: t0 },
          t1: { ...TRAJECTORY_POLICIES.t1, aggregate: aggregateCondition(t1), records: t1 }
        },
        returnContinuation: buildReturnContinuation(t0, t1)
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
    policies: Object.values(TRAJECTORY_POLICIES).map(policy => ({ ...policy })),
    matchedIdentity: hashConfiguration({
      source: "production-simulateRun",
      seed: config.seed,
      runs: config.runs,
      startingKitIds: config.startingKitIds,
      scenarioIds: config.scenarioIds,
      observedFloors: TRAJECTORY_FLOORS,
      measurementCutoff: MEASUREMENT_CUTOFF_FLOOR,
      worldSeedTemplate: "run-difficulty:{seed}:{runIndex}",
      policies: Object.values(TRAJECTORY_POLICIES),
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
      byPolicy: determinism
    },
    cases
  };
}

export function buildReport(result, provenance = null, environmentSignature = null, { purpose = null, requestedRef = null } = {}) {
  return {
    measurement: {
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
      rawTracePolicy: "compact floor snapshots and bounded last-three cost events only",
      unobserved: [...UNOBSERVED_FIELDS]
    },
    configuration: result.configuration,
    comparisonKey: result.comparisonKey,
    determinism: result.determinism,
    cases: result.cases,
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

export function buildSummary(report) {
  const lines = [
    "# Early run attrition trajectory",
    "",
    `- source SHA: \`${report.measurement.sourceCommit || "not recorded"}\`; runner: \`${report.measurementRunnerCommit || report.measurement.measurementRunnerCommit || "not recorded"}\`; schema: ${report.runnerVersion || report.measurement.runnerVersion}`,
    `- N=${report.configuration.runs}/condition; seed=${report.configuration.seed}; observed B1–B5; B6 is a synthetic measurement cutoff, never voluntary Return`,
    "- T0 = current P0 / Portal HP threshold 35%; T1 = P2 push probe / HP-threshold auto-Return disabled only",
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
    });
  });
  lines.push(
    "",
    "## Interpretation boundary",
    "",
    "- This is production-path diagnostic evidence, not balance tuning or a player-facing difficulty tier.",
    "- `combat`, `guardianBoss`, `floorTrap`, `chestTrap`, and `poisonStatus` are grouped only from emitted production cost events. Flee/parting and inseparable in-combat status damage remain unobserved rather than zero.",
    "- No raw combat log is persisted; each run keeps floor state, aggregate costs, terminal state, build snapshots, and at most the last three compact cost events.",
    "- T1 is a matched causal probe and is not a production recommendation."
  );
  return lines.join("\n");
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
      measurementRunnerDiffSha256: report.measurement.measurementRunnerDiffSha256
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
      boundedTerminalCostEvents: 3
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
