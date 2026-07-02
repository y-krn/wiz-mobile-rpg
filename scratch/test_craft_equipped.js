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
  const { executeEnhance, executeTagInscription } = await import("../src/craft.js");
  const { getItemData } = await import("../src/rules/item_rules.js");
  const { renderCraftEnhance, renderCraftInscriptionSelectEquip } = await import("../src/menu/town_actions.js");

  console.log("=== STARTING EQUIPPED CRAFT VERIFICATION ===");
  initNewGame();
  state.party = [ ...state.roster.slice(0, 4) ];

  // キャラクターと装備の初期化
  const char = state.party[0];
  if (!char) throw new Error("No party member found");

  // 1. 装備中装備の強化テスト
  console.log("\n[Test 1] Enhancing equipped weapon...");
  
  // 装備を設定
  char.equipment.weapon = {
    kind: "equipment",
    instanceId: "eq_test_weapon_123",
    baseId: "SHORT_SWORD",
    rarity: "magic",
    level: 1,
    identified: true,
    enhanceLevel: 0,
    tags: ["iron"]
  };

  // ゴールドと素材を付与 (武器強化コスト: 鉄片x2, 魔石片x1, 200G)
  state.gold = 1000;
  state.materials = {
    "鉄片": 10,
    "魔石片": 10
  };

  // 装備中武器の強化実行
  const successEnhance = executeEnhance({ type: "equipped", actorIdx: 0, slot: "weapon" });
  if (!successEnhance) {
    throw new Error("Failed to executeEnhance on equipped weapon");
  }

  // 状態検証
  const weapon = char.equipment.weapon;
  if (!weapon || weapon.enhanceLevel !== 1) {
    throw new Error(`Expected weapon enhanceLevel to be 1, got ${weapon?.enhanceLevel}`);
  }
  console.log("-> [PASS] Equipped weapon successfully enhanced. Level: " + weapon.enhanceLevel);


  // 2. 装備中装備の刻印テスト
  console.log("\n[Test 2] Inscribing equipped armor...");

  // 防具を設定
  char.equipment.armor = {
    kind: "equipment",
    instanceId: "eq_test_armor_123",
    baseId: "LEATHER_ARMOR",
    rarity: "magic",
    level: 1,
    identified: true,
    enhanceLevel: 0,
    tags: ["leather"]
  };

  // ゴールドと素材を付与 (毒避刻印コスト: 毒腺x2, 硬い皮x2, 100G)
  state.gold = 1000;
  state.materials = {
    "毒腺": 10,
    "硬い皮": 10
  };

  // 装備中防具に刻印を付与 (毒避刻印: 毒耐性+25%)
  const options = { mats: { "毒腺": 2, "硬い皮": 2 }, gold: 100 };
  const successInscription = executeTagInscription(
    { type: "equipped", actorIdx: 0, slot: "armor" },
    null,
    "poison",
    undefined,
    "add",
    options
  );

  if (!successInscription) {
    throw new Error("Failed to executeTagInscription on equipped armor");
  }

  // 状態検証
  const armor = char.equipment.armor;
  if (!armor || !armor.inscription) {
    throw new Error("Expected armor to have an inscription");
  }
  if (armor.inscription.tag !== "poison" || !armor.tags.includes("poison")) {
    throw new Error("Expected armor to have poison tag and inscription applied");
  }
  console.log("-> [PASS] Equipped armor successfully inscribed. Inscription tag: " + armor.inscription.tag);


  // 3. UI 描画関数の煙幕テスト (Smoke Test)
  console.log("\n[Test 3] UI Rendering Smoke Test...");
  const dummyGrid = createDummyElement();
  
  // エラーなく呼び出せることを確認
  renderCraftEnhance(dummyGrid);
  renderCraftInscriptionSelectEquip(dummyGrid);
  console.log("-> [PASS] UI Render functions executed without throwing errors");

  console.log("\n=== ALL EQUIPPED CRAFT VERIFICATION TESTS PASSED SUCCESSFULLY! ===");
})();
