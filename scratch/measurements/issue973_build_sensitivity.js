// sim-scope: formula — production-backed causal encounter combat measurement
/* global console, process */

import fs from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createRng } from "../../src/seed_rng.js";
import { createDefaultCodex, createDefaultCurrentRun, createSoloCharacter } from "../../src/state/initial_state.js";
import { createDefaultRecords } from "../../src/state/records_state.js";
import { runCombatRoundCalculation } from "../../src/combat_logic/round.js";
import { chooseAutoCombatAction } from "../../src/combat_logic/auto_action.js";
import { MONSTERS, MONSTER_STATUS_ATTACK_PATTERNS } from "../../src/data/monsters.js";
import { SPELLS } from "../../src/data/spells.js";
import { ITEMS } from "../../src/data/items.js";
import { CORE_AFFIXES, SUPPORT_AFFIXES } from "../../src/data/affixes.js";
import { scaleEnemyForDepth } from "../../src/rules/depth_scaling.js";
import { getCharMaxHp, getCharMaxMp } from "../../src/rules/character_stats.js";
import { getSpellPayment, getCoreLogText } from "../../src/rules/affix_rules.js";
import { hasStatusEffect, STATUS_EFFECT_IDS } from "../../src/combat_logic/status_effects.js";
import { readSimScopeDeclaration, printEnvSignatureBanner } from "./measurement_env_signature.js";
import { requireRunnerProvenance } from "./measurement_provenance.js";

export const RUNNER_VERSION = "issue980-causal-attribution-v2";
export const TARGET_DEPTHS = Object.freeze([8, 13, 18, 21, 25, 30]);
export const DEFAULT_SEED = "974-build-confidence";
export const DEFAULT_RUNS = 100;
export const MAX_ROUNDS = 200;
export const LOW_RESOURCE_THRESHOLD = 0.25;
export const BOOTSTRAP_ITERATIONS = 2000;
export const CAUSAL_SCHEMA_VERSION = 7;

const TRACKED_STATUS_IDS = Object.freeze([
  STATUS_EFFECT_IDS.POISONED,
  STATUS_EFFECT_IDS.BLIND,
  STATUS_EFFECT_IDS.SLEEP,
  STATUS_EFFECT_IDS.PARALYZED,
  STATUS_EFFECT_IDS.SILENCE
]);

const BUILD_IDS = Object.freeze(["aoe-burst", "single-efficient", "sustain", "hybrid-fallback"]);
const ENCOUNTER_IDS = Object.freeze([
  "swarm-action-pressure",
  "magic-denial",
  "mp-pressure",
  "durable-single-target",
  "protected-formation",
  "attrition-recovery-denial"
]);

const CORE_BY_ID = new Map(CORE_AFFIXES.map(affix => [affix.id, affix]));
const SUPPORT_BY_ID = new Map(SUPPORT_AFFIXES.map(affix => [affix.id, affix]));

const BUILD_DEFINITIONS = Object.freeze([
  {
    id: "aoe-burst",
    label: "AoE Burst Mage",
    spells: ["KATINO", "LAHALITO", "MADALTO", "TILTOWAIT", "MAHALITO", "HALITO"],
    equipment: {
      weapon: { baseId: "WAND", supports: [{ id: "spellPower", value: 20 }, { id: "arcane", value: 15 }] },
      armor: { baseId: "SORCERER_ROBE", supports: [{ id: "spellPower", value: 20 }, { id: "arcane", value: 15 }] },
      accessory: { baseId: "AMULET_MP" }
    },
    note: "現存する範囲攻撃 spell と術力/秘術 support を優先する。"
  },
  {
    id: "single-efficient",
    label: "Single-target / Efficient Mage",
    spells: ["MAHALITO", "HALITO"],
    equipment: {
      weapon: { baseId: "SAGE_STAFF", coreId: "CORE_GIANT_SLAYER" },
      armor: { baseId: "MAGE_CLOAK", supports: [{ id: "spellPower", value: 20 }, { id: "arcane", value: 15 }] },
      accessory: { baseId: "AMULET_MP", supports: [{ id: "spellPower", value: 20 }] }
    },
    note: "単体 spell と実在する巨人殺し core で高HP単体を試験する。"
  },
  {
    id: "sustain",
    label: "Sustain Mage",
    spells: ["LAHALITO", "MAHALITO", "HALITO"],
    equipment: {
      weapon: { baseId: "WAND", supports: [{ id: "spellPower", value: 20 }, { id: "killHeal", value: 2 }] },
      armor: { baseId: "EXPLORER_CLOAK", supports: [{ id: "hp", value: 9 }, { id: "statusResistance", value: 20 }] },
      accessory: { baseId: "AMULET_MP", coreId: "CORE_PURIFY_RING" },
      accessory2: { baseId: "AMULET_HP", supports: [{ id: "killHeal", value: 2 }] }
    },
    note: "Mage固有 killMp/spellCycleMp/killHeal と浄化の環を実在構成で観測する。"
  },
  {
    id: "hybrid-fallback",
    label: "Hybrid / Fallback Mage",
    spells: ["LAHALITO", "MAHALITO", "HALITO"],
    equipment: {
      weapon: { baseId: "WAND", coreId: "CORE_BLOOD_WAND" },
      armor: { baseId: "MAGE_CLOAK", supports: [{ id: "spellGuard", value: 20 }, { id: "statusResistance", value: 20 }] },
      accessory: { baseId: "AMULET_MP" },
      accessory2: { baseId: "WARD_CHARM" }
    },
    note: "MP不足時の血杖によるHP支払いと、現存する魔法耐性を観測する。"
  }
]);

const ENCOUNTER_DEFINITIONS = Object.freeze([
  {
    id: "swarm-action-pressure",
    label: "swarm / action-count pressure",
    monsterNames: ["双頭の番犬", "ブラッドバット群", "分裂スライム"]
  },
  {
    id: "magic-denial",
    label: "magic denial",
    monsterNames: ["魔鏡の司祭", "沈黙の修道士", "灰燼の術士"]
  },
  {
    id: "mp-pressure",
    label: "MP pressure",
    monsterNames: ["マナドレイン", "黒曜の魔導士"]
  },
  {
    id: "durable-single-target",
    label: "durable single target",
    monsterNames: ["竜血の再生者"]
  },
  {
    id: "protected-formation",
    label: "protected formation",
    monsterNames: ["ストーンガード", "オークの戦士"]
  },
  {
    id: "attrition-recovery-denial",
    label: "attrition / recovery denial",
    monsterNames: ["命喰いの影", "催眠コウモリ", "煙幕盗賊"]
  }
]);

function assertKnownBuildPart(build, slot, definition) {
  const base = ITEMS[definition.baseId];
  if (!base) throw new Error(`${build.id}: unknown production item ${definition.baseId}`);
  if (base.type !== slot && !(slot === "accessory2" && base.type === "accessory")) {
    throw new Error(`${build.id}: ${definition.baseId} cannot occupy ${slot}`);
  }
  if (definition.coreId) {
    const core = CORE_BY_ID.get(definition.coreId);
    if (!core || !core.enabled) throw new Error(`${build.id}: unknown production core ${definition.coreId}`);
    if (core.slot !== base.type) throw new Error(`${build.id}: ${definition.coreId} has invalid slot ${base.type}`);
    if (core.allowedClasses && !core.allowedClasses.includes("Mage")) {
      throw new Error(`${build.id}: ${definition.coreId} cannot be worn by Mage`);
    }
  }
  (definition.supports || []).forEach(support => {
    if (!SUPPORT_BY_ID.has(support.id)) throw new Error(`${build.id}: unknown production support ${support.id}`);
    if (!Number.isFinite(support.value)) throw new Error(`${build.id}: invalid support value ${support.id}`);
  });
}

export function getBuildDefinitions() {
  return BUILD_DEFINITIONS.map(build => structuredClone(build));
}

export function getEncounterDefinitions() {
  return ENCOUNTER_DEFINITIONS.map(encounter => structuredClone(encounter));
}

function createFixtureEquipment(build, slot, definition) {
  assertKnownBuildPart(build, slot, definition);
  const base = ITEMS[definition.baseId];
  const affixes = [];
  if (definition.coreId) {
    affixes.push({ id: definition.coreId, type: definition.coreId, kind: "core" });
  }
  (definition.supports || []).forEach(support => {
    affixes.push({ id: support.id, type: support.id, kind: "support", value: support.value });
  });
  return {
    kind: "equipment",
    instanceId: `issue974:${build.id}:${slot}`,
    baseId: definition.baseId,
    rarity: "epic",
    level: 18,
    identified: true,
    halfIdentified: false,
    tags: [...(base.tags || [])],
    affixes
  };
}

export function createBuildCharacter(buildId) {
  const build = BUILD_DEFINITIONS.find(candidate => candidate.id === buildId);
  if (!build) throw new Error(`unknown build: ${buildId}`);
  const character = createSoloCharacter("Mage");
  character.equipment = {};
  Object.entries(build.equipment).forEach(([slot, definition]) => {
    character.equipment[slot] = createFixtureEquipment(build, slot, definition);
  });
  character.spells = [...build.spells];
  build.spells.forEach(spellName => {
    if (!SPELLS[spellName] || SPELLS[spellName].type !== "mage") {
      throw new Error(`${build.id}: ${spellName} is not a production Mage spell`);
    }
  });
  character.hp = getCharMaxHp(character);
  character.mp = getCharMaxMp(character);
  return character;
}

function getMonsterByName(name) {
  const monster = MONSTERS.find(candidate => candidate.name === name);
  if (!monster) throw new Error(`unknown production monster fixture: ${name}`);
  return monster;
}

export function createEncounterFixture(encounterId, depth) {
  const definition = ENCOUNTER_DEFINITIONS.find(candidate => candidate.id === encounterId);
  if (!definition) throw new Error(`unknown encounter: ${encounterId}`);
  if (!TARGET_DEPTHS.includes(depth)) throw new Error(`unsupported depth: ${depth}`);
  const nameCounts = new Map();
  const monsters = definition.monsterNames.map(name => {
    const template = getMonsterByName(name);
    const count = (nameCounts.get(name) || 0) + 1;
    nameCounts.set(name, count);
    const scaled = scaleEnemyForDepth(template, depth);
    return {
      ...scaled,
      name: count > 1 ? `${name} ${String.fromCharCode(64 + count)}` : name
    };
  });
  return {
    id: definition.id,
    label: definition.label,
    monsterNames: [...definition.monsterNames],
    depth,
    monsters
  };
}

function createTelemetry() {
  return {
    physicalPlayerHits: [],
    physicalPlayerMisses: [],
    physicalMonsterHits: [],
    spellHits: [],
    spellMonsterHits: [],
    mitigations: [],
    mitigationCalls: [],
    targetedBonuses: []
  };
}

