import assert from "node:assert/strict";
import { getFloorTheme } from "../../../src/data/floor_themes.js";
import {
  createWallGeometry,
  getThreeCorridorProfile,
  getThreeCorridorReadabilityMetrics
} from "../../../src/three_renderer.js";

const b1Geometry = getFloorTheme(1).visualSignature.geometry;
const b2Geometry = getFloorTheme(6).visualSignature.geometry;
const b1 = getThreeCorridorProfile(b1Geometry);
const b2 = getThreeCorridorProfile(b2Geometry);
const b1Metrics = getThreeCorridorReadabilityMetrics(b1Geometry);

assert.ok(b1.fov >= 80 && b1.fov <= 90);
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

const spanByEdge = (geometry, edge) => {
  const positions = geometry.attributes.position;
  const values = [];
  for (let index = 0; index < positions.count; index++) {
    if ((positions.getY(index) > 0) === (edge === "top")) values.push(positions.getX(index));
  }
  return Math.max(...values) - Math.min(...values);
};
const b1Wall = createWallGeometry(b1.cellWidth, b1.wallHeight, b1.wallLean);
const neutralWall = createWallGeometry(b1.cellWidth, b1.wallHeight, 0);
const b1SideWall = createWallGeometry(b1.cellDepth, b1.wallHeight, b1.wallLean, true, b1.cellWidth);
const b1RightSideWall = createWallGeometry(b1.cellDepth, b1.wallHeight, b1.wallLean, true, b1.cellWidth);
const sidePositions = b1SideWall.attributes.position;
const rightSidePositions = b1RightSideWall.attributes.position;
const topNormalOffsets = [];
const bottomNormalOffsets = [];
const rightTopNormalOffsets = [];
const rightBottomNormalOffsets = [];
for (let index = 0; index < sidePositions.count; index++) {
  (sidePositions.getY(index) > 0 ? topNormalOffsets : bottomNormalOffsets).push(sidePositions.getZ(index));
  (rightSidePositions.getY(index) > 0 ? rightTopNormalOffsets : rightBottomNormalOffsets).push(rightSidePositions.getZ(index));
}

assert.equal(spanByEdge(neutralWall, "top"), spanByEdge(neutralWall, "bottom"));
assert.ok(spanByEdge(b1Wall, "top") < spanByEdge(b1Wall, "bottom"), "positive wallLean narrows the front-wall top symmetrically");
assert.ok(Math.abs(topNormalOffsets[0] - topNormalOffsets[1]) < 1e-9, "side-wall top lean is uniform");
assert.ok(Math.abs(bottomNormalOffsets[0] - bottomNormalOffsets[1]) < 1e-9, "side-wall bottom lean is uniform");
assert.ok(topNormalOffsets[0] > bottomNormalOffsets[0], "positive wallLean brings the side-wall top inward");
assert.ok(rightTopNormalOffsets[0] > rightBottomNormalOffsets[0], "right side-wall local normal matches the left wall");
assert.ok(
  Math.sin(-Math.PI / 2) * rightTopNormalOffsets[0] < Math.sin(-Math.PI / 2) * rightBottomNormalOffsets[0],
  "right side-wall top leans inward in world space"
);

console.log("THREE CORRIDOR PROFILE REGRESSION PASSED");
