import assert from "assert";
import {
  STAIR_PROP_STYLES as STAIR_STYLES_FROM_FACADE,
  getDungeonPropBase as getBaseFromFacade,
  getSpringPropGeometry,
  getStairsPropGeometry,
  getDungeonPropPalette as getPaletteFromFacade
} from "../../../src/dungeon_prop.js";
import * as facade from "../../../src/dungeon_prop.js";
import * as owner from "../../../src/dungeon_prop.ts";
import { exerciseDungeonPropProjectionTypes } from "../fixtures/typescript/dungeon_prop_inputs.ts";

const nearPlane = { leftBottom: 110, rightBottom: 290, bottom: 208 };
const farPlane = { leftBottom: 176, rightBottom: 224, bottom: 142 };

const spring = getSpringPropGeometry(nearPlane);
const stairs = getStairsPropGeometry(nearPlane, "down", "rough_stone");

assert.ok(spring.basin.radiusX > spring.water.radiusX, "spring has a basin around the water surface");
assert.equal(spring.fountain.length, 5, "spring has a raised fountain silhouette");
assert.equal(spring.pedestal.length, 4, "spring has a grounded pedestal");
assert.ok(stairs.steps.length >= 3, "stairs have multiple readable treads");
assert.equal(stairs.well.length, 4, "stairs have an integrated descending well");
assert.ok(spring.shadow.y > spring.baseY && stairs.shadow.y > stairs.baseY, "props have floor-contact shadows");

const farSpring = getSpringPropGeometry(farPlane);
const farStairs = getStairsPropGeometry(farPlane, "down", "rough_stone");
assert.ok(farSpring.width < spring.width, "spring follows projection depth");
assert.ok(farStairs.width < stairs.width, "stairs follow projection depth");

const shortPortraitPlane = {
  ...nearPlane,
  bottom: 520,
  viewport: { orientation: "portrait", height: 568 }
};
const shortPortraitSpring = getSpringPropGeometry(shortPortraitPlane);
const shortPortraitStairs = getStairsPropGeometry(shortPortraitPlane, "down", "rough_stone");
assert.ok(shortPortraitSpring.baseY < shortPortraitPlane.bottom, "short portrait spring follows the projected floor");
assert.ok(shortPortraitStairs.baseY < shortPortraitPlane.bottom, "short portrait stairs follow the projected floor");
assert.ok(shortPortraitSpring.shadow.y < shortPortraitPlane.viewport.height, "short portrait spring stays inside the viewport");

assert.deepEqual(Object.keys(facade).sort(), [
  "STAIR_PROP_STYLES", "getDungeonPropBase", "getDungeonPropPalette",
  "getLeverPropGeometry", "getRubblePropGeometry", "getSealPropGeometry",
  "getSpringPropGeometry", "getStairsPropGeometry"
].sort(), "facade exposes only the runtime prop exports");
for (const name of Object.keys(facade)) assert.strictEqual(facade[name], owner[name], `${name} keeps owner identity`);
assert.strictEqual(STAIR_STYLES_FROM_FACADE, owner.STAIR_PROP_STYLES);
assert.deepEqual(Object.keys(STAIR_STYLES_FROM_FACADE), [
  "rough_stone", "catacomb_arch", "broken_ledge", "flooded_steps", "forge_stair", "impossible_stair"
]);
assert.ok(Object.isFrozen(STAIR_STYLES_FROM_FACADE));
for (const style of Object.values(STAIR_STYLES_FROM_FACADE)) assert.ok(Object.isFrozen(style));

const projectedBase = getBaseFromFacade({ leftBottom: 10, rightBottom: 30, bottom: 40, worldObject: { objectWidth: 24, floorContactY: 35 } }, 0.5);
assert.deepEqual(projectedBase, { corridorWidth: 24, width: 12, centerX: 20, baseY: 35 });
assert.deepEqual(Object.keys(projectedBase), ["corridorWidth", "width", "centerX", "baseY"]);
assert.equal(getBaseFromFacade({ leftBottom: "10", rightBottom: "30", bottom: "40", worldObject: { objectWidth: "24", floorContactY: "35" } }, 0.5).baseY, 35);
assert.deepEqual(getBaseFromFacade({ leftBottom: 10, rightBottom: 30, bottom: 40 }, 0.5), {
  corridorWidth: 20, width: 10, centerX: 20, baseY: 39
});
const mutableBase = getBaseFromFacade(nearPlane, 0.42);
mutableBase.width = 123;
assert.equal(mutableBase.width, 123, "base remains a fresh mutable result");
assert.notStrictEqual(mutableBase, getBaseFromFacade(nearPlane, 0.42));

