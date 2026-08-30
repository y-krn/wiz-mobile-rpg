// sim-scope: formula — production generateEncounter frequency-weighted combat measurement
/* global console, process */

import fs from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createRng } from "../../src/seed_rng.js";
import { generateEncounter } from "../../src/combat_ui/encounter.js";
import {
  BUILD_IDS,
  TARGET_DEPTHS,
  createBuildCharacter,
  createEncounterFixture,
  getBuildDefinitions,
  runEncounterSample
} from "./issue973_build_sensitivity.js";
import { requireRunnerProvenance } from "./measurement_provenance.js";
import { printEnvSignatureBanner } from "./measurement_env_signature.js";

export const RUNNER_VERSION = "issue987-production-frequency-v1";
export const DEFAULT_SEED = "987-production-frequency";
export const DEFAULT_GENERATED_RUNS = 5000;
export const DEFAULT_STRESS_RUNS = 500;
export const COUNTERFACTUALS = Object.freeze([
  { id: "baseline", label: "baseline", kind: "baseline" },
  { id: "W1_normal_damage_075", label: "W1: normal physical damage ×0.75", kind: "normal_damage", rate: 0.75 },
  { id: "W2_enemy_hp_075", label: "W2: enemy HP ×0.75", kind: "enemy_hp", rate: 0.75 },
  { id: "W3_enemy_action_exposure_1", label: "W3: total enemy actions capped at 1/round", kind: "enemy_action_exposure", maxActionsPerRound: 1 }
]);
export const SCHEMA_VERSION = 1;

const EXCLUSIVE_CATEGORIES = Object.freeze([
  "pure_raw_damage",
  "mechanic_mediated_raw_lethal",
  "direct_mechanic_death",
  "unknown_or_mixed"
]);
const BUILD_MAX_HP = Object.fromEntries(BUILD_IDS.map(buildId => [buildId, createBuildCharacter(buildId).hp]));

function baseMonsterName(name) { return String(name).replace(/ [A-Z]$/, ""); }

function describe(values) {
  if (values.length === 0) return { count: 0, mean: null, p50: null, p90: null, p95: null, min: null, max: null };
  const sorted = [...values].sort((left, right) => left - right);
  const percentile = probability => {
    const index = (sorted.length - 1) * probability;
    const lower = Math.floor(index); const upper = Math.ceil(index);
    return lower === upper ? sorted[lower] : sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
  };
  return {
    count: values.length,
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
    p50: percentile(0.5), p90: percentile(0.9), p95: percentile(0.95), min: sorted[0], max: sorted.at(-1)
  };
}

function normalCi(values) {
  if (values.length === 0) return { estimate: null, ci95: [null, null], significant: false };
  const estimate = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (values.length < 2) return { estimate, ci95: [estimate, estimate], significant: false };
  const variance = values.reduce((sum, value) => sum + ((value - estimate) ** 2), 0) / (values.length - 1);
  const margin = 1.96 * Math.sqrt(variance / values.length);
  return { estimate, ci95: [estimate - margin, estimate + margin], significant: Math.abs(estimate) > margin };
}

function increment(map, key, amount = 1) { map[key] = (map[key] || 0) + amount; }

function monsterDescriptor(monster) {
  return {
    identity: baseMonsterName(monster.name), role: monster.role || "unknown",
    traits: [...(monster.traits || [])].sort(), tags: [...(monster.tags || [])].sort(),
    statusAttackPattern: monster.statusAttackPattern || null, spell: monster.spell || null,
    isRare: Boolean(monster.isRare), hp: monster.maxHp, atk: monster.atk, def: monster.def
  };
}

function encounterFamily(monsters) {
  const traits = new Set(monsters.flatMap(monster => monster.traits || []));
  const families = [
    ["reflection_counter", ["reflectMagic", "reflectPhysical", "counterSpell"]], ["magic_denial", ["silence"]],
    ["mp_drain", ["drainMp"]], ["recovery_denial", ["antiHeal"]], ["regen", ["regen"]],
    ["protected_formation", ["guardAdjacent", "buffPhysicalDef", "buffMagicDef"]],
    ["summon_split", ["summonAlly", "splitOnDeath"]], ["multi_action", ["multiAction"]],
    ["status_pressure", ["chargeAttack", "selfDestruct"]]
  ];
  const matched = families.filter(([, names]) => names.some(name => traits.has(name))).map(([name]) => name);
  if (matched.length > 0) return matched.join("+");
  return monsters.length > 1 ? "multi_enemy_ordinary" : `single_${monsters[0]?.role || "unknown"}`;
}

function compositionKey(monsters) { return monsters.map(monster => baseMonsterName(monster.name)).sort().join(" + "); }

function createDistribution(depth, runs) {
  return { depth, runs, sizeCounts: {}, compositionCounts: {}, compositionCatalog: {}, monsterIdentityCounts: {}, roleCounts: {}, traitCounts: {} };
}

function observeGeneratedEncounter(distribution, monsters) {
  const key = compositionKey(monsters);
  increment(distribution.sizeCounts, String(monsters.length)); increment(distribution.compositionCounts, key);
  distribution.compositionCatalog[key] ||= { family: encounterFamily(monsters), monsters: monsters.map(monsterDescriptor) };
  monsters.forEach(monster => {
    increment(distribution.monsterIdentityCounts, baseMonsterName(monster.name));
    increment(distribution.roleCounts, monster.role || "unknown");
    (monster.traits || []).forEach(trait => increment(distribution.traitCounts, trait));
  });
}

