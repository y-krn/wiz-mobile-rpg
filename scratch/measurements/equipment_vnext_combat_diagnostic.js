// sim-scope: diagnostic — vNext combat / armor / Guard / load candidates only
/* global console, process */

import fs from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { CANONICAL_BASES } from "../../src/data/equipment_vnext.js";
import { getCombatTierForStartFloor } from "../../src/rules/combat_tier.js";
import { createRng as createSeededRng } from "../../src/seed_rng.js";
import { requireRunnerProvenance } from "./measurement_provenance.js";
import { printEnvSignatureBanner, readSimScopeDeclaration } from "./measurement_env_signature.js";

export const RUNNER_VERSION = "issue1552-equipment-vnext-combat-diagnostic-v1";
export const SCHEMA_VERSION = 3;
export const DEFAULT_RUNS = 200;
export const DEFAULT_SEED = 1544;
export const MIN_CONFIDENT_RUNS = 30;

export const WEAPON_CANDIDATES = Object.freeze({
  dagger: Object.freeze({ id: "dagger", label: "短剣", multiplier: 0.82, hitChance: 0.96, highDefPenetration: 0.02, hands: 1, load: "light", runeSlots: 0 }),
  sword: Object.freeze({ id: "sword", label: "片手剣", multiplier: 1.00, hitChance: 0.92, highDefPenetration: 0.05, hands: 1, load: "standard", runeSlots: 0 }),
  mace: Object.freeze({ id: "mace", label: "メイス", multiplier: 0.98, hitChance: 0.88, highDefPenetration: 1.50, highDefOnly: true, hands: 1, load: "standard", runeSlots: 0 }),
  greatsword: Object.freeze({ id: "greatsword", label: "大剣", multiplier: 1.32, hitChance: 0.82, highDefPenetration: 0.08, hands: 2, load: "heavy", runeSlots: 0 }),
  wand: Object.freeze({ id: "wand", label: "魔杖", multiplier: 0.68, hitChance: 0.94, highDefPenetration: 0.04, hands: 1, load: "standard", runeSlots: 1, mpCapacity: 2 }),
  staff: Object.freeze({ id: "staff", label: "大杖", multiplier: 0.58, hitChance: 0.90, highDefPenetration: 0.04, hands: 2, load: "standard", runeSlots: 2, mpCapacity: 4 })
});

export const ARMOR_CANDIDATES = Object.freeze({
  lightArmor: Object.freeze({ id: "lightArmor", label: "軽装", mitigation: 0.12, load: "light" }),
  mediumArmor: Object.freeze({ id: "mediumArmor", label: "中装", mitigation: 0.20, load: "standard" }),
  heavyArmor: Object.freeze({ id: "heavyArmor", label: "重装", mitigation: 0.30, load: "heavy" })
});

export const SHIELD_CANDIDATES = Object.freeze({
  noShield: Object.freeze({ id: "noShield", label: "盾なし", guard: Object.freeze({ physical: 0.72, spell: 0.72, breath: 0.72 }) }),
  smallShield: Object.freeze({ id: "smallShield", label: "小盾", load: "light", guard: Object.freeze({ physical: 0.55, spell: 0.55, breath: 0.55 }) }),
  largeShield: Object.freeze({ id: "largeShield", label: "大盾", load: "heavy", guard: Object.freeze({ physical: 0.40, spell: 0.72, breath: 0.72 }) }),
  magicShield: Object.freeze({ id: "magicShield", label: "魔法盾", load: "standard", guard: Object.freeze({ physical: 0.72, spell: 0.40, breath: 0.40 }) })
});

export const DEPTHS = Object.freeze([1, 5, 10, 20, 30]);
export const LOAD_POLICIES = Object.freeze(["max-burden", "aggregate"]);
export const LOAD_FIXTURES = Object.freeze({
  heavyArmorSword: Object.freeze({ id: "heavy-armor-sword", weapon: "sword", armor: "heavyArmor", shield: "noShield" }),
  heavyArmorGreatsword: Object.freeze({ id: "heavy-armor-greatsword", weapon: "greatsword", armor: "heavyArmor", shield: "noShield" }),
  lightArmorGreatsword: Object.freeze({ id: "light-armor-greatsword", weapon: "greatsword", armor: "lightArmor", shield: "noShield" })
});

export const RUNE_ACTION = Object.freeze({ id: "rune-bolt", mpCost: 1, baseDamage: 48 });

