import assert from "node:assert/strict";
import { runCombatRoundCalculation } from "../src/combat_logic.js";

global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};

function createState(className, { int = 16, str = 7, weapon = "WAND", def = 0, physResist = 0, spells = [] } = {}) {
  return {
    party: [{
      name: className,
      class: className,
      level: 3,
      hp: 100,
      maxHp: 100,
      mp: 10,
      maxMp: 10,
      str,
      int,
      pie: 10,
      vit: 10,
      agi: 100,
      luk: 10,
      status: "ok",
      spells,
      equipment: { weapon, shield: null, armor: null, accessory: null }
    }],
    combatState: {
      monsters: [{
        name: "Test Target",
        hp: 1000,
        maxHp: 1000,
        atk: 1,
        def,
        physResist,
        row: "front",
        status: "paralyzed",
        paralyzeTurns: 2
      }],
      isBoss: false,
      isMidboss: false,
      isRoamingFlack: false,
      allParalyzedTurns: 0,
      roundNumber: 1,
      phase: "choose_actions"
    },
    inventory: [],
    firstKills: [],
    codex: null,
    currentRun: { itemsFound: [], equipmentFound: [], deathLogs: [] },
    roamingMonsters: [],
    floorChestsTotal: [],
    gold: 0,
    floor: 1
  };
}

function attackDamage(className, options, randomValue) {
  const state = createState(className, options);
  const originalRandom = Math.random;
  Math.random = () => randomValue;
  try {
    const result = runCombatRoundCalculation(state, {
      actions: [{ type: "fight", actorIdx: 0, targetIdx: 0 }]
    });
    return 1000 - result.state.combatState.monsters[0].hp;
  } finally {
    Math.random = originalRandom;
  }
}

let failures = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
  } catch (error) {
    failures++;
    console.error(`[FAIL] ${name}: ${error.message}`);
  }
}

test("Mage and Bishop attacks use the deterministic INT magic-bolt formula", () => {
  assert.equal(
    attackDamage("Mage", { int: 16, str: 7, def: 8 }, 0.999),
    6,
    "Mage: floor((floor(16/3) + 2) * (1 - 8/108))"
  );
  assert.equal(
    attackDamage("Bishop", { int: 15, str: 9, def: 4 }, 0),
    4,
    "Bishop: floor((floor(15/3) + 0) * (1 - 4/104))"
  );
});

test("Bishop keeps stronger physical weapon and attack-affix damage", () => {
  const weapon = {
    baseId: "RAPIER",
    identified: true,
    affixes: [{ type: "atk", value: 30 }]
  };
  assert.equal(
    attackDamage("Bishop", { int: 15, str: 12, weapon, def: 4 }, 0),
    42,
    "physical 44 reduced by (1 - 4/104) must preserve physical damage"
  );
});

test("spell-learning non-casters do not receive magic-bolt damage", () => {
  // Commit 2 intentionally changes the low-STR term: the old (7 - 10) = -3
  // penalty is now max(0, 7 - 10) = 0. With this fixed physical path, the
  // expected damage is therefore 6 instead of the old 1; magic-bolt fallback
  // remains disabled for these classes.
  for (const className of ["Samurai", "Ranger"]) {
    assert.equal(
      attackDamage(className, { int: 18, str: 7, weapon: "DAGGER", def: 8, spells: ["HALITO"] }, 0.999),
      6,
      `${className} must keep physical damage instead of a caster-only magic bolt`
    );
  }
});

test("magic-bolt attack damage remains at least one against high DEF", () => {
  assert.equal(
    attackDamage("Mage", { int: 1, str: 1, def: 100 }, 0),
    1
  );
});

test("magic-bolt shares the physical resistance pool when physResist is nonzero", () => {
  assert.equal(
    attackDamage("Mage", { int: 16, str: 7, def: 0, physResist: 0.5 }, 0.999),
    3,
    "floor(7 * (1 - 0.5)) must apply the target physResist"
  );
});

if (failures > 0) {
  console.error(`${failures} magic-bolt test(s) failed.`);
  process.exit(1);
}

console.log("[PASS] Magic-bolt combat rules");