function finalizeDistribution(distribution) {
  const total = distribution.runs;
  const averageEnemyCount = Object.entries(distribution.sizeCounts).reduce((sum, [size, count]) => sum + Number(size) * count, 0) / total;
  const withRates = counts => Object.fromEntries(Object.entries(counts).map(([key, count]) => [key, { count, rate: count / total }]));
  return { ...distribution, averageEnemyCount, sizeCounts: withRates(distribution.sizeCounts), compositionCounts: withRates(distribution.compositionCounts), monsterIdentityCounts: withRates(distribution.monsterIdentityCounts), roleCounts: withRates(distribution.roleCounts), traitCounts: withRates(distribution.traitCounts) };
}

function extractRunMetrics(sample) {
  const normalEvents = sample.causalDamageEvents.filter(event => event.attackType === "physical" && event.causalType === "normal");
  const normalHits = normalEvents.filter(event => event.finalDamage > 0);
  const totalEnemyActions = sample.trace.reduce((sum, round) => sum + (round.enemyTurnEvents?.length ?? round.enemyActions?.length ?? 0), 0);
  const playerHpRemoved = sample.trace.reduce((sum, round) => sum + Math.max(0, round.hp.before - round.hp.after), 0);
  const enemyHpRemoved = sample.trace.reduce((sum, round) => sum + Math.max(0, round.enemyState.before.totalHp - round.enemyState.after.totalHp), 0);
  const lethal = sample.causalDamageEvents.filter(event => event.lethal).at(-1) || null;
  const maxHp = BUILD_MAX_HP[sample.buildId || "aoe-burst"];
  return {
    normalHitDamages: normalHits.map(event => event.finalDamage), normalAttacksReceived: normalHits.length,
    normalDamageTotal: normalHits.reduce((sum, event) => sum + event.finalDamage, 0),
    lethalHitOverMaxHp: lethal?.attackType === "physical" && lethal.finalDamage > 0 ? lethal.finalDamage / Math.max(1, maxHp) : null,
    rounds: sample.rounds, initialEnemyCount: sample.fixture.monsterNames.length, totalEnemyActions,
    totalEnemyActionsPerRound: totalEnemyActions / Math.max(1, sample.rounds),
    playerHpRemovalSpeed: playerHpRemoved / Math.max(1, sample.rounds), enemyHpRemovalSpeed: enemyHpRemoved / Math.max(1, sample.rounds),
    postCombatHpRatio: sample.hpRatio, postCombatMpRatio: sample.mpRatio
  };
}

function createAggregate(dimensions) {
  return {
    dimensions, runs: 0, outcomes: { clear: 0, death: 0, timeout: 0 },
    exclusiveDeathCategories: Object.fromEntries(EXCLUSIVE_CATEGORIES.map(category => [category, 0])), legacyRawDamageDeaths: 0,
    legacyRawExclusiveCategories: Object.fromEntries(EXCLUSIVE_CATEGORIES.map(category => [category, 0])),
    normalHitDamages: [], lethalHitOverMaxHp: [], normalAttacksReceived: [], normalDamageTotal: [], rounds: [], totalEnemyActionsPerRound: [],
    playerHpRemovalSpeed: [], enemyHpRemovalSpeed: [], postCombatHpRatio: [], postCombatMpRatio: []
  };
}

function addAggregate(aggregate, sample, metrics) {
  aggregate.runs++; aggregate.outcomes[sample.outcome]++;
  if (sample.outcome === "death") {
    const category = EXCLUSIVE_CATEGORIES.includes(sample.failure?.finalExclusiveCategory) ? sample.failure.finalExclusiveCategory : "unknown_or_mixed";
    aggregate.exclusiveDeathCategories[category]++;
    if (sample.failure?.legacyPrimary === "raw_damage_pressure") {
      aggregate.legacyRawDamageDeaths++; aggregate.legacyRawExclusiveCategories[category]++;
    }
  }
  aggregate.normalHitDamages.push(...metrics.normalHitDamages);
  if (metrics.lethalHitOverMaxHp !== null) aggregate.lethalHitOverMaxHp.push(metrics.lethalHitOverMaxHp);
  [
    ["normalAttacksReceived", metrics.normalAttacksReceived], ["normalDamageTotal", metrics.normalDamageTotal], ["rounds", metrics.rounds],
    ["totalEnemyActionsPerRound", metrics.totalEnemyActionsPerRound], ["playerHpRemovalSpeed", metrics.playerHpRemovalSpeed],
    ["enemyHpRemovalSpeed", metrics.enemyHpRemovalSpeed], ["postCombatHpRatio", metrics.postCombatHpRatio], ["postCombatMpRatio", metrics.postCombatMpRatio]
  ].forEach(([field, value]) => aggregate[field].push(value));
}

