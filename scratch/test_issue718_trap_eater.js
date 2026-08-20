import assert from "node:assert/strict";

const makeElement = () => ({
  style: {},
  className: "",
  classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  children: [],
  innerHTML: "",
  textContent: "",
  appendChild(child) { this.children.push(child); },
  replaceChildren(...children) { this.children = children; },
  addEventListener() {},
  removeEventListener() {},
  setAttribute() {},
  getAttribute() { return null; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  closest() { return null; },
  getContext() { return {}; }
});

const elements = new Map();
global.document = {
  activeElement: null,
  documentElement: makeElement(),
  addEventListener() {},
  removeEventListener() {},
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, makeElement());
    return elements.get(id);
  },
  createElement: makeElement,
  querySelector: makeElement,
  querySelectorAll() { return []; }
};
global.window = { localStorage: { getItem() { return null; }, setItem() {} } };
global.localStorage = global.window.localStorage;

const { state } = await import("../src/state.js");
const { createDefaultCurrentRun } = await import("../src/state/initial_state.js");
const {
  getCharAttackBreakdown,
  getCharTrapEaterBonus,
  calculatePhysicalAttackFormula
} = await import("../src/rules/character_stats.js");
const {
  getCharCoreParams,
  getTrapEaterBonusAfterDisarm
} = await import("../src/rules/affix_rules.js");
const { setupChestState, executeDisarm } = await import("../src/chest.js");
const { handleTrapAction } = await import("../src/systems/traps.js");
const { triggerRunResult } = await import("../src/result.js");

const failures = [];
const coreItem = {
  kind: "equipment",
  baseId: "AMULET_HP",
  identified: true,
  affixes: [{ id: "CORE_TRAP_EATER", type: "CORE_TRAP_EATER", kind: "core", value: 1 }]
};

function makeChar(className = "Thief") {
  return {
    name: "Trap Eater",
    class: className,
    level: 1,
    hp: 100,
    maxHp: 100,
    mp: 0,
    maxMp: 0,
    str: 15,
    int: 8,
    pie: 8,
    vit: 10,
    agi: 12,
    luk: 10,
    status: "ok",
    runTrapAttackBonus: 0,
    equipment: {
      weapon: "DAGGER",
      shield: null,
      armor: null,
      accessory: coreItem,
      accessory2: null
    }
  };
}

function prepareState(char) {
  state.floor = 1;
  state.x = 1;
  state.y = 1;
  state.party = [char];
  state.inventory = [];
  state.currentRun = createDefaultCurrentRun();
  state.chestState = null;
  state.activeTrapState = null;
  state.transitioning = false;
  state.gameState = "explore";
  state.maps = [null, null, null, null, null];
  state.metaMaterials = {};
  state.logs = [];
}

async function test(name, fn) {
  try {
    await fn();
    console.log("[PASS] " + name);
  } catch (error) {
    failures.push({ name, error });
    console.error("[FAIL] " + name + ": " + error.message);
  }
}

await test("CORE_TRAP_EATER is eligible only for Thief, Ranger, and Ninja", () => {
  for (const className of ["Thief", "Ranger", "Ninja"]) {
    const char = makeChar(className);
    assert.deepEqual(getCharCoreParams(char, "CORE_TRAP_EATER"), {
      attackPerDisarm: 2,
      maxAttack: 20
    });
  }
  for (const className of ["Fighter", "Priest", "Mage", "Samurai", "Bishop"]) {
    const char = makeChar(className);
    assert.equal(getCharCoreParams(char, "CORE_TRAP_EATER"), null);
    char.runTrapAttackBonus = 20;
    assert.equal(getCharTrapEaterBonus(char), 0);
  }
});

await test("bonus uses +2 per successful disarm and caps at +20", () => {
  const char = makeChar();
  let bonus = 0;
  for (let i = 0; i < 20; i++) bonus = getTrapEaterBonusAfterDisarm(char, bonus);
  assert.equal(bonus, 20);
  assert.equal(getTrapEaterBonusAfterDisarm(char, bonus), 20);
});

await test("successful chest disarm triggers the bonus for eligible class", async () => {
  prepareState(makeChar());
  setupChestState("poison needle", null, "HEAL_POTION");
  assert.equal(executeDisarm(state.party[0], () => 0), true);
  assert.equal(state.party[0].runTrapAttackBonus, 2);
  state.chestState = null;
  await new Promise(resolve => setTimeout(resolve, 1600));
});

await test("floor-trap disarm does not trigger CORE_TRAP_EATER", () => {
  const char = makeChar();
  prepareState(char);
  state.activeTrapState = {
    trap: { type: "damage", state: "discovered", intensity: 1 },
    pendingMove: null,
    successRate: 100
  };
  handleTrapAction("disarm");
  assert.equal(char.runTrapAttackBonus, 0);
  assert.equal(state.currentRun.trapsDisarmed, 1);
});

await test("fixed bonus matches displayed total and bypasses melee multiplier", () => {
  const char = makeChar();
  char.runTrapAttackBonus = 6;
  const breakdown = getCharAttackBreakdown(char);
  assert.equal(breakdown.trapEaterBonus, 6);
  assert.equal(
    calculatePhysicalAttackFormula({
      weaponAtk: breakdown.equipment,
      str: char.str,
      fixedDamageBonus: breakdown.trapEaterBonus
    }),
    breakdown.total
  );
  const without = calculatePhysicalAttackFormula({
    weaponAtk: breakdown.equipment,
    str: char.str,
    meleeMod: 0.5
  });
  const withBonus = calculatePhysicalAttackFormula({
    weaponAtk: breakdown.equipment,
    str: char.str,
    meleeMod: 0.5,
    fixedDamageBonus: breakdown.trapEaterBonus
  });
  assert.equal(withBonus - without, 6);
});

await test("return resets the transient run bonus", () => {
  const char = makeChar();
  char.runTrapAttackBonus = 20;
  prepareState(char);
  triggerRunResult("retreat");
  assert.equal(char.runTrapAttackBonus, 0);
});

if (failures.length > 0) {
  console.error("\n" + failures.length + " Issue #718 focused test(s) failed.");
  process.exit(1);
}

console.log("[PASS] Issue #718 CORE_TRAP_EATER focused coverage");