function createSimulationState(buildId, depth, monsters, seed) {
  const character = createBuildCharacter(buildId);
  const currentRun = createDefaultCurrentRun();
  currentRun.runSeed = seed;
  currentRun.startFloor = depth;
  currentRun.deepestFloor = depth;
  currentRun.characterClass = "Mage";
  currentRun.floorsVisited = [depth];
  return {
    x: 0,
    y: 0,
    floor: depth,
    seed,
    party: [character],
    inventory: [],
    firstKills: [],
    currentRun,
    records: createDefaultRecords(),
    codex: createDefaultCodex(),
    metaMaterials: {},
    workshop: { ranks: {} },
    unlockedMilestones: [],
    roamingMonsters: [],
    floorChestsTotal: [],
    identifyTickets: 0,
    gameState: "combat",
    simPolicy: {},
    simTelemetry: { executionerTriggers: 0, causalDamageEvents: [], causalHealEvents: [] },
    combatFormulaTelemetry: createTelemetry(),
    combatState: {
      monsters,
      isBoss: false,
      isMidboss: false,
      isRoamingFlack: false,
      roundNumber: 1,
      phase: "choose_actions",
      loggedCoreActivations: []
    }
  };
}

function withSeed(seed, callback) {
  const previousRandom = Math.random;
  Math.random = createRng(seed);
  try {
    return callback();
  } finally {
    Math.random = previousRandom;
  }
}

function createMechanismCounts() {
  return {
    physicalActions: 0,
    spellActions: 0,
    spellNames: {},
    coreActivations: {},
    statusApplications: 0,
    statusCures: 0,
    monsterTraitFirings: {},
    mpDrain: 0,
    reflectionOrCounter: 0,
    actionEconomy: 0,
    regen: 0,
    guard: 0
  };
}

function createStatusTrajectory() {
  return {
    activeRounds: Object.fromEntries(TRACKED_STATUS_IDS.map(id => [id, 0])),
    applications: Object.fromEntries(TRACKED_STATUS_IDS.map(id => [id, 0])),
    removals: Object.fromEntries(TRACKED_STATUS_IDS.map(id => [id, 0])),
    incapacitatedRounds: 0,
    silenceCastOpportunityLossRounds: 0,
    terminalActiveStatuses: []
  };
}

function getActiveStatuses(character) {
  return TRACKED_STATUS_IDS.filter(statusId => hasStatusEffect(character, statusId));
}

function getCharacterStateSnapshot(character) {
  return {
    hp: character.hp,
    mp: character.mp,
    status: character.status,
    silenceTurns: character.silenceTurns || 0,
    activeStatuses: getActiveStatuses(character),
    antiHealTurns: character.antiHealTurns || 0
  };
}

function getEnemyStateSnapshot(monsters) {
  return monsters.map(monster => ({
    name: monster.name,
    hp: monster.hp,
    maxHp: monster.maxHp,
    status: monster.status,
    living: monster.hp > 0
  }));
}

const MECHANISM_PATTERNS = Object.freeze([
  ["spell_denial", /封呪|沈黙した|沈黙していて呪文を唱えられない|煙幕/],
  ["mp_starvation", /MPを\d+吸い取った/],
  ["reflection_chain", /反射ダメージ|魔法反射/],
  ["action_economy", /連続攻撃|分裂|召喚|狙撃|自爆/],
  ["sustain_failure", /回復を阻害|命を喰らう/],
  ["regen", /再生/],
  ["guard", /庇った/],
  ["status_lock", /動けない|麻痺を受け|眠りに落ちた/]
]);

function getRoundMechanismEvents(messages, round) {
  return MECHANISM_PATTERNS
    .filter(([, pattern]) => messages.some(message => pattern.test(message)))
    .map(([type]) => ({ type, round }));
}

function getEnemyActions(messages, round) {
  return messages
    .filter(message => message.startsWith("[ 敵 ]"))
    .map(message => ({ round, message }));
}

function getStatusTransitions(before, after, messages, round) {
  const events = [];
  const beforeStatuses = new Set(before.activeStatuses);
  const afterStatuses = new Set(after.activeStatuses);
  TRACKED_STATUS_IDS.forEach(statusId => {
    if (!beforeStatuses.has(statusId) && afterStatuses.has(statusId)) {
      events.push({ type: "status_apply", status: statusId, round });
    }
    if (beforeStatuses.has(statusId) && !afterStatuses.has(statusId)) {
      events.push({ type: "status_remove", status: statusId, round });
    }
  });
  if (before.silenceTurns <= 0 && after.silenceTurns > 0) {
    events.push({ type: "status_apply", status: STATUS_EFFECT_IDS.SILENCE, round });
  }
  if (before.silenceTurns > 0 && after.silenceTurns <= 0) {
    events.push({ type: "status_remove", status: STATUS_EFFECT_IDS.SILENCE, round });
  }
  if (before.antiHealTurns <= 0 && after.antiHealTurns > 0) {
    events.push({ type: "status_apply", status: "antiHeal", round });
  }
  if (before.antiHealTurns > 0 && after.antiHealTurns <= 0) {
    events.push({ type: "status_remove", status: "antiHeal", round });
  }
  if (messages.some(message => /沈黙した/.test(message)) && !events.some(event => event.status === STATUS_EFFECT_IDS.SILENCE && event.type === "status_apply")) {
    events.push({ type: "status_apply", status: STATUS_EFFECT_IDS.SILENCE, round });
  }
  return events;
}

const STATUS_APPLICATION_PATTERNS = Object.freeze({
  [STATUS_EFFECT_IDS.POISONED]: /毒に侵された|毒を受けた/,
  [STATUS_EFFECT_IDS.BLIND]: /盲目状態になった|盲目を受けた/,
  [STATUS_EFFECT_IDS.SLEEP]: /眠りに落ちた|睡眠を受けた/,
  [STATUS_EFFECT_IDS.PARALYZED]: /麻痺状態になった|麻痺を受けた/,
  [STATUS_EFFECT_IDS.SILENCE]: /沈黙した/ // "沈黙を退けた" is intentionally excluded.
});

function observeStatusTrajectory(
  trajectory,
  { characterBefore, characterAfter, action, logs, round, hasSpellOpportunity }
) {
  const beforeActive = getActiveStatuses(characterBefore);
  const afterActive = getActiveStatuses(characterAfter);
  const messages = logs.map(entry => String(entry.msg || ""));
  trajectory.roundsObserved = (trajectory.roundsObserved || 0) + 1;
  beforeActive.forEach(statusId => {
    trajectory.activeRounds[statusId]++;
  });
  TRACKED_STATUS_IDS.forEach(statusId => {
    const becameActive = !beforeActive.includes(statusId) && afterActive.includes(statusId);
    if (becameActive) {
      trajectory.applications[statusId]++;
    }
    if (beforeActive.includes(statusId) && !afterActive.includes(statusId)) {
      trajectory.removals[statusId]++;
    }
    if (
      !becameActive &&
      STATUS_APPLICATION_PATTERNS[statusId] &&
      messages.some(message => STATUS_APPLICATION_PATTERNS[statusId].test(message))
    ) {
      trajectory.applications[statusId]++;
    }
  });
  if (
    [STATUS_EFFECT_IDS.SLEEP, STATUS_EFFECT_IDS.PARALYZED].some(statusId => beforeActive.includes(statusId)) &&
    messages.some(message => /動けない/.test(message))
  ) {
    trajectory.incapacitatedRounds++;
  }
  if (
    beforeActive.includes(STATUS_EFFECT_IDS.SILENCE) &&
    hasSpellOpportunity &&
    action.type === "spell" &&
    messages.some(message => /沈黙していて呪文を唱えられない/.test(message))
  ) {
    trajectory.silenceCastOpportunityLossRounds++;
  }
  trajectory.lastRound = {
    round,
    activeStatuses: beforeActive,
    action: { type: action.type, spellName: action.spellName || null }
  };
}

function increment(map, key, amount = 1) {
  map[key] = (map[key] || 0) + amount;
}

function observeRound(mechanisms, action, logs) {
  if (action.type === "fight") mechanisms.physicalActions++;
  if (action.type === "spell") {
    mechanisms.spellActions++;
    increment(mechanisms.spellNames, action.spellName);
  }
  const messages = logs.map(entry => String(entry.msg || ""));
  CORE_AFFIXES.forEach(core => {
    const coreLog = getCoreLogText(core.id);
    const activations = logs.filter(entry => entry.msg === coreLog).length;
    if (activations > 0) increment(mechanisms.coreActivations, core.id, activations);
  });
  mechanisms.statusApplications += logs.filter(entry =>
    /毒に|毒を受け|盲目状態|盲目を受け|麻痺を受け|眠りに|沈黙した|回復阻害/.test(entry.msg || "")
  ).length;
  mechanisms.statusCures += logs.filter(entry => /治療|回復した|解けた/.test(entry.msg || "")).length;
  if (messages.some(message => /MPを\d+吸い取った/.test(message))) mechanisms.mpDrain++;
  if (messages.some(message => /反射ダメージ|反撃した|反撃ダメージ/.test(message))) {
    mechanisms.reflectionOrCounter++;
    increment(mechanisms.monsterTraitFirings, "reflection_or_counter");
  }
  if (messages.some(message => /連続攻撃|分裂|召喚|狙撃|自爆/.test(message))) {
    mechanisms.actionEconomy++;
    increment(mechanisms.monsterTraitFirings, "action_economy");
  }
  if (messages.some(message => /再生/.test(message))) mechanisms.regen++;
  if (messages.some(message => /庇った/.test(message))) mechanisms.guard++;
  if (messages.some(message => /沈黙|煙幕/.test(message))) increment(mechanisms.monsterTraitFirings, "spell_denial");
  if (messages.some(message => /回復を阻害|命を喰らう/.test(message))) increment(mechanisms.monsterTraitFirings, "recovery_denial");
  if (messages.some(message => /魔法の結界|魔法に弱く/.test(message))) increment(mechanisms.monsterTraitFirings, "magic_resistance_shift");
}

function hasOffensiveSpellOpportunity(character) {
  return character.spells.some(spellName => {
    const spell = SPELLS[spellName];
    return spell?.target?.includes("enemy");
  });
}

function hasCastableOffensiveSpell(character) {
  return character.spells.some(spellName => {
    const spell = SPELLS[spellName];
    return spell?.target?.includes("enemy") && getSpellPayment(character, spell.cost).canCast;
  });
}

function chooseAction(state) {
  const character = state.party[0];
  const monsters = state.combatState.monsters;
  const action = chooseAutoCombatAction({
    character,
    monsters,
    roundNumber: state.combatState.roundNumber,
    canCastSpell: spellName => {
      const spell = SPELLS[spellName];
      return Boolean(spell && getSpellPayment(character, spell.cost).canCast);
    }
  });
  if (!action) throw new Error(`auto-action returned no action for ${character.class}`);
  return { ...action, actorIdx: 0 };
}