function finalizeAggregate(aggregate) {
  const runs = Math.max(1, aggregate.runs); const deaths = aggregate.outcomes.death; const raw = aggregate.legacyRawDamageDeaths;
  const rates = counts => Object.fromEntries(EXCLUSIVE_CATEGORIES.map(category => [category, counts[category] / runs]));
  const shares = (counts, denominator) => Object.fromEntries(EXCLUSIVE_CATEGORIES.map(category => [category, counts[category] / Math.max(1, denominator)]));
  if (Object.values(aggregate.legacyRawExclusiveCategories).reduce((sum, count) => sum + count, 0) !== raw) throw new Error(`exclusive legacy raw categories must sum to ${raw}`);
  if (Object.values(aggregate.exclusiveDeathCategories).reduce((sum, count) => sum + count, 0) !== deaths) throw new Error(`exclusive death categories must sum to ${deaths}`);
  return {
    dimensions: aggregate.dimensions, runs: aggregate.runs, outcomes: aggregate.outcomes, clearRate: aggregate.outcomes.clear / runs, deathRate: deaths / runs,
    pureRawDeaths: aggregate.exclusiveDeathCategories.pure_raw_damage, pureRawRate: aggregate.exclusiveDeathCategories.pure_raw_damage / runs,
    exclusiveDeathCategories: aggregate.exclusiveDeathCategories, exclusiveDeathCategoryRates: rates(aggregate.exclusiveDeathCategories), exclusiveDeathCategoryShares: shares(aggregate.exclusiveDeathCategories, deaths),
    legacyRawDamageDeaths: raw, legacyRawExclusiveCategories: aggregate.legacyRawExclusiveCategories, legacyRawCategoryShares: shares(aggregate.legacyRawExclusiveCategories, raw),
    specialMechanicDeaths: aggregate.legacyRawExclusiveCategories.mechanic_mediated_raw_lethal + aggregate.legacyRawExclusiveCategories.direct_mechanic_death,
    metrics: {
      normalHitDamage: describe(aggregate.normalHitDamages), lethalHitOverMaxHp: describe(aggregate.lethalHitOverMaxHp), normalAttacksReceived: describe(aggregate.normalAttacksReceived),
      totalNormalDamage: describe(aggregate.normalDamageTotal), rounds: describe(aggregate.rounds), totalEnemyActionsPerRound: describe(aggregate.totalEnemyActionsPerRound),
      playerHpRemovalSpeed: describe(aggregate.playerHpRemovalSpeed), enemyHpRemovalSpeed: describe(aggregate.enemyHpRemovalSpeed), postCombatHpRatio: describe(aggregate.postCombatHpRatio), postCombatMpRatio: describe(aggregate.postCombatMpRatio)
    }
  };
}

function viewKeys(meta) {
  return [
    ["overall", {}], [`build:${meta.buildId}`, { buildId: meta.buildId }], [`depth:B${meta.depth}`, { depth: meta.depth }],
    [`enemy-count:${meta.enemyCount}`, { enemyCount: meta.enemyCount }], [`family:${meta.family}`, { family: meta.family }],
    [`cell:B${meta.depth}:${meta.family}:${meta.buildId}`, { depth: meta.depth, family: meta.family, buildId: meta.buildId }]
  ];
}

function addToViews(views, meta, sample, metrics) {
  viewKeys(meta).forEach(([key, dimensions]) => {
    let aggregate = views.get(key);
    if (!aggregate) { aggregate = createAggregate(dimensions); views.set(key, aggregate); }
    addAggregate(aggregate, sample, metrics);
  });
}

function createPairAggregate(dimensions) { return { dimensions, pairedRuns: 0, clearDifferences: [], hpDifferences: [], mpDifferences: [], utilityDifferences: [], baselinePureRawDeaths: 0, candidatePureRawDeaths: 0, pureRawDeathsAvoided: 0 }; }

function addPair(pair, baseline, candidate) {
  pair.pairedRuns++;
  const baselinePure = baseline.outcome === "death" && baseline.failure?.finalExclusiveCategory === "pure_raw_damage";
  const candidatePure = candidate.outcome === "death" && candidate.failure?.finalExclusiveCategory === "pure_raw_damage";
  pair.baselinePureRawDeaths += Number(baselinePure); pair.candidatePureRawDeaths += Number(candidatePure); pair.pureRawDeathsAvoided += Number(baselinePure && !candidatePure);
  pair.clearDifferences.push(Number(baseline.outcome === "clear") - Number(candidate.outcome === "clear"));
  pair.hpDifferences.push(baseline.hpRatio - candidate.hpRatio); pair.mpDifferences.push(baseline.mpRatio - candidate.mpRatio);
  const utility = sample => (sample.outcome === "clear" ? 1 : 0) + sample.hpRatio * 0.25 + sample.mpRatio * 0.25 - sample.rounds * 0.1 / 200;
  pair.utilityDifferences.push(utility(baseline) - utility(candidate));
}

function finalizePair(pair) {
  return {
    dimensions: pair.dimensions, pairedRuns: pair.pairedRuns, clearRateDifference: normalCi(pair.clearDifferences), hpPreservationDifference: normalCi(pair.hpDifferences),
    mpPreservationDifference: normalCi(pair.mpDifferences), utilityDifference: normalCi(pair.utilityDifferences), baselinePureRawDeaths: pair.baselinePureRawDeaths,
    candidatePureRawDeaths: pair.candidatePureRawDeaths, pureRawDeathsAvoided: pair.pureRawDeathsAvoided
  };
}

