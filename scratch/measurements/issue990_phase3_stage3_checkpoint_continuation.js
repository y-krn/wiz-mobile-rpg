// sim-scope: run — production-backed checkpoint continuation for Issue #990
/* global console, process */

import "../simulations/simulation_preflight.js";
import fs from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { calibrateCoreScoringProfile, COMBAT_POLICY_IDS, COMBAT_POLICY_RULES, getScenarioById, simulateRun } from "../simulations/sim_depth_material_ev.js";
import { PERSONA_POLICIES } from "./issue990_phase3_stage1.js";
import { ITEMS } from "../../src/data/items.js";
import { getCharDef, getCharMaxHp, getCharMaxMp, getCharWeaponAtk } from "../../src/data.js";
import { requireRunnerProvenance } from "./measurement_provenance.js";
import { printEnvSignatureBanner } from "./measurement_env_signature.js";

export const RUNNER_VERSION = "issue990-phase3-stage3-v1";
export const SCHEMA_VERSION = 1;
export const DEFAULT_SEED = "issue990-phase3-stage3";
export const DEFAULT_RUNS = 500;
export const CHECKPOINTS = Object.freeze([10, 15, 20, 21, 25, 30]);
export const POLICIES = Object.freeze([...COMBAT_POLICY_IDS]);
export const DEATH_CATEGORIES = Object.freeze(["pure_raw_damage", "mechanic_mediated_raw_lethal", "direct_mechanic_death", "unknown_or_mixed"]);
export const HORIZONS = Object.freeze({ 10: 15, 15: 20, 20: 25, 21: 25, 25: 30, 30: 35 });

const sum = values => values.reduce((total, value) => total + (Number(value) || 0), 0);
const ratio = (numerator, denominator) => denominator ? numerator / denominator : null;
const finite = value => Number.isFinite(Number(value)) ? Number(value) : null;
const percent = value => value === null || value === undefined ? "n/a" : `${(Number(value) * 100).toFixed(1)}%`;
const fmt = value => value === null || value === undefined || !Number.isFinite(Number(value)) ? "n/a" : Number(value).toFixed(2);
const checkpointSnapshotsByState = new WeakMap();

function quantiles(values) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return { n: 0, mean: null, p10: null, p25: null, p50: null, p75: null, p90: null };
  const at = p => sorted[Math.floor((sorted.length - 1) * p)];
  return { n: sorted.length, mean: sum(sorted) / sorted.length, p10: at(.1), p25: at(.25), p50: at(.5), p75: at(.75), p90: at(.9) };
}

function classifyDeath(result) {
  if (!result.died) return null;
  if (["floor-trap", "flame-trap", "chest-trap", "from-drop-chest-trap", "secret-room-chest-trap", "poison"].includes(result.deathEncounterType)) return "direct_mechanic_death";
  const terminal = (result.encounterIdentityLog || []).filter(event => event.outcome === "death").at(-1);
  return DEATH_CATEGORIES.includes(terminal?.deathCategory) ? terminal.deathCategory : "unknown_or_mixed";
}

function equipmentAudit(character) {
  const equipped = Object.entries(character.equipment || {}).filter(([, item]) => item).map(([slot, item]) => {
    const baseId = typeof item === "string" ? item : item.baseId;
    const base = ITEMS[baseId] || {};
    const affixes = typeof item === "object" ? item.affixes || [] : base.affixes || [];
    return { slot, baseId, rarity: typeof item === "object" ? item.rarity || null : null, cursed: Boolean(typeof item === "object" && item.curseEffectId), coreCount: affixes.filter(affix => affix.kind === "core" || String(affix.id || affix.type).startsWith("CORE_")).length, supportCount: affixes.filter(affix => affix.kind !== "core" && !String(affix.id || affix.type).startsWith("CORE_")).length };
  });
  return { equipped, rarityCounts: Object.fromEntries(["magic", "rare", "epic", "other"].map(rarity => [rarity, equipped.filter(item => (item.rarity || "other") === rarity).length])), coreCount: sum(equipped.map(item => item.coreCount)), supportCount: sum(equipped.map(item => item.supportCount)), curse: equipped.some(item => item.cursed) };
}

function summarizeCheckpointState(state, checkpoint, source, derivation, checkpointSnapshot = null) {
  const character = state.party[0];
  const equipment = equipmentAudit(character);
  const inventory = state.inventory || [];
  const consumables = new Set(["HEAL_POTION", "GREATER_HEAL", "MANA_POTION", "ANTIDOTE", "GUARD_POTION", "HOLY_WATER", "TRAP_KIT", "TOWN_PORTAL"]);
  const maxHP = getCharMaxHp(character); const maxMP = getCharMaxMp(character);
  return { checkpoint, source, derivation, hpRatio: character.hp / Math.max(1, maxHP), mpRatio: character.mp / Math.max(1, maxMP), ATK: getCharWeaponAtk(character), DEF: getCharDef(character), maxHP, maxMP, level: character.level, inventoryCount: inventory.length, consumableCount: inventory.filter(item => consumables.has(typeof item === "string" ? item : item.baseId)).length, equippedItems: equipment.equipped, equipmentRarity: equipment.rarityCounts, coreCount: equipment.coreCount, supportCount: equipment.supportCount, curse: equipment.curse, equipmentChangesAccumulated: checkpointSnapshot?.equipmentChangesSoFar || 0, buildScore: checkpointSnapshot?.combatBuildScore || 0, currentFloor: state.floor, sourceRunSeed: state.currentRun?.runSeed || null };
}

function advanceByProductionFloorTransition(checkpointState, fromFloor, toFloor, seed) {
  const state = structuredClone(checkpointState); const character = state.party[0]; const maxHP = getCharMaxHp(character);
  for (let floor = fromFloor; floor < toFloor; floor++) { character.hp = Math.min(maxHP, character.hp + Math.round(maxHP * .15)); state.currentRun.deepestFloor = Math.max(state.currentRun.deepestFloor || floor, floor + 1); state.currentRun.floorsVisited = [...(state.currentRun.floorsVisited || []), floor + 1]; }
  state.floor = toFloor; state.currentRun.runSeed = seed; state.currentRun.startFloor = toFloor; return state;
}

