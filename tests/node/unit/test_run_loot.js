import assert from "node:assert/strict";

const element = () => ({
  style: {},
  appendChild: () => element(),
  replaceChildren: () => {},
  addEventListener: () => {},
  classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} },
  setAttribute: () => {},
  getAttribute: () => "",
  innerHTML: "",
  textContent: "",
  className: ""
});

global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};
global.document = {
  getElementById: () => element(),
  querySelector: () => element(),
  querySelectorAll: () => [],
  createElement: () => element(),
  body: element()
};
global.window = { innerWidth: 390, innerHeight: 844, addEventListener: () => {} };
Object.defineProperty(global, "navigator", { value: { userAgent: "node" }, configurable: true });

const { state, createDefaultCurrentRun, createStartingKitCharacter, initNewGame } =
  await import("../../../src/state.js");
const { applySavePayload, createSavePayload } =
  await import("../../../src/state/save_payload.js");
const { normalizeSavePayload } = await import("../../../src/state/save_migrations.js");
const {
  consumeRunObjectLoot,
  createPendingObjectLootEntry,
  isNormalizedRunObjectLootEntry,
  isNormalizedRunObjectLootLedger,
  normalizeRunObjectLootLedger,
  recordDungeonObjectLoot,
  replaceRunObjectLoot,
  resolvePendingObjectLootDisposition,
  settleRunObjectLoot
} = await import("../../../src/state/run_loot.js");
const {
  __resetTelemetryForTests,
  __setTelemetryClientForTests
} = await import("../../../src/telemetry.js");
const { triggerRunResult } = await import("../../../src/result.js");
const { getRunMaterialStake, getUnusedDepartureItemCount } = await import("../../../src/ui/run_stakes.js");

function setupRun() {
  initNewGame();
  state.party = [createStartingKitCharacter("vanguard")];
  state.currentRun = createDefaultCurrentRun();
  state.currentRun.runSeed = "RUN-LOOT-TEST";
  state.currentRun.startedAt = 100;
  state.gameState = "explore";
  state.storage = [];
  state.inventory = ["HEAL_POTION", "TOWN_PORTAL"];
  state.currentRun.townInventory = state.inventory.slice();
  state.currentRun.departureCraftItems = ["HEAL_POTION"];
}

const legacyStorageSave = createSavePayload();
legacyStorageSave.storage = ["HEAL_POTION", "TOWN_PORTAL"];
delete legacyStorageSave.storageMigrationVersion;
const migratedLegacyStorage = normalizeSavePayload(legacyStorageSave);
assert.deepEqual(migratedLegacyStorage.storage, [], "existing storage is cleared on first load");
assert.equal(migratedLegacyStorage.storageMigrationVersion, 1);
assert.deepEqual(migratedLegacyStorage.metaMaterials, legacyStorageSave.metaMaterials,
  "one-time storage reset preserves other save content");
const migratedStorageRoundTrip = normalizeSavePayload(JSON.parse(JSON.stringify(migratedLegacyStorage)));
assert.deepEqual(migratedStorageRoundTrip.storage, [], "one-time storage reset remains stable across later loads");
console.log("[PASS] legacy storage resets once while the save payload remains valid");

setupRun();
state.currentRun.townInventory = ["HEAL_POTION", "HEAL_POTION", "TOWN_PORTAL"];
state.inventory = ["HEAL_POTION", "TOWN_PORTAL", "GREATER_HEAL"];
assert.equal(getUnusedDepartureItemCount(), 2, "counts only remaining carried items with duplicate quantities");
state.currentRun.materials = { "獣の牙": 3, "鉄片": 2 };
const stake = getRunMaterialStake();
assert.equal(stake.currentTotal, 5);
assert.ok(stake.deathLoss >= 0);
console.log("[PASS] shared stakes count materials and remaining departure items");

function addDungeonLoot(item) {
  state.inventory.push(item);
  recordDungeonObjectLoot(state, item);
}

