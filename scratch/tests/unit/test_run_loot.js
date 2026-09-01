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

const { state, createDefaultCurrentRun, createSoloCharacter, initNewGame } =
  await import("../../../src/state.js");
const { applySavePayload, createSavePayload } =
  await import("../../../src/state/save_payload.js");
const {
  RETURN_WING_SALVAGE_COUNT,
  consumeRunObjectLoot,
  recordDungeonObjectLoot,
  replaceRunObjectLoot,
  settleRunObjectLoot
} = await import("../../../src/state/run_loot.js");
const { triggerRunResult } = await import("../../../src/result.js");

function setupRun() {
  initNewGame();
  state.party = [createSoloCharacter("Fighter")];
  state.currentRun = createDefaultCurrentRun();
  state.currentRun.runSeed = "RUN-LOOT-TEST";
  state.currentRun.startedAt = 100;
  state.gameState = "explore";
  state.storage = [];
  state.inventory = ["HEAL_POTION", "TOWN_PORTAL"];
  state.currentRun.townInventory = state.inventory.slice();
}

function addDungeonLoot(item) {
  state.inventory.push(item);
  recordDungeonObjectLoot(state, item);
}

setupRun();
const foundPotion = "HEAL_POTION";
const foundSword = { baseId: "LONG_SWORD", identified: false, curseEffectId: "CURSE_BLOOD" };
const foundWing = "TOWN_PORTAL";
addDungeonLoot(foundPotion);
addDungeonLoot(foundSword);
addDungeonLoot(foundWing);
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

const selectedId = state.currentRun.unbankedObjectLoot[1].id;
const wingResult = settleRunObjectLoot(state, "wing", [selectedId]);
assert.equal(wingResult.banked.length, 2, "unused town wing plus one selected loot is banked");
assert.equal(state.storage.length, 2);
assert.equal(state.storage.some(item => item?.baseId === "LONG_SWORD"), true);
assert.equal(state.currentRun.lostObjectLoot.length, 2);
assert.equal(state.party[0].equipment.weapon, null, "run-ending clears equipped loot placement");
assert.equal(state.currentRun.unbankedObjectLoot.length, 0);
console.log(`[PASS] wing salvages at most ${RETURN_WING_SALVAGE_COUNT} selected object loot entries including equipment`);

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
  assert.deepEqual(terminal.storage, ["HEAL_POTION", "TOWN_PORTAL"]);
  assert.deepEqual(terminal.lost, ["GREATER_HEAL", { baseId: "LONG_SWORD", identified: true }]);
  assert.deepEqual(terminal.inventory, []);
  assert.equal(terminal.equipped, null);
  console.log(`[PASS] ${outcome} preserves unused town consumables and loses dungeon object loot`);
}

setupRun();
addDungeonLoot("GREATER_HEAL");
settleRunObjectLoot(state, "retreat");
assert.deepEqual(state.storage, ["HEAL_POTION", "TOWN_PORTAL", "GREATER_HEAL"]);
assert.deepEqual(state.currentRun.lostObjectLoot, []);
console.log("[PASS] portal banks all dungeon object loot without changing material state");

setupRun();
state.currentRun.materials = { "獣の牙": 4 };
addDungeonLoot("GREATER_HEAL");
triggerRunResult("milestone_portal");
assert.equal(state.gameState, "result");
assert.deepEqual(state.storage, ["HEAL_POTION", "TOWN_PORTAL", "GREATER_HEAL"]);
assert.deepEqual(state.currentRun.bankedObjectLoot, ["GREATER_HEAL"]);
console.log("[PASS] safe portal result settles object loot through the run terminal");
