import assert from "node:assert/strict";

const makeElement = () => ({
  style: {},
  className: "",
  textContent: "",
  innerHTML: "",
  scrollTop: 0,
  scrollHeight: 0,
  clientHeight: 0,
  appendChild() {},
  replaceChildren() {},
  addEventListener() {},
  contains() { return false; },
  getElementsByTagName() { return []; },
  setAttribute() {},
  getAttribute() { return ""; },
  focus() {},
  classList: {
    add() {},
    remove() {},
    contains() { return false; },
    toggle() {}
  }
});

global.document = {
  activeElement: null,
  getElementById() { return makeElement(); },
  createElement() { return makeElement(); },
  querySelector() { return makeElement(); },
  querySelectorAll() { return []; }
};
global.window = {};
global.localStorage = {
  getItem() { return null; },
  setItem() {}
};

const { state, createDefaultCurrentRun } = await import("../src/state.js");
const { startTrapEncounter, handleTrapAction } = await import("../src/systems/traps.js");

state.currentRun = createDefaultCurrentRun();
state.currentRun.startedAt = Date.now();
state.party = [{
  name: "Robin",
  class: "Fighter",
  level: 1,
  hp: 1,
  maxHp: 1,
  mp: 0,
  maxMp: 0,
  status: "ok"
}];
state.floor = 1;
state.gameState = "explore";
state.transitioning = false;
state.seed = "TRAP_GAME_OVER";

const trap = {
  id: "trap_game_over",
  floorId: "B1",
  position: { x: 2, y: 1 },
  type: "damage",
  state: "discovered",
  difficulty: 30
};

startTrapEncounter(trap, { x: 2, y: 1 });
handleTrapAction("force");

assert.equal(state.party[0].status, "dead", "lethal trap should kill the character");
assert.equal(state.currentRun.returnReason, "gameover", "lethal trap should record game over");
assert.equal(state.gameState, "result", "trap game over must not be overwritten by explore state");
assert.equal(state.transitioning, false, "game over should leave transitions idle");

console.log("[PASS] lethal floor trap preserves the game-over result state");
