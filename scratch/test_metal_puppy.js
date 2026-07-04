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
  const { MONSTERS } = await import("../src/data/monsters.js");
  const { determineMonsterDrop } = await import("../src/combat_logic/drops.js");
  const { generateEncounter } = await import("../src/combat_ui/encounter.js");
  const assert = await import("assert");

  console.log("=== STARTING METAL PUPPY BALANCE VERIFICATION ===");

  // 1. Verify Monster Properties
  const puppy = MONSTERS.find(m => m.name === "メタルパピー");
  assert.ok(puppy, "メタルパピー definition should exist in MONSTERS");
  assert.strictEqual(puppy.level, 4, "メタルパピー level should be 4");
  assert.strictEqual(puppy.exp, 600, "メタルパピー exp should be 600");
  assert.strictEqual(puppy.gold, 500, "メタルパピー gold should be 500");
  assert.strictEqual(puppy.fleeChance, 0.50, "メタルパピー fleeChance should be 0.50");
  assert.strictEqual(puppy.isRare, true, "メタルパピー isRare should be true");
  assert.strictEqual(puppy.treasureRare, true, "メタルパピー treasureRare should be true");
  console.log("[PASS] Test 1: Monster definition verified.");

  // 2. Verify Guaranteed Drops
  // Floor 3 (Should drop 獣の牙 x2, 硬い皮 x1, 黒角 x1)
  const dropsF3 = determineMonsterDrop(puppy, 3);
  assert.deepStrictEqual(dropsF3, {
    "獣の牙": 2,
    "硬い皮": 1,
    "黒角": 1
  }, "Floor 3 drop should be guaranteed: 獣の牙x2, 硬い皮x1, 黒角x1");

  // Floor 4 (Should drop 獣の牙 x2, 硬い皮 x1, 竜鱗 x1)
  const dropsF4 = determineMonsterDrop(puppy, 4);
  assert.deepStrictEqual(dropsF4, {
    "獣の牙": 2,
    "硬い皮": 1,
    "竜鱗": 1
  }, "Floor 4 drop should be guaranteed: 獣の牙x2, 硬い皮x1, 竜鱗x1");
  console.log("[PASS] Test 2: Guaranteed drops verified.");

  // 3. Verify B1 Encounter Prevention
  // We simulate state on Floor 1 with different distance.
  // Metal Puppy (level 4) should NOT appear on Floor 1.
  for (let dist = 0; dist <= 40; dist++) {
    const dummyState = {
      floor: 1,
      x: dist,
      y: 0,
      seed: Math.floor(Math.random() * 100000),
      party: [{ name: "Hero", status: "ok" }]
    };
    
    // Check if targetLevel + 1 can ever reach 4.
    // Floor 1 targetLevel is: dist < 20 ? 1 : 2.
    // Max targetLevel + 1 on Floor 1 is 2 + 1 = 3.
    // Metal Puppy level is 4, which is > 3. So it must not appear.
    // Let's run generateEncounter 100 times to verify Metal Puppy never spawns
    for (let i = 0; i < 100; i++) {
      const result = generateEncounter(dummyState, false, false, false);
      const hasPuppy = result.monsters.some(m => m.name === "メタルパピー");
      assert.strictEqual(hasPuppy, false, `Metal Puppy should never spawn on Floor 1 (dist=${dist})`);
    }
  }
  console.log("[PASS] Test 3: Floor 1 spawn prevention verified.");

  // 4. Verify B2/B3 Encounter Allowance
  // Floor 2 dist=25 -> targetLevel = 3 -> targetLevel + 1 = 4.
  // Metal Puppy (level 4) should be eligible to spawn here.
  let puppyEligibleOnF2 = false;
  const targetLevelF2Dist25 = 3; // dist >= 20 on Floor 2
  const candidatesF2 = MONSTERS.filter(m => m.treasureRare && m.level <= targetLevelF2Dist25 + 1);
  assert.ok(candidatesF2.some(m => m.name === "メタルパピー"), "Metal Puppy should be a candidate on Floor 2 Far");

  console.log("[PASS] Test 4: Floor 2 Far spawn eligibility verified.");
  console.log("=== ALL METAL PUPPY BALANCE VERIFICATION TESTS PASSED SUCCESSFULLY! ===");
})();
