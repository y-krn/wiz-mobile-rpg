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

const { state, createDefaultCurrentRun, createSoloCharacter, initNewGame } =
  await import("../../../src/state.js");
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
    character: { class: "Mage", spells: ["KATINO", "HALITO"] },
    monsters: singleTargetMonsters,
    roundNumber: 1,
    canCastSpell: () => true
  });
  assert.deepEqual(action, { type: "spell", targetIdx: 1, spellName: "KATINO" });
});

check("Priest BADIOS prioritizes a holy target", () => {
  const action = chooseAutoCombatAction({
    character: { class: "Priest", spells: ["BADIOS"] },
    monsters: singleTargetMonsters,
    roundNumber: 2,
    canCastSpell: () => true
  });
  assert.deepEqual(action, { type: "spell", targetIdx: 1, spellName: "BADIOS" });
});

check("Mage HALITO targets the lowest HP enemy", () => {
  const action = chooseAutoCombatAction({
    character: { class: "Mage", spells: ["HALITO"] },
    monsters: singleTargetMonsters,
    roundNumber: 2,
    canCastSpell: () => true
  });
  assert.deepEqual(action, { type: "spell", targetIdx: 1, spellName: "HALITO" });
});

check("Mage uses LAHALITO against multiple healthy enemies", () => {
  const action = chooseAutoCombatAction({
    character: { class: "Mage", spells: ["HALITO", "LAHALITO"] },
    monsters: [{ hp: 30 }, { hp: 30 }],
    roundNumber: 2,
    canCastSpell: () => true
  });
  assert.deepEqual(action, { type: "spell", targetIdx: 0, spellName: "LAHALITO" });
});

check("Mage uses MAHALITO when HALITO cannot finish the target", () => {
  const action = chooseAutoCombatAction({
    character: { class: "Mage", spells: ["HALITO", "MAHALITO"] },
    monsters: [{ hp: 30 }],
    roundNumber: 2,
    canCastSpell: () => true
  });
  assert.deepEqual(action, { type: "spell", targetIdx: 0, spellName: "MAHALITO" });
});

check("Priest selects DIALMA first in the healing priority order", () => {
  const action = chooseAutoCombatAction({
    character: { class: "Priest", hp: 85, maxHp: 100, spells: ["DIOS", "MADIOS", "MADI", "DIALMA"] },
    monsters: [{ hp: 30 }],
    roundNumber: 2,
    healingTargetIdx: 0,
    canCastSpell: () => true
  });
  assert.deepEqual(action, { type: "spell", targetIdx: 0, spellName: "DIALMA" });
});

check("Priest falls back to MADI when DIALMA is unavailable", () => {
  const action = chooseAutoCombatAction({
    character: { class: "Priest", hp: 40, maxHp: 100, spells: ["DIOS", "MADIOS", "MADI"] },
    monsters: [{ hp: 30 }],
    roundNumber: 2,
    healingTargetIdx: 0,
    canCastSpell: () => true
  });
  assert.deepEqual(action, { type: "spell", targetIdx: 0, spellName: "MADI" });
});

check("Priest falls back to MADIOS when higher healing spells are unavailable", () => {
  const action = chooseAutoCombatAction({
    character: { class: "Priest", hp: 25, maxHp: 100, spells: ["DIOS", "MADIOS"] },
    monsters: [{ hp: 30 }],
    roundNumber: 2,
    healingTargetIdx: 0,
    canCastSpell: () => true
  });
  assert.deepEqual(action, { type: "spell", targetIdx: 0, spellName: "MADIOS" });
});

check("Priest falls back to DIOS when it is the only healing spell", () => {
  const action = chooseAutoCombatAction({
    character: { class: "Priest", hp: 0, maxHp: 100, spells: ["DIOS"] },
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
    character: { class: "Priest", spells: ["DIOS", "BADIOS"] },
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

check("UI auto combat selects healing for a low HP Priest", () => {
  initNewGame();
  const character = createSoloCharacter("Priest");
  character.hp = 1;
  character.spells = ["DIOS"];
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

check("unsupported elite classes remain outside the shared basic-class policy", () => {
  const action = chooseAutoCombatAction({
    character: { class: "Bishop", spells: ["BADIOS"] },
    monsters: singleTargetMonsters,
    roundNumber: 1,
    canCastSpell: () => true
  });
  assert.equal(action, null);
});

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("[PASS] auto combat action selection");