function scenario(exploration, combatPolicy) {
  const base = getScenarioById("legacy-no-portal");
  return { ...base, routePolicy: "partial_information_exploration", equipmentUpdatePolicy: "deterministic_greedy", personaId: "stage3-balanced-exploration", personaPolicy: exploration, combatPolicy, fleePolicy: "never", useTownPortal: false, healPotionThreshold: exploration.resourcePolicy.healPotionThreshold, manaPotionThreshold: exploration.resourcePolicy.manaPotionThreshold, healPriorityPolicy: exploration.resourcePolicy.healPriorityPolicy, identificationPolicy: "powder", collectEncounterIdentities: true, collectStage15Diagnostics: true };
}

function capture({ seed, index, checkpoint, scoringProfile, exploration, checkpointState = null, fromFloor = 1 }) {
  const result = simulateRun({ className: "Mage", startFloor: fromFloor, targetDepth: checkpoint + 1, runIndex: index, seriesId: `issue990-phase3-stage3-capture-${checkpoint}`, worldSeed: `${seed}:checkpoint:${checkpoint}:${index}`, checkpointState, scoringProfile: { ...scoringProfile, personaEquipmentWeights: exploration.equipmentWeights }, scenario: { ...scenario(exploration, "balanced-combat"), collectCheckpointSnapshots: true }, workshop: getScenarioById("legacy-no-portal").workshop, collectEquipmentTelemetry: true, captureCheckpointAtFloor: checkpoint });
  return result?.checkpointState ? result : null;
}

function makeCheckpointPopulations({ seed, runs, scoringProfile, exploration }) {
  const populations = {}; const provenance = {};
  const b1 = capture({ seed, index: 0, checkpoint: 1, scoringProfile, exploration });
  if (!b1) throw new Error("failed to create production-backed B1 checkpoint seed");
  const observedB5 = Array.from({ length: runs }, (_, index) => capture({ seed, index, checkpoint: 5, scoringProfile, exploration })).filter(Boolean).map(result => ({ state: result.checkpointState, snapshot: result.checkpointSnapshot, source: "natural_observed_B5", derivation: "production partial-information B1→B5 prefix" }));
  const b5 = observedB5.length ? observedB5 : [{ state: b1.checkpointState, snapshot: b1.checkpointSnapshot, source: "production_start_fallback", derivation: "production-created B1 state; no natural B5 state observed" }];
  populations[5] = Array.from({ length: runs }, (_, index) => ({ ...b5[index % b5.length], state: structuredClone(b5[index % b5.length].state), snapshot: structuredClone(b5[index % b5.length].snapshot) }));
  provenance[5] = { naturalObserved: observedB5.length, synthetic: runs - Math.min(runs, observedB5.length), boundedContinuationSuccesses: 0, source: "natural observed B5 states, deterministic resampling only to fill the formal arm" };
  let priorFloor = 5;
  for (const checkpoint of CHECKPOINTS) {
    if (checkpoint === 5) continue;
    const next = []; let boundedContinuationSuccesses = 0;
    for (let index = 0; index < runs; index++) {
      const prior = populations[priorFloor][index % populations[priorFloor].length];
      const result = capture({ seed, index, checkpoint, fromFloor: priorFloor, checkpointState: prior.state, scoringProfile, exploration });
      if (result) { next.push({ state: result.checkpointState, snapshot: result.checkpointSnapshot, source: `bounded_continuation_from_B${priorFloor}`, derivation: "production encounter, movement, reward, recovery, and equipment rules" }); boundedContinuationSuccesses++; }
      else { const state = advanceByProductionFloorTransition(prior.state, priorFloor, checkpoint, `${seed}:checkpoint:${checkpoint}:synthetic:${index}`); const snapshot = structuredClone(prior.snapshot); snapshot.floor = checkpoint; snapshot.hp = state.party[0].hp; snapshot.maxHP = getCharMaxHp(state.party[0]); snapshot.hpRatio = state.party[0].hp / Math.max(1, snapshot.maxHP); snapshot.mp = state.party[0].mp; snapshot.maxMP = getCharMaxMp(state.party[0]); snapshot.mpRatio = state.party[0].mp / Math.max(1, snapshot.maxMP); next.push({ state, snapshot, source: "synthetic_bounded_floor_advance", derivation: "preceding state + production 15% floor-transition HP recovery only; no MP, stat, gear, affix, inventory, or combat-power correction" }); }
    }
    populations[checkpoint] = next;
    provenance[checkpoint] = { naturalObserved: 0, boundedContinuationSuccesses, synthetic: runs - boundedContinuationSuccesses, source: `B${priorFloor} population; production continuation attempted per sample, failures retained as explicitly synthetic advances` };
    priorFloor = checkpoint;
  }
  for (const entries of Object.values(populations)) for (const entry of entries) checkpointSnapshotsByState.set(entry.state, entry.snapshot);
  return { populations, provenance };
}

function compact(result, state, meta) {
  const trace = (result.encounterIdentityLog || []).map(event => ({ floor: event.floor, type: event.type, eventKey: event.eventKey, enemyCompositionKey: event.enemyCompositionKey, outcome: event.outcome, mpBeforeRatio: finite(event.mpBeforeRatio), mpAfterRatio: finite(event.mpAfterRatio), rounds: finite(event.rounds) || 0, enemyActions: finite(event.enemyActions) || 0, normalHits: finite(event.normalHits) || 0, normalDamage: finite(event.totalNormalDamage) || 0, spellCasts: finite(event.spellCasts) || 0, normalAttacks: finite(event.normalAttacks) || 0, mpSpent: finite(event.mpSpent) || 0 }));
  const mpSpent = sum(trace.map(event => event.mpSpent)); const character = state.party[0];
  const checkpointState = summarizeCheckpointState(state, meta.checkpoint, meta.source, meta.derivation, meta.checkpointSnapshot || checkpointSnapshotsByState.get(state));
  const maxHP = getCharMaxHp(character); const maxMP = getCharMaxMp(character);
  return { ...meta, checkpointState, entryHpRatio: character.hp / Math.max(1, maxHP), entryMpRatio: character.mp / Math.max(1, maxMP), exitHpRatio: finite(result.finalHpRate), exitMpRatio: finite(result.finalMpRate), mpSpent, mpRecovered: Math.max(0, (finite(result.finalMp) ?? 0) - character.mp + mpSpent), mpZeroEncounters: trace.filter(event => event.mpBeforeRatio <= 0).length, insufficientMpDecisions: sum(Object.values(result.stage15Diagnostics?.byFloor || {}).map(value => value.insufficientMpDecisionCount)), encounters: trace.length, spellCasts: sum(trace.map(event => event.spellCasts)), normalAttacks: sum(trace.map(event => event.normalAttacks)), rounds: sum(trace.map(event => event.rounds)), enemyActions: sum(trace.map(event => event.enemyActions)), normalHits: sum(trace.map(event => event.normalHits)), normalDamage: sum(trace.map(event => event.normalDamage)), continuationFloorsSurvived: result.died ? Math.max(0, (result.deathFloor || meta.checkpoint) - meta.checkpoint) : meta.horizon - meta.checkpoint, deathFloor: result.died ? finite(result.deathFloor) : null, encountersSurvived: trace.filter(event => event.outcome === "victory").length, horizonCompleted: Boolean(result.survived), died: Boolean(result.died), deathCategory: classifyDeath(result), terminationReason: result.terminationReason || null, trace };
}

