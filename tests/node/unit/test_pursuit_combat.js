import assert from "node:assert/strict";

const makeDummyElement = () => ({
  style: { setProperty: () => {}, removeProperty: () => {} },
  dataset: {},
  append: () => {},
  appendChild: () => {},
  replaceChildren: () => {},
  addEventListener: () => {},
  classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} },
  setAttribute: () => {},
  getAttribute: () => "",
  querySelector: () => null,
  querySelectorAll: () => [],
  textContent: "",
  innerHTML: ""
});

global.document = {
  activeElement: null,
  getElementById: () => makeDummyElement(),
  createElement: () => makeDummyElement(),
  querySelector: () => null,
  querySelectorAll: () => []
};
global.window = {};
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.setTimeout = callback => { callback(); return 0; };

const { state, createDefaultCurrentRun, createStartingKitCharacter } = await import("../../../src/state.js");
const { executeEnterDungeon } = await import("../../../src/movement.js");
const { startCombat } = await import("../../../src/combat.js");

// A pack that caught up (#2114) starts its fight as it was left, even when it
// holds monsters born in the first fight (a split slime's offspring), which
// have no template of their own.
state.party = [createStartingKitCharacter("vanguard")];
state.currentRun = createDefaultCurrentRun();
executeEnterDungeon(1);
const pack = [
  { name: "分裂スライムの分裂体2", hp: 3, maxHp: 6, atk: 2, def: 0, exp: 1, traits: [], buffs: [], status: "ok", tags: [] },
  { name: "マッドスライム", hp: 5, maxHp: 12, atk: 3, def: 1, exp: 4, traits: [], buffs: [], status: "ok", tags: [] }
];
startCombat(false, false, false, null, { pursuitMonsters: pack });
assert.equal(state.gameState, "combat");
assert.deepEqual(state.combatState.monsters.map(monster => [monster.name, monster.hp]), [["分裂スライムの分裂体2", 3], ["マッドスライム", 5]]);
console.log("[PASS] a pack that caught up fights as it was left");
