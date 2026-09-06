import assert from "node:assert/strict";
import { chooseAutoCombatAction } from "../../../src/combat_logic/auto_action.js";

globalThis.localStorage = (() => {
  const store = {};
  return {
    getItem: key => store[key] || null,
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: key => { delete store[key]; }
  };
})();

const createDummyElement = () => ({
  style: {},
  appendChild: () => createDummyElement(),
  replaceChildren: () => {},
  addEventListener: () => {},
  classList: {
    add: () => {},
    remove: () => {},
    contains: () => false,
    toggle: () => {}
  },
  setAttribute: () => {},
  getAttribute: () => "",
  removeAttribute: () => {},
  innerHTML: "",
  textContent: "",
  className: "",
  cloneNode: () => createDummyElement()
});

globalThis.document = {
  activeElement: null,
  getElementById: () => createDummyElement(),
  querySelector: () => createDummyElement(),
  querySelectorAll: () => [],
  createElement: () => createDummyElement(),
  body: createDummyElement()
};

globalThis.window = {
  innerWidth: 375,
  innerHeight: 667,
  addEventListener: () => {}
};

Object.defineProperty(globalThis, "navigator", {
  value: { userAgent: "node" },
  writable: true,
  configurable: true
});

const { state, createDefaultCurrentRun, initNewGame } =
  await import("../../../src/state.js");
const { createSocketedRuneCharacter } = await import("../fixtures/vnext_character.js");
const { advanceActionSelection } = await import("../../../src/combat_ui/action_selection.js");
const { combatSelection } = await import("../../../src/combat_ui/combat_state.js");

const failures = [];

function check(name, fn) {
  try {
    fn();
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
  }
}

const singleTargetMonsters = [
  { hp: 30, status: "ok", tags: [] },
  { hp: 10, status: "ok", tags: ["undead"] },
  { hp: 20, status: "ok", tags: [] }
];

check("KATINO is selected on round 1 against multiple enemies", () => {
  const action = chooseAutoCombatAction({
    character: createSocketedRuneCharacter(["KATINO", "HALITO"]),
    monsters: singleTargetMonsters,
    roundNumber: 1,
    canCastSpell: () => true
  });
  assert.deepEqual(action, { type: "spell", targetIdx: 1, spellName: "KATINO" });
});

check("holy offensive spell prioritizes a holy target", () => {
  const action = chooseAutoCombatAction({
    character: createSocketedRuneCharacter(["BADIOS"]),
    monsters: singleTargetMonsters,
    roundNumber: 2,
    canCastSpell: () => true
  });
  assert.deepEqual(action, { type: "spell", targetIdx: 1, spellName: "BADIOS" });
});

check("offensive spell targets the lowest HP enemy", () => {
  const action = chooseAutoCombatAction({
    character: createSocketedRuneCharacter(["HALITO"]),
    monsters: singleTargetMonsters,
    roundNumber: 2,
    canCastSpell: () => true
  });
  assert.deepEqual(action, { type: "spell", targetIdx: 1, spellName: "HALITO" });
});

check("area spell is selected against multiple healthy enemies", () => {
  const action = chooseAutoCombatAction({
    character: createSocketedRuneCharacter(["HALITO", "LAHALITO"]),
    monsters: [{ hp: 30 }, { hp: 30 }],
    roundNumber: 2,
    canCastSpell: () => true
  });
  assert.deepEqual(action, { type: "spell", targetIdx: 0, spellName: "LAHALITO" });
});

check("stronger spell is selected when the basic spell cannot finish the target", () => {
  const action = chooseAutoCombatAction({
    character: createSocketedRuneCharacter(["HALITO", "MAHALITO"]),
    monsters: [{ hp: 30 }],
    roundNumber: 2,
    canCastSpell: () => true
  });
  assert.deepEqual(action, { type: "spell", targetIdx: 0, spellName: "MAHALITO" });
});

