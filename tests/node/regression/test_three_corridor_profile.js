import assert from "node:assert/strict";
import { getFloorTheme } from "../../../src/data/floor_themes.js";
import {
  createChamferedPrismGeometry,
  createWallGeometry,
  getThreeCorridorProfile,
  getThreeCorridorReadabilityMetrics
} from "../../../src/three_renderer.js";

const b1Geometry = getFloorTheme(1).visualSignature.geometry;
const b2Geometry = getFloorTheme(6).visualSignature.geometry;
const b1 = getThreeCorridorProfile(b1Geometry);
const b2 = getThreeCorridorProfile(b2Geometry);
const b1Metrics = getThreeCorridorReadabilityMetrics(b1Geometry);

assert.equal(b1.cellWidth, 1.2);
assert.equal(b1.cellDepth, 3.2);
assert.equal(b1.wallHeight, 2.4);
assert.equal(b1.wallThickness, 0.18);
assert.equal(b1.cornerChamfer, 0.1);
assert.equal(b1.archSpringLine, 2.4);
assert.equal(b1.archRise, 0);
assert.equal(b1.startZ, 1.6);
assert.equal(b1.eyeHeight, 1.8);
assert.equal(b1.eyeZ, 3.0);
assert.equal(b1.lookAtHeight, 0.3);
assert.equal(b1.lookAtZ, -2.4);
assert.equal(b1.fov, 90);
assert.equal(b1.fogNear, 4.8);
assert.equal(b1.ceilingStyle, "flat");
assert.equal(b2.ceilingStyle, "arch");
assert.equal(b2.cornerChamfer, 0.1);
assert.equal(b2.archSpringLine, 1.7);
assert.equal(b2.archRise, 0.7);
for (const key of [
  "cellWidth",
  "cellDepth",
  "wallHeight",
  "wallThickness",
  "startZ",
  "eyeHeight",
  "eyeZ",
  "lookAtHeight",
  "lookAtZ",
  "fov",
  "fogNear",
  "fogFar",
  "frontWallZ",
  "wallLean"
]) {
  assert.equal(b2[key], b1[key], `biome geometry must not move frozen profile field ${key}`);
}
assert.ok(b1Metrics.forwardOpeningWidth[0] > 20);
assert.ok(b1Metrics.forwardOpeningWidth[0] > b1Metrics.forwardOpeningWidth[1]);
assert.ok(b1Metrics.forwardOpeningWidth[1] > b1Metrics.forwardOpeningWidth[2]);
assert.ok(b1Metrics.currentCellSideWallOccupancy > 0.8);
assert.ok(b1Metrics.fogNear < b1Metrics.cellFrontDistances[0]);
assert.ok(b1Metrics.fogFar > b1Metrics.cellFrontDistances[2]);

const chamferedWall = createChamferedPrismGeometry(b1.cellWidth, b1.wallHeight, b1.wallThickness);
const chamferedPositions = chamferedWall.attributes.position;
assert.equal(chamferedPositions.count, 16, "global wall footprint chamfer must use an octagonal prism");
const bottomPlan = [];
const topPlan = [];
for (let index = 0; index < chamferedPositions.count; index += 1) {
  const target = chamferedPositions.getY(index) === 0 ? bottomPlan : topPlan;
  target.push([chamferedPositions.getX(index), chamferedPositions.getZ(index)]);
}
assert.equal(bottomPlan.length, 8);
assert.equal(topPlan.length, 8);
assert.ok(Math.abs(Math.min(...bottomPlan.map(([x]) => Math.abs(x))) - 0.54) < 1e-6);
assert.ok(Math.abs(Math.min(...bottomPlan.map(([, z]) => Math.abs(z))) - 0.081) < 1e-6);
assert.ok(Math.abs(Math.min(...topPlan.map(([x]) => Math.abs(x))) - 0.54) < 1e-6);
assert.ok(Math.abs(Math.min(...topPlan.map(([, z]) => Math.abs(z))) - 0.081) < 1e-6);

const spanByEdge = (geometry, edge) => {
  const positions = geometry.attributes.position;
  const values = [];
  for (let index = 0; index < positions.count; index++) {
    if ((positions.getY(index) > 0) === (edge === "top")) values.push(positions.getX(index));
  }
  return Math.max(...values) - Math.min(...values);
};
const b1Wall = createWallGeometry(b1.cellWidth, b1.wallHeight, 0.1);
const neutralWall = createWallGeometry(b1.cellWidth, b1.wallHeight, 0);
const b1SideWall = createWallGeometry(b1.cellDepth, b1.wallHeight, 0.1, true, b1.cellWidth);
const b1RightSideWall = createWallGeometry(b1.cellDepth, b1.wallHeight, 0.1, true, b1.cellWidth);
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
