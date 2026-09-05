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
const { CHEST_PHASES, setupChestState, executeDisarm } = await import("../../../src/chest.js");
const { resolvePendingRewardBundle } = await import("../../../src/pending_rewards.js");

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
    class: "Thief",
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

function waitForChestTransition() {
  return new Promise(resolve => setTimeout(resolve, 1600));
}

function resolvePendingRewardsByLeavingThem() {
  const bundle = state.currentRun.pendingRewardBundle;
  if (!bundle) return;
  bundle.entries.forEach(entry => { entry.decision = "leave"; });
  assert.equal(resolvePendingRewardBundle(state).ok, true);
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

await test("successful disarm leaves transition state and returns to exploration", async () => {
  prepareChest();
  setupChestState("poison needle", null, "HEAL_POTION");
  state.chestState.phase = CHEST_PHASES.MENU;

  assert.equal(executeDisarm(state.party[0], () => 0), true);
  await waitForChestTransition();

  assert.equal(state.transitioning, false);
  assert.equal(state.gameState, "submenu");
  resolvePendingRewardsByLeavingThem();
  assert.equal(state.gameState, "explore");
  assert.equal(state.chestState, null);
});

await test("cleared chest state during delayed resolution cannot lock the controls", async () => {
  prepareChest();
  setupChestState("poison needle", null, "HEAL_POTION");
  state.chestState.phase = CHEST_PHASES.MENU;

  assert.equal(executeDisarm(state.party[0], () => 0), true);
  state.chestState = null;
  await waitForChestTransition();

  assert.equal(state.transitioning, false);
  assert.equal(state.gameState, "explore");
});

if (failures.length > 0) {
  console.error(`\n${failures.length} chest disarm transition test(s) failed.`);
  process.exit(1);
}

console.log("[PASS] chest disarm transition regression coverage");
