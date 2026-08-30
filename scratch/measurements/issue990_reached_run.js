// sim-scope: run — production-backed full-run Mage progression measurement
/* global console, process */

import fs from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createRng } from "../../src/seed_rng.js";
import { generateRunFloor } from "../../src/run_map_generator.js";
import { generateEncounter } from "../../src/combat_ui/encounter.js";
import { calculateEncounterChance } from "../../src/movement.js";
import { getCharMaxHp, getCharMaxMp } from "../../src/rules/character_stats.js";
import {
  BUILD_IDS,
  createBuildCharacter,
  runEncounterSample,
  calculateDiagnosticUtility,
  bootstrapMeanCi,
  isSignificantReversal
} from "./issue973_build_sensitivity.js";
import { requireRunnerProvenance } from "./measurement_provenance.js";
import { printEnvSignatureBanner } from "./measurement_env_signature.js";

export const RUNNER_VERSION = "issue990-reached-run-v1";
export const DEFAULT_SEED = "990-reached-run";
export const DEFAULT_RUNS = 500;
export const MAX_DEPTH = 30;
export const REACHED_RUN_TARGET_DEPTHS = Object.freeze([5, 10, 15, 20, 21, 25, 30]);
export const MIN_STRICT_PAIRED_N = 30;
export const SCHEMA_VERSION = 1;

const EXCLUSIVE_CATEGORIES = Object.freeze([
  "pure_raw_damage",
  "mechanic_mediated_raw_lethal",
  "direct_mechanic_death",
  "unknown_or_mixed"
]);
const DEPTH_BANDS = Object.freeze([
  [1, 5, "B1-B5"], [6, 10, "B6-B10"], [11, 15, "B11-B15"],
  [16, 20, "B16-B20"], [21, 25, "B21-B25"], [26, 30, "B26-B30"]
]);
const DIRECTIONS = Object.freeze([
  { dx: 0, dy: -1, dir: 0 }, { dx: 1, dy: 0, dir: 1 },
  { dx: 0, dy: 1, dir: 2 }, { dx: -1, dy: 0, dir: 3 }
]);

function baseMonsterName(name) { return String(name).replace(/ [A-Z]$/, ""); }
function keyOf({ x, y }) { return `${x},${y}`; }
function increment(map, key, amount = 1) { map[key] = (map[key] || 0) + amount; }

function describe(values) {
  if (values.length === 0) return { count: 0, mean: null, p50: null, p90: null, p95: null, min: null, max: null };
  const sorted = [...values].sort((a, b) => a - b);
  const quantile = probability => {
    const index = (sorted.length - 1) * probability;
    const lower = Math.floor(index); const upper = Math.ceil(index);
    return lower === upper ? sorted[lower] : sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
  };
  return {
    count: values.length,
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
    p50: quantile(0.5), p90: quantile(0.9), p95: quantile(0.95),
    min: sorted[0], max: sorted.at(-1)
  };
}

