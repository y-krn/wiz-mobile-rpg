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
  className: "",
});

global.localStorage = (() => {
  let store = {};
  return {
    getItem: key => store[key] || null,
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: key => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
global.document = {
  getElementById: () => element(),
  querySelector: () => element(),
  querySelectorAll: () => [],
  createElement: () => element(),
  body: element(),
};
global.window = { innerWidth: 390, innerHeight: 844, addEventListener: () => {} };
Object.defineProperty(global, "navigator", { value: { userAgent: "node" }, configurable: true });

const { state, initNewGame, createDefaultCurrentRun, createSoloCharacter, createDefaultCodex } = await import("../src/state.js");
const { createSavePayload, applySavePayload } = await import("../src/state/save_payload.js");
const { triggerRunResult } = await import("../src/result.js");

function setupRun() {
  initNewGame();
  state.party = [createSoloCharacter("Fighter")];
  state.currentRun = createDefaultCurrentRun();
  state.currentRun.characterClass = "Fighter";
  state.currentRun.deepestFloor = 5;
  state.currentRun.materials = { "獣の牙": 10 };
  state.currentRun.equipmentFound = [{ baseId: "SHORT_SWORD" }];
  state.gameState = "explore";
  state.floor = 5;
  state.codex = createDefaultCodex();
}

function roundTripOutcome(expected) {
  const payload = createSavePayload();
  assert.equal(payload.currentRun.outcome, expected);
  assert.equal(payload.runHistory[0].outcome, expected);
  applySavePayload(JSON.parse(JSON.stringify(payload)));
  assert.equal(state.currentRun.outcome, expected);
  assert.equal(state.runHistory[0].outcome, expected);
}

setupRun();
let confirmCalls = 0;
global.confirm = () => {
  confirmCalls++;
  return false;
};
const { handleExploreAction } = await import("../src/menu/explore_actions.js");
handleExploreAction("abandon");
assert.equal(confirmCalls, 1);
assert.equal(state.gameState, "explore", "cancel leaves the active run in place");
assert.equal(state.currentRun.returnReason, "", "cancel does not assign an ending");

global.confirm = () => true;
triggerRunResult("abandon");
assert.equal(state.gameState, "result");
assert.equal(state.currentRun.returnReason, "abandon");
assert.equal(state.currentRun.outcome, "abandon");
assert.equal(state.currentRun.bankedMaterials["獣の牙"], 3);
assert.deepEqual(state.currentRun.lostMaterials, { "獣の牙": 7 });
assert.equal(state.records.totalRuns, 1);
assert.equal(state.records.deepestRetreat, 0);
assert.equal(state.records.deepestDeath, 0);
assert.equal(state.codex.stats.totalRuns, 1);
assert.equal(state.codex.stats.totalDeaths, 0);
assert.equal(state.deathLogs.length, 0);
assert.equal(state.currentRun.recordResult.outcome, "abandon");
assert.equal(state.runHistory[0].returnReason, "abandon");
assert.equal(state.runHistory[0].outcome, "abandon");
assert.equal(state.runHistory[0].lostUnidentifiedCount, 1);
assert.equal(state.party[0].status, "ok", "abandon is not a character death");

triggerRunResult("gameover");
assert.equal(state.records.totalRuns, 1, "a second ending is ignored");
assert.equal(state.deathLogs.length, 0, "a follow-up death cannot pollute abandon");

roundTripOutcome("abandon");

setupRun();
state.currentRun.deepestFloor = 4;
state.currentRun.materials = { "獣の牙": 10 };
triggerRunResult("retreat");
assert.equal(state.records.totalRuns, 1);
assert.equal(state.records.deepestRetreat, 4);
assert.equal(state.currentRun.bankedMaterials["獣の牙"], 10);
roundTripOutcome("retreat");

state.currentRun = createDefaultCurrentRun();
state.currentRun.characterClass = "Fighter";
state.currentRun.deepestFloor = 6;
state.currentRun.materials = { "獣の牙": 10 };
state.floor = 6;
state.gameState = "explore";
state.combatState = { monsters: [{ name: "検証敵", hp: 10 }] };
triggerRunResult("gameover");
assert.equal(state.records.totalRuns, 2);
assert.equal(state.records.deepestDeath, 6);
assert.equal(state.codex.stats.totalDeaths, 1);
assert.equal(state.deathLogs.length, 1);
roundTripOutcome("death");

console.log("[PASS] abandon run end classification, loss parity, persistence, and retreat/death regression");