check("healing priority selects DIALMA first", () => {
  const action = chooseAutoCombatAction({
    character: createSocketedRuneCharacter(["DIOS", "MADIOS", "DIALMA"], { hp: 85, maxHp: 100 }),
    monsters: [{ hp: 30 }],
    roundNumber: 2,
    healingTargetIdx: 0,
    canCastSpell: () => true
  });
  assert.deepEqual(action, { type: "spell", targetIdx: 0, spellName: "DIALMA" });
});

check("healing priority falls back to MADI", () => {
  const action = chooseAutoCombatAction({
    character: createSocketedRuneCharacter(["DIOS", "MADIOS", "MADI"], { hp: 40, maxHp: 100 }),
    monsters: [{ hp: 30 }],
    roundNumber: 2,
    healingTargetIdx: 0,
    canCastSpell: () => true
  });
  assert.deepEqual(action, { type: "spell", targetIdx: 0, spellName: "MADI" });
});

check("healing priority falls back to MADIOS", () => {
  const action = chooseAutoCombatAction({
    character: createSocketedRuneCharacter(["DIOS", "MADIOS"], { hp: 25, maxHp: 100 }),
    monsters: [{ hp: 30 }],
    roundNumber: 2,
    healingTargetIdx: 0,
    canCastSpell: () => true
  });
  assert.deepEqual(action, { type: "spell", targetIdx: 0, spellName: "MADIOS" });
});

check("healing priority falls back to DIOS", () => {
  const action = chooseAutoCombatAction({
    character: createSocketedRuneCharacter(["DIOS"], { hp: 0, maxHp: 100 }),
    monsters: [{ hp: 30 }],
    roundNumber: 2,
    healingTargetIdx: 0,
    canCastSpell: () => true
  });
  assert.deepEqual(action, { type: "spell", targetIdx: 0, spellName: "DIOS" });
});

check("DIOS reserves one MP before offensive casting", () => {
  const calls = [];
  const action = chooseAutoCombatAction({
    character: createSocketedRuneCharacter(["DIOS", "BADIOS"]),
    monsters: [{ hp: 30, status: "ok", tags: [] }],
    roundNumber: 2,
    canCastSpell: (spellName, reserveMp) => {
      calls.push({ spellName, reserveMp });
      return reserveMp === 0;
    }
  });
  assert.deepEqual(action, { type: "fight", targetIdx: 0 });
  assert.deepEqual(calls, [{ spellName: "BADIOS", reserveMp: 1 }]);
});

check("UI auto combat selects healing for a low HP character", () => {
  initNewGame();
  const character = createSocketedRuneCharacter(["DIOS"]);
  character.hp = 1;
  state.party = [character];
  state.currentRun = createDefaultCurrentRun();
  state.gameState = "combat";
  state.combatState = {
    monsters: [{ name: "テスト敵", hp: 100, maxHp: 100, status: "sleep", agi: 1 }],
    phase: "choose_actions",
    isBoss: false,
    isMidboss: false,
    isRoamingFlack: false,
    isAuto: true,
    allParalyzedTurns: 0,
    roundNumber: 2,
    retreatPosition: null,
    loggedCoreActivations: [],
    pendingOutcome: null
  };
  combatSelection.charIdx = 0;
  combatSelection.actions = [];

  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = () => 1;
  try {
    advanceActionSelection();
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }

  assert.deepEqual(combatSelection.actions[0], {
    type: "spell",
    targetIdx: 0,
    spellName: "DIOS",
    actorIdx: 0
  });
});

check("active spell types drive the shared policy without class special cases", () => {
  const action = chooseAutoCombatAction({
    character: createSocketedRuneCharacter(["BADIOS"]),
    monsters: singleTargetMonsters,
    roundNumber: 1,
    canCastSpell: () => true
  });
  assert.deepEqual(action, {
    type: "spell",
    targetIdx: 1,
    spellName: "BADIOS"
  });
});

check("legacy char.spells cannot grant auto spell permission", () => {
  const action = chooseAutoCombatAction({
    character: { spells: ["HALITO"] },
    monsters: [{ hp: 30, status: "ok", tags: [] }],
    roundNumber: 2,
    canCastSpell: () => true
  });
  assert.deepEqual(action, { type: "fight", targetIdx: 0 });
});

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("[PASS] auto combat action selection");