function pairKeys(meta) { return [["overall", {}], [`family:${meta.family}`, { family: meta.family }], [`cell:B${meta.depth}:${meta.family}`, { depth: meta.depth, family: meta.family }]]; }

function addToPairs(pairs, meta, baseline, candidate) {
  pairKeys(meta).forEach(([key, dimensions]) => {
    let pair = pairs.get(key);
    if (!pair) { pair = createPairAggregate(dimensions); pairs.set(key, pair); }
    addPair(pair, baseline, candidate);
  });
}

function buildPairMap() {
  const pairs = new Map();
  for (let leftIndex = 0; leftIndex < BUILD_IDS.length; leftIndex++) for (let rightIndex = leftIndex + 1; rightIndex < BUILD_IDS.length; rightIndex++) {
    const leftBuildId = BUILD_IDS[leftIndex]; const rightBuildId = BUILD_IDS[rightIndex];
    pairs.set(`overall:${leftBuildId}:${rightBuildId}`, createPairAggregate({ leftBuildId, rightBuildId }));
  }
  return pairs;
}

function addBuildPairs(buildPairs, meta, samplesByBuild) {
  for (let leftIndex = 0; leftIndex < BUILD_IDS.length; leftIndex++) for (let rightIndex = leftIndex + 1; rightIndex < BUILD_IDS.length; rightIndex++) {
    const leftBuildId = BUILD_IDS[leftIndex]; const rightBuildId = BUILD_IDS[rightIndex];
    pairKeys(meta).forEach(([baseKey, dimensions]) => {
      const key = `${baseKey}:${leftBuildId}:${rightBuildId}`;
      const pair = buildPairs.get(key) || createPairAggregate({ ...dimensions, leftBuildId, rightBuildId });
      buildPairs.set(key, pair);
      addPair(pair, samplesByBuild[leftBuildId], samplesByBuild[rightBuildId]);
    });
  }
}

function buildSensitivity(views, buildPairs) {
  const pairwiseOverall = [];
  for (let leftIndex = 0; leftIndex < BUILD_IDS.length; leftIndex++) for (let rightIndex = leftIndex + 1; rightIndex < BUILD_IDS.length; rightIndex++) {
    const leftBuildId = BUILD_IDS[leftIndex]; const rightBuildId = BUILD_IDS[rightIndex];
    const left = views.get(`build:${leftBuildId}`); const right = views.get(`build:${rightBuildId}`); const leftFinal = left ? finalizeAggregate(left) : null; const rightFinal = right ? finalizeAggregate(right) : null; const pair = buildPairs.get(`overall:${leftBuildId}:${rightBuildId}`);
    pairwiseOverall.push({ leftBuildId, rightBuildId, paired: pair ? finalizePair(pair) : null, aggregateDifference: { clearRate: leftFinal && rightFinal ? leftFinal.clearRate - rightFinal.clearRate : null, hpPreservation: leftFinal && rightFinal ? leftFinal.metrics.postCombatHpRatio.mean - rightFinal.metrics.postCombatHpRatio.mean : null, mpPreservation: leftFinal && rightFinal ? leftFinal.metrics.postCombatMpRatio.mean - rightFinal.metrics.postCombatMpRatio.mean : null } });
  }
  const familyPairsByBuildPair = new Map();
  [...buildPairs.entries()].filter(([key]) => key.startsWith("family:")).forEach(([key, pair]) => {
    const parts = key.split(":");
    const family = parts[1];
    const buildPair = parts.slice(2).join(":");
    const entries = familyPairsByBuildPair.get(buildPair) || new Map();
    entries.set(family, pair); familyPairsByBuildPair.set(buildPair, entries);
  });
  const strictSignificantReversals = [];
  familyPairsByBuildPair.forEach((families, buildPair) => {
    const entries = [...families.entries()];
    for (let first = 0; first < entries.length; first++) for (let second = first + 1; second < entries.length; second++) {
      const [leftFamily, leftPair] = entries[first]; const [rightFamily, rightPair] = entries[second]; const left = finalizePair(leftPair); const right = finalizePair(rightPair);
      if (left.clearRateDifference.significant && right.clearRateDifference.significant && Math.sign(left.clearRateDifference.estimate) !== Math.sign(right.clearRateDifference.estimate)) strictSignificantReversals.push({ buildPair, leftFamily, rightFamily, left, right });
    }
  });
  const cellKeys = new Set([...views.keys()].filter(key => key.startsWith("cell:")).map(key => key.split(":").slice(0, 3).join(":")));
  const bestCounts = Object.fromEntries(BUILD_IDS.map(buildId => [buildId, 0]));
  cellKeys.forEach(cellKey => {
    const candidates = BUILD_IDS.map(buildId => views.get(`${cellKey}:${buildId}`)).filter(Boolean);
    if (candidates.length === 0) return;
    const best = Math.max(...candidates.map(candidate => candidate.outcomes.clear / candidate.runs));
    candidates.filter(candidate => candidate.outcomes.clear / candidate.runs === best).forEach(candidate => increment(bestCounts, candidate.dimensions.buildId));
  });
  const bestCellCount = Object.values(bestCounts).reduce((sum, count) => sum + count, 0);
  return { pairwiseOverall, strictSignificantReversals, buildDominance: { bestCounts, bestCellCount, dominantBuild: bestCellCount ? Object.entries(bestCounts).sort(([, left], [, right]) => right - left)[0][0] : null, dominantShare: bestCellCount ? Math.max(...Object.values(bestCounts)) / bestCellCount : null } };
}

