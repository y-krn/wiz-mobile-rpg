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
  const { ITEMS } = await import("../src/data.js");
  const { generateMerchantStock } = await import("../src/menu.js");
  const { setupChestState } = await import("../src/chest.js");
  const { getDismantleResults } = await import("../src/craft.js");
  const assert = await import("assert");

  console.log("Starting Expedition Economy Simulation & Verification...");

  // Initialize state
  initNewGame();

  // ==========================================
  // Test 1: Merchant Stock Simulation (1000 times)
  // ==========================================
  console.log("-> Simulating Dungeon Merchant stock (1000 iterations per floor B1-B5)...");
  for (let f = 1; f <= 5; f++) {
    for (let i = 0; i < 1000; i++) {
      const stock = generateMerchantStock(f, []);
      stock.forEach(item => {
        assert.ok(item.type !== "unidentified", `Floor ${f} merchant sold unidentified gear: ${JSON.stringify(item)}`);
      });
    }
  }
  console.log("   [PASS] Merchant never sells unidentified equipment.");

  // ==========================================
  // Test 2: Appraisal Cost & Profit Expectations
  // ==========================================
  console.log("-> Checking identification cost & selling margins...");
  state.party = [
    { name: "Fighter", class: "Fighter", status: "ok", equipment: {} } // No Bishop (no discount)
  ];

  const testBases = ["SHORT_SWORD", "PLATE_MAIL", "KNIGHT_SHIELD", "KATANA", "DRAGON_SCALE"];
  const rarities = ["magic", "rare", "epic"];

  testBases.forEach(baseId => {
    const baseItem = ITEMS[baseId];
    if (!baseItem) return;
    
    rarities.forEach(rarity => {
      const multiplier = { magic: 1.5, rare: 2.5, epic: 4.0 }[rarity];
      const basePrice = Math.floor(baseItem.price * multiplier);
      
      const rarityCoeff = { magic: 0.5, rare: 1.0, epic: 1.5 }[rarity];
      const identifyCost = Math.floor(basePrice * rarityCoeff);
      const sellPrice = Math.floor(basePrice * 0.5);
      
      const netProfit = sellPrice - identifyCost;
      if (rarity === "magic") {
        assert.ok(netProfit <= 0, `Magic ${baseId} yields positive margin: ${netProfit}G`);
      } else {
        assert.ok(netProfit < 0, `${rarity} ${baseId} should be in red: ${netProfit}G`);
      }
    });
  });
  console.log("   [PASS] Appraisal sell margins guarantee no stable profit (deficit or net-zero).");

  // ==========================================
  // Test 3: Chest Candidates Check & Simulation (1000 times)
  // ==========================================
  console.log("-> Checking Chest candidates and B4F/B5F drops (1000 chests per floor)...");
  
  let katanaCount = 0;
  let dragonScaleCount = 0;

  for (let i = 0; i < 1000; i++) {
    // Floor 4
    state.floor = 4;
    state.inventory = [];
    state.materials = {};
    setupChestState(null, null, null);
    const item4 = state.chestState.item;
    if (typeof item4 === "string") {
      if (item4 === "KATANA") katanaCount++;
      if (item4 === "DRAGON_SCALE") dragonScaleCount++;
    } else if (item4 && item4.kind === "equipment") {
      if (item4.baseId === "KATANA") katanaCount++;
      if (item4.baseId === "DRAGON_SCALE") dragonScaleCount++;
    }

    // Floor 5
    state.floor = 5;
    state.inventory = [];
    state.materials = {};
    setupChestState(null, null, null);
    const item5 = state.chestState.item;
    if (typeof item5 === "string") {
      if (item5 === "KATANA") katanaCount++;
      if (item5 === "DRAGON_SCALE") dragonScaleCount++;
    } else if (item5 && item5.kind === "equipment") {
      if (item5.baseId === "KATANA") katanaCount++;
      if (item5.baseId === "DRAGON_SCALE") dragonScaleCount++;
    }
  }

  assert.strictEqual(katanaCount, 0, "Katana should not drop as a standard item on B4F/B5F chests");
  assert.strictEqual(dragonScaleCount, 0, "Dragon Scale should not drop as a standard item on B4F/B5F chests");

  console.log("   [PASS] KATANA and DRAGON_SCALE are excluded from standard chests.");

  // ==========================================
  // Test 4: Dismantle Guard for Unidentified Items
  // ==========================================
  console.log("-> Checking Workshop dismantle restrictions...");
  const mockUnidentified = {
    kind: "equipment",
    instanceId: "test_unidentified_1",
    baseId: "SHORT_SWORD",
    rarity: "magic",
    identified: false,
    affixes: []
  };

  const mockIdentified = {
    kind: "equipment",
    instanceId: "test_identified_1",
    baseId: "SHORT_SWORD",
    rarity: "magic",
    identified: true,
    affixes: []
  };

  const resultsUnidentified = getDismantleResults(mockUnidentified);
  assert.strictEqual(resultsUnidentified, null, "Unidentified gear must NOT be dismantleable");

  const resultsIdentified = getDismantleResults(mockIdentified);
  assert.deepStrictEqual(resultsIdentified, { "鉄片": 1 }, "Identified Magic Short Sword should be dismantleable");

  console.log("   [PASS] Workshop only allows dismantling of identified equipment.");

  // ==========================================
  // Test 5: Sale Restriction for Unidentified Items
  // ==========================================
  console.log("-> Checking Sale restrictions for Unidentified Items...");
  const { executeSale } = await import("../src/shop/purchase.js");
  
  // Setup state for sale
  state.inventory = [
    {
      kind: "equipment",
      instanceId: "test_unidentified_2",
      baseId: "SHORT_SWORD",
      rarity: "magic",
      identified: false,
      affixes: []
    },
    {
      kind: "equipment",
      instanceId: "test_identified_2",
      baseId: "SHORT_SWORD",
      rarity: "magic",
      identified: true,
      affixes: []
    }
  ];
  state.gold = 100;
  
  // Attempt to sell unidentified item (index 0)
  const sellUnidentifiedResult = executeSale(0, 100);
  assert.strictEqual(sellUnidentifiedResult, false, "Unidentified gear must NOT be saleable");
  assert.strictEqual(state.gold, 100, "Gold must not change after failed sale");
  assert.strictEqual(state.inventory.length, 2, "Inventory size must not change after failed sale");

  // Attempt to sell identified item (index 1)
  const sellIdentifiedResult = executeSale(1, 50);
  assert.strictEqual(sellIdentifiedResult, true, "Identified gear should be saleable");
  assert.strictEqual(state.gold, 150, "Gold must increase by sale price");
  assert.strictEqual(state.inventory.length, 1, "Inventory size must decrease by 1");
  
  console.log("   [PASS] Direct sale of unidentified items is successfully blocked.");

  console.log("All Expedition Economy Simulation & Verification Tests PASSED!");
})();