setupRun();
const canonicalEquipment = {
  kind: "equipment",
  instanceId: "canonical-loot",
  baseId: "DAGGER",
  rarity: "rare",
  level: 1,
  identified: true,
  affixes: []
};
const normalizedLedger = normalizeRunObjectLootLedger([
  { id: "duplicate", item: canonicalEquipment, role: "legacy" },
  { id: "duplicate", item: "HEAL_POTION", source: "legacy" },
  { id: 42, item: "DAGGER" },
  { id: "invalid", item: {} }
]);
assert.deepEqual(normalizedLedger.map(entry => entry.id), ["duplicate", "duplicate"],
  "ledger normalizer preserves order and duplicate IDs while dropping invalid entries");
assert.strictEqual(normalizedLedger[0].item, canonicalEquipment, "normalizer preserves item identity");
assert.deepEqual(Object.keys(normalizedLedger[0]).sort(), ["id", "item"]);
assert.equal(isNormalizedRunObjectLootEntry(normalizedLedger[0]), true);
assert.equal(isNormalizedRunObjectLootEntry({ ...normalizedLedger[0], role: "legacy" }), false);
assert.equal(isNormalizedRunObjectLootLedger(normalizedLedger), true);
assert.equal(isNormalizedRunObjectLootLedger([{ ...normalizedLedger[0], source: "legacy" }]), false);
assert.deepEqual(normalizeRunObjectLootLedger(JSON.parse(JSON.stringify(normalizedLedger))), normalizedLedger,
  "canonical ledger survives JSON roundtrip");
console.log("[PASS] canonical owned ledger guard and normalizer preserve exact shape, order, duplicates, and identity");

const pendingLeft = createPendingObjectLootEntry(state, "DAGGER", { source: "chest" });
assert.equal(resolvePendingObjectLootDisposition(state, pendingLeft, "left", { source: "chest" }), true);
assert.equal(state.currentRun.unbankedObjectLoot.length, 0, "left pending loot never enters owned ledger");
const pendingDiscarded = createPendingObjectLootEntry(state, "AMULET_HP", { source: "chest" });
assert.equal(resolvePendingObjectLootDisposition(state, pendingDiscarded, "discarded", { source: "chest" }), true);
assert.equal(resolvePendingObjectLootDisposition(state, pendingDiscarded, "banked", { source: "chest" }), false);
console.log("[PASS] pending loot dispositions retain production loot identity without ledger ownership");

const foundPotion = "HEAL_POTION";
const foundSword = { baseId: "LONG_SWORD", identified: false, curseEffectId: "CURSE_BLOOD" };
const foundWing = "TOWN_PORTAL";
addDungeonLoot(foundPotion);
addDungeonLoot(foundSword);
addDungeonLoot(foundWing);
state.currentRun.unbankedObjectLoot[0].source = "legacy-save";
state.party[0].equipment.weapon = foundSword;
state.inventory = state.inventory.filter(item => item !== foundSword);

const saved = JSON.parse(JSON.stringify(createSavePayload()));
state.currentRun = null;
state.inventory = [];
state.party = [];
applySavePayload(saved);
assert.deepEqual(state.currentRun.townInventory, ["HEAL_POTION", "TOWN_PORTAL"]);
assert.equal(state.currentRun.unbankedObjectLoot.length, 3);
assert.equal(state.currentRun.unbankedObjectLoot[1].item.baseId, "LONG_SWORD");
assert.deepEqual(Object.keys(state.currentRun.unbankedObjectLoot[0]).sort(), ["id", "item"],
  "legacy ledger fields are dropped during save migration");
assert.equal(state.party[0].equipment.weapon.baseId, "LONG_SWORD");
console.log("[PASS] dungeon loot ownership survives save/load while equipped");