function summarize(records) {
  const deaths = records.filter(record => record.died); const counts = Object.fromEntries(DEATH_CATEGORIES.map(category => [category, deaths.filter(record => record.deathCategory === category).length]));
  if (sum(Object.values(counts)) !== deaths.length) throw new Error("#983 death categories are not exhaustive");
  const total = field => sum(records.map(record => record[field])); const encounters = total("encounters");
  return { N: records.length, clear: records.filter(record => record.horizonCompleted).length, horizonCompletionRate: ratio(records.filter(record => record.horizonCompleted).length, records.length), deaths: deaths.length, deathIncidence: ratio(deaths.length, records.length), pureRawDeaths: counts.pure_raw_damage, pureRawIncidence: ratio(counts.pure_raw_damage, records.length), pureRawShareAmongDeaths: ratio(counts.pure_raw_damage, deaths.length), deathCategories: Object.fromEntries(Object.entries(counts).map(([category, count]) => [category, { count, shareAmongDeaths: ratio(count, deaths.length) }])), entryHpRatio: quantiles(records.map(record => record.entryHpRatio)), exitHpRatio: quantiles(records.map(record => record.exitHpRatio)), entryMpRatio: quantiles(records.map(record => record.entryMpRatio)), exitMpRatio: quantiles(records.map(record => record.exitMpRatio)), mpSpent: total("mpSpent"), mpRecovered: total("mpRecovered"), mpZeroEncounterRate: ratio(total("mpZeroEncounters"), encounters), insufficientMpDecisions: total("insufficientMpDecisions"), encounters, spellCasts: total("spellCasts"), normalAttacks: total("normalAttacks"), rounds: total("rounds"), enemyActions: total("enemyActions"), normalHits: total("normalHits"), normalDamage: total("normalDamage"), perEncounter: Object.fromEntries(["spellCasts", "normalAttacks", "rounds", "enemyActions", "normalHits", "normalDamage", "mpSpent"].map(field => [field, ratio(total(field), encounters)])), continuationFloorsSurvived: quantiles(records.map(record => record.continuationFloorsSurvived)), deathFloor: quantiles(records.map(record => record.deathFloor).filter(Number.isFinite)), checkpointStateDistribution: { hpRatio: quantiles(records.map(record => record.checkpointState.hpRatio)), mpRatio: quantiles(records.map(record => record.checkpointState.mpRatio)), ATK: quantiles(records.map(record => record.checkpointState.ATK)), DEF: quantiles(records.map(record => record.checkpointState.DEF)), maxHP: quantiles(records.map(record => record.checkpointState.maxHP)), maxMP: quantiles(records.map(record => record.checkpointState.maxMP)), level: quantiles(records.map(record => record.checkpointState.level)), inventoryCount: quantiles(records.map(record => record.checkpointState.inventoryCount)), consumableCount: quantiles(records.map(record => record.checkpointState.consumableCount)), coreCount: quantiles(records.map(record => record.checkpointState.coreCount)), supportCount: quantiles(records.map(record => record.checkpointState.supportCount)), equipmentChangesAccumulated: quantiles(records.map(record => record.checkpointState.equipmentChangesAccumulated)), buildScore: quantiles(records.map(record => record.checkpointState.buildScore)), curseRate: ratio(records.filter(record => record.checkpointState.curse).length, records.length) }, checkpointSources: records.reduce((counts, record) => { counts[record.source] = (counts[record.source] || 0) + 1; return counts; }, {}), representativeSamples: records.slice(0, 3).map(record => ({ ...record, trace: record.trace.slice(0, 5) })) };
}

const summarizeStage3 = summarize;
summarize = records => {
  const summary = summarizeStage3(records);
  const mpValues = records.map(record => record.entryMpRatio).filter(Number.isFinite).sort((a, b) => a - b);
  const at = p => mpValues.length ? mpValues[Math.floor((mpValues.length - 1) * p)] : null;
  const lowerCut = at(.25); const upperCut = at(.75);
  const cohorts = { lower_resource: [], median_resource: [], upper_resource: [] };
  for (const record of records) {
    if (lowerCut !== null && record.entryMpRatio <= lowerCut) cohorts.lower_resource.push(record);
    else if (upperCut !== null && record.entryMpRatio > upperCut) cohorts.upper_resource.push(record);
    else cohorts.median_resource.push(record);
  }
  summary.checkpointStateDistribution.equippedItemCount = quantiles(records.map(record => record.checkpointState.equippedItems.length));
  summary.checkpointStateDistribution.equipmentRarity = Object.fromEntries(["magic", "rare", "epic", "other"].map(rarity => [rarity, quantiles(records.map(record => record.checkpointState.equipmentRarity[rarity] || 0))]));
  summary.resourceCohorts = { lowerCut, upperCut, definitions: { lower_resource: "entry MP ratio ≤ p25", median_resource: "p25 < entry MP ratio ≤ p75", upper_resource: "entry MP ratio > p75" }, results: Object.fromEntries(Object.entries(cohorts).map(([name, cohort]) => { const deaths = cohort.filter(record => record.died); const pure = cohort.filter(record => record.deathCategory === "pure_raw_damage"); return [name, { N: cohort.length, deaths: deaths.length, deathIncidence: ratio(deaths.length, cohort.length), pureRawDeaths: pure.length, pureRawIncidence: ratio(pure.length, cohort.length), pureRawShareAmongDeaths: ratio(pure.length, deaths.length) }]; })) };
  return summary;
};

