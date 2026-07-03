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
  const { setupChestState } = await import("../src/chest.js");
  const { generateRandomEquipment, ITEMS } = await import("../src/data.js");
  const assert = await import("assert");

  console.log("Starting Chest Guarantee & Smart Drop Verification Tests...");

  // Test 1: B1F 3-Chest Equipment Guarantee
  initNewGame();

  state.floor = 1;
  state.currentRun = {
    b1ChestsOpened: 0,
    b1EquipFound: 0,
    equipmentFound: [],
    chestsOpened: 0
  };

  // Simulate opening 2 chests without getting any equipment
  setupChestState(null, 10, "HEAL_POTION"); // Encounter 1 (forced potion)
  state.inventory.push("HEAL_POTION");
  state.currentRun.chestsOpened++;

  assert.strictEqual(state.currentRun.b1ChestsOpened, 1, "Opened 1 chest on B1");
  assert.strictEqual(state.currentRun.b1EquipFound, 0, "No equipment found yet");

  setupChestState(null, 10, "ANTIDOTE"); // Encounter 2 (forced potion)
  state.inventory.push("ANTIDOTE");
  state.currentRun.chestsOpened++;

  assert.strictEqual(state.currentRun.b1ChestsOpened, 2, "Opened 2 chests on B1");
  assert.strictEqual(state.currentRun.b1EquipFound, 0, "No equipment found yet");

  // Encounter 3: This must guarantee an equipment drop!
  setupChestState(); 
  state.currentRun.chestsOpened++;

  const generatedItem = state.chestState ? state.chestState.item : null;
  assert.ok(generatedItem, "Item must be generated on 3rd chest");
  assert.strictEqual(typeof generatedItem, "object", "Generated item must be an object (unidentified equipment)");
  assert.strictEqual(generatedItem.kind, "equipment", "Generated item must be equipment");
  assert.strictEqual(generatedItem.rarity, "magic", "Generated item must be magic rarity");

  // Award the generated equipment to inventory
  state.inventory.push(generatedItem);
  state.currentRun.equipmentFound.push(generatedItem);
  state.currentRun.b1EquipFound++; // Increment count on B1

  assert.strictEqual(state.currentRun.b1ChestsOpened, 3, "Opened 3 chests on B1");
  assert.strictEqual(state.currentRun.b1EquipFound, 1, "Equipment count should now be 1");

  console.log("-> [PASS] B1F 3rd Chest Guarantee verified");

  // Test 2: Smart Drop Bias (Prioritize missing slots)
  initNewGame();
  state.floor = 1;

  state.party = [
    {
      name: "Arthur",
      class: "Fighter",
      status: "ok",
      equipment: {
        weapon: null,
        shield: "SMALL_SHIELD",
        armor: "LEATHER_ARMOR"
      }
    },
    {
      name: "Robin",
      class: "Thief",
      status: "ok",
      equipment: {
        weapon: "DAGGER",
        shield: null,
        armor: "LEATHER_ARMOR"
      }
    }
  ];

  let weapons = 0;
  let shields = 0;
  let armors = 0;

  for (let i = 0; i < 100; i++) {
    const eq = generateRandomEquipment(1, null, Math.random, state.party);
    const type = ITEMS[eq.baseId].type;
    if (type === "weapon") weapons++;
    else if (type === "shield") shields++;
    else if (type === "armor") armors++;
  }

  console.log(`Simulation stats (100 seeds): Weapons: ${weapons}, Shields: ${shields}, Armors: ${armors}`);
  assert.ok(armors > weapons, `Armors (${armors}) should be prioritized over weapons (${weapons}) due to missing slot count`);

  console.log("-> [PASS] Smart Drop priority bias verified");
  console.log("All Chest Guarantee & Smart Drop Verification Tests PASSED!");
})();
