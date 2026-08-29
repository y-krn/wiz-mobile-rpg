import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  __resetTelemetryForTests,
  __setTelemetryInitializationForTests,
  __setTelemetryClientForTests,
  buildDecisionContext,
  buildEquipmentSnapshot,
  buildPlayerSnapshot,
  buildResourceSnapshot,
  normalizeCombatResult,
  normalizeDeathType,
  normalizeEnemyId,
  normalizeOutcome,
  resolvePostHogApiHost,
  trackCombatEnd,
  trackCombatStart,
  trackCombatDecision,
  trackCombatDecisionCancel,
  trackCombatDecisionCommit,
  trackCombatDecisionPending,
  trackEquipmentDecision,
  trackChestAction,
  trackChestSmashResult,
  trackBleedingEvent,
  trackVulnerableEvent,
  trackDamageReceived,
  trackEvent,
  trackExplorationDecision,
  trackRunEnd,
  trackRunStart
} from "../../../src/telemetry.js";
import { recordReceivedDamage } from "../../../src/combat_logic/damage.js";
import { getMpWardDef } from "../../../src/combat_logic/mp_ward.js";

let failures = 0;

const vercelConfig = JSON.parse(readFileSync(new URL("../../../vercel.json", import.meta.url), "utf8"));

function check(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
  } catch (error) {
    failures++;
    console.error(`[FAIL] ${name}: ${error.message}`);
  }
}

check("production telemetry uses the same-origin ingest host", () => {
  assert.equal(resolvePostHogApiHost("https://us.i.posthog.com", { isProduction: true }), "/ingest");
  assert.equal(resolvePostHogApiHost("https://eu.i.posthog.com", { isProduction: true }), "/ingest");
  assert.equal(resolvePostHogApiHost("https://us.i.posthog.com", { isProduction: false }), "https://us.i.posthog.com");
  assert.equal(resolvePostHogApiHost("  ", { isProduction: true }), "");
});

check("PostHog ingest rewrites precede the SPA fallback", () => {
  const [staticRewrite, arrayRewrite, ingestRewrite, spaFallback] = vercelConfig.rewrites;
  assert.deepEqual(staticRewrite, {
    source: "/ingest/static/(.*)",
    destination: "https://us-assets.i.posthog.com/static/$1"
  });
  assert.deepEqual(arrayRewrite, {
    source: "/ingest/array/(.*)",
    destination: "https://us-assets.i.posthog.com/array/$1"
  });
  assert.deepEqual(ingestRewrite, {
    source: "/ingest/(.*)",
    destination: "https://us.i.posthog.com/$1"
  });
  assert.deepEqual(spaFallback, { source: "/(.*)", destination: "/index.html" });
});

const run = {
  characterClass: "Mage",
  startedAt: Date.now() - 100,
  startFloor: 1,
  deepestFloor: 4,
  steps: 12,
  battles: 3,
  kills: 5,
  elitesKilled: 1,
  bossesKilled: 0,
  chestsOpened: 2,
  trapsTriggered: 1,
  returnReason: "gameover",
  deathLogs: [{ type: "status", source: "ゾンビ A", cause: "free text must not be sent" }]
};

check("telemetry without a client is a complete no-op", () => {
  __resetTelemetryForTests();
  assert.doesNotThrow(() => {
    trackEvent("run_start", { value: undefined });
    trackRunStart(run, { class: "Mage", level: 1, maxHp: 14, maxMp: 12, equipment: {} });
    trackCombatStart({ floor: 1, player: {}, monsters: [] });
    trackDamageReceived({ enemyId: "Goblin A", rawDamage: 1, finalDamage: 1 });
    trackCombatEnd("endCombat", { monsters: [] });
    trackRunEnd(run, "death");
  });
});

check("capture exceptions do not escape into gameplay", () => {
  __setTelemetryClientForTests({
    capture() {
      throw new Error("transport failed");
    }
  });
  assert.doesNotThrow(() => {
    trackRunStart(run, { class: "Mage", level: 1, maxHp: 14, maxMp: 12, equipment: {} });
    trackCombatStart({ floor: 1, player: { class: "Mage", hp: 14, mp: 12 }, monsters: [] });
    trackDamageReceived({ enemyId: "Goblin A", rawDamage: 3, finalDamage: 1 });
    trackCombatEnd("endCombat", { monsters: [] });
    trackRunEnd(run, "death");
  });
});

check("properties are normalized and undefined values are removed", () => {
  const events = [];
  __setTelemetryClientForTests({ capture: (name, properties) => events.push({ name, properties }) });
  trackEvent("custom", { defined: 1, missing: undefined, nested: { missing: undefined, value: null } });
  assert.deepEqual(events[0], {
    name: "custom",
    properties: { schemaVersion: 2, defined: 1, nested: { value: null } }
  });
});

