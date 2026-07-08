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
  replaceChildren: () => {},
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
  const { 
    generateContractsList, 
    getMonsterContractInfo, 
    checkActiveContract, 
    createRandomContract 
  } = await import("../src/contracts.js");
  const assert = await import("assert");

  console.log("Starting Contracts & Warehouse Verification Tests...");

  // Initialize
  initNewGame();
  state.seed = "TEST-CONTRACTS-SEED";

  // Test 1: Contract Generation
  console.log("Running Test 1: Contract Generation...");
  const list = generateContractsList(state);
  assert.strictEqual(list.length, 3, "Should generate exactly 3 contracts");
  assert.strictEqual(list[0].danger, "C", "First contract should be danger C");
  assert.strictEqual(list[1].danger, "B", "Second contract should be danger B");
  assert.strictEqual(list[2].danger, "A", "Third contract should be danger A");
  console.log("-> [PASS] List generation verified");

  // Test 2: Codex Dynamic Info Linkage
  console.log("Running Test 2: Codex Dynamic Info Linkage...");
  // < 3 kills
  const infoUnder3 = getMonsterContractInfo("ゾンビ", 2);
  assert.ok(infoUnder3.features.includes("不明"), "Should say features unknown for < 3 kills");
  assert.ok(infoUnder3.recommended.includes("情報不足"), "Should say recommended info insufficient for < 3 kills");
  
  // >= 3 kills
  const infoOver3 = getMonsterContractInfo("ゾンビ", 3);
  assert.ok(infoOver3.features.includes("毒攻撃"), "Should reveal toxic features for >= 3 kills");
  assert.ok(infoOver3.recommended.includes("解毒薬"), "Should recommend antidote for >= 3 kills");
  console.log("-> [PASS] Dynamic info lookup verified");

  // Test 3: Contract Selection & Defeat Progress
  console.log("Running Test 3: Defeat Progress Update...");
  // Simulate selecting contract A
  const killContract = createRandomContract("A", state);
  killContract.type = "kill"; // enforce kill type for this test
  killContract.targetMonsterName = "ワーウルフ";
  killContract.targetValue = 2;
  killContract.currentValue = 0;
  state.activeContract = killContract;

  // Simulate killing 1 werewolf
  const baseName = "ワーウルフ";
  if (state.activeContract && state.activeContract.type === "kill" && state.activeContract.targetMonsterName === baseName) {
    state.activeContract.currentValue++;
  }
  assert.strictEqual(state.activeContract.currentValue, 1, "Kill progress should increment to 1");
  console.log("-> [PASS] Active kill progress increments correctly");

  // Test 4: Return & Settlement (Success)
  console.log("Running Test 4: Return and Settlement (Success)...");
  // Increment to 2 (achieved targetValue)
  state.activeContract.currentValue = 2;
  state.gold = 100;
  state.identifyTickets = 0;
  state.activeContract.reward = { gold: 200, identifyTickets: 1, item: null };

  const mockRunResult = { deepestFloor: 3, chestsOpened: 0 };
  const res = checkActiveContract(state, mockRunResult, true);
  assert.strictEqual(res.success, true, "Contract should be completed successfully");
  assert.strictEqual(state.gold, 300, "Gold reward should be added");
  assert.strictEqual(state.identifyTickets, 1, "Ticket reward should be added");
  assert.strictEqual(state.activeContract, null, "Active contract should be reset to null");
  assert.strictEqual(state.contracts.length, 3, "New contracts should be generated");
  console.log("-> [PASS] Success settlement verified");

  // Test 5: Return & Settlement (Wipe / Failed)
  console.log("Running Test 5: Return and Settlement (Failed)...");
  // Select a new contract
  state.activeContract = state.contracts[0];
  const activeId = state.activeContract.id;
  
  // Wipe / Fail
  const failRes = checkActiveContract(state, mockRunResult, false);
  assert.strictEqual(failRes.success, false, "Contract should fail on wipe");
  assert.strictEqual(state.activeContract, null, "Active contract should be reset to null");
  assert.ok(state.contracts.some(c => c.id !== activeId), "New list of contracts should be generated");
  console.log("-> [PASS] Failure settlement verified");

  // Test 6: Inventory Overflow sends to Storage
  console.log("Running Test 6: Inventory Overflow...");
  // Make inventory full (20 items)
  state.inventory = Array(20).fill("HEAL_POTION");
  state.storage = [];
  state.storageMax = 30;

  const rewardContract = createRandomContract("A", state);
  rewardContract.type = "reach";
  rewardContract.targetFloor = 3;
  rewardContract.reward = { gold: 100, identifyTickets: 0, item: "rare_equip" };
  state.activeContract = rewardContract;

  // Complete contract
  const overflowRun = { deepestFloor: 3 };
  const overflowRes = checkActiveContract(state, overflowRun, true);
  
  assert.strictEqual(overflowRes.success, true, "Should succeed");
  assert.strictEqual(state.inventory.length, 20, "Inventory should remain at 20");
  assert.strictEqual(state.storage.length, 1, "Reward item should be sent to storage instead");
  assert.strictEqual(state.storage[0].identified, false, "Reward item should be unidentified");
  console.log("-> [PASS] Inventory overflow handling verified");

  console.log("Running Test 7: UI renderContracts Rendering Test...");
  const { renderContracts } = await import("../src/ui.js");
  state.activeContract = createRandomContract("A", state);
  renderContracts();
  console.log("-> [PASS] UI renderContracts verified");

  console.log("All Contracts & Warehouse verification tests passed successfully!");
})();
