import assert from "node:assert/strict";
import { createVNextCharacter } from "../fixtures/vnext_character.js";

const { buildObjectLootStakeSnapshot } = await import("../../../src/rules/object_loot_stake.js");
const owner = await import("../../../src/rules/object_loot_stake.ts");
const { exerciseObjectLootStakeInputs } = await import("../fixtures/typescript/object_loot_stake_inputs.ts");
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
assert.deepEqual(Object.keys(owner), ["buildObjectLootStakeSnapshot"]);
assert.deepEqual(Object.keys(await import("../../../src/rules/object_loot_stake.js")), Object.keys(owner));
assert.equal(owner.buildObjectLootStakeSnapshot, buildObjectLootStakeSnapshot);
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

for (const input of [undefined, null, 0, "state", false, {}]) {
  assert.equal(buildObjectLootStakeSnapshot(input).unconfirmedObjectCount, 0);
}
assert.deepEqual(exerciseObjectLootStakeInputs(buildObjectLootStakeSnapshot).slice(0, 3).map(value => value.unconfirmedObjectCount), [0, 0, 0]);

const getterError = new Error("currentRun getter");
assert.throws(() => buildObjectLootStakeSnapshot(Object.defineProperty({}, "currentRun", {
  get() { throw getterError; }
})), error => error === getterError);
assert.throws(() => buildObjectLootStakeSnapshot({ party: {} }), /flatMap/);
let currentRunReads = 0;
const getterState = Object.defineProperty({}, "currentRun", {
  get() {
    currentRunReads += 1;
    return { unbankedObjectLoot: currentRunReads === 1 ? [] : [{ item: "HEAL_POTION" }] };
  }
});
assert.equal(buildObjectLootStakeSnapshot(getterState).unconfirmedObjectCount, 1);
assert.equal(currentRunReads, 2);
let partyReads = 0;
const partyGetterState = Object.defineProperty({}, "party", {
  get() {
    partyReads += 1;
    return [];
  }
});
buildObjectLootStakeSnapshot(partyGetterState);
assert.equal(partyReads, 2);

const sparseLedger = [];
sparseLedger.length = 6;
sparseLedger[1] = null;
sparseLedger[2] = undefined;
sparseLedger[3] = { item: 0 };
sparseLedger[4] = { id: "primitive", item: "HEAL_POTION" };
sparseLedger[5] = { id: "truthy-primitive", item: 7 };
const sparseLedgerBefore = sparseLedger.slice();
const filteredSnapshot = buildObjectLootStakeSnapshot({ currentRun: { unbankedObjectLoot: sparseLedger } });
assert.equal(filteredSnapshot.unconfirmedObjectCount, 2);
assert.deepEqual(filteredSnapshot.details.map(detail => detail.itemId), ["HEAL_POTION", 7]);
assert.deepEqual(filteredSnapshot.details.map(detail => detail.lootSequence), ["primitive", "truthy-primitive"]);
assert.equal(0 in sparseLedger, false);
assert.deepEqual(sparseLedger, sparseLedgerBefore);

const repeatedItem = { baseId: "WAND", instanceId: "repeat" };
const repeatedSnapshot = buildObjectLootStakeSnapshot({
  party: [
    { mediumState: { socketedRunes: [repeatedItem] }, equipment: { weapon: repeatedItem } },
    ,
    { equipment: { accessory: repeatedItem } }
  ],
  inventory: [repeatedItem],
  currentRun: { unbankedObjectLoot: Array.from({ length: 5 }, (_, index) => ({ id: index, item: repeatedItem })) }
});
assert.deepEqual(repeatedSnapshot.details.map(detail => detail.location), ["active_rune", "equipped", "equipped", "bag", "other"]);
assert.deepEqual(repeatedSnapshot.details.map(detail => detail.equipmentSlot), Array(5).fill("weapon"));
assert.deepEqual(Object.keys(repeatedSnapshot), [
  "unconfirmedObjectCount", "unconfirmedObjectIds", "composition", "details", "runeCount", "activeRuneCount",
  "mediumCount", "shieldCount", "armorCount", "runeSupplyBandComposition", "coreCount", "supportCount",
  "coreMainAxisCount", "coreAuxiliaryCount", "unknownStageCount", "cursedCount", "bagOccupancy", "bagCapacity", "bagFreeSlots"
]);
assert.deepEqual(Object.keys(repeatedSnapshot.composition), [
  "category", "runeSupplyBand", "location", "equipmentSlot", "weaponBehavior", "lootRole", "identificationStage"
]);
assert.equal(repeatedSnapshot.runeSupplyBandComposition, repeatedSnapshot.composition.runeSupplyBand);