check("enemy suffixes and enum fields are normalized", () => {
  assert.equal(normalizeEnemyId("ゾンビ A"), "ゾンビ");
  assert.equal(normalizeEnemyId("ゾンビ"), "ゾンビ");
  assert.equal(normalizeEnemyId("migrated free text"), "other");
  assert.equal(normalizeOutcome("death"), "death");
  assert.equal(normalizeOutcome("unknown"), null);
  assert.equal(normalizeCombatResult("escapeToTown"), "escape_to_town");
  assert.equal(normalizeCombatResult("milestoneVictory"), "victory");
  assert.equal(normalizeCombatResult("giveKey"), "victory");
  assert.equal(normalizeCombatResult("triggerChest"), "victory");
  assert.equal(normalizeCombatResult("fleeCombat"), "fled");
  assert.equal(normalizeCombatResult("runEscape"), "fled");
  assert.equal(normalizeCombatResult("unknown"), "other");
  assert.equal(normalizeDeathType("status"), "status");
  assert.equal(normalizeDeathType("free text"), null);
});

check("run end sends the existing death-log cause with normalized fields", () => {
  const events = [];
  __setTelemetryClientForTests({ capture: (name, properties) => events.push({ name, properties }) });
  const runWithDeathCause = {
    ...run,
    deathLogs: [{ type: "status", source: "ゾンビ A", cause: "毒のダメージ" }],
    freeTextDeathCause: "must not be sent"
  };
  trackRunStart(runWithDeathCause, { class: "Mage", level: 1, maxHp: 14, maxMp: 12, equipment: {} });
  trackRunEnd(runWithDeathCause, "death");
  const properties = events.at(-1).properties;
  assert.equal(properties.outcome, "death");
  assert.equal(properties.deathType, "status");
  assert.equal(properties.deathSource, "ゾンビ");
  assert.equal(properties.deathCause, "poison");
  assert.equal(properties.returnReason, "gameover");
  assert.equal(Object.hasOwn(properties, "charName"), false);
  assert.equal(Object.hasOwn(properties, "cause"), false);
  assert.equal(Object.hasOwn(properties, "freeTextDeathCause"), false);
});

const decisionPlayer = {
  class: "Mage",
  level: 3,
  hp: 18,
  maxHp: 24,
  mp: 7,
  maxMp: 12,
  status: "poisoned",
  str: 8,
  int: 16,
  pie: 12,
  vit: 9,
  agi: 11,
  luk: 10,
  equipment: {
    weapon: "WAND",
    shield: null,
    armor: "ROBE",
    accessory: null,
    accessory2: null
  }
};
const decisionState = {
  party: [decisionPlayer],
  inventory: ["HEAL_POTION", "ANTIDOTE", "MANA_POTION", "ESCAPE_SCROLL", "DAGGER"],
  identifyTickets: 2,
  metaMaterials: { "黒角": 4 },
  floor: 2,
  gameState: "combat",
  x: 0,
  y: 0,
  map: [[{ type: "floor", event: null }]],
  currentRun: {
    materials: { "黒角": 3 },
    deepestFloor: 2,
    steps: 8,
    battles: 2,
    chestsOpened: 1,
    trapsTriggered: 1
  }
};
const decisionCombat = {
  floor: 2,
  roundNumber: 4,
  phase: "choose_actions",
  monsters: [{ name: "ゴブリンの呪術師 A", hp: 10, isBoss: false }, { name: "いにしえの竜 B", hp: 20, isBoss: true }],
  isBoss: true
};

check("shared snapshots use bounded production-derived values", () => {
  const playerSnapshot = buildPlayerSnapshot(decisionPlayer, { floor: 2 });
  const equipmentSnapshot = buildEquipmentSnapshot(decisionPlayer);
  const resourceSnapshot = buildResourceSnapshot(decisionState);
  const context = buildDecisionContext({ state: decisionState, character: decisionPlayer, combat: decisionCombat });
  assert.equal(playerSnapshot.hpRate, 0.75);
  assert.equal(playerSnapshot.statusCount, 1);
  assert.equal(typeof playerSnapshot.attack, "number");
  assert.equal(equipmentSnapshot.equipmentIds[0], "WAND");
  assert.equal(equipmentSnapshot.equipmentIdentified[0], true);
  assert.equal(resourceSnapshot.inventoryCapacity, 20);
  assert.equal(resourceSnapshot.consumableHealingCount, 1);
  assert.equal(resourceSnapshot.consumableCureCount, 1);
  assert.equal(resourceSnapshot.consumableManaCount, 1);
  assert.equal(context.enemyCount, 2);
  assert.deepEqual(context.enemyIds, ["ゴブリンの呪術師", "いにしえの竜"]);
});

check("malformed hp and mp rates stay within unit bounds", () => {
  const malformedCharacter = {
    ...decisionPlayer,
    hp: 9999,
    maxHp: 1,
    mp: 9999,
    maxMp: 1
  };
  const snapshot = buildPlayerSnapshot(malformedCharacter, { floor: 2 });
  assert.equal(snapshot.hpRate, 1);
  assert.equal(snapshot.mpRate, 1);
});

