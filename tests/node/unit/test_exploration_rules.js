import assert from "node:assert/strict";
import * as facade from "../../../src/rules/exploration_rules.js";
import * as owner from "../../../src/rules/exploration_rules.ts";

const {
  calculateSecretDoorSearchChance,
  SECRET_DOOR_SEARCH_CALIBRATION
} = facade;

assert.deepEqual(Object.keys(facade).sort(), Object.keys(owner).sort());
for (const name of Object.keys(owner)) {
  assert.strictEqual(facade[name], owner[name], `${name} facade identity`);
}

assert.deepEqual(Object.keys(SECRET_DOOR_SEARCH_CALIBRATION), [
  "universalBaseChance",
  "depthPenaltyPerFloor",
  "minChance",
  "maxChance"
]);
assert.deepEqual(SECRET_DOOR_SEARCH_CALIBRATION, {
  universalBaseChance: 0.35,
  depthPenaltyPerFloor: 0.05,
  minChance: 0.10,
  maxChance: 0.95
});
assert.equal(Object.isFrozen(SECRET_DOOR_SEARCH_CALIBRATION), true);

function assertChance(input, expected, message = String(input)) {
  assert.ok(
    Math.abs(calculateSecretDoorSearchChance(input) - expected) < 1e-12,
    `${message}: expected ${expected}`
  );
}

assertChance(undefined, 0.35, "undefined argument defaults");
assertChance({}, 0.35, "empty container defaults");
assertChance({ floor: undefined, arcaneSense: undefined }, 0.35, "undefined fields default");
assertChance({ arcaneSense: 0 }, 0.35, "missing floor defaults");
assertChance({ floor: 1 }, 0.35, "missing sense defaults");
assert.throws(() => calculateSecretDoorSearchChance(null), TypeError);
for (const input of [0, 42, "primitive", true, false]) assertChance(input, 0.35, "primitive container defaults");

assertChance({ floor: 1, arcaneSense: 0 }, 0.35, "B1 base");
assertChance({ floor: 5, arcaneSense: 0 }, 0.15, "B5 depth penalty");
assertChance({ floor: 10, arcaneSense: 0 }, 0.10, "deep floor min");
assertChance({ floor: 50, arcaneSense: 0 }, 0.10, "deep floor remains min");
assertChance({ floor: 1, arcaneSense: 3 }, 0.38, "sense +3");
assertChance({ floor: 1, arcaneSense: 500 }, 0.95, "high sense max");

for (const floor of [0, -4, null, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
  assertChance({ floor }, 0.35, `floor ${String(floor)} normalizes to one`);
}
assertChance({ floor: 5.9 }, 0.15, "fractional floor uses floor");
assertChance({ floor: "5" }, 0.15, "numeric string floor coercion");
assertChance({ floor: true }, 0.35, "true floor coercion");
assertChance({ floor: false }, 0.35, "false floor coercion");

assertChance({ arcaneSense: 0.5 }, 0.355, "fractional sense is retained");
assertChance({ arcaneSense: -10 }, 0.35, "negative sense normalizes to zero");
assertChance({ arcaneSense: "3.5" }, 0.385, "numeric string sense coercion");
assertChance({ arcaneSense: true }, 0.36, "true sense coercion");
assertChance({ arcaneSense: false }, 0.35, "false sense coercion");
assertChance({ arcaneSense: null }, 0.35, "null sense coercion");
for (const arcaneSense of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
  assertChance({ arcaneSense }, 0.35, `sense ${String(arcaneSense)} normalizes to zero`);
}

assert.throws(() => calculateSecretDoorSearchChance({ floor: Symbol("floor") }), TypeError);
assert.throws(() => calculateSecretDoorSearchChance({ arcaneSense: Symbol("sense") }), TypeError);
assert.throws(() => calculateSecretDoorSearchChance({
  floor: { [Symbol.toPrimitive]() { throw new Error("floor coercion"); } }
}), /floor coercion/);
assert.throws(() => calculateSecretDoorSearchChance({
  arcaneSense: { [Symbol.toPrimitive]() { throw new Error("sense coercion"); } }
}), /sense coercion/);

const coercionOrder = [];
calculateSecretDoorSearchChance({
  floor: { [Symbol.toPrimitive]() { coercionOrder.push("floor"); return 1; } },
  arcaneSense: { [Symbol.toPrimitive]() { coercionOrder.push("arcaneSense"); return 0; } }
});
assert.deepEqual(coercionOrder, ["floor", "arcaneSense"]);

const input = { floor: "5.9", arcaneSense: "0.5" };
const before = { ...input };
assertChance(input, 0.155, "fractional floor and sense formula");
assert.deepEqual(input, before, "input remains unchanged");

console.log("[PASS] exploration rules preserve secret-door search behavior and JS compatibility");
