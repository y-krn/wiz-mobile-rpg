import assert from "assert";
import { getActiveSynergyMod, recordSynergyDiscovery } from "../src/data/tags.js";
import { getCharAffixSum, getEffectiveHealAmount } from "../src/rules/item_rules.js";
import {
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

function assertSynergy(tags, expected) {
  const party = [makeChar(tags)];
  for (const [modType, value] of Object.entries(expected)) {
    assert.strictEqual(getActiveSynergyMod(party, modType), value, `${tags.join("+")} ${modType}`);
  }
  return party;
}

assertSynergy(["holy", "exorcism"], { antiUndead: 35, antiDemon: 15 });
const poisonThiefParty = assertSynergy(["poison", "trap"], { trapBonus: 30, poisonWard: 20, firstStrike: -3 });
const poisonThief = poisonThiefParty[0];
assert.strictEqual(getCharTrapBonus(poisonThief, poisonThiefParty), 0.3, "poison_thief trapBonus applies to trap stats");
assert.strictEqual(getCharAffixSum(poisonThief, "poisonWard", poisonThiefParty), 20, "poison_thief poisonWard applies through affix path");
assert.strictEqual(getCharAffixSum(poisonThief, "firstStrike", poisonThiefParty), -3, "poison_thief firstStrike penalty applies");

const fireCurseParty = assertSynergy(["fire_rite", "curse"], { atk: 4, healMod: -30 });
const fireCurse = fireCurseParty[0];
assert.strictEqual(getCharWeaponAtk(fireCurse, fireCurseParty), 4, "fire_curse atk applies to weapon atk");
assert.strictEqual(getEffectiveHealAmount(fireCurse, 40, fireCurseParty), 28, "fire_curse healMod applies to healing");
assert.strictEqual(getEffectiveHealAmount({ ...fireCurse, antiHealTurns: 1 }, 40, fireCurseParty), 14, "fire_curse stacks with antiHealTurns");

const fireCurseWithAffix = makeChar(["fire_rite", "curse"]);
fireCurseWithAffix.equipment.accessory.affixes = [{ type: "atk", value: 6 }];
const fireCurseAffixParty = [fireCurseWithAffix];
assert.strictEqual(getCharWeaponAtk(fireCurseWithAffix, fireCurseAffixParty), 10, "equipment atk affix and synergy atk are counted once each");

const ironWardParty = assertSynergy(["iron", "ward"], { def: 3, guardian: 12, firstStrike: -4 });
const ironWard = ironWardParty[0];
assert.strictEqual(getCharDef(ironWard, ironWardParty), 3, "iron_ward def applies to defense");
assert.strictEqual(getCharAffixSum(ironWard, "guardian", ironWardParty), 12, "iron_ward guardian applies through affix path");
assert.strictEqual(getCharAffixSum(ironWard, "firstStrike", ironWardParty), -4, "iron_ward firstStrike penalty applies");

assertSynergy(["beast", "search"], { firstStrike: 8, treasureSense: 8 });
const spiritAnalysisParty = assertSynergy(["spirit", "analysis"], { treasureSense: 18, trapBonus: 10 });
assert.strictEqual(getCharTrapBonus(spiritAnalysisParty[0], spiritAnalysisParty), 0.1, "spirit_analysis trapBonus applies to trap stats");

const ambushPoisonParty = assertSynergy(["ambush", "poison"], { firstStrike: 10, followUp: 8, def: -3 });
assert.strictEqual(getCharDef(ambushPoisonParty[0], ambushPoisonParty), -3, "ambush_poison def penalty is preserved");

const bloodBladeParty = assertSynergy(["blood", "blade"], { followUp: 14, def: -3 });
assert.strictEqual(getCharDef(bloodBladeParty[0], bloodBladeParty), -3, "blood_blade def penalty is preserved");

assert.strictEqual(getEffectiveHealAmount(null, 0), 0, "zero healing remains zero");
assert.strictEqual(getEffectiveHealAmount(null, -5), -5, "negative healing remains unchanged");

const codex = {};
const logs = [];
recordSynergyDiscovery("iron_ward", { codex, addLog: msg => logs.push(msg) });
recordSynergyDiscovery("iron_ward", { codex, addLog: msg => logs.push(msg) });
assert.deepStrictEqual(codex.synergies, { iron_ward: true }, "discovery records in the provided codex");
assert.strictEqual(logs.length, 1, "discovery logs only once through the provided callback");

console.log("All synergy mod tests passed!");