check("legacy bleeding telemetry is bounded and typed", () => {
  const events = [];
  __setTelemetryClientForTests({ capture: (name, properties) => events.push({ name, properties }) });
  trackBleedingEvent("triggered", {
    floor: Number.MAX_VALUE,
    playerClass: "migrated class",
    enemyId: "migrated enemy",
    isBoss: 1,
    isMidboss: 0,
    remainingTurns: Number.MAX_VALUE,
    payoffDamage: Number.MAX_VALUE,
    reason: "migrated reason",
    source: "migrated source",
    buildKey: "bleedingAtk:999999",
    damageContribution: Number.MAX_VALUE,
    directDamage: -Number.MAX_VALUE,
    extraArray: Array.from({ length: 100 }, () => "free text")
  });
  trackBleedingEvent("triggered", {
    floor: 3,
    playerClass: "Mage",
    enemyId: "いにしえの竜 B",
    remainingTurns: 2,
    payoffDamage: 4,
    reason: "duration",
    source: "bleedingAtk",
    buildKey: "bleedingAtk:12",
    damageContribution: 4,
    directDamage: 8
  });
  const [malformed, valid] = events;
  assert.equal(malformed.name, "bleeding_triggered");
  assert.equal(malformed.properties.floor, 1_000_000);
  assert.equal(malformed.properties.playerClass, "other");
  assert.equal(malformed.properties.enemyId, "other");
  assert.equal(malformed.properties.remainingTurns, 1_000_000);
  assert.equal(malformed.properties.payoffDamage, 1_000_000);
  assert.equal(malformed.properties.reason, "other");
  assert.equal(malformed.properties.source, "other");
  assert.equal(malformed.properties.buildKey, "bleedingAtk:100");
  assert.equal(malformed.properties.damageContribution, 1_000_000);
  assert.equal(malformed.properties.directDamage, 0);
  assert.equal(Object.hasOwn(malformed.properties, "extraArray"), false);
  assert.equal(valid.properties.playerClass, "Mage");
  assert.equal(valid.properties.enemyId, "いにしえの竜");
  assert.equal(valid.properties.reason, "duration");
  assert.equal(valid.properties.buildKey, "bleedingAtk:12");
});

check("vulnerable telemetry records bounded burst fields", () => {
  const events = [];
  __setTelemetryClientForTests({ capture: (name, properties) => events.push({ name, properties }) });
  trackVulnerableEvent("consumed", {
    floor: Number.MAX_VALUE,
    playerClass: "migrated class",
    enemyId: "いにしえの竜 B",
    isBoss: true,
    remainingTurns: Number.MAX_VALUE,
    multiplier: Number.MAX_VALUE,
    source: "VULNERA",
    buildKey: "VULNERA",
    qualifyingHitType: "spell",
    latencyTurns: 2,
    damageContribution: 4,
    directDamage: 16
  });
  const event = events[0];
  assert.equal(event.name, "vulnerable_consumed");
  assert.equal(event.properties.floor, 1_000_000);
  assert.equal(event.properties.playerClass, "other");
  assert.equal(event.properties.enemyId, "いにしえの竜");
  assert.equal(event.properties.multiplier, 10);
  assert.equal(event.properties.qualifyingHitType, "spell");
  assert.equal(event.properties.buildKey, "VULNERA");
  assert.equal(event.properties.latencyTurns, 2);
});

check("combat decision indexes stay within production targets", () => {
  const events = [];
  __setTelemetryClientForTests({ capture: (name, properties) => events.push({ name, properties }) });
  trackRunStart(run, decisionPlayer, decisionState);
  trackCombatStart({ ...decisionCombat, player: decisionPlayer }, decisionState);
  trackCombatDecision("attack", {
    state: decisionState,
    character: decisionPlayer,
    combat: decisionCombat,
    actorIdx: -1,
    targetIdx: -1
  });
  trackCombatDecision("spell", {
    state: decisionState,
    character: decisionPlayer,
    combat: decisionCombat,
    actorIdx: Number.MAX_VALUE,
    targetIdx: -2
  });
  trackCombatDecision("spell", {
    state: decisionState,
    character: decisionPlayer,
    combat: decisionCombat,
    actorIdx: 0,
    targetIdx: -1,
    spellName: "MABARRIER"
  });
  const decisions = events.filter(event => event.name === "combat_decision");
  assert.equal(decisions[0].properties.actorIndex, null);
  assert.equal(decisions[0].properties.targetIndex, null);
  assert.equal(decisions[1].properties.actorIndex, null);
  assert.equal(decisions[1].properties.targetIndex, null);
  assert.equal(decisions[2].properties.actorIndex, 0);
  assert.equal(decisions[2].properties.targetIndex, -1);
});