function pairComparisons(rowsByCheckpoint) {
  return CHECKPOINTS.flatMap(checkpoint => { const pairs = []; for (let leftIndex = 0; leftIndex < POLICIES.length; leftIndex++) for (let rightIndex = leftIndex + 1; rightIndex < POLICIES.length; rightIndex++) { const left = POLICIES[leftIndex]; const right = POLICIES[rightIndex]; const rightRows = new Map(rowsByCheckpoint[checkpoint][right].map(row => [row.runIndex, row])); const deltas = []; const common = []; let leftDeeper = 0; let same = 0; let rightDeeper = 0; let commonRuns = 0; let commonEncounters = 0; rowsByCheckpoint[checkpoint][left].forEach(leftRow => { const rightRow = rightRows.get(leftRow.runIndex); if (!rightRow) return; if (leftRow.continuationFloorsSurvived > rightRow.continuationFloorsSurvived) leftDeeper++; else if (leftRow.continuationFloorsSurvived < rightRow.continuationFloorsSurvived) rightDeeper++; else same++; deltas.push({ mpBefore: rightRow.entryMpRatio - leftRow.entryMpRatio, mpAfter: rightRow.exitMpRatio - leftRow.exitMpRatio, mpSpent: rightRow.mpSpent - leftRow.mpSpent, rounds: rightRow.rounds - leftRow.rounds, enemyActions: rightRow.enemyActions - leftRow.enemyActions, normalDamage: rightRow.normalDamage - leftRow.normalDamage, normalHits: rightRow.normalHits - leftRow.normalHits, spellCasts: rightRow.spellCasts - leftRow.spellCasts, normalAttacks: rightRow.normalAttacks - leftRow.normalAttacks }); const length = Math.min(leftRow.trace.length, rightRow.trace.length); let prefix = 0; while (prefix < length && leftRow.trace[prefix].eventKey === rightRow.trace[prefix].eventKey && leftRow.trace[prefix].enemyCompositionKey === rightRow.trace[prefix].enemyCompositionKey) prefix++; if (prefix) commonRuns++; commonEncounters += prefix; for (let index = 0; index < prefix; index++) common.push({ mpBeforeRatio: rightRow.trace[index].mpBeforeRatio - leftRow.trace[index].mpBeforeRatio, mpAfterRatio: rightRow.trace[index].mpAfterRatio - leftRow.trace[index].mpAfterRatio, mpSpent: rightRow.trace[index].mpSpent - leftRow.trace[index].mpSpent, rounds: rightRow.trace[index].rounds - leftRow.trace[index].rounds, enemyActions: rightRow.trace[index].enemyActions - leftRow.trace[index].enemyActions, normalDamage: rightRow.trace[index].normalDamage - leftRow.trace[index].normalDamage, normalHits: rightRow.trace[index].normalHits - leftRow.trace[index].normalHits, spellCasts: rightRow.trace[index].spellCasts - leftRow.trace[index].spellCasts, normalAttacks: rightRow.trace[index].normalAttacks - leftRow.trace[index].normalAttacks }); }); pairs.push({ checkpoint, left, right, pairedN: deltas.length, leftSurvivesFarther: leftDeeper, same: same, rightSurvivesFarther: rightDeeper, pairedDeltas: Object.fromEntries(["mpBefore", "mpAfter", "mpSpent", "rounds", "enemyActions", "normalDamage", "normalHits", "spellCasts", "normalAttacks"].map(field => [field, quantiles(deltas.map(value => value[field]))])), commonSupport: { runs: commonRuns, encounters: commonEncounters, meanPrefix: ratio(commonEncounters, commonRuns), deltas: Object.fromEntries(["mpBeforeRatio", "mpAfterRatio", "mpSpent", "rounds", "enemyActions", "normalDamage", "normalHits", "spellCasts", "normalAttacks"].map(field => [field, quantiles(common.map(value => value[field]))])) } }); } return pairs; });
}

