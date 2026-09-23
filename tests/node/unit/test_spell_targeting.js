import assert from "node:assert/strict";
import { SPELLS } from "../../../src/data/spells.js";
import {
  COMBAT_SPELL_TARGETS,
  CURE_SPELL_KEYS,
  EXPLORATION_SPELL_TARGETS,
  HEAL_SPELL_KEYS,
  getItemAllyTargetIndices,
  getLivingAllyTargetIndices,
  getSpellAllyTargetIndices,
  getSpellAllyTargetStatus,
  isSpellAvailableInContext
} from "../../../src/rules/spell_targeting.js";
import * as facade from "../../../src/rules/spell_targeting.js";
import * as owner from "../../../src/rules/spell_targeting.ts";

const failures = [];

function check(name, callback) {
  try {
    callback();
  } catch (error) {
    failures.push({ name, error });
  }
}

const recoveryParty = [
  { hp: 5, maxHp: 10, status: "ok" },
  { hp: 10, maxHp: 10, status: "ok" },
  { hp: 0, maxHp: 10, status: "dead" }
];

check("recovery spells only target damaged living allies", () => {
  assert.deepEqual(getSpellAllyTargetIndices("DIOS", recoveryParty), [0]);
  assert.deepEqual(getSpellAllyTargetIndices("MADI", recoveryParty), [0]);
  assert.deepEqual(getSpellAllyTargetStatus("DIOS", recoveryParty[1]), {
    isDisabled: true,
    reason: "HP満タン"
  });
});

check("status cure spells only target their matching status", () => {
  const statusParty = [
    { hp: 10, maxHp: 10, status: "blind" },
    { hp: 10, maxHp: 10, status: "paralyzed" },
    { hp: 10, maxHp: 10, status: "poisoned" },
    { hp: 10, maxHp: 10, status: "ok" }
  ];
  assert.deepEqual(getSpellAllyTargetIndices("DIURCO", statusParty), [0]);
  assert.deepEqual(getSpellAllyTargetIndices("DIALKO", statusParty), [1]);
  assert.deepEqual(getSpellAllyTargetIndices("LATUMOFIS", statusParty), [2]);
});

check("item and all-allies candidates preserve their existing definitions", () => {
  const party = [
    { status: "ok" },
    { status: "sleep" },
    { status: "dead" },
    { status: "blind" }
  ];
  assert.deepEqual(getItemAllyTargetIndices(party), [0, 1, 3]);
  assert.deepEqual(getLivingAllyTargetIndices(party), [0, 3]);
});

check("category lists are derived from the shared spell key registry", () => {
  assert.deepEqual(HEAL_SPELL_KEYS, ["DIOS", "MADIOS", "DIALMA", "MADI", "DIURCO", "DIALKO", "LATUMOFIS"]);
  assert.deepEqual(CURE_SPELL_KEYS, ["DIURCO", "DIALKO", "LATUMOFIS"]);
});

check("spell target availability is shared between combat and exploration", () => {
  assert.deepEqual(EXPLORATION_SPELL_TARGETS, ["utility", "single_ally", "all_allies"]);
  assert.deepEqual(COMBAT_SPELL_TARGETS, ["single_enemy", "all_enemies", "single_ally", "all_allies"]);
  assert.equal(isSpellAvailableInContext(SPELLS.DUMAPIC, "exploration"), true);
  assert.equal(isSpellAvailableInContext(SPELLS.DUMAPIC, "combat"), false);
  assert.equal(isSpellAvailableInContext(SPELLS.MABARRIER, "exploration"), false);
  assert.equal(isSpellAvailableInContext(SPELLS.MABARRIER, "combat"), true);
  assert.equal(isSpellAvailableInContext(SPELLS.DIOS, "exploration"), true);
  assert.equal(isSpellAvailableInContext(SPELLS.HALITO, "exploration"), false);
});

check("JS facade re-exports the exact frozen owner surface", () => {
  assert.deepEqual(Object.keys(facade).sort(), Object.keys(owner).sort());
  for (const key of Object.keys(owner)) assert.equal(facade[key], owner[key]);
  assert.deepEqual(HEAL_SPELL_KEYS, ["DIOS", "MADIOS", "DIALMA", "MADI", "DIURCO", "DIALKO", "LATUMOFIS"]);
  assert.deepEqual(CURE_SPELL_KEYS, ["DIURCO", "DIALKO", "LATUMOFIS"]);
  assert.deepEqual(COMBAT_SPELL_TARGETS, ["single_enemy", "all_enemies", "single_ally", "all_allies"]);
  assert.deepEqual(EXPLORATION_SPELL_TARGETS, ["utility", "single_ally", "all_allies"]);
  for (const value of [HEAL_SPELL_KEYS, CURE_SPELL_KEYS, COMBAT_SPELL_TARGETS, EXPLORATION_SPELL_TARGETS]) {
    assert.equal(Object.isFrozen(value), true);
  }
});