check("combat decision targets use production collection semantics", () => {
  const events = [];
  __setTelemetryClientForTests({ capture: (name, properties) => events.push({ name, properties }) });
  const state = {
    ...decisionState,
    party: [
      decisionPlayer,
      { ...decisionPlayer, name: "Ally B" },
      { ...decisionPlayer, name: "Ally C" }
    ]
  };
  trackRunStart(run, decisionPlayer, state);
  trackCombatStart({ ...decisionCombat, player: decisionPlayer }, state);

  trackCombatDecision("spell", {
    state,
    character: decisionPlayer,
    combat: decisionCombat,
    actorIdx: 0,
    targetIdx: 0,
    spellName: "DIOS"
  });
  trackCombatDecision("item", {
    state,
    character: decisionPlayer,
    combat: decisionCombat,
    actorIdx: 0,
    targetIdx: 2,
    itemKey: "HEAL_POTION"
  });
  trackCombatDecision("attack", {
    state,
    character: decisionPlayer,
    combat: decisionCombat,
    actorIdx: 0,
    targetIdx: 1
  });
  trackCombatDecision("spell", {
    state,
    character: decisionPlayer,
    combat: decisionCombat,
    actorIdx: 0,
    targetIdx: -1,
    spellName: "MABARRIER"
  });

  const decisions = events.filter(event => event.name === "combat_decision");
  assert.deepEqual(decisions.map(event => event.properties.targetIndex), [0, 2, 1, -1]);
  assert.deepEqual(
    decisions.map(event => event.properties.targetEnemyId),
    [null, null, "いにしえの竜", null]
  );
});

check("canonical legendary rarity remains allowlisted", () => {
  const snapshot = buildEquipmentSnapshot({
    equipment: {
      weapon: { baseId: "WAND", identified: true, rarity: "legendary", affixes: [] }
    }
  });
  assert.equal(snapshot.equipmentRarities[0], "legendary");
});

check("decision events share context and keep action identifiers stable", () => {
  const events = [];
  __setTelemetryClientForTests({ capture: (name, properties) => events.push({ name, properties }) });
  trackRunStart({ ...run, characterClass: "Mage" }, decisionPlayer, decisionState);
  trackCombatStart({ ...decisionCombat, player: decisionPlayer }, decisionState);
  trackCombatDecision("fight", {
    state: decisionState,
    character: decisionPlayer,
    combat: decisionCombat,
    actorIdx: 0,
    targetIdx: 1
  });
  trackExplorationDecision("heal", {
    state: { ...decisionState, gameState: "explore" },
    character: decisionPlayer,
    source: "event_camp"
  });
  trackEquipmentDecision("compare", {
    state: decisionState,
    character: decisionPlayer,
    candidateKey: "DAGGER",
    currentKey: "WAND",
    preview: {
      item: { rarity: "common" },
      slot: "weapon",
      primaryDiff: 2,
      oldEq: "WAND",
      rows: [{ key: "attack", diff: 2 }]
    }
  });
  const combatEvent = events.find(event => event.name === "combat_decision");
  const explorationEvent = events.find(event => event.name === "exploration_decision");
  const equipmentEvent = events.find(event => event.name === "equipment_decision");
  assert.equal(combatEvent.properties.action, "attack");
  assert.equal(combatEvent.properties.targetEnemyId, "いにしえの竜");
  assert.equal(combatEvent.properties.enemyCount, 2);
  assert.equal(explorationEvent.properties.action, "heal");
  assert.equal(explorationEvent.properties.source, "event_camp");
  assert.equal(equipmentEvent.properties.action, "compare");
  assert.equal(equipmentEvent.properties.candidateId, "DAGGER");
  assert.deepEqual(equipmentEvent.properties.comparisonDiffs, [2]);
});

check("combat end numeric fields stay bounded", () => {
  const events = [];
  __setTelemetryClientForTests({ capture: (name, properties) => events.push({ name, properties }) });
  trackRunStart(run, decisionPlayer, decisionState);
  trackCombatStart({ ...decisionCombat, player: decisionPlayer }, decisionState);
  trackCombatEnd("endCombat", {
    floor: 2,
    turns: Number.MAX_VALUE,
    player: { hp: Number.MAX_VALUE, mp: -Number.MAX_VALUE },
    monsters: []
  }, decisionState);
  const combatEnd = events.find(event => event.name === "combat_end");
  assert.equal(combatEnd.properties.turns, 1_000_000);
  assert.equal(combatEnd.properties.playerHp, 1_000_000);
  assert.equal(combatEnd.properties.playerMp, 0);
});

check("combat start joins player and equipment snapshots without duplicating them on damage", () => {
  const events = [];
  __setTelemetryClientForTests({ capture: (name, properties) => events.push({ name, properties }) });
  trackRunStart(run, decisionPlayer, decisionState);
  trackCombatStart({ ...decisionCombat, player: decisionPlayer }, decisionState);
  trackDamageReceived({
    floor: 2,
    playerClass: decisionPlayer.class,
    enemyId: "墓守の巨躯",
    attackType: "physical",
    rawDamage: 12,
    finalDamage: 2,
    finalDef: 10,
    defResistance: 0.8333,
    defenseBreakdown: {
      equipmentDef: 3,
      vitContribution: 2,
      buffDef: 1,
      frontGuardDef: 2,
      firstStrikeDefense: 1,
      mpWardDef: 1,
      tempDefDown: 0
    }
  });

  const combatStart = events.find(event => event.name === "combat_start").properties;
  const damage = events.find(event => event.name === "damage_received").properties;
  assert.equal(combatStart.runId, damage.runId);
  assert.equal(combatStart.combatId, damage.combatId);
  assert.equal(combatStart.playerClass, "Mage");
  assert.equal(combatStart.level, decisionPlayer.level);
  assert.equal(combatStart.str, decisionPlayer.str);
  assert.equal(combatStart.vit, decisionPlayer.vit);
  assert.deepEqual(combatStart.equipmentIds, ["WAND", null, "ROBE", null, null]);
  assert.equal(combatStart.equipmentRarities.length, 5);
  assert.equal(combatStart.equipmentEnhancementLevels.length, 5);
  assert.equal(damage.equipmentDef, 3);
  assert.equal(damage.baseDef, 3);
  assert.equal(damage.vitContribution, 2);
  assert.equal(damage.mpWardDef, 1);
  assert.equal(Object.hasOwn(damage, "equipmentIds"), false);
  assert.equal(Object.hasOwn(damage, "equipmentAffixTypes"), false);
});