assert.equal(consumeRunObjectLoot(state, "HEAL_POTION"), true);
state.inventory.splice(0, 1);
assert.deepEqual(state.currentRun.townInventory, ["TOWN_PORTAL"]);
assert.equal(state.currentRun.unbankedObjectLoot.length, 3);
console.log("[PASS] duplicate item use consumes Town ownership first by explicit current-action policy");

const pushStorage = state.storage.slice();
assert.deepEqual(pushStorage, [], "push does not settle object loot");
assert.equal(state.currentRun.unbankedObjectLoot.length, 3);
console.log("[PASS] push leaves object ownership unchanged");

const wingResult = settleRunObjectLoot(state, "wing");
assert.equal(wingResult.banked.length, 4, "unused town supply and all dungeon loot are banked");
assert.equal(state.storage.length, 1, "only unused Town preparation is permanent storage");
assert.deepEqual(state.storage, ["HEAL_POTION"], "workshop return items do not enter storage");
assert.equal(state.storage.some(item => item?.baseId === "LONG_SWORD"), false);
assert.equal(state.currentRun.bankedObjectLoot.length, 3);
assert.equal(state.currentRun.lostObjectLoot.length, 0);
assert.equal(state.party[0].equipment.weapon, null, "run-ending clears equipped loot placement");
assert.equal(state.currentRun.unbankedObjectLoot.length, 0);
console.log("[PASS] wing banks all dungeon loot while only departure supplies enter storage");

setupRun();
const townSword = { baseId: "LONG_SWORD", identified: true, instanceId: "town-sword" };
const dungeonSword = { baseId: "LONG_SWORD", identified: false, instanceId: "dungeon-sword" };
const upgradedDungeonSword = { ...dungeonSword, enhanceLevel: 1 };
state.inventory = [townSword, dungeonSword];
state.currentRun.townInventory = [townSword];
recordDungeonObjectLoot(state, dungeonSword);
assert.equal(replaceRunObjectLoot(state, dungeonSword, upgradedDungeonSword), true);
assert.equal(state.currentRun.townInventory[0], townSword);
assert.equal(state.currentRun.unbankedObjectLoot[0].item, upgradedDungeonSword);
console.log("[PASS] duplicate equipment replacement prefers matching ownership identity");

function runTerminal(outcome) {
  setupRun();
  const dungeonPotion = "GREATER_HEAL";
  const dungeonSword = { baseId: "LONG_SWORD", identified: true };
  addDungeonLoot(dungeonPotion);
  addDungeonLoot(dungeonSword);
  state.party[0].equipment.weapon = dungeonSword;
  settleRunObjectLoot(state, outcome);
  return {
    storage: state.storage.slice(),
    lost: state.currentRun.lostObjectLoot.slice(),
    inventory: state.inventory.slice(),
    equipped: state.party[0].equipment.weapon
  };
}

for (const outcome of ["death", "abandon"]) {
  const terminal = runTerminal(outcome);
  assert.deepEqual(terminal.storage, []);
  assert.deepEqual(state.currentRun.lostTownItems, ["HEAL_POTION"]);
  assert.deepEqual(terminal.lost, ["GREATER_HEAL", { baseId: "LONG_SWORD", identified: true }]);
  assert.deepEqual(terminal.inventory, []);
  assert.equal(terminal.equipped, null);
console.log(`[PASS] ${outcome} loses unused departure craft and dungeon object loot`);
}

setupRun();
addDungeonLoot("GREATER_HEAL");
settleRunObjectLoot(state, "retreat");
assert.deepEqual(state.storage, ["HEAL_POTION"]);
assert.deepEqual(state.currentRun.lostObjectLoot, []);
assert.deepEqual(state.currentRun.returnedTownItems, ["HEAL_POTION"]);
console.log("[PASS] portal returns unused departure craft and excludes dungeon consumables");