check("availability preserves context, primitive, and short-circuit semantics", () => {
  assert.equal(isSpellAvailableInContext(null, "combat"), false);
  assert.equal(isSpellAvailableInContext(false, "combat"), false);
  assert.equal(isSpellAvailableInContext(1, "combat"), false);
  assert.equal(isSpellAvailableInContext({ target: "single_enemy" }, "unknown"), false);
  assert.equal(isSpellAvailableInContext({ target: "single_enemy" }, "combat"), true);
  assert.equal(isSpellAvailableInContext({ target: "utility", combatOnly: "yes" }, "exploration"), false);
  assert.equal(isSpellAvailableInContext({ target: "utility", combatOnly: 0 }, "exploration"), true);
  assert.equal(isSpellAvailableInContext({ target: "utility", combatOnly: {} }, "exploration"), false);
  assert.equal(isSpellAvailableInContext({ target: new String("utility") }, "exploration"), false);
  let combatOnlyRead = false;
  assert.equal(isSpellAvailableInContext({
    target: "single_enemy",
    get combatOnly() { combatOnlyRead = true; throw new Error("unexpected read"); }
  }, "combat"), true);
  assert.equal(combatOnlyRead, false);
  const targetError = new Error("target getter");
  assert.throws(() => isSpellAvailableInContext({ get target() { throw targetError; } }, "combat"), error => error === targetError);
});

check("ally status preserves priority, coercion, lookup, and property semantics", () => {
  assert.deepEqual(getSpellAllyTargetStatus("DIOS", null), { isDisabled: true, reason: "対象外" });
  assert.deepEqual(getSpellAllyTargetStatus("DIOS", { status: "dead", hp: 0, maxHp: 1 }), { isDisabled: true, reason: "対象外" });
  assert.deepEqual(getSpellAllyTargetStatus("DIOS", { hp: "9", maxHp: "10" }), { isDisabled: true, reason: "HP満タン" });
  assert.deepEqual(getSpellAllyTargetStatus("DIOS", { hp: "10", maxHp: "10" }), { isDisabled: true, reason: "HP満タン" });
  assert.deepEqual(getSpellAllyTargetStatus("DIOS", { hp: 1, maxHp: "not-a-number" }), { isDisabled: false, reason: "回復可" });
  for (const [key, status] of [["DIURCO", "blind"], ["DIALKO", "sleep"], ["DIALKO", "paralyze"], ["DIALKO", "paralyzed"], ["LATUMOFIS", "poisoned"]]) {
    assert.deepEqual(getSpellAllyTargetStatus(key, { status }), { isDisabled: false, reason: "治療可" });
  }
  assert.deepEqual(getSpellAllyTargetStatus("DIALKO", { status: "Paralyzed" }), { isDisabled: true, reason: "健康" });
  assert.deepEqual(getSpellAllyTargetStatus("unknown", { status: "ok" }), { isDisabled: false, reason: "選択可能" });
  assert.deepEqual(getSpellAllyTargetStatus("toString", { status: "ok" }), { isDisabled: false, reason: "治療可" });
  assert.deepEqual(Object.keys(getSpellAllyTargetStatus("DIOS", null)), ["isDisabled", "reason"]);
  const statusError = new Error("status getter");
  assert.throws(() => getSpellAllyTargetStatus("DIOS", { get status() { throw statusError; } }), error => error === statusError);
  const hpError = new Error("hp getter");
  assert.throws(() => getSpellAllyTargetStatus("DIOS", { status: "ok", get hp() { throw hpError; } }), error => error === hpError);
});

check("party helpers preserve sparse indices and distinct nullish behavior", () => {
  const sparse = [];
  sparse[1] = { status: "blind", hp: 1, maxHp: 2 };
  sparse[3] = null;
  sparse[4] = undefined;
  sparse[5] = { status: "dead", hp: 1, maxHp: 2 };
  assert.deepEqual(getSpellAllyTargetIndices("DIOS", sparse), [1]);
  assert.deepEqual(getLivingAllyTargetIndices(sparse), [1]);
  assert.deepEqual(getItemAllyTargetIndices(sparse), [1, 3, 4]);
  assert.deepEqual(getSpellAllyTargetIndices("DIOS", {}), []);
  assert.deepEqual(getLivingAllyTargetIndices(null), []);
  assert.deepEqual(getItemAllyTargetIndices("party"), []);
  assert.deepEqual(getLivingAllyTargetIndices([{ status: "ok" }, { status: "poisoned" }, { status: "blind" }, { status: "sleep" }]), [0, 1, 2]);
  assert.deepEqual(getSpellAllyTargetIndices("DIOS", sparse.slice(0, 0)), []);
  assert.equal(0 in sparse, false);
  assert.equal(sparse[1].hp, 1);
  const getterError = new Error("party status getter");
  assert.throws(() => getItemAllyTargetIndices([{ get status() { throw getterError; } }]), error => error === getterError);
});

if (failures.length > 0) {
  for (const { name, error } of failures) {
    console.error(`FAIL ${name}: ${error.stack || error.message}`);
  }
  process.exitCode = 1;
} else {
  console.log("PASS spell target rules");
}