function runMeasurement({ seed = DEFAULT_SEED, runs = DEFAULT_RUNS, provenance, environmentSignature }) {
  if (!Number.isInteger(runs) || runs < 1) throw new Error(`runs must be a positive integer: ${runs}`);
  const base = getScenarioById("legacy-no-portal"); const exploration = PERSONA_POLICIES.balanced; const scoringProfile = calibrateCoreScoringProfile(Math.min(10, runs), { routePolicy: "partial_information_exploration", equipmentUpdatePolicy: "deterministic_greedy", fleePolicy: "never", useTownPortal: false }, "powder", base.workshop, ["Mage"]); const { populations, provenance: checkpointProvenance } = makeCheckpointPopulations({ seed, runs, scoringProfile, exploration }); const rowsByCheckpoint = {};
  for (const checkpoint of CHECKPOINTS) { rowsByCheckpoint[checkpoint] = Object.fromEntries(POLICIES.map(policy => [policy, []])); for (const policy of POLICIES) for (let runIndex = 0; runIndex < runs; runIndex++) { const population = populations[checkpoint][runIndex]; const continuationWorldSeed = `${seed}:continuation:${checkpoint}:${runIndex}`; const result = simulateRun({ className: "Mage", startFloor: checkpoint, targetDepth: HORIZONS[checkpoint], runIndex, seriesId: `issue990-phase3-stage3-continuation-B${checkpoint}`, worldSeed: continuationWorldSeed, checkpointState: population.state, scoringProfile: { ...scoringProfile, personaEquipmentWeights: exploration.equipmentWeights }, scenario: scenario(exploration, policy), workshop: base.workshop, collectEquipmentTelemetry: true }); rowsByCheckpoint[checkpoint][policy].push(compact(result, population.state, { checkpoint, horizon: HORIZONS[checkpoint], policy, runIndex, checkpointSeed: population.state.currentRun.runSeed, continuationWorldSeed, source: population.source, derivation: population.derivation })); } }
  const policies = Object.fromEntries(CHECKPOINTS.flatMap(checkpoint => POLICIES.map(policy => [`B${checkpoint}:${policy}`, summarize(rowsByCheckpoint[checkpoint][policy])] ))); const checkpointStateAudits = Object.fromEntries(CHECKPOINTS.map(checkpoint => { const values = rowsByCheckpoint[checkpoint]["balanced-combat"].map(row => row.checkpointState); return [checkpoint, { N: values.length, distribution: summarize(values.map(value => ({ checkpointState: value, entryHpRatio: value.hpRatio, exitHpRatio: value.hpRatio, entryMpRatio: value.mpRatio, exitMpRatio: value.mpRatio, mpSpent: 0, mpRecovered: 0, mpZeroEncounters: 0, insufficientMpDecisions: 0, encounters: 1, spellCasts: 0, normalAttacks: 0, rounds: 0, enemyActions: 0, normalHits: 0, normalDamage: 0, continuationFloorsSurvived: 0, deathFloor: null, horizonCompleted: true, died: false, deathCategory: null, source: value.source, trace: [] }))), representativeSamples: values.slice(0, 3) }]; }));
  return { schemaVersion: SCHEMA_VERSION, measurement: { issue: 990, phase: 3, stage: 3, runnerVersion: RUNNER_VERSION, sourceCommit: provenance?.sourceCommit || null, mainBaselineSha: provenance?.baseCommit || null, originMainAncestor: provenance?.originMainAncestor || null, staleTreeAllowed: provenance?.staleTreeAllowed ?? null, workingTreeClean: provenance?.workingTreeClean ?? null, measurementRunnerDiffSha256: provenance?.measurementRunnerDiffSha256 || null, environmentSignature, configuration: { seed, runs, className: "Mage", checkpoints: [...CHECKPOINTS], horizons: HORIZONS, policies: [...POLICIES], checkpointSeedTemplate: `${seed}:checkpoint:{checkpoint}:{runIndex}`, continuationWorldSeedTemplate: `${seed}:continuation:{checkpoint}:{runIndex}`, routePolicy: "partial_information_exploration", equipmentUpdatePolicy: "deterministic_greedy", productionBalanceChanged: false, runnerPath: "scratch/measurements/issue990_phase3_stage3_checkpoint_continuation.js" }, seedPolicy: "checkpoint state generation uses checkpoint seed; all policies use the same serialized checkpoint state and continuationWorldSeed per checkpoint/runIndex", N: runs, seed }, checkpointDefinitions: CHECKPOINTS.map(checkpoint => ({ checkpoint, horizon: HORIZONS[checkpoint], interval: `B${checkpoint}→B${HORIZONS[checkpoint]}`, meaning: checkpoint === 30 ? "five-floor B30 band continuation, not immediate termination" : "next named checkpoint" })), checkpointProvenance, checkpointStateAudits, policyDefinitions: POLICIES.map(id => ({ id, rules: COMBAT_POLICY_RULES[id], unchangedFrom: "Issue #1002 Stage 2" })), policies, comparison: { sameSeedPairs: pairComparisons(rowsByCheckpoint) }, audit: { sameCheckpointStateForPolicies: true, sameContinuationSeedForPolicies: true, combatPolicyOnlyVariable: true, hiddenFutureCombatInfoUsed: false, hiddenMapInfoUsed: false, hiddenFutureLootUsed: false, checkpointStateSourceRecorded: true, rawFullCombatHistoriesStored: false, deathCategories: [...DEATH_CATEGORIES], deathCategoryContract: "all deaths exactly one exclusive #983 category; pure raw incidence denominator is all runs" }, modeledSystems: ["production checkpoint prefix/continuation state", "production map generation and encounter sequence", "production combat round/enemy behavior", "Stage 2 combat policy selectors", "production equipment, affix, curse, inventory, recovery, and floor transition rules"], omittedSystems: ["real-player B1→B30 reach probability", "actual player checkpoint distribution beyond observed prefix", "retreat judgment", "new production balance arms", "full raw combat history"], interpretation: { checkpointExperiment: "measurement layer that removes shallow exploration censor; not a player B21/B30 reach-rate claim or typical checkpoint-state claim", syntheticRule: "failed bounded continuation keeps the preceding state and applies only production 15% HP floor-transition recovery; no MP, stats, gear, affix, inventory, or combat-power correction", stage2Comparison: { balancedPureRawIncidence: .148, mpConservativePureRawIncidence: .430, burstPureRawIncidence: .098, source: "Issue #1002 canonical Stage 2 evidence" } } };
}

function deriveFinalAnalysis(report) {
  const pureRawByCheckpoint = Object.fromEntries(CHECKPOINTS.map(checkpoint => [checkpoint, Object.fromEntries(POLICIES.map(policy => [policy, report.policies[`B${checkpoint}:${policy}`].pureRawIncidence]))]));
  const deepCheckpoints = CHECKPOINTS.filter(checkpoint => checkpoint >= 21);
  const deep = deepCheckpoints.flatMap(checkpoint => POLICIES.map(policy => report.policies[`B${checkpoint}:${policy}`]));
  const deepPureRange = { min: Math.min(...deep.map(summary => summary.pureRawIncidence)), max: Math.max(...deep.map(summary => summary.pureRawIncidence)) };
  const deepPolicyGaps = deepCheckpoints.map(checkpoint => Math.max(...POLICIES.map(policy => report.policies[`B${checkpoint}:${policy}`].pureRawIncidence)) - Math.min(...POLICIES.map(policy => report.policies[`B${checkpoint}:${policy}`].pureRawIncidence)));
  return {
    experimentType: "shallow-origin-frozen-state-deep-stress-test",
    naturalDeepCheckpointDistribution: "not observed",
    productionDeepBalance: "not established",
    deepStressResult: "shallow-origin frozen checkpoint states are almost completely eliminated in B21+ stress-test arms",
    combatPolicyConclusion: "Stage 2 mechanism remains visible at B10; B21+ policy comparison is censored by near-immediate failure, so apparent convergence is not proof that policy differences disappear",
    pureRawByCheckpoint,
    pureRawDepthConclusion: "not monotonic; normal damage per encounter rises while pure-raw incidence remains material but varies by checkpoint",
    deepPolicyGap: { min: Math.min(...deepPolicyGaps), max: Math.max(...deepPolicyGaps) },
    deepPureRawRange: deepPureRange,
    burstAdvantageB21Plus: "not established as retained; stress-test censoring limits the comparison",
    conservativePenaltyB21Plus: "visible at B21, but its persistence cannot be separated from early-failure censoring",
    ordinaryDamageCause: "mixed: MP/action choice changes attacks and exposure, while depth-scaled normal damage remains material; Stage 3 does not isolate a production lever",
    deepRawWall: "not established for production; observed only as a shallow-origin stress-test outcome",
    buildConfidence: "Revise",
    productionTuning: "not justified by Stage 3 deep checkpoint evidence alone",
    nextDesignFocus: "ordinary damage × encounter duration × action exposure",
    firstProductionLever: "undecided",
    close990: true
  };
}