setupRun();
addDungeonLoot("HEAL_POTION");
state.inventory.splice(0, 1); // The picked potion is treated as used first.
settleRunObjectLoot(state, "retreat");
assert.deepEqual(state.storage, ["HEAL_POTION"]);
console.log("[PASS] same-type dungeon pickup is spent before the one unused departure potion");

setupRun();
state.inventory = ["TOWN_PORTAL"]; // Used, discarded, or corroded craft item no longer remains in the bag.
settleRunObjectLoot(state, "retreat");
assert.deepEqual(state.storage, []);
console.log("[PASS] consumed or removed departure item is not returned");

setupRun();
state.storageMax = 1;
state.storage = ["TOWN_PORTAL"];
state.currentRun.departureCraftItems = ["HEAL_POTION", "HEAL_POTION"];
state.inventory.push("HEAL_POTION");
settleRunObjectLoot(state, "retreat");
assert.deepEqual(state.storage, ["TOWN_PORTAL"]);
assert.deepEqual(state.currentRun.returnedTownItems, []);
assert.deepEqual(state.currentRun.overflowTownItems, ["HEAL_POTION", "HEAL_POTION"]);
console.log("[PASS] storage capacity rejects excess returned departure items and records overflow");

setupRun();
const malformedStorageItem = { baseId: "GREATER_HEAL", instanceId: "malformed-storage", affixes: [null] };
state.storage = [malformedStorageItem];
state.inventory = [malformedStorageItem];
state.party[0].equipment.weapon = malformedStorageItem;
state.currentRun.unbankedObjectLoot = [{ id: "malformed-storage", item: malformedStorageItem }];
const beforeSettlement = {
  inventory: state.inventory.slice(),
  equipment: state.party[0].equipment.weapon,
  storage: state.storage.slice(),
  townInventory: state.currentRun.townInventory.slice(),
  unbankedObjectLoot: state.currentRun.unbankedObjectLoot.slice(),
  bankedObjectLoot: state.currentRun.bankedObjectLoot.slice(),
  lostObjectLoot: state.currentRun.lostObjectLoot.slice()
};
const settlementEvents = [];
__setTelemetryClientForTests({ capture: (name, properties) => settlementEvents.push({ name, properties }) });
const settlementResult = settleRunObjectLoot(state, "retreat");
assert.deepEqual(settlementResult, { banked: [], lost: [] }, "malformed storage input aborts settlement");
assert.deepEqual(state.inventory, beforeSettlement.inventory, "aborted settlement preserves inventory");
assert.strictEqual(state.party[0].equipment.weapon, beforeSettlement.equipment, "aborted settlement preserves equipment");
assert.deepEqual(state.storage, beforeSettlement.storage, "aborted settlement preserves storage");
assert.deepEqual(state.currentRun.townInventory, beforeSettlement.townInventory, "aborted settlement preserves Town ownership");
assert.deepEqual(state.currentRun.unbankedObjectLoot, beforeSettlement.unbankedObjectLoot, "aborted settlement preserves unbanked ownership");
assert.deepEqual(state.currentRun.bankedObjectLoot, beforeSettlement.bankedObjectLoot, "aborted settlement preserves banked ledger");
assert.deepEqual(state.currentRun.lostObjectLoot, beforeSettlement.lostObjectLoot, "aborted settlement preserves lost ledger");
assert.deepEqual(settlementEvents, [], "aborted settlement emits no lifecycle telemetry");
__resetTelemetryForTests();
console.log("[PASS] storage validation aborts settlement without partial mutation or telemetry");

setupRun();
state.currentRun.materials = { "獣の牙": 4 };
addDungeonLoot("GREATER_HEAL");
triggerRunResult("milestone_portal");
assert.equal(state.gameState, "result");
assert.deepEqual(state.storage, ["HEAL_POTION"]);
assert.deepEqual(state.currentRun.bankedObjectLoot, ["GREATER_HEAL"]);
console.log("[PASS] safe portal result settles object loot through the run terminal");
