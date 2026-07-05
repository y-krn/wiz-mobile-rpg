import assert from "assert";
import { getItemData, getCharAffixSum } from "../src/rules/item_rules.js";
import { getCharMaxHp, getCharMaxMp, getCharStr, getCharAgi, getCharLuk, getCharTrapBonus } from "../src/rules/character_stats.js";

console.log("=== UNIDENTIFIED ACCESSORY BONUS LEAK TEST ===");

const char = {
  name: "TestHero",
  class: "Thief",
  level: 5,
  hp: 20,
  maxHp: 20,
  mp: 5,
  maxMp: 5,
  str: 12,
  int: 10,
  pie: 8,
  vit: 11,
  agi: 13,
  luk: 15,
  status: "ok",
  equipment: {
    weapon: null,
    shield: null,
    armor: null,
    accessory: null
  }
};

// 1. Unidentified Amulet HP
const unidentAmulet = {
  key: "AMULET_HP_1",
  baseId: "AMULET_HP",
  identified: false,
  halfIdentified: false
};

const data = getItemData(unidentAmulet);
console.log("Unidentified Amulet Item Data hpBonus:", data.hpBonus);
assert.strictEqual(data.hpBonus, 0, "Unidentified Amulet hpBonus must be 0");
assert.deepStrictEqual(data.statsBonus, {}, "Unidentified Amulet statsBonus must be empty");

char.equipment.accessory = unidentAmulet;
const maxHp = getCharMaxHp(char);
console.log("Character maxHp with Unidentified Amulet:", maxHp);
assert.strictEqual(maxHp, 20, "Character maxHp should stay 20");

// 2. Half-Identified Ring STR
const halfIdentRing = {
  key: "RING_STR_1",
  baseId: "RING_STR",
  identified: false,
  halfIdentified: true
};

const data2 = getItemData(halfIdentRing);
console.log("Half-Identified Ring Item Data statsBonus:", data2.statsBonus);
assert.deepStrictEqual(data2.statsBonus, {}, "Half-Identified Ring statsBonus must be empty");

char.equipment.accessory = halfIdentRing;
const str = getCharStr(char);
console.log("Character str with Half-Identified Ring:", str);
assert.strictEqual(str, 12, "Character str should stay 12");

// 3. Identified Ring STR (Control)
const identRing = {
  key: "RING_STR_2",
  baseId: "RING_STR",
  identified: true
};

const data3 = getItemData(identRing);
console.log("Identified Ring Item Data statsBonus:", data3.statsBonus);
assert.strictEqual(data3.statsBonus.str, 2, "Identified Ring statsBonus.str must be 2");

char.equipment.accessory = identRing;
const strIdent = getCharStr(char);
console.log("Character str with Identified Ring:", strIdent);
assert.strictEqual(strIdent, 14, "Character str should be 14");

// 4. Unidentified Ward Charm
const unidentCharm = {
  key: "WARD_CHARM_1",
  baseId: "WARD_CHARM",
  identified: false
};

char.equipment.accessory = unidentCharm;
const spellGuard = getCharAffixSum(char, "spellGuard");
console.log("Character spellGuard with Unidentified Charm:", spellGuard);
assert.strictEqual(spellGuard, 0, "spellGuard should stay 0");

// Identified Ward Charm
const identCharm = {
  key: "WARD_CHARM_2",
  baseId: "WARD_CHARM",
  identified: true
};
char.equipment.accessory = identCharm;
const spellGuardIdent = getCharAffixSum(char, "spellGuard");
console.log("Character spellGuard with Identified Charm:", spellGuardIdent);
assert.strictEqual(spellGuardIdent, 15, "spellGuard should be 15");

console.log("=== ALL ACCESSORY LEAK TESTS PASSED ===");