function runConditionSet({ seed, depth, index, encounterId, monsters, viewsByCondition, pairsByCondition, buildPairViews }) {
  const combatSeed = `issue987:combat:${seed}:B${depth}:${index}:${encounterId}`;
  const samplesByBuild = {};
  for (const buildId of BUILD_IDS) {
      const meta = { ...getMeta(monsters, depth, buildId, encounterId), encounterId };
    samplesByBuild[buildId] = {};
    for (const condition of COUNTERFACTUALS) {
      const sample = runEncounterSample({ buildId, encounterId, depth, seed: combatSeed, counterfactual: condition.kind === "baseline" ? null : condition, generatedMonsters: monsters });
      const metrics = extractRunMetrics({ ...sample, buildId });
      addToViews(viewsByCondition.get(condition.id), meta, sample, metrics);
      if (condition.kind === "baseline") { samplesByBuild[buildId].baseline = sample; addToViews(buildPairViews, meta, sample, metrics); }
      else { samplesByBuild[buildId][condition.id] = sample; addToPairs(pairsByCondition.get(condition.id), meta, samplesByBuild[buildId].baseline, sample); }
    }
  }
  addBuildPairs(buildPairViews.buildPairs, { depth, family: encounterFamily(monsters) }, Object.fromEntries(BUILD_IDS.map(buildId => [buildId, samplesByBuild[buildId].baseline])));
}

function makeConditionViews() { return new Map(COUNTERFACTUALS.map(condition => [condition.id, new Map()])); }

function runProductionFrequency({ seed, generatedRuns }) {
  const distributions = TARGET_DEPTHS.map(depth => createDistribution(depth, generatedRuns)); const viewsByCondition = makeConditionViews();
  const pairsByCondition = new Map(COUNTERFACTUALS.slice(1).map(condition => [condition.id, new Map()])); const buildPairViews = new Map(); buildPairViews.buildPairs = buildPairMap();
  for (const depth of TARGET_DEPTHS) {
    const distribution = distributions.find(item => item.depth === depth);
    for (let index = 0; index < generatedRuns; index++) {
      const generated = generateEncounter({ floor: depth }, false, false, false, null, createRng(`issue987:generate:${seed}:B${depth}:${index}`));
      observeGeneratedEncounter(distribution, generated.monsters);
      runConditionSet({ seed, depth, index, encounterId: `generated-${index}`, monsters: generated.monsters, viewsByCondition, pairsByCondition, buildPairViews });
    }
  }
  return { samplePolicy: { generatedRunsPerDepth: generatedRuns, generationSeed: "issue987:generate:<root>:B<depth>:<index>", sameEncounterForBuilds: true }, distributions: distributions.map(finalizeDistribution), conditions: COUNTERFACTUALS.map(condition => ({ ...condition, views: summarizeViews(viewsByCondition.get(condition.id)), pairedAgainstBaseline: condition.kind === "baseline" ? null : summarizePairs(pairsByCondition.get(condition.id)), buildSensitivity: condition.kind === "baseline" ? buildSensitivity(viewsByCondition.get(condition.id), buildPairViews.buildPairs) : null })) };
}

function runControlledStress({ seed, stressRuns }) {
  const viewsByCondition = makeConditionViews(); const pairsByCondition = new Map(COUNTERFACTUALS.slice(1).map(condition => [condition.id, new Map()])); const buildPairViews = new Map(); buildPairViews.buildPairs = buildPairMap();
  const fixtures = ["swarm-action-pressure", "magic-denial", "mp-pressure", "durable-single-target", "protected-formation", "attrition-recovery-denial"]; const fixtureCatalog = [];
  for (const depth of TARGET_DEPTHS) for (const encounterId of fixtures) {
    const fixture = createEncounterFixture(encounterId, depth); fixtureCatalog.push({ depth, encounterId, enemyCount: fixture.monsters.length, family: encounterFamily(fixture.monsters), monsterNames: fixture.monsters.map(monster => baseMonsterName(monster.name)) });
    for (let index = 0; index < stressRuns; index++) runConditionSet({ seed: `stress:${seed}`, depth, index, encounterId, monsters: fixture.monsters, viewsByCondition, pairsByCondition, buildPairViews });
  }
  return { samplePolicy: { stressRunsPerFixtureDepth: stressRuns, fixtureWeighting: "equal named fixture cells; controlled stress only" }, fixtures: fixtureCatalog, conditions: COUNTERFACTUALS.map(condition => ({ ...condition, views: summarizeViews(viewsByCondition.get(condition.id)), pairedAgainstBaseline: condition.kind === "baseline" ? null : summarizePairs(pairsByCondition.get(condition.id)), buildSensitivity: condition.kind === "baseline" ? buildSensitivity(viewsByCondition.get(condition.id), buildPairViews.buildPairs) : null })) };
}

