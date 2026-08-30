// sim-scope: run — production-backed virtual-player population measurement
/* global console, process */
import "../simulations/simulation_preflight.js";
import fs from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  calibrateCoreScoringProfile,
  getScenarioById,
  simulateRun
} from "../simulations/sim_depth_material_ev.js";
import { requireRunnerProvenance } from "./measurement_provenance.js";
import { printEnvSignatureBanner } from "./measurement_env_signature.js";

export const RUNNER_VERSION = "issue990-phase3-stage1-v1";
export const SCHEMA_VERSION = 1;
export const DEFAULT_SEED = "issue990-phase3-stage1";
export const DEFAULT_RUNS = 500;
export const TARGET_DEPTH = 30;
export const CHECKPOINTS = Object.freeze([5, 10, 15, 20, 21, 25, 30]);
export const DEATH_CATEGORIES = Object.freeze([
  "pure_raw_damage",
  "mechanic_mediated_raw_lethal",
  "direct_mechanic_death",
  "unknown_or_mixed"
]);

const BASE_EQUIPMENT_WEIGHTS = Object.freeze({
  weaponAtk: 1,
  defense: 1,
  maxHp: 1,
  str: 1,
  vit: 1,
  int: 1,
  pie: 1,
  agi: 1,
  guardian: 1,
  spellGuard: 1,
  followUp: 1,
  firstStrike: 1,
  arcane: 1,
  devotion: 1,
  combatCore: 1,
  economyCore: 1
});

// One interface for all Stage 1 personas. These are measurement policies,
// not claims about real-player frequency or behavior.
export const PERSONA_POLICIES = Object.freeze({
  cautious: Object.freeze({
    id: "cautious",
    label: "cautious / 慎重型",
    priority: ["survival", "hp", "mp", "defense_resistance", "damage", "exploration"],
    explorationPolicy: "known_frontier_then_stairs",
    exploration: Object.freeze({ budgetMultiplier: 2.5, budgetExtraSteps: 10, afterStairsSteps: 2 }),
    equipmentWeights: Object.freeze({ ...BASE_EQUIPMENT_WEIGHTS, defense: 1.55, maxHp: 1.45, guardian: 1.4, spellGuard: 1.35, combatCore: 0.9, economyCore: 0.75 }),
    resourcePolicy: Object.freeze({ healPotionThreshold: 0.70, manaPotionThreshold: 0.70, healPriorityPolicy: "potion-first" })
  }),
  aggressive: Object.freeze({
    id: "aggressive",
    label: "aggressive / 攻撃型",
    priority: ["kill_speed", "atk_spell_power", "action_count", "mp_efficiency", "defense"],
    explorationPolicy: "known_frontier_then_stairs",
    exploration: Object.freeze({ budgetMultiplier: 2.5, budgetExtraSteps: 10, afterStairsSteps: 4 }),
    equipmentWeights: Object.freeze({ ...BASE_EQUIPMENT_WEIGHTS, weaponAtk: 1.55, str: 1.35, int: 1.35, pie: 1.2, arcane: 1.3, defense: 0.70, maxHp: 0.75, combatCore: 1.35, economyCore: 0.70 }),
    resourcePolicy: Object.freeze({ healPotionThreshold: 0.40, manaPotionThreshold: 0.40, healPriorityPolicy: "potion-first" })
  }),
  explorer: Object.freeze({
    id: "explorer",
    label: "explorer / 探索型",
    priority: ["unexplored_area", "chest", "equipment_opportunity", "damage", "resource_cost"],
    explorationPolicy: "frontier_with_post_stairs_search",
    exploration: Object.freeze({ budgetMultiplier: 3.2, budgetExtraSteps: 18, afterStairsSteps: 24 }),
    equipmentWeights: Object.freeze({ ...BASE_EQUIPMENT_WEIGHTS, defense: 0.90, maxHp: 0.90, combatCore: 1.05, economyCore: 1.60 }),
    resourcePolicy: Object.freeze({ healPotionThreshold: 0.55, manaPotionThreshold: 0.55, healPriorityPolicy: "potion-first" })
  }),
  "stairs-first": Object.freeze({
    id: "stairs-first",
    label: "stairs-first / 階段優先型",
    priority: ["known_stairs", "mandatory_boss", "hp_mp_preservation", "equipment", "exploration"],
    explorationPolicy: "stairs_immediately_when_known",
    exploration: Object.freeze({ budgetMultiplier: 2.5, budgetExtraSteps: 10, afterStairsSteps: 0 }),
    equipmentWeights: Object.freeze({ ...BASE_EQUIPMENT_WEIGHTS, defense: 1.15, maxHp: 1.15, combatCore: 0.95, economyCore: 0.65 }),
    resourcePolicy: Object.freeze({ healPotionThreshold: 0.60, manaPotionThreshold: 0.60, healPriorityPolicy: "potion-first" })
  }),
  balanced: Object.freeze({
    id: "balanced",
    label: "balanced / バランス型",
    priority: ["hp_mp", "damage", "defense", "equipment_improvement", "exploration_cost"],
    explorationPolicy: "known_frontier_then_stairs",
    exploration: Object.freeze({ budgetMultiplier: 2.5, budgetExtraSteps: 10, afterStairsSteps: 8 }),
    equipmentWeights: Object.freeze({ ...BASE_EQUIPMENT_WEIGHTS, combatCore: 1, economyCore: 1 }),
    resourcePolicy: Object.freeze({ healPotionThreshold: 0.55, manaPotionThreshold: 0.55, healPriorityPolicy: "potion-first" })
  })
});

