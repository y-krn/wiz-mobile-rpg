import assert from "node:assert/strict";
import { DIR_NAMES } from "../../../src/constants/directions.js";
import {
  normalizeCombatIndex,
  normalizeDecisionAction,
  normalizeDirection,
  normalizeTargetIndex
} from "../../../src/telemetry_decision_normalization.ts";

const actionAliases = [
  ["fight", "attack"],
  ["attack", "attack"],
  ["spell", "spell"],
  ["item", "item"],
  ["defend", "defend"],
  ["run", "flee"],
  ["flee", "flee"],
  ["heal", "heal"],
  ["cure", "cure"],
  ["rest", "heal"],
  ["drink", "heal"],
  ["return", "return"],
  ["continue", "continue"],
  ["descend", "descend"],
  ["compare", "compare"],
  ["commit", "commit"],
  ["cancel", "cancel"],
  ["equip", "equip"],
  ["trial", "trial"],
  ["unequip", "unequip"],
  ["discard", "discard"],
  ["identify", "identify"],
  ["investigate", "investigate"]
];

assert.deepEqual(
  actionAliases.map(([input]) => normalizeDecisionAction(input)),
  actionAliases.map(([, expected]) => expected)
);
for (const action of ["unknown", "Fight", " fight", "fighting", "toString", null, 1, {}]) {
  assert.equal(normalizeDecisionAction(action), "other");
}

assert.equal(normalizeTargetIndex(0, 3), 0);
assert.equal(normalizeTargetIndex(2, 3), 2);
for (const [value, partySize] of [
  [-1, 3],
  [3, 3],
  [4, 3],
  [1.5, 3],
  [0, "invalid"],
  [0, -2],
  [8, 9]
]) {
  assert.equal(normalizeTargetIndex(value, partySize), null);
}
assert.equal(normalizeTargetIndex(1, "2"), 1);
assert.equal(normalizeTargetIndex(2, 2.5), 2);
assert.equal(normalizeTargetIndex(7, 9), 7);
assert.equal(normalizeTargetIndex(0, Number.NaN), null);

assert.equal(normalizeCombatIndex(-1, 3, true), -1);
assert.equal(normalizeCombatIndex(-1, 3, false), null);
assert.equal(normalizeCombatIndex(-1, 3, "true"), null);
assert.equal(normalizeCombatIndex(-2, 3, true), null);
assert.equal(normalizeCombatIndex(2, 3, true), 2);

const safeDirections = new Set(DIR_NAMES.map((_, index) => index));
for (const direction of safeDirections) {
  assert.equal(normalizeDirection(direction, safeDirections), direction);
}
for (const direction of [-1, DIR_NAMES.length, 0.5, "0", null]) {
  assert.equal(normalizeDirection(direction, safeDirections), null);
}
