import assert from "assert";
import { getActiveSynergyMod } from "../src/data/tags.js";
import { setItemRulesStateRef, getCharAffixSum, getEffectiveHealAmount } from "../src/rules/item_rules.js";
import {
  setCharacterStatsStateRef,
  getCharDef,
  getCharTrapBonus,
  getCharWeaponAtk
} from "../src/rules/character_stats.js";

console.log("=== TICKET-069 SYNERGY MOD TEST ===");

function makeChar(tags = [], extra = {}) {
  return {
    name: "Tester",
    class: "Test",
    level: 5,
    hp: 40,
    maxHp: 40,
    mp: 10,
    maxMp: 10,
    str: 10,
    int: 10,
    pie: 10,
    vit: 10,
    agi: 10,
    luk: 10,
    status: "ok",
    equipment: {
      weapon: null,
      shield: null,
      armor: null,
      accessory: {
        key: `test_${tags.join("_")}`,
        baseId: "RING_STR",
        identified: true,
        tags
      }
    },
    ...extra
  };
}

function setParty(party) {
  const state = { party };
  setItemRulesStateRef(state);
  setCharacterStatsStateRef(state);
  return state;
}

function assertSynergy(tags, expected) {
  const party = [makeChar(tags)];
  setParty(party);
  for (const [modType, value] of Object.entries(expected)) {
    assert.strictEqual(getActiveSynergyMod(party, modType), value, `${tags.join("+")} ${modType}`);
  }
  return party[0];
}

assertSynergy(["holy", "exorcism"], { antiUndead: 35, antiDemon: 15 });
const poisonThief = assertSynergy(["poison", "trap"], { trapBonus: 30, poisonWard: 20, firstStrike: -3 });
assert.strictEqual(getCharTrapBonus(poisonThief), 0.3, "poison_thief trapBonus applies to trap stats");
assert.strictEqual(getCharAffixSum(poisonThief, "poisonWard"), 20, "poison_thief poisonWard applies through affix path");
assert.strictEqual(getCharAffixSum(poisonThief, "firstStrike"), -3, "poison_thief firstStrike penalty applies");

const fireCurse = assertSynergy(["fire_rite", "curse"], { atk: 4, healMod: -30 });
assert.strictEqual(getCharWeaponAtk(fireCurse), 4, "fire_curse atk applies to weapon atk");
assert.strictEqual(getEffectiveHealAmount(fireCurse, 40), 28, "fire_curse healMod applies to healing");
assert.strictEqual(getEffectiveHealAmount({ ...fireCurse, antiHealTurns: 1 }, 40), 14, "fire_curse stacks with antiHealTurns");

const fireCurseWithAffix = makeChar(["fire_rite", "curse"]);
fireCurseWithAffix.equipment.accessory.affixes = [{ type: "atk", value: 6 }];
setParty([fireCurseWithAffix]);
assert.strictEqual(getCharWeaponAtk(fireCurseWithAffix), 10, "equipment atk affix and synergy atk are counted once each");

const ironWard = assertSynergy(["iron", "ward"], { def: 3, guardian: 12, firstStrike: -4 });
assert.strictEqual(getCharDef(ironWard), 3, "iron_ward def applies to defense");
assert.strictEqual(getCharAffixSum(ironWard, "guardian"), 12, "iron_ward guardian applies through affix path");
assert.strictEqual(getCharAffixSum(ironWard, "firstStrike"), -4, "iron_ward firstStrike penalty applies");

assertSynergy(["beast", "search"], { firstStrike: 8, treasureSense: 8 });
const spiritAnalysis = assertSynergy(["spirit", "analysis"], { treasureSense: 18, trapBonus: 10 });
assert.strictEqual(getCharTrapBonus(spiritAnalysis), 0.1, "spirit_analysis trapBonus applies to trap stats");

const ambushPoison = assertSynergy(["ambush", "poison"], { firstStrike: 10, followUp: 8, def: -3 });
assert.strictEqual(getCharDef(ambushPoison), -3, "ambush_poison def penalty is preserved");

const bloodBlade = assertSynergy(["blood", "blade"], { followUp: 14, def: -3 });
assert.strictEqual(getCharDef(bloodBlade), -3, "blood_blade def penalty is preserved");

setParty([]);
assert.strictEqual(getEffectiveHealAmount(null, 0), 0, "zero healing remains zero");
assert.strictEqual(getEffectiveHealAmount(null, -5), -5, "negative healing remains unchanged");

console.log("All synergy mod tests passed!");