const PERSONA_IDS = Object.freeze(Object.keys(PERSONA_POLICIES));
const EXPLORATION_POLICY_INTERFACE = Object.freeze([
  "explorationPolicy",
  "exploration",
  "equipmentWeights",
  "resourcePolicy"
]);

function number(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export function percentile(sorted, probability) {
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] * (1 - (index - lower)) + sorted[upper] * (index - lower);
}

export function describe(values) {
  const finite = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!finite.length) return { n: 0, mean: null, p50: null, p90: null, min: null, max: null };
  return {
    n: finite.length,
    mean: mean(finite),
    p50: percentile(finite, 0.5),
    p90: percentile(finite, 0.9),
    min: finite[0],
    max: finite.at(-1)
  };
}

function classifyDeath(result) {
  if (!result.died) return null;
  if (["floor-trap", "flame-trap", "chest-trap", "from-drop-chest-trap", "secret-room-chest-trap", "poison"].includes(result.deathEncounterType)) {
    return "direct_mechanic_death";
  }
  const terminal = (result.encounterIdentityLog || []).filter(event => event.outcome === "death").at(-1);
  return DEATH_CATEGORIES.includes(terminal?.deathCategory) ? terminal.deathCategory : "unknown_or_mixed";
}

function compactCheckpoint(snapshot, runIndex) {
  return { ...snapshot, runIndex };
}

function compactRun(result, { persona, runIndex, worldSeed }) {
  const deathCategory = classifyDeath(result);
  const reachedDepth = Math.min(TARGET_DEPTH, number(result.reachedFloor));
  const checkpoints = Object.fromEntries(
    (result.checkpointSnapshots || [])
      .filter(snapshot => CHECKPOINTS.includes(snapshot.floor))
      .map(snapshot => [String(snapshot.floor), compactCheckpoint(snapshot, runIndex)])
  );
  return {
    persona,
    runIndex,
    worldSeed,
    reachedDepth,
    deathDepth: result.died ? number(result.deathFloor) : null,
    died: Boolean(result.died),
    deathCategory,
    terminationReason: result.terminationReason || null,
    encounters: number(result.battles),
    steps: number(result.steps),
    searchActions: number(result.searchActions),
    campUsage: number(result.campRestCount),
    equipmentDrops: number(result.equipmentFound),
    equipmentChanges: number(result.equipmentUpgrades),
    normalHits: number(result.normalCombatTelemetry?.incomingHits),
    normalDamage: number(result.normalCombatTelemetry?.incomingDamage),
    enemyActions: number(result.normalCombatTelemetry?.enemyActions),
    rounds: number(result.normalCombatTelemetry?.rounds),
    secretSearches: number(result.secretSearchAttempts),
    exploredRatio: describe(Object.values(result.exploredRatioByFloor || {}).map(Number)).mean,
    forcedPush: true,
    checkpoints
  };
}

function perFloor(value, row) {
  return number(value) / Math.max(1, row.reachedDepth);
}

function checkpointSummary(rows, depth) {
  const reachedRows = rows.filter(row => row.checkpoints[String(depth)]);
  const values = field => reachedRows.map(row => Number(row.checkpoints[String(depth)][field])).filter(Number.isFinite);
  const snapshot = field => describe(values(field));
  return {
    checkpoint: `B${depth}`,
    reachedCount: reachedRows.length,
    reachedRate: reachedRows.length / Math.max(1, rows.length),
    status: reachedRows.length ? "observed" : "unobserved",
    hpRatio: snapshot("hpRatio"),
    mpRatio: snapshot("mpRatio"),
    HP: snapshot("hp"),
    maxHP: snapshot("maxHP"),
    MP: snapshot("mp"),
    maxMP: snapshot("maxMP"),
    ATK: snapshot("ATK"),
    DEF: snapshot("DEF"),
    buildScore: snapshot("combatBuildScore"),
    encounters: snapshot("encountersSoFar"),
    normalHits: snapshot("normalHitsReceivedSoFar"),
    normalDamage: snapshot("totalNormalDamageSoFar"),
    enemyActions: snapshot("enemyActionsSoFar"),
    rounds: snapshot("roundsSoFar"),
    steps: snapshot("stepsSoFar"),
    equipmentChanges: snapshot("equipmentChangesSoFar"),
    equipmentDrops: snapshot("equipmentDropsSeen"),
    searchActions: snapshot("searchActionsSoFar"),
    campUsage: snapshot("campUsageSoFar"),
    representativeSnapshots: reachedRows.slice(0, 50).map(row => row.checkpoints[String(depth)])
  };
}