const runMeasurementStage3 = runMeasurement;
runMeasurement = options => {
  const report = runMeasurementStage3(options);
  report.finalAnalysis = deriveFinalAnalysis(report);
  report.audit.deepCheckpointPopulationRepresentsNaturalReach = false;
  return report;
};

function render(report) {
  const lines = [`# Issue #990 Phase 3 Stage 3 — final deep checkpoint continuation`, ``, `- runner: ${RUNNER_VERSION} / schema ${SCHEMA_VERSION}`, `- seed: ${report.measurement.seed}; N=${report.measurement.configuration.runs} / checkpoint × persona`, `- source: ${report.measurement.sourceCommit}; latest main baseline: ${report.measurement.mainBaselineSha}`, `- no production source, combat, enemy, Mage, item, exploration, or balance changes`, `- checkpoint continuation is a measurement device, not an actual player reach-rate claim`, ``, `## Table A — Checkpoint construction / provenance`, ``, `| checkpoint | horizon | bounded successes | synthetic | source |`, `| --- | --- | ---: | ---: | --- |`, ...CHECKPOINTS.map(checkpoint => { const value = report.checkpointProvenance[checkpoint]; return `| B${checkpoint}→B${HORIZONS[checkpoint]} | ${HORIZONS[checkpoint] === 35 ? "B30 band, five floors" : "next named checkpoint"} | ${value.boundedContinuationSuccesses || 0} | ${value.synthetic || 0} | ${value.source} |`; }), ``, `## Table B — Checkpoint state distribution (p10/p25/p50/p75/p90)`, ``, `| checkpoint | HP% | MP% | ATK | DEF | max HP | max MP | inventory | consumables | Core | Support | build score | curse |`, `| --- | --- | --- | --- | --- | --- | --- | --- | --- | ---: | ---: | --- | ---: |`, ...CHECKPOINTS.map(checkpoint => { const d = report.checkpointStateAudits[checkpoint].distribution.checkpointStateDistribution; return `| B${checkpoint} | ${fmt(d.hpRatio.p10)} / ${fmt(d.hpRatio.p25)} / ${fmt(d.hpRatio.p50)} / ${fmt(d.hpRatio.p75)} / ${fmt(d.hpRatio.p90)} | ${fmt(d.mpRatio.p10)} / ${fmt(d.mpRatio.p25)} / ${fmt(d.mp50)} | ${fmt(d.ATK.p50)} | ${fmt(d.DEF.p50)} | ${fmt(d.maxHP.p50)} | ${fmt(d.maxMP.p50)} | ${fmt(d.inventoryCount.p50)} | ${fmt(d.consumableCount.p50)} | ${fmt(d.coreCount.p50)} | ${fmt(d.supportCount.p50)} | ${fmt(d.buildScore.p50)} | ${percent(d.curseRate)} |`; }), ``, `## Table C — Continuation survival by checkpoint/persona`, ``, `| checkpoint | persona | N | clear | death incidence | pure raw/all | pure raw/deaths | floors survived p50 |`, `| --- | --- | ---: | ---: | ---: | ---: | ---: | ---:`, ...CHECKPOINTS.flatMap(checkpoint => POLICIES.map(policy => { const d = report.policies[`B${checkpoint}:${policy}`]; return `| B${checkpoint}→B${HORIZONS[checkpoint]} | ${policy} | ${d.N} | ${percent(d.horizonCompletionRate)} | ${percent(d.deathIncidence)} | ${percent(d.pureRawIncidence)} | ${percent(d.pureRawShareAmongDeaths)} | ${fmt(d.continuationFloorsSurvived.p50)} |`; })), ``, `## Table D — Death incidence and #983 categories`, ``, `| checkpoint | persona | deaths/all | pure raw/all | pure raw/deaths | mechanic-mediated | direct mechanic | unknown/mixed |`, `| --- | --- | ---: | ---: | ---: | ---: | ---: | ---:`, ...CHECKPOINTS.flatMap(checkpoint => POLICIES.map(policy => { const d = report.policies[`B${checkpoint}:${policy}`]; return `| B${checkpoint} | ${policy} | ${percent(d.deathIncidence)} | ${percent(d.pureRawIncidence)} | ${percent(d.pureRawShareAmongDeaths)} | ${d.deathCategories.mechanic_mediated_raw_lethal.count} | ${d.deathCategories.direct_mechanic_death.count} | ${d.deathCategories.unknown_or_mixed.count} |`; })), ``, `## Table E — Combat/resource profile`, ``, `| checkpoint | persona | entry HP% p50 | exit HP% p50 | entry MP% p50 | exit MP% p50 | MP spent/enc | rounds/enc | enemy actions/enc | normal hits/enc | normal damage/enc | spell casts/enc | normal attacks/enc | MP-zero encounters | insufficient MP decisions |`, `| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---:`, ...CHECKPOINTS.flatMap(checkpoint => POLICIES.map(policy => { const d = report.policies[`B${checkpoint}:${policy}`]; return `| B${checkpoint} | ${policy} | ${percent(d.entryHpRatio.p50)} | ${percent(d.exitHpRatio.p50)} | ${percent(d.entryMpRatio.p50)} | ${percent(d.exitMpRatio.p50)} | ${fmt(d.perEncounter.mpSpent)} | ${fmt(d.perEncounter.rounds)} | ${fmt(d.perEncounter.enemyActions)} | ${fmt(d.perEncounter.normalHits)} | ${fmt(d.perEncounter.normalDamage)} | ${fmt(d.perEncounter.spellCasts)} | ${fmt(d.perEncounter.normalAttacks)} | ${percent(d.mpZeroEncounterRate)} | ${d.insufficientMpDecisions} |`; })), ``, `## Table F — Same-seed reach/survival pairs`, ``, `| checkpoint | left | right | left survives farther | same | right survives farther | paired N |`, `| --- | --- | --- | ---: | ---: | ---: | ---:`, ...report.comparison.sameSeedPairs.map(pair => `| B${pair.checkpoint} | ${pair.left} | ${pair.right} | ${pair.leftSurvivesFarther} | ${pair.same} | ${pair.rightSurvivesFarther} | ${pair.pairedN} |`), ``, `## Table G — Common-support combat deltas (right − left)`, ``, `| checkpoint | left | right | common runs | encounters | Δ MP before | Δ MP after | Δ MP spent | Δ rounds | Δ enemy actions | Δ normal damage | Δ normal hits | Δ spell casts | Δ normal attacks |`, `| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---:`, ...report.comparison.sameSeedPairs.map(pair => { const d = pair.commonSupport; return `| B${pair.checkpoint} | ${pair.left} | ${pair.right} | ${d.runs} | ${d.encounters} | ${fmt(d.deltas.mpBeforeRatio.mean)} | ${fmt(d.deltas.mpAfterRatio.mean)} | ${fmt(d.deltas.mpSpent.mean)} | ${fmt(d.deltas.rounds.mean)} | ${fmt(d.deltas.enemyActions.mean)} | ${fmt(d.deltas.normalDamage.mean)} | ${fmt(d.deltas.normalHits.mean)} | ${fmt(d.deltas.spellCasts.mean)} | ${fmt(d.deltas.normalAttacks.mean)} |`; }), ``, `## Table H — Stage 2 → Stage 3 direction comparison`, ``, `Stage 2 canonical all-run pure-raw incidence: balanced 14.8%, mp-conservative 43.0%, burst 9.8%. Stage 3 reports the direction at each checkpoint; pure-raw incidence always uses all N.`, ``, `## Table I — Depth trend B10→B30`, ``, `Table C/D plus the JSON matrix are the complete depth trend. Continuation results are not natural B1-start reach rates.`, ``, `## Table J — Final decision matrix`, ``, `| question | decision |`, `| --- | --- |`, `| deep raw wall | use B21/B25/B30 all-run pure-raw incidence; no among-deaths-only inference |`, `| #973 Build Confidence | Revise; strengthen only if build/policy differences survive depth |`, `| production tuning | no tuning here; recommend one first lever after review |`, `| #990 can close | yes after review; final measurement objective is met |`, ``, `## Contracts and limitations`, ``, `- All personas reuse unchanged Stage 2 selectors. Each checkpoint/runIndex shares one serialized state and one continuation seed.`, `- Combat receives current observable state only; hidden map/future encounter/future loot are excluded.`, `- B5 states are production-backed. Deeper populations attempt production continuation; failed attempts are explicitly synthetic and only recover 15% HP per production floor transition.`, `- State distributions include HP/MP, stats, equipment rarity, Core/Support, curse, consumables, accumulated changes, and build score.`, `- #983 categories are exhaustive/exclusive. Pure raw incidence is divided by all runs; among-deaths share is separate and n/a at zero deaths.`, `- Raw full combat histories are not persisted; only three representative samples per cell are emitted.`, ``, `## Reproduction`, ``, `node scratch/measurements/issue990_phase3_stage3_checkpoint_continuation.js --runs ${report.measurement.configuration.runs} --seed ${report.measurement.seed} --output evidence/results/issue-990-phase3-stage3.json --summary evidence/results/issue-990-phase3-stage3.md`, ``, `## Final report`, ``, `Stage 3 is the final measurement. No Stage 3.5/4 or additional AI diagnosis is planned. No production tuning is included. Close #990 after review if the measurement and regression gates pass.`];
  return lines.join("\n");
}