for (const [style, count] of Object.entries({
  rough_stone: 4, catacomb_arch: 5, broken_ledge: 3, flooded_steps: 5, forge_stair: 4, impossible_stair: 6
})) {
  const geometry = getStairsPropGeometry(nearPlane, "down", style);
  assert.equal(geometry.stepCount, count, `${style} step count`);
  assert.equal(geometry.steps.length, count);
  assert.equal(geometry.style, style);
}
assert.equal(getStairsPropGeometry(nearPlane, "down", "unknown").style, "rough_stone");
assert.equal(getStairsPropGeometry(nearPlane, "up").direction, "up");
assert.notDeepEqual(getStairsPropGeometry(nearPlane, "up").steps[0].points, stairs.steps[0].points);

assert.deepEqual(Object.keys(spring), ["centerX", "baseY", "width", "basin", "water", "fountain", "fountainDrop", "pedestal", "rim", "shadow"]);
assert.deepEqual(Object.keys(stairs), ["centerX", "baseY", "width", "stepCount", "direction", "style", "steps", "well", "shadow"]);
for (const value of [spring, spring.basin, spring.water, spring.fountain, spring.fountain[0], spring.pedestal, spring.pedestal[0], spring.rim, spring.shadow,
  stairs, stairs.steps, stairs.steps[0], stairs.steps[0].points, stairs.steps[0].points[0], stairs.well, stairs.well[0], stairs.shadow]) {
  assert.ok(Object.isFrozen(value), "geometry freeze contract");
}
assert.notStrictEqual(getSpringPropGeometry(nearPlane), spring, "geometry result remains fresh");
assert.deepEqual(getPaletteFromFacade("spring", "invalid"), {
  basin: 9871010, pedestal: 7567487, water: "#7cecff", highlight: "#d7ffff", shadow: "#000000"
});
const stairsPalette = getPaletteFromFacade("stairs", "#58d6e8", "up");
assert.deepEqual(Object.keys(stairsPalette), ["stone", "edge", "well", "shadow"]);
assert.equal(stairsPalette.edge, "#78dfff");
assert.ok(Object.isFrozen(stairsPalette));
assert.notStrictEqual(stairsPalette, getPaletteFromFacade("stairs", "#58d6e8", "up"));

const propertyReads = [];
const unmodifiedPlane = { leftBottom: 3, rightBottom: 27, bottom: 31, worldObject: { objectWidth: 24, floorContactY: 30 } };
const unmodifiedSnapshot = structuredClone(unmodifiedPlane);
getBaseFromFacade(unmodifiedPlane, 0.5);
assert.deepEqual(unmodifiedPlane, unmodifiedSnapshot, "projection input remains unmodified");
const orderedPlane = new Proxy({ leftBottom: 1, rightBottom: 9, bottom: 10, worldObject: { objectWidth: 8, floorContactY: 9 } }, {
  get(target, key, receiver) {
    propertyReads.push(String(key));
    return Reflect.get(target, key, receiver);
  }
});
getBaseFromFacade(orderedPlane, 0.5);
assert.deepEqual(propertyReads, ["leftBottom", "rightBottom", "bottom", "worldObject", "worldObject"], "legacy getter evaluation order");
const throwingPlane = new Proxy({}, { get() { throw new Error("native getter failure"); } });
assert.throws(() => getBaseFromFacade(throwingPlane, 0.5), /native getter failure/);

assert.equal(exerciseDungeonPropProjectionTypes(390, 844, 1).length, 8, "typed projection owner and JS facade paths execute");

// #1963 traversal props stay inside the corridor and read by silhouette.
{
  const plane = { leftBottom: 100, rightBottom: 300, bottom: 600, leftTop: 100, rightTop: 300, top: 200 };
  const rubble = facade.getRubblePropGeometry(plane);
  const seal = facade.getSealPropGeometry(plane);
  const lever = facade.getLeverPropGeometry(plane, false);
  const pulled = facade.getLeverPropGeometry(plane, true);
  const xs = points => points.map(point => point.x);
  assert.ok(Math.min(...xs(rubble.mound)) >= 100 && Math.max(...xs(rubble.mound)) <= 300, "rubble stays in the corridor");
  assert.ok(rubble.rocks.length >= 4, "rubble reads as a heap of rocks");
  assert.ok(Math.min(...seal.slab.map(point => point.y)) < 600 - seal.width * 0.9, "the seal stands as a tall slab");
  assert.notDeepEqual(lever.handle, pulled.handle, "a pulled lever changes its handle");
}

console.log("[PASS] dungeon spring, stairs, and traversal prop geometry contracts");
