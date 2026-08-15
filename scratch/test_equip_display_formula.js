import {
  calculatePhysicalAttackFormula,
  calculatePhysicalDefenseFormula,
  getCharAgi,
  getCharDerivedStats,
  getCharTrapBonus
} from "../src/rules/character_stats.js";
import { getCharAffixSum } from "../src/rules/item_rules.js";
import { getSpellStatBonus } from "../src/rules/spell_rules.js";
import { calculateDisarmRate } from "../src/rules/trap_rules.js";

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

const base = makeChar();
const baseStats = getCharDerivedStats(base, { floor: 5 });

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
  22.5
);
check("display attack uses weapon ×1.5 and STR−10", baseStats.attack, 22);
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
    weapon: makeItem("LONG_SWORD", [{ type: "atk", value: 2 }])
  }
});
const strengthUpgrade = makeChar({
  equipment: {
    accessory: makeItem("RING_STR")
  }
});
check(
  "weapon atk +2 produces the combat-equivalent attack delta",
  getCharDerivedStats(weaponUpgrade).attack - getCharDerivedStats(base).attack,
  3
);
check(
  "STR +2 produces its own attack delta",
  getCharDerivedStats(strengthUpgrade).attack - getCharDerivedStats(base).attack,
  2
);

const spellPowerEquipment = makeItem("RING_STR", [
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
const expectedSpellBonus = Math.round((statBonus * 1.1 - 1) * 100);
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

const trapSenseChar = makeChar({
  level: 4,
  equipment: { accessory: makeItem("RING_STR", [{ type: "trapSense", value: 10 }]) }
});
const trapAffixBonus = Math.round(getCharTrapBonus(trapSenseChar) * 100);
check(
  "trap display calls the real floor disarm formula",
  getCharDerivedStats(trapSenseChar, { floor: 5 }).trap,
  calculateDisarmRate({
    className: trapSenseChar.class,
    level: trapSenseChar.level,
    floor: 5,
    affixBonus: trapAffixBonus
  })
);
check(
  "trap display does not add unrelated LUK",
  getCharDerivedStats(trapSenseChar, { floor: 5 }).trap,
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
