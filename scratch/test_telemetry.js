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
  trackEquipmentDecision,
  trackChestAction,
  trackDamageReceived,
  trackEvent,
  trackExplorationDecision,
  trackRunEnd,
  trackRunStart
} from "../src/telemetry.js";
import { recordReceivedDamage } from "../src/combat_logic/damage.js";
import { getMpWardDef } from "../src/combat_logic/mp_ward.js";

let failures = 0;

const vercelConfig = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));

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

  const emptyMp = { class: "Mage", hp: 10, mp: 0 };
  recordReceivedDamage({ floor: 1 }, emptyMp, "ゴブリン A", 2, 2, 12, { attackType: "physical" });
  const activeMp = { class: "Mage", hp: 10, mp: 1 };
  recordReceivedDamage({ floor: 1 }, activeMp, "ゴブリン A", 2, 2, 12, { attackType: "physical" });

  const damageEvents = events.filter(event => event.name === "damage_received");
  assert.equal(damageEvents[0].properties.mpWardActive, getMpWardDef(emptyMp) > 0);
  assert.equal(damageEvents[1].properties.mpWardActive, getMpWardDef(activeMp) > 0);
  assert.equal(damageEvents[0].properties.mpWardActive, false);
  assert.equal(damageEvents[1].properties.mpWardActive, true);
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