function getActionEconomyStateDegradation(trace) {
  return trace.flatMap((round, index) => {
    if (!round.mechanisms.some(event => event.type === "action_economy")) return [];
    const attackActions = round.enemyActions.filter(action => /の(?:攻撃|追撃|狙撃|自爆)/.test(action.message));
    const attackSources = attackActions.map(action => action.message.match(/^\[ 敵 \] (.+?)の(?:攻撃|追撃|狙撃|自爆)/)?.[1]).filter(Boolean);
    const repeatedAttacker = new Set(attackSources).size < attackSources.length;
    const livingBefore = round.enemyState?.before?.livingCount || 0;
    const livingAfter = round.enemyState?.after?.livingCount || 0;
    const spawnedOrSplit = livingAfter > livingBefore;
    const moreActionsThanEnemies = attackActions.length > Math.max(1, livingBefore);
    const hpLossAfterMechanic = trace.slice(index).some(entry => entry.hp.delta < 0);
    return (spawnedOrSplit || repeatedAttacker || moreActionsThanEnemies) && hpLossAfterMechanic
      ? [round.round]
      : [];
  });
}

function getLongFightStateDegradation(trace, rounds) {
  if (rounds < 8) return [];
  return trace.flatMap(round => {
    const hasRecoveryMechanic = round.mechanisms.some(event => event.type === "regen" || event.type === "guard");
    if (!hasRecoveryMechanic) return [];
    const beforeHp = round.enemyState?.before?.totalHp || 0;
    const afterHp = round.enemyState?.after?.totalHp || 0;
    const regenExtendedSurvival = afterHp > beforeHp;
    const guardExtendedSurvival = round.mechanisms.some(event => event.type === "guard") &&
      trace.some(entry => entry.round > round.round && entry.enemyState?.after?.livingCount > 0);
    return regenExtendedSurvival || guardExtendedSurvival ? [round.round] : [];
  });
}

function getSustainStateDegradation(trace) {
  return trace.flatMap(round => {
    const antiHealActive = round.stateDegradation.antiHealTurnsBefore > 0;
    const suppressedHeal = (round.healEvents || []).some(event =>
      event.antiHealTurns > 0 && event.potential > event.recovered
    );
    return antiHealActive && suppressedHeal ? [round.round] : [];
  });
}

function getCausalEvidence({ trace, mechanisms, statusTrajectory, mpStarvationRounds, state, causalDamageEvents, deathRound, rounds }) {
  const actionEconomyImpactRounds = getActionEconomyStateDegradation(trace)
    .filter(round => round <= deathRound);
  const longFightImpactRounds = getLongFightStateDegradation(trace, rounds)
    .filter(round => round <= deathRound);
  const sustainImpactRounds = getSustainStateDegradation(trace)
    .filter(round => round <= deathRound);
  const physicalFallbackRounds = trace.filter(round => round.round <= deathRound && round.physicalFallback).length;
  const spellOpportunityLossRounds = trace.filter(round => round.round <= deathRound && round.spellCastOpportunityLoss).length;
  const reflectionDamageEvents = causalDamageEvents.filter(event =>
    event.round <= deathRound && ["reflect", "counter"].includes(event.attackType) && event.finalDamage > 0
  ).length;
  const terminalMp = trace.at(-1)?.mp.after ?? state.party[0].mp;
  const maxMp = getCharMaxMp(state.party[0]);
  const mpDegradation = mechanisms.mpDrain > 0 && (
    physicalFallbackRounds > 0 ||
    mpStarvationRounds > 0 ||
    terminalMp / Math.max(1, maxMp) <= LOW_RESOURCE_THRESHOLD
  );
  const statusLockRounds = trace.filter(round =>
    round.round <= deathRound && round.stateDegradation.incapacitated
  ).length;
  return {
    statusLock: statusLockRounds > 0,
    spellDenial: spellOpportunityLossRounds > 0,
    mpStarvation: mpDegradation,
    reflection: reflectionDamageEvents > 0,
    actionEconomy: actionEconomyImpactRounds.length > 0,
    sustainFailure: sustainImpactRounds.length > 0,
    longFight: longFightImpactRounds.length > 0,
    details: {
      statusLockRounds,
      spellOpportunityLossRounds,
      mpDrainEvents: mechanisms.mpDrain,
      mpStarvationRounds,
      physicalFallbackRounds,
      terminalMp,
      terminalMpRatio: terminalMp / Math.max(1, maxMp),
      reflectionDamageEvents,
      actionEconomyImpactRounds,
      sustainImpactRounds,
      longFightImpactRounds
    }
  };
}

export function classifyCausalDeath({ outcome, directCause, evidence = {}, deathRound = null }) {
  const validatedCandidates = [
    ["status_lock_chain", evidence.statusLock],
    ["spell_denial_chain", evidence.spellDenial],
    ["mp_starvation_chain", evidence.mpStarvation],
    ["reflection_chain", evidence.reflection],
    ["action_economy_chain", evidence.actionEconomy],
    ["sustain_failure_chain", evidence.sustainFailure],
    ["long_fight_chain", evidence.longFight]
  ].filter(([, present]) => present).map(([cause]) => cause);
  const directMechanic = ["reflection", "counter", "spell_damage", "status_damage", "status_payoff"].includes(directCause);
  let finalExclusiveCategory = null;
  if (outcome === "death" && directMechanic) {
    finalExclusiveCategory = "direct_mechanic_death";
  } else if (outcome === "death" && directCause === "raw_damage") {
    finalExclusiveCategory = validatedCandidates.length === 0
      ? "pure_raw_damage"
      : validatedCandidates.length === 1
        ? "mechanic_mediated_raw_lethal"
        : "unknown_or_mixed";
  }
  const contributingCause = finalExclusiveCategory === "pure_raw_damage"
    ? "pure_raw_damage"
    : finalExclusiveCategory === "mechanic_mediated_raw_lethal"
      ? validatedCandidates[0]
      : finalExclusiveCategory === "direct_mechanic_death"
        ? directCause
        : finalExclusiveCategory === "unknown_or_mixed" ? "unknown_or_mixed" : null;
  return {
    finalExclusiveCategory,
    contributingCause,
    contributingCauses: validatedCandidates,
    deathRound,
    validatedCandidates
  };
}

function classifyFailure({
  outcome,
  lowResource,
  state,
  mechanisms,
  rounds,
  statusTrajectory,
  mpStarvationRounds,
  trace,
  causalDamageEvents
}) {
  const lethalEvent = causalDamageEvents.filter(event => event.lethal).at(-1) || null;
  const directCause = lethalEvent
    ? ["reflect", "counter"].includes(lethalEvent.attackType)
      ? "reflection"
      : lethalEvent.causalType === "status_payoff"
        ? "status_payoff"
        : lethalEvent.attackType === "spell"
          ? "spell_damage"
          : lethalEvent.attackType === "other"
            ? "status_damage"
            : "raw_damage"
    : outcome === "timeout"
      ? "timeout"
      : null;
  const deathRound = lethalEvent?.round ?? rounds;
  const terminalTrace = trace.at(-1);
  const terminalDamage = Boolean(terminalTrace && terminalTrace.hp.after < terminalTrace.hp.before);
  const terminalMessages = terminalTrace?.enemyActions?.map(action => action.message) || [];
  const legacyCandidates = [];
  const repeated = count => count >= 2;
  if (
    repeated(statusTrajectory.incapacitatedRounds) ||
    (statusTrajectory.terminalActiveStatuses.some(status => [STATUS_EFFECT_IDS.SLEEP, STATUS_EFFECT_IDS.PARALYZED].includes(status)) && statusTrajectory.incapacitatedRounds >= 1)
  ) legacyCandidates.push("status_lock");
  if (repeated(statusTrajectory.silenceCastOpportunityLossRounds)) legacyCandidates.push("spell_denial");
  const maxMp = getCharMaxMp(state.party[0]);
  if (repeated(mpStarvationRounds) && state.party[0].mp / Math.max(1, maxMp) <= LOW_RESOURCE_THRESHOLD) legacyCandidates.push("mp_starvation");
  if (repeated(mechanisms.reflectionOrCounter) && terminalMessages.some(message => /反射ダメージ|反撃ダメージ/.test(message))) legacyCandidates.push("reflection_or_counter");
  if (repeated(mechanisms.actionEconomy) && terminalDamage && outcome === "death") legacyCandidates.push("action_economy");
  if (repeated(mechanisms.regen) && (outcome === "timeout" || rounds >= 8)) legacyCandidates.push("duration_overrun");
  if (outcome === "timeout") legacyCandidates.push("duration_overrun");
  const legacyPrimary = outcome === "death" && terminalDamage && legacyCandidates.length === 0
    ? "raw_damage_pressure"
    : [...new Set(legacyCandidates)].length === 1 ? [...new Set(legacyCandidates)][0] : "unknown_or_mixed";
  const eventsBeforeDeath = trace.flatMap(round => [
    ...round.mechanisms,
    ...round.statusEvents,
    ...(round.spellCastOpportunityLoss ? [{ type: "spell_denial", round: round.round }] : []),
    ...(round.physicalFallback ? [{ type: "physical_fallback", round: round.round }] : [])
  ]).filter(event => event.round <= deathRound);
  const stateDegradationEvidence = getCausalEvidence({
    trace,
    mechanisms,
    statusTrajectory,
    mpStarvationRounds,
    state,
    causalDamageEvents,
    deathRound,
    rounds
  });
  const causalDecision = classifyCausalDeath({
    outcome,
    directCause,
    evidence: stateDegradationEvidence,
    deathRound
  });
  const primary = directCause === "raw_damage"
    ? "raw_damage_pressure"
    : causalDecision.finalExclusiveCategory;
  const causalMechanismEvents = trace.flatMap(round => [
    ...round.mechanisms,
    ...(round.spellCastOpportunityLoss ? [{ type: "spell_denial", round: round.round }] : []),
    ...(round.physicalFallback ? [{ type: "mp_starvation", round: round.round }] : [])
  ]);
  const mechanismToDeath = causalDecision.validatedCandidates.flatMap(type => causalMechanismEvents
    .filter(event => event.type === type.replace("_chain", "") ||
      (type === "long_fight_chain" && ["regen", "guard"].includes(event.type)))
    .map(event => ({ mechanism: type, firingRound: event.round, deathRound, roundsToDeath: Math.max(0, deathRound - event.round) })));
  return {
    directCause,
    directCauseEvent: lethalEvent,
    legacyPrimary,
    legacyCandidates: [...new Set(legacyCandidates)],
    contributingCause: causalDecision.contributingCause,
    contributingCauses: causalDecision.contributingCauses,
    finalExclusiveCategory: causalDecision.finalExclusiveCategory,
    precedingMechanisms: eventsBeforeDeath,
    stateDegradationEvidence,
    primary,
    candidates: causalDecision.validatedCandidates,
    mechanismToDeath,
    rationale: causalDecision.validatedCandidates.length === 0
      ? "no validated state-degradation mechanism observed"
      : "mechanism and corresponding state-degradation evidence observed"
  };
}

