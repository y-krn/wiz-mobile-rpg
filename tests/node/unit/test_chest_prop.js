import assert from "node:assert/strict";
import * as facade from "../../../src/chest_prop.js";
import * as owner from "../../../src/chest_prop.ts";
import { BASE_GEOMETRY, getProjectionColumn, getProjectionPlanes, getWorldObjectProjection } from "../../../src/rules/renderer_projection.js";
import { exerciseChestPropProjectionTypes } from "../fixtures/typescript/chest_prop_inputs.ts";

const styleKeys = [
  "wood_crate", "stone_ossuary", "bone_cache", "sealed_book_coffer", "iron_strongbox", "abyss_reliquary"
];
const palettes = [
  { body: "#6b3a00", lid: "#9a5d16", metal: "#f1c45b", outline: "#ffe29a", glow: "#ffd166", mark: "bands" },
  { body: "#5f5a58", lid: "#8c8580", metal: "#d8c9a5", outline: "#eee3c5", glow: "#d5c7a0", mark: "cross" },
  { body: "#4d3e55", lid: "#725b78", metal: "#e7c4a1", outline: "#f4d7ba", glow: "#dca8c0", mark: "cross" },
  { body: "#174c56", lid: "#27727a", metal: "#f0c96a", outline: "#b9f0df", glow: "#54d6c5", mark: "runes" },
  { body: "#514747", lid: "#71605b", metal: "#e4b75f", outline: "#f4d79b", glow: "#d8aa5d", mark: "rivets" },
  { body: "#30233e", lid: "#583d69", metal: "#d7a8ff", outline: "#e6c8ff", glow: "#b979ff", mark: "runes" }
];

assert.deepEqual(Object.keys(facade).sort(), [
  "CHEST_PROP_STYLES", "getChestPropGeometry", "getChestPropPalette", "getChestPropStyle"
].sort(), "JS facade keeps exactly the four runtime exports");
for (const name of Object.keys(facade)) assert.strictEqual(facade[name], owner[name], `${name} owner identity`);
assert.deepEqual(Object.keys(owner).sort(), Object.keys(facade).sort(), "type-only declarations stay out of runtime exports");
assert.deepEqual(Object.keys(facade.CHEST_PROP_STYLES), styleKeys);
assert.ok(Object.isFrozen(facade.CHEST_PROP_STYLES));
styleKeys.forEach((style, index) => {
  assert.deepEqual(facade.CHEST_PROP_STYLES[style], palettes[index]);
  assert.ok(Object.isFrozen(facade.CHEST_PROP_STYLES[style]));
  assert.strictEqual(facade.getChestPropPalette(style), facade.CHEST_PROP_STYLES[style]);
  assert.equal(facade.getChestPropStyle(style), style);
});
for (const style of ["unknown", null, undefined, Symbol("unknown")]) {
  assert.equal(facade.getChestPropStyle(style), "wood_crate");
  assert.strictEqual(facade.getChestPropPalette(style), facade.CHEST_PROP_STYLES.wood_crate);
}
assert.throws(() => facade.getChestPropStyle(Object.create(null)), TypeError, "native property-key conversion errors propagate");

const coercions = [];
const coercibleStyle = { [Symbol.toPrimitive](hint) { coercions.push(hint); return "wood_crate"; } };
assert.strictEqual(facade.getChestPropStyle(coercibleStyle), coercibleStyle, "own-key coercion returns original input");
assert.deepEqual(coercions, ["string"]);
assert.strictEqual(facade.getChestPropPalette(coercibleStyle), facade.CHEST_PROP_STYLES.wood_crate);
const throwingStyle = new Proxy({}, { get(_target, key) { if (key === Symbol.toPrimitive) throw new Error("style coercion failure"); } });
assert.throws(() => facade.getChestPropStyle(throwingStyle), /style coercion failure/);

