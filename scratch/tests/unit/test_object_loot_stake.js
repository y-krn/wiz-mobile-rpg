import assert from "node:assert/strict";
import { createVNextCharacter } from "../fixtures/vnext_character.js";

const { buildObjectLootStakeSnapshot } = await import("../../../src/rules/object_loot_stake.js");
const {
  __resetTelemetryForTests,
  __setTelemetryClientForTests,
  trackLootLifecycle,
  trackLootStakeSnapshot,
  trackRunStart
} = await import("../../../src/telemetry.js");

const staff = {
  baseId: "SAGE_STAFF",
  instanceId: "stake-staff",
  identified: true,
  rarity: "rare",
  affixes: [
    { id: "CORE_BLOOD_WAND", kind: "core" },
    { type: "spellPower", kind: "support" }
  ],
  lootRole: "convert"
};
const armor = {
  baseId: "LEATHER_ARMOR",
  instanceId: "stake-armor",
  identified: false,
  knowledgeStage: "discovery",
  curseSuspected: true,
  lootRole: "reinforce",
  affixes: [{ id: "CORE_OPENER", kind: "core", buildAxis: "main" }]
};

const state = {
  floor: 3,
  gameState: "explore",
  inventory: ["HEAL_POTION", armor, "RUNE_MAHALITO"],
  party: [createVNextCharacter("arcana", {
    hp: 20,
    maxHp: 20,
    mp: 4,
    maxMp: 10,
    equipment: { weapon: staff, shield: null, armor: null, accessory: null },
    mediumState: { mediumKey: "stake-staff", socketedRunes: ["RUNE_HALITO"] }
  })],
  currentRun: {
    startedAt: 100,
    unbankedObjectLoot: [
      { id: "100:loot:1", item: staff },
      { id: "100:loot:2", item: "RUNE_HALITO" },
      { id: "100:loot:3", item: armor },
      { id: "100:loot:4", item: "HEAL_POTION" }
    ]
  }
};

const snapshot = buildObjectLootStakeSnapshot(state);
assert.equal(snapshot.unconfirmedObjectCount, 4);
assert.deepEqual(snapshot.composition.category, { equipment: 2, rune: 1, consumable: 1, other: 0 });
assert.deepEqual(snapshot.composition.location, { bag: 2, equipped: 1, active_rune: 1, other: 0 });
assert.equal(snapshot.mediumCount, 1);
assert.equal(snapshot.runeCount, 1);
assert.equal(snapshot.activeRuneCount, 1);
assert.deepEqual(snapshot.runeSupplyBandComposition, { shallow: 1, early_mid: 0, mid: 0, deep: 0, other: 0 });
assert.equal(snapshot.details[1].runeSupplyBand, "shallow");
assert.equal(snapshot.coreCount, 2);
assert.equal(snapshot.supportCount, 1);
assert.equal(snapshot.coreMainAxisCount, 2);
assert.equal(snapshot.unknownStageCount, 0);
assert.equal(snapshot.cursedCount, 1);
assert.equal(snapshot.bagOccupancy, 3);
assert.equal(snapshot.bagFreeSlots, 17);

const events = [];
__resetTelemetryForTests();
__setTelemetryClientForTests({ capture: (name, properties) => events.push({ name, properties }) });
trackRunStart({ characterClass: null, startFloor: 1 }, state.party[0], state);
trackLootLifecycle("consumed", {
  state,
  itemKey: "HEAL_POTION",
  lootId: "100:loot:4",
  source: "dungeon"
});
trackLootStakeSnapshot("portal_decision", { state });

const lifecycle = events.find(event => event.name === "loot_lifecycle");
assert.equal(lifecycle.properties.lifecycleStage, "consumed");
const stake = events.find(event => event.name === "loot_stake_snapshot");
assert.equal(stake.properties.snapshotPoint, "portal_decision");
assert.equal(stake.properties.unconfirmedObjectCount, 4);
assert.equal(stake.properties.unconfirmedObjectLocation.active_rune, 1);
assert.equal(stake.properties.unconfirmedObjectComposition.rune, 1);
assert.deepEqual(stake.properties.runeSupplyBandComposition, { shallow: 1, early_mid: 0, mid: 0, deep: 0, other: 0 });
assert.equal(stake.properties.coreMainAxisCount, 2);
assert.equal(stake.properties.bagFreeSlots, 17);
assert.equal(stake.properties.unconfirmedObjectDetails[1].lootSequence, 2);
assert.equal(stake.properties.unconfirmedObjectDetails[1].runeSupplyBand, "shallow");

console.log("[PASS] production-backed object-loot stake snapshots classify ownership and lifecycle stages");
