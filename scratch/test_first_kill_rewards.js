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
  const { applyCombatRewards } = await import("../src/combat_logic/rewards.js");
  const assert = await import("assert");

  console.log("=== STARTING FIRST KILL REWARDS REDESIGN VERIFICATION ===");

  // 1. Initial State Setup
  initNewGame();
  state.party = [
    { name: "Fighter", class: "Fighter", level: 1, hp: 20, maxHp: 20, mp: 0, maxMp: 0, status: "ok", exp: 0 }
  ];
  state.firstKills = [];
  state.materials = {};
  state.gold = 0;
  state.identifyTickets = 0;
  
  const wolf = { name: "ワーウルフ", hp: 0, maxHp: 36, level: 3, exp: 100, gold: 60, fled: false, tags: [], spriteType: "wolf" };
  state.combatState = {
    isBoss: false,
    isMidboss: false,
    isRoamingFlack: false,
    monsters: [wolf]
  };
  state.currentRun = {
    kills: 0,
    goldGained: 0,
    expGained: 0,
    materialsFound: {},
    equipmentFound: []
  };

  // 2. First Kill Test (Monster: Wolf, should drop 獣の牙)
  const logQueue = [];
  
  applyCombatRewards(state, [wolf], logQueue);

  // Check Exp (Normal exp: 100 / 1 char = 100. Bonus exp should be 0)
  assert.strictEqual(state.party[0].exp, 100, "Should only gain normal exp (100)");
  assert.strictEqual(state.currentRun.expGained, 100, "Current run exp should be 100");

  // Check Gold (Normal gold: 60 * 0.15 = 9. Bonus gold: flat 100. Total = 109)
  assert.strictEqual(state.gold, 109, "Gold should be 109 (9 normal + 100 bonus)");
  assert.strictEqual(state.currentRun.goldGained, 109, "Current run gold should be 109");

  // Check Materials (Should gain normal drop from drops.js, plus 1 flat 獣の牙 for first kill)
  // Let's check how many "獣の牙" we have
  const wolfMainMat = "獣の牙";
  assert.ok(state.materials[wolfMainMat] >= 1, "Should have gained at least 1 main material");
  assert.ok(state.currentRun.materialsFound[wolfMainMat] >= 1, "Should have recorded in current run");

  // Check state.firstKills
  assert.deepStrictEqual(state.firstKills, ["ワーウルフ"], "First kills list should contain ワーウルフ");

  console.log("[PASS] Test 1: First kill reward changes verified (No bonus exp, flat +100 gold, material added).");

  // 3. Duplicate Kill Test (Same monster, no first-kill bonus)
  const initialGold = state.gold;
  const initialExp = state.party[0].exp;
  const initialMaterials = { ...state.materials };

  const wolf2 = { name: "ワーウルフ A", hp: 0, maxHp: 36, level: 3, exp: 100, gold: 60, fled: false, tags: [], spriteType: "wolf" };
  state.combatState.monsters = [wolf2];
  applyCombatRewards(state, [wolf2], logQueue);

  // Exp should increase by 100 (total 200). Gold should increase by 9. Materials might increase by normal drop, but NO bonus flat +1 material.
  assert.strictEqual(state.party[0].exp, initialExp + 100, "Duplicate: normal exp gained");
  assert.strictEqual(state.gold, initialGold + 9, "Duplicate: normal gold gained (no bonus)");
  
  console.log("[PASS] Test 2: Duplicate kill does not trigger bonuses.");

  // 4. Ticket rewards on 5th new species kill
  // Already killed 1 (ワーウルフ). Let's kill 4 more different monsters.
  // 2nd
  state.combatState.monsters = [{ name: "ゴブリン", hp: 0, exp: 10, gold: 10, fled: false, spriteType: "goblin" }];
  applyCombatRewards(state, state.combatState.monsters, logQueue);
  // 3rd
  state.combatState.monsters = [{ name: "オーク", hp: 0, exp: 10, gold: 10, fled: false, spriteType: "orc" }];
  applyCombatRewards(state, state.combatState.monsters, logQueue);
  // 4th
  state.combatState.monsters = [{ name: "ゾンビ", hp: 0, exp: 10, gold: 10, fled: false, tags: ["undead"], spriteType: "zombie" }];
  applyCombatRewards(state, state.combatState.monsters, logQueue);
  
  assert.strictEqual(state.identifyTickets, 0, "4 species killed: identifyTickets should still be 0");

  // 5th (This should trigger ticket +1)
  state.combatState.monsters = [{ name: "ドラゴン", hp: 0, exp: 10, gold: 10, fled: false, tags: ["dragon"], spriteType: "dragon" }];
  applyCombatRewards(state, state.combatState.monsters, logQueue);

  assert.strictEqual(state.identifyTickets, 1, "5 species killed: identifyTickets should be 1");
  assert.deepStrictEqual(state.firstKills, ["ワーウルフ", "ゴブリン", "オーク", "ゾンビ", "ドラゴン"], "First kills list length should be 5");

  console.log("[PASS] Test 3: Identify ticket reward on 5th first-kill triggered successfully.");

  console.log("=== ALL TICKET-009 VERIFICATION TESTS PASSED SUCCESSFULLY! ===");
})();
