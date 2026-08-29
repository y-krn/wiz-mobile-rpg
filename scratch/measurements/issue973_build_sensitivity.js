// sim-scope: formula — production-backed encounter combat sensitivity measurement
/* global console, process */

import fs from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createRng } from "../../src/seed_rng.js";
import { createDefaultCodex, createDefaultCurrentRun, createSoloCharacter } from "../../src/state/initial_state.js";
import { createDefaultRecords } from "../../src/state/records_state.js";
import { runCombatRoundCalculation } from "../../src/combat_logic/round.js";
import { chooseAutoCombatAction } from "../../src/combat_logic/auto_action.js";
import { MONSTERS } from "../../src/data/monsters.js";
import { SPELLS } from "../../src/data/spells.js";
import { ITEMS } from "../../src/data/items.js";
import { CORE_AFFIXES, SUPPORT_AFFIXES } from "../../src/data/affixes.js";
import { scaleEnemyForDepth } from "../../src/rules/depth_scaling.js";
import { getCharMaxHp, getCharMaxMp } from "../../src/rules/character_stats.js";
import { getSpellPayment, getCoreLogText } from "../../src/rules/affix_rules.js";
import { readSimScopeDeclaration, printEnvSignatureBanner } from "./measurement_env_signature.js";
import { requireRunnerProvenance } from "./measurement_provenance.js";

export const RUNNER_VERSION = "issue973-build-sensitivity-v1";
export const TARGET_DEPTHS = Object.freeze([8, 13, 18]);
export const DEFAULT_SEED = "974-build-confidence";
export const DEFAULT_RUNS = 100;
export const MAX_ROUNDS = 200;
export const LOW_RESOURCE_THRESHOLD = 0.25;

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
    simTelemetry: { executionerTriggers: 0 },
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

function classifyFailure({ state, mechanisms, rounds, hadSpellDenial, hadMpStarvation }) {
  const character = state.party[0];
  const evidence = [];
  if (hadSpellDenial || (character.status === "silence")) evidence.push("spell_denial");
  if (hadMpStarvation) evidence.push("mp_starvation");
  if (mechanisms.reflectionOrCounter > 0) evidence.push("reflection_or_counter");
  if (mechanisms.actionEconomy > 0) evidence.push("action_economy");
  if (["sleep", "paralyzed", "paralyze", "blind"].includes(character.status)) evidence.push("status_lock");
  if (mechanisms.regen > 0) evidence.push("duration_overrun");
  if (character.hp <= 0 && evidence.length === 0) evidence.push("raw_damage_pressure");
  if (evidence.length === 0 && rounds >= MAX_ROUNDS) evidence.push("duration_overrun");
  if (evidence.length === 0) evidence.push("unknown_or_mixed");
  const primary = evidence.length === 1 ? evidence[0] : "unknown_or_mixed";
  return { primary, evidence };
}