check("defense breakdown fields stay bounded and unknown values become null", () => {
  const events = [];
  __setTelemetryClientForTests({ capture: (name, properties) => events.push({ name, properties }) });
  trackRunStart(run, decisionPlayer, decisionState);
  trackCombatStart({ ...decisionCombat, player: decisionPlayer }, decisionState);
  trackDamageReceived({
    enemyId: "ゴブリン A",
    rawDamage: 2,
    finalDamage: 1,
    defenseBreakdown: {
      equipmentDef: Number.MAX_VALUE,
      vitContribution: "invalid",
      tempDefDown: -Number.MAX_VALUE
    }
  });
  const damage = events.find(event => event.name === "damage_received").properties;
  assert.equal(damage.equipmentDef, 1_000_000);
  assert.equal(damage.vitContribution, null);
  assert.equal(damage.tempDefDown, -1_000_000);
  assert.equal(damage.buffDef, null);
});

check("legacy chest, combat, and run fields stay bounded", () => {
  const events = [];
  __setTelemetryClientForTests({ capture: (name, properties) => events.push({ name, properties }) });
  trackRunStart(run, decisionPlayer, decisionState);
  trackChestAction({ fromDrop: false }, "open", {
    floor: Number.MAX_VALUE,
    inventoryCount: Number.MAX_VALUE,
    rewardCount: Number.MAX_VALUE
  });
  trackChestSmashResult({}, {
    floor: Number.MAX_VALUE,
    rewardCount: Number.MAX_VALUE,
    lostRewardCount: Number.MAX_VALUE,
    lostRewardRoles: Array.from({ length: 100 }, (_, index) => index === 0 ? "main" : "migrated-role"),
    lostRewardCategories: Array.from({ length: 100 }, (_, index) => index === 0 ? "usable" : "migrated-category"),
    remainingRewardCount: Number.MAX_VALUE,
    awardedRewardCount: Number.MAX_VALUE,
    unawardedRewardCount: Number.MAX_VALUE
  });
  trackCombatStart({
    ...decisionCombat,
    floor: Number.MAX_VALUE,
    player: { ...decisionPlayer, hp: Number.MAX_VALUE, mp: Number.MAX_VALUE },
    monsters: []
  }, decisionState);
  trackCombatEnd("victory", {
    floor: Number.MAX_VALUE,
    turns: Number.MAX_VALUE,
    player: { hp: Number.MAX_VALUE, mp: Number.MAX_VALUE },
    monsters: Array.from({ length: 100 }, () => ({ hp: 0, fled: false }))
  }, decisionState);
  trackRunEnd({ ...run, startedAt: 1 }, "retreat", decisionState);

  const chest = events.find(event => event.name === "chest_action");
  const smash = events.find(event => event.name === "chest_smash_result");
  const combat = events.find(event => event.name === "combat_start");
  const combatEnd = events.find(event => event.name === "combat_end");
  const runEnd = events.find(event => event.name === "run_end");
  assert.equal(chest.properties.floor, 1_000_000);
  assert.equal(chest.properties.inventoryCount, 1_000_000);
  assert.equal(chest.properties.rewardCount, 1_000_000);
  assert.equal(smash.properties.floor, 1_000_000);
  assert.equal(smash.properties.lostRewardCount, 1_000_000);
  assert.equal(smash.properties.remainingRewardCount, 1_000_000);
  assert.equal(smash.properties.awardedRewardCount, 1_000_000);
  assert.equal(smash.properties.unawardedRewardCount, 1_000_000);
  assert.equal(smash.properties.lostRewardRoles.length, 24);
  assert.deepEqual(smash.properties.lostRewardRoles.slice(0, 2), ["main", "other"]);
  assert.equal(smash.properties.lostRewardCategories.length, 24);
  assert.deepEqual(smash.properties.lostRewardCategories.slice(0, 2), ["usable", "other"]);
  assert.equal(combat.properties.floor, 1_000_000);
  assert.equal(combatEnd.properties.floor, 1_000_000);
  assert.equal(combatEnd.properties.turns, 1_000_000);
  assert.equal(combatEnd.properties.enemiesDefeated, 8);
  assert.equal(runEnd.properties.durationMs, 1_000_000);
});