const instanceMatched = buildObjectLootStakeSnapshot({
  inventory: [{ baseId: "HEAL_POTION", instanceId: "shared-instance" }],
  currentRun: { unbankedObjectLoot: [{ item: { baseId: "WAND", instanceId: "shared-instance" } }] }
});
assert.equal(instanceMatched.details[0].location, "bag");
const mixedKindNonmatch = buildObjectLootStakeSnapshot({
  inventory: ["WAND"],
  currentRun: { unbankedObjectLoot: [{ item: { baseId: "WAND" } }] }
});
assert.equal(mixedKindNonmatch.details[0].location, "other");

const sparseAffixes = [];
sparseAffixes.length = 3;
sparseAffixes[1] = { id: "UNKNOWN_CORE_FIXTURE", kind: "core", buildAxis: "auxiliary" };
sparseAffixes[2] = { type: "UNKNOWN_SUPPORT_FIXTURE", kind: "support", buildRole: "pivot" };
const affixItem = { baseId: "WAND", identified: false, knowledgeStage: "not-a-stage", lootRole: "invalid", affixes: sparseAffixes };
const affixSnapshot = buildObjectLootStakeSnapshot({ currentRun: { unbankedObjectLoot: [{ item: affixItem }] } });
assert.deepEqual(affixSnapshot.details[0].affixLootRoles, { reinforce: 0, convert: 0, pivot: 1 });
assert.equal(affixSnapshot.details[0].coreCount, 1);
assert.equal(affixSnapshot.details[0].coreAuxiliaryCount, 1);
assert.equal(affixSnapshot.details[0].supportCount, 1);
assert.equal(affixSnapshot.details[0].lootRole, null);
assert.equal(affixSnapshot.details[0].identificationStage, "unknown");
assert.equal(affixSnapshot.unknownStageCount, 1);
assert.equal(0 in sparseAffixes, false);
assert.equal(affixItem.affixes, sparseAffixes);
assert.deepEqual(Object.keys(affixSnapshot.details[0]), [
  "lootSequence", "itemId", "category", "location", "equipmentSlot", "weaponBehavior", "medium", "runeSupplyBand",
  "coreCount", "supportCount", "coreMainAxisCount", "coreAuxiliaryCount", "lootRole", "affixLootRoles",
  "identificationStage", "cursed"
]);

let changingAffixesReads = 0;
const changingAffixesItem = { baseId: "UNKNOWN_AFFIX_GETTER_FIXTURE" };
Object.defineProperty(changingAffixesItem, "affixes", {
  get() {
    changingAffixesReads += 1;
    return changingAffixesReads === 1 ? [] : [{ type: "UNKNOWN_SUPPORT_FIXTURE", kind: "support" }];
  }
});
const changingAffixesSnapshot = buildObjectLootStakeSnapshot({
  currentRun: { unbankedObjectLoot: [{ item: changingAffixesItem }] }
});
assert.equal(changingAffixesReads, 2);
assert.equal(changingAffixesSnapshot.details[0].supportCount, 1);

const secondAffixesReadError = new Error("second affixes getter read");
let throwingAffixesReads = 0;
const throwingAffixesItem = { baseId: "UNKNOWN_AFFIX_GETTER_FIXTURE" };
Object.defineProperty(throwingAffixesItem, "affixes", {
  get() {
    throwingAffixesReads += 1;
    if (throwingAffixesReads === 2) throw secondAffixesReadError;
    return [];
  }
});
assert.throws(() => buildObjectLootStakeSnapshot({
  currentRun: { unbankedObjectLoot: [{ item: throwingAffixesItem }] }
}), error => error === secondAffixesReadError);
assert.equal(throwingAffixesReads, 2);

assert.throws(() => buildObjectLootStakeSnapshot({
  party: [], inventory: {}, currentRun: { unbankedObjectLoot: [{ item: "HEAL_POTION" }] }
}), /findIndex/);
assert.equal(buildObjectLootStakeSnapshot({
  party: [{ mediumState: { socketedRunes: {} } }], currentRun: { unbankedObjectLoot: [] }
}).unconfirmedObjectCount, 0);

console.log("[PASS] production-backed object-loot stake snapshots classify ownership and lifecycle stages");