function wilson(successes, trials) {
  if (trials <= 0) return null;
  const z = 1.96; const rate = successes / trials;
  const denominator = 1 + (z * z) / trials;
  const center = (rate + (z * z) / (2 * trials)) / denominator;
  const margin = z * Math.sqrt((rate * (1 - rate) + (z * z) / (4 * trials)) / trials) / denominator;
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

function family(monsters) {
  const traits = new Set(monsters.flatMap(monster => monster.traits || []));
  const groups = [
    ["reflection_counter", ["reflectMagic", "reflectPhysical", "counterSpell"]],
    ["magic_denial", ["silence"]], ["mp_drain", ["drainMp"]],
    ["recovery_denial", ["antiHeal"]], ["regen", ["regen"]],
    ["protected_formation", ["guardAdjacent", "buffPhysicalDef", "buffMagicDef"]],
    ["summon_split", ["summonAlly", "splitOnDeath"]],
    ["multi_action", ["multiAction"]], ["status_pressure", ["chargeAttack", "selfDestruct"]]
  ];
  const matched = groups.filter(([, names]) => names.some(name => traits.has(name))).map(([name]) => name);
  return matched.length > 0 ? matched.join("+") : monsters.length > 1
    ? "multi_enemy_ordinary" : `single_${monsters[0]?.role || "unknown"}`;
}

function findCell(grid, predicate) {
  for (let y = 0; y < grid.length; y++) for (let x = 0; x < grid[y].length; x++) {
    if (predicate(grid[y][x])) return { x, y };
  }
  return null;
}

function canTraverse(grid, current, direction) {
  const cell = grid[current.y]?.[current.x];
  const next = grid[current.y + direction.dy]?.[current.x + direction.dx];
  if (!cell || !next || (cell.walls[direction.dir] && !cell.secretDoor?.[direction.dir])) return false;
  // Production milestone placement validates reachability with revealGimmicks;
  // the measurement route uses that same revealed graph for mandatory bosses.
  return (!cell.walls[direction.dir] || cell.secretDoor?.[direction.dir]) &&
    !next.blockEnter?.[(direction.dir + 2) % 4];
}

function shortestPath(grid, start, target) {
  if (!start || !target) return null;
  const targetKey = keyOf(target); const queue = [{ ...start }];
  const previous = new Map([[keyOf(start), null]]);
  for (const current of queue) {
    if (keyOf(current) === targetKey) break;
    DIRECTIONS.forEach(direction => {
      if (!canTraverse(grid, current, direction)) return;
      const next = { x: current.x + direction.dx, y: current.y + direction.dy };
      const nextKey = keyOf(next);
      if (previous.has(nextKey)) return;
      previous.set(nextKey, keyOf(current)); queue.push(next);
    });
  }
  if (!previous.has(targetKey)) return null;
  const path = []; let cursor = targetKey;
  while (cursor) {
    const [x, y] = cursor.split(",").map(Number); path.push({ x, y }); cursor = previous.get(cursor);
  }
  return path.reverse();
}

function makeRoute(generated, floor) {
  const start = findCell(generated.grid, cell => cell.type === "stairs-up");
  const stairs = findCell(generated.grid, cell => cell.type === "stairs-down");
  const boss = findCell(generated.grid, cell => cell.event === "boss" && cell.milestoneFloor === floor);
  const first = boss ? shortestPath(generated.grid, start, boss) : shortestPath(generated.grid, start, stairs);
  const second = boss ? shortestPath(generated.grid, boss, stairs) : null;
  if (!first || (boss && !second)) throw new Error(`no production route for B${floor}`);
  return boss ? [...first, ...second.slice(1)] : first;
}

function depthBand(depth) {
  return DEPTH_BANDS.find(([low, high]) => depth >= low && depth <= high)?.[2] || `B${depth}`;
}

function createMetricBucket() {
  return {
    encounters: 0, outcomes: { clear: 0, death: 0, timeout: 0 },
    categories: Object.fromEntries(EXCLUSIVE_CATEGORIES.map(category => [category, 0])),
    normalHitDamage: [], normalHits: [], totalNormalDamage: [],
    rounds: [], enemyActions: [], actionsPerRound: [],
    hpBefore: [], mpBefore: [], hpAfter: [], mpAfter: [], lethalHitOverMaxHp: []
  };
}

function addEventToBucket(bucket, event) {
  bucket.encounters++;
  bucket.outcomes[event.outcome] = (bucket.outcomes[event.outcome] || 0) + 1;
  if (event.deathCategory) bucket.categories[event.deathCategory]++;
  if (event.normalHits > 0) bucket.normalHitDamage.push(event.totalNormalDamage / event.normalHits);
  bucket.normalHits.push(event.normalHits); bucket.totalNormalDamage.push(event.totalNormalDamage);
  bucket.rounds.push(event.rounds); bucket.enemyActions.push(event.enemyActions);
  bucket.actionsPerRound.push(event.enemyActions / Math.max(1, event.rounds));
  bucket.hpBefore.push(event.hpBeforeRatio); bucket.mpBefore.push(event.mpBeforeRatio);
  bucket.hpAfter.push(event.hpAfterRatio); bucket.mpAfter.push(event.mpAfterRatio);
  if (event.lethalHitOverMaxHp !== null) bucket.lethalHitOverMaxHp.push(event.lethalHitOverMaxHp);
}

function finalizeBucket(bucket) {
  const rate = count => bucket.encounters > 0 ? count / bucket.encounters : null;
  return {
    encounters: bucket.encounters, outcomes: bucket.outcomes,
    clearRate: rate(bucket.outcomes.clear), deathRate: rate(bucket.outcomes.death),
    pureRawRate: rate(bucket.categories.pure_raw_damage),
    categoryRates: Object.fromEntries(EXCLUSIVE_CATEGORIES.map(category => [category, rate(bucket.categories[category])])),
    metrics: {
      damagePerNormalHit: describe(bucket.normalHitDamage), normalHitsReceived: describe(bucket.normalHits),
      totalNormalDamage: describe(bucket.totalNormalDamage), rounds: describe(bucket.rounds),
      enemyActions: describe(bucket.enemyActions), actionsPerRound: describe(bucket.actionsPerRound),
      hpBefore: describe(bucket.hpBefore), mpBefore: describe(bucket.mpBefore),
      hpAfter: describe(bucket.hpAfter), mpAfter: describe(bucket.mpAfter),
      lethalHitOverMaxHp: describe(bucket.lethalHitOverMaxHp)
    }
  };
}

function addSlice(slices, key, event) {
  let bucket = slices.get(key);
  if (!bucket) { bucket = createMetricBucket(); slices.set(key, bucket); }
  addEventToBucket(bucket, event);
}

function eventMetrics(sample, characterBefore, characterAfter, monsters, context) {
  const normalEvents = sample.causalDamageEvents.filter(event => event.attackType === "physical" && event.causalType === "normal" && event.finalDamage > 0);
  const totalNormalDamage = normalEvents.reduce((sum, event) => sum + event.finalDamage, 0);
  const enemyActions = sample.trace.reduce((sum, round) => sum + (round.enemyTurnEvents?.length ?? round.enemyActions?.length ?? 0), 0);
  const maxHpBefore = getCharMaxHp(characterBefore); const maxMpBefore = getCharMaxMp(characterBefore);
  const maxHpAfter = getCharMaxHp(characterAfter); const maxMpAfter = getCharMaxMp(characterAfter);
  const lethal = sample.causalDamageEvents.filter(event => event.lethal).at(-1);
  return {
    ...context, outcome: sample.outcome,
    deathCategory: sample.outcome === "death" && EXCLUSIVE_CATEGORIES.includes(sample.failure?.finalExclusiveCategory)
      ? sample.failure.finalExclusiveCategory : sample.outcome === "death" ? "unknown_or_mixed" : null,
    directCause: sample.failure?.directCause || null,
    deathCause: sample.failure?.contributingCause || null,
    enemyNames: monsters.map(monster => baseMonsterName(monster.name)), family: family(monsters), enemyCount: monsters.length,
    hpBefore: characterBefore.hp, mpBefore: characterBefore.mp, hpAfter: characterAfter.hp, mpAfter: characterAfter.mp,
    maxHp: maxHpBefore, maxMp: maxMpBefore,
    hpBeforeRatio: characterBefore.hp / Math.max(1, maxHpBefore), mpBeforeRatio: maxMpBefore ? characterBefore.mp / maxMpBefore : 1,
    hpAfterRatio: characterAfter.hp / Math.max(1, maxHpAfter), mpAfterRatio: maxMpAfter ? characterAfter.mp / maxMpAfter : 1,
    rounds: sample.rounds, normalHits: normalEvents.length, totalNormalDamage,
    enemyActions, actionsPerRound: enemyActions / Math.max(1, sample.rounds),
    lethalHitOverMaxHp: lethal?.attackType === "physical" && lethal.finalDamage > 0 ? lethal.finalDamage / Math.max(1, maxHpBefore) : null,
    utility: calculateDiagnosticUtility(sample)
  };
}

function applyTransitionRecovery(character) {
  const maxHp = getCharMaxHp(character); const maxMp = getCharMaxMp(character);
  const hp = Math.min(maxHp - character.hp, Math.max(1, Math.floor(maxHp * 0.15)));
  character.hp += Math.max(0, hp);
  return { hp: Math.max(0, hp), mp: 0, kind: "floor_transition_15pct_hp" };
}

function applyCampRecovery(character, floor) {
  if (floor <= 1 || floor % 5 !== 1) return null;
  const maxHp = getCharMaxHp(character); const maxMp = getCharMaxMp(character);
  const hp = Math.min(maxHp - character.hp, Math.ceil((maxHp - character.hp) * 0.4));
  const mp = Math.min(maxMp - character.mp, Math.ceil((maxMp - character.mp) * 0.4));
  character.hp += Math.max(0, hp); character.mp += Math.max(0, mp);
  return { hp: Math.max(0, hp), mp: Math.max(0, mp), kind: "camp_40pct_missing" };
}

function makeFloorPlans(runSeed) {
  const floors = []; let parentStairsCoord = null;
  for (let floor = 1; floor <= MAX_DEPTH; floor++) {
    const generated = generateRunFloor({ runSeed, floor, parentStairsCoord });
    const stairs = findCell(generated.grid, cell => cell.type === "stairs-down");
    floors.push({ floor, generated, route: makeRoute(generated, floor), parentStairsCoord });
    parentStairsCoord = stairs;
  }
  return floors;
}

function runBuild({ rootSeed, runIndex, buildId, floorPlans }) {
  const runSeed = `${rootSeed}:run:${runIndex}`;
  let character = createBuildCharacter(buildId); let reachedDepth = 0; let deathDepth = null;
  const events = []; const recovery = []; const triggerRng = createRng(`${runSeed}:encounter-triggers`);
  let outcome = "reached_max_depth";

  for (const plan of floorPlans) {
    const { floor, generated, route } = plan;
    reachedDepth = floor;
    if (floor > 1) recovery.push({ floor, ...applyTransitionRecovery(character) });
    const camp = applyCampRecovery(character, floor);
    if (camp) recovery.push({ floor, ...camp });
    let step = 0;
    for (let routeIndex = 1; routeIndex < route.length; routeIndex++) {
      step++;
      const cell = generated.grid[route[routeIndex].y]?.[route[routeIndex].x];
      if (!cell || cell.type === "stairs-down") continue;
      const isBoss = cell.event === "boss" && cell.milestoneFloor === floor;
      const isMidboss = cell.event === "midboss";
      const isSpecial = Boolean(cell.event);
      const triggered = isBoss || isMidboss || (!isSpecial && triggerRng() < calculateEncounterChance(step, {}));
      if (!triggered) continue;
      const eventIndex = events.length;
      const eventKey = `${runSeed}:B${floor}:step${step}:event${eventIndex}`;
      const encounterRng = createRng(`${eventKey}:generation`);
      const generatedEncounter = generateEncounter({ floor }, isBoss, isMidboss, false, null, encounterRng);
      const before = structuredClone(character);
      const sample = runEncounterSample({
        buildId, encounterId: eventKey, depth: floor,
        seed: `${eventKey}:combat`, generatedMonsters: generatedEncounter.monsters,
        initialCharacter: character, isBoss, isMidboss
      });
      const after = sample.postCombatCharacter;
      const event = eventMetrics(sample, before, after, generatedEncounter.monsters, {
        runIndex, runSeed, eventKey, floor, step, routeIndex,
        encounterType: isBoss ? "boss" : isMidboss ? "midboss" : "normal",
        generatedIsRare: Boolean(generatedEncounter.isRare)
      });
      events.push(event); character = after;
      if (sample.outcome === "death") {
        outcome = "death"; deathDepth = floor;
        break;
      }
    }
    if (outcome === "death") break;
  }
  return {
    runIndex, runSeed, buildId, started: true, reachedDepth, deathDepth, outcome,
    clearedToMaxDepth: outcome === "reached_max_depth", events, recovery,
    deathWindow: outcome === "death" ? events.slice(-3).reverse().map((event, index) => ({
      lookback: index + 1, depth: event.floor, eventKey: event.eventKey,
      normalHitsReceived: event.normalHits, damagePerNormalHit: event.normalHits ? event.totalNormalDamage / event.normalHits : null,
      totalNormalDamage: event.totalNormalDamage, hpBefore: event.hpBefore, hpAfter: event.hpAfter,
      mpBefore: event.mpBefore, mpAfter: event.mpAfter, outcome: event.outcome,
      deathCategory: event.deathCategory, lethalHitOverMaxHp: event.lethalHitOverMaxHp
    })) : []
  };
}

function emptyRunDepths() {
  return Object.fromEntries(Array.from({ length: MAX_DEPTH }, (_, index) => [String(index + 1), { reached: 0, deaths: 0 }]));
}

function finalizeRunPopulation(runs, buildId, targetDepth = null) {
  const population = targetDepth === null ? runs : runs.filter(run => run.reachedDepth >= targetDepth);
  const encounters = population.flatMap(run => run.events.filter(event => targetDepth === null || event.floor <= targetDepth));
  const byDepth = new Map(); const byFamily = new Map(); const byEnemyCount = new Map();
  encounters.forEach(event => {
    addSlice(byDepth, `B${event.floor}`, event); addSlice(byFamily, event.family, event); addSlice(byEnemyCount, String(event.enemyCount), event);
  });
  const overall = createMetricBucket(); encounters.forEach(event => addEventToBucket(overall, event));
  const deathCategories = Object.fromEntries(EXCLUSIVE_CATEGORIES.map(category => [category, 0]));
  population.forEach(run => run.events
    .filter(event => event.outcome === "death" && (targetDepth === null || event.floor <= targetDepth))
    .forEach(event => deathCategories[event.deathCategory]++));
  const reached = emptyRunDepths(); runs.forEach(run => {
    for (let depth = 1; depth <= MAX_DEPTH; depth++) if (run.reachedDepth >= depth) reached[String(depth)].reached++;
    if (run.deathDepth !== null) reached[String(run.deathDepth)].deaths++;
  });
  const populationStatus = population.length === 0 ? "unobserved" : population.length < MIN_STRICT_PAIRED_N ? "insufficient_sample" : "observed";
  const deathCount = population.filter(run => run.deathDepth !== null).length;
  return {
    buildId, startedRuns: runs.length, populationRuns: population.length, populationStatus,
    reachedDepth: targetDepth === null ? Object.fromEntries(Object.entries(reached).map(([depth, data]) => [depth, {
      ...data, reachRate: data.reached / Math.max(1, runs.length), deathRateAmongStarted: data.deaths / Math.max(1, runs.length), deathRateAmongEntrants: data.reached > 0 ? data.deaths / data.reached : null, deathRateCi95: wilson(data.deaths, data.reached)
    }])) : undefined,
    deathDepthDistribution: targetDepth === null ? Object.fromEntries(Array.from({ length: MAX_DEPTH }, (_, index) => {
      const depth = index + 1; const count = population.filter(run => run.deathDepth === depth).length;
      return [`B${depth}`, { count, rateAmongStarted: count / Math.max(1, population.length), rateAmongDeaths: deathCount > 0 ? count / deathCount : null }];
    })) : undefined,
    outcomeCounts: targetDepth === null ? Object.fromEntries(["death", "reached_max_depth"].map(outcome => [outcome, population.filter(run => run.outcome === outcome).length])) : undefined,
    encountersExperienced: finalizeBucket(overall),
    encountersPerRun: population.length > 0 ? encounters.length / population.length : null,
    deathCategories,
    slices: {
      byDepth: Object.fromEntries([...byDepth.entries()].sort().map(([key, bucket]) => [key, finalizeBucket(bucket)])),
      byFamily: Object.fromEntries([...byFamily.entries()].sort().map(([key, bucket]) => [key, finalizeBucket(bucket)])),
      byEnemyCount: Object.fromEntries([...byEnemyCount.entries()].sort().map(([key, bucket]) => [key, finalizeBucket(bucket)]))
    },
    deathWindows: targetDepth === null ? population.filter(run => run.deathDepth !== null).map(run => ({ runIndex: run.runIndex, deathDepth: run.deathDepth, events: run.deathWindow })) : undefined
  };
}

function aggregateActual(runsByBuild) {
  return Object.fromEntries(BUILD_IDS.map(buildId => {
    const runs = runsByBuild.get(buildId); const byTarget = {};
    for (const depth of REACHED_RUN_TARGET_DEPTHS) byTarget[`B${depth}`] = finalizeRunPopulation(runs, buildId, depth);
    return [buildId, { allRuns: finalizeRunPopulation(runs, buildId), reachedRunPopulations: byTarget }];
  }));
}

function pairRecords(runsByBuild) {
  const pairResults = {}; const buildPairs = [];
  for (let leftIndex = 0; leftIndex < BUILD_IDS.length; leftIndex++) for (let rightIndex = leftIndex + 1; rightIndex < BUILD_IDS.length; rightIndex++) {
    const leftBuildId = BUILD_IDS[leftIndex]; const rightBuildId = BUILD_IDS[rightIndex];
    const leftByKey = new Map(runsByBuild.get(leftBuildId).flatMap(run => run.events.map(event => [event.eventKey, event])));
    const rightByKey = new Map(runsByBuild.get(rightBuildId).flatMap(run => run.events.map(event => [event.eventKey, event])));
    const common = [...leftByKey.keys()].filter(key => rightByKey.has(key)).map(eventKey => ({ left: leftByKey.get(eventKey), right: rightByKey.get(eventKey) }));
    const families = new Map(); common.forEach(pair => { const key = pair.left.family; const list = families.get(key) || []; list.push(pair); families.set(key, list); });
    const summarize = (pairs, key) => {
      const outcome = pairs.map(pair => Number(pair.left.outcome === "clear") - Number(pair.right.outcome === "clear"));
      const hp = pairs.map(pair => pair.left.hpAfterRatio - pair.right.hpAfterRatio);
      const mp = pairs.map(pair => pair.left.mpAfterRatio - pair.right.mpAfterRatio);
      const utility = pairs.map(pair => pair.left.utility - pair.right.utility);
      return {
        family: key, pairedN: pairs.length, status: pairs.length < MIN_STRICT_PAIRED_N ? "insufficient_sample" : "eligible",
        clearDifference: bootstrapMeanCi(outcome, `issue990:${leftBuildId}:${rightBuildId}:${key}:outcome`),
        hpDifference: bootstrapMeanCi(hp, `issue990:${leftBuildId}:${rightBuildId}:${key}:hp`),
        mpDifference: bootstrapMeanCi(mp, `issue990:${leftBuildId}:${rightBuildId}:${key}:mp`),
        utilityDifference: bootstrapMeanCi(utility, `issue990:${leftBuildId}:${rightBuildId}:${key}:utility`)
      };
    };
    const all = summarize(common, "all_common_support");
    const familyRows = [...families.entries()].map(([key, pairs]) => summarize(pairs, key));
    const strict = []; const insufficient = [];
    for (let leftIndex = 0; leftIndex < familyRows.length; leftIndex++) for (let rightIndex = leftIndex + 1; rightIndex < familyRows.length; rightIndex++) {
      const left = familyRows[leftIndex]; const right = familyRows[rightIndex];
      if (left.pairedN < MIN_STRICT_PAIRED_N || right.pairedN < MIN_STRICT_PAIRED_N) insufficient.push({ leftFamily: left.family, rightFamily: right.family, leftPairedN: left.pairedN, rightPairedN: right.pairedN, status: "insufficient_sample" });
      else if (isSignificantReversal({ pairedN: left.pairedN, outcomeDifference: left.clearDifference, utilityDifference: left.utilityDifference }, { pairedN: right.pairedN, outcomeDifference: right.clearDifference, utilityDifference: right.utilityDifference })) strict.push({ left, right });
    }
    const result = { leftBuildId, rightBuildId, commonSupportPairedN: common.length, allCommonSupport: all, byFamily: familyRows, strictSignificantReversals: strict, insufficientSampleComparisons: insufficient };
    buildPairs.push(result); pairResults[`${leftBuildId}:${rightBuildId}`] = result;
  }
  return { buildPairs, strictSignificantReversalCount: buildPairs.reduce((sum, pair) => sum + pair.strictSignificantReversals.length, 0), insufficientSampleComparisons: buildPairs.reduce((sum, pair) => sum + pair.insufficientSampleComparisons.length, 0), minimumPairedN: MIN_STRICT_PAIRED_N };
}

function reachDominance(runsByBuild) {
  const votes = Object.fromEntries(BUILD_IDS.map(buildId => [buildId, 0]));
  const runs = BUILD_IDS.length ? runsByBuild.get(BUILD_IDS[0]).length : 0;
  for (let runIndex = 0; runIndex < runs; runIndex++) {
    const entries = BUILD_IDS.map(buildId => runsByBuild.get(buildId)[runIndex]);
    const best = Math.max(...entries.map(entry => entry.reachedDepth));
    const winners = entries.filter(entry => entry.reachedDepth === best);
    winners.forEach(entry => votes[entry.buildId] += 1 / winners.length);
  }
  return { metric: "highest reached depth per shared run", runs, votes, shares: Object.fromEntries(BUILD_IDS.map(buildId => [buildId, votes[buildId] / Math.max(1, runs)])) };
}

function loadReference() {
  const path = resolve("evidence/results/issue-987-production-frequency.json");
  const report = JSON.parse(fs.readFileSync(path, "utf8"));
  const select = (arm, condition = "baseline") => {
    const entry = report[arm].conditions.find(candidate => candidate.id === condition);
    const overall = entry.views.find(view => Object.keys(view.dimensions).length === 0);
    const byBuild = entry.views.filter(view => Object.keys(view.dimensions).length === 1 && view.dimensions.buildId);
    const sensitivity = entry.buildSensitivity;
    return {
      source: path, reportMeasurement: report.measurement, condition, overall, byBuild,
      buildSensitivity: {
        strictReversalSummary: sensitivity?.strictReversalSummary || null,
        insufficientSampleComparisons: sensitivity?.strictReversalSummary?.insufficientSampleComparisons ?? null,
        equalCellCoverage: sensitivity?.equalCellCoverage ? {
          dominantBuild: sensitivity.equalCellCoverage.dominantBuild,
          dominantShare: sensitivity.equalCellCoverage.dominantShare,
          totalWeight: sensitivity.equalCellCoverage.totalWeight
        } : null
      },
      bestBuildShare: sensitivity?.productionFrequencyWeightedDominance ? {
        metric: sensitivity.productionFrequencyWeightedDominance.metric,
        weighting: sensitivity.productionFrequencyWeightedDominance.weighting,
        dominantBuild: sensitivity.productionFrequencyWeightedDominance.dominantBuild,
        dominantShare: sensitivity.productionFrequencyWeightedDominance.dominantShare,
        totalWeight: sensitivity.productionFrequencyWeightedDominance.totalWeight,
        shares: sensitivity.productionFrequencyWeightedDominance.shares
      } : null
    };
  };
  return { controlledStress: select("controlledStressFixtures"), generatedFrequency: select("productionFrequencyWeighted") };
}

function measurementMetadata({ seed, runs, provenance, environmentSignature }) {
  return {
    issue: 990, runnerVersion: RUNNER_VERSION, schemaVersion: SCHEMA_VERSION,
    sourceCommit: provenance?.sourceCommit || null, gameplaySourceCommit: provenance?.gameplaySourceCommit || null,
    measurementRunnerCommit: provenance?.measurementRunnerCommit || null, measurementRunnerDiffSha256: provenance?.measurementRunnerDiffSha256 || null,
    productionBaselineSha: provenance?.baseCommit || null, originMainAncestor: provenance?.originMainAncestor ?? null,
    workingTreeClean: provenance?.workingTreeClean ?? null, environmentSignature,
    configuration: { seed, startedRunsPerBuild: runs, maxDepth: MAX_DEPTH, reachedRunTargetDepths: [...REACHED_RUN_TARGET_DEPTHS], builds: [...BUILD_IDS], minStrictPairedN: MIN_STRICT_PAIRED_N },
    seedPolicy: {
      run: "<root>:run:<index>", map: "generateRunFloor({runSeed,floor,parentStairsCoord})",
      trigger: "<runSeed>:encounter-triggers", encounter: "<runSeed>:B<floor>:step<step>:event<index>:generation",
      combat: "<runSeed>:B<floor>:step<step>:event<index>:combat", sharedAcrossBuilds: true
    },
    modeled: ["production generateRunFloor and floor progression", "production movement encounter chance", "production generateEncounter selection/generation", "production combat round resolution and auto-action", "HP/MP carry-over", "floor transition HP recovery", "camp recovery after milestone", "mandatory milestone bosses", "#983 exclusive death classification", "#975-compatible strict reversal"],
    omitted: ["loot/equipment upgrades and inventory choices", "manual inventory judgement", "retreat judgement and roaming elite AI", "trap resolution and non-combat damage", "midbosses (generateRunFloor production path has milestone bosses but no midboss cells)", "production balance tuning"],
    survivorBias: "reached-run distributions are conditional on each build reaching the target depth; started runs, reached depth, death depth, and encounters experienced are separately reported"
  };
}

function format(value, digits = 2) { return value === null || value === undefined ? "n/a" : Number(value).toFixed(digits); }
function percent(value) { return value === null || value === undefined ? "n/a" : `${(value * 100).toFixed(2)}%`; }
function renderBuildRow(buildId, result) {
  const all = result.allRuns; const b21 = result.reachedRunPopulations.B21;
  const reach30 = all.reachedDepth["30"].reachRate;
  return `| ${buildId} | ${all.startedRuns} | ${percent(reach30)} | ${all.deathDepthDistribution.B30.count} | ${all.encountersExperienced.encounters} | ${format(all.encountersExperienced.metrics.actionsPerRound.mean)} | ${percent(b21.encountersExperienced.pureRawRate)} (${b21.populationStatus}) |`;
}

function referenceMetric(view, metric, field = "mean") {
  return view?.metrics?.[metric]?.[field] ?? null;
}

function renderReferenceRow(label, view) {
  return `| ${label} | ${percent(view?.pureRawRate)} | ${format(referenceMetric(view, "normalHitDamage"))} | ${format(referenceMetric(view, "normalAttacksReceived"))} | ${format(referenceMetric(view, "totalNormalDamage"))} | ${format(referenceMetric(view, "rounds"))} | ${format(referenceMetric(view, "totalEnemyActionsPerRound"))} | ${format(referenceMetric(view, "postCombatHpRatio"))} | ${format(referenceMetric(view, "postCombatMpRatio"))} |`;
}

function renderActualOverallRow(buildId, view) {
  return `| ${buildId} | actual reached-run | ${percent(view.pureRawRate)} | ${format(view.metrics.damagePerNormalHit.mean)} | ${format(view.metrics.normalHitsReceived.mean)} | ${format(view.metrics.totalNormalDamage.mean)} | ${format(view.metrics.rounds.mean)} | ${format(view.metrics.actionsPerRound.mean)} | ${format(view.metrics.hpAfter.mean)} | ${format(view.metrics.mpAfter.mean)} |`;
}

function pureRawDeathWindowStats(result) {
  const windows = result.allRuns.deathWindows.filter(window => window.events[0]?.deathCategory === "pure_raw_damage");
  const byLookback = lookback => {
    const events = windows.map(window => window.events.find(event => event.lookback === lookback)).filter(Boolean);
    const average = key => events.length > 0 ? events.reduce((sum, event) => sum + (event[key] ?? 0), 0) / events.length : null;
    return { count: events.length, damagePerNormalHit: average("damagePerNormalHit"), lethalHitOverMaxHp: average("lethalHitOverMaxHp"), normalHits: average("normalHitsReceived"), totalNormalDamage: average("totalNormalDamage"), hpBefore: average("hpBefore") };
  };
  return { deathCount: windows.length, lookback1: byLookback(1), lookback2: byLookback(2), lookback3: byLookback(3) };
}

function compactRunRecords(runsByBuild) {
  return Object.fromEntries([...runsByBuild.entries()].map(([buildId, runs]) => [buildId, runs.map(run => ({
    runIndex: run.runIndex, runSeed: run.runSeed, reachedDepth: run.reachedDepth, deathDepth: run.deathDepth,
    outcome: run.outcome, eventCount: run.events.length, recovery: run.recovery, deathWindow: run.deathWindow
  }))]));
}

export function renderSummary(report) {
  const actual = report.actualReachedRun;
  const lines = [
    "# Issue #990 actual reached-run progression measurement", "",
    `- runner: \`${RUNNER_VERSION}\``,
    `- source commit: \`${report.measurement.sourceCommit || "in-process"}\``,
    `- production baseline SHA: \`${report.measurement.productionBaselineSha || "in-process"}\``,
    `- started runs/build: **N=${report.measurement.configuration.startedRunsPerBuild}**`, `- depth: B1-B${MAX_DEPTH}`,
    "", "## Scope and validity", "",
    "The run uses production `generateRunFloor`, production encounter chance, production `generateEncounter`, and production combat resolution. Four builds share each run seed, generated floor, route, trigger stream, and encounter identity. Only the build's survival path determines which later encounters it can experience.", "",
    "Loot/equipment decisions, manual inventory, retreats, roaming AI, traps, and midboss cells are omitted and explicitly recorded in JSON. No production constants were changed.", "",
    "## Survivor-bias split", "",
    "`startedRuns`, `reachedDepth`, `deathDepthDistribution`, and `encountersExperienced` are separate. The reached-run views below are conditional populations; a deep encounter being overrepresented there does not prove that its build is intrinsically stronger against that encounter.", "",
    "| Build | Started | Reached B30 | Deaths at B30 | Encounters experienced | Actions/round | Pure raw among B21+ reached runs |", "| --- | ---: | ---: | ---: | ---: | ---: | ---: |"
  ];
  BUILD_IDS.forEach(buildId => lines.push(renderBuildRow(buildId, actual[buildId])));
  lines.push("", "## Build reach and death depth", "", "The JSON contains B1-B30 reach/death counts and Wilson intervals. Death depth is the depth where the terminating encounter occurred; a run dying on B30 has reached B30.", "", "| Build | B5 reach | B10 reach | B15 reach | B20 reach | B21+ reach | B30 reach |", "| --- | ---: | ---: | ---: | ---: | ---: | ---: |");
  BUILD_IDS.forEach(buildId => {
    const d = actual[buildId].allRuns.reachedDepth;
    lines.push(`| ${buildId} | ${percent(d["5"].reachRate)} | ${percent(d["10"].reachRate)} | ${percent(d["15"].reachRate)} | ${percent(d["20"].reachRate)} | ${percent(d["21"].reachRate)} | ${percent(d["30"].reachRate)} |`);
  });
  lines.push("", "## Actual reached-run encounter metrics", "", "Each target-depth population includes only runs with `reachedDepth >= target`; its encounters are limited to floors through that target. This is intentionally not a global full-run frequency.", "", "| Build | Target population | Encounter N | Family/enemy-count slices | Normal hit | Normal hits | Total normal damage | HP before→after | MP before→after | Rounds | Enemy actions |", "| --- | ---: | ---: | --- | ---: | ---: | ---: | --- | ---: | ---: | ---: |");
  BUILD_IDS.forEach(buildId => [5, 10, 15, 20, 21, 25, 30].forEach(depth => {
    const view = actual[buildId].reachedRunPopulations[`B${depth}`].encountersExperienced;
    lines.push(`| ${buildId} | B${depth} reached | ${view.encounters} | see JSON | ${format(view.metrics.damagePerNormalHit.mean)} | ${format(view.metrics.normalHitsReceived.mean)} | ${format(view.metrics.totalNormalDamage.mean)} | ${format(view.metrics.hpBefore.mean)}→${format(view.metrics.hpAfter.mean)} | ${format(view.metrics.mpBefore.mean)}→${format(view.metrics.mpAfter.mean)} | ${format(view.metrics.rounds.mean)} | ${format(view.metrics.enemyActions.mean)} |`);
  }));
  lines.push("## Death windows and pure raw exposure", "Every death window stores the last one, two, and three experienced encounters and their normal-damage window; pure_raw_damage remains exclusive.", "The JSON retains family and enemy-count slices plus per-death windows. `lethalHitOverMaxHp`, normal-hit damage, normal-hit count, and total normal damage separate single-hit pressure from cumulative exposure.", `Matched common-support minimum paired N: ${report.matchedCommonSupport.minimumPairedN}.`, `Strict significant reversals: ${report.matchedCommonSupport.strictSignificantReversalCount}.`, `Insufficient comparisons: ${report.matchedCommonSupport.insufficientSampleComparisons}.`, "## Three-arm comparison", "The following metrics use each arm's own weighting. #987 arms are imported unchanged; #990 actual is weighted by encounters that the build actually experienced.", "", "| Arm / build | Weighting | Pure raw | Normal hit | Normal hits | Total normal damage | Rounds | Actions/round | Post HP | Post MP |", "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  const controlled = report.references.controlledStress.overall;
  const generated = report.references.generatedFrequency.overall;
  lines.push(`| controlled stress / overall | fixture stress | ${percent(controlled?.pureRawRate)} | ${format(referenceMetric(controlled, "normalHitDamage"))} | ${format(referenceMetric(controlled, "normalAttacksReceived"))} | ${format(referenceMetric(controlled, "totalNormalDamage"))} | ${format(referenceMetric(controlled, "rounds"))} | ${format(referenceMetric(controlled, "totalEnemyActionsPerRound"))} | ${format(referenceMetric(controlled, "postCombatHpRatio"))} | ${format(referenceMetric(controlled, "postCombatMpRatio"))} |`);
  lines.push(`| #987 generated weighted / overall | production \`generateEncounter()\` | ${percent(generated?.pureRawRate)} | ${format(referenceMetric(generated, "normalHitDamage"))} | ${format(referenceMetric(generated, "normalAttacksReceived"))} | ${format(referenceMetric(generated, "totalNormalDamage"))} | ${format(referenceMetric(generated, "rounds"))} | ${format(referenceMetric(generated, "totalEnemyActionsPerRound"))} | ${format(referenceMetric(generated, "postCombatHpRatio"))} | ${format(referenceMetric(generated, "postCombatMpRatio"))} |`);
  BUILD_IDS.forEach(buildId => {
    const actualView = actual[buildId].allRuns.encountersExperienced;
    const generatedView = report.references.generatedFrequency.byBuild.find(view => view.dimensions.buildId === buildId);
    const controlledView = report.references.controlledStress.byBuild.find(view => view.dimensions.buildId === buildId);
    lines.push(renderActualOverallRow(buildId, actualView), renderReferenceRow(`#987 generated / ${buildId}`, generatedView), renderReferenceRow(`controlled / ${buildId}`, controlledView));
  });
  lines.push("", "## Actual death categories", "", "Counts are deaths among started runs; encounter pure-raw rates above use experienced encounters as their denominator.", "", "| Build | Pure raw | Mechanic-mediated raw lethal | Direct mechanic death | Unknown/mixed |", "| --- | ---: | ---: | ---: | ---: |");
  BUILD_IDS.forEach(buildId => {
    const categories = actual[buildId].allRuns.deathCategories;
    lines.push(`| ${buildId} | ${categories.pure_raw_damage} | ${categories.mechanic_mediated_raw_lethal} | ${categories.direct_mechanic_death} | ${categories.unknown_or_mixed} |`);
  });
  lines.push("", "## Pure raw death windows", "", "Lookback 1 is the lethal encounter, lookback 2 and 3 are the immediately preceding encounters. These are conditional on pure_raw_damage deaths and are not a full-run frequency.", "", "| Build / lookback | N | Damage/normal hit | Lethal hit/maxHP | Normal hits | Total normal damage | HP before |", "| --- | ---: | ---: | ---: | ---: | ---: | ---: |");
  BUILD_IDS.forEach(buildId => {
    const stats = pureRawDeathWindowStats(actual[buildId]);
    [1, 2, 3].forEach(lookback => {
      const row = stats[`lookback${lookback}`];
      lines.push(`| ${buildId} / ${lookback} | ${row.count} | ${format(row.damagePerNormalHit)} | ${format(row.lethalHitOverMaxHp)} | ${format(row.normalHits)} | ${format(row.totalNormalDamage)} | ${format(row.hpBefore)} |`);
    });
  });
  lines.push("", "## Matched common-support comparison", "", "Only event keys shared by builds are paired. Family entries below N=30 are recorded as insufficient_sample and are excluded from strict reversal counts.", "", "| Pair | Common N | Clear difference | HP difference | MP difference | Strict reversals | Insufficient family comparisons |", "| --- | ---: | ---: | ---: | ---: | ---: | ---: |");
  report.matchedCommonSupport.buildPairs.forEach(pair => lines.push(`| ${pair.leftBuildId} vs ${pair.rightBuildId} | ${pair.commonSupportPairedN} | ${format(pair.allCommonSupport.clearDifference?.estimate, 4)} | ${format(pair.allCommonSupport.hpDifference?.estimate, 4)} | ${format(pair.allCommonSupport.mpDifference?.estimate, 4)} | ${pair.strictSignificantReversals.length} | ${pair.insufficientSampleComparisons.length} |`));
  lines.push("", "## Build Confidence and decision", "", `- #987 generated-frequency best-build share: **${report.references.generatedFrequency.bestBuildShare?.dominantBuild || "n/a"} ${percent(report.references.generatedFrequency.bestBuildShare?.dominantShare)}**; this is not actual reach dominance.`, `- actual reach dominance (highest reached depth per shared seed): ${JSON.stringify(report.buildConfidence.actualReachDominance.shares)}.`, "- matched pair results are the build-vs-build evidence; deep reached-run composition alone is not interpreted as encounter strength.", "- #975-compatible strict reversal: paired clear outcome + diagnostic utility bootstrap 95% CIs, both sign-reversed; N<30 is insufficient and excluded.", "- #973 Build Confidence: **Revise** until omitted loot/retreat decisions and non-combat deaths are either modeled or bounded by a follow-up.", "- production tuning: **Do not proceed from this measurement alone**. If a separate tuning issue follows, investigate normal physical damage/action exposure with depth/family-specific paired validation first.", "", "## Reproduction", "", "```sh", "node scratch/measurements/issue990_reached_run.js --runs 500 --seed 990-reached-run --output evidence/results/issue-990-reached-run.json --summary evidence/results/issue-990-reached-run.md", "```");
  return lines.join("\n");
}

export function runMeasurement({ seed = DEFAULT_SEED, runs = DEFAULT_RUNS, provenance = null, environmentSignature = null } = {}) {
  if (!Number.isInteger(runs) || runs < 1) throw new Error(`runs must be a positive integer: ${runs}`);
  const runsByBuild = new Map(BUILD_IDS.map(buildId => [buildId, []]));
  for (let runIndex = 0; runIndex < runs; runIndex++) {
    const runSeed = `${seed}:run:${runIndex}`; const floorPlans = makeFloorPlans(runSeed);
    BUILD_IDS.forEach(buildId => runsByBuild.get(buildId).push(runBuild({ rootSeed: seed, runIndex, buildId, floorPlans })));
  }
  const actualReachedRun = aggregateActual(runsByBuild);
  const matchedCommonSupport = pairRecords(runsByBuild);
  const references = loadReference();
  return {
    schemaVersion: SCHEMA_VERSION,
    measurement: measurementMetadata({ seed, runs, provenance, environmentSignature }),
    actualReachedRun,
    matchedCommonSupport,
    buildConfidence: { actualReachDominance: reachDominance(runsByBuild), generatedFrequencyBestBuildShare: references.generatedFrequency.bestBuildShare, interpretation: "deep reached-run distributions are survivor-conditioned" },
    references,
    runRecords: compactRunRecords(runsByBuild)
  };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (["--output", "--summary", "--seed", "--runs"].includes(arg)) {
      const value = argv[++index]; if (!value) throw new Error(`${arg} requires a value`);
      options[arg.slice(2)] = arg === "--runs" ? Number(value) : value;
    } else if (arg === "--help") { console.log("Usage: node scratch/measurements/issue990_reached_run.js --runs 500 --seed 990-reached-run --output evidence/results/issue-990-reached-run.json --summary evidence/results/issue-990-reached-run.md"); process.exit(0); }
    else throw new Error(`unknown option: ${arg}`);
  }
  if (!options.output || !options.summary) throw new Error("--output and --summary are required");
  return options;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv); const runs = options.runs ?? DEFAULT_RUNS; const seed = options.seed || DEFAULT_SEED;
  const provenance = requireRunnerProvenance({ fetchOriginMain: false, measurementRunnerPaths: ["scratch/measurements/issue990_reached_run.js", "scratch/measurements/issue973_build_sensitivity.js", "src/run_map_generator.js", "src/combat_ui/encounter.js", "src/movement.js", "src/combat_logic/round.js", "scratch/measurements/measurement_provenance.js", "scratch/measurements/measurement_env_signature.js"] });
  const environmentSignature = printEnvSignatureBanner({ runnerVersion: RUNNER_VERSION, seed, runs, depths: [1, MAX_DEPTH], builds: BUILD_IDS, counterfactuals: [] }, { label: "issue990 reached-run env" });
  const report = runMeasurement({ seed, runs, provenance, environmentSignature });
  const outputPath = resolve(options.output); const summaryPath = resolve(options.summary);
  fs.mkdirSync(dirname(outputPath), { recursive: true }); fs.mkdirSync(dirname(summaryPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`); fs.writeFileSync(summaryPath, renderSummary(report));
  console.log(`Wrote Issue #990 JSON evidence: ${outputPath}`); console.log(`Wrote Issue #990 Markdown evidence: ${summaryPath}`);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