check("production cell and run result enums are preserved", () => {
  const events = [];
  const stateWithProductionEnums = {
    ...decisionState,
    map: [[{ type: "empty", event: "event_merchant" }]],
    gameState: "explore"
  };
  __setTelemetryClientForTests({ capture: (name, properties) => events.push({ name, properties }) });
  const context = buildDecisionContext({ state: stateWithProductionEnums, character: decisionPlayer });
  assert.equal(context.currentCellType, "empty");
  assert.equal(context.currentCellEvent, "event_merchant");
  trackRunStart(run, decisionPlayer, stateWithProductionEnums);
  trackRunEnd({ ...run, returnReason: "milestone_portal" }, "retreat", stateWithProductionEnums);
  const runEnd = events.find(event => event.name === "run_end");
  assert.equal(runEnd.properties.returnReason, "milestone_portal");
});

check("run start captures initialized run resources and map context", () => {
  const events = [];
  __setTelemetryClientForTests({ capture: (name, properties) => events.push({ name, properties }) });
  trackRunStart(run, decisionPlayer, {
    ...decisionState,
    gameState: "explore",
    inventory: ["HEAL_POTION", "DAGGER"],
    identifyTickets: 7,
    map: [[{ type: "floor", event: "event_camp" }]],
    currentRun: { ...decisionState.currentRun, materials: { "黒角": 5 } }
  });
  const startEvent = events.find(event => event.name === "run_start");
  assert.equal(startEvent.properties.inventoryCount, 2);
  assert.equal(startEvent.properties.identifyTickets, 7);
  assert.equal(startEvent.properties.currentCellEvent, "event_camp");
  assert.equal(startEvent.properties.runMaterialCount, 5);
});

check("combat decisions preserve all production action categories", () => {
  const events = [];
  __setTelemetryClientForTests({ capture: (name, properties) => events.push({ name, properties }) });
  trackRunStart(run, decisionPlayer, decisionState);
  trackCombatStart({ ...decisionCombat, player: decisionPlayer }, decisionState);
  for (const action of ["attack", "spell", "item", "defend", "flee", "migrated_action"]) {
    trackCombatDecision(action, {
      state: decisionState,
      character: decisionPlayer,
      combat: decisionCombat,
      spellName: action === "spell" ? "HALITO" : undefined,
      itemKey: action === "item" ? "ESCAPE_SCROLL" : undefined
    });
  }
  assert.deepEqual(
    events.filter(event => event.name === "combat_decision").map(event => event.properties.action),
    ["attack", "spell", "item", "defend", "flee", "other"]
  );
});

check("canceled combat decisions are not committed to telemetry", () => {
  const events = [];
  __setTelemetryClientForTests({ capture: (name, properties) => events.push({ name, properties }) });
  trackRunStart(run, decisionPlayer, decisionState);
  trackCombatStart({ ...decisionCombat, player: decisionPlayer }, decisionState);
  const details = {
    state: { ...decisionState, combatState: decisionCombat },
    character: decisionPlayer,
    combat: decisionCombat,
    actorIdx: 0,
    targetIdx: 1
  };
  trackCombatDecisionPending("attack", details);
  trackCombatDecisionCancel();
  trackCombatDecisionCommit();
  assert.deepEqual(events.filter(event => event.name === "combat_decision"), []);

  trackCombatDecisionPending("attack", details);
  details.state.combatState.phase = "resolving";
  trackCombatDecisionCommit();
  const committed = events.filter(event => event.name === "combat_decision");
  assert.equal(committed.length, 1);
  assert.equal(committed[0].properties.combatPhase, "choose_actions");
});

check("exploration spell telemetry preserves target shape", () => {
  const events = [];
  __setTelemetryClientForTests({ capture: (name, properties) => events.push({ name, properties }) });
  trackRunStart(run, decisionPlayer, { ...decisionState, gameState: "explore" });
  trackExplorationDecision("spell", {
    state: { ...decisionState, gameState: "explore" },
    character: decisionPlayer,
    spellName: "DIOS",
    targetIdx: 0
  });
  trackExplorationDecision("spell", {
    state: { ...decisionState, gameState: "explore" },
    character: decisionPlayer,
    spellName: "MABARRIER"
  });
  const spellEvents = events.filter(event => event.name === "exploration_decision");
  assert.equal(spellEvents[0].properties.targetIndex, 0);
  assert.equal(spellEvents[0].properties.targetType, "single_ally");
  assert.equal(spellEvents[1].properties.targetIndex, null);
  assert.equal(spellEvents[1].properties.targetType, "all_allies");
});

check("exploration item telemetry identifies the selected ally", () => {
  const events = [];
  const state = {
    ...decisionState,
    gameState: "explore",
    party: [decisionPlayer, { ...decisionPlayer }, { ...decisionPlayer }]
  };
  __setTelemetryClientForTests({ capture: (name, properties) => events.push({ name, properties }) });
  trackRunStart(run, decisionPlayer, state);
  trackExplorationDecision("heal", {
    state,
    character: state.party[2],
    itemKey: "HEAL_POTION",
    targetIdx: 2
  });
  const itemEvent = events.find(event => event.name === "exploration_decision");
  assert.equal(itemEvent.properties.action, "heal");
  assert.equal(itemEvent.properties.itemId, "HEAL_POTION");
  assert.equal(itemEvent.properties.targetIndex, 2);
});

