import {
  calculatePhysicalAttackFormula,
  calculatePhysicalDefenseFormula,
  calculatePhysicalAttackRawFormula,
  getPhysicalDefenseResistance,
  PHYSICAL_DEF_RESISTANCE_SCALE_INCOMING,
  getCharAgi,
  getCharDerivedStats,
  getCharTrapBonus
} from "../src/rules/character_stats.js";
import { getCharAffixSum } from "../src/rules/item_rules.js";
import { getSpellStatBonus } from "../src/rules/spell_rules.js";
import { calculateDisarmRate } from "../src/rules/trap_rules.js";
import { runCombatRoundCalculation } from "../src/combat_logic.js";

const failures = [];

function check(label, actual, expected) {
  const passed = Object.is(actual, expected) || (
    typeof actual === "number" &&
    typeof expected === "number" &&
    Math.abs(actual - expected) < 1e-9
  );
  if (!passed) {
    failures.push(`${label}: expected ${expected}, got ${actual}`);
  }
}

function makeItem(baseId, affixes = []) {
  return {
    kind: "equipment",
    instanceId: `${baseId}-${affixes.map(affix => affix.type).join("-") || "base"}`,
    baseId,
    rarity: "magic",
    level: 1,
    identified: true,
    affixes
  };
}

function makeChar(overrides = {}) {
  const defaultEquipment = {
    weapon: "LONG_SWORD",
    shield: "SMALL_SHIELD",
    armor: null,
    accessory: null,
    accessory2: null
  };
  const { equipment = {}, ...rest } = overrides;
  return {
    name: "検証キャラクター",
    class: "Fighter",
    level: 1,
    str: 14,
    int: 14,
    pie: 14,
    vit: 12,
    agi: 10,
    luk: 99,
    runTrapAttackBonus: 0,
    ...rest,
    equipment: { ...defaultEquipment, ...equipment }
  };
}

function runFixedRound(state, actions) {
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    return runCombatRoundCalculation(state, { actions });
  } finally {
    Math.random = originalRandom;
  }
}