function measurementMetadata({ seed, generatedRuns, stressRuns, provenance, environmentSignature }) {
  return {
    issue: 987, runnerVersion: RUNNER_VERSION, schemaVersion: SCHEMA_VERSION, sourceCommit: provenance?.sourceCommit || null, gameplaySourceCommit: provenance?.gameplaySourceCommit || null, measurementRunnerCommit: provenance?.measurementRunnerCommit || null, measurementRunnerDiffSha256: provenance?.measurementRunnerDiffSha256 || null, originMainAncestor: provenance?.originMainAncestor ?? null, staleTreeAllowed: provenance?.staleTreeAllowed ?? null, workingTreeClean: provenance?.workingTreeClean ?? null, productionBaselineSha: provenance?.baseCommit || null, environmentSignature,
    configuration: { seed, generatedRunsPerDepth: generatedRuns, controlledStressRunsPerFixtureDepth: stressRuns, depths: [...TARGET_DEPTHS], builds: [...BUILD_IDS], counterfactuals: COUNTERFACTUALS.map(condition => condition.id) },
    seedPolicy: { generation: "issue987:generate:<root>:B<depth>:<index>", combat: "issue987:combat:<root>:B<depth>:<index>:<encounterId>", pairedBuilds: "same generated monster array and combat seed", pairedCounterfactuals: "same generated monster array and combat seed" },
    modeled: ["production generateEncounter", "production monster identity/role/trait data", "depth scaling in generateEncounter", "#983 exclusive death classification", "production auto action, spell, status, mitigation, and round resolution", "W1/W2/W3 measurement-only hooks"],
    omitted: ["full run map traversal", "actual player-selected encounter frequency", "manual input/UI timing", "between-encounter progression, consumables, retreat, loot/economy", "production balance tuning"],
    limits: ["generateEncounter output frequency is not observed full-run encounter frequency: traversal, event selection, bosses, midbosses, roaming elites, retreat, and run survival reweight encounters", "controlled fixture cells are equal-weight stress probes, not production estimates", "W3 preserves generated composition/traits/identity but suppresses lower-priority monster turns after speed ordering and is intentionally artificial"]
  };
}

function summarizeViews(views) { return [...views.values()].map(finalizeAggregate).sort((left, right) => JSON.stringify(left.dimensions).localeCompare(JSON.stringify(right.dimensions))); }
function summarizePairs(pairs) { return [...pairs.values()].map(finalizePair); }
function conditionById(report, id) { return report.conditions.find(condition => condition.id === id); }
function format(value) { return value === null || value === undefined ? "n/a" : Number(value).toFixed(4); }
function getMeta(monsters, depth, buildId, encounterId) { return { depth, buildId, encounterId, enemyCount: monsters.length, family: encounterFamily(monsters) }; }

function renderAggregateTable(views, title) {
  const rows = views.map(view => `| ${view.dimensions.buildId || view.dimensions.depth || view.dimensions.enemyCount || view.dimensions.family || "overall"} | ${view.runs} | ${(view.pureRawRate * 100).toFixed(2)}% | ${(view.clearRate * 100).toFixed(2)}% | ${format(view.metrics.normalHitDamage.mean)} | ${format(view.metrics.rounds.mean)} | ${format(view.metrics.totalEnemyActionsPerRound.mean)} | ${format(view.metrics.postCombatHpRatio.mean)} | ${format(view.metrics.postCombatMpRatio.mean)} |`);
  return [`### ${title}`, "", "| Slice | Runs | Pure raw | Clear | Normal hit mean | Rounds | Enemy actions/round | Post HP | Post MP |", "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |", ...rows, ""].join("\n");
}

function renderCounterfactuals(conditionSet) {
  const baseline = conditionById(conditionSet, "baseline");
  return conditionSet.filter(condition => condition.id !== "baseline").map(condition => {
    const baselineOverall = baseline.views.find(view => Object.keys(view.dimensions).length === 0); const candidateOverall = condition.views.find(view => Object.keys(view.dimensions).length === 0); const paired = condition.pairedAgainstBaseline.find(pair => Object.keys(pair.dimensions).length === 0);
    return `| ${condition.id} | ${(baselineOverall.pureRawRate * 100).toFixed(2)}% | ${(candidateOverall.pureRawRate * 100).toFixed(2)}% | ${(paired.clearRateDifference.estimate * 100).toFixed(2)}pp | ${(paired.hpPreservationDifference.estimate * 100).toFixed(2)}pp | ${(paired.mpPreservationDifference.estimate * 100).toFixed(2)}pp |`;
  }).join("\n");
}

function renderSensitivity(sensitivity) {
  return [`- strict significant reversal count: **${sensitivity.strictSignificantReversals.length}**`, `- build dominance: **${sensitivity.buildDominance.dominantBuild || "n/a"}**, best-cell share **${sensitivity.buildDominance.dominantShare === null ? "n/a" : (sensitivity.buildDominance.dominantShare * 100).toFixed(2) + "%"}**`, "", "| Build pair | Paired clear difference | HP preservation difference | MP preservation difference |", "| --- | ---: | ---: | ---: |", ...sensitivity.pairwiseOverall.map(row => `| ${row.leftBuildId} vs ${row.rightBuildId} | ${format(row.paired?.clearRateDifference.estimate)} | ${format(row.paired?.hpPreservationDifference.estimate)} | ${format(row.paired?.mpPreservationDifference.estimate)} |`)].join("\n");
}