export const REPRESENTATIVE_CONDITIONS = Object.freeze([
  Object.freeze({ id: "dagger-vs-sword", depth: 1, axis: "weapon", weapon: "dagger", compareWith: "sword", defense: "normal", attackType: "physical" }),
  Object.freeze({ id: "sword-vs-mace-normal-def", depth: 5, axis: "weapon", weapon: "sword", compareWith: "mace", defense: "normal", attackType: "physical" }),
  Object.freeze({ id: "sword-vs-mace-high-def", depth: 5, axis: "weapon", weapon: "sword", compareWith: "mace", defense: "high", attackType: "physical" }),
  Object.freeze({ id: "sword-vs-greatsword", depth: 10, axis: "weapon", weapon: "sword", compareWith: "greatsword", defense: "normal", attackType: "physical", actionPlan: "attack-defend", shield: "smallShield", compareShield: "noShield", enemyHpMultiplier: 1.35 }),
  Object.freeze({ id: "wand-vs-staff-rune", depth: 10, axis: "weapon", weapon: "wand", compareWith: "staff", defense: "normal", attackType: "spell", actionPlan: "rune" }),
  Object.freeze({ id: "light-armor", depth: 10, axis: "armor", armor: "lightArmor", weapon: "sword", shield: "smallShield", attackType: "physical" }),
  Object.freeze({ id: "medium-armor", depth: 10, axis: "armor", armor: "mediumArmor", weapon: "sword", shield: "smallShield", attackType: "physical" }),
  Object.freeze({ id: "heavy-armor", depth: 10, axis: "armor", armor: "heavyArmor", weapon: "sword", shield: "smallShield", attackType: "physical" }),
  Object.freeze({ id: "no-shield-physical", depth: 10, axis: "shield", armor: "mediumArmor", weapon: "sword", shield: "noShield", attackType: "physical", actionPlan: "attack-defend" }),
  Object.freeze({ id: "small-shield-physical", depth: 10, axis: "shield", armor: "mediumArmor", weapon: "sword", shield: "smallShield", attackType: "physical", actionPlan: "attack-defend" }),
  Object.freeze({ id: "large-shield-physical", depth: 10, axis: "shield", armor: "mediumArmor", weapon: "sword", shield: "largeShield", attackType: "physical", actionPlan: "attack-defend" }),
  Object.freeze({ id: "magic-shield-physical", depth: 10, axis: "shield", armor: "mediumArmor", weapon: "sword", shield: "magicShield", attackType: "physical", actionPlan: "attack-defend" }),
  Object.freeze({ id: "no-shield-arcane", depth: 10, axis: "shield", armor: "mediumArmor", weapon: "wand", shield: "noShield", attackType: "spell", actionPlan: "attack-defend" }),
  Object.freeze({ id: "small-shield-arcane", depth: 10, axis: "shield", armor: "mediumArmor", weapon: "wand", shield: "smallShield", attackType: "spell", actionPlan: "attack-defend" }),
  Object.freeze({ id: "large-shield-arcane", depth: 10, axis: "shield", armor: "mediumArmor", weapon: "wand", shield: "largeShield", attackType: "spell", actionPlan: "attack-defend" }),
  Object.freeze({ id: "magic-shield-arcane", depth: 10, axis: "shield", armor: "mediumArmor", weapon: "wand", shield: "magicShield", attackType: "spell", actionPlan: "attack-defend" }),
  Object.freeze({ id: "max-burden-heavyArmorSword", depth: 20, axis: "load", policy: "max-burden", fixtureId: "heavyArmorSword", attackType: "physical" }),
  Object.freeze({ id: "aggregate-heavyArmorSword", depth: 20, axis: "load", policy: "aggregate", fixtureId: "heavyArmorSword", attackType: "physical" }),
  Object.freeze({ id: "max-burden-heavyArmorGreatsword", depth: 20, axis: "load", policy: "max-burden", fixtureId: "heavyArmorGreatsword", attackType: "physical" }),
  Object.freeze({ id: "aggregate-heavyArmorGreatsword", depth: 20, axis: "load", policy: "aggregate", fixtureId: "heavyArmorGreatsword", attackType: "physical" }),
  Object.freeze({ id: "max-burden-lightArmorGreatsword", depth: 20, axis: "load", policy: "max-burden", fixtureId: "lightArmorGreatsword", attackType: "physical" }),
  Object.freeze({ id: "aggregate-lightArmorGreatsword", depth: 20, axis: "load", policy: "aggregate", fixtureId: "lightArmorGreatsword", attackType: "physical" })
]);

