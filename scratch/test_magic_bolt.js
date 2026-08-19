import assert from "node:assert/strict";
import { runCombatRoundCalculation } from "../src/combat_logic.js";
import {
  applyPhysicalResistance,
  calculatePhysicalAttackFormula,
  combinePhysicalResistances,
  getPhysicalDefenseResistance
} from "../src/rules/character_stats.js";
import { getCharInt, getCharStr, getCharWeaponAtk } from "../src/data.js";

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

function expectedPhysicalDamage(className, options, randomValue) {
  const state = createState(className, options);
  const char = state.party[0];
  return Math.max(1, Math.floor(calculatePhysicalAttackFormula({
    weaponAtk: getCharWeaponAtk(char),
    str: getCharStr(char),
    randRoll: Math.floor(randomValue * 5),
    def: options.def,
    physResist: options.physResist,
    meleeMod: 1
  })));
}

function expectedMagicBoltDamage(className, options, randomValue) {
  const state = createState(className, options);
  const raw = Math.floor(getCharInt(state.party[0]) / 3) + Math.floor(randomValue * 3);
  const resistance = combinePhysicalResistances(
    getPhysicalDefenseResistance(options.def),
    options.physResist
  );
  return Math.max(1, Math.floor(applyPhysicalResistance(raw, resistance)));
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
  const mageOptions = { int: 16, str: 7, def: 8, physResist: 0 };
  assert.equal(
    attackDamage("Mage", mageOptions, 0.999),
    Math.max(
      expectedPhysicalDamage("Mage", mageOptions, 0.999),
      expectedMagicBoltDamage("Mage", mageOptions, 0.999)
    ),
    "Mage: magic-bolt and physical damage use the same bounded pool"
  );
  const bishopOptions = { int: 15, str: 9, def: 4, physResist: 0 };
  assert.equal(
    attackDamage("Bishop", bishopOptions, 0),
    Math.max(
      expectedPhysicalDamage("Bishop", bishopOptions, 0),
      expectedMagicBoltDamage("Bishop", bishopOptions, 0)
    ),
    "Bishop: magic-bolt and physical damage use the same bounded pool"
  );
});

test("Bishop keeps stronger physical weapon and attack-affix damage", () => {
  const weapon = {
    baseId: "RAPIER",
    identified: true,
    affixes: [{ type: "atk", value: 30 }]
  };
  const options = { int: 15, str: 12, weapon, def: 4, physResist: 0 };
  assert.equal(attackDamage("Bishop", options, 0), expectedPhysicalDamage("Bishop", options, 0));
});

test("spell-learning non-casters do not receive magic-bolt damage", () => {
  // Commit 2 intentionally changes the low-STR term: the old (7 - 10) = -3
  // penalty is now max(0, 7 - 10) = 0. With this fixed physical path, the
  // expected damage is therefore 6 instead of the old 1; magic-bolt fallback
  // remains disabled for these classes.
  for (const className of ["Samurai", "Ranger"]) {
    const options = { int: 18, str: 7, weapon: "DAGGER", def: 8, physResist: 0, spells: ["HALITO"] };
    assert.equal(
      attackDamage(className, options, 0.999),
      expectedPhysicalDamage(className, options, 0.999),
      `${className} must keep physical damage instead of a caster-only magic bolt`
    );
  }
});

test("magic-bolt attack damage remains at least one against high DEF", () => {
  const options = { int: 1, str: 1, def: 100, physResist: 0 };
  assert.equal(
    attackDamage("Mage", options, 0),
    Math.max(expectedPhysicalDamage("Mage", options, 0), expectedMagicBoltDamage("Mage", options, 0))
  );
});

test("magic-bolt shares the physical resistance pool when physResist is nonzero", () => {
  const options = { int: 16, str: 7, def: 0, physResist: 0.5 };
  assert.equal(
    attackDamage("Mage", options, 0.999),
    Math.max(expectedPhysicalDamage("Mage", options, 0.999), expectedMagicBoltDamage("Mage", options, 0.999)),
    "magic-bolt must apply target physResist through the shared physical pool"
  );
});

if (failures > 0) {
  console.error(`${failures} magic-bolt test(s) failed.`);
  process.exit(1);
}

console.log("[PASS] Magic-bolt combat rules");