export function runMeasurement({ seed = DEFAULT_SEED, generatedRuns = DEFAULT_GENERATED_RUNS, stressRuns = DEFAULT_STRESS_RUNS, provenance = null, environmentSignature = null } = {}) {
  if (!Number.isInteger(generatedRuns) || generatedRuns < 1) throw new Error(`generatedRuns must be a positive integer: ${generatedRuns}`); if (!Number.isInteger(stressRuns) || stressRuns < 1) throw new Error(`stressRuns must be a positive integer: ${stressRuns}`);
  const productionFrequencyWeighted = runProductionFrequency({ seed, generatedRuns }); const controlledStressFixtures = runControlledStress({ seed, stressRuns });
  return { schemaVersion: SCHEMA_VERSION, measurement: measurementMetadata({ seed, generatedRuns, stressRuns, provenance, environmentSignature }), builds: getBuildDefinitions().map(build => ({ id: build.id, label: build.label, className: "Mage", equipment: build.equipment, spells: build.spells })), productionFrequencyWeighted, controlledStressFixtures, interpretation: { exclusiveDeathClassification: "pure_raw_damage / mechanic_mediated_raw_lethal / direct_mechanic_death / unknown_or_mixed; every death is assigned exactly one category and legacy raw categories are exhaustive within raw_damage_pressure", productionWeighting: "weighted by observed production generateEncounter sample frequency at each depth; never equal-weighted controlled fixtures", controlledWeighting: "named stress fixtures are equal-weighted probes and deliberately do not estimate dungeon frequency", W1: "fixed normal physical damage rate ×0.75; measurement-only", W2: "fixed enemy HP rate ×0.75; measurement-only", W3: "fixed cap of one total enemy turn per round after speed ordering; composition, identity, traits, and normal resolution otherwise unchanged; artificial counterfactual", buildSensitivity: "paired clear-rate differences, post-combat HP/MP preservation, strict significant reversals, and build dominance are reported for weighted and controlled baseline conditions" } };
}

