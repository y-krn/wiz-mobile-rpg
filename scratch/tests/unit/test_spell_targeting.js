import assert from "node:assert/strict";
import {
  CURE_SPELL_KEYS,
  HEAL_SPELL_KEYS,
  getItemAllyTargetIndices,
  getLivingAllyTargetIndices,
  getSpellAllyTargetIndices,
  getSpellAllyTargetStatus
} from "../../../src/rules/spell_targeting.js";

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
    reason: "HP満タン",
    isRecommended: false
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

if (failures.length > 0) {
  for (const { name, error } of failures) {
    console.error(`FAIL ${name}: ${error.stack || error.message}`);
  }
  process.exitCode = 1;
} else {
  console.log("PASS spell target rules");
}