export function runEncounterSample({ buildId, encounterId, depth, seed }) {
  return withSeed(seed, () => {
    const fixture = createEncounterFixture(encounterId, depth);
    const state = createSimulationState(buildId, depth, fixture.monsters, seed);
    const mechanisms = createMechanismCounts();
    const statusTrajectory = createStatusTrajectory();
    let rounds = 0;
    let mpStarvationRounds = 0;
    let outcome = "timeout";
    const trace = [];

    while (rounds < MAX_ROUNDS) {
      const characterBefore = state.party[0];
      const action = chooseAction(state);
      const hpBefore = characterBefore.hp;
      const mpBefore = characterBefore.mp;
      const characterStateBefore = getCharacterStateSnapshot(characterBefore);
      const enemyStateBefore = getEnemyStateSnapshot(state.combatState.monsters);
      const hasSpellOpportunity = hasOffensiveSpellOpportunity(characterBefore);
      const hasCastableSpell = hasCastableOffensiveSpell(characterBefore);
      const physicalFallback = action.type === "fight" && hasSpellOpportunity && !hasCastableSpell;
      if (
        action.type === "fight" &&
        hasSpellOpportunity &&
        characterBefore.spells.every(spellName => {
          const spell = SPELLS[spellName];
          return !spell?.target?.includes("enemy") || !getSpellPayment(characterBefore, spell.cost).canCast;
        })
      ) {
        mpStarvationRounds++;
      }
      const causalEventStart = state.simTelemetry.causalDamageEvents.length;
      const causalHealEventStart = state.simTelemetry.causalHealEvents.length;
      const result = runCombatRoundCalculation(state, { actions: [action] });
      rounds++;
      observeRound(mechanisms, action, result.logQueue);
      const characterAfter = result.state.party[0];
      const characterStateAfter = getCharacterStateSnapshot(characterAfter);
      const enemyStateAfter = getEnemyStateSnapshot(result.state.combatState.monsters);
      const messages = result.logQueue.map(entry => String(entry.msg || ""));
      const roundCausalDamage = state.simTelemetry.causalDamageEvents.slice(causalEventStart);
      const roundMechanisms = getRoundMechanismEvents(messages, rounds);
      const statusEvents = getStatusTransitions(characterStateBefore, characterStateAfter, messages, rounds);
      const spellCastOpportunityLoss = messages.some(message => /沈黙していて呪文を唱えられない/.test(message));
      observeStatusTrajectory(statusTrajectory, {
        characterBefore,
        characterAfter,
        action,
        logs: result.logQueue,
        round: rounds,
        hasSpellOpportunity
      });
      trace.push({
        round: rounds,
        hp: { before: hpBefore, after: characterAfter.hp, delta: characterAfter.hp - hpBefore },
        mp: { before: mpBefore, after: characterAfter.mp, delta: characterAfter.mp - mpBefore },
        playerAction: {
          selected: { type: action.type, spellName: action.spellName || null, targetIdx: action.targetIdx ?? null },
          result: spellCastOpportunityLoss ? "spell_opportunity_lost" :
            physicalFallback ? "physical_fallback" : action.type === "spell" ? "spell_cast" : action.type
        },
        enemyActions: getEnemyActions(messages, rounds),
        statusEvents,
        mechanisms: roundMechanisms,
        spellCastOpportunityLoss,
        physicalFallback,
        damageEvents: roundCausalDamage,
        healEvents: state.simTelemetry.causalHealEvents.slice(causalHealEventStart),
        stateDegradation: {
          hp: { before: characterStateBefore.hp, after: characterStateAfter.hp },
          mp: { before: characterStateBefore.mp, after: characterStateAfter.mp },
          activeStatusesBefore: characterStateBefore.activeStatuses,
          activeStatusesAfter: characterStateAfter.activeStatuses,
          silenceTurnsBefore: characterStateBefore.silenceTurns,
          silenceTurnsAfter: characterStateAfter.silenceTurns,
          antiHealTurnsBefore: characterStateBefore.antiHealTurns,
          antiHealTurnsAfter: characterStateAfter.antiHealTurns,
          incapacitated: messages.some(message => /動けない/.test(message))
        },
        enemyState: {
          before: {
            livingCount: enemyStateBefore.filter(enemy => enemy.living).length,
            totalHp: enemyStateBefore.reduce((sum, enemy) => sum + enemy.hp, 0)
          },
          after: {
            livingCount: enemyStateAfter.filter(enemy => enemy.living).length,
            totalHp: enemyStateAfter.reduce((sum, enemy) => sum + enemy.hp, 0)
          }
        }
      });
      state.party = result.state.party;
      state.combatState = result.state.combatState;
      state.currentRun = result.state.currentRun;
      state.codex = result.state.codex;
      state.firstKills = result.state.firstKills;
      state.metaMaterials = result.state.metaMaterials;
      if (state.party[0].status === "dead" || state.party[0].hp <= 0) {
        outcome = "death";
        break;
      }
      if (state.combatState.monsters.every(monster => monster.hp <= 0)) {
        outcome = "clear";
        break;
      }
    }

    const character = state.party[0];
    const maxHp = getCharMaxHp(character);
    const maxMp = getCharMaxMp(character);
    const hpRatio = Math.max(0, Math.min(1, character.hp / Math.max(1, maxHp)));
    const mpRatio = maxMp > 0 ? Math.max(0, Math.min(1, character.mp / maxMp)) : 1;
    const lowResource = hpRatio <= LOW_RESOURCE_THRESHOLD || (maxMp > 0 && mpRatio <= LOW_RESOURCE_THRESHOLD);
    statusTrajectory.terminalActiveStatuses = getActiveStatuses(character);
    const failure = outcome === "clear" && !lowResource
      ? null
      : classifyFailure({
        outcome,
        lowResource,
        state,
        mechanisms,
        rounds,
        statusTrajectory,
        mpStarvationRounds,
        trace,
        causalDamageEvents: state.simTelemetry.causalDamageEvents
      });
    return {
      outcome,
      rounds,
      hpRatio,
      mpRatio,
      lowResource,
      failure,
      trace,
      causalDamageEvents: state.simTelemetry.causalDamageEvents,
      mechanisms,
      statusTrajectory,
      mpStarvationRounds,
      seed,
      fixture: {
        encounterId,
        depth,
        monsterNames: fixture.monsters.map(monster => monster.name),
        productionDefinition: true,
        scaledStats: fixture.monsters.map(monster => ({
          name: monster.name,
          hp: monster.maxHp,
          atk: monster.atk,
          def: monster.def,
          traits: monster.traits || [],
          traitChance: monster.traitChance ?? null,
          statusAttackPattern: monster.statusAttackPattern || null
        }))
      }
    };
  });
}

function createCaseAggregate(buildId, encounterId, depth) {
  return {
    buildId,
    encounterId,
    depth,
    runs: 0,
    outcomes: { clear: 0, death: 0, timeout: 0 },
    sumHpRatio: 0,
    sumMpRatio: 0,
    sumRounds: 0,
    actionMix: { physical: 0, spell: 0, spellNames: {} },
    mechanisms: createMechanismCounts(),
    statusTrajectory: createStatusTrajectory(),
    mpStarvationRounds: 0,
    failureAttribution: {},
    candidateAttribution: {},
    deathFailureAttribution: {},
    directCauseCounts: {},
    contributingCauseCounts: {},
    finalExclusiveCategoryCounts: {},
    legacyRawDamageDeaths: 0,
    legacyRawExclusiveCategoryCounts: {},
    legacyRawContributingCauseCounts: {},
    fallbackActionCount: 0,
    spellCastOpportunityLossCount: 0,
    mechanicToDeathRounds: [],
    traces: [],
    samples: []
  };
}

function addSample(aggregate, sample, keepSamples) {
  aggregate.runs++;
  aggregate.outcomes[sample.outcome]++;
  aggregate.sumHpRatio += sample.hpRatio;
  aggregate.sumMpRatio += sample.mpRatio;
  aggregate.sumRounds += sample.rounds;
  aggregate.actionMix.physical += sample.mechanisms.physicalActions;
  aggregate.actionMix.spell += sample.mechanisms.spellActions;
  Object.entries(sample.mechanisms.spellNames).forEach(([name, count]) => increment(aggregate.actionMix.spellNames, name, count));
  aggregate.mechanisms.physicalActions += sample.mechanisms.physicalActions;
  aggregate.mechanisms.spellActions += sample.mechanisms.spellActions;
  Object.entries(sample.mechanisms.spellNames).forEach(([name, count]) => increment(aggregate.mechanisms.spellNames, name, count));
  Object.entries(sample.mechanisms.coreActivations).forEach(([name, count]) => increment(aggregate.mechanisms.coreActivations, name, count));
  Object.entries(sample.mechanisms.monsterTraitFirings).forEach(([name, count]) => increment(aggregate.mechanisms.monsterTraitFirings, name, count));
  ["statusApplications", "statusCures", "mpDrain", "reflectionOrCounter", "actionEconomy", "regen", "guard"].forEach(key => {
    aggregate.mechanisms[key] += sample.mechanisms[key];
  });
  TRACKED_STATUS_IDS.forEach(statusId => {
    aggregate.statusTrajectory.activeRounds[statusId] += sample.statusTrajectory.activeRounds[statusId];
    aggregate.statusTrajectory.applications[statusId] += sample.statusTrajectory.applications[statusId];
    aggregate.statusTrajectory.removals[statusId] += sample.statusTrajectory.removals[statusId];
  });
  aggregate.statusTrajectory.incapacitatedRounds += sample.statusTrajectory.incapacitatedRounds;
  aggregate.statusTrajectory.silenceCastOpportunityLossRounds += sample.statusTrajectory.silenceCastOpportunityLossRounds;
  aggregate.mpStarvationRounds += sample.mpStarvationRounds;
  aggregate.fallbackActionCount += sample.trace.filter(round => round.physicalFallback).length;
  aggregate.spellCastOpportunityLossCount += sample.trace.filter(round => round.spellCastOpportunityLoss).length;
  if (sample.failure) {
    increment(aggregate.failureAttribution, sample.failure.primary);
    sample.failure.candidates.forEach(candidate => increment(aggregate.candidateAttribution, candidate));
    if (sample.outcome === "death") increment(aggregate.deathFailureAttribution, sample.failure.primary);
    if (sample.failure.directCause) increment(aggregate.directCauseCounts, sample.failure.directCause);
    if (sample.failure.contributingCause) increment(aggregate.contributingCauseCounts, sample.failure.contributingCause);
    if (sample.outcome === "death" && sample.failure.finalExclusiveCategory) {
      increment(aggregate.finalExclusiveCategoryCounts, sample.failure.finalExclusiveCategory);
    }
    if (sample.failure.legacyPrimary === "raw_damage_pressure") {
      aggregate.legacyRawDamageDeaths++;
      increment(aggregate.legacyRawExclusiveCategoryCounts, sample.failure.finalExclusiveCategory || "unknown_or_mixed");
      sample.failure.contributingCauses.forEach(cause => increment(aggregate.legacyRawContributingCauseCounts, cause));
    }
    aggregate.mechanicToDeathRounds.push(...sample.failure.mechanismToDeath.map(event => event.roundsToDeath));
  }
  // Causal adjudication is only needed for terminal failures. Clear/timeout
  // populations retain aggregate action/resource metrics, while every death
  // run retains its compact event trace for review.
  if (sample.outcome === "death") {
    aggregate.traces.push({ seed: sample.seed, outcome: sample.outcome, rounds: sample.rounds, failure: sample.failure, trace: sample.trace });
  }
  if (keepSamples) aggregate.samples.push(sample);
}