const LOAD_SCORE = Object.freeze({ light: 0, standard: 1, heavy: 2 });
const LOAD_INITIATIVE = Object.freeze({ light: 2, standard: 0, heavy: -2 });
const ENEMY_DEFENSE = Object.freeze({ normal: 8, high: 20 });
const ATTACK_PRESSURE = Object.freeze({ physical: 28, spell: 30, breath: 34 });
const GUARD_REFERENCE_SHIELD = "smallShield";
const RUNNER_PATH = "scratch/measurements/equipment_vnext_combat_diagnostic.js";
const DIAGNOSTIC_PATHS = Object.freeze([
  RUNNER_PATH,
  "src/data/equipment_vnext.js",
  "src/rules/combat_tier.js",
  "src/seed_rng.js"
]);

function positiveInteger(value, label, minimum = 1) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum) throw new Error(`${label} must be an integer >= ${minimum}: ${value}`);
  return parsed;
}

function percentile(values, ratio) {
  const sorted = [...values].sort((left, right) => left - right);
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * ratio;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return lower === upper ? sorted[lower] : sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function summarize(values) {
  const numeric = values.filter(Number.isFinite);
  if (!numeric.length) return { count: 0, average: null, p50: null, min: null, max: null };
  return {
    count: numeric.length,
    average: numeric.reduce((sum, value) => sum + value, 0) / numeric.length,
    p50: percentile(numeric, 0.5),
    min: Math.min(...numeric),
    max: Math.max(...numeric)
  };
}

function tierMultiplier(tier) {
  return 1 + (tier * 0.16);
}

function resolveLoadClass({ weapon, armor, shield }, policy) {
  const scores = [WEAPON_CANDIDATES[weapon]?.load, ARMOR_CANDIDATES[armor]?.load, SHIELD_CANDIDATES[shield]?.load]
    .map(load => LOAD_SCORE[load])
    .filter(Number.isInteger);
  const maxBurdenScore = scores.length ? Math.max(...scores) : LOAD_SCORE.standard;
  if (policy === "aggregate") {
    const aggregateScore = scores.reduce((sum, score) => sum + score, 0);
    const score = Math.max(maxBurdenScore, Math.min(LOAD_SCORE.heavy, aggregateScore));
    return {
      class: Object.keys(LOAD_SCORE).find(key => LOAD_SCORE[key] === score),
      score,
      maxBurdenScore,
      aggregateScore,
      aggregation: "sum-with-max-burden-floor"
    };
  }
  return {
    class: Object.keys(LOAD_SCORE).find(key => LOAD_SCORE[key] === maxBurdenScore),
    score: maxBurdenScore,
    maxBurdenScore,
    aggregateScore: scores.reduce((sum, value) => sum + value, 0),
    aggregation: "max-burden"
  };
}

export function resolveVNextLoadCandidate(fixture, policy) {
  if (!LOAD_POLICIES.includes(policy)) throw new Error(`unknown load policy: ${policy}`);
  return resolveLoadClass(fixture, policy);
}

export function resolveFormula({ weaponId, depth, defense = "normal" }) {
  const weapon = WEAPON_CANDIDATES[weaponId];
  if (!weapon) throw new Error(`unknown weapon candidate: ${weaponId}`);
  const tier = getCombatTierForStartFloor(depth);
  const power = 100 * tierMultiplier(tier);
  const raw = power * weapon.multiplier;
  const defenseValue = ENEMY_DEFENSE[defense] ?? ENEMY_DEFENSE.normal;
  const normalDefense = ENEMY_DEFENSE.normal;
  const excessDefense = Math.max(0, defenseValue - normalDefense);
  const effectiveDefense = weapon.highDefOnly
    ? Math.max(0, defenseValue - excessDefense * weapon.highDefPenetration)
    : defenseValue * (1 - weapon.highDefPenetration);
  const damage = Math.max(1, raw * Math.max(0.20, 1 - (effectiveDefense / 100)));
  return {
    weapon: weapon.id,
    depth,
    tier,
    tierMultiplier: tierMultiplier(tier),
    expectedRaw: raw,
    hitChance: weapon.hitChance,
    defense,
    expectedDamage: damage,
    expectedDamagePerAttempt: damage * weapon.hitChance
  };
}

function createAccumulator(condition, candidateId, candidate) {
  return {
    conditionId: condition.id,
    candidateId,
    candidate,
    outcomes: { victory: 0, death: 0 },
    rounds: [],
    damageDealt: [],
    damageTaken: [],
    enemyActions: [],
    playerActions: [],
    guardReduction: [],
    mpSpent: [],
    runeActions: [],
    runeDamage: [],
    oneRoundKills: 0,
    guardOpportunityLoss: [],
    initiativePlayerDraw: [],
    initiativeEnemyDraw: [],
    playerBeforeAnyEnemy: 0,
    survival: 0
  };
}

export function simulateOne(condition, candidateId, candidate, runSeed, { initiativeOverride = null } = {}) {
  const rng = createSeededRng(String(runSeed));
  const weapon = WEAPON_CANDIDATES[candidate.weapon];
  const armor = ARMOR_CANDIDATES[candidate.armor];
  const shield = SHIELD_CANDIDATES[candidate.shield];
  const tier = getCombatTierForStartFloor(condition.depth);
  const load = resolveLoadClass(candidate, candidate.policy);
  const playerSpeed = 10 + LOAD_INITIATIVE[load.class];
  const enemySpeed = 10;
  const playerInitiativeDraw = initiativeOverride === null ? rng() : null;
  const enemyInitiativeDraw = initiativeOverride === null ? rng() : null;
  const playerFirst = initiativeOverride === null
    ? playerSpeed + playerInitiativeDraw * 4 >= enemySpeed + enemyInitiativeDraw * 4
    : Boolean(initiativeOverride);
  let playerHp = 100;
  let enemyHp = 100 * tierMultiplier(tier) * (condition.enemyHpMultiplier || 1);
  const playerMpCapacity = weapon.mpCapacity ? weapon.mpCapacity + tier : 0;
  let playerMp = playerMpCapacity;
  let rounds = 0;
  let enemyActions = 0;
  let playerActions = 0;
  let damageDealt = 0;
  let damageTaken = 0;
  let guardReduction = 0;
  let mpSpent = 0;
  let runeDamage = 0;
  let runeActions = 0;
  let guardedEnemyActions = 0;
  let guardOpportunityLoss = 0;
  const actionTrace = [];
  const armorMitigation = 1 - armor.mitigation;
  const pressure = ATTACK_PRESSURE[condition.attackType] || ATTACK_PRESSURE.physical;
  const resolveGuardMultiplier = (shieldId = candidate.shield) => {
    const guardShield = SHIELD_CANDIDATES[shieldId];
    return guardShield.guard[condition.attackType] ?? guardShield.guard.physical;
  };
  const playerAttack = () => {
    if (rng() > weapon.hitChance) return;
    const formula = resolveFormula({ weaponId: weapon.id, depth: condition.depth, defense: condition.defense || "normal" });
    const dealt = Math.max(1, formula.expectedDamage * (0.92 + rng() * 0.16));
    enemyHp -= dealt;
    damageDealt += dealt;
  };
  const playerRuneAction = () => {
    const rune = weapon.runeSlots > 0 ? RUNE_ACTION : null;
    if (!rune || playerMp < rune.mpCost) return false;
    playerMp -= rune.mpCost;
    mpSpent += rune.mpCost;
    const dealt = Math.max(1, rune.baseDamage * tierMultiplier(tier) * (0.92 + rng() * 0.16));
    enemyHp -= dealt;
    damageDealt += dealt;
    runeDamage += dealt;
    runeActions++;
    return true;
  };
  const enemyAttack = ({ defending = false, roundActions = null } = {}) => {
    const incoming = pressure * tierMultiplier(tier) * (0.92 + rng() * 0.16);
    const guardMultiplier = defending ? resolveGuardMultiplier() : 1;
    const taken = Math.max(1, incoming * armorMitigation * guardMultiplier);
    playerHp -= taken;
    damageTaken += taken;
    if (defending) {
      const reduction = Math.max(0, incoming - incoming * guardMultiplier);
      guardReduction += reduction;
      guardOpportunityLoss += Math.max(0, Math.max(0, incoming - incoming * resolveGuardMultiplier(GUARD_REFERENCE_SHIELD)) - reduction);
      guardedEnemyActions++;
    }
    enemyActions++;
    roundActions?.push("enemy");
  };
  const executePlayerAction = (action, roundActions) => {
    if (action === "defend") {
      playerActions++;
      roundActions.push("player:defend");
      return true;
    }
    if (action === "rune" && playerRuneAction()) {
      playerActions++;
      roundActions.push("player:rune");
      return true;
    }
    playerAttack();
    playerActions++;
    roundActions.push(action === "rune" ? "player:attack-fallback" : "player:attack");
    return true;
  };
  while (playerHp > 0 && enemyHp > 0 && rounds < 30) {
    rounds++;
    const playerAction = condition.actionPlan === "rune"
      ? "rune"
      : condition.actionPlan === "attack-defend" && rounds % 2 === 0
        ? "defend"
        : "attack";
    const roundActions = [];
    if (playerFirst) {
      if (playerHp > 0 && enemyHp > 0) executePlayerAction(playerAction, roundActions);
      if (enemyHp > 0) enemyAttack({ defending: playerAction === "defend", roundActions });
    } else {
      if (enemyHp > 0) enemyAttack({ roundActions });
      if (playerHp > 0 && enemyHp > 0) executePlayerAction(playerAction, roundActions);
    }
    actionTrace.push(roundActions);
  }
  const victory = enemyHp <= 0 && playerHp > 0;
  return {
    outcome: victory ? "victory" : "death",
    rounds,
    damageDealt,
    damageTaken,
    enemyActions,
    playerActions,
    guardReduction,
    guardedEnemyActions,
    mpSpent,
    runeActions,
    runeDamage,
    oneRoundKill: rounds === 1 && victory,
    guardOpportunityLoss,
    runeActionId: weapon.runeSlots > 0 ? RUNE_ACTION.id : null,
    mpCapacity: playerMpCapacity,
    playerFirst,
    initiativeDraws: { player: playerInitiativeDraw, enemy: enemyInitiativeDraw },
    playerSpeed,
    loadClass: load.class,
    actionTrace
  };
}

function finalizeAccumulator(accumulator, runs) {
  const outcomeCount = accumulator.outcomes.victory + accumulator.outcomes.death;
  return {
    conditionId: accumulator.conditionId,
    candidateId: accumulator.candidateId,
    candidate: accumulator.candidate,
    runs,
    outcomes: accumulator.outcomes,
    survivalRate: accumulator.survival / runs,
    rounds: summarize(accumulator.rounds),
    damageDealt: summarize(accumulator.damageDealt),
    damageTaken: summarize(accumulator.damageTaken),
    enemyActionCount: summarize(accumulator.enemyActions),
    playerActionCount: summarize(accumulator.playerActions),
    guardReduction: summarize(accumulator.guardReduction),
    mpSpent: summarize(accumulator.mpSpent),
    runeActions: summarize(accumulator.runeActions),
    runeDamage: summarize(accumulator.runeDamage),
    oneRoundKillRate: accumulator.oneRoundKills / runs,
    guardOpportunityLoss: summarize(accumulator.guardOpportunityLoss),
    initiativeDraws: {
      player: summarize(accumulator.initiativePlayerDraw),
      enemy: summarize(accumulator.initiativeEnemyDraw)
    },
    playerBeforeAnyEnemyRate: accumulator.playerBeforeAnyEnemy / runs,
    confidence: runs >= MIN_CONFIDENT_RUNS ? "eligible-for-bounded-interpretation" : "runner-correctness-only",
    invariant: outcomeCount === runs
  };
}

export function comparisonGroupForCondition(condition) {
  if (condition.axis === "armor") return "armor";
  if (condition.axis === "shield") return condition.attackType === "spell" ? "shield-arcane" : "shield-physical";
  if (condition.axis === "load") return `load-${condition.fixtureId}`;
  if (condition.id === "sword-vs-mace-normal-def") return "sword-vs-mace-normal";
  return condition.id;
}

export function comparisonRunSeed(baseSeed, condition, runIndex) {
  return `${baseSeed}:${comparisonGroupForCondition(condition)}:${runIndex}`;
}

function candidateForCondition(condition, candidateId) {
  const fixture = condition.fixtureId ? LOAD_FIXTURES[condition.fixtureId] : null;
  if (condition.fixtureId && !fixture) throw new Error(`unknown load fixture: ${condition.fixtureId}`);
  const defaults = {
    weapon: condition.weapon || fixture?.weapon || "sword",
    armor: condition.armor || fixture?.armor || "mediumArmor",
    shield: condition.shield || fixture?.shield || "smallShield",
    policy: condition.policy || "max-burden",
    actionPlan: condition.actionPlan || "attack"
  };
  if (condition.axis === "weapon" && candidateId === condition.compareWith) defaults.weapon = candidateId;
  if (condition.axis === "weapon" && candidateId === condition.compareWith && condition.compareShield) {
    defaults.shield = condition.compareShield;
  }
  return defaults;
}

function conditionCandidates(condition) {
  if (condition.axis === "weapon") return [condition.weapon, condition.compareWith];
  if (condition.axis === "armor") return [condition.armor];
  if (condition.axis === "shield") return [condition.shield];
  if (condition.axis === "load") return [condition.policy];
  return [];
}

function formulaTable() {
  return DEPTHS.flatMap(depth => Object.keys(WEAPON_CANDIDATES).map(weaponId => resolveFormula({ weaponId, depth })));
}

export async function runEquipmentVNextCombatDiagnostic({ runs = DEFAULT_RUNS, seed = DEFAULT_SEED, allowSmallRunCount = false } = {}) {
  const normalizedRuns = positiveInteger(runs, "runs", allowSmallRunCount ? 1 : MIN_CONFIDENT_RUNS);
  const normalizedSeed = positiveInteger(seed, "seed");
  const fixedCombat = [];
  for (const condition of REPRESENTATIVE_CONDITIONS) {
    const comparisonGroup = comparisonGroupForCondition(condition);
    for (const candidateId of conditionCandidates(condition)) {
      const candidate = candidateForCondition(condition, candidateId);
      const accumulator = createAccumulator(condition, candidateId, candidate);
      for (let runIndex = 0; runIndex < normalizedRuns; runIndex++) {
        const result = simulateOne(condition, candidateId, candidate, comparisonRunSeed(normalizedSeed, condition, runIndex));
        accumulator.outcomes[result.outcome]++;
        accumulator.survival += Number(result.outcome === "victory");
        accumulator.playerBeforeAnyEnemy += Number(result.playerFirst);
        accumulator.rounds.push(result.rounds);
        accumulator.damageDealt.push(result.damageDealt);
        accumulator.damageTaken.push(result.damageTaken);
        accumulator.enemyActions.push(result.enemyActions);
        accumulator.playerActions.push(result.playerActions);
        accumulator.guardReduction.push(result.guardReduction);
        accumulator.mpSpent.push(result.mpSpent);
        accumulator.runeActions.push(result.runeActions);
        accumulator.runeDamage.push(result.runeDamage);
        accumulator.oneRoundKills += Number(result.oneRoundKill);
        accumulator.guardOpportunityLoss.push(result.guardOpportunityLoss);
        accumulator.initiativePlayerDraw.push(result.initiativeDraws.player);
        accumulator.initiativeEnemyDraw.push(result.initiativeDraws.enemy);
      }
      fixedCombat.push({ comparisonGroup, ...finalizeAccumulator(accumulator, normalizedRuns) });
    }
  }
  const loadComparison = Object.entries(LOAD_FIXTURES).flatMap(([fixtureId, fixture]) => {
    const maxBurden = resolveVNextLoadCandidate(fixture, "max-burden");
    return LOAD_POLICIES.map(policy => {
      const resolved = resolveVNextLoadCandidate(fixture, policy);
      return {
        fixtureId,
        policy,
        fixture,
        resolved,
        maxBurdenScore: maxBurden.score,
        invariant: resolved.score >= maxBurden.score,
        result: fixedCombat.find(row => row.conditionId === `${policy}-${fixtureId}`)
      };
    });
  });
  return {
    schemaVersion: SCHEMA_VERSION,
    runnerVersion: RUNNER_VERSION,
    measurementId: "equipment-vnext-combat-diagnostic",
    evidenceScope: "diagnostic",
    confidencePolicy: { minimumConfidentRuns: MIN_CONFIDENT_RUNS, belowMinimum: "runner-correctness-only; no balance conclusion" },
    configuration: {
      runs: normalizedRuns,
      seed: normalizedSeed,
      depths: [...DEPTHS],
      tiers: DEPTHS.map(depth => ({ depth, tier: getCombatTierForStartFloor(depth) })),
      weaponIds: Object.keys(WEAPON_CANDIDATES),
      weaponProfiles: Object.values(WEAPON_CANDIDATES).map(({ id, hands, runeSlots, mpCapacity = null }) => ({ id, hands, runeSlots, mpCapacity })),
      armorIds: Object.keys(ARMOR_CANDIDATES),
      shieldIds: Object.keys(SHIELD_CANDIDATES),
      baseProfile: {
        weaponBaseIds: Object.keys(WEAPON_CANDIDATES).map(id => CANONICAL_BASES[id].id),
        armorBaseIds: Object.keys(ARMOR_CANDIDATES).map(id => CANONICAL_BASES[id].id),
        shieldBaseIds: Object.keys(SHIELD_CANDIDATES).filter(id => id !== "noShield").map(id => CANONICAL_BASES[id].id),
        noShieldCandidate: "universal_brace"
      },
      loadPolicies: [...LOAD_POLICIES],
      loadFixtures: Object.values(LOAD_FIXTURES),
      runeAction: RUNE_ACTION,
      comparisonGroups: [...new Set(REPRESENTATIVE_CONDITIONS.map(comparisonGroupForCondition))],
      seedFormat: "<base seed>:<comparison group>:<run index>; candidate ID excluded; common random numbers",
      representativeConditionIds: REPRESENTATIVE_CONDITIONS.map(condition => condition.id),
      omitted: ["full Cartesian product", "production combat resolver", "production equipment generation", "enemy loot UI save paths", "Bag weight"]
    },
    formulaTable: formulaTable(),
    fixedCombat,
    loadComparison,
    rawAggregate: fixedCombat
  };
}

function buildReport(result, provenance, purpose) {
  const environmentHash = printEnvSignatureBanner({
    runnerVersion: RUNNER_VERSION,
    schemaVersion: SCHEMA_VERSION,
    measurementId: result.measurementId,
    seed: result.configuration.seed,
    runs: result.configuration.runs,
    depths: result.configuration.depths,
    representativeConditionIds: result.configuration.representativeConditionIds,
    loadPolicies: result.configuration.loadPolicies
  }, { label: "issue1552 vNext combat diagnostic env" });
  return {
    ...result,
    purpose,
    measurement: {
      scope: readSimScopeDeclaration(import.meta.url)?.name || "diagnostic",
      sourceCommit: provenance?.sourceCommit || null,
      gameplaySourceCommit: provenance?.gameplaySourceCommit || null,
      measurementRunnerCommit: provenance?.measurementRunnerCommit || null,
      measurementRunnerPaths: provenance?.measurementRunnerPaths || [...DIAGNOSTIC_PATHS],
      measurementRunnerDiffSha256: provenance?.measurementRunnerDiffSha256 || null,
      originMainAncestor: provenance?.originMainAncestor ?? null,
      staleTreeAllowed: provenance?.staleTreeAllowed ?? null,
      workingTreeClean: provenance?.workingTreeClean ?? null,
      productionPaths: [],
      diagnosticPaths: [...DIAGNOSTIC_PATHS],
      environmentHash
    },
    candidatePolicy: {
      combatTier: "tierMultiplier = 1 + 0.16 × tier; Tier 0–5",
      weapon: "Mace keeps its lower hit chance and base multiplier; its high-DEF advantage comes from penetration only. Greatsword keeps the highest normal-attack multiplier, while the paired fixture includes small-shield Sword vs no-shield heavy Greatsword",
      armor: "direct incoming mitigation candidate; production DEF/(DEF+4) untouched",
      guard: "Defend-only candidate multipliers by physical / spell / breath; Attack has no Guard mitigation",
      rune: "wand and staff share one Rune action; slots, MP capacity, and hands are the only Rune scenario differences",
      load: "max burden = max slot score; aggregate = sum with max-burden floor",
      loadFixtures: LOAD_FIXTURES,
      confidence: `N < ${MIN_CONFIDENT_RUNS} is runner-correctness-only`
    }
  };
}

function buildSummary(report) {
  const lines = [
    "# Equipment vNext combat diagnostic (#1552)",
    "",
    `- measurement: ${report.measurementId}; runner: ${report.runnerVersion}; source SHA: ${report.measurement.sourceCommit || "not recorded"}`,
    `- N=${report.configuration.runs}; seed=${report.configuration.seed}; confidence: ${report.confidencePolicy.belowMinimum} below N=${MIN_CONFIDENT_RUNS}`,
    "- production connection: none; production paths: none",
    "",
    "## Formula table",
    "",
    "- Tier depth mapping: " + report.configuration.tiers.map(row => `B${row.depth}=T${row.tier}`).join(", "),
    "- Formula fields: expected damage per successful hit and expected damage per attack attempt; Mace's high-DEF interaction is isolated in penetration.",
    `- rows: ${report.formulaTable.length} (5 representative depths × 6 weapons)`,
    "",
    "## Representative fixed combat",
    "",
    "- Explicit comparisons only: weapon pairs, armor candidates, shield candidates by physical/arcane pressure, and three representative load fixtures; Greatsword uses one near-threshold HP fixture to expose 2H/no-shield/heavy cost.",
    "- Metrics: survival, rounds, one-round kills, damage dealt/taken, enemy actions, player-before-any-enemy, Defend-only Guard reduction/opportunity loss, actual Rune actions/damage/MP.",
    `- Rune scenario: shared ${report.configuration.runeAction.id} damage=${report.configuration.runeAction.baseDamage} MP=${report.configuration.runeAction.mpCost}; ${report.configuration.weaponProfiles.filter(row => row.runeSlots > 0).map(row => `${row.id}(slots=${row.runeSlots},MP=${row.mpCapacity},hands=${row.hands})`).join(" vs ")}.`,
    "",
    "| condition | candidate | survival | rounds p50 | 1-round kill | damage taken avg | enemy actions avg | player first | Guard reduction avg | Guard opportunity loss avg | Rune actions avg | Rune damage avg | MP spent avg |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...report.fixedCombat.map(row => `| ${row.conditionId} | ${row.candidateId} | ${(row.survivalRate * 100).toFixed(1)}% | ${row.rounds.p50?.toFixed(2) ?? "-"} | ${(row.oneRoundKillRate * 100).toFixed(1)}% | ${row.damageTaken.average?.toFixed(2) ?? "-"} | ${row.enemyActionCount.average?.toFixed(2) ?? "-"} | ${(row.playerBeforeAnyEnemyRate * 100).toFixed(1)}% | ${row.guardReduction.average?.toFixed(2) ?? "-"} | ${row.guardOpportunityLoss.average?.toFixed(2) ?? "-"} | ${row.runeActions.average?.toFixed(2) ?? "-"} | ${row.runeDamage.average?.toFixed(2) ?? "-"} | ${row.mpSpent.average?.toFixed(2) ?? "-"} |`),
    "",
    "## Load comparison",
    "",
    ...report.loadComparison.map(row => `- ${row.policy}: fixture=${row.fixture.id}; class=${row.resolved.class}; score=${row.resolved.score}; aggregate raw=${row.resolved.aggregateScore}; max-burden floor=${row.maxBurdenScore}; invariant=${row.invariant}; aggregation=${row.resolved.aggregation}`),
    "",
    "## Interpretation boundary",
    "",
    "- This report is a vNext candidate diagnostic, not a production balance decision.",
    `- N < ${MIN_CONFIDENT_RUNS} cannot support a balance conclusion. Merge後GitHub Actions measurement artifact is the evidence source.`,
    "- No production combat, equipment, enemy, loot, UI, or save module is imported or changed."
  ];
  return `${lines.join("\n")}\n`;
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const [key, inlineValue] = arg.slice(2).split("=", 2);
    options[key] = inlineValue ?? argv[++index];
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const runs = positiveInteger(options.runs || DEFAULT_RUNS, "runs", MIN_CONFIDENT_RUNS);
  const seed = positiveInteger(options.seed || DEFAULT_SEED, "seed");
  if (!options.output || !options.summary) throw new Error("--output and --summary are required");
  const provenance = requireRunnerProvenance({ fetchOriginMain: false, measurementRunnerPaths: [...DIAGNOSTIC_PATHS] });
  const result = await runEquipmentVNextCombatDiagnostic({ runs, seed });
  const report = buildReport(result, provenance, options.purpose || process.env.MEASUREMENT_PURPOSE || "");
  fs.writeFileSync(resolve(options.output), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(resolve(options.summary), buildSummary(report));
  console.log(`Wrote Issue #1552 vNext combat diagnostic: ${resolve(options.output)}`);
}

export { buildReport, buildSummary, formulaTable, resolveLoadClass };

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