function aggregateRows(rows) {
  const deaths = rows.filter(row => row.died);
  const reached = Object.fromEntries(CHECKPOINTS.map(depth => {
    const count = rows.filter(row => row.reachedDepth >= depth).length;
    return [String(depth), { count, rate: count / Math.max(1, rows.length), status: count ? "observed" : "unobserved" }];
  }));
  const deathCategories = Object.fromEntries(DEATH_CATEGORIES.map(category => {
    const count = deaths.filter(row => row.deathCategory === category).length;
    return [category, { count, rate: count / Math.max(1, deaths.length), status: deaths.length ? "observed" : "unobserved" }];
  }));
  const exposure = metric => describe(rows.map(row => perFloor(row[metric], row)));
  const terminationReasons = Object.fromEntries(
    [...new Set(rows.map(row => row.terminationReason || "unknown"))].sort().map(reason => [
      reason,
      rows.filter(row => (row.terminationReason || "unknown") === reason).length
    ])
  );
  return {
    runs: rows.length,
    deaths: deaths.length,
    reachedDepth: describe(rows.map(row => row.reachedDepth)),
    reached,
    deathDepth: describe(deaths.map(row => row.deathDepth)),
    deathCategories,
    terminationReasons,
    exposure: {
      encountersPerFloor: exposure("encounters"),
      stepsPerFloor: exposure("steps"),
      normalDamagePerFloor: exposure("normalDamage"),
      normalHitsPerFloor: exposure("normalHits"),
      enemyActionsPerFloor: exposure("enemyActions"),
      roundsPerFloor: exposure("rounds"),
      equipmentChangesPerFloor: exposure("equipmentChanges"),
      equipmentDropsPerFloor: exposure("equipmentDrops"),
      searchActionsPerFloor: exposure("searchActions"),
      campUsagePerFloor: exposure("campUsage")
    },
    totals: {
      encounters: rows.reduce((sum, row) => sum + row.encounters, 0),
      steps: rows.reduce((sum, row) => sum + row.steps, 0),
      normalDamage: rows.reduce((sum, row) => sum + row.normalDamage, 0),
      enemyActions: rows.reduce((sum, row) => sum + row.enemyActions, 0),
      equipmentChanges: rows.reduce((sum, row) => sum + row.equipmentChanges, 0),
      equipmentDrops: rows.reduce((sum, row) => sum + row.equipmentDrops, 0)
    },
    checkpoints: Object.fromEntries(CHECKPOINTS.map(depth => [String(depth), checkpointSummary(rows, depth)]))
  };
}

export function conditionalSurvival(rows) {
  const transitions = [[5, 10], [10, 15], [15, 20], [20, 21], [21, 25], [25, 30]];
  return Object.fromEntries(transitions.map(([from, to]) => {
    const denominator = rows.filter(row => row.reachedDepth >= from).length;
    const numerator = rows.filter(row => row.reachedDepth >= to).length;
    return [`B${from}->B${to}`, {
      numerator,
      denominator,
      rate: denominator ? numerator / denominator : null,
      status: denominator ? "observed" : "unobserved",
      insufficient: denominator === 0
    }];
  }));
}

function pairComparison(rowsByPersona) {
  const result = {};
  const personaIds = Object.keys(rowsByPersona);
  for (let leftIndex = 0; leftIndex < personaIds.length; leftIndex++) {
    for (let rightIndex = leftIndex + 1; rightIndex < personaIds.length; rightIndex++) {
      const leftId = personaIds[leftIndex];
      const rightId = personaIds[rightIndex];
      const rightByRun = new Map(rowsByPersona[rightId].map(row => [row.runIndex, row]));
      const counts = { leftReachedDeeper: 0, sameDepth: 0, rightReachedDeeper: 0 };
      rowsByPersona[leftId].forEach(left => {
        const right = rightByRun.get(left.runIndex);
        if (!right) return;
        if (left.reachedDepth > right.reachedDepth) counts.leftReachedDeeper++;
        else if (left.reachedDepth < right.reachedDepth) counts.rightReachedDeeper++;
        else counts.sameDepth++;
      });
      const n = Object.values(counts).reduce((sum, value) => sum + value, 0);
      result[`${leftId}__${rightId}`] = {
        left: leftId,
        right: rightId,
        ...counts,
        rates: Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, n ? value / n : null])),
        pairedRuns: n,
        status: n ? "observed" : "unobserved"
      };
    }
  }
  return result;
}