export function renderSummary(report) {
  const weightedBaseline = conditionById(report.productionFrequencyWeighted.conditions, "baseline");
  const weightedOverall = weightedBaseline.views.find(view => Object.keys(view.dimensions).length === 0);
  const stressBaseline = conditionById(report.controlledStressFixtures.conditions, "baseline");
  const stressOverall = stressBaseline.views.find(view => Object.keys(view.dimensions).length === 0);
  const lines = ["# Issue #987 Production-frequency weighted pure raw / Build Sensitivity", ""];
  lines.push("- runner: `" + RUNNER_VERSION + "`", "- source commit: `" + (report.measurement.sourceCommit || "in-process") + "`", "- production baseline SHA: `" + (report.measurement.productionBaselineSha || "in-process") + "`", "- generated encounters: **N=" + report.measurement.configuration.generatedRunsPerDepth + " per depth**; controlled stress: **N=" + report.measurement.configuration.controlledStressRunsPerFixtureDepth + " per fixture × depth**", "- depths: " + TARGET_DEPTHS.map(depth => "B" + depth).join(", ") + "; builds: " + BUILD_IDS.join(", "), "");
  lines.push("## Scope and validity", "", "The weighted arm samples the real production generateEncounter path at each requested depth and reuses each generated encounter, identity, trait, role, and composition for all four Mage builds and all paired counterfactuals. This is a generated-distribution estimate, not a full-run encounter-frequency estimate: traversal, event selection, bosses/midbosses/roaming encounters, survival, retreat, and progression can reweight actual play.", "", "Deaths use #983's exclusive categories. Mechanism firing alone is not promoted to mediated causality; the imported classifier requires corresponding state-degradation evidence. Every death and every legacy raw death has exactly one final category.", "", "## Production encounter distribution", "", "| Depth | Generated N | Mean enemy count | Size distribution |", "| --- | ---: | ---: | --- |");
  report.productionFrequencyWeighted.distributions.forEach(distribution => lines.push("| B" + distribution.depth + " | " + distribution.runs + " | " + format(distribution.averageEnemyCount) + " | " + Object.entries(distribution.sizeCounts).map(([size, data]) => size + ":" + (data.rate * 100).toFixed(2) + "%").join(", ") + " |"));
  lines.push("", "## A. Production-frequency weighted", "", "Overall: **" + weightedOverall.pureRawDeaths + " / " + weightedOverall.runs + " = " + (weightedOverall.pureRawRate * 100).toFixed(2) + "% pure raw**, clear " + (weightedOverall.clearRate * 100).toFixed(2) + "%, death " + (weightedOverall.deathRate * 100).toFixed(2) + "%. Normal hit mean/p50/p90/p95: **" + format(weightedOverall.metrics.normalHitDamage.mean) + " / " + format(weightedOverall.metrics.normalHitDamage.p50) + " / " + format(weightedOverall.metrics.normalHitDamage.p90) + " / " + format(weightedOverall.metrics.normalHitDamage.p95) + "**; lethal hit/maxHP mean: **" + format(weightedOverall.metrics.lethalHitOverMaxHp.mean) + "**.", "", renderAggregateTable(weightedBaseline.views.filter(view => view.dimensions.buildId), "Build"), renderAggregateTable(weightedBaseline.views.filter(view => view.dimensions.depth), "Depth"), renderAggregateTable(weightedBaseline.views.filter(view => view.dimensions.enemyCount), "Enemy count"), renderAggregateTable(weightedBaseline.views.filter(view => view.dimensions.family), "Encounter family"), "### Weighted paired counterfactuals", "", "| Condition | Baseline pure raw | Candidate pure raw | Paired clear-rate delta | HP preservation delta | MP preservation delta |", "| --- | ---: | ---: | ---: | ---: | ---: |", renderCounterfactuals(report.productionFrequencyWeighted.conditions), "", "### Weighted Build Sensitivity", "", renderSensitivity(weightedBaseline.buildSensitivity), "", "## B. Controlled stress fixtures", "", "Equal-weight stress overall: **" + stressOverall.pureRawDeaths + " / " + stressOverall.runs + " = " + (stressOverall.pureRawRate * 100).toFixed(2) + "% pure raw**, clear " + (stressOverall.clearRate * 100).toFixed(2) + "%. This arm is not a production estimate; it retains the six hand-picked #980/#984 probes as stress tests.", "", renderAggregateTable(stressBaseline.views.filter(view => view.dimensions.buildId), "Controlled build"), renderAggregateTable(stressBaseline.views.filter(view => view.dimensions.depth), "Controlled depth"), renderAggregateTable(stressBaseline.views.filter(view => view.dimensions.enemyCount), "Controlled enemy count"), renderAggregateTable(stressBaseline.views.filter(view => view.dimensions.family), "Controlled encounter family"), "### Controlled paired counterfactuals", "", "| Condition | Baseline pure raw | Candidate pure raw | Paired clear-rate delta | HP preservation delta | MP preservation delta |", "| --- | ---: | ---: | ---: | ---: | ---: |", renderCounterfactuals(report.controlledStressFixtures.conditions), "", "### Controlled Build Sensitivity", "", renderSensitivity(stressBaseline.buildSensitivity), "", "## Interpretation and required decisions", "", "1. W1/W2/W3 are fixed causal probes, not production proposals; W3 limits total enemy turns after speed ordering and answers exposure sensitivity, not a natural gameplay replacement.", "2. Build Confidence is evaluated from weighted pairwise clear-rate differences, HP/MP preservation, strict significant family reversals, and dominance share. A reversal is strict only when paired 95% CI excludes zero in both family slices and signs differ.", "3. No production balance lever is recommended from this measurement alone. If a later tuning Issue is opened, the first candidate must come from this evidence rather than controlled-fixture averages.", "", "## Reproduction", "", "```sh", "node scratch/measurements/issue987_production_frequency.js --runs 5000 --stress-runs 500 --seed 987-production-frequency --output evidence/results/issue-987-production-frequency.json --summary evidence/results/issue-987-production-frequency.md", "```", "");
  return lines.join("\n");
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (["--output", "--summary", "--seed", "--runs", "--stress-runs"].includes(value)) { const next = argv[++index]; if (!next) throw new Error(`${value} requires a value`); options[value.slice(2)] = ["--runs", "--stress-runs"].includes(value) ? Number(next) : next; }
    else if (value === "--help") { console.log("Usage: node scratch/measurements/issue987_production_frequency.js --runs 5000 --stress-runs 500 --seed 987-production-frequency --output evidence/results/issue-987-production-frequency.json --summary evidence/results/issue-987-production-frequency.md"); process.exit(0); }
    else throw new Error(`unknown option: ${value}`);
  }
  if (!options.output || !options.summary) throw new Error("--output and --summary are required"); return options;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv); const generatedRuns = options.runs ?? DEFAULT_GENERATED_RUNS; const stressRuns = options["stress-runs"] ?? DEFAULT_STRESS_RUNS;
  const provenance = requireRunnerProvenance({ fetchOriginMain: false, measurementRunnerPaths: ["scratch/measurements/issue987_production_frequency.js", "scratch/measurements/issue973_build_sensitivity.js", "src/combat_logic/round.js", "scratch/measurements/measurement_provenance.js", "scratch/measurements/measurement_env_signature.js"] });
  const environmentSignature = printEnvSignatureBanner({ runnerVersion: RUNNER_VERSION, seed: options.seed || DEFAULT_SEED, runs: generatedRuns, stressRuns, depths: TARGET_DEPTHS, builds: BUILD_IDS, counterfactuals: COUNTERFACTUALS.map(condition => condition.id) }, { label: "issue987 production frequency env" });
  const report = runMeasurement({ seed: options.seed || DEFAULT_SEED, generatedRuns, stressRuns, provenance, environmentSignature }); const outputPath = resolve(options.output); const summaryPath = resolve(options.summary);
  fs.mkdirSync(dirname(outputPath), { recursive: true }); fs.mkdirSync(dirname(summaryPath), { recursive: true }); fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`); fs.writeFileSync(summaryPath, renderSummary(report));
  console.log(`Wrote Issue #987 JSON evidence: ${outputPath}`); console.log(`Wrote Issue #987 Markdown evidence: ${summaryPath}`); return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