check("directional exploration item telemetry preserves validated directions", () => {
  const events = [];
  __setTelemetryClientForTests({ capture: (name, properties) => events.push({ name, properties }) });
  trackRunStart(run, decisionPlayer, { ...decisionState, gameState: "explore" });
  for (const direction of [0, 1, 2, 3]) {
    trackExplorationDecision("item", {
      state: { ...decisionState, gameState: "explore" },
      character: decisionPlayer,
      itemKey: "NOISE_BALL",
      direction
    });
  }
  assert.deepEqual(
    events.filter(event => event.name === "exploration_decision").map(event => event.properties.direction),
    [0, 1, 2, 3]
  );
  trackExplorationDecision("item", {
    state: { ...decisionState, gameState: "explore" },
    character: decisionPlayer,
    itemKey: "NOISE_BALL",
    direction: 99
  });
  assert.equal(events.at(-1).properties.direction, null);
});

check("malformed snapshots stay allowlisted and bounded", () => {
  const malformedCharacter = {
    ...decisionPlayer,
    class: "migrated free text",
    equipment: Object.fromEntries(Array.from({ length: 100 }, (_, index) => [
      `arbitrary-slot-${index}`,
      { baseId: "migrated-item", affixes: Array.from({ length: 100 }, () => ({ type: "free text" })) }
    ]))
  };
  const malformedState = {
    ...decisionState,
    gameState: "free text from save",
    inventory: Array.from({ length: 100 }, () => ({ baseId: "migrated-item" })),
    combatState: {
      phase: "free phase",
      monsters: Array.from({ length: 100 }, () => ({ name: "player-entered free text", hp: 1 }))
    }
  };
  const context = buildDecisionContext({ state: malformedState, character: malformedCharacter });
  assert.equal(context.playerClass, "other");
  assert.equal(context.gameState, "other");
  assert.equal(context.combatPhase, "other");
  assert.ok(context.equipmentIds.length <= 5);
  assert.ok(context.enemyIds.length <= 8);
  assert.ok(context.equipmentAffixTypes.length <= 24);
  assert.ok(context.inventoryCount <= 20);
  assert.equal(context.equipmentIds[0], "other");
  assert.equal(context.enemyIds[0], "other");
  assert.equal(context.equipmentAffixTypes[0], "other");
});

check("chest and run events include common resource and status context", () => {
  const events = [];
  __setTelemetryClientForTests({ capture: (name, properties) => events.push({ name, properties }) });
  trackRunStart(run, decisionPlayer, decisionState);
  trackChestAction({ fromDrop: false, inspected: true }, "disarm", {
    state: decisionState,
    character: decisionPlayer,
    floor: 2,
    trap: "poison needle",
    inventoryCount: 5,
    hasTrapKit: false,
    rewardCount: 1
  });
  trackRunEnd(run, "retreat", { ...decisionState, gameState: "result" });
  const chestEvent = events.find(event => event.name === "chest_action");
  const endEvent = events.find(event => event.name === "run_end");
  assert.equal(chestEvent.properties.playerClass, "Mage");
  assert.equal(chestEvent.properties.status, "poisoned");
  assert.equal(chestEvent.properties.inventoryCapacity, 20);
  assert.equal(endEvent.properties.hpRate, 0.75);
  assert.equal(endEvent.properties.runMaterialCount, 3);
});

check("chest action fields preserve valid values and coerce malformed input", () => {
  const events = [];
  __setTelemetryClientForTests({ capture: (name, properties) => events.push({ name, properties }) });
  trackRunStart(run, decisionPlayer, decisionState);
  trackChestAction({ lootHint: { aura: "strong" } }, "disarm", {
    trap: "poison needle",
    hasTrapKit: 1
  });
  trackChestAction({ lootHint: { aura: { migrated: true } } }, { migrated: true }, {
    trap: "migrated trap",
    hasTrapKit: "false"
  });

  const chestEvents = events.filter(event => event.name === "chest_action");
  assert.deepEqual(
    {
      action: chestEvents[0].properties.action,
      trap: chestEvents[0].properties.trap,
      hasTrapKit: chestEvents[0].properties.hasTrapKit,
      lootAura: chestEvents[0].properties.lootAura
    },
    { action: "disarm", trap: "poison needle", hasTrapKit: true, lootAura: "strong" }
  );
  assert.deepEqual(
    {
      action: chestEvents[1].properties.action,
      trap: chestEvents[1].properties.trap,
      hasTrapKit: chestEvents[1].properties.hasTrapKit,
      lootAura: chestEvents[1].properties.lootAura
    },
    { action: "other", trap: "other", hasTrapKit: true, lootAura: "other" }
  );
});

