import assert from "node:assert/strict";
import { getFloorTheme } from "../../../src/data/floor_themes.js";
import {
  getThreeCorridorProfile,
  getThreeCorridorReadabilityMetrics
} from "../../../src/three_renderer.js";

const b1Geometry = getFloorTheme(1).visualSignature.geometry;
const b2Geometry = getFloorTheme(6).visualSignature.geometry;
const b1 = getThreeCorridorProfile(b1Geometry);
const b2 = getThreeCorridorProfile(b2Geometry);
const b1Metrics = getThreeCorridorReadabilityMetrics(b1Geometry);

assert.ok(b1.fov >= 60 && b1.fov <= 70);
assert.equal(b1.fogNear, 4.8);
assert.equal(b1.ceilingStyle, "flat");
assert.equal(b2.ceilingStyle, "arch");
assert.ok(b1.cellWidth < b2.cellWidth, "biome corridor width should reach Three.js");
assert.ok(b1.wallHeight < b2.wallHeight, "biome ceiling height should reach Three.js");
assert.ok(b1Metrics.forwardOpeningWidth[0] > 100);
assert.ok(b1Metrics.forwardOpeningWidth[0] > b1Metrics.forwardOpeningWidth[1]);
assert.ok(b1Metrics.forwardOpeningWidth[1] > b1Metrics.forwardOpeningWidth[2]);
assert.ok(b1Metrics.currentCellSideWallOccupancy < 0.35);
assert.ok(b1Metrics.fogNear > b1Metrics.cellFrontDistances[0]);
assert.ok(b1Metrics.fogNear < b1Metrics.cellFrontDistances[2]);

console.log("THREE CORRIDOR PROFILE REGRESSION PASSED");