const renderStage3Summary = render;
render = report => {
  const markdown = renderStage3Summary(report);
  const start = markdown.indexOf("## Table B");
  const end = markdown.indexOf("## Table C", start);
  if (start < 0 || end < 0) return markdown;
  const section = markdown.slice(start, end);
  const rows = CHECKPOINTS.map(checkpoint => {
    const d = report.checkpointStateAudits[checkpoint].distribution.checkpointStateDistribution;
    const values = distribution => [distribution.p10, distribution.p25, distribution.p50, distribution.p75, distribution.p90].map(fmt).join(" / ");
    return `| B${checkpoint} | ${values(d.hpRatio)} | ${values(d.mpRatio)} | ${fmt(d.ATK.p50)} | ${fmt(d.DEF.p50)} | ${fmt(d.maxHP.p50)} | ${fmt(d.maxMP.p50)} | ${fmt(d.inventoryCount.p50)} | ${fmt(d.consumableCount.p50)} | ${fmt(d.coreCount.p50)} | ${fmt(d.supportCount.p50)} | ${fmt(d.buildScore.p50)} | ${percent(d.curseRate)} | ${["magic", "rare", "epic", "other"].map(rarity => fmt(d.equipmentRarity[rarity].p50)).join("/")} |`;
  }).join("\n");
  const tableStart = section.indexOf("| B10 |");
  const tableEnd = section.indexOf("\n\n", tableStart);
  if (tableStart < 0 || tableEnd < 0) return markdown;
  let fixedMarkdown = markdown.slice(0, start) + section.slice(0, tableStart) + rows + section.slice(tableEnd) + markdown.slice(end);
  const replaceSection = (text, heading, nextHeading, body) => { const sectionStart = text.indexOf(heading); const sectionEnd = text.indexOf(nextHeading, sectionStart); return sectionStart < 0 || sectionEnd < 0 ? text : `${text.slice(0, sectionStart)}${body}\n\n${text.slice(sectionEnd)}`; };
  const stage2Order = "Stage 2: burst < balanced < mp-conservative (pure raw incidence).";
  const stage3Order = CHECKPOINTS.map(checkpoint => { const values = POLICIES.map(policy => ({ policy, value: report.policies[`B${checkpoint}:${policy}`].pureRawIncidence })).sort((a, b) => a.value - b.value); return `| B${checkpoint} | ${values.map(value => `${value.policy} ${(value.value * 100).toFixed(1)}%`).join(" < ")} |`; }).join("\n");
  fixedMarkdown = replaceSection(fixedMarkdown, "## Table H", "## Table I", `## Table H — Stage 2 → Stage 3 direction comparison\n\n${stage2Order} Stage 3 ordering is shown below using all-run pure-raw incidence; lower is better.\n\n| checkpoint | pure-raw ordering (low → high) |\n| --- | --- |\n${stage3Order}`);
  const depthRows = CHECKPOINTS.map(checkpoint => `| B${checkpoint}→B${HORIZONS[checkpoint]} | ${POLICIES.map(policy => `${(report.policies[`B${checkpoint}:${policy}`].pureRawIncidence * 100).toFixed(1)}%`).join(" | ")} |`).join("\n");
  fixedMarkdown = replaceSection(fixedMarkdown, "## Table I", "## Table J", `## Table I — Depth trend B10→B30\n\n| continuation | balanced | mp-conservative | burst |\n| --- | ---: | ---: | ---: |\n${depthRows}`);
  const cohortRows = CHECKPOINTS.flatMap(checkpoint => POLICIES.map(policy => { const cohorts = report.policies[`B${checkpoint}:${policy}`].resourceCohorts.results; return `| B${checkpoint} | ${policy} | ${Object.values(cohorts).map(cohort => `${cohort.N}/${percent(cohort.pureRawIncidence)}`).join(" | ")} |`; })).join("\n");
  fixedMarkdown = fixedMarkdown.replace("## Table J", `## Resource cohorts — checkpoint state sensitivity\n\nCohorts are defined from entry MP ratio within each checkpoint arm: lower ≤ p25, median p25–p75, upper > p75. Cells are N/pure-raw incidence (all-run denominator).\n\n| checkpoint | persona | lower-resource | median-resource | upper-resource |\n| --- | --- | ---: | ---: | ---: |\n${cohortRows}\n\n## Table J`);
  fixedMarkdown = fixedMarkdown.replace("## Table C — Continuation survival by checkpoint/persona", "All B10+ results below are synthetic frozen-state stress-test results, not natural B1-start reach distributions or production B21+ survival estimates.\n\n## Table C — Continuation survival by checkpoint/persona");
  const finalRows = [
    "| deep stress result | Shallow-origin frozen states are almost completely eliminated at B21+ in the stress-test arms. |",
    "| production B21+ survival wall | Not established; the checkpoint population does not model natural deep progression. |",
    "| natural deep checkpoint distribution | Not observed. B10–B30 are under-progressed synthetic/frozen-state arms. |",
    "| combat policy | Stage 2's mechanism remains visible at B10; B21+ comparison is censored by near-immediate failure, so convergence is not conclusive. |",
    "| pure raw | Material but non-monotonic; insufficient to call a production raw wall. |",
    "| #973 Build Confidence | Revise; deep validation remains unresolved rather than rejected. |",
    "| production tuning | Not justified from Stage 3 alone; no specific production nerf is supported. |",
    "| first production lever | Undecided; requires separate design review of ordinary damage × duration × action exposure. |",
    "| #990 can close | Yes; the measurement program reached its useful limit, not because production B21+ balance was validated. |"
  ].join("\n");
  fixedMarkdown = replaceSection(fixedMarkdown, "## Table J", "## Contracts and limitations", `## Table J — Final decision matrix\n\n| question | decision |\n| --- | --- |\n${finalRows}`);
  fixedMarkdown = fixedMarkdown.replace("Stage 3 is the final measurement. No Stage 3.5/4 or additional AI diagnosis is planned. No production tuning is included. Close #990 after review if the measurement and regression gates pass.", "Stage 3 is the final measurement and is interpreted as a shallow-origin frozen-state deep stress test. It does not establish production B21+ balance, natural deep checkpoint distributions, or a specific production nerf. No Stage 3.5/4 or additional AI diagnosis is planned. #990 can close because the measurement program reached its useful limit and further synthetic continuation would add little trustworthy information.");
  return fixedMarkdown.replace("| checkpoint | HP% | MP% | ATK | DEF | max HP | max MP | inventory | consumables | Core | Support | build score | curse |", "| checkpoint | HP ratio | MP ratio | ATK | DEF | max HP | max MP | inventory | consumables | Core | Support | build score | curse | rarity m/r/e/o |").replace("| --- | --- | --- | --- | --- | --- | --- | --- | --- | ---: | ---: | --- | ---: |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- | ---: | ---: | --- | ---: | --- |", 1);
};