check("lifecycle events emitted before SDK initialization are flushed in order", () => {
  const events = [];
  __setTelemetryInitializationForTests({ enabled: true });
  trackRunStart(run, { class: "Mage", level: 1, maxHp: 14, maxMp: 12, equipment: {} });
  trackCombatStart({ floor: 1, player: { class: "Mage", hp: 14, mp: 12 }, monsters: [] });
  trackDamageReceived({ enemyId: "ゴブリン A", rawDamage: 2, finalDamage: 1 });
  trackCombatEnd("endCombat", { floor: 1, turns: 1, player: { hp: 12, mp: 12 }, monsters: [] });
  trackRunEnd(run, "retreat");
  assert.deepEqual(events, []);

  __setTelemetryClientForTests({ capture: (name, properties) => events.push({ name, properties }) });
  assert.deepEqual(events.map(event => event.name), [
    "run_start",
    "combat_start",
    "damage_received",
    "combat_end",
    "run_end"
  ]);
  __resetTelemetryForTests();
});

check("pre-initialization buffer is finite", () => {
  const events = [];
  __setTelemetryInitializationForTests({ enabled: true });
  for (let index = 0; index < 80; index++) trackEvent("buffered", { index });
  __setTelemetryClientForTests({ capture: (name, properties) => events.push({ name, properties }) });
  assert.equal(events.length, 64);
  assert.equal(events[0].properties.index, 16);
  assert.equal(events.at(-1).properties.index, 79);
  __resetTelemetryForTests();
});

check("runtime correlation IDs do not consume Math.random", () => {
  const originalRandom = Math.random;
  let randomCalls = 0;
  Math.random = () => {
    randomCalls++;
    return 0.5;
  };
  try {
    __setTelemetryClientForTests({ capture() {} });
    trackRunStart(run, { class: "Mage", level: 1, maxHp: 14, maxMp: 12, equipment: {} });
    trackCombatStart({ floor: 1, player: { class: "Mage", hp: 14, mp: 12 }, monsters: [{ name: "ゴブリン A" }] });
    trackCombatEnd("endCombat", { floor: 1, turns: 1, player: { hp: 14, mp: 12 }, monsters: [] });
    trackRunEnd(run, "retreat");
  } finally {
    Math.random = originalRandom;
  }
  assert.equal(randomCalls, 0);
});

check("damage telemetry matches the live MP ward formula at zero and nonzero MP", () => {
  const events = [];
  __setTelemetryClientForTests({ capture: (name, properties) => events.push({ name, properties }) });
  trackRunStart(run, { class: "Mage", level: 1, maxHp: 14, maxMp: 12, equipment: {} });
  trackCombatStart({ floor: 1, player: { class: "Mage", hp: 14, mp: 0 }, monsters: [] });

  const emptyMp = { class: "Mage", hp: 10, mp: 0, vit: 10, equipment: {} };
  recordReceivedDamage({ floor: 1 }, emptyMp, "ゴブリン A", 2, 2, 12, { attackType: "physical", finalDef: 2 });
  const activeMp = { class: "Mage", hp: 10, mp: 1, vit: 10, equipment: {} };
  recordReceivedDamage({ floor: 1 }, activeMp, "ゴブリン A", 2, 2, 12, { attackType: "physical", finalDef: 2 });

  const damageEvents = events.filter(event => event.name === "damage_received");
  assert.equal(damageEvents[0].properties.mpWardActive, getMpWardDef(emptyMp) > 0);
  assert.equal(damageEvents[1].properties.mpWardActive, getMpWardDef(activeMp) > 0);
  assert.equal(damageEvents[0].properties.mpWardActive, false);
  assert.equal(damageEvents[1].properties.mpWardActive, true);
  assert.equal(damageEvents[0].properties.equipmentDef, 0);
  assert.equal(damageEvents[0].properties.vitContribution, 2);
  assert.equal(damageEvents[0].properties.buffDef, 0);
  assert.equal(damageEvents[0].properties.mpWardDef, 0);
  assert.equal(damageEvents[1].properties.mpWardDef, 1);
});

check("telemetry lifecycle preserves a fixed random sequence", () => {
  const originalRandom = Math.random;
  const sequence = [0.1, 0.8, 0.3, 0.6];

  function sample(withTelemetry) {
    let index = 0;
    Math.random = () => sequence[index++];
    if (withTelemetry) {
      __setTelemetryClientForTests({ capture() {} });
      trackRunStart(run, { class: "Mage", level: 1, maxHp: 14, maxMp: 12, equipment: {} });
      trackCombatStart({ floor: 1, player: { class: "Mage", hp: 14, mp: 12 }, monsters: [] });
      trackDamageReceived({ enemyId: "ゴブリン A", rawDamage: 2, finalDamage: 1 });
      trackCombatEnd("endCombat", { floor: 1, turns: 1, player: { hp: 13, mp: 12 }, monsters: [] });
      trackRunEnd(run, "retreat");
    }
    const draws = [Math.random(), Math.random()];
    return { draws, index };
  }

  try {
    const off = sample(false);
    const on = sample(true);
    assert.deepEqual(on, off);
  } finally {
    Math.random = originalRandom;
    __resetTelemetryForTests();
  }
});

if (failures > 0) process.exit(1);
