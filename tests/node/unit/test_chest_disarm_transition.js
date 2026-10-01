import assert from "node:assert/strict";

const makeElement = () => ({
  style: {},
  className: "",
  classList: {
    add() {},
    remove() {},
    toggle() {},
    contains() { return false; }
  },
  children: [],
  innerHTML: "",
  textContent: "",
  appendChild(child) { this.children.push(child); },
  replaceChildren(...children) { this.children = children; },
  addEventListener() {},
  removeEventListener() {},
  setAttribute() {},
  getAttribute() { return null; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  closest() { return null; },
  getContext() { return {}; }
});

const elements = new Map();
global.document = {
  activeElement: null,
  documentElement: makeElement(),
  addEventListener() {},
  removeEventListener() {},
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, makeElement());
    return elements.get(id);
  },
  createElement: makeElement,
  querySelector: makeElement,
  querySelectorAll() { return []; }
};
global.window = {};
global.localStorage = {
  getItem() { return null; },
  setItem() {}
};

const { state } = await import("../../../src/state.js");
const { createDefaultCurrentRun } = await import("../../../src/state/initial_state.js");
const { CHEST_PHASES, setupChestState, openChest } = await import("../../../src/chest.js");

const failures = [];

function makeMap() {
  return Array.from({ length: 20 }, () => Array.from({ length: 20 }, () => ({
    walls: [false, false, false, false],
    event: null
  })));
}

function prepareChest() {
  state.floor = 1;
  state.x = 1;
  state.y = 1;
  state.maps[0] = makeMap();
  state.maps[0][1][1].event = "chest";
  state.party = [{
    name: "Robin",
    level: 1,
    hp: 100,
    maxHp: 100,
    status: "ok",
    equipment: { weapon: null, shield: null, armor: null }
  }];
  state.inventory = [];
  state.currentRun = createDefaultCurrentRun();
  state.chestState = null;
  state.gameState = "explore";
  state.transitioning = false;
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`[PASS] ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.error(`[FAIL] ${name}: ${error.message}`);
  }
}

await test("automatic disarm on opening leaves transition state and returns to exploration", () => {
  prepareChest();
  setupChestState("poison needle", null, "HEAL_POTION");
  state.chestState.phase = CHEST_PHASES.MENU;

  assert.equal(openChest(() => 0), true);

  assert.equal(state.transitioning, false);
  // Rewards that fit the bag are taken without a resolution screen (#1835).
  assert.equal(state.gameState, "explore");
  assert.equal(state.currentRun.pendingRewardBundle, null);
  assert.ok(state.inventory.length > 0);
  assert.equal(state.chestState, null);
});

await test("opening without an eligible opener cannot lock the controls", () => {
  prepareChest();
  setupChestState("poison needle", null, "HEAL_POTION");
  state.chestState.phase = CHEST_PHASES.MENU;
  state.party[0].status = "dead";

  assert.equal(openChest(() => 0), false);

  assert.equal(state.transitioning, false);
  assert.equal(state.chestState.phase, CHEST_PHASES.MENU);
  assert.equal(state.chestState.trap, "poison needle");
});

if (failures.length > 0) {
  console.error(`\n${failures.length} chest disarm transition test(s) failed.`);
  process.exit(1);
}

console.log("[PASS] chest disarm transition regression coverage");