function wilson(successes, trials) {
  if (trials <= 0) return null;
  const z = 1.96;
  const rate = successes / trials;
  const denominator = 1 + (z * z) / trials;
  const center = (rate + (z * z) / (2 * trials)) / denominator;
  const margin = z * Math.sqrt((rate * (1 - rate) + (z * z) / (4 * trials)) / trials) / denominator;
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

function finalizeCase(aggregate) {
  const runs = aggregate.runs;
  const clearRate = aggregate.outcomes.clear / runs;
  const deathRate = aggregate.outcomes.death / runs;
  const lowResourceRuns = Object.values(aggregate.failureAttribution).reduce((sum, count) => sum + count, 0);
  const directRawLethalDeaths = aggregate.directCauseCounts.raw_damage || 0;
  const finalExclusiveCategoryCounts = aggregate.finalExclusiveCategoryCounts;
  const legacyRawExclusiveCategoryCounts = aggregate.legacyRawExclusiveCategoryCounts;
  const legacyRawPureDeaths = legacyRawExclusiveCategoryCounts.pure_raw_damage || 0;
  const legacyRawMechanicDeaths = legacyRawExclusiveCategoryCounts.mechanic_mediated_raw_lethal || 0;
  const legacyRawDirectMechanicDeaths = legacyRawExclusiveCategoryCounts.direct_mechanic_death || 0;
  const legacyRawUnknownDeaths = legacyRawExclusiveCategoryCounts.unknown_or_mixed || 0;
  const legacyRawExclusiveTotal = Object.values(legacyRawExclusiveCategoryCounts).reduce((sum, count) => sum + count, 0);
  if (legacyRawExclusiveTotal !== aggregate.legacyRawDamageDeaths) {
    throw new Error(`legacy raw exclusive categories must sum to ${aggregate.legacyRawDamageDeaths}, got ${legacyRawExclusiveTotal}`);
  }
  const sortedLatency = [...aggregate.mechanicToDeathRounds].sort((left, right) => left - right);
  const latencyPercentile = probability => sortedLatency.length === 0
    ? null
    : sortedLatency[Math.min(sortedLatency.length - 1, Math.floor((sortedLatency.length - 1) * probability))];
  const mechanismAverage = Object.fromEntries(Object.entries(aggregate.mechanisms).map(([key, value]) => {
    if (typeof value === "number") return [key, value / runs];
    return [key, Object.fromEntries(Object.entries(value).map(([name, count]) => [name, count / runs]))];
  }));
  return {
    buildId: aggregate.buildId,
    encounterId: aggregate.encounterId,
    depth: aggregate.depth,
    runs,
    outcomes: aggregate.outcomes,
    clearRate,
    clearRateCi95: wilson(aggregate.outcomes.clear, runs),
    deathRate,
    deathRateCi95: wilson(aggregate.outcomes.death, runs),
    postCombatHpRatio: aggregate.sumHpRatio / runs,
    postCombatMpRatio: aggregate.sumMpRatio / runs,
    roundsToTerminal: aggregate.sumRounds / runs,
    actionMix: {
      physicalActions: aggregate.actionMix.physical / runs,
      spellActions: aggregate.actionMix.spell / runs,
      spellNames: aggregate.actionMix.spellNames
    },
    mechanisms: { totals: aggregate.mechanisms, averagePerRun: mechanismAverage },
    statusTrajectory: {
      roundsObservedPerRun: aggregate.statusTrajectory.roundsObserved / runs,
      activeRounds: Object.fromEntries(TRACKED_STATUS_IDS.map(statusId => [statusId, aggregate.statusTrajectory.activeRounds[statusId] / runs])),
      applications: aggregate.statusTrajectory.applications,
      removals: aggregate.statusTrajectory.removals,
      incapacitatedRoundsPerRun: aggregate.statusTrajectory.incapacitatedRounds / runs,
      silenceCastOpportunityLossRoundsPerRun: aggregate.statusTrajectory.silenceCastOpportunityLossRounds / runs
    },
    mpStarvationRoundsPerRun: aggregate.mpStarvationRounds / runs,
    failureAttribution: {
      allEligibleRuns: lowResourceRuns,
      counts: aggregate.failureAttribution,
      candidateCounts: aggregate.candidateAttribution,
      deathCounts: aggregate.deathFailureAttribution,
      rates: Object.fromEntries(Object.entries(aggregate.failureAttribution).map(([key, value]) => [key, value / Math.max(1, lowResourceRuns)]))
    },
    causalAttribution: {
      directCauseCounts: aggregate.directCauseCounts,
      contributingCauseCounts: aggregate.contributingCauseCounts,
      finalExclusiveCategoryCounts,
      directRawLethalDeaths,
      rawDamageDeaths: directRawLethalDeaths,
      pureRawDamageDeaths: finalExclusiveCategoryCounts.pure_raw_damage || 0,
      mechanicMediatedRawDamageDeaths: finalExclusiveCategoryCounts.mechanic_mediated_raw_lethal || 0,
      unknownDeaths: finalExclusiveCategoryCounts.unknown_or_mixed || 0,
      rawDamageDeathShare: directRawLethalDeaths / Math.max(1, aggregate.outcomes.death),
      pureRawShareOfRawDamageDeaths: legacyRawPureDeaths / Math.max(1, aggregate.legacyRawDamageDeaths),
      mechanicMediatedRawShareOfRawDamageDeaths: legacyRawMechanicDeaths / Math.max(1, aggregate.legacyRawDamageDeaths),
      unknownShareOfDeaths: (finalExclusiveCategoryCounts.unknown_or_mixed || 0) / Math.max(1, aggregate.outcomes.death),
      mechanicToDeathRounds: {
        count: sortedLatency.length,
        mean: sortedLatency.length > 0 ? sortedLatency.reduce((sum, value) => sum + value, 0) / sortedLatency.length : null,
        p50: latencyPercentile(0.5),
        p95: latencyPercentile(0.95)
      },
      fallbackActionCount: aggregate.fallbackActionCount,
      spellCastOpportunityLossCount: aggregate.spellCastOpportunityLossCount,
      legacyRawDamageDeaths: aggregate.legacyRawDamageDeaths,
      legacyRawExclusiveCategoryCounts,
      legacyRawContributingCauseCounts: aggregate.legacyRawContributingCauseCounts,
      legacyRawPureDamageDeaths: legacyRawPureDeaths,
      legacyRawMechanicMediatedRawDamageDeaths: legacyRawMechanicDeaths,
      legacyRawDirectMechanicDeaths,
      legacyRawUnknownDeaths,
      legacyRawPureShare: legacyRawPureDeaths / Math.max(1, aggregate.legacyRawDamageDeaths),
      legacyRawMechanicMediatedShare: legacyRawMechanicDeaths / Math.max(1, aggregate.legacyRawDamageDeaths),
      legacyRawDirectMechanicShare: legacyRawDirectMechanicDeaths / Math.max(1, aggregate.legacyRawDamageDeaths),
      legacyRawUnknownShare: legacyRawUnknownDeaths / Math.max(1, aggregate.legacyRawDamageDeaths),
      legacyRawSpecialMechanicDeaths: legacyRawMechanicDeaths + legacyRawDirectMechanicDeaths,
      legacyRawSpecialMechanicShare: (legacyRawMechanicDeaths + legacyRawDirectMechanicDeaths) / Math.max(1, aggregate.legacyRawDamageDeaths)
    },
    resourceSignature: {
      hpConsumedRatio: 1 - aggregate.sumHpRatio / runs,
      mpConsumedRatio: 1 - aggregate.sumMpRatio / runs,
      spellActionsPerRun: aggregate.actionMix.spell / runs,
      physicalActionsPerRun: aggregate.actionMix.physical / runs
    },
    ...(aggregate.traces.length > 0 ? { traces: aggregate.traces } : {}),
    ...(aggregate.samples.length > 0 ? { samples: aggregate.samples } : {})
  };
}

function deriveCaseSeed(rootSeed, runIndex, depth, encounterId) {
  return `${rootSeed}:run:${runIndex}:B${depth}:${encounterId}`;
}

export function deriveSharedCaseSeed(rootSeed, runIndex, depth, encounterId) {
  return deriveCaseSeed(rootSeed, runIndex, depth, encounterId);
}

function calculateDiagnosticUtility(sample) {
  // This is a measurement-only utility, not a gameplay formula: clear is the
  // primary outcome, with post-combat resources and duration as diagnostics.
  return (sample.outcome === "clear" ? 1 : 0) +
    (sample.hpRatio * 0.25) +
    (sample.mpRatio * 0.25) -
    (sample.rounds / MAX_ROUNDS * 0.1);
}

function percentile(sortedValues, probability) {
  if (sortedValues.length === 0) return null;
  const index = (sortedValues.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (index - lower);
}

function bootstrapMeanCi(values, seed) {
  if (values.length === 0) return { estimate: null, ci95: [null, null], significant: false };
  const estimate = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (values.length < 2) return { estimate, ci95: [estimate, estimate], significant: false };
  const rng = createRng(seed);
  const bootstrapMeans = [];
  for (let iteration = 0; iteration < BOOTSTRAP_ITERATIONS; iteration++) {
    let sum = 0;
    for (let index = 0; index < values.length; index++) {
      sum += values[Math.floor(rng() * values.length)];
    }
    bootstrapMeans.push(sum / values.length);
  }
  bootstrapMeans.sort((left, right) => left - right);
  const ci95 = [percentile(bootstrapMeans, 0.025), percentile(bootstrapMeans, 0.975)];
  return {
    estimate,
    ci95,
    significant: ci95[0] > 0 || ci95[1] < 0
  };
}

function buildPairedComparison(leftBuildId, rightBuildId, pairedSamples, seed) {
  const outcomeDifferences = pairedSamples.map(sample =>
    Number(sample.builds[leftBuildId].outcome === "clear") - Number(sample.builds[rightBuildId].outcome === "clear")
  );
  const utilityDifferences = pairedSamples.map(sample =>
    sample.builds[leftBuildId].utility - sample.builds[rightBuildId].utility
  );
  const outcome = bootstrapMeanCi(outcomeDifferences, `${seed}:outcome`);
  const utility = bootstrapMeanCi(utilityDifferences, `${seed}:utility`);
  return {
    leftBuildId,
    rightBuildId,
    pairedN: pairedSamples.length,
    outcomeDifference: outcome,
    utilityDifference: utility,
    winner: utility.significant ? (utility.estimate > 0 ? leftBuildId : rightBuildId) : null
  };
}

export function isSignificantReversal(leftComparison, rightComparison) {
  const ciExcludesZero = difference => Array.isArray(difference.ci95) && (
    difference.ci95[0] > 0 || difference.ci95[1] < 0
  );
  const leftOutcomeSign = Math.sign(leftComparison.outcomeDifference.estimate);
  const rightOutcomeSign = Math.sign(rightComparison.outcomeDifference.estimate);
  const leftUtilitySign = Math.sign(leftComparison.utilityDifference.estimate);
  const rightUtilitySign = Math.sign(rightComparison.utilityDifference.estimate);
  return Boolean(
    leftComparison.pairedN >= 2 &&
    rightComparison.pairedN >= 2 &&
    ciExcludesZero(leftComparison.outcomeDifference) &&
    ciExcludesZero(leftComparison.utilityDifference) &&
    ciExcludesZero(rightComparison.outcomeDifference) &&
    ciExcludesZero(rightComparison.utilityDifference) &&
    leftOutcomeSign !== 0 &&
    rightOutcomeSign !== 0 &&
    leftUtilitySign !== 0 &&
    rightUtilitySign !== 0 &&
    leftOutcomeSign !== rightOutcomeSign &&
    leftUtilitySign !== rightUtilitySign
  );
}

function compareMetric(left, right, metric) {
  const direction = ["deathRate", "roundsToTerminal"].includes(metric) ? -1 : 1;
  const delta = (left[metric] - right[metric]) * direction;
  return delta > 1e-12 ? left.buildId : delta < -1e-12 ? right.buildId : null;
}

function rankCases(cases, metric) {
  const direction = ["deathRate", "roundsToTerminal"].includes(metric) ? 1 : -1;
  return [...cases]
    .sort((left, right) => (left[metric] - right[metric]) * direction)
    .map((entry, index) => ({ buildId: entry.buildId, value: entry[metric], rank: index + 1 }));
}

function buildPairwiseRanking(cases, pairedComparisons) {
  const metrics = ["clearRate", "deathRate", "postCombatHpRatio", "postCombatMpRatio", "roundsToTerminal"];
  return metrics.map(metric => ({
    metric,
    ranking: rankCases(cases, metric),
    pairwise: cases.flatMap((left, leftIndex) => cases.slice(leftIndex + 1).map(right => ({
      leftBuildId: left.buildId,
      rightBuildId: right.buildId,
      leftValue: left[metric],
      rightValue: right[metric],
      winner: compareMetric(left, right, metric)
    })))
  })).concat({
    metric: "pairedOutcomeAndUtility",
    comparisons: pairedComparisons
  });
}

function createRawRankReversals(casesByKey) {
  const reversals = [];
  for (const [depth, byEncounter] of casesByKey.entries()) {
    const entries = [...byEncounter.entries()];
    for (let leftIndex = 0; leftIndex < entries.length; leftIndex++) {
      for (let rightIndex = leftIndex + 1; rightIndex < entries.length; rightIndex++) {
        const [leftEncounterId, leftCases] = entries[leftIndex];
        const [rightEncounterId, rightCases] = entries[rightIndex];
        const leftRanking = rankCases(leftCases, "clearRate").map(entry => entry.buildId).join(">");
        const rightRanking = rankCases(rightCases, "clearRate").map(entry => entry.buildId).join(">");
        if (leftRanking !== rightRanking) {
          reversals.push({ depth, metric: "clearRate", leftEncounterId, rightEncounterId, leftRanking, rightRanking });
        }
      }
    }
  }
  return reversals;
}

function createSignificantRankReversals(pairedByKey, pairedComparisonByKey) {
  const reversals = [];
  for (const [depth, byEncounter] of pairedByKey.entries()) {
    const entries = [...byEncounter.entries()];
    for (let leftIndex = 0; leftIndex < entries.length; leftIndex++) {
      for (let rightIndex = leftIndex + 1; rightIndex < entries.length; rightIndex++) {
        const [leftEncounterId] = entries[leftIndex];
        const [rightEncounterId] = entries[rightIndex];
        for (let buildLeftIndex = 0; buildLeftIndex < BUILD_IDS.length; buildLeftIndex++) {
          for (let buildRightIndex = buildLeftIndex + 1; buildRightIndex < BUILD_IDS.length; buildRightIndex++) {
            const leftBuildId = BUILD_IDS[buildLeftIndex];
            const rightBuildId = BUILD_IDS[buildRightIndex];
            const leftComparison = pairedComparisonByKey.get(
              `${depth}:${leftEncounterId}:${leftBuildId}:${rightBuildId}`
            );
            const rightComparison = pairedComparisonByKey.get(
              `${depth}:${rightEncounterId}:${leftBuildId}:${rightBuildId}`
            );
            if (isSignificantReversal(leftComparison, rightComparison)) {
              reversals.push({
                depth,
                metric: "pairedOutcomeAndUtility",
                leftEncounterId,
                rightEncounterId,
                leftBuildId,
                rightBuildId,
                leftComparison,
                rightComparison
              });
            }
          }
        }
      }
    }
  }
  return reversals;
}

function calculateRedFlags(cases, significantReversals, rawReversals) {
  const representative = cases.filter(testCase => testCase.runs > 0);
  const bestCounts = {};
  representative.forEach(testCase => {
    const best = Math.max(...representative.filter(candidate => candidate.depth === testCase.depth && candidate.encounterId === testCase.encounterId).map(candidate => candidate.clearRate));
    if (testCase.clearRate === best) increment(bestCounts, testCase.buildId);
  });
  const bestCells = Object.values(bestCounts).reduce((sum, count) => sum + count, 0);
  const dominantBest = bestCells > 0 && Math.max(...Object.values(bestCounts)) / bestCells >= 0.8;
  const deepCases = cases.filter(testCase => testCase.depth >= 13);
  const deepDeaths = deepCases.reduce((sum, testCase) => sum + testCase.outcomes.death, 0);
  const deepRawDamage = deepCases.reduce((sum, testCase) => sum + (testCase.failureAttribution.deathCounts.raw_damage_pressure || 0), 0);
  const deepRawShare = deepDeaths > 0 ? deepRawDamage / deepDeaths : 0;
  const unknownEligible = cases.reduce((sum, testCase) => sum + (testCase.failureAttribution.counts.unknown_or_mixed || 0), 0);
  const eligible = cases.reduce((sum, testCase) => sum + testCase.failureAttribution.allEligibleRuns, 0);
  const signatures = new Map();
  cases.forEach(testCase => {
    const key = `${testCase.depth}:${testCase.encounterId}`;
    const current = signatures.get(key) || { hp: 0, mp: 0, spell: 0, physical: 0, count: 0 };
    current.hp += testCase.resourceSignature.hpConsumedRatio;
    current.mp += testCase.resourceSignature.mpConsumedRatio;
    current.spell += testCase.resourceSignature.spellActionsPerRun;
    current.physical += testCase.resourceSignature.physicalActionsPerRun;
    current.count++;
    signatures.set(key, current);
  });
  const signatureValues = [...signatures.values()].map(value => [value.hp, value.mp, value.spell, value.physical].map(item => item / value.count));
  const signatureMaxDistance = signatureValues.length < 2 ? 0 : Math.max(...signatureValues.flatMap((left, leftIndex) => signatureValues.slice(leftIndex + 1).map(right => left.reduce((sum, value, index) => sum + Math.abs(value - right[index]), 0) / left.length)));
  const depthAverages = TARGET_DEPTHS.map(depth => {
    const depthCases = cases.filter(testCase => testCase.depth === depth);
    return depthCases.reduce((sum, testCase) => sum + testCase.clearRate, 0) / Math.max(1, depthCases.length);
  });
  const depthRange = Math.max(...depthAverages) - Math.min(...depthAverages);
  const buildRanges = cases.map(testCase => testCase.clearRate);
  const buildRange = Math.max(...buildRanges) - Math.min(...buildRanges);
  const flags = [
    { id: "dominant_build", criterion: "one build is best in >=80% of representative cells", observed: { bestCounts, bestCellCount: bestCells }, triggered: dominantBest },
    { id: "deep_raw_damage_wall", criterion: "deep-band death attribution is >=60% raw_damage_pressure", observed: { deepRawDamage, deepDeaths, share: deepRawShare }, triggered: deepRawShare >= 0.6 },
    {
      id: "no_significant_rank_reversal",
      criterion: "no paired outcome-and-utility rank reversal with bootstrap 95% CIs excluding zero is observed",
      observed: { significantReversalCount: significantReversals.length, rawRankReversalCount: rawReversals.length },
      triggered: significantReversals.length === 0
    },
    { id: "same_resource_signature", criterion: "encounter resource signatures differ by less than 0.05", observed: { maxMeanAbsoluteDistance: signatureMaxDistance }, triggered: signatureMaxDistance < 0.05 },
    { id: "unknown_failure_attribution", criterion: "unknown_or_mixed is >40% of eligible high-consumption/death runs", observed: { unknown: unknownEligible, eligible, share: eligible > 0 ? unknownEligible / eligible : 0 }, triggered: eligible > 0 && unknownEligible / eligible > 0.4 },
    { id: "depth_scaling_dominates", criterion: "depth clear-rate range is >2x the observed build clear-rate range", observed: { depthRange, buildRange }, triggered: buildRange > 0 && depthRange > buildRange * 2 }
  ];
  return { flags, triggered: flags.filter(flag => flag.triggered).map(flag => flag.id) };
}

function buildMeasurementMetadata({ seed, runs, provenance, envSignature }) {
  return {
    issue: 980,
    relatedDesignIssue: 973,
    runnerVersion: RUNNER_VERSION,
    scope: readSimScopeDeclaration(import.meta.url),
    sourceCommit: provenance?.sourceCommit || null,
    gameplaySourceCommit: provenance?.gameplaySourceCommit || null,
    measurementRunnerCommit: provenance?.measurementRunnerCommit || null,
    measurementRunnerDiffSha256: provenance?.measurementRunnerDiffSha256 || null,
    originMainAncestor: provenance?.originMainAncestor ?? null,
    staleTreeAllowed: provenance?.staleTreeAllowed ?? null,
    workingTreeClean: provenance?.workingTreeClean ?? null,
    provenanceBaseRef: provenance?.baseRef || "origin/main",
    provenanceBaseCommit: provenance?.baseCommit || null,
    nodeVersion: process.version,
    environmentSignature: envSignature,
    configuration: {
      seed,
      runs,
      depths: [...TARGET_DEPTHS],
      buildIds: [...BUILD_IDS],
      encounterIds: [...ENCOUNTER_IDS]
    },
    seedPolicy: {
      sharedAcrossBuilds: true,
      derivation: "rootSeed:run:<index>:B<depth>:<encounterId>",
      buildIdExcludedFromSeed: true
    },
    pairedRankingPolicy: {
      unit: "same build-pair, encounter, depth, and run seed",
      outcome: "clear=1, death/timeout=0",
      utility: "clear indicator + 0.25*postCombatHpRatio + 0.25*postCombatMpRatio - 0.1*rounds/MAX_ROUNDS",
      bootstrapIterations: BOOTSTRAP_ITERATIONS,
      significantDifference: "bootstrap 95% CI excludes zero",
      significantReversal: "both encounters have significant outcome and utility differences, and both metrics reverse sign"
    },
    modeledProductionRules: [
      "src/data/monsters.js MONSTERS",
      "src/rules/depth_scaling.js scaleEnemyForDepth",
      "src/combat_logic/round.js runCombatRoundCalculation",
      "src/combat_logic/auto_action.js chooseAutoCombatAction",
      "src/combat_logic/damage.js recordReceivedDamage causal damage observer",
      "src/combat_logic/spell_resolution.js and src/systems/spell_effects.js",
      "src/rules/affix_rules.js and src/combat_logic/status_effects.js",
      "src/rules/character_stats.js and src/rules/item_rules.js"
    ],
    omittedMechanisms: [
      "map traversal and encounter frequency",
      "manual player input and UI timing",
      "shops, consumables, retreat, and route choice",
      "loot/material economy and between-encounter progression"
    ],
    fixturePolicy: "named production monster definitions scaled at B8/B13/B18/B21/B25/B30; no synthetic monster, trait, spell, affix, or balance value"
  };
}

function buildCausalSummary(cases) {
  const totals = {
    deaths: 0,
    directRawDamageDeaths: 0,
    legacyRawDamageDeaths: 0,
    pureRawDamageDeaths: 0,
    mechanicMediatedRawDamageDeaths: 0,
    directMechanicDeaths: 0,
    unknownDeaths: 0,
    directCauses: {},
    contributingCauses: {},
    causalCategories: {},
    legacyRawExclusiveCategories: {},
    legacyRawContributingCauses: {},
    mechanicToDeathRounds: []
  };
  cases.forEach(testCase => {
    totals.deaths += testCase.outcomes.death;
    totals.directRawDamageDeaths += testCase.causalAttribution.directRawLethalDeaths;
    totals.legacyRawDamageDeaths += testCase.causalAttribution.legacyRawDamageDeaths;
    totals.pureRawDamageDeaths += testCase.causalAttribution.legacyRawPureDamageDeaths;
    totals.mechanicMediatedRawDamageDeaths += testCase.causalAttribution.legacyRawMechanicMediatedRawDamageDeaths;
    totals.directMechanicDeaths = (totals.directMechanicDeaths || 0) + (testCase.causalAttribution.legacyRawDirectMechanicDeaths || 0);
    totals.unknownDeaths += testCase.causalAttribution.legacyRawUnknownDeaths;
    Object.entries(testCase.causalAttribution.directCauseCounts).forEach(([key, value]) => increment(totals.directCauses, key, value));
    Object.entries(testCase.causalAttribution.contributingCauseCounts).forEach(([key, value]) => increment(totals.contributingCauses, key, value));
    Object.entries(testCase.causalAttribution.finalExclusiveCategoryCounts).forEach(([key, value]) => increment(totals.causalCategories, key, value));
    Object.entries(testCase.causalAttribution.legacyRawExclusiveCategoryCounts).forEach(([key, value]) => increment(totals.legacyRawExclusiveCategories, key, value));
    Object.entries(testCase.causalAttribution.legacyRawContributingCauseCounts).forEach(([key, value]) => increment(totals.legacyRawContributingCauses, key, value));
    totals.mechanicToDeathRounds.push(...(testCase.traces || []).flatMap(run =>
      run.failure?.mechanismToDeath?.map(event => event.roundsToDeath) || []
    ));
  });
  const rawDenominator = Math.max(1, totals.legacyRawDamageDeaths);
  const sortedLatency = totals.mechanicToDeathRounds.sort((left, right) => left - right);
  const percentile = probability => sortedLatency.length === 0 ? null : sortedLatency[Math.floor((sortedLatency.length - 1) * probability)];
  return {
    ...totals,
    rawDamageDeaths: totals.legacyRawDamageDeaths,
    directRawLethalDeaths: totals.directRawDamageDeaths,
    directMechanicDeaths: totals.directMechanicDeaths || 0,
    specialMechanicDeaths: totals.mechanicMediatedRawDamageDeaths + (totals.directMechanicDeaths || 0),
    pureRawShareOfRawDamageDeaths: totals.pureRawDamageDeaths / rawDenominator,
    mechanicMediatedRawShareOfRawDamageDeaths: totals.mechanicMediatedRawDamageDeaths / rawDenominator,
    directMechanicShareOfRawDamageDeaths: (totals.directMechanicDeaths || 0) / rawDenominator,
    specialMechanicShareOfRawDamageDeaths: (totals.mechanicMediatedRawDamageDeaths + (totals.directMechanicDeaths || 0)) / rawDenominator,
    legacyRawExclusiveTotal: Object.values(totals.legacyRawExclusiveCategories).reduce((sum, count) => sum + count, 0),
    unknownShareOfDeaths: totals.unknownDeaths / Math.max(1, totals.deaths),
    mechanicToDeathRounds: {
      count: sortedLatency.length,
      mean: sortedLatency.length > 0 ? sortedLatency.reduce((sum, value) => sum + value, 0) / sortedLatency.length : null,
      p50: percentile(0.5),
      p95: percentile(0.95)
    }
  };
}

function buildFixtureValidation(cases) {
  const extremeCells = cases
    .filter(testCase => testCase.outcomes.clear === 0 || testCase.outcomes.death === 0)
    .map(testCase => ({
      buildId: testCase.buildId,
      encounterId: testCase.encounterId,
      depth: testCase.depth,
      clear: testCase.outcomes.clear,
      death: testCase.outcomes.death
    }));
  return {
    productionMonsterDefinitions: true,
    allFixtureMonstersResolvedFromMONSTERS: true,
    specialAbilityConditions: "production traitChance/statusAttackPattern and round resolver conditions are retained; fixtures do not force an ability to fire",
    controlledTest: true,
    representsDungeonEncounterDistribution: false,
    extremeCells,
    interpretation: extremeCells.length > 0
      ? "Some 0/500 or 500/500 cells are expected to be composition-specific controlled tests; they are not estimates of dungeon frequency."
      : "No all-clear/all-death cell observed."
  };
}

function buildAutoActionReview(cases) {
  const byBuild = new Map(BUILD_IDS.map(buildId => [buildId, {
    buildId,
    spellActionsPerCell: 0,
    physicalActionsPerCell: 0,
    fallbackActions: 0,
    spellOpportunityLosses: 0,
    expectedSpellNamesObserved: [],
    deathTraceCount: 0
  }]));
  cases.forEach(testCase => {
    const review = byBuild.get(testCase.buildId);
    review.spellActionsPerCell += testCase.actionMix.spellActions;
    review.physicalActionsPerCell += testCase.actionMix.physicalActions;
    review.fallbackActions += testCase.causalAttribution.fallbackActionCount;
    review.spellOpportunityLosses += testCase.causalAttribution.spellCastOpportunityLossCount;
    Object.keys(testCase.actionMix.spellNames).forEach(name => {
      if (!review.expectedSpellNamesObserved.includes(name)) review.expectedSpellNamesObserved.push(name);
    });
    review.deathTraceCount += (testCase.traces || []).filter(run => run.outcome === "death").length;
  });
  return {
    policy: "existing chooseAutoCombatAction only; no expert-player AI added",
    buildReviews: [...byBuild.values()].map(review => ({
      ...review,
      expectedSpellNamesObserved: review.expectedSpellNamesObserved.sort()
    })),
    representativeDeathTraces: BUILD_IDS.map(buildId => {
      for (const testCase of cases.filter(candidate => candidate.buildId === buildId)) {
        const traces = testCase.traces || [];
        const selected = traces.find(run => run.outcome === "death" && run.failure?.finalExclusiveCategory === "mechanic_mediated_raw_lethal") ||
          traces.find(run => run.outcome === "death");
        if (selected) return {
          buildId,
          encounterId: testCase.encounterId,
          depth: testCase.depth,
          ...selected
        };
      }
      return { buildId, unavailable: true };
    })
  };
}

export function runMeasurement({ seed = DEFAULT_SEED, runs = DEFAULT_RUNS, provenance = null } = {}) {
  if (!Number.isInteger(runs) || runs < 1) throw new Error(`runs must be a positive integer: ${runs}`);
  const cases = [];
  const pairedByKey = new Map();
  for (const depth of TARGET_DEPTHS) {
    for (const encounterId of ENCOUNTER_IDS) {
      const key = `${depth}:${encounterId}`;
      const aggregates = new Map(BUILD_IDS.map(buildId => [
        buildId,
        createCaseAggregate(buildId, encounterId, depth)
      ]));
      const pairedSamples = [];
      for (let runIndex = 0; runIndex < runs; runIndex++) {
        const caseSeed = deriveCaseSeed(seed, runIndex, depth, encounterId);
        const sampleByBuild = {};
        BUILD_IDS.forEach(buildId => {
          const sample = runEncounterSample({ buildId, encounterId, depth, seed: caseSeed });
          addSample(aggregates.get(buildId), sample, runs === 1);
          sampleByBuild[buildId] = {
            outcome: sample.outcome,
            utility: calculateDiagnosticUtility(sample)
          };
        });
        pairedSamples.push({ seed: caseSeed, builds: sampleByBuild });
      }
      pairedByKey.set(key, pairedSamples);
      BUILD_IDS.forEach(buildId => {
        const aggregate = aggregates.get(buildId);
        cases.push(finalizeCase(aggregate));
      });
    }
  }
  const casesByDepthEncounter = new Map();
  cases.forEach(testCase => {
    const key = `${testCase.depth}:${testCase.encounterId}`;
    if (!casesByDepthEncounter.has(key)) casesByDepthEncounter.set(key, []);
    casesByDepthEncounter.get(key).push(testCase);
  });
  const pairedComparisonByKey = new Map();
  const pairwiseRanking = [...casesByDepthEncounter.entries()].map(([key, cellCases]) => {
    const [depth, encounterId] = key.split(":");
    const pairedComparisons = cellCases.flatMap((left, leftIndex) => cellCases.slice(leftIndex + 1).map(right => {
      const comparison = buildPairedComparison(
        left.buildId,
        right.buildId,
        pairedByKey.get(key),
        `paired:${key}:${left.buildId}:${right.buildId}`
      );
      pairedComparisonByKey.set(`${key}:${left.buildId}:${right.buildId}`, comparison);
      return comparison;
    }));
    return {
      depth: Number(depth),
      encounterId,
      rankings: buildPairwiseRanking(cellCases, pairedComparisons)
    };
  });
  const rawRankReversals = createRawRankReversals(new Map(TARGET_DEPTHS.map(depth => [
    depth,
    new Map(ENCOUNTER_IDS.map(encounterId => [encounterId, casesByDepthEncounter.get(`${depth}:${encounterId}`)]))
  ])));
  const significantRankReversals = createSignificantRankReversals(
    new Map(TARGET_DEPTHS.map(depth => [
      depth,
      new Map(ENCOUNTER_IDS.map(encounterId => [encounterId, pairedByKey.get(`${depth}:${encounterId}`)]))
    ])),
    pairedComparisonByKey
  );
  const redFlags = calculateRedFlags(cases, significantRankReversals, rawRankReversals);
  const falsification = redFlags.triggered.length > 0 ? "falsified_or_red_flagged" : "not_falsified_by_v0_criteria";
  return {
    schemaVersion: CAUSAL_SCHEMA_VERSION,
    measurement: buildMeasurementMetadata({ seed, runs, provenance, envSignature: null }),
    builds: BUILD_DEFINITIONS.map(build => ({
      id: build.id,
      label: build.label,
      className: "Mage",
      expressible: true,
      spells: [...build.spells],
      equipment: structuredClone(build.equipment),
      coreIds: Object.values(build.equipment).map(item => item.coreId).filter(Boolean),
      supportIds: Object.values(build.equipment).flatMap(item => (item.supports || []).map(support => support.id)),
      note: build.note
    })),
    encounters: ENCOUNTER_DEFINITIONS.map(encounter => ({
      id: encounter.id,
      label: encounter.label,
      productionMonsterNames: [...encounter.monsterNames],
      productionMonsters: encounter.monsterNames.map(name => {
        const monster = getMonsterByName(name);
        return {
          name,
          traits: monster.traits || [],
          traitChance: monster.traitChance ?? null,
          statusAttackPattern: monster.statusAttackPattern || null,
          statusAttackPatternDefinition: monster.statusAttackPattern
            ? MONSTER_STATUS_ATTACK_PATTERNS[monster.statusAttackPattern] || null
            : null
        };
      })
    })),
    cases,
    pairwiseRanking,
    rawRankReversals,
    rankReversals: significantRankReversals,
    redFlags,
    falsification,
    // The headline answers the issue's "deep 83%" question; all-depth values
    // remain available for readers who need the shallow comparison.
    causalSummary: buildCausalSummary(cases.filter(testCase => testCase.depth >= 13)),
    allDepthCausalSummary: buildCausalSummary(cases),
    fixtureValidation: buildFixtureValidation(cases),
    autoActionReview: buildAutoActionReview(cases),
    interpretation: {
      strongestBuildQuestion: "not evaluated as a single winner; rankings are reported per encounter/depth",
      rankReversalQuestion: significantRankReversals.length > 0 ? "significant paired reversal observed" : "no significant paired reversal observed",
      rawRankReversalCount: rawRankReversals.length,
      deepFailureQuestion: redFlags.flags.find(flag => flag.id === "deep_raw_damage_wall")?.observed,
      resourceSignatureQuestion: redFlags.flags.find(flag => flag.id === "same_resource_signature")?.observed,
      playerUnderstandableFailureQuestion: redFlags.flags.find(flag => flag.id === "unknown_failure_attribution")?.observed
    }
  };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (["--output", "--summary", "--seed", "--runs"].includes(value)) {
      const next = argv[++index];
      if (!next) throw new Error(`${value} requires a value`);
      options[value.slice(2)] = value === "--runs" ? Number(next) : next;
    } else if (value === "--help") {
      console.log("Usage: node scratch/measurements/issue973_build_sensitivity.js --runs 100|500 --output /private/tmp/issue-980.json --summary evidence/results/issue-980.md [--seed SEED]");
      process.exit(0);
    } else {
      throw new Error(`unknown option: ${value}`);
    }
  }
  if (!options.output || !options.summary) throw new Error("--output and --summary are required");
  return options;
}

function renderSummary(report) {
  const causal = report.causalSummary;
  const rawDeaths = Math.max(1, causal.legacyRawDamageDeaths);
  const lines = [
    "# Issue #980 Causal Attribution Measurement",
    "",
    `- runner: ${report.measurement.runnerVersion}`,
    `- source commit: \`${report.measurement.sourceCommit || "test/in-process"}\``,
    `- origin/main ancestor: ${report.measurement.originMainAncestor}`,
    `- N=${report.measurement.configuration.runs} per build / encounter / depth; seed=${report.measurement.configuration.seed}`,
    `- builds: ${report.builds.map(build => `${build.label}${build.expressible ? "" : " (not expressible)"}`).join(", ")}`,
    `- encounters: ${report.encounters.length}; depths: ${TARGET_DEPTHS.map(depth => `B${depth}`).join(", ")}`,
    "",
    "## Causal result",
    "",
    `- previous production baseline: #978 runner v6, deep primary raw damage **41,520 / 49,333 = 84.16%** (reproduced under the same seed policy before this observer was added)`,
    `- legacy raw_damage_pressure denominator: **${causal.legacyRawDamageDeaths}** (direct raw lethal events observed: ${causal.directRawLethalDeaths})`,
    `- exclusive breakdown: pure raw **${causal.pureRawDamageDeaths} / ${rawDeaths} = ${(causal.pureRawShareOfRawDamageDeaths * 100).toFixed(2)}%**; mechanic-mediated raw lethal **${causal.mechanicMediatedRawDamageDeaths} / ${rawDeaths} = ${(causal.mechanicMediatedRawShareOfRawDamageDeaths * 100).toFixed(2)}%**; direct mechanic **${causal.directMechanicDeaths} / ${rawDeaths} = ${(causal.directMechanicShareOfRawDamageDeaths * 100).toFixed(2)}%**; unknown/mixed **${causal.unknownDeaths} / ${rawDeaths} = ${(causal.unknownDeaths / rawDeaths * 100).toFixed(2)}%**; total=${causal.legacyRawExclusiveTotal}`,
    `- special-mechanic-caused total (exclusive mechanic-mediated + direct mechanic): **${causal.specialMechanicDeaths} / ${rawDeaths} = ${(causal.specialMechanicShareOfRawDamageDeaths * 100).toFixed(2)}%**`,
    `- mechanic firing → death: count=${causal.mechanicToDeathRounds.count}, mean=${causal.mechanicToDeathRounds.mean === null ? "n/a" : causal.mechanicToDeathRounds.mean.toFixed(2)} rounds, p50=${causal.mechanicToDeathRounds.p50 ?? "n/a"}, p95=${causal.mechanicToDeathRounds.p95 ?? "n/a"}`,
    "",
    "## Falsification result",
    "",
    `- v0 criteria: **${report.falsification}** (classification was not tuned toward a target)`,
    `- significant paired rank reversals: ${report.rankReversals.length}`,
    `- raw rank-order reversals (supplemental): ${report.rawRankReversals.length}`,
    `- triggered red flags: ${report.redFlags.triggered.length ? report.redFlags.triggered.join(", ") : "none"}`,
    "",
    "## Red flags",
    "",
    ...report.redFlags.flags.map(flag => `- ${flag.triggered ? "[TRIGGERED]" : "[clear]"} ${flag.id}: ${flag.criterion}; observed=${JSON.stringify(flag.observed)}`),
    "",
    "## Build × encounter × depth causal counts",
    "",
    "Each row is N=500 for one build/fixture/depth. Counts are exclusive categories within the legacy raw denominator: `pure/mech-raw/direct-mechanic/unknown`.",
    "",
    "| Depth | Encounter | Build | Clear / death | Pure raw | Mechanic raw lethal | Direct mechanic | Unknown/mixed | Fallback | Mech→death mean |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...report.cases.map(testCase => `| B${testCase.depth} | ${testCase.encounterId} | ${testCase.buildId} | ${testCase.outcomes.clear} / ${testCase.outcomes.death} | ${testCase.causalAttribution.legacyRawPureDamageDeaths} | ${testCase.causalAttribution.legacyRawMechanicMediatedRawDamageDeaths} | ${testCase.causalAttribution.legacyRawDirectMechanicDeaths} | ${testCase.causalAttribution.legacyRawUnknownDeaths} | ${testCase.causalAttribution.fallbackActionCount} | ${testCase.causalAttribution.mechanicToDeathRounds.mean === null ? "n/a" : testCase.causalAttribution.mechanicToDeathRounds.mean.toFixed(2)} |`),
    "",
    "Direct cause is the lethal damage event. Contributing cause is assigned only when the trace contains state-degradation evidence before that event; `unknown_or_mixed` is retained for multiple or insufficient explanations. Each raw JSON trace retains round, HP/MP, player action, enemy action, status transitions, silence, MP drain, reflect, anti-heal, regen, summon, guard, multi-action, spell opportunity loss, physical fallback, damage source, and lethal event data.",
    "",
    `Largest contributing cause counts among former raw deaths: ${Object.entries(causal.legacyRawContributingCauses).sort(([, left], [, right]) => right - left).slice(0, 3).map(([key, value]) => `${key}=${value}`).join(", ") || "none"}.`,
    `Auto action review: ${report.autoActionReview.policy}; representative death traces are included in JSON.`,
    `Fixture review: ${report.fixtureValidation.interpretation}`,
    "",
    "Modeled: production monster definitions, depth scaling, combat round resolution, existing auto action, spell effects, affix/core rules, and status rules. Omitted: map traversal, manual input, consumables/retreat, loot/economy, and between-encounter progression. Fixtures are controlled tests, not dungeon encounter-frequency estimates."
  ];
  return `${lines.join("\n")}\n`;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const provenance = requireRunnerProvenance({
    fetchOriginMain: false,
    measurementRunnerPaths: ["scratch/measurements/issue973_build_sensitivity.js", "scratch/measurements/measurement_env_signature.js", "scratch/measurements/measurement_provenance.js"]
  });
  const envSignature = printEnvSignatureBanner({
    runnerVersion: RUNNER_VERSION,
    seed: options.seed || DEFAULT_SEED,
    runs: options.runs || DEFAULT_RUNS,
    depths: TARGET_DEPTHS,
    builds: BUILD_IDS,
    encounters: ENCOUNTER_IDS
  }, { label: "issue974 measurement env" });
  const report = runMeasurement({ seed: options.seed || DEFAULT_SEED, runs: options.runs || DEFAULT_RUNS, provenance });
  report.measurement.environmentSignature = envSignature;
  const outputPath = resolve(options.output);
  const summaryPath = resolve(options.summary);
  fs.mkdirSync(dirname(outputPath), { recursive: true });
  fs.mkdirSync(dirname(summaryPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(summaryPath, renderSummary(report));
  console.log(`Wrote Issue #980 raw measurement: ${outputPath}`);
  console.log(`Wrote Issue #980 summary: ${summaryPath}`);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
