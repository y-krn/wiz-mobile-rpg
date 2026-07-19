import assert from "node:assert/strict";

global.localStorage = (() => {
  let store = {};
  return {
    getItem: key => store[key] || null,
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: key => { delete store[key]; },
    clear: () => { store = {}; },
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
  className: "",
  cloneNode: () => createDummyElement(),
});

global.document = {
  getElementById: () => createDummyElement(),
  querySelector: () => createDummyElement(),
  querySelectorAll: () => [],
  createElement: () => createDummyElement(),
  body: createDummyElement(),
};

global.window = {
  innerWidth: 375,
  innerHeight: 667,
  addEventListener: () => {},
};

Object.defineProperty(global, "navigator", {
  value: { userAgent: "node" },
  writable: true,
  configurable: true,
});

const {
  state,
  initNewGame,
  createDefaultCurrentRun,
  createSoloCharacter,
} = await import("../src/state.js");
const { playBattleLogs } = await import("../src/combat_ui/battle_log_player.js");
const { triggerRunResult } = await import("../src/result.js");

const failures = [];

async function test(name, fn) {
  try {
    await fn();
    console.log(`[PASS] ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.error(`[FAIL] ${name}`);
    console.error(error);
  }
}

await test("triggerChest clears combat state and party buffs", () => {
  initNewGame();
  const character = createSoloCharacter("Fighter");
  character.buffs = { attackUp: 2 };
  state.party = [character];
  state.currentRun = createDefaultCurrentRun();
  state.gameState = "combat";
  state.combatState = {
    isAuto: true,
    monsters: [{ name: "ゴブリン A", hp: 0, maxHp: 8 }],
  };

  const originalSetTimeout = global.setTimeout;
  global.setTimeout = callback => {
    callback();
    return 1;
  };
  try {
    playBattleLogs([{ msg: "宝箱が現れた。", triggerChest: true }], 0);
  } finally {
    global.setTimeout = originalSetTimeout;
  }

  assert.ok(state.chestState, "triggerChest branch must set up chest state");
  assert.equal(state.combatState, null);
  assert.equal("buffs" in character, false);
});

await test("gameover keeps enemy cause before clearing combat state and buffs", () => {
  initNewGame();
  const character = createSoloCharacter("Fighter");
  character.buffs = { defenseUp: 3 };
  state.party = [character];
  state.currentRun = createDefaultCurrentRun();
  state.floor = 3;
  state.combatState = {
    monsters: [{ name: "オーク A", hp: 12, maxHp: 20 }],
  };

  triggerRunResult("gameover");

  assert.equal(state.gameState, "result");
  assert.equal(state.deathLogs[0].cause, "オーク Aとの戦闘");
  assert.equal(state.combatState, null);
  assert.equal("buffs" in character, false);
});

if (failures.length > 0) {
  console.error(`\n${failures.length} combat state cleanup test(s) failed.`);
  process.exit(1);
}
