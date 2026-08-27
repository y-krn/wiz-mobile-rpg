import assert from "node:assert/strict";
import fs from "node:fs";
import { runCombatRoundCalculation } from "../../../src/combat_logic.js";
import {
  calculatePhysicalAttackFormula,
} from "../../../src/rules/character_stats.js";
import { getCharStr, getCharWeaponAtk, rollCharWeaponPhysicalRandom } from "../../../src/data.js";

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
    floor: 1,
    combatFormulaTelemetry: {
      physicalPlayerHits: [],
      physicalPlayerMisses: [],
      physicalMonsterHits: [],
      targetedBonuses: [],
      mitigations: [],
      mitigationCalls: []
    }
  };
}

function attack(className, options, randomValue) {
  const state = createState(className, options);
  const originalRandom = Math.random;
  Math.random = () => randomValue;
  try {
    return runCombatRoundCalculation(state, {
      actions: [{ type: "fight", actorIdx: 0, targetIdx: 0 }]
    });
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
    randRoll: rollCharWeaponPhysicalRandom(char, () => randomValue),
    def: options.def,
    physResist: options.physResist,
    meleeMod: 1
  })));
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

test("Mage and Bishop attacks use only the shared physical formula", () => {
  for (const className of ["Mage", "Bishop"]) {
    const options = { int: 18, str: 7, def: 8, physResist: 0 };
    const result = attack(className, options, 0.999);
    const hit = result.state.combatFormulaTelemetry.physicalPlayerHits.at(-1);
    assert.equal(
      1000 - result.state.combatState.monsters[0].hp,
      expectedPhysicalDamage(className, options, 0.999),
      `${className}: resolved damage must be the physical formula`
    );
    assert.equal(hit.formulaDmg, expectedPhysicalDamage(className, options, 0.999));
    assert.equal("magicBoltUsed" in hit, false, `${className}: retired telemetry field is absent`);
  }
});

test("Bishop keeps stronger physical weapon and attack-affix damage", () => {
  const weapon = {
    baseId: "RAPIER",
    identified: true,
    affixes: [{ type: "atk", value: 30 }]
  };
  const options = { int: 15, str: 12, weapon, def: 4, physResist: 0 };
  assert.equal(1000 - attack("Bishop", options, 0).state.combatState.monsters[0].hp, expectedPhysicalDamage("Bishop", options, 0));
});

test("spell-learning non-casters keep the same physical formula", () => {
  // Commit 2 intentionally changes the low-STR term: the old (7 - 10) = -3
  // penalty is now max(0, 7 - 10) = 0. With this fixed physical path, the
  // expected damage is therefore 6 instead of the old 1.
  for (const className of ["Samurai", "Ranger"]) {
    const options = { int: 18, str: 7, weapon: "DAGGER", def: 8, physResist: 0, spells: ["HALITO"] };
    assert.equal(
      1000 - attack(className, options, 0.999).state.combatState.monsters[0].hp,
      expectedPhysicalDamage(className, options, 0.999),
      `${className} must keep physical damage`
    );
  }
});

test("Mage and Bishop physical hits remain at least one against high DEF", () => {
  const options = { int: 1, str: 1, def: 100, physResist: 0 };
  for (const className of ["Mage", "Bishop"]) {
    const result = attack(className, options, 0);
    assert.equal(result.state.combatState.monsters[0].hp, 999, `${className}: hit minimum is one`);
  }
});

test("Mage and Bishop share the physical resistance pool", () => {
  const options = { int: 16, str: 7, def: 0, physResist: 0.5 };
  for (const className of ["Mage", "Bishop"]) {
    assert.equal(
      1000 - attack(className, options, 0.999).state.combatState.monsters[0].hp,
      expectedPhysicalDamage(className, options, 0.999),
      `${className}: physResist must use the shared physical pool`
    );
  }
});

test("round resolution has no magic-bolt definition or call site", () => {
  const roundSource = fs.readFileSync(new URL("../../../src/combat_logic/round.js", import.meta.url), "utf8");
  assert.equal(roundSource.includes("magicBolt"), false);
});

if (failures > 0) {
  console.error(`${failures} magic-bolt test(s) failed.`);
  process.exit(1);
}

console.log("[PASS] Magic-bolt combat rules");