function makeCombatState(char, monster) {
  return {
    party: [char],
    combatState: {
      monsters: [monster],
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
    floor: 1
  };
}

const base = makeChar();
const baseStats = getCharDerivedStats(base, { floor: 5 });

const integerFormulaCases = [
  {
    label: "odd weapon atk with even buff atk",
    input: { weaponAtk: 3, buffAtk: 2, str: 14, randRoll: 3, def: 6 },
    expected: 12 * (1 - getPhysicalDefenseResistance(6))
  },
  {
    label: "even weapon atk with odd buff atk",
    input: { weaponAtk: 2, buffAtk: 3, str: 14, randRoll: 3, def: 6 },
    expected: 12 * (1 - getPhysicalDefenseResistance(6))
  },
  {
    label: "odd weapon atk with odd buff atk",
    input: { weaponAtk: 3, buffAtk: 1, str: 14, randRoll: 3, def: 6 },
    expected: 11 * (1 - getPhysicalDefenseResistance(6))
  }
];
integerFormulaCases.forEach(({ label, input, expected }) => {
  const actual = calculatePhysicalAttackFormula(input);
  check(`${label} returns a finite number`, Number.isFinite(actual), true);
  check(`${label} applies bounded DEF mitigation`, actual, expected);
});

const oddWeapon = makeChar({
  class: "Thief",
  equipment: { weapon: makeItem("NINJA_DAGGER") }
});
check("odd weapon attack display is an integer", Number.isInteger(getCharDerivedStats(oddWeapon).attack), true);

const atkPlusOne = makeChar({
  equipment: { weapon: makeItem("DAGGER", [{ type: "atk", value: 1.5 }]) }
});
const evenAtkWeapon = makeChar({
  equipment: { weapon: "DAGGER" }
});
check(
  "weapon atk +1.5 keeps the integer display delta",
  getCharDerivedStats(atkPlusOne).attack - getCharDerivedStats(evenAtkWeapon).attack,
  1
);

const followUpInput = { weaponAtk: 1, str: 11, randRoll: 2, def: 0, meleeMod: 0.7 };
const followUpBeforeRaw = calculatePhysicalAttackRawFormula(followUpInput);
const followUpAfterRaw = calculatePhysicalAttackFormula(followUpInput);
check("follow-up raw value keeps the shared physical coefficients", followUpBeforeRaw, 2.8);
check("follow-up formula applies the bounded resistance", followUpAfterRaw, 2.8);
check("follow-up damage keeps its fractional melee modifier before floor", Math.floor(followUpAfterRaw), 2);

check(
  "normal attack formula keeps the combat coefficients",
  calculatePhysicalAttackFormula({
    weaponAtk: 12,
    buffAtk: 2,
    str: 14,
    randRoll: 3,
    def: 6,
    meleeMod: 0.9
  }),
  18.9 * (1 - getPhysicalDefenseResistance(6))
);
check("display attack uses effective weapon input and STR above neutral point", baseStats.attack, 22);
check("display defense uses VIT/4", baseStats.defense, 5);
check(
  "defense formula includes combat-only modifiers without changing the base",
  calculatePhysicalDefenseFormula({ baseDef: 6, vit: 12, bonusDef: 5, tempDefDown: 2 }),
  12
);
check(
  "defense formula preserves the combat clamp",
  calculatePhysicalDefenseFormula({ baseDef: 6, vit: 12, tempDefDown: 30 }),
  0
);

const weaponUpgrade = makeChar({
  equipment: {
    weapon: makeItem("LONG_SWORD", [{ type: "atk", value: 3 }])
  }
});
const strengthUpgrade = makeChar({
  equipment: {
    accessory: makeItem("RING_STR")
  }
});
check(
  "weapon atk +3 produces the combat-equivalent attack delta",
  getCharDerivedStats(weaponUpgrade).attack - getCharDerivedStats(base).attack,
  3
);
check(
  "STR +2 produces its own attack delta",
  getCharDerivedStats(strengthUpgrade).attack - getCharDerivedStats(base).attack,
  2
);

const normalAttackState = makeCombatState(
  {
    name: "通常攻撃検証",
    class: "Fighter",
    level: 1,
    hp: 100,
    maxHp: 100,
    mp: 0,
    maxMp: 0,
    str: 14,
    int: 10,
    pie: 10,
    vit: 10,
    agi: 100,
    luk: 10,
    status: "ok",
    buffs: [],
    equipment: {
      weapon: makeItem("DAGGER", [{ type: "atk", value: 1.5 }]),
      shield: null,
      armor: null,
      accessory: null,
      accessory2: null
    }
  },
  {
    name: "麻痺した対象",
    hp: 100,
    maxHp: 100,
    atk: 1,
    def: 6,
    row: "front",
    status: "paralyzed",
    paralyzeTurns: 2,
    buffs: [],
    color: "#fff"
  }
);
const normalAttackResult = runFixedRound(normalAttackState, [
  { type: "fight", actorIdx: 0, targetIdx: 0 }
]);
const normalAttackInput = { weaponAtk: 4.5, buffAtk: 0, str: 14, randRoll: 0, def: 6 };
check(
  "normal attack damage applies the bounded physical resistance",
  100 - normalAttackResult.state.combatState.monsters[0].hp,
  Math.max(1, Math.floor(calculatePhysicalAttackFormula(normalAttackInput)))
);

const incomingDamageState = makeCombatState(
  {
    name: "被弾経路検証",
    class: "Fighter",
    level: 1,
    hp: 100,
    maxHp: 100,
    mp: 0,
    maxMp: 0,
    str: 10,
    int: 10,
    pie: 10,
    vit: 10,
    agi: 1,
    luk: 10,
    status: "ok",
    buffs: [],
    equipment: {
      weapon: "DAGGER",
      shield: null,
      armor: null,
      accessory: null,
      accessory2: null
    }
  },
  {
    name: "攻撃する対象",
    hp: 100,
    maxHp: 100,
    atk: 12,
    def: 0,
    row: "front",
    status: "ok",
    buffs: [],
    color: "#fff"
  }
);
const incomingDamageResult = runFixedRound(incomingDamageState, [
  { type: "defend", actorIdx: 0 }
]);
const incomingResistance = getPhysicalDefenseResistance(2, PHYSICAL_DEF_RESISTANCE_SCALE_INCOMING);
const incomingExpectedDamage = Math.max(
  1,
  Math.round(Math.max(1, Math.floor(12 * (1 - incomingResistance))) * 0.5)
);
check(
  "incoming physical damage uses the recalibrated bounded resistance",
  100 - incomingDamageResult.state.party[0].hp,
  incomingExpectedDamage
);

const spellPowerEquipment = makeItem("RING_STR", [
  { type: "spellPower", value: 20 },
  { type: "arcane", value: 10 },
  { type: "devotion", value: 10 }
]);
const spellPowerChar = makeChar({
  int: 14,
  pie: 14,
  equipment: { accessory: spellPowerEquipment }
});
const spellPowerStats = getCharDerivedStats(spellPowerChar);
const statBonus = getSpellStatBonus(14);
const expectedSpellBonus = Math.round((statBonus * 1.2 * 1.1 - 1) * 100);
check("magic displays the effective multiplier bonus", spellPowerStats.magic, expectedSpellBonus);
check("healing displays the effective multiplier bonus", spellPowerStats.healing, expectedSpellBonus);

const cappedSpellChar = makeChar({
  int: 30,
  equipment: { accessory: makeItem("RING_STR", [{ type: "arcane", value: 10 }]) }
});
const overCapSpellChar = makeChar({
  int: 40,
  equipment: { accessory: makeItem("RING_STR", [{ type: "arcane", value: 10 }]) }
});
check("INT 30 reaches the +40% cap before affixes", getCharDerivedStats(cappedSpellChar).magic, 54);
check("INT above 30 does not increase the capped display", getCharDerivedStats(overCapSpellChar).magic, 54);

const trapChar = makeChar({
  level: 4,
  equipment: { accessory: makeItem("RING_STR", [{ type: "trapBonus", value: 10 }]) }
});
const trapAffixBonus = Math.round(getCharTrapBonus(trapChar) * 100);
check(
  "trap display calls the real floor disarm formula",
  getCharDerivedStats(trapChar, { floor: 5 }).trap,
  calculateDisarmRate({
    className: trapChar.class,
    level: trapChar.level,
    floor: 5,
    affixBonus: trapAffixBonus
  })
);
check(
  "trap display does not add unrelated LUK",
  getCharDerivedStats(trapChar, { floor: 5 }).trap,
  44
);

const speedTreasureChar = makeChar({
  equipment: {
    accessory: makeItem("RING_STR", [
      { type: "agi", value: 2 },
      { type: "treasureSense", value: 8 }
    ])
  }
});
const speedTreasureStats = getCharDerivedStats(speedTreasureChar);
check("speed is the same AGI base used by turn order", speedTreasureStats.speed, getCharAgi(speedTreasureChar));
check(
  "treasure is the same treasureSense sum used by chest rewards",
  speedTreasureStats.treasure,
  getCharAffixSum(speedTreasureChar, "treasureSense")
);

if (failures.length > 0) {
  console.error(failures.map(failure => `FAIL: ${failure}`).join("\n"));
  process.exit(1);
}

console.log("PASS: equipment display formulas match their shared combat/exploration rules");