export function runEncounterSample({ buildId, encounterId, depth, seed }) {
  return withSeed(seed, () => {
    const fixture = createEncounterFixture(encounterId, depth);
    const state = createSimulationState(buildId, depth, fixture.monsters, seed);
    const mechanisms = createMechanismCounts();
    let rounds = 0;
    let hadSpellDenial = false;
    let hadMpStarvation = false;
    let outcome = "timeout";

    while (rounds < MAX_ROUNDS) {
      const characterBefore = state.party[0];
      const action = chooseAction(state);
      if (
        action.type === "fight" &&
        hasOffensiveSpellOpportunity(characterBefore) &&
        characterBefore.spells.every(spellName => {
          const spell = SPELLS[spellName];
          return !spell?.target?.includes("enemy") || !getSpellPayment(characterBefore, spell.cost).canCast;
        })
      ) {
        hadMpStarvation = true;
      }
      if (action.type === "spell" && characterBefore.status === "silence") hadSpellDenial = true;
      const result = runCombatRoundCalculation(state, { actions: [action] });
      rounds++;
      observeRound(mechanisms, action, result.logQueue);
      if (result.logQueue.some(entry => /沈黙した|沈黙を退け/.test(entry.msg || ""))) hadSpellDenial = true;
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
    const failure = outcome === "clear" && !lowResource
      ? null
      : classifyFailure({ state, mechanisms, rounds, hadSpellDenial, hadMpStarvation });
    return {
      outcome,
      rounds,
      hpRatio,
      mpRatio,
      lowResource,
      failure,
      mechanisms,
      seed,
      fixture: {
        encounterId,
        depth,
        monsterNames: fixture.monsters.map(monster => monster.name),
        scaledStats: fixture.monsters.map(monster => ({ name: monster.name, hp: monster.maxHp, atk: monster.atk, def: monster.def }))
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
    failureAttribution: {},
    deathFailureAttribution: {},
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
  if (sample.failure) {
    increment(aggregate.failureAttribution, sample.failure.primary);
    if (sample.outcome === "death") increment(aggregate.deathFailureAttribution, sample.failure.primary);
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
    failureAttribution: {
      allEligibleRuns: lowResourceRuns,
      counts: aggregate.failureAttribution,
      deathCounts: aggregate.deathFailureAttribution,
      rates: Object.fromEntries(Object.entries(aggregate.failureAttribution).map(([key, value]) => [key, value / Math.max(1, lowResourceRuns)]))
    },
    resourceSignature: {
      hpConsumedRatio: 1 - aggregate.sumHpRatio / runs,
      mpConsumedRatio: 1 - aggregate.sumMpRatio / runs,
      spellActionsPerRun: aggregate.actionMix.spell / runs,
      physicalActionsPerRun: aggregate.actionMix.physical / runs
    },
    ...(aggregate.samples.length > 0 ? { samples: aggregate.samples } : {})
  };
}

function deriveCaseSeed(rootSeed, runIndex, depth, encounterId) {
  return `${rootSeed}:run:${runIndex}:B${depth}:${encounterId}`;
}

export function deriveSharedCaseSeed(rootSeed, runIndex, depth, encounterId) {
  return deriveCaseSeed(rootSeed, runIndex, depth, encounterId);
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

function buildPairwiseRanking(cases) {
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
  }));
}

function createRankReversals(casesByKey) {
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

function calculateRedFlags(cases, reversals) {
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
    { id: "no_rank_reversal", criterion: "no encounter-level clear-rate rank reversal is observed", observed: { reversalCount: reversals.length }, triggered: reversals.length === 0 },
    { id: "same_resource_signature", criterion: "encounter resource signatures differ by less than 0.05", observed: { maxMeanAbsoluteDistance: signatureMaxDistance }, triggered: signatureMaxDistance < 0.05 },
    { id: "unknown_failure_attribution", criterion: "unknown_or_mixed is >40% of eligible high-consumption/death runs", observed: { unknown: unknownEligible, eligible, share: eligible > 0 ? unknownEligible / eligible : 0 }, triggered: eligible > 0 && unknownEligible / eligible > 0.4 },
    { id: "depth_scaling_dominates", criterion: "depth clear-rate range is >2x the observed build clear-rate range", observed: { depthRange, buildRange }, triggered: buildRange > 0 && depthRange > buildRange * 2 }
  ];
  return { flags, triggered: flags.filter(flag => flag.triggered).map(flag => flag.id) };
}

function buildMeasurementMetadata({ seed, runs, provenance, envSignature }) {
  return {
    issue: 974,
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
    modeledProductionRules: [
      "src/data/monsters.js MONSTERS",
      "src/rules/depth_scaling.js scaleEnemyForDepth",
      "src/combat_logic/round.js runCombatRoundCalculation",
      "src/combat_logic/auto_action.js chooseAutoCombatAction",
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
    fixturePolicy: "named production monster definitions scaled at B8/B13/B18; no synthetic monster, trait, spell, affix, or balance value"
  };
}

export function runMeasurement({ seed = DEFAULT_SEED, runs = DEFAULT_RUNS, provenance = null } = {}) {
  if (!Number.isInteger(runs) || runs < 1) throw new Error(`runs must be a positive integer: ${runs}`);
  const cases = [];
  for (const depth of TARGET_DEPTHS) {
    for (const encounterId of ENCOUNTER_IDS) {
      for (const buildId of BUILD_IDS) {
        const aggregate = createCaseAggregate(buildId, encounterId, depth);
        for (let runIndex = 0; runIndex < runs; runIndex++) {
          const caseSeed = deriveCaseSeed(seed, runIndex, depth, encounterId);
          addSample(aggregate, runEncounterSample({ buildId, encounterId, depth, seed: caseSeed }), runs === 1);
        }
        const finalized = finalizeCase(aggregate);
        cases.push(finalized);
      }
    }
  }
  const casesByDepthEncounter = new Map();
  cases.forEach(testCase => {
    const key = `${testCase.depth}:${testCase.encounterId}`;
    if (!casesByDepthEncounter.has(key)) casesByDepthEncounter.set(key, []);
    casesByDepthEncounter.get(key).push(testCase);
  });
  const pairwiseRanking = [...casesByDepthEncounter.entries()].map(([key, cellCases]) => {
    const [depth, encounterId] = key.split(":");
    return { depth: Number(depth), encounterId, rankings: buildPairwiseRanking(cellCases) };
  });
  const reversals = createRankReversals(new Map(TARGET_DEPTHS.map(depth => [depth, new Map(ENCOUNTER_IDS.map(encounterId => [encounterId, casesByDepthEncounter.get(`${depth}:${encounterId}`)]))])));
  const redFlags = calculateRedFlags(cases, reversals);
  const falsification = redFlags.triggered.length > 0 ? "falsified_or_red_flagged" : "not_falsified_by_v0_criteria";
  return {
    schemaVersion: 1,
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
      productionMonsterNames: [...encounter.monsterNames]
    })),
    cases,
    pairwiseRanking,
    rankReversals: reversals,
    redFlags,
    falsification,
    interpretation: {
      strongestBuildQuestion: "not evaluated as a single winner; rankings are reported per encounter/depth",
      rankReversalQuestion: reversals.length > 0 ? "observed" : "not observed",
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
      console.log("Usage: node scratch/measurements/issue973_build_sensitivity.js --runs 100|500 --output evidence/results/issue-974.json --summary evidence/results/issue-974.md [--seed SEED]");
      process.exit(0);
    } else {
      throw new Error(`unknown option: ${value}`);
    }
  }
  if (!options.output || !options.summary) throw new Error("--output and --summary are required");
  return options;
}

function renderSummary(report) {
  const lines = [
    "# Issue #974 Build Sensitivity Measurement",
    "",
    `- runner: ${report.measurement.runnerVersion}`,
    `- source commit: \`${report.measurement.sourceCommit || "test/in-process"}\``,
    `- origin/main ancestor: ${report.measurement.originMainAncestor}`,
    `- N=${report.measurement.configuration.runs} per build / encounter / depth; seed=${report.measurement.configuration.seed}`,
    `- builds: ${report.builds.map(build => `${build.label}${build.expressible ? "" : " (not expressible)"}`).join(", ")}`,
    `- encounters: ${report.encounters.length}; depths: ${TARGET_DEPTHS.map(depth => `B${depth}`).join(", ")}`,
    "",
    "## Falsification result",
    "",
    `- v0 criteria: **${report.falsification}**`,
    `- rank reversals: ${report.rankReversals.length}`,
    `- triggered red flags: ${report.redFlags.triggered.length ? report.redFlags.triggered.join(", ") : "none"}`,
    "",
    "## Red flags",
    "",
    ...report.redFlags.flags.map(flag => `- ${flag.triggered ? "[TRIGGERED]" : "[clear]"} ${flag.id}: ${flag.criterion}; observed=${JSON.stringify(flag.observed)}`),
    "",
    "## Encounter/depth cells",
    "",
    "| Depth | Encounter | Best clear-rate order | Clear rate | Death rate | HP after | MP after | Rounds |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |",
    ...report.pairwiseRanking.map(cell => {
      const clear = cell.rankings.find(ranking => ranking.metric === "clearRate");
      const caseForWinner = report.cases.find(testCase => testCase.depth === cell.depth && testCase.encounterId === cell.encounterId && testCase.buildId === clear.ranking[0].buildId);
      return `| B${cell.depth} | ${cell.encounterId} | ${clear.ranking.map(entry => entry.buildId).join(" > ")} | ${(caseForWinner?.clearRate || 0).toFixed(3)} | ${(caseForWinner?.deathRate || 0).toFixed(3)} | ${(caseForWinner?.postCombatHpRatio || 0).toFixed(3)} | ${(caseForWinner?.postCombatMpRatio || 0).toFixed(3)} | ${(caseForWinner?.roundsToTerminal || 0).toFixed(1)} |`;
    }),
    "",
    "Failure attribution is based on observed production logs, status/resource trajectory, and mechanism firing. `unknown_or_mixed` is retained when multiple or insufficient explanations remain.",
    "",
    "Modeled: production monster definitions, depth scaling, combat round resolution, auto action, spell effects, affix/core rules, and status rules. Omitted: map traversal, manual input, consumables/retreat, loot/economy, and between-encounter progression."
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
  console.log(`Wrote Issue #974 raw measurement: ${outputPath}`);
  console.log(`Wrote Issue #974 summary: ${summaryPath}`);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
