import assert from "assert";

global.localStorage = (() => {
  let store = {};
  return {
    getItem: key => store[key] || null,
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: key => { delete store[key]; },
    clear: () => { store = {}; }
  };
})();

const createDummyElement = () => ({
  style: {},
  appendChild: () => createDummyElement(),
  replaceChildren: () => {},
  addEventListener: () => {},
  classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} },
  setAttribute: () => {},
  getAttribute: () => "",
  removeAttribute: () => {},
  innerHTML: "",
  textContent: "",
  cloneNode: () => createDummyElement()
});

global.document = {
  getElementById: () => createDummyElement(),
  querySelector: () => createDummyElement(),
  querySelectorAll: () => [],
  createElement: () => createDummyElement(),
  body: createDummyElement()
};
global.window = { innerWidth: 375, innerHeight: 667, addEventListener: () => {} };
Object.defineProperty(global, "navigator", {
  value: { userAgent: "node" },
  writable: true,
  configurable: true
});

const { state, loadGame, syncPartyToRoster } = await import("../src/state.js");
const { triggerRunResult } = await import("../src/result.js");

function setupRun(partyChar, rosterChar) {
  localStorage.clear();
  state.party = [partyChar];
  state.roster = [rosterChar];
  state.currentRun = {
    returnReason: null,
    deepestFloor: 2,
    kills: 1,
    battles: 1,
    elitesKilled: 0,
    bossesKilled: 0,
    chestsOpened: 0,
    trapsTriggered: 0,
    goldGained: 0,
    itemsFound: [],
    equipmentFound: [],
    materialsFound: {},
    deathLogs: []
  };
  state.x = 1;
  state.y = 1;
  state.floor = 2;
  state.maps = [];
  state.visitedMaps = [];
  state.inventory = [];
  state.materials = {};
  state.remains = [];
  state.runHistory = [];
  state.deathLogs = [];
  state.codex = null;
  state.activeContract = null;
  state.contracts = [{}];
  state.gold = 100;
  state.logs = [];
}

function assertCharacterState(char, expected) {
  assert.strictEqual(char.hp, expected.hp);
  assert.strictEqual(char.status, expected.status);
  assert.strictEqual(char.exp, expected.exp);
  assert.deepStrictEqual(char.equipment, expected.equipment);
}

const equipment = { weapon: "IRON_SWORD", armor: "LEATHER_ARMOR", shield: null, accessory: null };
const combatResult = {
  name: "A",
  class: "Fighter",
  level: 2,
  hp: 7,
  maxHp: 20,
  status: "poisoned",
  exp: 42,
  equipment: { ...equipment }
};
const staleRosterChar = { ...combatResult, hp: 20, status: "ok", exp: 10, equipment: {} };

setupRun(combatResult, staleRosterChar);
syncPartyToRoster([{ ...combatResult, equipment: { ...equipment } }]);
assert.strictEqual(state.party[0], state.roster[0], "combat result should relink party to roster");
assertCharacterState(state.roster[0], combatResult);

triggerRunResult("escape_scroll");
assert.strictEqual(state.party[0], state.roster[0], "normal return should preserve the shared reference");
assertCharacterState(state.roster[0], combatResult);

state.party = [];
state.roster = [];
loadGame();
assert.strictEqual(state.party[0], state.roster[0], "save/load should restore the shared reference");
assertCharacterState(state.party[0], combatResult);

const wipeResult = { ...combatResult, hp: 3, status: "ok", exp: 55, equipment: { ...equipment } };
setupRun(wipeResult, { ...staleRosterChar });
triggerRunResult("gameover");
assert.strictEqual(state.party[0], state.roster[0], "party wipe should relink party to roster");
assertCharacterState(state.roster[0], { ...wipeResult, hp: 0, status: "dead" });

console.log("[PASS] party/roster combat, return, wipe, and save/load synchronization");
