import assert from "node:assert/strict";
import { BIOMES } from "../../../src/data/biomes.js";
import { getFloorTheme } from "../../../src/data/floor_themes.js";
import {
  BASE_GEOMETRY,
  getProjectionColumn,
  getProjectionPlanes
} from "../../../src/rules/renderer_projection.js";
import {
  CHEST_PROP_STYLES,
  getChestPropGeometry,
  getChestPropStyle
} from "../../../src/chest_prop.js";

const representativeFloors = [1, 6, 11, 16, 21, 26];
const chestStyles = Object.keys(CHEST_PROP_STYLES);

assert.equal(BIOMES.length, 6);
BIOMES.forEach(({ visualSignature }) => {
  assert.ok(chestStyles.includes(visualSignature.landmarks.chestStyle));
});

const styles = representativeFloors.map(floor => getFloorTheme(floor).visualSignature.landmarks.chestStyle);
assert.equal(new Set(styles).size, representativeFloors.length);
assert.equal(getChestPropStyle("unknown"), "wood_crate");

const projection = getProjectionPlanes(BASE_GEOMETRY);
const plane = getProjectionColumn(projection, 1);
const geometryByStyle = chestStyles.map(style => getChestPropGeometry(plane, style));
geometryByStyle.forEach((geometry, index) => {
  assert.equal(geometry.style, chestStyles[index]);
  assert.ok(geometry.body.length >= 4);
  assert.ok(geometry.lid.length >= 4);
  assert.ok(geometry.lock.width > 0);
});

console.log("[PASS] Pixi chest landmark data and shared projection geometry verified.");
