import assert from "node:assert/strict";
import { getCharAffixSum } from "../src/data.js";
import { applyKillAffixEffects } from "../src/combat_logic/damage.js";
import { createSoloCharacter } from "../src/state.js";

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

test("僧侶はメイスとソロ用耐久・MPを持つ", () => {
  const priest = createSoloCharacter("Priest");
  assert.equal(priest.equipment.weapon, "MACE");
  assert.equal(priest.maxHp, 14);
  assert.equal(priest.maxMp, 5);
});

test("魔術師はソロ用耐久・MPを持つ", () => {
  const mage = createSoloCharacter("Mage");
  assert.equal(mage.maxHp, 19);
  assert.equal(mage.maxMp, 6);
});

test("僧侶と魔術師は敵撃破時にMPを1回復する", () => {
  for (const className of ["Priest", "Mage"]) {
    const character = createSoloCharacter(className);
    character.mp = 0;
    const target = { name: "かみつき蟲", tags: [] };
    const logs = [];

    applyKillAffixEffects(character, target, {}, logs);

    assert.equal(character.mp, 1, className);
    assert.match(logs[0].msg, /MPが1回復/);
  }
});

test("盗賊は技巧を35%回避へ転用する", () => {
  const thief = createSoloCharacter("Thief");
  assert.equal(getCharAffixSum(thief, "evasion"), 35);
});

if (failures > 0) {
  console.error(`${failures}件のテスト失敗`);
  process.exit(1);
}

console.log("[PASS] 基本4職ソロエンジン");
