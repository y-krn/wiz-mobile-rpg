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
  addEventListener: () => {},
  AudioContext: class {},
  webkitAudioContext: class {}
};

Object.defineProperty(global, "navigator", {
  value: { userAgent: "node" },
  writable: true,
  configurable: true
});

(async () => {
  const { state, initNewGame } = await import("../src/state.js");
  const { executeDismantle, getDismantleResults } = await import("../src/craft.js");
  const assert = await import("assert");

  console.log("Starting Workshop Dismantle Verification Tests...");

  // Initialize
  initNewGame();
  state.inventory = [];
  state.materials = {};

  // Test 1: getDismantleResults mapping
  const mockWeaponMagic = {
    kind: "equipment",
    instanceId: "test_eq_1",
    baseId: "SHORT_SWORD",
    rarity: "magic",
    identified: true,
    affixes: []
  };
  const res1 = getDismantleResults(mockWeaponMagic);
  assert.deepStrictEqual(res1, { "鉄片": 1 }, "Magic Short Sword should yield 1 Iron Scrap");

  const mockWeaponRare = {
    kind: "equipment",
    instanceId: "test_eq_2",
    baseId: "SHORT_SWORD",
    rarity: "rare",
    identified: true,
    affixes: []
  };
  const res2 = getDismantleResults(mockWeaponRare);
  assert.deepStrictEqual(res2, { "鉄片": 2, "骨片": 1 }, "Rare Short Sword should yield 2 Iron Scrap, 1 Bone Fragment");

  const mockArmorEpic = {
    kind: "equipment",
    instanceId: "test_eq_3",
    baseId: "ROBE",
    rarity: "epic",
    identified: true,
    affixes: []
  };
  const res3 = getDismantleResults(mockArmorEpic);
  assert.deepStrictEqual(res3, { "呪布": 2, "黒角": 1 }, "Epic Robe should yield 2 Cursed Cloth, 1 Demon Horn");

  console.log("-> [PASS] Dismantle mapping verified");

  // Test 2: executeDismantle execution and inventory deletion
  state.inventory = [mockWeaponMagic, mockWeaponRare, mockArmorEpic];
  state.materials = {};

  const success1 = executeDismantle(0); // Short Sword (magic)
  assert.strictEqual(success1, true, "Dismantle should succeed");
  assert.strictEqual(state.inventory.length, 2, "Inventory size should decrease");
  assert.strictEqual(state.materials["鉄片"], 1, "Should gain 1 Iron Scrap");

  const success2 = executeDismantle(0); // Short Sword (rare) - index shifted
  assert.strictEqual(success2, true);
  assert.strictEqual(state.inventory.length, 1);
  assert.strictEqual(state.materials["鉄片"], 3, "Should have 3 Iron Scrap total");
  assert.strictEqual(state.materials["骨片"], 1, "Should gain 1 Bone Fragment");

  console.log("-> [PASS] executeDismantle execution verified");
  console.log("All Workshop Dismantle Verification Tests PASSED!");
})();
