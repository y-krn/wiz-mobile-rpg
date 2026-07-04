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
  const { state, initNewGame } = await import("../src/state.js");
  const { executeTagInscription } = await import("../src/craft.js");
  const { getCharAffixSum, getItemData } = await import("../src/rules/item_rules.js");
  const { applyTargetedDamageBonus } = await import("../src/combat_logic/damage.js");
  const assert = await import("assert");

  console.log("Starting Inscription Verification Tests...");

  // Initialize
  initNewGame();
  state.inventory = [];
  state.materials = {};
  state.gold = 1000;

  const mockSword = {
    kind: "equipment",
    instanceId: "eq_sword_1",
    baseId: "SHORT_SWORD",
    rarity: "magic",
    identified: true,
    enhanceLevel: 0,
    affixes: []
  };

  const mockUnidentifiedSword = {
    kind: "equipment",
    instanceId: "eq_sword_2",
    baseId: "SHORT_SWORD",
    rarity: "magic",
    identified: false,
    enhanceLevel: 0,
    affixes: []
  };

  // Test 1: 素材・ゴールド不足のチェック
  state.inventory = [mockSword];
  state.materials = { "霊粉": 0 }; // 聖印には 霊粉3 が必要
  state.gold = 1000;

  let success = executeTagInscription(0, "霊粉", "holy", undefined, "add");
  assert.strictEqual(success, false, "Should fail when materials are missing");

  state.materials = { "霊粉": 3 };
  state.gold = 50; // 聖印には 150G 必要
  success = executeTagInscription(0, "霊粉", "holy", undefined, "add");
  assert.strictEqual(success, false, "Should fail when gold is insufficient");

  console.log("-> [PASS] Material and gold insufficiency validation verified");

  // Test 2: 未鑑定装備への刻印不可チェック
  state.inventory = [mockUnidentifiedSword];
  state.materials = { "霊粉": 3 };
  state.gold = 1000;
  success = executeTagInscription(0, "霊粉", "holy", undefined, "add");
  assert.strictEqual(success, false, "Should not allow inscription on unidentified items");

  console.log("-> [PASS] Unidentified items protection verified");

  // Test 3: 正常な刻印実行と、複数刻印（3枠制限）
  state.inventory = [{ ...mockSword }]; // clone to prevent mutating original mock
  state.materials = { "霊粉": 3 };
  state.gold = 1000;
  
  success = executeTagInscription(0, "霊粉", "holy", undefined, "add");
  assert.strictEqual(success, true, "Inscription should succeed with enough materials and gold");
  assert.strictEqual(state.gold, 850, "Gold should be deducted (1000 - 150)");
  assert.strictEqual(state.materials["霊粉"], 0, "Materials should be consumed");

  const inscribedItem = state.inventory[0];
  assert.ok(inscribedItem.inscription, "Item should have inscription field");
  assert.strictEqual(inscribedItem.inscription.type, "antiUndead");
  assert.strictEqual(inscribedItem.inscription.value, 20);

  // 2つ目の刻印が許可されること (複数刻印のサポート)
  state.materials = { "霊粉": 3 };
  state.gold = 1000;
  success = executeTagInscription(0, "霊粉", "holy", undefined, "add");
  assert.strictEqual(success, true, "Should allow multiple inscriptions");

  console.log("-> [PASS] Successful inscription and multiple inscription support verified");

  // Test 4: 刻印済み装備の売却益のチェック（金策ループ防止）
  const normalItemData = getItemData(mockSword); // 刻印なし
  const inscribedItemData = getItemData(inscribedItem); // 刻印あり
  assert.strictEqual(normalItemData.price, inscribedItemData.price, "Sale price should not increase with inscription");

  console.log("-> [PASS] Sale price verification (no money loop) verified");

  // Test 5: 戦闘効果への反映
  const char = {
    class: "Fighter",
    equipment: {
      weapon: inscribedItem
    }
  };
  const val = getCharAffixSum(char, "antiUndead");
  assert.strictEqual(val, 20, "Should get 20% bonus from the inscription");

  const targetUndead = { tags: ["undead"] };
  const targetDragon = { tags: ["dragon"] };
  const baseDmg = 10;
  const dmgUndead = applyTargetedDamageBonus(char, targetUndead, baseDmg);
  assert.strictEqual(dmgUndead, 12, "Should apply +20% damage to undead (10 * 1.2 = 12)");

  const dmgDragon = applyTargetedDamageBonus(char, targetDragon, baseDmg);
  assert.strictEqual(dmgDragon, 10, "Should NOT apply bonus to dragon");

  console.log("-> [PASS] Combat calculation integration verified");

  console.log("All Inscription Verification Tests PASSED!");
})();