const plane = { leftBottom: 0, rightBottom: 100, bottom: 200 };
const inputSnapshot = structuredClone(plane);
const geometry = facade.getChestPropGeometry(plane, "wood_crate");
assert.deepEqual(plane, inputSnapshot, "geometry does not mutate projection input");
assert.deepEqual(Object.keys(geometry), [
  "style", "centerX", "baseY", "bodyY", "width", "bodyHeight", "lidHeight", "body", "side", "lid",
  "band", "lock", "keyhole", "shadow", "feet", "marks"
]);
assert.deepEqual(geometry.body, [
  { x: 36.2, y: 186.1 }, { x: 62, y: 186.1 }, { x: 64.1, y: 199 }, { x: 36.2, y: 199 }
]);
assert.deepEqual(geometry.side, [
  { x: 62, y: 186.1 }, { x: 65, y: 187.6 }, { x: 65, y: 197.8 }, { x: 64.1, y: 199 }
]);
assert.equal(geometry.width, 30);
assert.equal(geometry.bodyHeight, 12.9);
assert.equal(geometry.lidHeight, 7.5);
const lidRatiosByStyle = [
  [[0, 0.08], [0.12, 0.74], [0.22, 1], [0.78, 1], [0.88, 0.74], [1, 0.08]],
  [[0, 0.04], [0.08, 0.80], [0.18, 1], [0.82, 1], [0.92, 0.80], [1, 0.04]],
  [[0, 0.10], [0.18, 0.58], [0.50, 1], [0.82, 0.58], [1, 0.10]],
  [[0, 0.06], [0.18, 0.74], [0.84, 0.92], [1, 0.06]],
  [[0, 0.04], [0.08, 0.76], [0.16, 1], [0.84, 1], [0.92, 0.76], [1, 0.04]],
  [[0, 0.08], [0.24, 0.68], [0.42, 1], [0.72, 0.82], [1, 0.10]]
];
styleKeys.forEach((style, index) => {
  const styled = facade.getChestPropGeometry(plane, style);
  assert.equal(styled.style, style);
  assert.deepEqual(styled.lid.map(({ x, y }) => [Number(((x - 35) / 30).toFixed(8)), Number(((186.1 - y) / 7.5).toFixed(8))]), lidRatiosByStyle[index]);
  assert.deepEqual(styled.body, geometry.body);
  assert.deepEqual(styled.side, geometry.side);
  assert.deepEqual(Object.keys(styled), Object.keys(geometry));
});

const minimumWidth = facade.getChestPropGeometry({ leftBottom: 0, rightBottom: 10, bottom: 100 });
assert.equal(minimumWidth.width, 8);
assert.equal(minimumWidth.bodyHeight, 4);
assert.equal(minimumWidth.lidHeight, 3);
const numericStringPlane = facade.getChestPropGeometry({ leftBottom: "10", rightBottom: "30", bottom: "40", worldObject: { objectWidth: "24", floorContactY: "35" } });
assert.equal(numericStringPlane.centerX, 20);
assert.equal(numericStringPlane.baseY, 35);
const partialPlane = facade.getChestPropGeometry({ leftBottom: 10, rightBottom: 30, bottom: 40 });
assert.equal(partialPlane.baseY, 39);

const propertyReads = [];
const orderedPlane = new Proxy({ leftBottom: 1, rightBottom: 9, bottom: 10, worldObject: { objectWidth: 8, floorContactY: 9 } }, {
  get(target, key, receiver) { propertyReads.push(String(key)); return Reflect.get(target, key, receiver); }
});
facade.getChestPropGeometry(orderedPlane);
assert.deepEqual(propertyReads, ["leftBottom", "rightBottom", "bottom", "worldObject", "worldObject"]);
const throwingPlane = new Proxy({}, { get() { throw new Error("native getter failure"); } });
assert.throws(() => facade.getChestPropGeometry(throwingPlane), /native getter failure/);
const coercibleGeometry = facade.getChestPropGeometry(plane, coercibleStyle);
assert.strictEqual(coercibleGeometry.style, coercibleStyle);

const frozenValues = [geometry, geometry.body, geometry.side, geometry.lid, geometry.body[0], geometry.band,
  geometry.lock, geometry.keyhole, geometry.shadow, geometry.feet, geometry.feet[0], geometry.marks];
for (const value of frozenValues) assert.ok(Object.isFrozen(value), "geometry freeze contract");
assert.notStrictEqual(facade.getChestPropGeometry(plane), geometry, "each geometry result is fresh");
assert.notStrictEqual(facade.getChestPropGeometry(plane).body, geometry.body, "each point array is fresh");

const projection = getProjectionPlanes(BASE_GEOMETRY);
for (const projected of [getProjectionColumn(projection, 1), getWorldObjectProjection(projection, 1)]) {
  for (const style of styleKeys) assert.equal(facade.getChestPropGeometry(projected, style).style, style);
}
assert.equal(exerciseChestPropProjectionTypes(390, 844, 1).length, 8, "typed projection, owner and facade paths execute");

console.log("[PASS] chest prop owner, facade, style, geometry and projection contracts");
