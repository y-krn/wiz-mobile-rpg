import assert from "node:assert/strict";
import { MONSTERS } from "../../../src/data/monsters.js";
import { scaleEnemyForDepth } from "../../../src/rules/depth_scaling.js";
import {
  createCombatMonsterInstance,
  isCombatMonster,
  isMonsterTemplate
} from "../../../src/state/monster.js";

assert.ok(MONSTERS.length > 0);
assert.equal(MONSTERS.every(isMonsterTemplate), true, "all static monsters satisfy MonsterTemplate");

for (const monster of MONSTERS) {
  assert.ok(Number.isFinite(monster.exp) && monster.exp >= 0,
    `${monster.name} must have finite, non-negative production EXP`);
  const scaled = scaleEnemyForDepth(monster, 10);
  assert.ok(Number.isFinite(scaled.exp), `${monster.name} must have finite scaled EXP at B10`);
}

for (const [name, expectedExp] of [
  ["煙幕盗賊", 150],
  ["催眠コウモリ", 150],
  ["霧の亡霊", 350]
]) {
  const monster = MONSTERS.find(entry => entry.name === name);
  assert.ok(monster, `${name} must exist in production MONSTERS`);
  assert.equal(monster.exp, expectedExp, `${name} must use same-Level production median EXP`);
  assert.ok(Number.isFinite(scaleEnemyForDepth(monster, 10).exp), `${name} must scale to finite EXP at B10`);
}

const template = MONSTERS.find(monster => monster.name === "ストーンガード");
assert.ok(template);
assert.equal(isMonsterTemplate(template), true);
assert.equal(isCombatMonster(template), false, "template does not satisfy mutable instance core");

const instance = scaleEnemyForDepth(template, 3);
assert.equal(isCombatMonster(instance), true, "scaled template produces CombatMonster");
assert.notEqual(instance, template, "combat instance has separate identity");
assert.equal(instance.maxHp, instance.hp);

for (const field of ["name", "level", "hp", "atk", "def"]) {
  const malformed = { ...template };
  delete malformed[field];
  assert.equal(isMonsterTemplate(malformed), false, `${field} is required on MonsterTemplate`);
}

for (const [field, value] of [
  ["level", Number.NaN],
  ["hp", Infinity],
  ["atk", -1],
  ["def", -1]
]) {
  assert.equal(isMonsterTemplate({ ...template, [field]: value }), false, `${field} rejects malformed numeric values`);
}

for (const field of ["name", "hp", "maxHp", "atk", "def"]) {
  const malformed = { ...instance };
  delete malformed[field];
  assert.equal(isCombatMonster(malformed), false, `${field} is required on CombatMonster`);
}

for (const [field, value] of [
  ["hp", Number.NaN],
  ["maxHp", Infinity],
  ["atk", -1],
  ["def", -1]
]) {
  assert.equal(isCombatMonster({ ...instance, [field]: value }), false, `${field} rejects malformed numeric values`);
}
assert.equal(isCombatMonster({ ...instance, hp: -1 }), false, "combat hp rejects negative values");
assert.equal(isCombatMonster({ ...instance, maxHp: 0 }), false, "combat maxHp rejects zero");

const templateSnapshot = structuredClone(template);
assert.notEqual(instance.traits, template.traits, "nested arrays are not shared");
assert.notEqual(instance.guard, template.guard, "nested objects are not shared");
instance.traits.push("test-only-mutation");
instance.guard.chance = 0;
instance.hp = 0;
assert.deepEqual(template, templateSnapshot, "combat mutations do not contaminate template");

const directInstance = createCombatMonsterInstance(template, {
  hp: template.hp,
  maxHp: template.hp,
  atk: template.atk,
  def: template.def
});
assert.equal(isCombatMonster(directInstance), true);

console.log("[PASS] canonical MonsterTemplate/CombatMonster guards, ownership, identity, and cloning");