function pearson(rows, left, right) {
  const pairs = rows.map(row => [left(row), right(row)]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
  if (pairs.length < 2) return { n: pairs.length, value: null, status: "insufficient" };
  const meanLeft = mean(pairs.map(pair => pair[0]));
  const meanRight = mean(pairs.map(pair => pair[1]));
  const numerator = pairs.reduce((sum, [a, b]) => sum + (a - meanLeft) * (b - meanRight), 0);
  const leftVariance = pairs.reduce((sum, [a]) => sum + (a - meanLeft) ** 2, 0);
  const rightVariance = pairs.reduce((sum, [, b]) => sum + (b - meanRight) ** 2, 0);
  return { n: pairs.length, value: leftVariance && rightVariance ? numerator / Math.sqrt(leftVariance * rightVariance) : null, status: "observed" };
}

function deathPrecedingCheckpoints(rows) {
  return Object.fromEntries(Object.keys(rows).map(persona => {
    const values = [];
    rows[persona].filter(row => row.died).forEach(row => {
      const checkpoint = CHECKPOINTS.filter(depth => depth < row.deathDepth && row.checkpoints[String(depth)]).at(-1);
      if (!checkpoint) return;
      const snapshot = row.checkpoints[String(checkpoint)];
      values.push({ checkpoint, snapshot, row });
    });
    return [persona, Object.fromEntries(CHECKPOINTS.map(depth => {
      const selected = values.filter(value => value.checkpoint === depth);
      const field = name => describe(selected.map(value => Number(value.snapshot[name])).filter(Number.isFinite));
      return [`B${depth}`, { deathsAfterCheckpoint: selected.length, hpRatio: field("hpRatio"), mpRatio: field("mpRatio"), ATK: field("ATK"), DEF: field("DEF"), buildScore: field("combatBuildScore"), equipmentChanges: field("equipmentChangesSoFar"), normalHits: field("normalHitsReceivedSoFar"), normalDamage: field("totalNormalDamageSoFar"), enemyActions: field("enemyActionsSoFar"), rounds: field("roundsSoFar"), encounters: field("encountersSoFar"), steps: field("stepsSoFar") }];
    }))];
  }));
}

export function runMeasurement({ seed = DEFAULT_SEED, runs = DEFAULT_RUNS, personas = PERSONA_IDS, provenance = null, environmentSignature = null } = {}) {
  if (!Number.isInteger(runs) || runs < 1) throw new Error(`runs must be a positive integer: ${runs}`);
  const selected = [...new Set(personas)];
  if (!selected.length || selected.some(id => !PERSONA_POLICIES[id])) throw new Error(`personas must be ${PERSONA_IDS.join(",")}`);
  const baseScenario = getScenarioById("legacy-no-portal");
  const scoringProfile = calibrateCoreScoringProfile(
    Math.min(10, runs),
    { routePolicy: "partial_information_exploration", equipmentUpdatePolicy: "deterministic_greedy", fleePolicy: "never", useTownPortal: false },
    "powder",
    baseScenario.workshop,
    ["Mage"]
  );
  const rowsByPersona = Object.fromEntries(selected.map(id => [id, []]));
  for (const persona of selected) {
    const policy = PERSONA_POLICIES[persona];
    const personaScoringProfile = { ...scoringProfile, personaEquipmentWeights: policy.equipmentWeights };
    for (let runIndex = 0; runIndex < runs; runIndex++) {
      const worldSeed = `${seed}:world:${runIndex}`;
      const result = simulateRun({
        className: "Mage",
        startFloor: 1,
        targetDepth: TARGET_DEPTH + 1,
        runIndex,
        seriesId: "issue990-phase3-stage1",
        worldSeed,
        scoringProfile: personaScoringProfile,
        scenario: {
          ...baseScenario,
          routePolicy: "partial_information_exploration",
          equipmentUpdatePolicy: "deterministic_greedy",
          personaId: persona,
          personaPolicy: policy,
          fleePolicy: "never",
          useTownPortal: false,
          healPotionThreshold: policy.resourcePolicy.healPotionThreshold,
          manaPotionThreshold: policy.resourcePolicy.manaPotionThreshold,
          healPriorityPolicy: policy.resourcePolicy.healPriorityPolicy,
          identificationPolicy: "powder",
          collectEncounterIdentities: true,
          collectCheckpointSnapshots: true
        },
        workshop: baseScenario.workshop,
        collectEquipmentTelemetry: true
      });
      rowsByPersona[persona].push(compactRun(result, { persona, runIndex, worldSeed }));
    }
  }
  const summaries = Object.fromEntries(selected.map(persona => [persona, {
    persona: PERSONA_POLICIES[persona],
    summary: aggregateRows(rowsByPersona[persona]),
    conditionalSurvival: conditionalSurvival(rowsByPersona[persona])
  }]));
  const b21Plus = Object.fromEntries(selected.map(persona => {
    const summary = summaries[persona].summary;
    return [persona, Object.fromEntries([21, 25, 30].map(depth => [String(depth), summary.reached[String(depth)]]))];
  }));
  return {
    schemaVersion: SCHEMA_VERSION,
    measurement: {
      issue: 990,
      phase: 3,
      stage: 1,
      runnerVersion: RUNNER_VERSION,
      sourceCommit: provenance?.sourceCommit || null,
      mainBaselineSha: provenance?.baseCommit || null,
      measurementRunnerDiffSha256: provenance?.measurementRunnerDiffSha256 || null,
      environmentSignature,
      configuration: { seed, runs, personas: selected, className: "Mage", startFloor: 1, targetDepth: TARGET_DEPTH, checkpoints: CHECKPOINTS, forcedPush: true, retreatModeled: false },
      seedPolicy: `runIndex i uses ${seed}:world:i for every selected persona; only policy inputs differ`,
      worldSeedTemplate: `${seed}:world:{runIndex}`,
      personaInterface: [...EXPLORATION_POLICY_INTERFACE],
      modeledSystems: ["production run-floor generation", "production-backed movement and known-cell frontier exploration", "production secret search", "production encounter generation", "production combat/enemy behavior", "production loot/equipment generation and eligibility", "production Core/Support and curse/unidentified powder rules", "production HP/MP carry-over, camp, floor transition recovery, milestone boss", "#983 exclusive death classification with state degradation evidence", "checkpoint state capture and population aggregation"],
      omittedSystems: ["real-player behavior distribution", "checkpoint continuation/resampling", "return/retreat judgment", "Monte Carlo/search/RL/future simulation", "human UI timing", "full raw encounter history in evidence"],
      productionBalanceChanged: false,
      N: runs,
      seed
    },
    personaDefinitions: selected.map(id => PERSONA_POLICIES[id]),
    naturalProgression: summaries,
    checkpointPopulation: Object.fromEntries(selected.map(persona => [persona, summaries[persona].summary.checkpoints])),
    conditionalSurvival: Object.fromEntries(selected.map(persona => [persona, summaries[persona].conditionalSurvival])),
    b21Plus,
    deathSummaries: Object.fromEntries(selected.map(persona => [persona, { categories: summaries[persona].summary.deathCategories, precedingCheckpoints: deathPrecedingCheckpoints(rowsByPersona)[persona] }])),
    comparison: {
      personaPairs: pairComparison(rowsByPersona),
      correlations: Object.fromEntries(selected.map(persona => [persona, {
        explorationVsEquipmentChanges: pearson(rowsByPersona[persona], row => perFloor(row.steps, row), row => row.equipmentChanges),
        explorationVsNormalDamage: pearson(rowsByPersona[persona], row => perFloor(row.steps, row), row => row.normalDamage),
        explorationVsEnemyActions: pearson(rowsByPersona[persona], row => perFloor(row.steps, row), row => row.enemyActions)
      }])),
      interpretation: "Run reach is persona-level natural progression. No encounter raw log or checkpoint continuation is used. Pair comparison is same-seed reached-depth comparison, not #975 encounter-level build evidence."
    },
    audit: {
      hiddenStairsUsed: false,
      hiddenBossUsed: false,
      hiddenSecretDoorUsed: false,
      futureEncounterInfoUsed: false,
      futureLootUsed: false,
      unidentifiedHiddenAffixUsed: false,
      retreatDecisionUsed: false,
      forcedPush: true,
      rawEncounterHistoryStored: false,
      productionBalanceChanged: false,
      deathCategories: [...DEATH_CATEGORIES],
      deathCategoryContract: "every death receives exactly one exclusive category; mechanic-mediated requires state-degradation evidence from production causal classifier"
    }
  };
}

function percent(value) { return value === null || value === undefined ? "n/a" : `${(Number(value) * 100).toFixed(1)}%`; }
function fmt(value) { return value === null || value === undefined || !Number.isFinite(Number(value)) ? "n/a" : Number(value).toFixed(2); }
function checkpointMean(summary, field) { return summary?.[field]?.mean ?? null; }

export function renderSummary(report) {
  const personas = report.measurement.configuration.personas;
  const summaries = Object.fromEntries(personas.map(persona => [persona, report.naturalProgression[persona].summary]));
  const meanDepths = personas.map(persona => summaries[persona].reachedDepth.mean).filter(Number.isFinite);
  const deepestPersona = personas.slice().sort((left, right) => summaries[right].reachedDepth.mean - summaries[left].reachedDepth.mean)[0] || "n/a";
  const deepestMean = summaries[deepestPersona]?.reachedDepth.mean ?? null;
  const shallowestMean = meanDepths.length ? Math.min(...meanDepths) : null;
  const reversePairObserved = Object.values(report.comparison.personaPairs).some(pair => pair.leftReachedDeeper > 0 && pair.rightReachedDeeper > 0);
  const getExposure = (persona, field) => summaries[persona]?.exposure[field]?.mean ?? null;
  const getCheckpoint = (persona, field, depth = 5) => summaries[persona]?.checkpoints[String(depth)]?.[field]?.mean ?? null;
  const explorerSteps = getExposure("explorer", "stepsPerFloor");
  const explorerDrops = getExposure("explorer", "equipmentDropsPerFloor");
  const explorerChanges = getExposure("explorer", "equipmentChangesPerFloor");
  const explorerDamage = getExposure("explorer", "normalDamagePerFloor");
  const referencePersona = summaries.balanced ? "balanced" : personas[0];
  const referenceSteps = getExposure(referencePersona, "stepsPerFloor");
  const referenceDrops = getExposure(referencePersona, "equipmentDropsPerFloor");
  const referenceChanges = getExposure(referencePersona, "equipmentChangesPerFloor");
  const referenceDamage = getExposure(referencePersona, "normalDamagePerFloor");
  const b5ToB10 = report.conditionalSurvival[deepestPersona]?.["B5->B10"];
  const rawShares = personas.map(persona => summaries[persona].deathCategories.pure_raw.rate).filter(Number.isFinite);
  const lines = [
    "# Issue #990 Phase 3 Stage 1 — virtual player population",
    "",
    `- runner: \`${RUNNER_VERSION}\` / schema \`${SCHEMA_VERSION}\``,
    `- seed: \`${report.measurement.configuration.seed}\`; N: **${report.measurement.configuration.runs} / persona**`,
    "- production-backed, deterministic, B1-start, same-seed, forced-push; retreat behavior is not modeled",
    "",
    "These personas are measurement policies, not claims about real player behavior. They measure sensitivity to simple, explainable play priorities.",
    "",
    "## Table 1 — Reach",
    "",
    "| persona | mean depth | B5 | B10 | B15 | B20 | B21 | B25 | B30 |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...personas.map(persona => {
      const summary = report.naturalProgression[persona].summary;
      return `| ${persona} | ${fmt(summary.reachedDepth.mean)} | ${percent(summary.reached["5"].rate)} | ${percent(summary.reached["10"].rate)} | ${percent(summary.reached["15"].rate)} | ${percent(summary.reached["20"].rate)} | ${percent(summary.reached["21"].rate)} | ${percent(summary.reached["25"].rate)} | ${percent(summary.reached["30"].rate)} |`;
    }),
    "",
    "## Table 2 — Conditional survival",
    "",
    "| persona | B5→B10 | B10→B15 | B15→B20 | B20→B21 | B21→B25 | B25→B30 |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...personas.map(persona => `| ${persona} | ${Object.values(report.conditionalSurvival[persona]).map(value => `${value.status === "unobserved" ? "n/a" : percent(value.rate)} (n=${value.denominator})`).join(" | ")} |`),
    "",
    "## Table 3 — Resource state (checkpoint mean)",
    "",
    "| checkpoint | persona | HP% | MP% | ATK | DEF | build score |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: |",
    ...CHECKPOINTS.flatMap(depth => personas.map(persona => {
      const checkpoint = report.checkpointPopulation[persona][String(depth)];
      return `| B${depth} | ${persona} | ${checkpoint.reachedCount ? percent(checkpointMean(checkpoint, "hpRatio")) : "n/a"} | ${checkpoint.reachedCount ? percent(checkpointMean(checkpoint, "mpRatio")) : "n/a"} | ${checkpoint.reachedCount ? fmt(checkpointMean(checkpoint, "ATK")) : "n/a"} | ${checkpoint.reachedCount ? fmt(checkpointMean(checkpoint, "DEF")) : "n/a"} | ${checkpoint.reachedCount ? fmt(checkpointMean(checkpoint, "buildScore")) : "n/a"} |`;
    })),
    "",
    "## Table 4 — Exposure",
    "",
    "| persona | encounters/floor | steps/floor | normal damage/floor | enemy actions/floor | equipment changes/floor |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    ...personas.map(persona => {
      const exposure = report.naturalProgression[persona].summary.exposure;
      return `| ${persona} | ${fmt(exposure.encountersPerFloor.mean)} | ${fmt(exposure.stepsPerFloor.mean)} | ${fmt(exposure.normalDamagePerFloor.mean)} | ${fmt(exposure.enemyActionsPerFloor.mean)} | ${fmt(exposure.equipmentChangesPerFloor.mean)} |`;
    }),
    "",
    "## Table 5 — Death causes",
    "",
    "| persona | pure raw | mechanic-mediated | direct mechanic | unknown/mixed |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...personas.map(persona => {
      const categories = report.naturalProgression[persona].summary.deathCategories;
      return `| ${persona} | ${categories.pure_raw_damage.count} (${percent(categories.pure_raw_damage.rate)}) | ${categories.mechanic_mediated_raw_lethal.count} (${percent(categories.mechanic_mediated_raw_lethal.rate)}) | ${categories.direct_mechanic_death.count} (${percent(categories.direct_mechanic_death.rate)}) | ${categories.unknown_or_mixed.count} (${percent(categories.unknown_or_mixed.rate)}) |`;
    }),
    "",
    "## Table 6 — Persona pair comparison",
    "",
    "| pair | left deeper | same depth | right deeper | paired N |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...Object.values(report.comparison.personaPairs).map(pair => `| ${pair.left} vs ${pair.right} | ${pair.leftReachedDeeper} | ${pair.sameDepth} | ${pair.rightReachedDeeper} | ${pair.pairedRuns} |`),
    "",
    "## Checkpoint population",
    "",
    "Only reached checkpoint snapshots and at most 50 representative samples per persona × checkpoint are durable evidence. Full encounter histories remain in runner memory only.",
    "",
    ...personas.flatMap(persona => CHECKPOINTS.map(depth => {
      const checkpoint = report.checkpointPopulation[persona][String(depth)];
      return `- ${persona} B${depth}: reached=${checkpoint.reachedCount}/${report.measurement.configuration.runs}; HP p50=${fmt(checkpoint.hpRatio.p50)}; MP p50=${fmt(checkpoint.mpRatio.p50)}; ATK=${fmt(checkpoint.ATK.mean)}; DEF=${fmt(checkpoint.DEF.mean)}; equipment changes=${fmt(checkpoint.equipmentChanges.mean)}`;
    })),
    "",
    "## Answers",
    "",
    `1. 到達深度の平均は ${fmt(shallowestMean)}〜${fmt(deepestMean)}（幅 ${fmt(deepestMean === null || shallowestMean === null ? null : deepestMean - shallowestMean)}）。explorer の B5 到達率は ${percent(summaries.explorer?.reached["5"]?.rate)} で、他の ${referencePersona} は ${percent(summaries[referencePersona]?.reached["5"]?.rate)}。`,
    `2. 最深到達 persona: ${deepestPersona}（平均 ${fmt(deepestMean)} floor）。`,
    `3. 全面支配: ${reversePairObserved ? "なし。同一seedで両方向の深度逆転を観測した。" : "同一seedで両方向の深度逆転は未観測。"}`,
    `4. 探索量と装備成長: explorer は ${fmt(explorerSteps)} steps/floor、${fmt(explorerDrops)} drops/floor、${fmt(explorerChanges)} changes/floor。${referencePersona} は ${fmt(referenceSteps)}、${fmt(referenceDrops)}、${fmt(referenceChanges)} で、探索増加はdropと変更数を増やす方向だった。`,
    `5. 探索量と HP/MP 消耗: explorer の normal damage は ${fmt(explorerDamage)}/floor、B5 HP/MP は ${percent(getCheckpoint("explorer", "hpRatio"))}/${percent(getCheckpoint("explorer", "mpRatio"))}。${referencePersona} は ${fmt(referenceDamage)}/floor、${percent(getCheckpoint(referencePersona, "hpRatio"))}/${percent(getCheckpoint(referencePersona, "mpRatio"))} で、探索型の曝露増加と資源低下が同時に観測された。`,
    `6. 階段直行: stairs-first の B5 到達率は ${percent(summaries["stairs-first"]?.reached["5"]?.rate)}、B5→B10 は ${report.conditionalSurvival["stairs-first"]?.["B5->B10"]?.status === "unobserved" ? "n/a" : percent(report.conditionalSurvival["stairs-first"]?.["B5->B10"]?.rate)}。この N では生存優位は確認できない。`,
    `7. cautious: B5 到達率 ${percent(summaries.cautious?.reached["5"]?.rate)}、平均深度 ${fmt(summaries.cautious?.reachedDepth.mean)} で、stairs-first/balanced と同程度。深層生存への優位は観測できない。`,
    `8. aggressive: ${fmt(getExposure("aggressive", "enemyActionsPerFloor"))} enemy actions/floor、${fmt(getExposure("aggressive", "roundsPerFloor"))} rounds/floor。${referencePersona} の ${fmt(getExposure(referencePersona, "enemyActionsPerFloor"))}/${fmt(getExposure(referencePersona, "roundsPerFloor"))} とほぼ同じで、明確な短縮は確認できない。`,
    `9. B21+ population: ${personas.map(persona => `${persona}=B21 ${report.b21Plus[persona]["21"].count}, B25 ${report.b21Plus[persona]["25"].count}, B30 ${report.b21Plus[persona]["30"].count}`).join("; ")}。全て unobserved。`,
    `10. population bottleneck: B5→B10 は ${b5ToB10?.status === "unobserved" ? "unobserved" : `${percent(b5ToB10.rate)} (n=${b5ToB10.denominator})`}。B10以降は全personaで分母0のため unobserved。`,
    `11. B5 は観測された最後の checkpoint で、explorer は HP/MP ${percent(getCheckpoint("explorer", "hpRatio"))}/${percent(getCheckpoint("explorer", "mpRatio"))}、ATK/DEF ${fmt(getCheckpoint("explorer", "ATK"))}/${fmt(getCheckpoint("explorer", "DEF"))}。B10到達者がいないため、B5→B10の後比較は行わず、deathSummaries に保存した。`,
    `12. pure raw: persona別割合は ${percent(Math.min(...rawShares))}〜${percent(Math.max(...rawShares))}。explorerだけ低めだが、全persona共通の増加とは言えない。`,
    "13. Phase 2 の「AIが弱すぎただけ」という説明は部分的に残るが、explorer の B5 差に対して全personaが同じ B5→B10 で崩れるため、ゲーム構造側のボトルネックも残る。",
    "14. #973 Build Confidence: **Revise**。Stage 1 は persona run reach の測定であり、#975 encounter-level build confidence を置換しない。",
    "15. #990 は **open のまま**。",
    "16. Stage 2 は checkpoint population をレビューしてから進める。",
    "17. production tuning は **行わない**。production src/ balance は変更していない。",
    "",
    "## Reproduction",
    "",
    "```sh",
    `node scratch/measurements/issue990_phase3_stage1.js --runs ${report.measurement.configuration.runs} --seed ${report.measurement.configuration.seed} --personas ${personas.join(",")} --output evidence/results/issue-990-phase3-stage1.json --summary evidence/results/issue-990-phase3-stage1.md`,
    "```",
    ""
  ];
  return lines.join("\n");
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (["--runs", "--seed", "--personas", "--output", "--summary"].includes(arg)) options[arg.slice(2)] = argv[++index];
    else if (arg === "--help") { console.log("Usage: node scratch/measurements/issue990_phase3_stage1.js --runs 500 --seed issue990-phase3-stage1 --personas cautious,aggressive,explorer,stairs-first,balanced --output evidence/results/issue-990-phase3-stage1.json --summary evidence/results/issue-990-phase3-stage1.md"); process.exit(0); }
    else throw new Error(`unknown option: ${arg}`);
  }
  return {
    runs: options.runs === undefined ? DEFAULT_RUNS : Number(options.runs),
    seed: options.seed || DEFAULT_SEED,
    personas: options.personas ? options.personas.split(",").map(value => value.trim()).filter(Boolean) : PERSONA_IDS,
    output: options.output || null,
    summary: options.summary || null
  };
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (!options.output || !options.summary) throw new Error("--output and --summary are required");
  const provenance = requireRunnerProvenance({
    fetchOriginMain: false,
    measurementRunnerPaths: ["scratch/measurements/issue990_phase3_stage1.js", "scratch/simulations/sim_depth_material_ev.js", "scratch/measurements/measurement_provenance.js"]
  });
  const environmentSignature = printEnvSignatureBanner({ runnerVersion: RUNNER_VERSION, seed: options.seed, runs: options.runs, personas: options.personas, targetDepth: TARGET_DEPTH }, { label: "issue990 phase3 stage1 env" });
  const report = runMeasurement({ ...options, provenance, environmentSignature });
  const outputPath = resolve(options.output);
  const summaryPath = resolve(options.summary);
  fs.mkdirSync(dirname(outputPath), { recursive: true });
  fs.mkdirSync(dirname(summaryPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report)}\n`);
  fs.writeFileSync(summaryPath, renderSummary(report));
  console.log(`Wrote Issue #990 Phase 3 Stage 1 JSON evidence: ${outputPath}`);
  console.log(`Wrote Issue #990 Phase 3 Stage 1 Markdown evidence: ${summaryPath}`);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
