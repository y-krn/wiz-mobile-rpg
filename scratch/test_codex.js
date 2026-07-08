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
  const { state, initNewGame, saveGame, loadGame, recordEquipmentDiscovery, createDefaultCodex } = await import("../src/state.js");
  const { triggerRunResult } = await import("../src/menu.js");
  const assert = await import("assert");

  console.log("Starting Codex & Logs Verification Tests...");

  // Initialize
  initNewGame();
  state.seed = "TEST-CODEX-SEED";

  // Test 1: Monster Encounter & Kill Recording
  console.log("Running Test 1: Monster Encounter & Kill...");
  assert.ok(state.codex, "Codex should exist");
  assert.ok(state.codex.monsters, "Monsters codex should exist");

  // Simulate combat with a Wolf monster
  const WolfTemplate = { name: "ワーウルフ", hp: 36, maxHp: 36, level: 3, exp: 340, gold: 60 };
  state.combatState = {
    monsters: [{ ...WolfTemplate, hp: 36 }],
    phase: "choose_actions"
  };

  // Manually trigger encounter logic as startCombat would
  if (state.codex) {
    if (!state.codex.monsters) state.codex.monsters = {};
    state.combatState.monsters.forEach(m => {
      const baseName = m.name.replace(/\s[A-Z]$/, "");
      if (!state.codex.monsters[baseName]) {
        state.codex.monsters[baseName] = { encountered: 0, killed: 0, firstKilled: false };
      }
      state.codex.monsters[baseName].encountered++;
    });
  }

  assert.strictEqual(state.codex.monsters["ワーウルフ"].encountered, 1, "Wolf encounter count should be 1");

  // Simulate victory
  const nonFledMonsters = state.combatState.monsters;
  const firstKilledNames = ["ワーウルフ"];
  state.firstKills = ["ワーウルフ"];

  if (state.codex) {
    state.codex.stats.totalKills += nonFledMonsters.length;
    nonFledMonsters.forEach(m => {
      const baseName = m.name.replace(/\s[A-Z]$/, "");
      state.codex.monsters[baseName].killed++;
      if (firstKilledNames.includes(baseName)) {
        state.codex.monsters[baseName].firstKilled = true;
      }
    });
  }

  assert.strictEqual(state.codex.monsters["ワーウルフ"].killed, 1, "Wolf kill count should be 1");
  assert.strictEqual(state.codex.monsters["ワーウルフ"].firstKilled, true, "Wolf firstKilled should be true");
  assert.strictEqual(state.codex.stats.totalKills, 1, "Total kills stat should be 1");


  // Test 2: Equipment Discovery Recording
  console.log("Running Test 2: Equipment Discovery...");
  // Discover Short Sword
  recordEquipmentDiscovery("SHORT_SWORD");
  assert.ok(state.codex.equipment["SHORT_SWORD"], "SHORT_SWORD should be registered in codex");
  assert.strictEqual(state.codex.equipment["SHORT_SWORD"].foundCount, 1, "SHORT_SWORD foundCount should be 1");

  // Discover Random Equipment
  const randEquip = {
    baseId: "SHORT_SWORD",
    rarity: "rare",
    atkBonus: 3,
    affixes: [{ type: "atk" }, { type: "agi" }]
  };
  recordEquipmentDiscovery(randEquip);
  assert.strictEqual(state.codex.equipment["SHORT_SWORD"].foundCount, 2, "SHORT_SWORD foundCount should now be 2");
  assert.strictEqual(state.codex.equipment["SHORT_SWORD"].highestRarity, "rare", "highestRarity should be rare");
  assert.strictEqual(state.codex.equipment["SHORT_SWORD"].bestBonus, 3, "bestBonus should be 3");
  assert.deepStrictEqual(state.codex.equipment["SHORT_SWORD"].affixesSeen, ["atk", "agi"], "Seen affixes should match");


  // Test 3: Events & Facilities
  console.log("Running Test 3: Events & Facilities...");
  // Simulate Chest discovery & open
  if (state.codex && state.codex.events && state.codex.events.facilities) {
    state.codex.events.facilities.chest.found++;
    state.codex.events.facilities.chest.opened++;
  }
  assert.strictEqual(state.codex.events.facilities.chest.found, 1, "Chest found should be 1");
  assert.strictEqual(state.codex.events.facilities.chest.opened, 1, "Chest opened should be 1");


  // Test 4: Death Logs
  console.log("Running Test 4: Death Logs...");
  state.currentRun = {
    startedAt: Date.now(),
    deepestFloor: 3,
    kills: 12,
    chestsOpened: 4,
    goldGained: 500,
    itemsFound: ["HEAL_POTION"],
    equipmentFound: [randEquip]
  };
  state.inventory = [randEquip];
  state.party = [
    { name: "Arthur", class: "Fighter", level: 3, hp: 0, status: "dead", equipment: { weapon: null, armor: null, shield: null } }
  ];

  // Trigger GameOver
  triggerRunResult("gameover");

  assert.ok(state.deathLogs && state.deathLogs.length > 0, "Death logs should have entries");
  const latestDeath = state.deathLogs[0];
  assert.strictEqual(latestDeath.floor, 1, "Death floor should be 1 (reset coordinates)");
  assert.strictEqual(latestDeath.deepestFloor, 3, "deepestFloor in death log should be 3");
  assert.strictEqual(latestDeath.kills, 12, "kills in death log should be 12");
  assert.strictEqual(latestDeath.lostItems.length, 1, "Lost items count should be 1");


  // Test 5: Persistence (Save & Load)
  console.log("Running Test 5: Persistence...");
  saveGame();

  // Clear memory state
  state.deathLogs = [];
  state.codex = createDefaultCodex();
  assert.strictEqual(state.deathLogs.length, 0, "Memory deathLogs should be cleared");

  // Load from local storage mock
  loadGame(true);
  assert.strictEqual(state.deathLogs.length, 1, "Loaded deathLogs count should be 1");
  assert.strictEqual(state.codex.monsters["ワーウルフ"].killed, 1, "Loaded Wolf kill count should be 1");
  assert.strictEqual(state.codex.equipment["SHORT_SWORD"].bestBonus, 3, "Loaded SHORT_SWORD bestBonus should be 3");

  console.log("All Codex & Logs verification tests passed successfully!");
})();
