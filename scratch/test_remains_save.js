// Mock localStorage and basic DOM for Node.js test environment before imports
global.localStorage = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; }
  };
})();

const createDummyElement = () => ({
  style: {},
  appendChild: () => createDummyElement(),
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

global.window = {
  innerWidth: 375,
  innerHeight: 667,
  addEventListener: () => {}
};

Object.defineProperty(global, "navigator", {
  value: { userAgent: "node" },
  writable: true,
  configurable: true
});

(async () => {
  const assert = await import("assert");
  const { state, initNewGame, saveAutosave, loadGame } = await import("../src/state.js");
  const { triggerRunResult } = await import("../src/menu.js");
  const { enterDungeon } = await import("../src/movement.js");

  console.log("=== STARTING REMAINS AND SAVE/DUNGEON ENTER VERIFICATION TESTS ===");

  // 1. Initial State Setup
  initNewGame();
  state.seed = "TEST-REMAINS-SEED";
  state.gold = 1000;
  const char = { name: "Arthur", class: "Fighter", level: 3, hp: 20, maxHp: 20, status: "ok", equipment: { weapon: null, armor: null, shield: null } };
  state.roster = [char];
  state.party = [char];
  state.inventory = ["HEAL_POTION", "DRAGON_KEY"]; // DRAGON_KEYは重要品なので100%遺留品になる

  // 2. Trigger GameOver (triggerRunResult)
  console.log("Test 1: triggerRunResult('gameover') should generate remains and wipedFloor coordinates...");
  triggerRunResult("gameover");

  assert.default.ok(state.remains.length > 0, "Remains should be generated");
  const latestRemains = state.remains[0];
  assert.default.strictEqual(latestRemains.floor, 1, "Remains floor should match");
  assert.default.strictEqual(latestRemains.items.includes("DRAGON_KEY"), true, "DRAGON_KEY should be preserved in remains");
  assert.default.strictEqual(state.party[0].status, "dead", "Party member should be dead");
  assert.default.strictEqual(state.currentRun.wipedFloor, 1, "wipedFloor coordinates should be saved in currentRun");
  assert.default.strictEqual(state.currentRun.wipedX, latestRemains.x, "wipedX should match remains x");
  assert.default.strictEqual(state.currentRun.wipedY, latestRemains.y, "wipedY should match remains y");
  console.log("-> [PASS] remains generation and wipedFloor variables verified");

  // 3. Save & Load (saveAutosave & loadGame)
  console.log("Test 2: Remains should persist after saveAutosave() and loadGame()...");
  saveAutosave();

  // Clear remains in memory
  state.remains = [];
  assert.default.strictEqual(state.remains.length, 0, "Memory remains should be cleared for test");

  loadGame();
  assert.default.strictEqual(state.remains.length, 1, "Remains should be loaded back from save");
  assert.default.strictEqual(state.remains[0].items.includes("DRAGON_KEY"), true, "DRAGON_KEY should persist in loaded remains");
  console.log("-> [PASS] remains persistence verified");

  // 4. enterDungeon with all dead party members
  console.log("Test 3: enterDungeon() with all dead party members should not enter explore state...");
  state.gameState = "town";
  state.floor = 1;
  // party is already dead from the gameover test
  assert.default.strictEqual(state.party.every(c => c.status === "dead"), true, "All party members should be dead");

  enterDungeon();
  assert.default.strictEqual(state.gameState, "town", "Should remain in town state when party is all dead");
  console.log("-> [PASS] dead party dungeon enter restriction verified");

  // 5. enterDungeon with living party members
  console.log("Test 4: enterDungeon() with a living party member should enter explore state...");
  state.party[0].status = "ok";
  state.party[0].hp = 20;

  enterDungeon();
  assert.default.strictEqual(state.gameState, "explore", "Should enter explore state when there is a living member");
  console.log("-> [PASS] living party dungeon enter verified");

  console.log("=== ALL REMAINS AND DUNGEON ENTER TESTS PASSED SUCCESSFULLY! ===");
})();