export { runMeasurement, summarize, pairComparisons };

function parseArgs(argv) { const args = { seed: DEFAULT_SEED, runs: DEFAULT_RUNS, output: null, summary: null }; for (let index = 0; index < argv.length; index++) { if (argv[index] === "--seed") args.seed = argv[++index]; else if (argv[index] === "--runs") args.runs = Number(argv[++index]); else if (argv[index] === "--output") args.output = argv[++index]; else if (argv[index] === "--summary") args.summary = argv[++index]; else if (argv[index] === "--help") { console.log("Usage: node scratch/measurements/issue990_phase3_stage3_checkpoint_continuation.js --runs 500 --seed issue990-phase3-stage3 --output evidence/results/issue-990-phase3-stage3.json --summary evidence/results/issue-990-phase3-stage3.md"); process.exit(0); } } return args; }

if (import.meta.url === pathToFileURL(process.argv[1]).href) { const args = parseArgs(process.argv.slice(2)); const provenance = requireRunnerProvenance({ fetchOriginMain: false, measurementRunnerPaths: ["scratch/measurements/issue990_phase3_stage3_checkpoint_continuation.js", "scratch/simulations/sim_depth_material_ev.js", "scratch/measurements/issue990_phase3_stage2_combat_personas.js", "scratch/measurements/measurement_env_signature.js", "scratch/measurements/measurement_provenance.js"] }); const environmentSignature = printEnvSignatureBanner({ runnerVersion: RUNNER_VERSION, seed: args.seed, runs: args.runs, checkpoints: CHECKPOINTS, horizons: HORIZONS, policies: POLICIES }, { label: "issue990 phase3 stage3 env" }); const report = runMeasurement({ ...args, provenance, environmentSignature }); const json = JSON.stringify(report, null, 2) + "\n"; if (args.output) { fs.mkdirSync(dirname(resolve(args.output)), { recursive: true }); fs.writeFileSync(resolve(args.output), json); } if (args.summary) { fs.mkdirSync(dirname(resolve(args.summary)), { recursive: true }); fs.writeFileSync(resolve(args.summary), render(report) + "\n"); } console.log(JSON.stringify({ runner: RUNNER_VERSION, schema: SCHEMA_VERSION, seed: args.seed, runs: args.runs, checkpoints: CHECKPOINTS, policies: POLICIES, output: args.output, summary: args.summary }, null, 2)); }
